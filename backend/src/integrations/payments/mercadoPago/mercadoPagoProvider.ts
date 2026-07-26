import { createPreference, getPayment, getPreference, verifySignature, type PreferenceRequest, type PreferenceResponse } from "./mercadoPagoClient.js";
import type {
  CheckoutPreferenceResult,
  CreateCheckoutPreferenceParams,
  NormalizedPayment,
  NormalizedPaymentStatus,
  PaymentProvider,
  WebhookSignatureInput,
} from "../types.js";
import { PaymentProviderError } from "../types.js";

/**
 * Estados oficiales de un Payment de Mercado Pago (fuente: documentación de
 * Checkout Pro / API de pagos, fecha de consulta 2026-07-25). `in_process`
 * se normaliza junto con `pending` (mismo significado práctico: todavía no
 * hay una decisión final) — el estado crudo original queda en `rawStatus`
 * para logs/auditoría. `charged_back` se normaliza como `REFUNDED`: el
 * modelo interno (`PaymentStatus` de Prisma) no distingue devolución
 * voluntaria de contracargo — ver docs/DECISIONS.md, es una simplificación
 * documentada, no un olvido.
 */
const STATUS_MAP: Record<string, NormalizedPaymentStatus> = {
  approved: "APPROVED",
  pending: "PENDING",
  in_process: "PENDING",
  authorized: "PENDING",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
  charged_back: "REFUNDED",
};

function normalizeStatus(rawStatus: string | undefined): NormalizedPaymentStatus {
  if (!rawStatus) throw new PaymentProviderError("unexpected_payload", "El pago de Mercado Pago no tiene status.");
  const normalized = STATUS_MAP[rawStatus];
  if (!normalized) {
    throw new PaymentProviderError("unexpected_payload", `Estado de pago de Mercado Pago no reconocido: "${rawStatus}".`);
  }
  return normalized;
}

function toCheckoutPreferenceResult(response: PreferenceResponse): CheckoutPreferenceResult | null {
  if (!response.id || !response.init_point) return null;
  return {
    providerPreferenceId: response.id,
    initPoint: response.init_point,
    sandboxInitPoint: response.sandbox_init_point ?? null,
  };
}

class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago";

  async createCheckoutPreference(params: CreateCheckoutPreferenceParams): Promise<CheckoutPreferenceResult> {
    const body: PreferenceRequest = {
      items: [
        {
          id: params.externalReference,
          title: params.title,
          quantity: 1,
          currency_id: params.currency,
          unit_price: params.unitPrice,
        },
      ],
      payer: { email: params.payerEmail },
      back_urls: params.backUrls,
      // auto_return exige back_urls.success configurada (ver docs/DECISIONS.md) — siempre lo está acá.
      auto_return: "approved",
      notification_url: params.notificationUrl,
      external_reference: params.externalReference,
      ...(params.expiresAt
        ? {
            expires: true,
            expiration_date_from: new Date().toISOString(),
            expiration_date_to: params.expiresAt.toISOString(),
          }
        : {}),
    };

    const response = await createPreference(body, params.idempotencyKey);
    const result = toCheckoutPreferenceResult(response);
    if (!result) {
      throw new PaymentProviderError("unexpected_payload", "Mercado Pago no devolvió id/init_point para la preferencia.");
    }
    return result;
  }

  async getCheckoutPreference(providerPreferenceId: string): Promise<CheckoutPreferenceResult | null> {
    const response = await getPreference(providerPreferenceId);
    return response ? toCheckoutPreferenceResult(response) : null;
  }

  async getPayment(providerPaymentId: string): Promise<NormalizedPayment> {
    const payment = await getPayment(providerPaymentId);
    if (payment.id === undefined || payment.id === null) {
      throw new PaymentProviderError("unexpected_payload", "Mercado Pago no devolvió un id de pago válido.");
    }
    if (typeof payment.transaction_amount !== "number") {
      throw new PaymentProviderError("unexpected_payload", "Mercado Pago no devolvió transaction_amount para el pago.");
    }

    return {
      providerPaymentId: String(payment.id),
      status: normalizeStatus(payment.status),
      rawStatus: payment.status ?? "",
      amount: payment.transaction_amount,
      currency: payment.currency_id ?? "",
      externalReference: payment.external_reference ?? null,
      liveMode: payment.live_mode ?? false,
      approvedAt: payment.date_approved ? new Date(payment.date_approved) : null,
      paymentMethod: payment.payment_method_id ?? null,
    };
  }

  verifyWebhookSignature(input: WebhookSignatureInput): boolean {
    return verifySignature(input);
  }
}

export const mercadoPagoProvider: PaymentProvider = new MercadoPagoProvider();
