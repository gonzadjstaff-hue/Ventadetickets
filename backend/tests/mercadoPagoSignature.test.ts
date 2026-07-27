import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reproduce de forma independiente el algoritmo oficial de x-signature
 * documentado por Mercado Pago (Payment notifications / signature
 * validation de Checkout Pro, fecha de consulta 2026-07-25): manifest
 * `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`, HMAC-SHA256 en hexadecimal,
 * header con forma `ts=<ts>,v1=<hash>`. No importa el mismo algoritmo desde
 * el código de producción — arma la firma "a mano" para verificar que
 * `verifySignature` (que delega en la implementación propia de
 * `webhookSignature.ts`, no en el SDK — ver docs/DECISIONS.md) acepta y
 * rechaza exactamente lo que la documentación dice que debería.
 */
const SECRET = "test-webhook-secret-vectors";

function buildManifest(dataId: string, requestId: string, ts: string): string {
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

function sign(dataId: string, requestId: string, ts: string, secret = SECRET): string {
  const hash = createHmac("sha256", secret).update(buildManifest(dataId, requestId, ts)).digest("hex");
  return `ts=${ts},v1=${hash}`;
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

async function importVerifySignature() {
  vi.resetModules();
  return (await import("../src/integrations/payments/mercadoPago/mercadoPagoClient.js")).verifySignature;
}

describe("verifySignature — vectores propios del algoritmo oficial de x-signature", () => {
  const ORIGINAL_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    else process.env.MERCADOPAGO_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  it("firma válida (manifest + HMAC-SHA256 hex correctos) se acepta", async () => {
    const verifySignature = await importVerifySignature();
    const ts = nowSeconds();
    const xSignature = sign("123456789", "req-abc", ts);

    expect(verifySignature({ xSignature, xRequestId: "req-abc", dataId: "123456789" })).toBe(true);
  });

  it("hash correcto pero dataId distinto al firmado se rechaza", async () => {
    const verifySignature = await importVerifySignature();
    const ts = nowSeconds();
    const xSignature = sign("123456789", "req-abc", ts);

    expect(verifySignature({ xSignature, xRequestId: "req-abc", dataId: "otro-payment-id" })).toBe(false);
  });

  it("hash correcto pero xRequestId distinto al firmado se rechaza", async () => {
    const verifySignature = await importVerifySignature();
    const ts = nowSeconds();
    const xSignature = sign("123456789", "req-abc", ts);

    expect(verifySignature({ xSignature, xRequestId: "req-distinto", dataId: "123456789" })).toBe(false);
  });

  it("hash calculado con un secret incorrecto se rechaza", async () => {
    const verifySignature = await importVerifySignature();
    const ts = nowSeconds();
    const xSignature = sign("123456789", "req-abc", ts, "secret-equivocado");

    expect(verifySignature({ xSignature, xRequestId: "req-abc", dataId: "123456789" })).toBe(false);
  });

  it("hash manipulado (un carácter distinto) se rechaza", async () => {
    const verifySignature = await importVerifySignature();
    const ts = nowSeconds();
    const valid = sign("123456789", "req-abc", ts);
    const tampered = valid.slice(0, -1) + (valid.endsWith("0") ? "1" : "0");

    expect(verifySignature({ xSignature: tampered, xRequestId: "req-abc", dataId: "123456789" })).toBe(false);
  });

  it("header x-signature ausente se rechaza", async () => {
    const verifySignature = await importVerifySignature();
    expect(verifySignature({ xSignature: undefined, xRequestId: "req-abc", dataId: "123456789" })).toBe(false);
  });

  it("header x-request-id ausente (pero incluido en el manifest firmado) se rechaza si no coincide", async () => {
    const verifySignature = await importVerifySignature();
    const ts = nowSeconds();
    const xSignature = sign("123456789", "req-abc", ts);

    expect(verifySignature({ xSignature, xRequestId: undefined, dataId: "123456789" })).toBe(false);
  });

  it("formato de x-signature inválido (sin ts=/v1=) se rechaza", async () => {
    const verifySignature = await importVerifySignature();
    expect(verifySignature({ xSignature: "no-tiene-el-formato-esperado", xRequestId: "req-abc", dataId: "123456789" })).toBe(false);
  });

  it("timestamp viejo pero con hash genuinamente válido se acepta (sin ventana de tolerancia — ver nota en mercadoPagoClient.ts / webhookSignature.ts)", async () => {
    // La implementación propia (webhookSignature.ts, ver docs/DECISIONS.md)
    // no implementa ninguna ventana de tolerancia contra replay a propósito
    // (mismo criterio que ya regía con el validador del SDK, que además
    // tenía un bug real ahí — comparaba `ts` en segundos contra `Date.now()`
    // en milisegundos sin convertir). Este test documenta el comportamiento
    // actual (acepta timestamps viejos) — no una ventana de tolerancia
    // deseada; la protección contra replay sigue mitigada solo por la
    // idempotencia de `PaymentWebhookEvent`.
    const verifySignature = await importVerifySignature();
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600); // 1 hora atrás
    const xSignature = sign("123456789", "req-abc", oldTs);

    expect(verifySignature({ xSignature, xRequestId: "req-abc", dataId: "123456789" })).toBe(true);
  });

  it("sin MERCADOPAGO_WEBHOOK_SECRET configurado, rechaza sin intentar validar nada", async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    const verifySignature = await importVerifySignature();
    const ts = nowSeconds();
    // Firmado con un secret que ni siquiera existe en el entorno.
    const xSignature = sign("123456789", "req-abc", ts, "cualquier-secret");

    expect(verifySignature({ xSignature, xRequestId: "req-abc", dataId: "123456789" })).toBe(false);
  });
});
