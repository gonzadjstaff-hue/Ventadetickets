import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { prisma } from "../src/shared/prisma.js";
import {
  cleanupEvent,
  createFixtureEvent,
  createFixtureOrder,
  createFixtureTicket,
  createFixtureTicketType,
  createFixtureUser,
} from "./helpers/fixtures.js";

/**
 * Archivo dedicado: fuerza ENABLE_MVP_CHECKIN a "false" antes de importar la
 * app, así que necesita su propio registro de módulos (vitest aísla cada
 * archivo de test por defecto). No se puede alternar el flag dentro de
 * checkIn.test.ts porque app.ts ya quedaría cacheado con el valor "true" que
 * fija vitestSetup.ts para el resto de la suite.
 */
describe("POST /api/events/:eventPublicId/check-ins con ENABLE_MVP_CHECKIN deshabilitado", () => {
  let app: Express;
  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let ticketId: string;
  let rawToken: string;
  let user: Awaited<ReturnType<typeof createFixtureUser>>;

  beforeAll(async () => {
    process.env.ENABLE_MVP_CHECKIN = "false";
    const { createApp } = await import("../src/app.js");
    app = createApp();

    event = await createFixtureEvent();
    const ticketType = await createFixtureTicketType(event.id);
    user = await createFixtureUser();
    const order = await createFixtureOrder(event.id, user.id, { status: "PAID" });
    const fixture = await createFixtureTicket({ orderId: order.id, ticketTypeId: ticketType.id });
    ticketId = fixture.ticket.id;
    rawToken = fixture.rawToken;
  });

  afterAll(async () => {
    await cleanupEvent(event.id);
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  it("no procesa la request ni modifica el ticket: la ruta se comporta como inexistente", async () => {
    const res = await request(app)
      .post(`/api/events/${event.publicId}/check-ins`)
      .send({ qrPayload: `pulse-ticket:v1:${rawToken}` });

    expect(res.status).toBe(404);

    const unchanged = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(unchanged?.status).toBe("ACTIVE");
    expect(unchanged?.usedAt).toBeNull();

    const checkInCount = await prisma.checkIn.count({ where: { ticketId } });
    expect(checkInCount).toBe(0);
  });
});
