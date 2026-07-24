import { apiFetch } from "./client";

export type CheckInResultCode = "VALID" | "ALREADY_USED" | "WRONG_EVENT" | "NOT_PAID" | "CANCELLED";

export interface CheckInResponse {
  result: CheckInResultCode;
  message: string;
  /** Solo vienen para VALID y ALREADY_USED. Nunca incluye email, teléfono ni token. */
  ticketPublicId?: string;
  holderName?: string;
  ticketType?: string;
}

export function postCheckIn(eventPublicId: string, qrPayload: string): Promise<CheckInResponse> {
  return apiFetch<CheckInResponse>(`/api/events/${eventPublicId}/check-ins`, {
    method: "POST",
    body: JSON.stringify({ qrPayload }),
  });
}
