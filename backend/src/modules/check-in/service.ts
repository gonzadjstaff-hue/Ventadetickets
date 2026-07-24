import { prisma } from "../../shared/prisma.js";
import { hashQrToken, parseQrPayload } from "../../shared/qrToken.js";
import { EventNotFoundError, InvalidTicketError } from "./errors.js";

/**
 * Usuario "sistema" fijo al que se le atribuye cada CheckIn mientras no
 * existe autenticación de validadores (MVP). Sembrado una sola vez por
 * prisma/seed.ts con este mismo ID exacto — nunca se crea ni se hace upsert
 * por request. Reemplazar por el usuario autenticado real (ej. req.user.id)
 * en cuanto exista un sistema de auth para validadores.
 */
const DEV_VALIDATOR_USER_ID = "demo-validator-mvp";

export type CheckInResultCode = "VALID" | "ALREADY_USED" | "WRONG_EVENT" | "NOT_PAID" | "CANCELLED";

export interface CheckInOutcome {
  result: CheckInResultCode;
  message: string;
  /** Solo se completan para VALID y ALREADY_USED. Nunca se incluye email, teléfono ni token. */
  ticketPublicId?: string;
  holderName?: string;
  ticketType?: string;
}

const MESSAGES: Record<CheckInResultCode, string> = {
  VALID: "Acceso permitido.",
  ALREADY_USED: "Este ticket ya fue utilizado.",
  WRONG_EVENT: "Este ticket pertenece a otro evento.",
  NOT_PAID: "La orden de este ticket no está habilitada para el ingreso.",
  CANCELLED: "Este ticket fue cancelado.",
};

export async function checkInTicket(
  eventPublicId: string,
  qrPayload: string,
  deviceInfo?: string,
): Promise<CheckInOutcome> {
  const event = await prisma.event.findUnique({ where: { publicId: eventPublicId } });
  if (!event) throw new EventNotFoundError();

  const token = parseQrPayload(qrPayload);
  if (!token) throw new InvalidTicketError();

  const hash = hashQrToken(token);

  const ticket = await prisma.ticket.findUnique({
    where: { qrTokenHash: hash },
    include: { order: true, ticketType: true },
  });
  if (!ticket) throw new InvalidTicketError();

  return prisma.$transaction(async (tx) => {
    const recordAttempt = (result: CheckInResultCode) =>
      tx.checkIn.create({
        data: {
          ticketId: ticket.id,
          // Evento donde se intentó validar (el de la ruta), no necesariamente
          // el evento real del ticket cuando el resultado es WRONG_EVENT.
          eventId: event.id,
          validatorUserId: DEV_VALIDATOR_USER_ID,
          result,
          deviceInfo,
        },
      });

    const rejected = (result: Exclude<CheckInResultCode, "VALID" | "ALREADY_USED">) =>
      recordAttempt(result).then(() => ({ result, message: MESSAGES[result] }));

    const withTicketDetails = (result: "VALID" | "ALREADY_USED") =>
      recordAttempt(result).then(() => ({
        result,
        message: MESSAGES[result],
        ticketPublicId: ticket.publicId,
        holderName: ticket.holderName,
        ticketType: ticket.ticketType.name,
      }));

    if (ticket.order.eventId !== event.id) {
      return rejected("WRONG_EVENT");
    }

    if (ticket.status === "USED") {
      return withTicketDetails("ALREADY_USED");
    }

    if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED" || ticket.status === "EXPIRED") {
      return rejected("CANCELLED");
    }

    if (ticket.order.status === "CANCELLED") {
      return rejected("CANCELLED");
    }

    if (ticket.order.status !== "PAID") {
      return rejected("NOT_PAID");
    }

    // Único punto de escritura sobre el ticket: la condición status: "ACTIVE"
    // en el WHERE hace que, ante dos escaneos simultáneos, solo uno pueda
    // matchear (Postgres relee la condición tras tomar el lock de fila en el
    // UPDATE). El otro obtiene count 0 y cae a "perdió la carrera" abajo.
    const updated = await tx.ticket.updateMany({
      where: { id: ticket.id, status: "ACTIVE" },
      data: { status: "USED", usedAt: new Date() },
    });

    if (updated.count === 1) {
      return withTicketDetails("VALID");
    }

    return withTicketDetails("ALREADY_USED");
  });
}
