import { apiFetch } from "./client";

export interface GeneralRegistrationPayload {
  ticketTypeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  acceptedTerms: boolean;
}

export type EmailDeliveryStatus = "sent" | "simulated" | "disabled" | "failed";

export interface GeneralRegistrationResponse {
  attendeeName: string;
  orderPublicId: string;
  ticketPublicId: string;
  /** Token crudo de un solo uso; no persistir, no mostrar, no loguear. */
  ticketToken: string;
  ticketType: string;
  message: string;
  /** Estado real del envío del email de la entrada. La descarga y el QR no dependen de esto. */
  emailStatus: EmailDeliveryStatus;
  /** Atajo de conveniencia: equivalente a emailStatus === "sent". */
  emailSent: boolean;
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
