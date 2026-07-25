import type { Prisma } from "@prisma/client";

import { generateQrToken } from "../../shared/qrToken.js";

export interface EmittedTicket {
  ticketId: string;
  ticketPublicId: string;
  holderName: string;
  /** Token crudo de un solo uso. Nunca se persiste; el llamador lo usa una vez (respuesta inmediata / email) y lo descarta. */
  rawToken: string;
}

/**
 * Emite `ticketsPerUnit` Ticket para un OrderItem ya pago, uno por cada
 * nombre en `attendeeNames` (en el mismo orden). Cada ticket recibe su
 * propio token/hash de `generateQrToken()`, así que dos tickets del mismo
 * OrderItem (ej. VIP Doble) nunca comparten QR. Debe llamarse dentro de la
 * misma transacción que confirma el pago — nunca antes de que la orden
 * quede efectivamente PAID.
 */
export async function emitTicketsForOrderItem(
  tx: Prisma.TransactionClient,
  params: {
    orderId: string;
    orderItemId: string;
    ticketTypeId: string;
    ticketsPerUnit: number;
    holderEmail: string;
    attendeeNames: string[];
    fallbackHolderName: string;
  },
): Promise<EmittedTicket[]> {
  const emitted: EmittedTicket[] = [];

  for (let i = 0; i < params.ticketsPerUnit; i++) {
    const holderName = params.attendeeNames[i]?.trim() || params.fallbackHolderName;
    const { token, hash } = generateQrToken();

    const ticket = await tx.ticket.create({
      data: {
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        ticketTypeId: params.ticketTypeId,
        holderName,
        holderEmail: params.holderEmail,
        qrTokenHash: hash,
        status: "ACTIVE",
      },
    });

    emitted.push({
      ticketId: ticket.id,
      ticketPublicId: ticket.publicId,
      holderName: ticket.holderName,
      rawToken: token,
    });
  }

  return emitted;
}
