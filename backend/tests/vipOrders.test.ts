import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailDeliveryResult } from "../src/integrations/email/types.js";
import { fakeDecodedToken } from "./helpers/authFixtures.js";
import {
  cleanupEvent,
  cleanupUserByEmail,
  createFixtureEvent,
  createFixtureOrder,
  createFixtureOrderItem,
  createFixtureStaffUser,
  createFixtureTicketType,
  createFixtureUser,
} from "./helpers/fixtures.js";

const { mockedSendGeneralTicketEmail, verifyFirebaseIdTokenMock } = vi.hoisted(() => ({
  mockedSendGeneralTicketEmail: vi.fn<(...args: unknown[]) => Promise<EmailDeliveryResult>>(),
  verifyFirebaseIdTokenMock: vi.fn(),
}));

// Mockeado para que estos tests no dependan de red y para poder inspeccionar
// exactamente con qué datos se llamó (reutilización del email de General,
// ver docs/DECISIONS.md). Todo el bloque VIP vive en este único archivo a
// propósito: son las únicas suites (junto con registrations.general.test.ts)
// que usan una transacción Serializable, y vitest.config.ts ya corre los
// archivos en serie por eso — mantenerlas juntas además evita cualquier
// dependencia de ese aislamiento global.
vi.mock("../src/integrations/email/emailService.js", () => ({
  sendGeneralTicketEmail: mockedSendGeneralTicketEmail,
}));

// Check-in de tickets VIP requiere auth (ver modules/check-in/routes.ts) —
// solo se mockea verifyFirebaseIdToken (nunca Firebase real); Prisma sigue
// real, como el resto de este archivo.
vi.mock("../src/integrations/firebase/firebaseAdmin.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/integrations/firebase/firebaseAdmin.js")>();
  return {
    ...original,
    verifyFirebaseIdToken: verifyFirebaseIdTokenMock,
  };
});

const { createApp } = await import("../src/app.js");
const { prisma } = await import("../src/shared/prisma.js");

const app = createApp();

function uniqueEmail(): string {
  return `vip-${randomUUID()}@test.pulse.local`;
}

function buyerPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: uniqueEmail(),
    whatsapp: "+5491122334455",
    ...overrides,
  };
}

