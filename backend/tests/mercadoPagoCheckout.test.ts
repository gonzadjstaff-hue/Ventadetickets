import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupEvent,
  cleanupUserByEmail,
  createFixtureEvent,
  createFixtureOrder,
  createFixtureOrderItem,
  createFixtureTicketType,
  createFixtureUser,
} from "./helpers/fixtures.js";

const { mockCreateCheckoutPreference, mockGetCheckoutPreference } = vi.hoisted(() => ({
  mockCreateCheckoutPreference: vi.fn(),
  mockGetCheckoutPreference: vi.fn(),
}));

// Nunca se llama al SDK real ni se sale a la red: se reemplaza el proveedor
// entero por mocks controlados. `paymentProviderRegistry.ts` importa
// `mercadoPagoProvider` de este mismo módulo, así que interceptarlo acá
// alcanza para todo el endpoint.
vi.mock("../src/integrations/payments/mercadoPago/mercadoPagoProvider.js", () => ({
  mercadoPagoProvider: {
    name: "mercadopago",
    createCheckoutPreference: mockCreateCheckoutPreference,
    getCheckoutPreference: mockGetCheckoutPreference,
    getPayment: vi.fn(),
    verifyWebhookSignature: vi.fn(),
  },
}));

// Archivo dedicado: necesita su propio registro de módulos porque activa
// ENABLE_MERCADOPAGO_CHECKOUT (apagado por defecto en vitestSetup.ts) antes
// de importar la app — mismo patrón que vipOrders.test.ts con el simulador.
process.env.ENABLE_MERCADOPAGO_CHECKOUT = "true";
process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-dummy-access-token";
process.env.MERCADOPAGO_WEBHOOK_SECRET = "dummy-webhook-secret";
process.env.APP_PUBLIC_URL = "https://app.example.test";
process.env.BACKEND_PUBLIC_URL = "https://api.example.test";

const { createApp } = await import("../src/app.js");
const { prisma } = await import("../src/shared/prisma.js");
const { PaymentProviderError } = await import("../src/integrations/payments/types.js");

const app = createApp();

const FAKE_PREFERENCE = {
  providerPreferenceId: "pref-123",
  initPoint: "https://www.mercadopago.com/checkout/init-point",
  sandboxInitPoint: "https://sandbox.mercadopago.com/checkout/init-point",
};

