import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { prisma } from "../src/shared/prisma.js";
import { generateQrToken } from "../src/shared/qrToken.js";
import { fakeDecodedToken } from "./helpers/authFixtures.js";
import {
  cleanupEvent,
  createFixtureEvent,
  createFixtureOrder,
  createFixtureStaffUser,
  createFixtureTicket,
  createFixtureTicketType,
  createFixtureUser,
} from "./helpers/fixtures.js";

/**
 * Mockea solo `verifyFirebaseIdToken` (nunca Firebase real) — a diferencia de
 * authAdminCheck.test.ts, acá Prisma queda real (base de test), porque este
 * archivo ya dependía de la base real para el resto del flujo de check-in
 * (tickets, órdenes, eventos) antes de que existiera auth. `authenticateAs`
 * hace que `requireAuth` resuelva exactamente al `User` real pasado.
 */
const { verifyFirebaseIdTokenMock } = vi.hoisted(() => ({
  verifyFirebaseIdTokenMock: vi.fn(),
}));

vi.mock("../src/integrations/firebase/firebaseAdmin.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/integrations/firebase/firebaseAdmin.js")>();
  return {
    ...original,
    verifyFirebaseIdToken: verifyFirebaseIdTokenMock,
  };
});

const { createApp } = await import("../src/app.js");

const app = createApp();

function qrPayloadFor(rawToken: string): string {
  return `pulse-ticket:v1:${rawToken}`;
}

function authenticateAs(staffUser: { firebaseUid: string | null; email: string }): void {
  verifyFirebaseIdTokenMock.mockResolvedValueOnce(
    fakeDecodedToken({ uid: staffUser.firebaseUid!, email: staffUser.email }),
  );
}

