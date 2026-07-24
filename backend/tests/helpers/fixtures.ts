import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "../../src/shared/prisma.js";

export async function createFixtureEvent(overrides: Partial<Prisma.EventCreateInput> = {}) {
  const suffix = randomUUID().slice(0, 8);

  return prisma.event.create({
    data: {
      title: `Evento de prueba ${suffix}`,
      slug: `evento-prueba-${suffix}`,
      description: "Evento generado por la suite de tests.",
      venueName: "Sala de pruebas",
      address: "Calle Falsa 123",
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
      salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      salesEndAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      capacity: 100,
      status: "PUBLISHED",
      ...overrides,
    },
  });
}

export async function createFixtureTicketType(eventId: string, overrides: Partial<Prisma.TicketTypeUncheckedCreateInput> = {}) {
  const suffix = randomUUID().slice(0, 8);

  return prisma.ticketType.create({
    data: {
      eventId,
      name: `Entrada de prueba ${suffix}`,
      price: 0,
      capacity: 10,
      maxPerOrder: 1,
      ticketsPerUnit: 1,
      salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      salesEndAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      ...overrides,
    },
  });
}

/** Borra un evento de prueba y todo lo que cuelga de él, en el orden que exigen los onDelete: Restrict. */
export async function cleanupEvent(eventId: string): Promise<void> {
  await prisma.checkIn.deleteMany({ where: { eventId } });
  await prisma.ticket.deleteMany({ where: { order: { eventId } } });
  await prisma.orderItem.deleteMany({ where: { order: { eventId } } });
  await prisma.payment.deleteMany({ where: { order: { eventId } } });
  await prisma.order.deleteMany({ where: { eventId } });
  await prisma.ticketType.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
}

export async function cleanupUserByEmail(email: string): Promise<void> {
  await prisma.user.deleteMany({ where: { email } });
}
