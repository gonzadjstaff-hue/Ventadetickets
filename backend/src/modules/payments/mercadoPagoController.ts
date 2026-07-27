import type { NextFunction, Request, Response } from "express";

import { getMercadoPagoProvider } from "../../integrations/payments/paymentProviderRegistry.js";
import { PaymentProviderError } from "../../integrations/payments/types.js";
import { createMercadoPagoCheckout } from "./mercadoPagoCheckoutService.js";
import { mercadoPagoWebhookBodySchema, mercadoPagoWebhookQuerySchema } from "../../integrations/payments/mercadoPago/mercadoPagoSchemas.js";
import { MercadoPagoProviderError } from "./mercadoPagoErrors.js";
import { processMercadoPagoWebhook } from "./mercadoPagoWebhookService.js";

export async function createMercadoPagoCheckoutController(
  req: Request<{ eventPublicId: string; orderPublicId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await createMercadoPagoCheckout(req.params.eventPublicId, req.params.orderPublicId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Endpoint público (sin auth de usuario) al que Mercado Pago llama
 * server-to-server. Nunca confía en el body para decidir nada por sí solo:
 * la firma se valida primero, y el pago real se vuelve a pedir a Mercado
 * Pago dentro de `processMercadoPagoWebhook` — ver docs/DECISIONS.md.
 */
export async function mercadoPagoWebhookController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const provider = getMercadoPagoProvider();
    if (!provider) {
      // No debería poder pasar (la ruta no se monta si está deshabilitado),
      // pero por si el flag cambió en caliente: 200 para no generar
      // reintentos eternos de Mercado Pago contra algo que nunca se va a resolver.
      res.sendStatus(200);
      return;
    }

    const query = mercadoPagoWebhookQuerySchema.parse(req.query);
    const body = mercadoPagoWebhookBodySchema.parse(req.body ?? {});

    const dataIdFromQuery = query["data.id"];
    const dataIdFromBody = body.data?.id !== undefined ? String(body.data.id) : undefined;
    const dataId = dataIdFromQuery ?? dataIdFromBody;
    const xSignatureRaw = req.headers["x-signature"] as string | string[] | undefined;
    const xRequestIdRaw = req.headers["x-request-id"] as string | string[] | undefined;
    const xSignature = firstHeaderValue(xSignatureRaw);
    const xRequestId = firstHeaderValue(xRequestIdRaw);

    // "webhook recibido" + tipo/action/payment id — ninguno de estos valores
    // es sensible (son metadatos del propio webhook, no el payload completo
    // ni la firma). Se loguea antes de validar la firma a propósito: así
    // queda registro de que algo llegó, aunque la firma termine rechazándolo.
    // Diagnóstico temporal (ver docs/DECISIONS.md): se loguean por separado
    // el data.id de la query string y el del body — si un webhook real
    // alguna vez trae valores distintos entre ambas fuentes (o le falta a
    // una), esto lo va a mostrar sin tener que adivinar. También si
    // x-request-id llegó como array (headers repetidos) en vez de un único
    // valor.
    console.log("[mercadopago_webhook] webhook recibido", {
      type: body.type ?? query.type,
      action: body.action,
      dataIdFromQuery,
      dataIdFromBody,
      dataId,
      xRequestIdIsArray: Array.isArray(xRequestIdRaw),
      xSignatureIsArray: Array.isArray(xSignatureRaw),
    });

    const signatureValid = provider.verifyWebhookSignature({ xSignature, xRequestId, dataId });
    console.log(`[mercadopago_webhook] resultado de validación de firma: ${signatureValid ? "válida" : "inválida"}`, { dataId });
    if (!signatureValid) {
      // El motivo exacto (header ausente/malformado, hash de versión no
      // soportada, HMAC que no coincide, timestamp fuera de tolerancia) ya
      // quedó logueado dentro de mercadoPagoClient.ts/verifySignature — acá
      // solo se decide la respuesta HTTP.
      res.status(401).json({ error: { code: "INVALID_WEBHOOK_SIGNATURE", message: "Firma de webhook inválida o ausente." } });
      return;
    }

    if (!dataId) {
      // Firma válida pero sin payment id: no hay nada que consultar.
      res.sendStatus(200);
      return;
    }

    const notificationId = body.id !== undefined ? String(body.id) : `${dataId}:${xRequestId ?? "no-request-id"}`;

    // El resultado (aplicado / ignorado y por qué / ya procesado) ya queda
    // logueado dentro de processMercadoPagoWebhook — acá siempre se responde
    // 200 una vez que no hubo una excepción, por diseño: un "ignorado" (orden
    // no encontrada, importe/moneda/live_mode que no coinciden) es una
    // condición permanente que un reintento de Mercado Pago no va a resolver
    // (ver docs/DECISIONS.md) — pero ahora, a diferencia de antes, queda
    // registrado el motivo exacto en los logs.
    await processMercadoPagoWebhook({
      provider,
      notificationId,
      eventType: body.type ?? query.type ?? "unknown",
      paymentId: dataId,
      rawPayload: body,
    });

    res.status(200).json({ received: true });
  } catch (error) {
    // Antes este catch no logueaba nada: un timeout/401/403/404/429/5xx al
    // consultar el pago server-to-server (u otro error inesperado) se
    // traducía directo a una respuesta HTTP sin dejar ningún rastro en los
    // logs — exactamente el escenario que impedía diagnosticar un webhook
    // real que fallara acá. Se loguea el "kind" (clasificación ya estable, ver
    // integrations/payments/types.ts) y el mensaje del error, nunca el error
    // crudo completo (podría incluir detalles de la respuesta de Mercado
    // Pago con datos de la cuenta).
    console.error("[mercadopago_webhook] error procesando la notificación", {
      kind: error instanceof PaymentProviderError ? error.kind : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    // Un timeout/401/403/404/429/5xx al consultar el pago server-to-server
    // (dentro de processMercadoPagoWebhook) llega acá como PaymentProviderError
    // cruda — se traduce a una respuesta HTTP controlada (>=500, para que
    // Mercado Pago reintente la notificación) igual que en el endpoint de
    // creación de preferencia.
    next(error instanceof PaymentProviderError ? new MercadoPagoProviderError(error.kind) : error);
  }
}
