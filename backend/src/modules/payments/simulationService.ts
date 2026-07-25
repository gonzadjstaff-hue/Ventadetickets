import { Prisma, type OrderStatus, type PaymentStatus } from "@prisma/client";

import { env } from "../../config/env.js";
import { sendGeneralTicketEmail, type EmailDeliveryStatus } from "../../integrations/email/emailService.js";
import { prisma } from "../../shared/prisma.js";
// Reutilizado a propósito: la expiración perezosa es una única pieza de
// lógica (con su propio guard de concurrencia) que tiene que comportarse
// igual se consulte desde GET /orders/:orderPublicId o desde acá. Duplicarla
// arriesga que las dos copias diverjan.
import { expireIfNeeded } from "../orders/service.js";
import { OrderNotFoundError } from "./errors.js";
import type { SimulatedResult } from "./schemas.js";
import { emitTicketsForOrderItem } from "./ticketEmissionService.js";

const SIMULATOR_PROVIDER = "mock-simulator";

const RESULT_TO_PAYMENT_STATUS: Record<SimulatedResult, PaymentStatus> = {
  approved: "APPROVED",
  pending: "PENDING",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
};

export interface SimulatedTicket {
  ticketPublicId: string;
  holderName: string;
  ticketType: string;
  /** Token crudo. Solo viene en la respuesta inmediata de la primera aprobación — ver docs/DECISIONS.md. */
  token: string;
  emailStatus: EmailDeliveryStatus;
}

export interface SimulatePaymentOutcome {
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus | null;
  /** true si esta orden ya estaba resuelta (PAID/CANCELLED/EXPIRED) antes de esta llamada: no se tocó nada. */
  alreadyProcessed: boolean;
  /** Solo presente en la respuesta que efectivamente aprueba por primera vez. Nunca se reconstruye en llamadas posteriores. */
  tickets?: SimulatedTicket[];
}

function parseAttendeeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export async function processSimulatedPayment(
  orderPublicId: string,
  result: SimulatedResult,
): Promise<SimulatePaymentOutcome> {
  const order = await prisma.order.findUnique({
    where: { publicId: orderPublicId },
    include: {
      event: true,
      items: { include: { ticketType: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      user: true,
    },
  });
  if (!order) throw new OrderNotFoundError();

  const statusAfterExpiryCheck = await expireIfNeeded(order);

  if (statusAfterExpiryCheck !== "PENDING") {
    // Terminal (PAID / CANCELLED / EXPIRED): nada para hacer. En particular,
    // si ya estaba PAID, nunca se reconstruyen los tokens ya emitidos — no
    // hay forma de hacerlo, el token crudo no se persiste (docs/DECISIONS.md).
    return {
      orderStatus: statusAfterExpiryCheck,
      paymentStatus: order.payments[0]?.status ?? null,
      alreadyProcessed: true,
    };
  }

  const item = order.items[0];
  if (!item) throw new OrderNotFoundError();

  const paymentStatus = RESULT_TO_PAYMENT_STATUS[result];
  const providerPaymentId = `sim_${order.id}`;
  const now = new Date();

  const orderUpdateData: Prisma.OrderUpdateManyMutationInput = { paymentProvider: SIMULATOR_PROVIDER };
  if (result === "approved") {
    orderUpdateData.status = "PAID";
    orderUpdateData.paidAt = now;
  } else if (result === "cancelled") {
    orderUpdateData.status = "CANCELLED";
    orderUpdateData.cancelledAt = now;
    orderUpdateData.cancellationReason = "Simulado: pago cancelado.";
  }
  // pending/rejected: la Order se queda en PENDING para permitir reintento
  // mientras no venza — ver docs/DECISIONS.md.

  const transactionResult = await prisma.$transaction(async (tx) => {
    // Mismo patrón que check-in: solo gana quien encuentre la orden todavía
    // PENDING en este instante. Si count es 0, otra request ya la resolvió
    // (ej. dos aprobaciones simultáneas) — no se toca nada más.
    const guard = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: orderUpdateData,
    });

    if (guard.count === 0) {
      const fresh = await tx.order.findUnique({
        where: { id: order.id },
        include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      return {
        orderStatus: fresh?.status ?? statusAfterExpiryCheck,
        paymentStatus: fresh?.payments[0]?.status ?? null,
        alreadyProcessed: true as const,
        emitted: null,
      };
    }

    await tx.payment.upsert({
      where: { provider_providerPaymentId: { provider: SIMULATOR_PROVIDER, providerPaymentId } },
      update: {
        status: paymentStatus,
        rawStatus: result,
        ...(result === "approved" ? { approvedAt: now } : {}),
        ...(result === "cancelled" ? { cancelledAt: now, cancellationReason: "Simulado: pago cancelado." } : {}),
      },
      create: {
        orderId: order.id,
        provider: SIMULATOR_PROVIDER,
        providerPaymentId,
        status: paymentStatus,
        amount: order.total,
        currency: order.currency,
        rawStatus: result,
        approvedAt: result === "approved" ? now : null,
        cancelledAt: result === "cancelled" ? now : null,
        cancellationReason: result === "cancelled" ? "Simulado: pago cancelado." : null,
      },
    });

    if (result !== "approved") {
      return {
        orderStatus: (result === "cancelled" ? "CANCELLED" : "PENDING") as OrderStatus,
        paymentStatus,
        alreadyProcessed: false as const,
        emitted: null,
      };
    }

    const attendeeNames = parseAttendeeNames(item.attendeeNames);
    const emitted = await emitTicketsForOrderItem(tx, {
      orderId: order.id,
      orderItemId: item.id,
      ticketTypeId: item.ticketTypeId,
      ticketsPerUnit: item.ticketType.ticketsPerUnit,
      holderEmail: order.user.email,
      attendeeNames,
      fallbackHolderName: order.user.displayName ?? order.user.email,
    });

    return {
      orderStatus: "PAID" as OrderStatus,
      paymentStatus,
      alreadyProcessed: false as const,
      emitted,
    };
  });

  if (!transactionResult.emitted) {
    return {
      orderStatus: transactionResult.orderStatus,
      paymentStatus: transactionResult.paymentStatus,
      alreadyProcessed: transactionResult.alreadyProcessed,
    };
  }

  // El email se manda después de que la transacción ya confirmó (nunca
  // llamadas externas adentro): una demora o falla del proveedor no puede
  // revertir el pago ni los tickets ya emitidos. Se reutiliza el mismo
  // servicio de email de la entrada General — un email por ticket, tal cual
  // ya está probado, sin rediseñarlo para mandar varios QR en un solo email
  // (pendiente documentado en docs/ROADMAP.md si se quisiera ese rediseño).
  const emailConfig = { provider: env.EMAIL_PROVIDER, apiKey: env.EMAIL_API_KEY, from: env.EMAIL_FROM };
  const tickets: SimulatedTicket[] = [];
  for (const emittedTicket of transactionResult.emitted) {
    const { status: emailStatus } = await sendGeneralTicketEmail(
      {
        to: order.user.email,
        attendeeName: emittedTicket.holderName,
        eventTitle: order.event.title,
        eventStartsAt: order.event.startsAt,
        eventVenueName: order.event.venueName,
        eventAddress: order.event.address,
        ticketTypeName: item.ticketType.name,
        ticketPublicId: emittedTicket.ticketPublicId,
        ticketToken: emittedTicket.rawToken,
      },
      emailConfig,
      env.EVENT_TIMEZONE,
    );

    tickets.push({
      ticketPublicId: emittedTicket.ticketPublicId,
      holderName: emittedTicket.holderName,
      ticketType: item.ticketType.name,
      token: emittedTicket.rawToken,
      emailStatus,
    });
  }

  return {
    orderStatus: transactionResult.orderStatus,
    paymentStatus: transactionResult.paymentStatus,
    alreadyProcessed: false,
    tickets,
  };
}
