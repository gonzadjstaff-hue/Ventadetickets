import type { EmailMessage } from "./types.js";

const RESEND_API_URL = "https://api.resend.com/emails";

/** Una demora del proveedor nunca puede dejar la request colgada indefinidamente. */
export const RESEND_TIMEOUT_MS = 8000;

export interface ResendConfig {
  apiKey: string;
  from: string;
}

/**
 * Envía por HTTP directo a la API de Resend (sin SDK). Tira en cualquier
 * falla (status no-ok, red, timeout); el llamador (emailService) decide qué
 * hacer con eso, nunca deja que se propague hacia el flujo de registro.
 */
export async function sendViaResend(message: EmailMessage, config: ResendConfig): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        attachments: message.attachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          content_id: attachment.contentId,
          content_disposition: attachment.disposition,
        })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // No se loguea el body de la respuesta: podría reflejar datos del request.
      throw new Error(`Resend respondió con status ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
