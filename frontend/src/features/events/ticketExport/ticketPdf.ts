import type { TicketCapture } from "../landing/EventTicket";

/** A4 en mm, con un margen de seguridad fijo alrededor de cada entrada. */
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 20;

/**
 * Arma un PDF con una página por ticket, cada entrada centrada dentro del
 * área útil (A4 menos márgenes), respetando su relación de aspecto real
 * (nunca estirada) — nunca una página más larga con las dos entradas juntas,
 * ver docs/DECISIONS.md. Se usa tanto para General y VIP Individual (1
 * captura) como para VIP Doble (2 capturas, una por asistente).
 */
export async function buildTicketsPdf(captures: TicketCapture[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  const maxWidth = PAGE_WIDTH_MM - MARGIN_MM * 2;
  const maxHeight = PAGE_HEIGHT_MM - MARGIN_MM * 2;

  captures.forEach((capture, index) => {
    if (index > 0) doc.addPage();

    const aspectRatio = capture.width / capture.height;
    let renderWidth = maxWidth;
    let renderHeight = renderWidth / aspectRatio;
    if (renderHeight > maxHeight) {
      renderHeight = maxHeight;
      renderWidth = renderHeight * aspectRatio;
    }

    const x = (PAGE_WIDTH_MM - renderWidth) / 2;
    const y = (PAGE_HEIGHT_MM - renderHeight) / 2;

    // PNG, nunca JPEG: la compresión con pérdida de JPEG puede introducir
    // artefactos justo en el módulo del QR y volverlo no escaneable.
    doc.addImage(capture.dataUrl, "PNG", x, y, renderWidth, renderHeight, undefined, "FAST");
  });

  return doc.output("blob");
}

/**
 * Deja solo caracteres seguros para un nombre de archivo. Los identificadores
 * que arma la app (`ticketPublicId`, `orderPublicId`) ya son cuids
 * alfanuméricos, así que esto no debería cambiar nada en la práctica — es una
 * red de seguridad, no la validación principal.
 */
export function sanitizeFileNameId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}
