export type EmailDeliveryStatus = "sent" | "simulated" | "disabled" | "failed";

export interface EmailDeliveryResult {
  status: EmailDeliveryStatus;
}

export interface EmailAttachment {
  filename: string;
  /** PNG en base64, en memoria. Nunca se escribe a disco. */
  content: string;
  contentId: string;
  disposition: "inline";
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  attachments: EmailAttachment[];
}

export interface EmailConfig {
  provider?: "resend" | "console";
  apiKey?: string;
  from?: string;
}

export interface GeneralTicketEmailInput {
  to: string;
  attendeeName: string;
  eventTitle: string;
  eventStartsAt: Date;
  eventVenueName: string;
  eventAddress: string;
  ticketTypeName: string;
  ticketPublicId: string;
  /** Token crudo del ticket: solo se usa en memoria para armar el contenido del QR. Nunca se persiste ni se loguea. */
  ticketToken: string;
}
