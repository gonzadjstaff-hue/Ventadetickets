import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailDeliveryResult } from "../src/integrations/email/types.js";
import {
  cleanupEvent,
  cleanupUserByEmail,
  createFixtureEvent,
  createFixtureTicketType,
} from "./helpers/fixtures.js";

// Mockeado acá (y no dejado pegarle al proveedor real) para que estos tests
// no dependan de red, y para que las aserciones de "el email no revierte
// nada" puedan controlar exactamente qué status devuelve. Además, tenerlo en
// el MISMO archivo que el resto del flujo de registro (en vez de un archivo
// aparte) evita que dos suites de tests corran en paralelo contra la misma
// transacción Serializable del endpoint, lo que generaba conflictos 40001 /
// P2034 espurios entre archivos.
const { mockedSendGeneralTicketEmail } = vi.hoisted(() => ({
  mockedSendGeneralTicketEmail: vi.fn<(...args: unknown[]) => Promise<EmailDeliveryResult>>(),
}));

vi.mock("../src/integrations/email/emailService.js", () => ({
  sendGeneralTicketEmail: mockedSendGeneralTicketEmail,
}));

const { createApp } = await import("../src/app.js");
const { prisma } = await import("../src/shared/prisma.js");

const app = createApp();

function uniqueEmail(): string {
  return `test-${randomUUID()}@test.pulse.local`;
}

function validPayload(ticketTypeId: string, overrides: Record<string, unknown> = {}) {
  return {
    ticketTypeId,
    firstName: "Ada",
    lastName: "Lovelace",
    email: uniqueEmail(),
    phone: "+5491122334455",
    acceptedTerms: true,
    ...overrides,
  };
}