describe("POST /api/events/:eventPublicId/orders/:orderPublicId/checkout/mercadopago", () => {
  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let vipIndividual: Awaited<ReturnType<typeof createFixtureTicketType>>;
  let user: Awaited<ReturnType<typeof createFixtureUser>>;

  beforeAll(async () => {
    event = await createFixtureEvent();
    vipIndividual = await createFixtureTicketType(event.id, { name: "VIP Individual", price: 35000, ticketsPerUnit: 1 });
    user = await createFixtureUser();
  });

  beforeEach(() => {
    mockCreateCheckoutPreference.mockReset();
    mockGetCheckoutPreference.mockReset();
    mockCreateCheckoutPreference.mockResolvedValue(FAKE_PREFERENCE);
  });

  afterAll(async () => {
    await cleanupEvent(event.id);
    await cleanupUserByEmail(user.email);
    await prisma.$disconnect();
  });

  async function createPendingOrder(overrides: Record<string, unknown> = {}) {
    const order = await createFixtureOrder(event.id, user.id, {
      status: "PENDING",
      currency: "ARS",
      subtotal: 35000,
      total: 35000,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      ...overrides,
    });
    await createFixtureOrderItem(order.id, vipIndividual.id, { unitPrice: 35000, subtotal: 35000, attendeeNames: ["Ada Lovelace"] });
    return order;
  }

  function checkoutUrl(orderPublicId: string): string {
    return `/api/events/${event.publicId}/orders/${orderPublicId}/checkout/mercadopago`;
  }

  it("orden PENDING válida: 201, devuelve la URL de sandbox (modo prueba), persiste providerPreferenceId", async () => {
    const order = await createPendingOrder();

    const res = await request(app).post(checkoutUrl(order.publicId)).send();

    expect(res.status).toBe(201);
    expect(res.body.checkoutUrl).toBe(FAKE_PREFERENCE.sandboxInitPoint);
    expect(res.body.preferenceId).toBe(FAKE_PREFERENCE.providerPreferenceId);
    expect(res.body.orderPublicId).toBe(order.publicId);
    expect(res.body).not.toHaveProperty("initPoint");
    expect(res.body).not.toHaveProperty("accessToken");

    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(dbOrder?.providerPreferenceId).toBe(FAKE_PREFERENCE.providerPreferenceId);
    expect(dbOrder?.paymentProvider).toBe("mercadopago");
    expect(dbOrder?.externalReference).toBe(order.publicId);
  });

  it("arma la preferencia con external_reference/back_urls/notification_url correctos, y toma el importe de la base", async () => {
    const order = await createPendingOrder();

    await request(app).post(checkoutUrl(order.publicId)).send({ total: 1, currency: "USD", title: "monto hackeado" });

    expect(mockCreateCheckoutPreference).toHaveBeenCalledTimes(1);
    const callArg = mockCreateCheckoutPreference.mock.calls[0][0];
    expect(callArg.externalReference).toBe(order.publicId);
    expect(callArg.unitPrice).toBe(35000);
    expect(callArg.currency).toBe("ARS");
    expect(callArg.backUrls.success).toBe(`https://app.example.test/checkout/return?orderPublicId=${order.publicId}`);
    expect(callArg.backUrls.success).toBe(callArg.backUrls.pending);
    expect(callArg.backUrls.success).toBe(callArg.backUrls.failure);
    expect(callArg.notificationUrl).toBe("https://api.example.test/api/webhooks/mercadopago");
  });

  it("no crea ningún Payment al pedir la preferencia (el Payment nace recién en el webhook)", async () => {
    const order = await createPendingOrder();
    await request(app).post(checkoutUrl(order.publicId)).send();

    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("orden inexistente: 404 ORDER_NOT_FOUND", async () => {
    const res = await request(app).post(checkoutUrl("orden-que-no-existe")).send();
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
    expect(mockCreateCheckoutPreference).not.toHaveBeenCalled();
  });

  it("orden de otro evento: 404 ORDER_NOT_FOUND", async () => {
    const order = await createPendingOrder();
    const otherEvent = await createFixtureEvent();

    const res = await request(app).post(`/api/events/${otherEvent.publicId}/orders/${order.publicId}/checkout/mercadopago`).send();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
    await cleanupEvent(otherEvent.id);
  });

  it("orden ya PAID: 409 ORDER_ALREADY_PAID, no crea otra preferencia", async () => {
    const order = await createPendingOrder({ status: "PAID" });

    const res = await request(app).post(checkoutUrl(order.publicId)).send();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ORDER_ALREADY_PAID");
    expect(mockCreateCheckoutPreference).not.toHaveBeenCalled();
  });

  it("orden CANCELLED: 400 ORDER_CANCELLED", async () => {
    const order = await createPendingOrder({ status: "CANCELLED" });

    const res = await request(app).post(checkoutUrl(order.publicId)).send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ORDER_CANCELLED");
    expect(mockCreateCheckoutPreference).not.toHaveBeenCalled();
  });

  it("orden vencida (expiresAt pasado): aplica expiración perezosa y responde 409 ORDER_EXPIRED", async () => {
    const order = await createPendingOrder({ expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app).post(checkoutUrl(order.publicId)).send();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ORDER_EXPIRED");
    expect(mockCreateCheckoutPreference).not.toHaveBeenCalled();

    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(dbOrder?.status).toBe("EXPIRED");
  });

  it("repetir la solicitud sobre la misma orden reutiliza la preferencia existente (no crea una nueva)", async () => {
    const order = await createPendingOrder();

    const first = await request(app).post(checkoutUrl(order.publicId)).send();
    expect(first.status).toBe(201);
    expect(mockCreateCheckoutPreference).toHaveBeenCalledTimes(1);

    mockGetCheckoutPreference.mockResolvedValueOnce(FAKE_PREFERENCE);
    const second = await request(app).post(checkoutUrl(order.publicId)).send();

    expect(second.status).toBe(201);
    expect(second.body.preferenceId).toBe(FAKE_PREFERENCE.providerPreferenceId);
    expect(mockCreateCheckoutPreference).toHaveBeenCalledTimes(1); // sigue en 1: no se volvió a llamar
    expect(mockGetCheckoutPreference).toHaveBeenCalledWith(FAKE_PREFERENCE.providerPreferenceId);
  });

  it("si la preferencia guardada ya no existe del lado de Mercado Pago, crea una nueva (reemplazo explícito)", async () => {
    const order = await createPendingOrder();
    await request(app).post(checkoutUrl(order.publicId)).send();
    mockCreateCheckoutPreference.mockClear();

    mockGetCheckoutPreference.mockResolvedValueOnce(null);
    mockCreateCheckoutPreference.mockResolvedValueOnce({ ...FAKE_PREFERENCE, providerPreferenceId: "pref-456" });

    const res = await request(app).post(checkoutUrl(order.publicId)).send();

    expect(res.status).toBe(201);
    expect(res.body.preferenceId).toBe("pref-456");
    expect(mockCreateCheckoutPreference).toHaveBeenCalledTimes(1);
  });

  it("timeout del proveedor: 504 controlado, sin exponer el error crudo", async () => {
    mockCreateCheckoutPreference.mockRejectedValueOnce(new PaymentProviderError("timeout", "boom"));
    const order = await createPendingOrder();

    const res = await request(app).post(checkoutUrl(order.publicId)).send();

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe("MERCADOPAGO_PROVIDER_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("boom");
  });

  it("error 5xx del proveedor: respuesta controlada 502", async () => {
    mockCreateCheckoutPreference.mockRejectedValueOnce(new PaymentProviderError("server_error", "fallo interno de Mercado Pago"));
    const order = await createPendingOrder();

    const res = await request(app).post(checkoutUrl(order.publicId)).send();

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("MERCADOPAGO_PROVIDER_ERROR");
  });
});
