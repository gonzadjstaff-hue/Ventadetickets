import { Prisma } from "@prisma/client";

import { prisma } from "../../shared/prisma.js";
import { generateQrToken } from "../../shared/qrToken.js";
import {
  DuplicateRegistrationError,
  EventNotFoundError,
  EventNotPublishedError,
  OutsideSalesWindowError,
  RegistrationConflictError,
  SoldOutError,
  TicketTypeNotActiveError,
  TicketTypeNotFoundError,
  TicketTypeNotFreeError,
} from "./errors.js";
import type { GeneralRegistrationInput } from "./schemas.js";

export interface GeneralRegistrationResult {
  attendeeName: string;
  orderPublicId: string;
  ticketPublicId: string;
  /** Token crudo de un solo uso. Se devuelve acá y nunca se vuelve a poder recuperar. */
  ticketToken: string;
  ticketTypeName: string;
}

export async function registerGeneralTicket(
  eventPublicId: string,
  input: GeneralRegistrationInput,
): Promise<GeneralRegistrationResult> {
  const event = await prisma.event.findUnique({ where: { publicId: eventPublicId } });
  if (!event) throw new EventNotFoundError();
  if (event.status !== "PUBLISHED") throw new EventNotPublishedError();

  const ticketType = await prisma.ticketType.findFirst({
    where: { id: input.ticketTypeId, eventId: event.id },
  });
  if (!ticketType) throw new TicketTypeNotFoundError();
  if (ticketType.status !== "ACTIVE") throw new TicketTypeNotActiveError();
  if (!ticketType.price.isZero()) throw new TicketTypeNotFreeError();

  const now = new Date();
  if (now < ticketType.salesStartAt || now > ticketType.salesEndAt) {
    throw new OutsideSalesWindowError();
  }

  // Generado antes de la transacción: no depende del estado de la base.
  const { token, hash } = generateQrToken();

  try {
    return await prisma.$transaction(
      async (tx) => {
        const existingTicket = await tx.ticket.findFirst({
          where: {
            ticketTypeId: ticketType.id,
            holderEmail: input.email,
            order: { eventId: event.id },
            status: { in: ["ACTIVE", "USED"] },
          },
        });
        if (existingTicket) throw new DuplicateRegistrationError();

        // Cupo = unidades vendidas (OrderItem.quantity), no tickets emitidos:
        // un tipo con ticketsPerUnit > 1 (ej. VIP Doble) emite varios tickets
        // por unidad, así que contar tickets sobreestimaría el consumo de cupo.
        const soldAggregate = await tx.orderItem.aggregate({
          _sum: { quantity: true },
          where: { ticketTypeId: ticketType.id, order: { status: "PAID" } },
        });
        const sold = soldAggregate._sum.quantity ?? 0;
        if (sold >= ticketType.capacity) throw new SoldOutError();

        let user = await tx.user.findUnique({ where: { email: input.email } });
        if (!user) {
          user = await tx.user.create({
            data: {
              email: input.email,
              displayName: `${input.firstName} ${input.lastName}`,
              phone: input.phone,
            },
          });
        }

        const order = await tx.order.create({
          data: {
            userId: user.id,
            eventId: event.id,
            status: "PAID",
            currency: ticketType.currency,
            subtotal: new Prisma.Decimal(0),
            total: new Prisma.Decimal(0),
            paidAt: now,
          },
        });

        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            ticketTypeId: ticketType.id,
            quantity: 1,
            unitPrice: new Prisma.Decimal(0),
            subtotal: new Prisma.Decimal(0),
          },
        });

        const ticket = await tx.ticket.create({
          data: {
            orderId: order.id,
            orderItemId: orderItem.id,
            ticketTypeId: ticketType.id,
            holderName: `${input.firstName} ${input.lastName}`,
            holderEmail: input.email,
            qrTokenHash: hash,
            status: "ACTIVE",
          },
        });

        return {
          attendeeName: ticket.holderName,
          orderPublicId: order.publicId,
          ticketPublicId: ticket.publicId,
          ticketToken: token,
          ticketTypeName: ticketType.name,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new RegistrationConflictError();
    }
    throw error;
  }
}
