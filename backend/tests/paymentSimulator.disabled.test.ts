import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { prisma } from "../src/shared/prisma.js";
import { cleanupEvent, createFixtureEvent, createFixtureOrder, createFixtureOrderItem, createFixtureTicketType, createFixtureUser } from "./helpers/fixtures.js";

/**
 * Archivo dedicado: fuerza ENABLE_MVP_PAYMENT_SIMULATOR a "false" antes de
 * importar la app, así que necesita su propio registro de módulos (vitest
 * aísla cada archivo de test). Mismo patrón que checkIn.disabled.test.ts.
 */
describe("POST /api/dev/orders/:orderPublicId/simulate-payment con ENABLE_MVP_PAYMENT_SIMULATOR deshabilitado", () => {
  let app: Express;
  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let orderPublicId: string;

  beforeAll(async () => {
    process.env.ENABLE_MVP_PAYMENT_SIMULATOR = "false";
    const { createApp } = await import("../src/app.js");
    app = createApp();

    event = await createFixtureEvent();
    const ticketType = await createFixtureTicketType(event.id, { name: "VIP Individual", price: 35000 });
    const user = await createFixtureUser();
    const order = await createFixtureOrder(event.id, user.id, {
      status: "PENDING",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    await createFixtureOrderItem(order.id, ticketType.id, { attendeeNames: ["Ada"] });
    orderPublicId = order.publicId;
  });

  afterAll(async () => {
    await cleanupEvent(event.id);
    await prisma.$disconnect();
  });

  it("responde 404 (la ruta no está montada) y no modifica la orden", async () => {
    const res = await request(app).post(`/api/dev/orders/${orderPublicId}/simulate-payment`).send({ result: "approved" });

    expect(res.status).toBe(404);

    const unchanged = await prisma.order.findUnique({ where: { publicId: orderPublicId } });
    expect(unchanged?.status).toBe("PENDING");

    const ticketCount = await prisma.ticket.count({ where: { order: { publicId: orderPublicId } } });
    expect(ticketCount).toBe(0);
  });
});
