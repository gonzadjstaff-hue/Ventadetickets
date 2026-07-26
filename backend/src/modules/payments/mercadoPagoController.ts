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

    const dataId = query["data.id"] ?? (body.data?.id !== undefined ? String(body.data.id) : undefined);
    const xSignature = firstHeaderValue(req.headers["x-signature"] as string | string[] | undefined);
    const xRequestId = firstHeaderValue(req.headers["x-request-id"] as string | string[] | undefined);

    const signatureValid = provider.verifyWebhookSignature({ xSignature, xRequestId, dataId });
    if (!signatureValid) {
      res.status(401).json({ error: { code: "INVALID_WEBHOOK_SIGNATURE", message: "Firma de webhook inválida o ausente." } });
      return;
    }

    if (!dataId) {
      // Firma válida pero sin payment id: no hay nada que consultar.
      res.sendStatus(200);
      return;
    }

    const notificationId = body.id !== undefined ? String(body.id) : `${dataId}:${xRequestId ?? "no-request-id"}`;

    await processMercadoPagoWebhook({
      provider,
      notificationId,
      eventType: body.type ?? query.type ?? "unknown",
      paymentId: dataId,
      rawPayload: body,
    });

    res.status(200).json({ received: true });
  } catch (error) {
    // Un timeout/401/403/404/429/5xx al consultar el pago server-to-server
    // (dentro de processMercadoPagoWebhook) llega acá como PaymentProviderError
    // cruda — se traduce a una respuesta HTTP controlada (>=500, para que
    // Mercado Pago reintente la notificación) igual que en el endpoint de
    // creación de preferencia.
    next(error instanceof PaymentProviderError ? new MercadoPagoProviderError(error.kind) : error);
  }
}
