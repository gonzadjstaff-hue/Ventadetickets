import { createHmac, randomUUID } from "node:crypto";

import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PaymentResponse } from "../src/integrations/payments/mercadoPago/mercadoPagoClient.js";
import { cleanupEvent, cleanupUserByEmail, createFixtureEvent, createFixtureOrder, createFixtureOrderItem, createFixtureTicketType, createFixtureUser } from "./helpers/fixtures.js";

/**
 * A diferencia de mercadoPagoWebhook.test.ts (que mockea todo
 * `mercadoPagoProvider`, incluido `verifyWebhookSignature`), este archivo NO
 * mockea la validación de firma: deja `verifySignature` real — desde este
 * bloque, delega en la implementación propia (`webhookSignature.ts`, no ya
 * en el validador del SDK oficial, ver docs/DECISIONS.md) — y solo reemplaza
 * `getPayment`/`createPreference`/`getPreference` (las llamadas de red) en
 * `mercadoPagoClient.ts`. Ejercita de punta a punta: Controller →
 * Provider.verifyWebhookSignature → validador propio, con headers/body
 * representativos de un webhook real de Mercado Pago (`type=payment`,
 * `action=payment.updated`, `data.id=<payment_id>`, `x-signature`/
 * `x-request-id` firmados con el algoritmo documentado), no un simulador.
 * Este es el gap que dejaba pasar por alto una firma real rechazada mientras
 * las pruebas contra el provider mockeado seguían en verde.
 */

