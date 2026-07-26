import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  cleanupEvent,
  cleanupUserByEmail,
  createFixtureEvent,
  createFixtureOrderItem,
  createFixtureTicketType,
  createFixtureUser,
} from "./helpers/fixtures.js";

/**
 * Archivo dedicado: prueba varias combinaciones de variables de entorno
 * relacionadas a Mercado Pago, cada una con su propio registro de módulos
 * (mismo criterio que checkIn.disabled.test.ts / paymentSimulator.disabled.test.ts).
 * No se mockea el proveedor acá a propósito: si algo estuviera mal
 * configurado y la ruta se montara igual, estos tests fallarían al intentar
 * una llamada real (sin red disponible en tests) en vez de dar un falso
 * verde.
 */
describe("Checkout Pro de Mercado Pago deshabilitado o mal configurado", () => {
  const ENV_KEYS = [
    "ENABLE_MERCADOPAGO_CHECKOUT",
    "MERCADOPAGO_ACCESS_TOKEN",
    "MERCADOPAGO_WEBHOOK_SECRET",
    "APP_PUBLIC_URL",
    "BACKEND_PUBLIC_URL",
  ] as const;
  const originalValues = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let ticketType: Awaited<ReturnType<typeof createFixtureTicketType>>;
  let user: Awaited<ReturnType<typeof createFixtureUser>>;

  beforeAll(async () => {
    event = await createFixtureEvent();
    ticketType = await createFixtureTicketType(event.id, { name: "VIP Individual", price: 35000 });
    user = await createFixtureUser();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
  });

  afterAll(async () => {
    const { prisma } = await import("../src/shared/prisma.js");
    await cleanupEvent(event.id);
    await cleanupUserByEmail(user.email);
    await prisma.$disconnect();
  });

  async function freshApp(): Promise<Express> {
    vi.resetModules();
    const { createApp } = await import("../src/app.js");
    return createApp();
  }

  async function pendingOrderPublicId(): Promise<string> {
    const { prisma } = await import("../src/shared/prisma.js");
    const order = await prisma.order.create({
      data: {
        eventId: event.id,
        userId: user.id,
        status: "PENDING",
        currency: "ARS",
        subtotal: 35000,
        total: 35000,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    await createFixtureOrderItem(order.id, ticketType.id, { unitPrice: 35000, subtotal: 35000, attendeeNames: ["Ada"] });
    return order.publicId;
  }

  it("sin ENABLE_MERCADOPAGO_CHECKOUT (default): las rutas de checkout y webhook no existen (404 estándar), y el backend arranca igual", async () => {
    delete process.env.ENABLE_MERCADOPAGO_CHECKOUT;
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    delete process.env.APP_PUBLIC_URL;
    delete process.env.BACKEND_PUBLIC_URL;

    const app = await freshApp();
    const orderPublicId = await pendingOrderPublicId();

    const checkoutRes = await request(app).post(`/api/events/${event.publicId}/orders/${orderPublicId}/checkout/mercadopago`).send();
    expect(checkoutRes.status).toBe(404);

    const webhookRes = await request(app).post("/api/webhooks/mercadopago").send({});
    expect(webhookRes.status).toBe(404);

    const { prisma } = await import("../src/shared/prisma.js");
    const order = await prisma.order.findUnique({ where: { publicId: orderPublicId } });
    expect(order?.providerPreferenceId).toBeNull();
    expect(order?.status).toBe("PENDING");
  });

  it("ENABLE_MERCADOPAGO_CHECKOUT=true pero sin MERCADOPAGO_ACCESS_TOKEN: sigue deshabilitado (no rompe el arranque)", async () => {
    process.env.ENABLE_MERCADOPAGO_CHECKOUT = "true";
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "secret";
    process.env.APP_PUBLIC_URL = "https://app.example.test";
    process.env.BACKEND_PUBLIC_URL = "https://api.example.test";

    const app = await freshApp();
    const orderPublicId = await pendingOrderPublicId();

    const res = await request(app).post(`/api/events/${event.publicId}/orders/${orderPublicId}/checkout/mercadopago`).send();
    expect(res.status).toBe(404);
  });

  it("ENABLE_MERCADOPAGO_CHECKOUT=true pero sin APP_PUBLIC_URL/BACKEND_PUBLIC_URL: sigue deshabilitado", async () => {
    process.env.ENABLE_MERCADOPAGO_CHECKOUT = "true";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "secret";
    delete process.env.APP_PUBLIC_URL;
    delete process.env.BACKEND_PUBLIC_URL;

    const app = await freshApp();
    const orderPublicId = await pendingOrderPublicId();

    const res = await request(app).post(`/api/events/${event.publicId}/orders/${orderPublicId}/checkout/mercadopago`).send();
    expect(res.status).toBe(404);
  });

  it("sin Mercado Pago disponible, la creación de orden VIP no ofrece mercadoPagoCheckoutAvailable", async () => {
    delete process.env.ENABLE_MERCADOPAGO_CHECKOUT;
    const app = await freshApp();

    const res = await request(app)
      .post(`/api/events/${event.publicId}/orders/vip`)
      .send({
        ticketTypeId: ticketType.id,
        buyer: { name: "Ada Lovelace", email: `disabled-${Date.now()}@test.pulse.local`, whatsapp: "+5491122334455" },
        attendees: [{ name: "Ada Lovelace" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.mercadoPagoCheckoutAvailable).toBeUndefined();

    // Limpieza en el orden que exigen los onDelete: Restrict: primero la
    // Order (y su OrderItem) recién creada, después el User.
    const { prisma } = await import("../src/shared/prisma.js");
    const createdOrder = await prisma.order.findUnique({ where: { publicId: res.body.orderPublicId } });
    if (createdOrder) {
      await prisma.orderItem.deleteMany({ where: { orderId: createdOrder.id } });
      await prisma.order.delete({ where: { id: createdOrder.id } });
    }
    await cleanupUserByEmail(res.body.buyer.email);
  });
});
