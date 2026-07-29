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

/** Requiere un Firebase ID Token vigente del validador/admin logueado (ver features/auth/). Nunca cachea ni persiste el token. */
export function postCheckIn(eventPublicId: string, qrPayload: string, idToken: string): Promise<CheckInResponse> {
  return apiFetch<CheckInResponse>(`/api/events/${eventPublicId}/check-ins`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ qrPayload }),
  });
}
