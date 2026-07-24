import { apiFetch } from "./client";

export interface GeneralRegistrationPayload {
  ticketTypeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  acceptedTerms: boolean;
}

export interface GeneralRegistrationResponse {
  attendeeName: string;
  orderPublicId: string;
  ticketPublicId: string;
  /** Token crudo de un solo uso; no persistir, no mostrar, no loguear. */
  ticketToken: string;
  ticketType: string;
  message: string;
}

export function registerGeneralTicket(
  eventPublicId: string,
  payload: GeneralRegistrationPayload,
): Promise<GeneralRegistrationResponse> {
  return apiFetch<GeneralRegistrationResponse>(`/api/events/${eventPublicId}/registrations/general`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
