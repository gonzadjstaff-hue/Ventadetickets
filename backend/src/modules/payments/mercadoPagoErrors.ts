import { AppError } from "../../shared/AppError.js";
import type { PaymentProviderErrorKind } from "../../integrations/payments/types.js";

export class MercadoPagoCheckoutUnavailableError extends AppError {
  constructor() {
    super("MERCADOPAGO_CHECKOUT_UNAVAILABLE", "El pago con Mercado Pago no está disponible en este momento.", 503);
  }
}

export class OrderAlreadyPaidError extends AppError {
  constructor() {
    super("ORDER_ALREADY_PAID", "Esta orden ya fue pagada. No se generó una preferencia nueva.", 409);
  }
}

export class OrderCancelledError extends AppError {
  constructor() {
    super("ORDER_CANCELLED", "Esta orden fue cancelada.", 400);
  }
}

export class OrderExpiredError extends AppError {
  constructor() {
    super("ORDER_EXPIRED", "La reserva de esta orden venció.", 409);
  }
}

const PROVIDER_ERROR_STATUS: Record<PaymentProviderErrorKind, number> = {
  timeout: 504,
  unauthorized: 502,
  not_found: 502,
  rate_limited: 502,
  server_error: 502,
  unexpected_payload: 502,
  unknown: 502,
};

/**
 * Traduce cualquier `PaymentProviderError` (timeout, 401/403, 404, 429, 5xx,
 * payload inesperado) a una respuesta HTTP controlada, sin exponer el error
 * crudo del proveedor (que podría incluir detalles de la cuenta o la
 * credencial). El mensaje es siempre genérico a propósito.
 */
export class MercadoPagoProviderError extends AppError {
  constructor(kind: PaymentProviderErrorKind) {
    super(
      "MERCADOPAGO_PROVIDER_ERROR",
      "No pudimos completar la operación con Mercado Pago. Probá de nuevo en unos segundos.",
      PROVIDER_ERROR_STATUS[kind],
    );
  }
}
