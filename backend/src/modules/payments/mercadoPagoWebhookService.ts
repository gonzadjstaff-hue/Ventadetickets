import { Prisma, type OrderStatus } from "@prisma/client";

import { env } from "../../config/env.js";
import { sendGeneralTicketEmail } from "../../integrations/email/emailService.js";
import type { NormalizedPayment, PaymentProvider } from "../../integrations/payments/types.js";
import { prisma } from "../../shared/prisma.js";
// Reutilizado a propósito, mismo motivo que en el simulador de pago (ver
// modules/payments/simulationService.ts): una única pieza de lógica de
// expiración perezosa, con su propio guard de concurrencia.
import { expireIfNeeded } from "../orders/service.js";
import { emitTicketsForOrderItem } from "./ticketEmissionService.js";

const PROVIDER = "mercadopago";
/** Tolerancia para comparar Decimal (DB) contra number (API externa) sin falsos mismatches por redondeo de punto flotante. */
const AMOUNT_EPSILON = 0.01;

export interface ProcessWebhookParams {
  provider: PaymentProvider;
  /** Identificador de la notificación (dedup) — el `id` del webhook, no el payment id. */
  notificationId: string;
  eventType: string;
  /** payment id (`data.id`) a consultar server-to-server. */
  paymentId: string;
  /** Payload ya validado por Zod, sin datos sensibles (ver mercadoPagoSchemas.ts) — se persiste tal cual en PaymentWebhookEvent.payload. */
  rawPayload: unknown;
}

export type WebhookOutcome =
  | { kind: "already_processed" }
  | { kind: "ignored"; reason: "order_not_found" | "amount_mismatch" | "currency_mismatch" | "live_mode_mismatch" }
  | { kind: "applied"; orderStatus: OrderStatus; paymentStatus: NormalizedPayment["status"] };

function parseAttendeeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Convención documentada por Mercado Pago para sus tokens: `APP_USR-` es
 * producción, `TEST-` es modo prueba. Se usa para verificar que el
 * `live_mode` del pago recibido sea coherente con las credenciales
 * configuradas en este entorno — un pago `live_mode: true` llegando a un
 * backend configurado con credenciales de prueba (o viceversa) nunca debe
 * aprobar nada.
 */
function expectedLiveMode(): boolean {
  return env.MERCADOPAGO_ACCESS_TOKEN?.startsWith("APP_USR-") ?? false;
}

/**
 * Punto único de entrada para procesar una notificación de webhook ya
 * validada en firma. Idempotente en dos niveles:
 * 1. `PaymentWebhookEvent` (provider + notificationId) evita reprocesar una
 *    notificación ya completada.
 * 2. Aun si se reprocesa (ej. un intento anterior murió a mitad de camino),
 *    el `Payment` (provider + providerPaymentId) se hace con `upsert`, y la
 *    transición de `Order` con `updateMany` condicionado por su estado
 *    actual — nunca duplica tickets ni pisa un estado terminal.
 */
