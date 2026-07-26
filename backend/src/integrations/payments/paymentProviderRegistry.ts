import { env } from "../../config/env.js";
import { mercadoPagoProvider } from "./mercadoPago/mercadoPagoProvider.js";
import type { PaymentProvider } from "./types.js";

/**
 * Único punto del backend que decide si Mercado Pago está disponible para
 * uso real. `env.MERCADOPAGO_CHECKOUT_AVAILABLE` ya contempla el flag
 * ENABLE_MERCADOPAGO_CHECKOUT y que estén completas las credenciales/URLs —
 * ver backend/src/config/env.ts. Devuelve `null` (nunca lanza) cuando no está
 * disponible, para que los llamadores puedan responder de forma controlada.
 */
export function getMercadoPagoProvider(): PaymentProvider | null {
  return env.MERCADOPAGO_CHECKOUT_AVAILABLE ? mercadoPagoProvider : null;
}
