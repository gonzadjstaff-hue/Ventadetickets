import { InvalidWebhookSignatureError, MercadoPagoConfig, Payment, Preference, WebhookSignatureValidator } from "mercadopago";

import { env } from "../../../config/env.js";
import { PaymentProviderError } from "../types.js";

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
 * comparación timing-safe (`crypto.timingSafeEqual`) — delegado al validador
 * oficial del SDK en vez de reimplementar el algoritmo a mano, para no
 * arriesgar un desvío sutil del formato exacto documentado por Mercado Pago
 * (docs/DECISIONS.md, fecha de consulta 2026-07-25).
 *
 * **No se usa `toleranceSeconds`** (ventana de tolerancia contra replay) a
 * propósito: se probó con vectores propios (`ts` en segundos, como lo manda
 * Mercado Pago realmente) y el chequeo interno del SDK instalado
 * (`mercadopago@3.2.1`, `src/utils/webhook/index.ts`) compara ese `ts` contra
 * `Date.now()` **sin convertir de segundos a milisegundos** — con
 * `toleranceSeconds` seteado, esto rechaza como `TimestampOutOfTolerance`
 * absolutamente cualquier webhook real, por más que su firma sea
 * genuinamente válida. Confirmado con `backend/tests/mercadoPagoSignature.test.ts`.
 * Bug de esta versión del SDK, no de este código — reportar/revisar cuando
 * se actualice la dependencia (ver docs/DECISIONS.md y docs/ROADMAP.md).
 * Sin esta opción, la protección contra replay queda pendiente (mitigada en
 * parte por la idempotencia de `PaymentWebhookEvent`).
 */
export function verifySignature(input: { xSignature: string | undefined; xRequestId: string | undefined; dataId: string | undefined }): boolean {
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    // Falta de configuración, no un webhook falsificado — se distingue en el
    // log para no confundir "nadie intentó autenticarse" con "faltó cargar
    // la variable en el entorno" (ver docs/DEPLOYMENT.md, MERCADOPAGO_WEBHOOK_SECRET).
    console.error("[mercadopago_webhook] MERCADOPAGO_WEBHOOK_SECRET no está configurado: firma rechazada sin validar.");
    return false;
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId,
      secret: env.MERCADOPAGO_WEBHOOK_SECRET,
    });
    return true;
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      // `error.reason` es el enum tipado que el propio SDK expone para esto
      // (SignatureFailureReason: firma ausente/malformada, hash de una
      // versión no soportada, HMAC que no coincide — típicamente
      // MERCADOPAGO_WEBHOOK_SECRET incorrecto —, o timestamp fuera de
      // tolerancia). Nunca se loguea `input.xSignature` (el hash recibido) ni
      // el secret — solo el motivo, el dataId (payment id, no sensible) y el
      // x-request-id (id de correlación de Mercado Pago, no sensible).
      console.warn("[mercadopago_webhook] firma inválida", {
        reason: error.reason,
        dataId: input.dataId,
        xRequestId: input.xRequestId,
      });
      return false;
    }
    // Cualquier otro fallo (ej. tipo inesperado) también se trata como firma
    // inválida: nunca se debe procesar un webhook si la validación no pudo
    // completarse con éxito. A diferencia de InvalidWebhookSignatureError,
    // esto es inesperado — se loguea el mensaje del error para poder
    // diagnosticarlo (nunca el objeto crudo, que podría incluir el secret
    // pasado a `WebhookSignatureValidator.validate`).
    console.error("[mercadopago_webhook] error inesperado validando la firma", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
