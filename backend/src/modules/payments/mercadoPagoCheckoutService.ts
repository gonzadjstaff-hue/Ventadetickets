import { env } from "../../config/env.js";
import { getMercadoPagoProvider } from "../../integrations/payments/paymentProviderRegistry.js";
import { PaymentProviderError, type PaymentProvider } from "../../integrations/payments/types.js";
import { expireIfNeeded } from "../orders/service.js";
import { prisma } from "../../shared/prisma.js";
import { EventNotFoundError, OrderNotFoundError } from "./errors.js";
import { MercadoPagoCheckoutUnavailableError, MercadoPagoProviderError, OrderAlreadyPaidError, OrderCancelledError, OrderExpiredError } from "./mercadoPagoErrors.js";

export interface MercadoPagoCheckoutResult {
  preferenceId: string;
  /** Ya resuelto server-side: sandbox_init_point en modo prueba (credenciales TEST-), init_point si algún día se usan credenciales productivas. */
  checkoutUrl: string;
  orderPublicId: string;
  expiresAt: string | null;
}

/**
 * Arma la URL de retorno pública. Deliberadamente **idéntica** para success,
 * pending y failure: el frontend nunca debe decidir el resultado del pago en
 * base a cuál back_url lo trajo de vuelta (ver docs/DECISIONS.md) — siempre
 * consulta GET /orders/:orderPublicId. Lleva únicamente el orderPublicId
 * (identificador público, no sensible, el mismo que ya se usa en toda la API).
 */
function buildReturnUrl(orderPublicId: string): string {
  const url = new URL("/checkout/return", env.APP_PUBLIC_URL);
  url.searchParams.set("orderPublicId", orderPublicId);
  return url.toString();
}

function resolveCheckoutUrl(preference: { initPoint: string; sandboxInitPoint: string | null }): string {
  return preference.sandboxInitPoint ?? preference.initPoint;
}

async function callProvider<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PaymentProviderError) throw new MercadoPagoProviderError(error.kind);
    throw error;
  }
}

async function createFreshPreference(
  provider: PaymentProvider,
  order: { id: string; publicId: string; total: unknown; currency: string; expiresAt: Date | null },
  ticketTypeName: string,
  eventTitle: string,
  buyerEmail: string,
): Promise<{ providerPreferenceId: string; checkoutUrl: string }> {
  const notificationUrl = new URL("/api/webhooks/mercadopago", env.BACKEND_PUBLIC_URL).toString();
  const returnUrl = buildReturnUrl(order.publicId);

  const preference = await callProvider(() =>
    provider.createCheckoutPreference({
      externalReference: order.publicId,
      title: `${eventTitle} — ${ticketTypeName}`,
      unitPrice: Number(order.total),
      currency: order.currency,
      payerEmail: buyerEmail,
      backUrls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
      notificationUrl,
      expiresAt: order.expiresAt,
      // Determinística por orden (no random): si esta misma llamada se
      // reintenta por una falla de red del lado del cliente HTTP, Mercado
      // Pago puede reconocerla como el mismo intento en vez de crear una
      // preferencia duplicada — defensa adicional a la reutilización
      // explícita de abajo (getExistingOrFreshPreference).
      idempotencyKey: `mp-preference-${order.publicId}`,
    }),
  );

  await prisma.order.update({
    where: { id: order.id },
    data: {
      providerPreferenceId: preference.providerPreferenceId,
      paymentProvider: "mercadopago",
      externalReference: order.publicId,
    },
  });

  return { providerPreferenceId: preference.providerPreferenceId, checkoutUrl: resolveCheckoutUrl(preference) };
}

export async function createMercadoPagoCheckout(eventPublicId: string, orderPublicId: string): Promise<MercadoPagoCheckoutResult> {
  const provider = getMercadoPagoProvider();
  if (!provider) throw new MercadoPagoCheckoutUnavailableError();

  const event = await prisma.event.findUnique({ where: { publicId: eventPublicId } });
  if (!event) throw new EventNotFoundError();

  const order = await prisma.order.findUnique({
    where: { publicId: orderPublicId },
    include: { items: { include: { ticketType: true } }, user: true },
  });
  if (!order || order.eventId !== event.id) throw new OrderNotFoundError();

  const status = await expireIfNeeded(order);
  if (status === "CANCELLED") throw new OrderCancelledError();
  if (status === "EXPIRED") throw new OrderExpiredError();
  if (status === "PAID") throw new OrderAlreadyPaidError();

  const item = order.items[0];
  if (!item) throw new OrderNotFoundError();

  // Reutiliza la preferencia ya creada mientras la orden siga PENDING y no
  // haya vencido (expireIfNeeded ya lo garantizó arriba): un GET liviano
  // contra Mercado Pago en vez de crear una preferencia nueva en cada click
  // repetido en "Pagar con Mercado Pago" — ver docs/DECISIONS.md.
  if (order.providerPreferenceId) {
    const existing = await callProvider(() => provider.getCheckoutPreference(order.providerPreferenceId!));
    if (existing) {
      return {
        preferenceId: existing.providerPreferenceId,
        checkoutUrl: resolveCheckoutUrl(existing),
        orderPublicId: order.publicId,
        expiresAt: order.expiresAt ? order.expiresAt.toISOString() : null,
      };
    }
    // La preferencia guardada ya no existe/no se pudo recuperar del lado de
    // Mercado Pago (caso raro): se cae al flujo normal de abajo y se crea
    // una nueva, reemplazándola.
  }

  const created = await createFreshPreference(provider, order, item.ticketType.name, event.title, order.user.email);

  return {
    preferenceId: created.providerPreferenceId,
    checkoutUrl: created.checkoutUrl,
    orderPublicId: order.publicId,
    expiresAt: order.expiresAt ? order.expiresAt.toISOString() : null,
  };
}
