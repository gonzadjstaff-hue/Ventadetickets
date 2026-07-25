import { Prisma, type OrderStatus, type PaymentStatus } from "@prisma/client";

import { env } from "../../config/env.js";
import { prisma } from "../../shared/prisma.js";
import { countReservedUnits } from "./capacityService.js";
import {
  EventNotFoundError,
  EventNotPublishedError,
  InvalidAttendeeCountError,
  OrderConflictError,
  OrderNotFoundError,
  OutsideSalesWindowError,
  SoldOutError,
  TicketTypeNotActiveError,
  TicketTypeNotFoundError,
  TicketTypeNotVipError,
} from "./errors.js";
import type { CreateVipOrderInput } from "./schemas.js";

export interface CreateVipOrderResult {
  orderPublicId: string;
  eventPublicId: string;
  ticketTypeName: string;
  total: Prisma.Decimal;
  currency: string;
  expiresAt: Date;
  buyerName: string;
  buyerEmail: string;
  buyerWhatsapp: string;
  attendees: string[];
  status: "PENDING";
}

export async function createVipOrder(
  eventPublicId: string,
  input: CreateVipOrderInput,
): Promise<CreateVipOrderResult> {
  const event = await prisma.event.findUnique({ where: { publicId: eventPublicId } });
  if (!event) throw new EventNotFoundError();
  if (event.status !== "PUBLISHED") throw new EventNotPublishedError();

  const ticketType = await prisma.ticketType.findFirst({
    where: { id: input.ticketTypeId, eventId: event.id },
  });
  if (!ticketType) throw new TicketTypeNotFoundError();
  if (ticketType.status !== "ACTIVE") throw new TicketTypeNotActiveError();
  // General (y cualquier otro tipo gratuito) queda fuera de este endpoint:
  // la señal de "es VIP" es directamente price > 0, la misma definición que
  // ya usa el registro General (price === 0) del otro lado. No hace falta un
  // campo/enum nuevo tipo TicketType.category para esto — ver docs/DECISIONS.md.
  if (ticketType.price.isZero()) throw new TicketTypeNotVipError();

  const now = new Date();
  if (now < ticketType.salesStartAt || now > ticketType.salesEndAt) {
    throw new OutsideSalesWindowError();
  }

  // La cantidad de asistentes debe coincidir exactamente con ticketsPerUnit
  // del dato, nunca con una regla tipo "si es VIP Doble, pedir 2".
  if (input.attendees.length !== ticketType.ticketsPerUnit) {
    throw new InvalidAttendeeCountError(ticketType.ticketsPerUnit);
  }

  const expiresAt = new Date(now.getTime() + env.ORDER_EXPIRATION_MINUTES * 60 * 1000);
  const attendeeNames = input.attendees.map((attendee) => attendee.name);

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Repetido acá adentro (no confiar en la lectura de afuera): con
        // Serializable, dos compras simultáneas por la última unidad hacen
        // que Postgres aborte una de las dos transacciones (P2034 abajo).
        const reserved = await countReservedUnits(tx, ticketType.id, now);
        if (reserved + 1 > ticketType.capacity) throw new SoldOutError();

        let user = await tx.user.findUnique({ where: { email: input.buyer.email } });
        if (!user) {
          user = await tx.user.create({
            data: {
              email: input.buyer.email,
              displayName: input.buyer.name,
              phone: input.buyer.whatsapp,
            },
          });
        }

        const order = await tx.order.create({
          data: {
            userId: user.id,
            eventId: event.id,
            status: "PENDING",
            currency: ticketType.currency,
            subtotal: ticketType.price,
            total: ticketType.price,
            expiresAt,
          },
        });

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            ticketTypeId: ticketType.id,
            quantity: 1,
            unitPrice: ticketType.price,
            subtotal: ticketType.price,
            attendeeNames,
          },
        });

        return {
          orderPublicId: order.publicId,
          eventPublicId: event.publicId,
          ticketTypeName: ticketType.name,
          total: ticketType.price,
          currency: order.currency,
          expiresAt,
          buyerName: user.displayName ?? input.buyer.name,
          buyerEmail: user.email,
          buyerWhatsapp: user.phone ?? input.buyer.whatsapp,
          attendees: attendeeNames,
          status: "PENDING" as const,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new OrderConflictError();
    }
    throw error;
  }
}

/**
 * Si la orden está PENDING y ya venció, la marca EXPIRED (expiración
 * perezosa: no hay cron todavía, ver docs/ROADMAP.md). Condicionada por
 * status: "PENDING" en el WHERE para no pisar un cambio concurrente (ej. si
 * se aprobó el pago un instante antes de que esto corriera) — si perdemos
 * esa carrera, se relee y se devuelve el estado real en vez de EXPIRED.
 * Exportada para que modules/payments/ la reutilice antes de simular un pago.
 */
export async function expireIfNeeded(order: { id: string; status: OrderStatus; expiresAt: Date | null }): Promise<OrderStatus> {
  if (order.status !== "PENDING" || !order.expiresAt || order.expiresAt.getTime() > Date.now()) {
    return order.status;
  }

  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  if (updated.count === 1) return "EXPIRED";

  const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
  return fresh?.status ?? order.status;
}

function parseAttendeeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export interface OrderStatusResult {
  orderPublicId: string;
  status: OrderStatus;
  ticketTypeName: string;
  total: Prisma.Decimal;
  currency: string;
  expiresAt: Date | null;
  buyerName: string | null;
  attendees: string[];
  paymentStatus: PaymentStatus | null;
  /** Solo presente cuando status === "PAID". Nunca incluye qrTokenHash ni el token crudo. */
  tickets?: Array<{ ticketPublicId: string; holderName: string; ticketTypeName: string }>;
}

export async function getOrderStatus(eventPublicId: string, orderPublicId: string): Promise<OrderStatusResult> {
  const event = await prisma.event.findUnique({ where: { publicId: eventPublicId } });
  if (!event) throw new EventNotFoundError();

  const order = await prisma.order.findUnique({
    where: { publicId: orderPublicId },
    include: {
      items: { include: { ticketType: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      tickets: { include: { ticketType: true } },
      user: true,
    },
  });
  // Mismo error para "no existe" y "es de otro evento": no confirmar la
  // existencia de una orden ajena.
  if (!order || order.eventId !== event.id) throw new OrderNotFoundError();

  const status = await expireIfNeeded(order);
  const item = order.items[0];
  const attendees = parseAttendeeNames(item?.attendeeNames);

  return {
    orderPublicId: order.publicId,
    status,
    ticketTypeName: item?.ticketType.name ?? "",
    total: order.total,
    currency: order.currency,
    expiresAt: order.expiresAt,
    buyerName: order.user.displayName,
    attendees,
    paymentStatus: order.payments[0]?.status ?? null,
    tickets:
      status === "PAID"
        ? order.tickets.map((ticket) => ({
            ticketPublicId: ticket.publicId,
            holderName: ticket.holderName,
            ticketTypeName: ticket.ticketType.name,
          }))
        : undefined,
  };
}
