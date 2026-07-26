import { randomUUID } from "node:crypto";

import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailDeliveryResult } from "../src/integrations/email/types.js";
import type { NormalizedPayment } from "../src/integrations/payments/types.js";
import {
  cleanupEvent,
  cleanupUserByEmail,
  createFixtureEvent,
  createFixtureOrder,
  createFixtureOrderItem,
  createFixtureTicketType,
  createFixtureUser,
} from "./helpers/fixtures.js";

const { mockVerifyWebhookSignature, mockGetPayment, mockedSendGeneralTicketEmail } = vi.hoisted(() => ({
  mockVerifyWebhookSignature: vi.fn<(...args: unknown[]) => boolean>(),
  mockGetPayment: vi.fn<(...args: unknown[]) => Promise<NormalizedPayment>>(),
  mockedSendGeneralTicketEmail: vi.fn<(...args: unknown[]) => Promise<EmailDeliveryResult>>(),
}));

vi.mock("../src/integrations/payments/mercadoPago/mercadoPagoProvider.js", () => ({
  mercadoPagoProvider: {
    name: "mercadopago",
    createCheckoutPreference: vi.fn(),
    getCheckoutPreference: vi.fn(),
    getPayment: mockGetPayment,
    verifyWebhookSignature: mockVerifyWebhookSignature,
  },
}));

// Mockeado por el mismo motivo que en vipOrders.test.ts: no depender de red,
// y poder inspeccionar exactamente con qué datos se llamó.
vi.mock("../src/integrations/email/emailService.js", () => ({
  sendGeneralTicketEmail: mockedSendGeneralTicketEmail,
}));

// Archivo dedicado: activa ENABLE_MERCADOPAGO_CHECKOUT antes de importar la
// app (apagado por defecto en vitestSetup.ts). MERCADOPAGO_ACCESS_TOKEN
// empieza con "TEST-" a propósito: es la convención real de Mercado Pago
// para credenciales de prueba, y hace que `expectedLiveMode()` sea `false`
// en el servicio de webhook — coherente con los pagos de prueba que arman
// los tests de acá (liveMode: false).
process.env.ENABLE_MERCADOPAGO_CHECKOUT = "true";
process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-dummy-access-token";
process.env.MERCADOPAGO_WEBHOOK_SECRET = "dummy-webhook-secret";
process.env.APP_PUBLIC_URL = "https://app.example.test";
process.env.BACKEND_PUBLIC_URL = "https://api.example.test";

const { createApp } = await import("../src/app.js");
const { prisma } = await import("../src/shared/prisma.js");

const app: Express = createApp();

function fakePayment(overrides: Partial<NormalizedPayment> = {}): NormalizedPayment {
  return {
    providerPaymentId: randomUUID(),
    status: "APPROVED",
    rawStatus: "approved",
    amount: 35000,
    currency: "ARS",
    externalReference: null,
    liveMode: false,
    approvedAt: new Date(),
    paymentMethod: "visa",
    ...overrides,
  };
}

async function postWebhook(params: { notificationId: string; dataId: string; type?: string }) {
  return request(app)
    .post("/api/webhooks/mercadopago")
    .query({ "data.id": params.dataId, type: params.type ?? "payment" })
    .set("x-signature", "ts=1700000000,v1=deadbeef")
    .set("x-request-id", "req-" + params.notificationId)
    .send({
      id: params.notificationId,
      type: params.type ?? "payment",
      action: "payment.updated",
      data: { id: params.dataId },
      live_mode: false,
    });
}

