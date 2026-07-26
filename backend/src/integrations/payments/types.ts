/**
 * Interfaz interna de proveedor de pago. El resto del sistema (services de
 * `modules/orders`/`modules/payments`) solo debe conocer estos tipos, nunca
 * estructuras crudas de Mercado Pago — ver docs/DECISIONS.md.
 */

export type NormalizedPaymentStatus = "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED" | "REFUNDED";

export interface CreateCheckoutPreferenceParams {
  /** Referencia propia y estable (derivada de orderPublicId), nunca email/nombre/IDs internos. */
  externalReference: string;
  title: string;
  /** Ya validado/leído desde la base — nunca confiar en un monto enviado por el frontend. */
  unitPrice: number;
  currency: string;
  payerEmail: string;
  backUrls: { success: string; pending: string; failure: string };
  notificationUrl: string;
  /** Si está presente, se usa como expiration_date_to de la preferencia (misma expiración que la reserva de la Order). */
  expiresAt: Date | null;
  /** Clave de idempotencia del request externo (no confundir con la idempotencia interna a nivel de Order/Payment). */
  idempotencyKey: string;
}

export interface CheckoutPreferenceResult {
  providerPreferenceId: string;
  initPoint: string;
  sandboxInitPoint: string | null;
}

export interface NormalizedPayment {
  providerPaymentId: string;
  status: NormalizedPaymentStatus;
  /** Estado crudo tal como lo devuelve el proveedor (ej. "approved", "in_process"), para logs/auditoría — nunca la fuente de verdad del status normalizado. */
  rawStatus: string;
  amount: number;
  currency: string;
  externalReference: string | null;
  liveMode: boolean;
  approvedAt: Date | null;
  paymentMethod: string | null;
}

export interface WebhookSignatureInput {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
}

export type PaymentProviderErrorKind =
  | "timeout"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "unexpected_payload"
  | "unknown";

export class PaymentProviderError extends Error {
  readonly kind: PaymentProviderErrorKind;
  readonly cause?: unknown;

  constructor(kind: PaymentProviderErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "PaymentProviderError";
    this.kind = kind;
    this.cause = cause;
  }
}

export interface PaymentProvider {
  readonly name: string;
  createCheckoutPreference(params: CreateCheckoutPreferenceParams): Promise<CheckoutPreferenceResult>;
  /** Recupera una preferencia ya creada (para reutilizarla en vez de crear una nueva). `null` si el proveedor ya no la tiene. */
  getCheckoutPreference(providerPreferenceId: string): Promise<CheckoutPreferenceResult | null>;
  getPayment(providerPaymentId: string): Promise<NormalizedPayment>;
  /** Nunca hace ninguna llamada de red: valida localmente contra el secret. */
  verifyWebhookSignature(input: WebhookSignatureInput): boolean;
}
