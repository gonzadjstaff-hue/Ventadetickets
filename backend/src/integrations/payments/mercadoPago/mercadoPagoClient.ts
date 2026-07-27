import { MercadoPagoConfig, Payment, Preference } from "mercadopago";

import { env } from "../../../config/env.js";
import { PaymentProviderError } from "../types.js";
import { verifyMercadoPagoWebhookSignature } from "./webhookSignature.js";

/**
 * El paquete "mercadopago" solo exporta las clases (`Preference`, `Payment`,
 * ...) desde su raíz, no sus tipos de request/response — esos viven en rutas
 * internas de `dist/clients/**` que no forman parte de la API pública del
 * paquete. En vez de importarlos por una ruta interna (frágil: podría
 * cambiar de estructura entre versiones sin ser un breaking change de la API
 * pública), se derivan acá con utility types de TypeScript a partir de la
 * firma real de los métodos públicos de las clases — quedan sincronizados
 * automáticamente con cualquier versión del SDK que se instale.
 */
export type PreferenceRequest = NonNullable<Parameters<InstanceType<typeof Preference>["create"]>[0]>["body"];
export type PreferenceResponse = Awaited<ReturnType<InstanceType<typeof Preference>["create"]>>;
export type PaymentResponse = Awaited<ReturnType<InstanceType<typeof Payment>["get"]>>;

/**
 * Único punto del backend que importa el SDK de "mercadopago" directamente.
 * `mercadoPagoProvider.ts` solo conoce esta capa, nunca el SDK crudo — ver
 * docs/DECISIONS.md sobre la elección de SDK oficial vs fetch a mano.
 */
function buildConfig(): MercadoPagoConfig {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new PaymentProviderError("unknown", "Mercado Pago no está configurado (falta MERCADOPAGO_ACCESS_TOKEN).");
  }
  return new MercadoPagoConfig({
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
    options: { timeout: env.MERCADOPAGO_REQUEST_TIMEOUT_MS },
  });
}

/**
 * El cliente REST interno del SDK lanza el body JSON de la respuesta cuando
 * el status no es 2xx (no una clase de error propia), y deja propagar el
 * `AbortError` nativo de `fetch`/`AbortController` en un timeout — ver el
 * código fuente de `src/utils/restClient` en el SDK (docs/DECISIONS.md,
 * fecha de consulta 2026-07-25). Esta función traduce ambos casos a
 * `PaymentProviderError` con un `kind` estable para que el resto del backend
 * nunca tenga que inspeccionar la forma cruda del error.
 */
function classifyError(error: unknown): PaymentProviderError {
  if (error instanceof PaymentProviderError) return error;

  // AbortError: DOMException (o similar) por timeout de fetch. Se chequea
  // `.name` en vez de `instanceof Error` — mismo motivo que con
  // navigator.share() en el frontend (DOMException no siempre extiende Error).
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "AbortError") {
    return new PaymentProviderError("timeout", "Tiempo de espera agotado al contactar a Mercado Pago.", error);
  }

  const status = extractStatus(error);
  if (status === 401 || status === 403) {
    return new PaymentProviderError("unauthorized", "Mercado Pago rechazó las credenciales configuradas.", error);
  }
  if (status === 404) {
    return new PaymentProviderError("not_found", "Mercado Pago no encontró el recurso solicitado.", error);
  }
  if (status === 429) {
    return new PaymentProviderError("rate_limited", "Mercado Pago aplicó rate limiting a la solicitud.", error);
  }
  if (typeof status === "number" && status >= 500) {
    return new PaymentProviderError("server_error", "Mercado Pago devolvió un error de servidor.", error);
  }

  return new PaymentProviderError("unknown", "Fallo inesperado al comunicarse con Mercado Pago.", error);
}

function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as Record<string, unknown>;
  const status = candidate.status ?? candidate.statusCode ?? (candidate.cause as Record<string, unknown> | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}

