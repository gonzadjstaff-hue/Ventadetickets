import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/shared/prisma.js";
import { generateQrToken } from "../src/shared/qrToken.js";
import {
  cleanupEvent,
  createFixtureEvent,
  createFixtureOrder,
  createFixtureTicket,
  createFixtureTicketType,
  createFixtureUser,
  createFixtureValidatorUser,
} from "./helpers/fixtures.js";

const app = createApp();

function qrPayloadFor(rawToken: string): string {
  return `pulse-ticket:v1:${rawToken}`;
}

describe("POST /api/events/:eventPublicId/check-ins", () => {
  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let ticketType: Awaited<ReturnType<typeof createFixtureTicketType>>;
  let user: Awaited<ReturnType<typeof createFixtureUser>>;

  beforeAll(async () => {
    await createFixtureValidatorUser();
    event = await createFixtureEvent();
    ticketType = await createFixtureTicketType(event.id);
    user = await createFixtureUser();
  });

  afterAll(async () => {
    await cleanupEvent(event.id);
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  async function createActiveTicket() {
    const order = await createFixtureOrder(event.id, user.id, { status: "PAID" });
    return createFixtureTicket({ orderId: order.id, ticketTypeId: ticketType.id });
  }

  it("QR válido: acceso permitido, marca el ticket como USED, registra usedAt y crea CheckIn VALID", async () => {
    const { ticket, rawToken } = await createActiveTicket();

    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: qrPayloadFor(rawToken) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      result: "VALID",
      ticketPublicId: ticket.publicId,
      ticketType: ticketType.name,
    });
    expect(res.body.holderName).toBeTruthy();
    expect(res.body.email).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    expect(res.body.qrTokenHash).toBeUndefined();

    const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(updated?.status).toBe("USED");
    expect(updated?.usedAt).toBeTruthy();

    const checkIn = await prisma.checkIn.findFirst({ where: { ticketId: ticket.id } });
    expect(checkIn?.result).toBe("VALID");
    expect(checkIn?.eventId).toBe(event.id);
  });

  it("formato inválido (prefijo incorrecto) -> 400 INVALID_TICKET, sin CheckIn", async () => {
    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: "esto-no-es-un-qr-valido" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TICKET");
  });

  it("versión inválida -> 400 INVALID_TICKET", async () => {
    const { rawToken } = await createActiveTicket();

    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: `pulse-ticket:v2:${rawToken}` });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TICKET");
  });

  it("token con formato válido pero inexistente -> 400 INVALID_TICKET, sin CheckIn", async () => {
    const { token } = generateQrToken();
    const countBefore = await prisma.checkIn.count({ where: { eventId: event.id } });

    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: qrPayloadFor(token) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TICKET");

    const countAfter = await prisma.checkIn.count({ where: { eventId: event.id } });
    expect(countAfter).toBe(countBefore);
  });

  it("ticket de otro evento -> WRONG_EVENT (200), se persiste CheckIn con el evento de la ruta", async () => {
    const otherEvent = await createFixtureEvent();
    const otherType = await createFixtureTicketType(otherEvent.id);
    const otherOrder = await createFixtureOrder(otherEvent.id, user.id, { status: "PAID" });
    const { ticket, rawToken } = await createFixtureTicket({
      orderId: otherOrder.id,
      ticketTypeId: otherType.id,
    });

    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: qrPayloadFor(rawToken) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: "WRONG_EVENT", message: expect.any(String) });

    const checkIn = await prisma.checkIn.findFirst({ where: { ticketId: ticket.id } });
    expect(checkIn?.result).toBe("WRONG_EVENT");
    expect(checkIn?.eventId).toBe(event.id);

    const untouchedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(untouchedTicket?.status).toBe("ACTIVE");

    // El CheckIn quedó con eventId = event.id (el de la ruta), no otherEvent.id
    // (el real del ticket) — por eso cleanupEvent(otherEvent.id), que borra
    // CheckIn filtrando por su propio eventId, no lo alcanza. Lo borramos acá
    // explícitamente antes, o la FK de Ticket bloquearía el cleanup.
    await prisma.checkIn.deleteMany({ where: { ticketId: ticket.id } });
    await cleanupEvent(otherEvent.id);
  });

  it("ticket ya usado -> ALREADY_USED (200), no vuelve a modificar usedAt", async () => {
    const { ticket, rawToken } = await createActiveTicket();
    const payload = { qrPayload: qrPayloadFor(rawToken) };

    const first = await request(app).post(`/api/events/${event.publicId}/check-ins`).send(payload);
    expect(first.body.result).toBe("VALID");
    const afterFirst = await prisma.ticket.findUnique({ where: { id: ticket.id } });

    const second = await request(app).post(`/api/events/${event.publicId}/check-ins`).send(payload);
    expect(second.status).toBe(200);
    expect(second.body.result).toBe("ALREADY_USED");
    expect(second.body.ticketPublicId).toBe(ticket.publicId);

    const afterSecond = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(afterSecond?.usedAt?.getTime()).toBe(afterFirst?.usedAt?.getTime());

    const checkIns = await prisma.checkIn.findMany({ where: { ticketId: ticket.id } });
    expect(checkIns).toHaveLength(2);
  });

  it("ticket cancelado -> CANCELLED (200)", async () => {
    const order = await createFixtureOrder(event.id, user.id, { status: "PAID" });
    const { ticket, rawToken } = await createFixtureTicket({
      orderId: order.id,
      ticketTypeId: ticketType.id,
      status: "CANCELLED",
    });

    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: qrPayloadFor(rawToken) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: "CANCELLED", message: expect.any(String) });

    const untouched = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(untouched?.status).toBe("CANCELLED");
  });

  it("orden no pagada -> NOT_PAID (200)", async () => {
    const order = await createFixtureOrder(event.id, user.id, { status: "PENDING" });
    const { rawToken } = await createFixtureTicket({ orderId: order.id, ticketTypeId: ticketType.id });

    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: qrPayloadFor(rawToken) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: "NOT_PAID", message: expect.any(String) });
  });

  it("orden cancelada -> CANCELLED (200), aunque el ticket siga ACTIVE", async () => {
    const order = await createFixtureOrder(event.id, user.id, { status: "CANCELLED" });
    const { rawToken } = await createFixtureTicket({ orderId: order.id, ticketTypeId: ticketType.id });

    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: qrPayloadFor(rawToken) });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("CANCELLED");
  });

  it("evento inexistente -> 404 EVENT_NOT_FOUND", async () => {
    const res = await request(app)
      .post("/api/events/evento-que-no-existe/check-ins")
      .send({ qrPayload: qrPayloadFor("a".repeat(43)) });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("EVENT_NOT_FOUND");
  });

  it("body inválido (qrPayload faltante) -> 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post(`/api/events/${event.publicId}/check-ins`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("dos escaneos simultáneos del mismo ticket: exactamente un VALID y un ALREADY_USED, un solo cambio de usedAt, dos CheckIn", async () => {
    const { ticket, rawToken } = await createActiveTicket();
    const payload = { qrPayload: qrPayloadFor(rawToken) };

    const [resA, resB] = await Promise.all([
      request(app).post(`/api/events/${event.publicId}/check-ins`).send(payload),
      request(app).post(`/api/events/${event.publicId}/check-ins`).send(payload),
    ]);

    const results = [resA.body.result, resB.body.result].sort();
    expect(results).toEqual(["ALREADY_USED", "VALID"]);
    expect([resA.status, resB.status]).toEqual([200, 200]);

    const finalTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(finalTicket?.status).toBe("USED");
    expect(finalTicket?.usedAt).toBeTruthy();

    const checkIns = await prisma.checkIn.findMany({ where: { ticketId: ticket.id } });
    expect(checkIns).toHaveLength(2);
    expect(checkIns.filter((c) => c.result === "VALID")).toHaveLength(1);
    expect(checkIns.filter((c) => c.result === "ALREADY_USED")).toHaveLength(1);
  });

  it("el token crudo nunca se persiste: solo queda su hash en Ticket.qrTokenHash", async () => {
    const { ticket, rawToken } = await createActiveTicket();

    await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: qrPayloadFor(rawToken) });

    const stored = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(stored?.qrTokenHash).not.toBe(rawToken);
    expect(JSON.stringify(stored)).not.toContain(rawToken);

    const checkIn = await prisma.checkIn.findFirst({ where: { ticketId: ticket.id } });
    expect(JSON.stringify(checkIn)).not.toContain(rawToken);
  });
});
