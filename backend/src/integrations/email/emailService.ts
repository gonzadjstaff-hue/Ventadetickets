import { sendViaConsole } from "./consoleProvider.js";
import { sendViaResend } from "./resendProvider.js";
import { buildGeneralTicketEmailContent } from "./template.js";
import type { EmailConfig, EmailDeliveryResult, EmailMessage, GeneralTicketEmailInput } from "./types.js";

export type {
  EmailConfig,
  EmailDeliveryResult,
  EmailDeliveryStatus,
  GeneralTicketEmailInput,
} from "./types.js";

/**
 * Envía (o simula) el email de la entrada General. Nunca lanza: un problema
 * externo (timeout, credenciales, red, proveedor caído) no puede convertir
 * un registro ya confirmado en un error 500 ni revertir nada — el llamador
 * solo debe leer `status` y decidir qué mostrar.
 *
 * `config` se recibe explícito (en vez de leer `env` acá adentro) para que
 * el módulo sea testeable sin tener que reimportar `env` con variables de
 * proceso distintas; el único llamador real (registrations/service.ts) arma
 * `config` a partir de `env.EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM`.
 */
export async function sendGeneralTicketEmail(
  input: GeneralTicketEmailInput,
  config: EmailConfig,
  timeZone: string,
): Promise<EmailDeliveryResult> {
  if (!config.provider) {
    return { status: "disabled" };
  }

  let content;
  try {
    content = await buildGeneralTicketEmailContent(input, timeZone);
  } catch {
    // No se loguea el error: podría filtrar detalles del input.
    return { status: "failed" };
  }

  const message: EmailMessage = {
    to: input.to,
    subject: content.subject,
    html: content.html,
    attachments: [
      {
        filename: "pulse-ticket-qr.png",
        content: content.qrPng.toString("base64"),
        contentId: content.qrContentId,
        disposition: "inline",
      },
    ],
  };

  if (config.provider === "console") {
    sendViaConsole({
      ticketPublicId: input.ticketPublicId,
      eventTitle: input.eventTitle,
      ticketTypeName: input.ticketTypeName,
    });
    return { status: "simulated" };
  }

  if (!config.apiKey || !config.from) {
    return { status: "disabled" };
  }

  try {
    await sendViaResend(message, { apiKey: config.apiKey, from: config.from });
    return { status: "sent" };
  } catch {
    // No se loguea el detalle del error: podría incluir datos del request o de la respuesta del proveedor.
    console.error(`[email:failed] no se pudo enviar el email para el ticket ${input.ticketPublicId}`);
    return { status: "failed" };
  }
}
