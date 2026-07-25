import { apiFetch } from "./client";
import type { EmailDeliveryStatus } from "./registrations";

export type OrderStatus = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED" | "REJECTED" | "AWAITING_PAYMENT" | "REFUNDED";
export type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "REFUNDED";
export type SimulatedPaymentResult = "approved" | "pending" | "rejected" | "cancelled";

export interface CreateVipOrderPayload {
  ticketTypeId: string;
  buyer: { name: string; email: string; whatsapp: string };
  attendees: Array<{ name: string }>;
}

export interface CreateVipOrderResponse {
  orderPublicId: string;
  eventPublicId: string;
  ticketType: string;
  total: number;
  currency: string;
  expiresAt: string;
  buyer: { name: string; email: string; whatsapp: string };
  attendees: string[];
  status: "PENDING";
  /** Solo viene presente cuando el backend tiene el simulador de pago habilitado (desarrollo). */
  paymentSimulationAvailable?: boolean;
}

export interface OrderStatusResponse {
  orderPublicId: string;
  status: OrderStatus;
  ticketType: string;
  total: number;
  currency: string;
  expiresAt: string | null;
  buyerName: string | null;
  attendees: string[];
  paymentStatus: PaymentStatus | null;
  /** Solo viene presente cuando status === "PAID". Nunca incluye token ni hash. */
  tickets?: Array<{ ticketPublicId: string; holderName: string; ticketTypeName: string }>;
}

export interface SimulatedTicket {
  ticketPublicId: string;
  holderName: string;
  ticketType: string;
  /** Token crudo: solo viene en la respuesta inmediata de la primera aprobación. Nunca persistir, mostrar como texto plano fuera del QR, ni loguear. */
  token: string;
  emailStatus: EmailDeliveryStatus;
}

export interface SimulatePaymentResponse {
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus | null;
  alreadyProcessed: boolean;
  tickets?: SimulatedTicket[];
}

export function createVipOrder(eventPublicId: string, payload: CreateVipOrderPayload): Promise<CreateVipOrderResponse> {
  return apiFetch<CreateVipOrderResponse>(`/api/events/${eventPublicId}/orders/vip`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getOrderStatus(eventPublicId: string, orderPublicId: string): Promise<OrderStatusResponse> {
  return apiFetch<OrderStatusResponse>(`/api/events/${eventPublicId}/orders/${orderPublicId}`);
}

/** Solo funciona en desarrollo, con el simulador de pago habilitado en el backend (ver docs/LOCAL_SETUP.md). */
export function simulatePayment(orderPublicId: string, result: SimulatedPaymentResult): Promise<SimulatePaymentResponse> {
  return apiFetch<SimulatePaymentResponse>(`/api/dev/orders/${orderPublicId}/simulate-payment`, {
    method: "POST",
    body: JSON.stringify({ result }),
  });
}
