import { randomUUID } from "node:crypto";

import type { Prisma, TicketStatus, UserRole } from "@prisma/client";

import { prisma } from "../../src/shared/prisma.js";
import { generateQrToken } from "../../src/shared/qrToken.js";

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

export async function createFixtureUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
  const suffix = randomUUID().slice(0, 8);

  return prisma.user.create({
    data: {
      email: `fixture-${suffix}@test.pulse.local`,
      displayName: `Fixture User ${suffix}`,
      ...overrides,
    },
  });
}

/**
 * Usuario staff (ADMIN/VALIDATOR) ya vinculado a Firebase (`firebaseUid` no
 * nulo), para tests e2e de rutas protegidas por `requireAuth`/`requireRole`
 * contra la base de test real — el `firebaseUid` se usa para armar el
 * `DecodedIdToken` falso que mockea `verifyFirebaseIdToken` (nunca se toca
 * Firebase real). Ver backend/tests/checkIn.test.ts.
 */
export async function createFixtureStaffUser(role: Extract<UserRole, "ADMIN" | "VALIDATOR">, overrides: Partial<Prisma.UserCreateInput> = {}) {
  const suffix = randomUUID().slice(0, 8);

  return prisma.user.create({
    data: {
      email: `fixture-staff-${suffix}@test.pulse.local`,
      displayName: `Fixture Staff ${suffix}`,
      firebaseUid: `fixture-firebase-uid-${suffix}`,
      role,
      status: "ACTIVE",
      ...overrides,
    },
  });
}

export async function createFixtureOrder(
  eventId: string,
  userId: string,
  overrides: Partial<Prisma.OrderUncheckedCreateInput> = {},
) {
  return prisma.order.create({
    data: {
      eventId,
      userId,
      status: "PAID",
      subtotal: 0,
      total: 0,
      ...overrides,
    },
  });
}

/**
 * Crea un OrderItem suelto (sin Ticket), para tests de capacidad que
 * necesitan simular órdenes VIP en distintos estados sin pasar por el
 * endpoint HTTP de creación (más rápido, y evita la transacción Serializable
 * de ese endpoint para estos casos donde no hace falta ejercitarla).
 */
export async function createFixtureOrderItem(
  orderId: string,
  ticketTypeId: string,
  overrides: Partial<Prisma.OrderItemUncheckedCreateInput> = {},
) {
  return prisma.orderItem.create({
    data: {
      orderId,
      ticketTypeId,
      quantity: 1,
      unitPrice: 0,
      subtotal: 0,
      ...overrides,
    },
  });
}

/**
 * Crea un OrderItem + Ticket directamente (sin pasar por el flujo HTTP de
 * registro), para poder construir tickets en cualquier estado que necesiten
 * los tests de check-in. Devuelve también el token crudo (nunca persistido)
 * para poder armar el qrPayload `pulse-ticket:v1:<token>` en el test.
 */
export async function createFixtureTicket(params: {
  orderId: string;
  ticketTypeId: string;
  status?: TicketStatus;
  overrides?: Partial<Prisma.TicketUncheckedCreateInput>;
}) {
  const { token, hash } = generateQrToken();
  const suffix = randomUUID().slice(0, 8);

  const orderItem = await prisma.orderItem.create({
    data: {
      orderId: params.orderId,
      ticketTypeId: params.ticketTypeId,
      quantity: 1,
      unitPrice: 0,
      subtotal: 0,
    },
  });

  const ticket = await prisma.ticket.create({
    data: {
      orderId: params.orderId,
      orderItemId: orderItem.id,
      ticketTypeId: params.ticketTypeId,
      holderName: "Fixture Holder",
      holderEmail: `fixture-ticket-${suffix}@test.pulse.local`,
      qrTokenHash: hash,
      status: params.status ?? "ACTIVE",
      ...params.overrides,
    },
  });

  return { ticket, rawToken: token };
}
