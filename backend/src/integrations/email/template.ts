import QRCode from "qrcode";

import type { GeneralTicketEmailInput } from "./types.js";

/** id de contenido del QR embebido inline; el HTML lo referencia como `cid:${QR_CONTENT_ID}`. */
export const QR_CONTENT_ID = "pulse-ticket-qr";

export interface GeneralTicketEmailContent {
  subject: string;
  html: string;
  /** PNG en memoria (nunca se escribe a disco), para adjuntar inline vía CID. */
  qrPng: Buffer;
  qrContentId: string;
}

/** Escapa los únicos valores dinámicos que entran al HTML del email, para no permitir inyección vía datos de usuario/admin (nombre, título del evento, ubicación, dirección, tipo de entrada, ticketPublicId). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEventDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeZone }).format(date);
}

function formatEventTime(date: Date, timeZone: string): string {
  // hour12: false en vez de timeStyle: "short" — el preset de es-AR usa formato de 12hs (a. m./p. m.),
  // que es ambiguo para una entrada; una hora de evento debe ser inequívoca.
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(
    date,
  );
}

export async function buildGeneralTicketEmailContent(
  input: GeneralTicketEmailInput,
  timeZone: string,
): Promise<GeneralTicketEmailContent> {
  const qrPayload = `pulse-ticket:v1:${input.ticketToken}`;
  const qrPng = await QRCode.toBuffer(qrPayload, { margin: 1, width: 320 });

  const attendeeName = escapeHtml(input.attendeeName);
  const eventTitle = escapeHtml(input.eventTitle);
  const venueName = escapeHtml(input.eventVenueName);
  const address = escapeHtml(input.eventAddress);
  const ticketTypeName = escapeHtml(input.ticketTypeName);
  const ticketPublicId = escapeHtml(input.ticketPublicId);
  const eventDate = escapeHtml(formatEventDate(input.eventStartsAt, timeZone));
  const eventTime = escapeHtml(formatEventTime(input.eventStartsAt, timeZone));

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#0C0C0C;font-family:Arial,Helvetica,sans-serif;color:#E8EEF2;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0C0C0C;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#101512;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px;text-align:center;border-bottom:1px solid rgba(170,181,190,.2);">
                <p style="margin:0;font-size:14px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase;color:#E8EEF2;">Pulse Event</p>
                <p style="margin:4px 0 0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#AAB5BE;">Entrada digital</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;text-align:center;">
                <p style="margin:0;font-size:20px;font-weight:bold;color:#E8EEF2;">${eventTitle}</p>
                <p style="margin:8px 0 0;font-size:14px;color:#AAB5BE;">${eventDate}</p>
                <p style="margin:0;font-size:14px;color:#AAB5BE;">${eventTime} hs</p>
                <p style="margin:8px 0 0;font-size:14px;color:#AAB5BE;">${venueName} — ${address}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;text-align:center;">
                <img src="cid:${QR_CONTENT_ID}" alt="Código QR de tu entrada" width="220" height="220" style="display:inline-block;border-radius:12px;background:#E8EEF2;padding:12px;" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#7d8790;">Asistente</p>
                <p style="margin:0 0 16px;font-size:15px;font-weight:bold;color:#E8EEF2;">${attendeeName}</p>
                <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#7d8790;">Tipo de entrada</p>
                <p style="margin:0 0 16px;font-size:15px;font-weight:bold;color:#4ADE80;">${ticketTypeName}</p>
                <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#7d8790;">N.º de ticket</p>
                <p style="margin:0;font-size:13px;font-family:monospace;color:#E8EEF2;word-break:break-all;">${ticketPublicId}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:rgba(170,181,190,.06);">
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#7d8790;">Información importante</p>
                <p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:#AAB5BE;">Entrada personal e intransferible. Presentá este código QR en el ingreso, desde tu teléfono o impreso. Te recomendamos llegar con anticipación.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  // Sin saltos de línea: evita cualquier intento de inyección en headers de email vía el título del evento.
  const subject = `Pulse Event — Tu entrada para ${input.eventTitle}`.replace(/[\r\n]+/g, " ");

  return { subject, html, qrPng, qrContentId: QR_CONTENT_ID };
}