const { mockGetPayment } = vi.hoisted(() => ({
  mockGetPayment: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("../src/integrations/payments/mercadoPago/mercadoPagoClient.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/integrations/payments/mercadoPago/mercadoPagoClient.js")>();
  return {
    ...actual,
    // `verifySignature` NO se sobreescribe: queda la implementación real.
    getPayment: mockGetPayment,
    createPreference: vi.fn(),
    getPreference: vi.fn(),
  };
});

const WEBHOOK_SECRET = "real-signature-test-secret";

process.env.ENABLE_MERCADOPAGO_CHECKOUT = "true";
process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-dummy-access-token";
process.env.MERCADOPAGO_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.APP_PUBLIC_URL = "https://app.example.test";
process.env.BACKEND_PUBLIC_URL = "https://api.example.test";

const { createApp } = await import("../src/app.js");
const { prisma } = await import("../src/shared/prisma.js");

const app: Express = createApp();

function buildManifest(dataId: string, requestId: string, ts: string): string {
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

function signHeader(dataId: string, requestId: string, ts: string, secret = WEBHOOK_SECRET): string {
  const hash = createHmac("sha256", secret).update(buildManifest(dataId, requestId, ts)).digest("hex");
  return `ts=${ts},v1=${hash}`;
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

/**
 * Se mockea `getPayment` a nivel de `mercadoPagoClient.ts` (no de
 * `mercadoPagoProvider.ts`, como en mercadoPagoWebhook.test.ts) — así que la
 * forma cruda que hay que devolver acá es la del SDK (`PaymentResponse`:
 * `id`, `status`, `transaction_amount`, `currency_id`, `external_reference`,
 * `live_mode`, `date_approved`, `payment_method_id`), no la `NormalizedPayment`
 * ya normalizada — `mercadoPagoProvider.ts` sigue siendo real y hace esa
 * normalización, ejercitada de punta a punta por este archivo.
 */
function fakeRawPayment(overrides: Partial<PaymentResponse> = {}): PaymentResponse {
  return {
    id: randomUUID().replace(/-/g, "").slice(0, 10),
    status: "approved",
    transaction_amount: 35000,
    currency_id: "ARS",
    external_reference: null,
    live_mode: false,
    date_approved: new Date().toISOString(),
    payment_method_id: "visa",
    ...overrides,
  } as PaymentResponse;
}

/**
 * Body representativo de una notificación real de payment.updated (fuente:
 * docs/API.md / docs/DECISIONS.md, formato documentado por Mercado Pago) —
 * no el body mínimo que arma mercadoPagoWebhook.test.ts para las otras
 * pruebas, sino todos los campos que Mercado Pago manda realmente. `id` es
 * lo que el controller usa como clave de dedup (`String(body.id)`, ver
 * PaymentWebhookEvent.externalEventId) — se genera random (no un contador
 * incremental) porque la base de test (`tickets_test`) persiste entre
 * corridas de la suite: un contador reiniciado en cada import del módulo
 * volvería a usar los mismos valores que una corrida anterior ya dejó
 * marcados como `processed`, dando un falso "ya procesado".
 */
function realisticWebhookBody(_notificationId: string, dataId: string) {
  return {
    id: randomUUID(),
    live_mode: false,
    type: "payment",
    date_created: new Date().toISOString(),
    application_id: 1234567890123456,
    user_id: 987654321,
    version: 1,
    api_version: "v1",
    action: "payment.updated",
    data: { id: dataId },
  };
}

describe("POST /api/webhooks/mercadopago — firma real (SDK sin mockear)", () => {
  let event: Awaited<ReturnType<typeof createFixtureEvent>>;
  let vipIndividual: Awaited<ReturnType<typeof createFixtureTicketType>>;
  let user: Awaited<ReturnType<typeof createFixtureUser>>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    event = await createFixtureEvent();
    vipIndividual = await createFixtureTicketType(event.id, { name: "VIP Individual", price: 35000, ticketsPerUnit: 1 });
    user = await createFixtureUser();
  });

  beforeEach(() => {
    mockGetPayment.mockReset();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  afterAll(async () => {
    await cleanupEvent(event.id);
    await cleanupUserByEmail(user.email);
    await prisma.$disconnect();
  });

  async function createPendingOrder(attendeeNames: string[]) {
    const order = await createFixtureOrder(event.id, user.id, {
      status: "PENDING",
      currency: "ARS",
      subtotal: vipIndividual.price,
      total: vipIndividual.price,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    await createFixtureOrderItem(order.id, vipIndividual.id, {
      unitPrice: vipIndividual.price,
      subtotal: vipIndividual.price,
      attendeeNames,
    });
    return order;
  }

  function allLoggedText(): string {
    return [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].map((call) => call.map((arg) => JSON.stringify(arg)).join(" ")).join("\n");
  }

  it("firma real válida, payment approved con external_reference/amount/currency/live_mode correctos: PENDING → PAID", async () => {
    const order = await createPendingOrder(["Ada Lovelace"]);
    const paymentId = randomUUID();
    const notificationId = randomUUID();
    const ts = nowSeconds();
    const xSignature = signHeader(paymentId, "req-" + notificationId, ts);
    mockGetPayment.mockResolvedValue(fakeRawPayment({ id: paymentId, external_reference: order.publicId, transaction_amount: 35000 }));

    const res = await request(app)
      .post("/api/webhooks/mercadopago")
      .query({ "data.id": paymentId, type: "payment" })
      .set("x-signature", xSignature)
      .set("x-request-id", "req-" + notificationId)
      .send(realisticWebhookBody(notificationId, paymentId));

    expect(res.status).toBe(200);
    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(dbOrder?.status).toBe("PAID");

    const logged = allLoggedText();
    expect(logged).toContain("resultado de validación de firma: válida");
    expect(logged).toContain("notificación procesada");
    // Nunca se loguea el x-signature crudo ni el secret.
    expect(logged).not.toContain(xSignature);
    expect(logged).not.toContain(WEBHOOK_SECRET);
    // Tampoco el email del comprador ni nombres de asistentes.
    expect(logged).not.toContain(user.email);
    expect(logged).not.toContain("Ada Lovelace");
  });

  it("firma real inválida (HMAC firmado con un secret incorrecto): 401, nunca consulta el pago, motivo logueado sin exponer el secret", async () => {
    const paymentId = randomUUID();
    const notificationId = randomUUID();
    const ts = nowSeconds();
    const xSignature = signHeader(paymentId, "req-" + notificationId, ts, "secret-que-no-es-el-configurado");

    const res = await request(app)
      .post("/api/webhooks/mercadopago")
      .query({ "data.id": paymentId, type: "payment" })
      .set("x-signature", xSignature)
      .set("x-request-id", "req-" + notificationId)
      .send(realisticWebhookBody(notificationId, paymentId));

    expect(res.status).toBe(401);
    expect(mockGetPayment).not.toHaveBeenCalled();

    const logged = allLoggedText();
    expect(logged).toContain("firma inválida");
    expect(logged).toContain("signature_mismatch");
    expect(logged).not.toContain(WEBHOOK_SECRET);
    expect(logged).not.toContain(xSignature);
  });

  it("header x-signature ausente (webhook sin firmar): 401, motivo missing_signature_header logueado", async () => {
    const paymentId = randomUUID();
    const notificationId = randomUUID();

    const res = await request(app)
      .post("/api/webhooks/mercadopago")
      .query({ "data.id": paymentId, type: "payment" })
      .send(realisticWebhookBody(notificationId, paymentId));

    expect(res.status).toBe(401);
    expect(mockGetPayment).not.toHaveBeenCalled();
    expect(allLoggedText()).toContain("missing_signature_header");
  });

  it("firma real válida pero external_reference no corresponde a ninguna orden: 200, ignorado, motivo logueado (no se pierde silenciosamente)", async () => {
    const paymentId = randomUUID();
    const notificationId = randomUUID();
    const ts = nowSeconds();
    const xSignature = signHeader(paymentId, "req-" + notificationId, ts);
    mockGetPayment.mockResolvedValue(fakeRawPayment({ id: paymentId, external_reference: "orden-inexistente" }));

    const res = await request(app)
      .post("/api/webhooks/mercadopago")
      .query({ "data.id": paymentId, type: "payment" })
      .set("x-signature", xSignature)
      .set("x-request-id", "req-" + notificationId)
      .send(realisticWebhookBody(notificationId, paymentId));

    expect(res.status).toBe(200);
    const logged = allLoggedText();
    expect(logged).toContain("ninguna orden coincide con external_reference");
    expect(logged).toContain("orden-inexistente");
  });

  it("firma real válida pero falla la consulta server-to-server del pago (404 del proveedor): 502, error logueado (no oculto)", async () => {
    const { PaymentProviderError } = await import("../src/integrations/payments/types.js");
    const paymentId = randomUUID();
    const notificationId = randomUUID();
    const ts = nowSeconds();
    const xSignature = signHeader(paymentId, "req-" + notificationId, ts);
    mockGetPayment.mockRejectedValueOnce(new PaymentProviderError("not_found", "no existe"));

    const res = await request(app)
      .post("/api/webhooks/mercadopago")
      .query({ "data.id": paymentId, type: "payment" })
      .set("x-signature", xSignature)
      .set("x-request-id", "req-" + notificationId)
      .send(realisticWebhookBody(notificationId, paymentId));

    expect(res.status).toBe(502);
    const logged = allLoggedText();
    expect(logged).toContain("error procesando la notificación");
    expect(logged).toContain("not_found");
  });

  it("data.id ausente en la query, presente solo en el body: se usa el del body para firmar y para consultar el pago", async () => {
    const order = await createPendingOrder(["Ada Lovelace"]);
    const paymentId = randomUUID();
    const notificationId = randomUUID();
    const ts = nowSeconds();
    // Firmado con el dataId que va a ir en el body — la query nunca lleva "data.id" en este caso.
    const xSignature = signHeader(paymentId, "req-" + notificationId, ts);
    mockGetPayment.mockResolvedValue(fakeRawPayment({ id: paymentId, external_reference: order.publicId, transaction_amount: 35000 }));

    const res = await request(app)
      .post("/api/webhooks/mercadopago")
      .query({ type: "payment" }) // sin "data.id"
      .set("x-signature", xSignature)
      .set("x-request-id", "req-" + notificationId)
      .send(realisticWebhookBody(notificationId, paymentId));

    expect(res.status).toBe(200);
    expect(mockGetPayment).toHaveBeenCalledWith(paymentId);
    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(dbOrder?.status).toBe("PAID");

    const logged = allLoggedText();
    // JSON.stringify omite las claves con valor undefined — "dataIdFromQuery"
    // directamente no aparece cuando la query no traía "data.id".
    expect(logged).not.toContain('"dataIdFromQuery"');
    expect(logged).toContain(`"dataIdFromBody":"${paymentId}"`);
  });

  it("data.id presente en query Y en body con valores distintos: prioriza el de la query (documentado) tanto para firmar como para consultar", async () => {
    const order = await createPendingOrder(["Ada Lovelace"]);
    const queryPaymentId = randomUUID();
    const bodyPaymentId = randomUUID(); // deliberadamente distinto
    const notificationId = randomUUID();
    const ts = nowSeconds();
    // Firmado con el dataId de la QUERY — si el código usara el del body, la firma no matchearía y daría 401.
    const xSignature = signHeader(queryPaymentId, "req-" + notificationId, ts);
    mockGetPayment.mockResolvedValue(fakeRawPayment({ id: queryPaymentId, external_reference: order.publicId, transaction_amount: 35000 }));

    const res = await request(app)
      .post("/api/webhooks/mercadopago")
      .query({ "data.id": queryPaymentId, type: "payment" })
      .set("x-signature", xSignature)
      .set("x-request-id", "req-" + notificationId)
      .send({ ...realisticWebhookBody(notificationId, bodyPaymentId), data: { id: bodyPaymentId } });

    expect(res.status).toBe(200);
    expect(mockGetPayment).toHaveBeenCalledWith(queryPaymentId);
    expect(mockGetPayment).not.toHaveBeenCalledWith(bodyPaymentId);

    const logged = allLoggedText();
    expect(logged).toContain(`"dataIdFromQuery":"${queryPaymentId}"`);
    expect(logged).toContain(`"dataIdFromBody":"${bodyPaymentId}"`);
  });
});