describe("POST /api/events/:eventPublicId/registrations/general", () => {
  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let generalType: Awaited<ReturnType<typeof createFixtureTicketType>>;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    event = await createFixtureEvent();
    generalType = await createFixtureTicketType(event.id, { name: "General", price: 0 });
  });

  beforeEach(() => {
    mockedSendGeneralTicketEmail.mockReset();
    mockedSendGeneralTicketEmail.mockResolvedValue({ status: "disabled" });
  });

  afterAll(async () => {
    await cleanupEvent(event.id);
    for (const email of createdEmails) {
      await cleanupUserByEmail(email);
    }
    await prisma.$disconnect();
  });

  it("registra exitosamente, marca la orden como PAID y no crea Payment", async () => {
    const payload = validPayload(generalType.id);
    createdEmails.push(payload.email);

    const res = await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload);

    expect(res.status).toBe(201);
    expect(res.body.attendeeName).toBe("Ada Lovelace");
    expect(res.body.ticketType).toBe("General");
    expect(typeof res.body.ticketToken).toBe("string");
    expect(res.body.ticketToken.length).toBeGreaterThan(20);

    const order = await prisma.order.findUnique({ where: { publicId: res.body.orderPublicId } });
    expect(order?.status).toBe("PAID");
    expect(order?.total.toNumber()).toBe(0);

    const paymentCount = await prisma.payment.count({ where: { orderId: order?.id } });
    expect(paymentCount).toBe(0);

    const ticketCount = await prisma.ticket.count({ where: { orderId: order?.id } });
    expect(ticketCount).toBe(1);

    const ticket = await prisma.ticket.findUnique({ where: { publicId: res.body.ticketPublicId } });
    expect(ticket?.qrTokenHash).toBeTruthy();
    expect(ticket?.qrTokenHash).not.toBe(res.body.ticketToken);
  });

  it("rechaza un email duplicado para el mismo evento con 409", async () => {
    const payload = validPayload(generalType.id);
    createdEmails.push(payload.email);

    await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload).expect(201);

    const res = await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload);

    expect(res.status).toBe(409);
  });

  it("permite que el mismo email se registre en otro evento", async () => {
    const otherEvent = await createFixtureEvent();
    const otherType = await createFixtureTicketType(otherEvent.id, { name: "General" });

    const payload = validPayload(generalType.id);
    createdEmails.push(payload.email);

    await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload).expect(201);

    const res = await request(app)
      .post(`/api/events/${otherEvent.publicId}/registrations/general`)
      .send({ ...payload, ticketTypeId: otherType.id });

    expect(res.status).toBe(201);

    await cleanupEvent(otherEvent.id);
  });

  it("devuelve 404 si el evento no existe", async () => {
    const res = await request(app)
      .post("/api/events/evento-que-no-existe/registrations/general")
      .send(validPayload(generalType.id));

    expect(res.status).toBe(404);
  });

  it("devuelve 404 si el tipo de entrada no existe para ese evento", async () => {
    const res = await request(app)
      .post(`/api/events/${event.publicId}/registrations/general`)
      .send(validPayload("ticket-type-inexistente"));

    expect(res.status).toBe(404);
  });

  it("devuelve 422 si el evento no está publicado", async () => {
    const draftEvent = await createFixtureEvent({ status: "DRAFT" });
    const draftType = await createFixtureTicketType(draftEvent.id);

    const res = await request(app)
      .post(`/api/events/${draftEvent.publicId}/registrations/general`)
      .send(validPayload(draftType.id));

    expect(res.status).toBe(422);
    await cleanupEvent(draftEvent.id);
  });

  it("devuelve 400 si el tipo de entrada tiene precio distinto de cero", async () => {
    const paidType = await createFixtureTicketType(event.id, { price: 100 });

    const res = await request(app)
      .post(`/api/events/${event.publicId}/registrations/general`)
      .send(validPayload(paidType.id));

    expect(res.status).toBe(400);
  });

  it("devuelve 400 si el tipo de entrada está inactivo", async () => {
    const inactiveType = await createFixtureTicketType(event.id, { status: "INACTIVE" });

    const res = await request(app)
      .post(`/api/events/${event.publicId}/registrations/general`)
      .send(validPayload(inactiveType.id));

    expect(res.status).toBe(400);
  });

  it("devuelve 409 si no hay cupo disponible", async () => {
    const soldOutType = await createFixtureTicketType(event.id, { capacity: 1 });

    const first = validPayload(soldOutType.id);
    createdEmails.push(first.email);
    await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(first).expect(201);

    const second = validPayload(soldOutType.id);
    createdEmails.push(second.email);
    const res = await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(second);

    expect(res.status).toBe(409);
  });

  it("devuelve 422 si el registro está fuera de la ventana de venta", async () => {
    const closedType = await createFixtureTicketType(event.id, {
      salesStartAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      salesEndAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .post(`/api/events/${event.publicId}/registrations/general`)
      .send(validPayload(closedType.id));

    expect(res.status).toBe(422);
  });

  it("devuelve 400 si no se aceptan los términos", async () => {
    const res = await request(app)
      .post(`/api/events/${event.publicId}/registrations/general`)
      .send(validPayload(generalType.id, { acceptedTerms: false }));

    expect(res.status).toBe(400);
  });

  it("devuelve 400 con un email inválido", async () => {
    const res = await request(app)
      .post(`/api/events/${event.publicId}/registrations/general`)
      .send(validPayload(generalType.id, { email: "no-es-un-email" }));

    expect(res.status).toBe(400);
  });

  it("devuelve 400 con un teléfono inválido", async () => {
    const res = await request(app)
      .post(`/api/events/${event.publicId}/registrations/general`)
      .send(validPayload(generalType.id, { phone: "123" }));

    expect(res.status).toBe(400);
  });

  it("ante dos submits simultáneos del mismo email, deja pasar solo uno y nunca responde 500", async () => {
    const concurrentType = await createFixtureTicketType(event.id, { capacity: 5 });
    const email = uniqueEmail();
    createdEmails.push(email);

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/events/${event.publicId}/registrations/general`)
        .send(validPayload(concurrentType.id, { email })),
      request(app)
        .post(`/api/events/${event.publicId}/registrations/general`)
        .send(validPayload(concurrentType.id, { email })),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const ticketCount = await prisma.ticket.count({
      where: { ticketTypeId: concurrentType.id, holderEmail: email },
    });
    expect(ticketCount).toBe(1);
  });

  it("email enviado: responde 201 con emailStatus 'sent' y emailSent true", async () => {
    mockedSendGeneralTicketEmail.mockResolvedValue({ status: "sent" });
    const payload = validPayload(generalType.id);
    createdEmails.push(payload.email);

    const res = await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload);

    expect(res.status).toBe(201);
    expect(res.body.emailStatus).toBe("sent");
    expect(res.body.emailSent).toBe(true);
    expect(typeof res.body.ticketToken).toBe("string");
  });

  it("proveedor de email falla: el registro sigue siendo 201, con emailStatus 'failed' y emailSent false", async () => {
    mockedSendGeneralTicketEmail.mockResolvedValue({ status: "failed" });
    const payload = validPayload(generalType.id);
    createdEmails.push(payload.email);

    const res = await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload);

    expect(res.status).toBe(201);
    expect(res.body.emailStatus).toBe("failed");
    expect(res.body.emailSent).toBe(false);
    // La descarga sigue disponible: el ticketToken se devuelve igual.
    expect(typeof res.body.ticketToken).toBe("string");
    expect(res.body.ticketToken.length).toBeGreaterThan(20);
  });

  it("la falla de email no revierte Order ni Ticket, y no crea Payment", async () => {
    mockedSendGeneralTicketEmail.mockResolvedValue({ status: "failed" });
    const payload = validPayload(generalType.id);
    createdEmails.push(payload.email);

    const res = await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload);
    expect(res.status).toBe(201);

    const order = await prisma.order.findUnique({ where: { publicId: res.body.orderPublicId } });
    expect(order?.status).toBe("PAID");

    const ticket = await prisma.ticket.findUnique({ where: { publicId: res.body.ticketPublicId } });
    expect(ticket?.status).toBe("ACTIVE");
    expect(ticket?.qrTokenHash).toBeTruthy();
    expect(ticket?.qrTokenHash).not.toBe(res.body.ticketToken);

    const paymentCount = await prisma.payment.count({ where: { orderId: order?.id } });
    expect(paymentCount).toBe(0);
  });

  it("modo console: emailStatus 'simulated' y emailSent false (no es 'sent')", async () => {
    mockedSendGeneralTicketEmail.mockResolvedValue({ status: "simulated" });
    const payload = validPayload(generalType.id);
    createdEmails.push(payload.email);

    const res = await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload);

    expect(res.status).toBe(201);
    expect(res.body.emailStatus).toBe("simulated");
    expect(res.body.emailSent).toBe(false);
  });

  it("integración deshabilitada: emailStatus 'disabled' y emailSent false, registro igual exitoso", async () => {
    mockedSendGeneralTicketEmail.mockResolvedValue({ status: "disabled" });
    const payload = validPayload(generalType.id);
    createdEmails.push(payload.email);

    const res = await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload);

    expect(res.status).toBe(201);
    expect(res.body.emailStatus).toBe("disabled");
    expect(res.body.emailSent).toBe(false);
  });

  it("se llama a sendGeneralTicketEmail con los datos del evento y el token crudo recién emitido", async () => {
    mockedSendGeneralTicketEmail.mockResolvedValue({ status: "sent" });
    const payload = validPayload(generalType.id);
    createdEmails.push(payload.email);

    const res = await request(app).post(`/api/events/${event.publicId}/registrations/general`).send(payload);
    expect(res.status).toBe(201);

    expect(mockedSendGeneralTicketEmail).toHaveBeenCalledTimes(1);
    const [emailInput] = mockedSendGeneralTicketEmail.mock.calls[0] as [Record<string, unknown>];
    expect(emailInput).toMatchObject({
      to: payload.email,
      attendeeName: "Ada Lovelace",
      eventTitle: event.title,
      ticketTypeName: "General",
      ticketPublicId: res.body.ticketPublicId,
      ticketToken: res.body.ticketToken,
    });
  });
});