export async function processMercadoPagoWebhook(params: ProcessWebhookParams): Promise<WebhookOutcome> {
  const existingEvent = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_externalEventId: { provider: PROVIDER, externalEventId: params.notificationId } },
  });
  if (existingEvent?.processed) {
    return { kind: "already_processed" };
  }

  if (!existingEvent) {
    try {
      await prisma.paymentWebhookEvent.create({
        data: {
          provider: PROVIDER,
          externalEventId: params.notificationId,
          eventType: params.eventType,
          payload: params.rawPayload as Prisma.InputJsonValue,
          processed: false,
        },
      });
    } catch (error) {
      // Carrera: otra request ganó la inserción entre el findUnique y el
      // create de acá arriba. Si ya la terminó de procesar, se ackea sin
      // repetir trabajo; si sigue en curso, también se ackea (la corrección
      // real no depende de esto: el guard a nivel Order/Payment más abajo es
      // lo que evita cualquier duplicación real).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const fresh = await prisma.paymentWebhookEvent.findUnique({
          where: { provider_externalEventId: { provider: PROVIDER, externalEventId: params.notificationId } },
        });
        if (fresh?.processed) return { kind: "already_processed" };
        return { kind: "already_processed" };
      }
      throw error;
    }
  }

  // Server-to-server: nunca se confía en status/amount/external_reference
  // que puedan venir en el body del webhook — se ignoran a propósito (ni
  // siquiera se leen) y se pide el pago real a Mercado Pago.
  const payment = await params.provider.getPayment(params.paymentId);

  const order = payment.externalReference
    ? await prisma.order.findUnique({
        where: { publicId: payment.externalReference },
        include: { event: true, items: { include: { ticketType: true } }, user: true },
      })
    : null;

  if (!order) {
    await markEventProcessed(params.notificationId, null, null);
    return { kind: "ignored", reason: "order_not_found" };
  }

  if (Math.abs(Number(order.total) - payment.amount) > AMOUNT_EPSILON) {
    await markEventProcessed(params.notificationId, null, order.id);
    return { kind: "ignored", reason: "amount_mismatch" };
  }
  if (order.currency !== payment.currency) {
    await markEventProcessed(params.notificationId, null, order.id);
    return { kind: "ignored", reason: "currency_mismatch" };
  }
  if (payment.liveMode !== expectedLiveMode()) {
    await markEventProcessed(params.notificationId, null, order.id);
    return { kind: "ignored", reason: "live_mode_mismatch" };
  }

  const paymentRow = await prisma.payment.upsert({
    where: { provider_providerPaymentId: { provider: PROVIDER, providerPaymentId: payment.providerPaymentId } },
    update: {
      status: payment.status,
      rawStatus: payment.rawStatus,
      paymentMethod: payment.paymentMethod,
      ...(payment.approvedAt ? { approvedAt: payment.approvedAt } : {}),
    },
    create: {
      orderId: order.id,
      provider: PROVIDER,
      providerPaymentId: payment.providerPaymentId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      rawStatus: payment.rawStatus,
      approvedAt: payment.approvedAt,
    },
  });

  const orderStatus = await applyOrderTransition(order, payment);

  await markEventProcessed(params.notificationId, paymentRow.id, order.id);

  return { kind: "applied", orderStatus, paymentStatus: payment.status };
}

async function markEventProcessed(notificationId: string, paymentId: string | null, orderId: string | null): Promise<void> {
  await prisma.paymentWebhookEvent.update({
    where: { provider_externalEventId: { provider: PROVIDER, externalEventId: notificationId } },
    data: { processed: true, processedAt: new Date(), paymentId, orderId },
  });
}

type OrderWithItems = Prisma.OrderGetPayload<{ include: { event: true; items: { include: { ticketType: true } }; user: true } }>;

async function applyOrderTransition(order: OrderWithItems, payment: NormalizedPayment): Promise<OrderStatus> {
  // Expiración perezosa aplicada ACÁ, antes de cualquier guard de estado:
  // sin esto, una orden cuyo expiresAt ya pasó pero que nadie tocó todavía
  // seguiría figurando "PENDING" en la base, y un webhook approved que
  // llegara tarde la aprobaría igual — exactamente lo que no debe pasar (ver
  // docs/DECISIONS.md). `expireIfNeeded` no hace nada si el estado ya no es
  // PENDING o si no venció, así que es seguro llamarla siempre acá, para los
  // 5 estados de pago por igual.
  const currentStatus = await expireIfNeeded(order);

  if (payment.status === "APPROVED") return applyApproved(order, currentStatus);
  if (payment.status === "CANCELLED") return applyCancelled(order, currentStatus);
  // REFUNDED no depende de PENDING/expiración: solo actúa si la orden ya
  // estaba PAID (ver applyRefunded).
  if (payment.status === "REFUNDED") return applyRefunded(order);
  // PENDING / REJECTED: nunca emiten tickets ni cambian el estado por sí
  // solos — se refleja el estado ya actualizado por expireIfNeeded.
  return currentStatus;
}

