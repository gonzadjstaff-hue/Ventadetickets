/**
 * Modo seguro de desarrollo: simula el envío sin pegarle a ningún proveedor
 * real. Solo recibe (y por lo tanto solo puede loguear) un resumen mínimo —
 * nunca el destinatario, el token, el qrPayload, el hash, ninguna API key ni
 * el contenido en base64 del QR.
 */
export interface ConsoleEmailSummary {
  ticketPublicId: string;
  eventTitle: string;
  ticketTypeName: string;
}

export function sendViaConsole(summary: ConsoleEmailSummary): void {
  console.log(
    `[email:simulated] ticketPublicId=${summary.ticketPublicId} event="${summary.eventTitle}" ticketType="${summary.ticketTypeName}" status=simulated`,
  );
}