describe("POST /api/webhooks/mercadopago", () => {
  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let vipIndividual: Awaited<ReturnType<typeof createFixtureTicketType>>;
  let vipDoble: Awaited<ReturnType<typeof createFixtureTicketType>>;
  let user: Awaited<ReturnType<typeof createFixtureUser>>;

  beforeAll(async () => {
    event = await createFixtureEvent();
    vipIndividual = await createFixtureTicketType(event.id, { name: "VIP Individual", price: 35000, ticketsPerUnit: 1 });
    vipDoble = await createFixtureTicketType(event.id, { name: "VIP Doble", price: 60000, ticketsPerUnit: 2 });
    user = await createFixtureUser();
  });

  beforeEach(() => {
    mockVerifyWebhookSignature.mockReset();
    mockGetPayment.mockReset();
    mockedSendGeneralTicketEmail.mockReset();
    mockVerifyWebhookSignature.mockReturnValue(true);
    mockedSendGeneralTicketEmail.mockResolvedValue({ status: "sent" });
  });

  afterAll(async () => {
    await cleanupEvent(event.id);
    await cleanupUserByEmail(user.email);
    await prisma.$disconnect();
  });

  async function createPendingOrder(
    ticketType: Awaited<ReturnType<typeof createFixtureTicketType>>,
    attendeeNames: string[],
    overrides: Record<string, unknown> = {},
  ) {
    const order = await createFixtureOrder(event.id, user.id, {
      status: "PENDING",
      currency: "ARS",
      subtotal: ticketType.price,
      total: ticketType.price,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      ...overrides,
    });
    await createFixtureOrderItem(order.id, ticketType.id, {
      unitPrice: ticketType.price,
      subtotal: ticketType.price,
      attendeeNames,
    });
    return order;
  }

  describe("firma", () => {
    it("firma inválida: 401, nunca consulta el pago server-to-server", async () => {
      mockVerifyWebhookSignature.mockReturnValue(false);

      const res = await postWebhook({ notificationId: randomUUID(), dataId: "123" });

      expect(res.status).toBe(401);
      expect(mockGetPayment).not.toHaveBeenCalled();
    });
  });

  describe("approved", () => {
    it("aprueba la orden, emite el ticket (VIP Individual) y manda el email una vez", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada Lovelace"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, amount: 35000 }));

      const res = await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      expect(res.status).toBe(200);

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("PAID");
      expect(dbOrder?.paidAt).not.toBeNull();

      const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
      expect(tickets).toHaveLength(1);
      expect(tickets[0].holderName).toBe("Ada Lovelace");

      const payment = await prisma.payment.findUnique({ where: { provider_providerPaymentId: { provider: "mercadopago", providerPaymentId: paymentId } } });
      expect(payment?.status).toBe("APPROVED");
      expect(payment?.orderId).toBe(order.id);

      expect(mockedSendGeneralTicketEmail).toHaveBeenCalledTimes(1);

      const webhookEvent = await prisma.paymentWebhookEvent.findFirst({ where: { provider: "mercadopago", paymentId: payment?.id } });
      expect(webhookEvent?.processed).toBe(true);
      expect(webhookEvent?.processedAt).not.toBeNull();
      expect(webhookEvent?.orderId).toBe(order.id);
    });

    it("VIP Doble: emite 2 tickets con nombres correctos y manda 2 emails", async () => {
      const order = await createPendingOrder(vipDoble, ["Ada", "Grace"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, amount: 60000 }));

      const res = await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      expect(res.status).toBe(200);
      const tickets = await prisma.ticket.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
      expect(tickets).toHaveLength(2);
      expect(tickets.map((t) => t.holderName)).toEqual(["Ada", "Grace"]);
      expect(new Set(tickets.map((t) => t.qrTokenHash)).size).toBe(2);
      expect(mockedSendGeneralTicketEmail).toHaveBeenCalledTimes(2);
    });

    it("in_process se normaliza como pending: no emite tickets, Order sigue PENDING", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, status: "PENDING", rawStatus: "in_process" }));

      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("PENDING");
      expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(0);
    });

    it("no emite tickets sobre una orden ya vencida (expiresAt pasado): expiración perezosa se aplica antes de aprobar", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"], { expiresAt: new Date(Date.now() - 1000) });
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId }));

      const res = await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      expect(res.status).toBe(200);
      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("EXPIRED");
      expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(0);
      expect(mockedSendGeneralTicketEmail).not.toHaveBeenCalled();
    });

    it("fallo al enviar el email no revierte Payment/Order/Ticket", async () => {
      mockedSendGeneralTicketEmail.mockRejectedValueOnce(new Error("proveedor de email caído"));
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId }));

      const res = await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      expect(res.status).toBe(200);
      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("PAID");
      expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(1);
    });
  });

  describe("rejected / cancelled", () => {
    it("rejected: Payment REJECTED, Order sigue PENDING (permite reintento), sin tickets", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, status: "REJECTED", rawStatus: "rejected" }));

      const res = await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      expect(res.status).toBe(200);
      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("PENDING");
      const payment = await prisma.payment.findUnique({ where: { provider_providerPaymentId: { provider: "mercadopago", providerPaymentId: paymentId } } });
      expect(payment?.status).toBe("REJECTED");
      expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(0);
    });

    it("cancelled: Order pasa a CANCELLED", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, status: "CANCELLED", rawStatus: "cancelled" }));

      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("CANCELLED");
      expect(dbOrder?.cancelledAt).not.toBeNull();
    });
  });

  describe("refunded / charged_back", () => {
    it("refunded sobre una orden ya PAID: pasa a REFUNDED y los tickets ACTIVE quedan REFUNDED", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId }));
      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, status: "REFUNDED", rawStatus: "refunded" }));
      const res = await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      expect(res.status).toBe(200);
      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("REFUNDED");
      const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
      expect(tickets.every((t) => t.status === "REFUNDED")).toBe(true);
    });

    it("charged_back se normaliza igual que refunded", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId }));
      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, status: "REFUNDED", rawStatus: "charged_back" }));
      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("REFUNDED");
    });

    it("tickets ya USED no se tocan al refundar", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId }));
      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      const ticket = await prisma.ticket.findFirstOrThrow({ where: { orderId: order.id } });
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "USED", usedAt: new Date() } });

      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, status: "REFUNDED", rawStatus: "refunded" }));
      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe("USED");
    });
  });

  describe("validaciones server-to-server", () => {
    it("external_reference que no corresponde a ninguna orden: ignora, no crea Payment, responde 200", async () => {
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: "orden-que-no-existe" }));

      const res = await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      expect(res.status).toBe(200);
      expect(await prisma.payment.count({ where: { providerPaymentId: paymentId } })).toBe(0);
    });

    it("importe distinto al de la orden: ignora, no aprueba, no crea Payment", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, amount: 1 }));

      const res = await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      expect(res.status).toBe(200);
      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("PENDING");
      expect(await prisma.payment.count({ where: { providerPaymentId: paymentId } })).toBe(0);
    });

    it("moneda distinta a la de la orden: ignora, no aprueba", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, currency: "USD" }));

      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("PENDING");
    });

    it("live_mode incoherente con el entorno de prueba (true cuando se esperaba false): ignora, no aprueba", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId, liveMode: true }));

      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("PENDING");
      expect(await prisma.payment.count({ where: { providerPaymentId: paymentId } })).toBe(0);
    });

    it("un webhook que aprueba una orden no afecta a otra orden PENDING distinta del mismo comprador", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const otherOrder = await createPendingOrder(vipIndividual, ["Grace"]);
      const paymentId = randomUUID();
      // El payment real apunta a otherOrder; se verifica que order (ajena a este pago) nunca se ve afectada.
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: otherOrder.publicId }));

      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe("PENDING");
      const dbOtherOrder = await prisma.order.findUnique({ where: { id: otherOrder.id } });
      expect(dbOtherOrder?.status).toBe("PAID");
    });
  });

  describe("payment inexistente / error del proveedor", () => {
    it("payment id inexistente en Mercado Pago (404 del proveedor): respuesta controlada, no 200 silencioso", async () => {
      const { PaymentProviderError } = await import("../src/integrations/payments/types.js");
      mockGetPayment.mockRejectedValueOnce(new PaymentProviderError("not_found", "no existe"));

      const res = await postWebhook({ notificationId: randomUUID(), dataId: "no-existe" });

      expect(res.status).toBe(502);
    });
  });

  describe("idempotencia y concurrencia", () => {
    it("evento duplicado (mismo notificationId dos veces): la segunda vez no vuelve a consultar el pago", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      const notificationId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId }));

      const first = await postWebhook({ notificationId, dataId: paymentId });
      expect(first.status).toBe(200);
      expect(mockGetPayment).toHaveBeenCalledTimes(1);

      const second = await postWebhook({ notificationId, dataId: paymentId });
      expect(second.status).toBe(200);
      expect(mockGetPayment).toHaveBeenCalledTimes(1); // no se volvió a llamar

      expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(1);
      expect(mockedSendGeneralTicketEmail).toHaveBeenCalledTimes(1);
    });

    it("approved repetido con notificationId distinto (reenvío) no duplica tickets ni Payment", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId }));

      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });
      const second = await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      expect(second.status).toBe(200);
      expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(1);
      expect(await prisma.payment.count({ where: { providerPaymentId: paymentId } })).toBe(1);
      expect(mockedSendGeneralTicketEmail).toHaveBeenCalledTimes(1);
    });

    it("dos webhooks concurrentes para el mismo pago aprobado no duplican tickets", async () => {
      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId }));

      const [resA, resB] = await Promise.all([
        postWebhook({ notificationId: randomUUID(), dataId: paymentId }),
        postWebhook({ notificationId: randomUUID(), dataId: paymentId }),
      ]);

      expect([resA.status, resB.status]).toEqual([200, 200]);
      expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(1);
      expect(await prisma.payment.count({ where: { providerPaymentId: paymentId } })).toBe(1);
    });
  });

  describe("seguridad de logs", () => {
    it("no loguea el token crudo del ticket emitido", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const order = await createPendingOrder(vipIndividual, ["Ada"]);
      const paymentId = randomUUID();
      mockGetPayment.mockResolvedValue(fakePayment({ providerPaymentId: paymentId, externalReference: order.publicId }));
      await postWebhook({ notificationId: randomUUID(), dataId: paymentId });

      const ticket = await prisma.ticket.findFirstOrThrow({ where: { orderId: order.id } });
      const loggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((call) => call.join(" ")).join(" ");
      expect(loggedText).not.toContain(ticket.qrTokenHash);

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