export async function createPreference(body: PreferenceRequest, idempotencyKey: string): Promise<PreferenceResponse> {
  try {
    const preference = new Preference(buildConfig());
    return await preference.create({ body, requestOptions: { idempotencyKey } });
  } catch (error) {
    throw classifyError(error);
  }
}

export async function getPreference(providerPreferenceId: string): Promise<PreferenceResponse | null> {
  try {
    const preference = new Preference(buildConfig());
    return await preference.get({ preferenceId: providerPreferenceId });
  } catch (error) {
    const classified = classifyError(error);
    if (classified.kind === "not_found") return null;
    throw classified;
  }
}

export async function getPayment(providerPaymentId: string): Promise<PaymentResponse> {
  try {
    const payment = new Payment(buildConfig());
    return await payment.get({ id: providerPaymentId });
  } catch (error) {
    throw classifyError(error);
  }
}

/**
 * Nunca hace red: valida localmente el HMAC-SHA256 del manifest
 * `id:<dataId>;request-id:<xRequestId>;ts:<ts>;` contra el secret, con
 * comparación timing-safe. Implementación propia (`webhookSignature.ts`), no
 * el validador del SDK oficial — ver el comentario al inicio de ese archivo
 * para el porqué (dos bugs reales encontrados en esta función exacta del SDK
 * dentro del mismo major: un bug de `toleranceSeconds` que rechazaba
 * cualquier webhook real por comparar segundos contra milisegundos sin
 * convertir, y uno de mayúsculas/minúsculas en `data.id` corregido recién el
 * 2026-06-23 en mercadopago/sdk-nodejs#439). Mismo algoritmo documentado por
 * Mercado Pago, mismo rigor — nunca se debilita ni se saltea la validación.
 * Igual que antes, la implementación propia tampoco implementa una ventana
 * de tolerancia contra replay (no hay parámetro `toleranceSeconds` acá): se
 * sigue mitigando solo con la idempotencia de `PaymentWebhookEvent` — mismo
 * trade-off ya documentado, no algo nuevo de este cambio.
 *
 * **Logging temporal de diagnóstico** (componentes normalizados del
 * manifiesto, nunca el secret ni un hash completo) mientras se termina de
 * confirmar la causa de un `SignatureMismatch` visto en producción con un
 * webhook real — ver docs/DECISIONS.md. Se puede reducir a solo el `reason`
 * una vez confirmado y estable.
 */
export function verifySignature(input: { xSignature: string | undefined; xRequestId: string | undefined; dataId: string | undefined }): boolean {
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    // Falta de configuración, no un webhook falsificado — se distingue en el
    // log para no confundir "nadie intentó autenticarse" con "faltó cargar
    // la variable en el entorno" (ver docs/DEPLOYMENT.md, MERCADOPAGO_WEBHOOK_SECRET).
    console.error("[mercadopago_webhook] MERCADOPAGO_WEBHOOK_SECRET no está configurado: firma rechazada sin validar.");
    return false;
  }

  const result = verifyMercadoPagoWebhookSignature({
    xSignature: input.xSignature,
    xRequestId: input.xRequestId,
    dataId: input.dataId,
    secret: env.MERCADOPAGO_WEBHOOK_SECRET,
  });

  // Nunca se loguea `input.xSignature` (el header crudo, incluye el hash
  // recibido) ni el secret ni ningún hash completo (ni el recibido ni el
  // calculado) — solo si el manifiesto tuvo un componente v1 reconocible.
  const logFields = {
    reason: result.reason,
    ts: result.ts,
    dataId: result.dataId,
    xRequestId: result.xRequestId,
    manifest: result.manifest,
    hasV1: result.hasV1,
  };

  if (result.valid) {
    console.log("[mercadopago_webhook] firma válida", logFields);
  } else {
    console.warn("[mercadopago_webhook] firma inválida", logFields);
  }

  return result.valid;
}
