import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validador HMAC propio del `x-signature` de webhooks de Mercado Pago —
 * implementación mínima y auditada del algoritmo documentado (manifest
 * `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`, HMAC-SHA256 en hex,
 * comparación timing-safe), sin depender de `WebhookSignatureValidator` del
 * SDK oficial (`mercadopago` npm).
 *
 * Motivo (ver docs/DECISIONS.md): la versión instalada del SDK ya tuvo dos
 * bugs reales en esta función exacta dentro del mismo major — el ya
 * documentado de `toleranceSeconds` (compara segundos contra milisegundos
 * sin convertir) y uno de mayúsculas/minúsculas en `data.id` corregido recién
 * el 2026-06-23 (PR mercadopago/sdk-nodejs#439, ya incluido en la versión
 * 3.2.1 instalada). Con ese historial en una dependencia de código cerrado
 * para una app, se prefiere una implementación propia de ~30 líneas,
 * enteramente auditable y con visibilidad total en cada paso (necesaria para
 * diagnosticar el `SignatureMismatch` real de producción, ver
 * SESSION_HANDOFF.md), en vez de seguir dependiendo de una caja negra que ya
 * demostró tener bugs sutiles en esta función específica.
 *
 * Nunca debilita la validación: mismo algoritmo documentado, mismo rigor
 * (comparación timing-safe, longitud verificada antes de comparar).
 */

export type SignatureFailureReason =
  | "missing_signature_header"
  | "malformed_signature_header"
  | "missing_timestamp"
  | "missing_hash"
  | "signature_mismatch";

export interface SignatureValidationResult {
  valid: boolean;
  reason?: SignatureFailureReason;
  /**
   * Componentes ya normalizados del manifiesto, para loguear sin exponer
   * nunca el secret ni un hash completo (ni el `v1` recibido ni el
   * calculado) — ver mercadoPagoClient.ts, único lugar que loguea esto.
   */
  ts?: string;
  dataId?: string;
  xRequestId?: string;
  manifest?: string;
  /** Si el header traía un componente `v1=...` reconocible (sin exponer su valor). */
  hasV1: boolean;
}

/**
 * Igual criterio que el validador oficial: toma el primer valor si llega un
 * array (header/query repetido), recorta espacios, y trata "" como ausente.
 * Nunca hace `.toLowerCase()` — Mercado Pago firma con el casing original de
 * cada valor (ver PR mercadopago/sdk-nodejs#439 citado arriba).
 */
function normalize(value: string | string[] | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseXSignature(header: string): { ts?: string; v1?: string } {
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (!key || !value) continue;
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  return { ts, v1 };
}

/** `id:<dataId>;request-id:<xRequestId>;ts:<ts>;` — un par se omite si su valor está ausente, nunca se incluye vacío. */
function buildManifest(dataId: string | undefined, xRequestId: string | undefined, ts: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (xRequestId) parts.push(`request-id:${xRequestId}`);
  parts.push(`ts:${ts}`);
  return parts.join(";") + ";";
}

/** `timingSafeEqual` lanza si los buffers tienen longitud distinta — se chequea antes, como hace el propio SDK. */
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function verifyMercadoPagoWebhookSignature(input: {
  xSignature: string | string[] | undefined;
  xRequestId: string | string[] | undefined;
  dataId: string | string[] | undefined;
  secret: string;
}): SignatureValidationResult {
  const xSignature = normalize(input.xSignature);
  if (!xSignature) return { valid: false, reason: "missing_signature_header", hasV1: false };

  const { ts, v1 } = parseXSignature(xSignature);
  if (!ts && !v1) return { valid: false, reason: "malformed_signature_header", hasV1: false };
  if (!ts) return { valid: false, reason: "missing_timestamp", hasV1: v1 !== undefined };
  if (!/^\d+$/.test(ts)) return { valid: false, reason: "malformed_signature_header", ts, hasV1: v1 !== undefined };
  if (!v1) return { valid: false, reason: "missing_hash", ts, hasV1: false };

  const dataId = normalize(input.dataId);
  const xRequestId = normalize(input.xRequestId);
  const manifest = buildManifest(dataId, xRequestId, ts);
  const computedHash = createHmac("sha256", input.secret).update(manifest).digest("hex");

  const valid = timingSafeHexEqual(computedHash, v1);
  return {
    valid,
    reason: valid ? undefined : "signature_mismatch",
    ts,
    dataId,
    xRequestId,
    manifest,
    hasV1: true,
  };
}