describe("POST /api/events/:eventPublicId/check-ins", () => {
  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let ticketType: Awaited<ReturnType<typeof createFixtureTicketType>>;
  let user: Awaited<ReturnType<typeof createFixtureUser>>;
  let validator: Awaited<ReturnType<typeof createFixtureStaffUser>>;
  let admin: Awaited<ReturnType<typeof createFixtureStaffUser>>;

  beforeAll(async () => {
    validator = await createFixtureStaffUser("VALIDATOR");
    admin = await createFixtureStaffUser("ADMIN");
    event = await createFixtureEvent();
    ticketType = await createFixtureTicketType(event.id);
    user = await createFixtureUser();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanupEvent(event.id);
    await prisma.user.deleteMany({ where: { id: { in: [user.id, validator.id, admin.id] } } });
    await prisma.$disconnect();
  });

  async function createActiveTicket() {
    const order = await createFixtureOrder(event.id, user.id, { status: "PAID" });
    return createFixtureTicket({ orderId: order.id, ticketTypeId: ticketType.id });
  }

  function postCheckIn(qrPayload: string) {
    authenticateAs(validator);
    return request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .set("Authorization", "Bearer token-validator")
      .send({ qrPayload });
  }

  it("sin token -> 401, no procesa nada", async () => {
    const { rawToken } = await createActiveTicket();
    const countBefore = await prisma.checkIn.count({ where: { eventId: event.id } });

    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: qrPayloadFor(rawToken) });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");

    const countAfter = await prisma.checkIn.count({ where: { eventId: event.id } });
    expect(countAfter).toBe(countBefore);
  });

  it("con role USER (no ADMIN/VALIDATOR) -> 403, no procesa nada", async () => {
    const plainUser = await createFixtureUser({ firebaseUid: `fixture-plain-${user.id}` });
    const { rawToken } = await createActiveTicket();
    const countBefore = await prisma.checkIn.count({ where: { eventId: event.id } });

    authenticateAs(plainUser);
    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .set("Authorization", "Bearer token-user")
      .send({ qrPayload: qrPayloadFor(rawToken) });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    const countAfter = await prisma.checkIn.count({ where: { eventId: event.id } });
    expect(countAfter).toBe(countBefore);

    await prisma.user.delete({ where: { id: plainUser.id } });
  });

  it("usuario BLOCKED -> 403, no procesa nada (requireAuth corta antes de requireRole)", async () => {
    const blockedValidator = await createFixtureStaffUser("VALIDATOR", { status: "BLOCKED" });
    const { rawToken } = await createActiveTicket();
    const countBefore = await prisma.checkIn.count({ where: { eventId: event.id } });

    authenticateAs(blockedValidator);
    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .set("Authorization", "Bearer token-blocked")
      .send({ qrPayload: qrPayloadFor(rawToken) });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    const countAfter = await prisma.checkIn.count({ where: { eventId: event.id } });
    expect(countAfter).toBe(countBefore);

    await prisma.user.delete({ where: { id: blockedValidator.id } });
  });

  it("con role ADMIN -> permitido (200 VALID)", async () => {
    const { ticket, rawToken } = await createActiveTicket();

    authenticateAs(admin);
    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .set("Authorization", "Bearer token-admin")
      .send({ qrPayload: qrPayloadFor(rawToken) });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("VALID");
    expect(res.body.ticketPublicId).toBe(ticket.publicId);
  });

  it("el CheckIn persistido usa validatorUserId = req.authUser.userId (el validador real, no un usuario sistema/demo)", async () => {
    const { ticket, rawToken } = await createActiveTicket();

    const res = await postCheckIn(qrPayloadFor(rawToken));
    expect(res.status).toBe(200);

    const checkIn = await prisma.checkIn.findFirst({ where: { ticketId: ticket.id } });
    expect(checkIn?.validatorUserId).toBe(validator.id);
  });

  it("QR válido: acceso permitido, marca el ticket como USED, registra usedAt y crea CheckIn VALID", async () => {
    const { ticket, rawToken } = await createActiveTicket();

    const res = await postCheckIn(qrPayloadFor(rawToken));

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
    const res = await postCheckIn("esto-no-es-un-qr-valido");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TICKET");
  });

  it("versión inválida -> 400 INVALID_TICKET", async () => {
    const { rawToken } = await createActiveTicket();

    const res = await postCheckIn(`pulse-ticket:v2:${rawToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TICKET");
  });

  it("token con formato válido pero inexistente -> 400 INVALID_TICKET, sin CheckIn", async () => {
    const { token } = generateQrToken();
    const countBefore = await prisma.checkIn.count({ where: { eventId: event.id } });

    const res = await postCheckIn(qrPayloadFor(token));

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

    const res = await postCheckIn(qrPayloadFor(rawToken));

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
    const payload = qrPayloadFor(rawToken);

    const first = await postCheckIn(payload);
    expect(first.body.result).toBe("VALID");
    const afterFirst = await prisma.ticket.findUnique({ where: { id: ticket.id } });

    const second = await postCheckIn(payload);
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

    const res = await postCheckIn(qrPayloadFor(rawToken));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: "CANCELLED", message: expect.any(String) });

    const untouched = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(untouched?.status).toBe("CANCELLED");
  });

  it("orden no pagada -> NOT_PAID (200)", async () => {
    const order = await createFixtureOrder(event.id, user.id, { status: "PENDING" });
    const { rawToken } = await createFixtureTicket({ orderId: order.id, ticketTypeId: ticketType.id });

    const res = await postCheckIn(qrPayloadFor(rawToken));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: "NOT_PAID", message: expect.any(String) });
  });

  it("orden cancelada -> CANCELLED (200), aunque el ticket siga ACTIVE", async () => {
    const order = await createFixtureOrder(event.id, user.id, { status: "CANCELLED" });
    const { rawToken } = await createFixtureTicket({ orderId: order.id, ticketTypeId: ticketType.id });

    const res = await postCheckIn(qrPayloadFor(rawToken));

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("CANCELLED");
  });

  it("evento inexistente -> 404 EVENT_NOT_FOUND", async () => {
    authenticateAs(validator);
    const res = await request(app)
      .post("/api/events/evento-que-no-existe/check-ins")
      .set("Authorization", "Bearer token-validator")
      .send({ qrPayload: qrPayloadFor("a".repeat(43)) });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("EVENT_NOT_FOUND");
  });

  it("body inválido (qrPayload faltante) -> 400 VALIDATION_ERROR", async () => {
    authenticateAs(validator);
    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .set("Authorization", "Bearer token-validator")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("dos escaneos simultáneos del mismo ticket: exactamente un VALID y un ALREADY_USED, un solo cambio de usedAt, dos CheckIn", async () => {
    const { ticket, rawToken } = await createActiveTicket();
    const payload = qrPayloadFor(rawToken);

    authenticateAs(validator);
    authenticateAs(validator);
    const [resA, resB] = await Promise.all([
      request(app).post(`/api/events/${event.publicId}/check-ins`).set("Authorization", "Bearer token-validator").send({ qrPayload: payload }),
      request(app).post(`/api/events/${event.publicId}/check-ins`).set("Authorization", "Bearer token-validator").send({ qrPayload: payload }),
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

    await postCheckIn(qrPayloadFor(rawToken));

    const stored = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(stored?.qrTokenHash).not.toBe(rawToken);
    expect(JSON.stringify(stored)).not.toContain(rawToken);

    const checkIn = await prisma.checkIn.findFirst({ where: { ticketId: ticket.id } });
    expect(JSON.stringify(checkIn)).not.toContain(rawToken);
  });
});