async function applyApproved(order: OrderWithItems, currentStatus: OrderStatus): Promise<OrderStatus> {
  // La orden ya no está PENDING (venció recién, o algo más ya la resolvió):
  // un pago aprobado que llega tarde nunca debe emitir tickets sobre una
  // reserva vencida/cancelada. Ni siquiera se intenta el updateMany de abajo.
  if (currentStatus !== "PENDING") return currentStatus;

  const item = order.items[0];
  if (!item) return order.status;

  const transactionResult = await prisma.$transaction(async (tx) => {
    // Mismo patrón que el simulador y que check-in: updateMany condicionado
    // por el estado actual — solo una request gana la transición, sin
    // importar cuántas veces llegue esta notificación (u otra) para el mismo
    // pago aprobado.
    const guard = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (guard.count === 0) return { emitted: null };

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
    return { emitted };
  });

  if (!transactionResult.emitted) {
    const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
    return fresh?.status ?? order.status;
  }

  // El email se manda después de que la transacción ya confirmó, con los
  // tokens crudos todavía en memoria de este mismo request — nunca se vuelven
  // a pedir ni se persisten (ver docs/DECISIONS.md). Un fallo de email no
  // revierte el pago ni los tickets ya emitidos.
  const emailConfig = { provider: env.EMAIL_PROVIDER, apiKey: env.EMAIL_API_KEY, from: env.EMAIL_FROM };
  for (const emittedTicket of transactionResult.emitted) {
    try {
      await sendGeneralTicketEmail(
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
    } catch {
      // `sendGeneralTicketEmail` no debería lanzar nunca (ver su propio
      // contrato en integrations/email/emailService.ts) — esto es una red de
      // seguridad adicional, no el mecanismo esperado de manejo de errores.
      // El pago y los tickets ya quedaron confirmados en la transacción de
      // arriba: un fallo acá nunca debe convertirse en un 500 que le haga
      // reintentar el webhook entero a Mercado Pago (reintentar no arregla un
      // problema del proveedor de email). No se loguea el error: podría
      // filtrar datos del ticket/asistente.
    }
  }

  return "PAID";
}

async function applyCancelled(order: OrderWithItems, currentStatus: OrderStatus): Promise<OrderStatus> {
  if (currentStatus !== "PENDING") return currentStatus;

  const guard = await prisma.order.updateMany({
    where: { id: order.id, status: "PENDING" },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Mercado Pago: pago cancelado." },
  });
  if (guard.count === 1) return "CANCELLED";
  const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
  return fresh?.status ?? order.status;
}

/**
 * `refunded` y `charged_back` (normalizados juntos, ver mercadoPagoProvider.ts)
 * solo tienen efecto si la Order ya estaba PAID: pasa a REFUNDED y los
 * tickets todavía ACTIVE (no usados) quedan REFUNDED, bloqueando su check-in.
 * Los tickets ya USED no se tocan: no se puede deshacer un ingreso ya
 * ocurrido. Flujo de devolución/contracargo completo (dinero real,
 * conciliación) queda fuera de este bloque — ver docs/ROADMAP.md.
 */
async function applyRefunded(order: OrderWithItems): Promise<OrderStatus> {
  const guard = await prisma.order.updateMany({
    where: { id: order.id, status: "PAID" },
    data: { status: "REFUNDED", refundedAt: new Date(), refundReason: "Mercado Pago: pago devuelto o contracargado." },
  });
  if (guard.count === 1) {
    await prisma.ticket.updateMany({
      where: { orderId: order.id, status: "ACTIVE" },
      data: { status: "REFUNDED", refundedAt: new Date(), refundReason: "Orden devuelta/contracargada." },
    });
    return "REFUNDED";
  }
  const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
  return fresh?.status ?? order.status;
}