describe("VIP: creación de orden, capacidad, simulador de pago y consulta", () => {
  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let vipIndividual: Awaited<ReturnType<typeof createFixtureTicketType>>;
  let vipDoble: Awaited<ReturnType<typeof createFixtureTicketType>>;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    event = await createFixtureEvent();
    vipIndividual = await createFixtureTicketType(event.id, {
      name: "VIP Individual",
      price: 35000,
      ticketsPerUnit: 1,
      capacity: 20,
    });
    vipDoble = await createFixtureTicketType(event.id, {
      name: "VIP Doble",
      price: 60000,
      ticketsPerUnit: 2,
      capacity: 20,
    });
  });

  beforeEach(() => {
    mockedSendGeneralTicketEmail.mockReset();
    mockedSendGeneralTicketEmail.mockResolvedValue({ status: "sent" });
  });

  afterAll(async () => {
    await cleanupEvent(event.id);
    for (const email of createdEmails) {
      await cleanupUserByEmail(email);
    }
    await prisma.$disconnect();
  });

  async function createOrder(ticketTypeId: string, attendees: Array<{ name: string }>, buyerOverrides: Record<string, unknown> = {}) {
    const buyer = buyerPayload(buyerOverrides);
    createdEmails.push(buyer.email as string);
    return request(app)
      .post(`/api/events/${event.publicId}/orders/vip`)
      .send({ ticketTypeId, buyer, attendees });
  }

  async function createPendingOrder(ticketTypeId: string, attendees: Array<{ name: string }>) {
    const res = await createOrder(ticketTypeId, attendees);
    expect(res.status).toBe(201);
    return res.body as { orderPublicId: string };
  }

  describe("creación de orden", () => {
    it("VIP Individual válida: 201, PENDING, un asistente", async () => {
      const res = await createOrder(vipIndividual.id, [{ name: "Ada Lovelace" }]);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PENDING");
      expect(res.body.ticketType).toBe("VIP Individual");
      expect(res.body.attendees).toEqual(["Ada Lovelace"]);
      expect(res.body.total).toBe(35000);
      expect(res.body.currency).toBe("ARS");
      expect(res.body.eventPublicId).toBe(event.publicId);
      expect(typeof res.body.orderPublicId).toBe("string");
      expect(res.body.paymentSimulationAvailable).toBe(true);
    });

    it("VIP Doble válida: 201, PENDING, dos asistentes", async () => {
      const res = await createOrder(vipDoble.id, [{ name: "Ada" }, { name: "Grace" }]);

      expect(res.status).toBe(201);
      expect(res.body.attendees).toEqual(["Ada", "Grace"]);
      expect(res.body.total).toBe(60000);
    });

    it("General rechazada: 400 TICKET_TYPE_NOT_VIP", async () => {
      const general = await createFixtureTicketType(event.id, { name: "General", price: 0, ticketsPerUnit: 1 });

      const res = await createOrder(general.id, [{ name: "Ada" }]);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("TICKET_TYPE_NOT_VIP");
    });

    it("VIP Individual con 2 asistentes: 400 INVALID_ATTENDEE_COUNT", async () => {
      const res = await createOrder(vipIndividual.id, [{ name: "Ada" }, { name: "Grace" }]);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ATTENDEE_COUNT");
    });

    it("VIP Doble con 1 asistente: 400 INVALID_ATTENDEE_COUNT", async () => {
      const res = await createOrder(vipDoble.id, [{ name: "Ada" }]);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ATTENDEE_COUNT");
    });

    it("0 asistentes: 400 de validación", async () => {
      const res = await createOrder(vipIndividual.id, []);

      expect(res.status).toBe(400);
    });

    it("evento inexistente: 404 EVENT_NOT_FOUND", async () => {
      const buyer = buyerPayload();
      createdEmails.push(buyer.email);

      const res = await request(app)
        .post("/api/events/evento-que-no-existe/orders/vip")
        .send({ ticketTypeId: vipIndividual.id, buyer, attendees: [{ name: "Ada" }] });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("EVENT_NOT_FOUND");
    });

    it("tipo de entrada inexistente: 404 TICKET_TYPE_NOT_FOUND", async () => {
      const res = await createOrder("ticket-type-inexistente", [{ name: "Ada" }]);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("TICKET_TYPE_NOT_FOUND");
    });

    it("sin capacidad: 409 SOLD_OUT", async () => {
      const soldOutType = await createFixtureTicketType(event.id, {
        name: "VIP Individual Agotado",
        price: 1000,
        ticketsPerUnit: 1,
        capacity: 1,
      });

      const first = await createOrder(soldOutType.id, [{ name: "Ada" }]);
      expect(first.status).toBe(201);

      const second = await createOrder(soldOutType.id, [{ name: "Grace" }]);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("SOLD_OUT");
    });

    it("calcula el total correctamente desde TicketType.price", async () => {
      const res = await createOrder(vipDoble.id, [{ name: "Ada" }, { name: "Grace" }]);

      expect(res.body.total).toBe(60000);
    });

    it("expiresAt queda a ~15 minutos de la creación", async () => {
      const before = Date.now();
      const res = await createOrder(vipIndividual.id, [{ name: "Ada" }]);
      const diffMinutes = (new Date(res.body.expiresAt).getTime() - before) / 60000;

      expect(diffMinutes).toBeGreaterThan(14.9);
      expect(diffMinutes).toBeLessThan(15.1);
    });

    it("no crea Ticket ni Payment al crear la orden", async () => {
      const res = await createOrder(vipIndividual.id, [{ name: "Ada" }]);
      const order = await prisma.order.findUnique({ where: { publicId: res.body.orderPublicId } });

      expect(await prisma.ticket.count({ where: { orderId: order?.id } })).toBe(0);
      expect(await prisma.payment.count({ where: { orderId: order?.id } })).toBe(0);
    });

    it("crea un solo OrderItem", async () => {
      const res = await createOrder(vipIndividual.id, [{ name: "Ada" }]);
      const order = await prisma.order.findUnique({ where: { publicId: res.body.orderPublicId } });

      expect(await prisma.orderItem.count({ where: { orderId: order?.id } })).toBe(1);
    });
  });

  describe("capacidad", () => {
    it("órdenes PAID cuentan para la capacidad", async () => {
      const type = await createFixtureTicketType(event.id, { name: "Cap PAID", price: 1000, capacity: 1 });
      const user = await createFixtureUser();
      const order = await createFixtureOrder(event.id, user.id, { status: "PAID" });
      await createFixtureOrderItem(order.id, type.id);

      const res = await createOrder(type.id, [{ name: "Ada" }]);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SOLD_OUT");
    });

    it("órdenes PENDING no vencidas cuentan para la capacidad", async () => {
      const type = await createFixtureTicketType(event.id, { name: "Cap PENDING", price: 1000, capacity: 1 });
      const user = await createFixtureUser();
      const order = await createFixtureOrder(event.id, user.id, {
        status: "PENDING",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      await createFixtureOrderItem(order.id, type.id);

      const res = await createOrder(type.id, [{ name: "Ada" }]);
      expect(res.status).toBe(409);
    });

    it("órdenes CANCELLED no cuentan para la capacidad", async () => {
      const type = await createFixtureTicketType(event.id, { name: "Cap CANCELLED", price: 1000, capacity: 1 });
      const user = await createFixtureUser();
      const order = await createFixtureOrder(event.id, user.id, { status: "CANCELLED" });
      await createFixtureOrderItem(order.id, type.id);

      const res = await createOrder(type.id, [{ name: "Ada" }]);
      expect(res.status).toBe(201);
    });

    it("órdenes EXPIRED no cuentan para la capacidad", async () => {
      const type = await createFixtureTicketType(event.id, { name: "Cap EXPIRED", price: 1000, capacity: 1 });
      const user = await createFixtureUser();
      const order = await createFixtureOrder(event.id, user.id, {
        status: "EXPIRED",
        expiresAt: new Date(Date.now() - 60 * 1000),
      });
      await createFixtureOrderItem(order.id, type.id);

      const res = await createOrder(type.id, [{ name: "Ada" }]);
      expect(res.status).toBe(201);
    });

    it("órdenes PENDING vencidas (expiresAt pasado) no cuentan para la capacidad", async () => {
      const type = await createFixtureTicketType(event.id, { name: "Cap PENDING vencida", price: 1000, capacity: 1 });
      const user = await createFixtureUser();
      const order = await createFixtureOrder(event.id, user.id, {
        status: "PENDING",
        expiresAt: new Date(Date.now() - 60 * 1000),
      });
      await createFixtureOrderItem(order.id, type.id);

      const res = await createOrder(type.id, [{ name: "Ada" }]);
      expect(res.status).toBe(201);
    });

    it("con la última unidad: dos solicitudes simultáneas, solo una reserva y la otra queda sin capacidad", async () => {
      const type = await createFixtureTicketType(event.id, { name: "Cap Concurrencia", price: 1000, capacity: 1 });

      const [resA, resB] = await Promise.all([
        createOrder(type.id, [{ name: "Ada" }]),
        createOrder(type.id, [{ name: "Grace" }]),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const paidOrPending = [resA, resB].filter((r) => r.status === 201);
      expect(paidOrPending).toHaveLength(1);

      const count = await prisma.orderItem.count({
        where: { ticketTypeId: type.id, order: { status: { in: ["PAID", "PENDING"] } } },
      });
      expect(count).toBe(1);
    });
  });

  describe("simulador de pago", () => {
    it("deshabilitado devuelve 404 (se prueba aparte en paymentSimulator.disabled.test.ts)", () => {
      // Placeholder documental: ver ese archivo para el caso real con
      // ENABLE_MVP_PAYMENT_SIMULATOR=false forzado en su propio registro de módulos.
      expect(true).toBe(true);
    });

    it("approved crea Payment APPROVED y marca la Order PAID", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);

      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });

      expect(res.status).toBe(200);
      expect(res.body.orderStatus).toBe("PAID");
      expect(res.body.paymentStatus).toBe("APPROVED");
      expect(res.body.alreadyProcessed).toBe(false);

      const dbOrder = await prisma.order.findUnique({ where: { publicId: order.orderPublicId } });
      expect(dbOrder?.status).toBe("PAID");
      const payment = await prisma.payment.findFirst({ where: { orderId: dbOrder?.id } });
      expect(payment?.status).toBe("APPROVED");
    });

    it("approved en VIP Individual genera exactamente 1 ticket", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);

      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });

      expect(res.body.tickets).toHaveLength(1);
      expect(res.body.tickets[0].holderName).toBe("Ada");
      expect(typeof res.body.tickets[0].token).toBe("string");
      expect(res.body.tickets[0].token.length).toBeGreaterThan(20);
    });

    it("approved en VIP Doble genera 2 tickets con tokens y publicIds distintos, holders correctos", async () => {
      const order = await createPendingOrder(vipDoble.id, [{ name: "Ada" }, { name: "Grace" }]);

      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });

      expect(res.body.tickets).toHaveLength(2);
      const [first, second] = res.body.tickets;
      expect(first.holderName).toBe("Ada");
      expect(second.holderName).toBe("Grace");
      expect(first.token).not.toBe(second.token);
      expect(first.ticketPublicId).not.toBe(second.ticketPublicId);

      const dbTickets = await prisma.ticket.findMany({ where: { publicId: { in: [first.ticketPublicId, second.ticketPublicId] } } });
      expect(dbTickets).toHaveLength(2);
      expect(new Set(dbTickets.map((t) => t.orderItemId)).size).toBe(1); // mismo OrderItem
    });

    it("hashes persistidos, token crudo no persistido ni logueado", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);
      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });
      const token = res.body.tickets[0].token as string;

      const dbTicket = await prisma.ticket.findUnique({ where: { publicId: res.body.tickets[0].ticketPublicId } });
      expect(dbTicket?.qrTokenHash).toBeTruthy();
      expect(dbTicket?.qrTokenHash).not.toBe(token);
      expect(JSON.stringify(dbTicket)).not.toContain(token);

      const loggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((call) => call.join(" ")).join(" ");
      expect(loggedText).not.toContain(token);

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("repetir approved no duplica tickets: devuelve alreadyProcessed sin tickets", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);

      const first = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });
      expect(first.body.alreadyProcessed).toBe(false);

      const second = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });
      expect(second.status).toBe(200);
      expect(second.body.alreadyProcessed).toBe(true);
      expect(second.body.orderStatus).toBe("PAID");
      expect(second.body.tickets).toBeUndefined();

      const dbOrder = await prisma.order.findUnique({ where: { publicId: order.orderPublicId } });
      expect(await prisma.ticket.count({ where: { orderId: dbOrder?.id } })).toBe(1);
    });

    it("pending no genera tickets y la Order sigue PENDING", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);

      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "pending" });

      expect(res.body.orderStatus).toBe("PENDING");
      expect(res.body.paymentStatus).toBe("PENDING");
      expect(res.body.tickets).toBeUndefined();

      const dbOrder = await prisma.order.findUnique({ where: { publicId: order.orderPublicId } });
      expect(dbOrder?.status).toBe("PENDING");
      expect(await prisma.ticket.count({ where: { orderId: dbOrder?.id } })).toBe(0);
    });

    it("rejected no genera tickets, y la Order sigue PENDING para permitir reintento", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);

      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "rejected" });

      expect(res.body.orderStatus).toBe("PENDING");
      expect(res.body.paymentStatus).toBe("REJECTED");

      const dbOrder = await prisma.order.findUnique({ where: { publicId: order.orderPublicId } });
      expect(dbOrder?.status).toBe("PENDING");
      expect(await prisma.ticket.count({ where: { orderId: dbOrder?.id } })).toBe(0);
    });

    it("después de rejected, un reintento con approved aprueba y emite el ticket", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);
      await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "rejected" });

      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });

      expect(res.body.orderStatus).toBe("PAID");
      expect(res.body.tickets).toHaveLength(1);
    });

    it("cancelled marca la Order CANCELLED y libera la reserva", async () => {
      const type = await createFixtureTicketType(event.id, { name: "Cap tras cancelar", price: 1000, capacity: 1 });
      const order = await createPendingOrder(type.id, [{ name: "Ada" }]);

      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "cancelled" });
      expect(res.body.orderStatus).toBe("CANCELLED");
      expect(res.body.tickets).toBeUndefined();

      const again = await createOrder(type.id, [{ name: "Grace" }]);
      expect(again.status).toBe(201);
    });

    it("orden vencida no puede aprobarse: queda EXPIRED, sin tickets", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);
      await prisma.order.update({ where: { publicId: order.orderPublicId }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });

      expect(res.body.orderStatus).toBe("EXPIRED");
      expect(res.body.alreadyProcessed).toBe(true);
      expect(res.body.tickets).toBeUndefined();

      const dbOrder = await prisma.order.findUnique({ where: { publicId: order.orderPublicId } });
      expect(dbOrder?.status).toBe("EXPIRED");
      expect(await prisma.ticket.count({ where: { orderId: dbOrder?.id } })).toBe(0);
    });

    it("orden inexistente: 404 ORDER_NOT_FOUND", async () => {
      const res = await request(app).post("/api/dev/orders/orden-que-no-existe/simulate-payment").send({ result: "approved" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
    });

    it("aprobación concurrente no duplica tickets", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);

      const [resA, resB] = await Promise.all([
        request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" }),
        request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" }),
      ]);

      const withTickets = [resA.body, resB.body].filter((body) => body.tickets);
      const alreadyProcessed = [resA.body, resB.body].filter((body) => body.alreadyProcessed);
      expect(withTickets).toHaveLength(1);
      expect(alreadyProcessed).toHaveLength(1);

      const dbOrder = await prisma.order.findUnique({ where: { publicId: order.orderPublicId } });
      expect(await prisma.ticket.count({ where: { orderId: dbOrder?.id } })).toBe(1);
    });

    it("llama al email reutilizado una vez por ticket emitido, con los datos del evento", async () => {
      const order = await createPendingOrder(vipDoble.id, [{ name: "Ada" }, { name: "Grace" }]);

      const res = await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });

      expect(mockedSendGeneralTicketEmail).toHaveBeenCalledTimes(2);
      expect(res.body.tickets[0].emailStatus).toBe("sent");
      expect(res.body.tickets[1].emailStatus).toBe("sent");

      const [firstCallArgs] = mockedSendGeneralTicketEmail.mock.calls[0] as [Record<string, unknown>];
      expect(firstCallArgs).toMatchObject({ eventTitle: event.title, attendeeName: "Ada" });
    });
  });

  describe("consulta de orden", () => {
    it("devuelve el estado correcto (PENDING)", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);

      const res = await request(app).get(`/api/events/${event.publicId}/orders/${order.orderPublicId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("PENDING");
      expect(res.body.attendees).toEqual(["Ada"]);
      expect(res.body.ticketType).toBe("VIP Individual");
    });

    it("no expone token crudo ni qrTokenHash", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);
      await request(app).post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`).send({ result: "approved" });

      const res = await request(app).get(`/api/events/${event.publicId}/orders/${order.orderPublicId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("PAID");
      expect(res.body.tickets).toHaveLength(1);
      expect(res.body.tickets[0]).not.toHaveProperty("token");
      expect(res.body.tickets[0]).not.toHaveProperty("qrTokenHash");
      expect(JSON.stringify(res.body)).not.toContain("qrTokenHash");
    });

    it("aplica expiración perezosa: consultar después de expiresAt devuelve EXPIRED", async () => {
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);
      await prisma.order.update({ where: { publicId: order.orderPublicId }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await request(app).get(`/api/events/${event.publicId}/orders/${order.orderPublicId}`);

      expect(res.body.status).toBe("EXPIRED");
    });

    it("orden de otro evento: 404 ORDER_NOT_FOUND", async () => {
      const otherEvent = await createFixtureEvent();
      const order = await createPendingOrder(vipIndividual.id, [{ name: "Ada" }]);

      const res = await request(app).get(`/api/events/${otherEvent.publicId}/orders/${order.orderPublicId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ORDER_NOT_FOUND");

      await cleanupEvent(otherEvent.id);
    });

    it("orden inexistente: 404", async () => {
      const res = await request(app).get(`/api/events/${event.publicId}/orders/orden-que-no-existe`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
    });
  });

  describe("check-in de tickets VIP", () => {
    let validator: Awaited<ReturnType<typeof createFixtureStaffUser>>;

    beforeAll(async () => {
      validator = await createFixtureStaffUser("VALIDATOR");
    });

    afterAll(async () => {
      // Hay que borrar los CheckIn de este validador antes que el propio
      // usuario (FK CheckIn.validatorUserId) — el afterAll del describe
      // exterior (cleanupEvent) corre después de este, no antes.
      await prisma.checkIn.deleteMany({ where: { validatorUserId: validator.id } });
      await prisma.user.delete({ where: { id: validator.id } });
    });

    function qrPayloadFor(rawToken: string): string {
      return `pulse-ticket:v1:${rawToken}`;
    }

    function postCheckIn(qrPayload: string) {
      verifyFirebaseIdTokenMock.mockResolvedValueOnce(
        fakeDecodedToken({ uid: validator.firebaseUid!, email: validator.email }),
      );
      return request(app)
        .post(`/api/events/${event.publicId}/check-ins`)
        .set("Authorization", "Bearer token-validator")
        .send({ qrPayload });
    }

    it("VIP Doble: cada ticket se valida de forma independiente; usar uno no afecta al otro; repetir cada uno da ALREADY_USED por separado", async () => {
      const order = await createPendingOrder(vipDoble.id, [{ name: "Ada" }, { name: "Grace" }]);
      const approveRes = await request(app)
        .post(`/api/dev/orders/${order.orderPublicId}/simulate-payment`)
        .send({ result: "approved" });

      const [ticketA, ticketB] = approveRes.body.tickets as Array<{ token: string; ticketPublicId: string; holderName: string }>;
      expect(ticketA.token).not.toBe(ticketB.token);

      const checkInA = await postCheckIn(qrPayloadFor(ticketA.token));
      expect(checkInA.body.result).toBe("VALID");
      expect(checkInA.body.ticketPublicId).toBe(ticketA.ticketPublicId);
      expect(checkInA.body.holderName).toBe(ticketA.holderName);

      // El segundo ticket todavía no fue tocado por el check-in del primero.
      const dbTicketB = await prisma.ticket.findUnique({ where: { publicId: ticketB.ticketPublicId } });
      expect(dbTicketB?.status).toBe("ACTIVE");

      const checkInB = await postCheckIn(qrPayloadFor(ticketB.token));
      expect(checkInB.body.result).toBe("VALID");
      expect(checkInB.body.ticketPublicId).toBe(ticketB.ticketPublicId);
      expect(checkInB.body.holderName).toBe(ticketB.holderName);

      const repeatA = await postCheckIn(qrPayloadFor(ticketA.token));
      expect(repeatA.body.result).toBe("ALREADY_USED");
      expect(repeatA.body.ticketPublicId).toBe(ticketA.ticketPublicId);

      const repeatB = await postCheckIn(qrPayloadFor(ticketB.token));
      expect(repeatB.body.result).toBe("ALREADY_USED");
      expect(repeatB.body.ticketPublicId).toBe(ticketB.ticketPublicId);
    });
  });
});
