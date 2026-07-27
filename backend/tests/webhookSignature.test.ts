import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyMercadoPagoWebhookSignature } from "../src/integrations/payments/mercadoPago/webhookSignature.js";

/**
 * Tests unitarios de la implementación propia del validador de firma
 * (`webhookSignature.ts`), sin pasar por Express ni por el SDK — vectores
 * propios del algoritmo documentado por Mercado Pago (manifest
 * `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`, HMAC-SHA256 hex,
 * comparación timing-safe). Complementa (no reemplaza)
 * `mercadoPagoSignature.test.ts` (que sigue probando el mismo contrato a
 * través de `verifySignature`/`mercadoPagoClient.ts`) y
 * `mercadoPagoWebhookRealSignature.test.ts` (que prueba el flujo HTTP
 * completo). Ver docs/DECISIONS.md sobre por qué se reemplazó el validador
 * del SDK por esta implementación.
 */

const SECRET = "webhook-signature-unit-test-secret";

function buildManifest(dataId: string | undefined, requestId: string | undefined, ts: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return parts.join(";") + ";";
}

function sign(dataId: string | undefined, requestId: string | undefined, ts: string, secret = SECRET): string {
  const hash = createHmac("sha256", secret).update(buildManifest(dataId, requestId, ts)).digest("hex");
  return `ts=${ts},v1=${hash}`;
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

describe("verifyMercadoPagoWebhookSignature", () => {
  describe("firma válida", () => {
    it("formato representativo (data.id numérico, x-request-id presente, secret correcto) se acepta", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", "req-abc", ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-abc", dataId: "123456789", secret: SECRET });

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("regresión: el data.id real visto en producción (170718289792, puramente numérico) valida correctamente firmado", () => {
      // Ver SESSION_HANDOFF.md / docs/DECISIONS.md: evidencia real de
      // producción, type=payment, action=payment.created, dataId=170718289792,
      // rechazado con SignatureMismatch por el validador anterior (del SDK).
      // Este vector confirma que el algoritmo propio, con este dataId exacto,
      // computa y compara el HMAC correctamente cuando la firma es genuina.
      const dataId = "170718289792";
      const ts = nowSeconds();
      const xRequestId = "8f3b2b1a-6e9c-4a2d-9c3e-1f2a3b4c5d6e";
      const xSignature = sign(dataId, xRequestId, ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId, dataId, secret: SECRET });

      expect(result.valid).toBe(true);
      expect(result.manifest).toBe(`id:${dataId};request-id:${xRequestId};ts:${ts};`);
    });

    it("el manifiesto final devuelto coincide exactamente con el formato documentado (id:...;request-id:...;ts:...;)", () => {
      const ts = nowSeconds();
      const xSignature = sign("999", "req-xyz", ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-xyz", dataId: "999", secret: SECRET });

      expect(result.manifest).toBe(`id:999;request-id:req-xyz;ts:${ts};`);
    });

    it("dataId con espacios alrededor se recorta antes de firmar (coincide con el valor ya trimeado)", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", "req-abc", ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-abc", dataId: "  123456789  ", secret: SECRET });

      expect(result.valid).toBe(true);
      expect(result.dataId).toBe("123456789");
    });

    it("x-request-id con espacios alrededor se recorta antes de firmar", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", "req-abc", ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "  req-abc  ", dataId: "123456789", secret: SECRET });

      expect(result.valid).toBe(true);
      expect(result.xRequestId).toBe("req-abc");
    });

    it("dataId llega como array (query string con la clave repetida): usa el primer valor, igual que x-request-id", () => {
      const ts = nowSeconds();
      const xSignature = sign("170718289792", "req-abc", ts);

      const result = verifyMercadoPagoWebhookSignature({
        xSignature,
        xRequestId: "req-abc",
        dataId: ["170718289792", "999999999"],
        secret: SECRET,
      });

      expect(result.valid).toBe(true);
      expect(result.dataId).toBe("170718289792");
    });

    it("x-request-id llega como array (header repetido): usa el primer valor", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", "req-primero", ts);

      const result = verifyMercadoPagoWebhookSignature({
        xSignature,
        xRequestId: ["req-primero", "req-segundo"],
        dataId: "123456789",
        secret: SECRET,
      });

      expect(result.valid).toBe(true);
      expect(result.xRequestId).toBe("req-primero");
    });

    it("dataId numérico convertido a string de forma segura (sin notación científica ni pérdida de precisión) para un id de 12 dígitos", () => {
      const rawNumericId = 170718289792; // dentro de Number.MAX_SAFE_INTEGER, representativo de un payment id real
      const dataId = String(rawNumericId);
      const ts = nowSeconds();
      const xSignature = sign(dataId, "req-abc", ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-abc", dataId, secret: SECRET });

      expect(result.valid).toBe(true);
      expect(result.dataId).toBe("170718289792");
      expect(result.dataId).not.toContain("e+"); // nunca notación científica
    });

    it("firma sin dataId: el manifiesto omite el par 'id:' (no se incluye vacío)", () => {
      const ts = nowSeconds();
      const xSignature = sign(undefined, "req-abc", ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-abc", dataId: undefined, secret: SECRET });

      expect(result.valid).toBe(true);
      expect(result.manifest).toBe(`request-id:req-abc;ts:${ts};`);
      // No debe empezar con un par "id:" propio (distinto de "request-id:", que sí es válido acá).
      expect(result.manifest?.startsWith("id:")).toBe(false);
    });

    it("firma sin x-request-id: el manifiesto omite el par 'request-id:'", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", undefined, ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: undefined, dataId: "123456789", secret: SECRET });

      expect(result.valid).toBe(true);
      expect(result.manifest).toBe(`id:123456789;ts:${ts};`);
      expect(result.manifest).not.toContain("request-id:");
    });
  });

  describe("firma inválida — motivo exacto, nunca ambiguo", () => {
    it("secret incorrecto: signature_mismatch", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", "req-abc", ts, "secret-equivocado");

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-abc", dataId: "123456789", secret: SECRET });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("signature_mismatch");
    });

    it("dataId distinto al firmado: signature_mismatch", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", "req-abc", ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-abc", dataId: "otro-id", secret: SECRET });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("signature_mismatch");
    });

    it("xRequestId distinto al firmado: signature_mismatch", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", "req-abc", ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-distinto", dataId: "123456789", secret: SECRET });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("signature_mismatch");
    });

    it("hash manipulado (un carácter distinto): signature_mismatch", () => {
      const ts = nowSeconds();
      const valid = sign("123456789", "req-abc", ts);
      const tampered = valid.slice(0, -1) + (valid.endsWith("0") ? "1" : "0");

      const result = verifyMercadoPagoWebhookSignature({ xSignature: tampered, xRequestId: "req-abc", dataId: "123456789", secret: SECRET });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("signature_mismatch");
    });

    it("header x-signature ausente: missing_signature_header", () => {
      const result = verifyMercadoPagoWebhookSignature({ xSignature: undefined, xRequestId: "req-abc", dataId: "123456789", secret: SECRET });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("missing_signature_header");
    });

    it("header vacío (solo espacios): missing_signature_header", () => {
      const result = verifyMercadoPagoWebhookSignature({ xSignature: "   ", xRequestId: "req-abc", dataId: "123456789", secret: SECRET });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("missing_signature_header");
    });

    it("header sin el formato esperado (ni ts= ni v1=): malformed_signature_header", () => {
      const result = verifyMercadoPagoWebhookSignature({
        xSignature: "no-tiene-el-formato-esperado",
        xRequestId: "req-abc",
        dataId: "123456789",
        secret: SECRET,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("malformed_signature_header");
    });

    it("header con v1 pero sin ts: missing_timestamp", () => {
      const result = verifyMercadoPagoWebhookSignature({
        xSignature: "v1=deadbeef",
        xRequestId: "req-abc",
        dataId: "123456789",
        secret: SECRET,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("missing_timestamp");
    });

    it("header con ts pero sin v1 (versión de firma no soportada): missing_hash", () => {
      const ts = nowSeconds();
      const result = verifyMercadoPagoWebhookSignature({
        xSignature: `ts=${ts},v2=deadbeef`,
        xRequestId: "req-abc",
        dataId: "123456789",
        secret: SECRET,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("missing_hash");
    });

    it("ts con caracteres no numéricos: malformed_signature_header", () => {
      const result = verifyMercadoPagoWebhookSignature({
        xSignature: "ts=abc123,v1=deadbeef",
        xRequestId: "req-abc",
        dataId: "123456789",
        secret: SECRET,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("malformed_signature_header");
    });
  });

  describe("seguridad: nunca expone el secret ni un hash completo en el resultado", () => {
    it("el resultado nunca incluye un campo con el hash completo (recibido o calculado), solo `hasV1` booleano", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", "req-abc", ts);

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-abc", dataId: "123456789", secret: SECRET });

      expect(typeof result.hasV1).toBe("boolean");
      const keys = Object.keys(result);
      expect(keys).not.toContain("v1");
      expect(keys).not.toContain("hash");
      expect(keys).not.toContain("computedHash");
      expect(keys).not.toContain("secret");
      // El manifiesto no contiene el secret (solo ids/timestamps, ver arriba) — confirmado indirectamente por su formato exacto ya probado.
    });

    it("una firma inválida por secret incorrecto tampoco filtra el secret correcto en ningún campo del resultado", () => {
      const ts = nowSeconds();
      const xSignature = sign("123456789", "req-abc", ts, "otro-secret");

      const result = verifyMercadoPagoWebhookSignature({ xSignature, xRequestId: "req-abc", dataId: "123456789", secret: SECRET });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(SECRET);
    });
  });
});
