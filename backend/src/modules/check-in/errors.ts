import { AppError } from "../../shared/AppError.js";

export class EventNotFoundError extends AppError {
  constructor() {
    super("EVENT_NOT_FOUND", "El evento indicado no existe.", 404);
  }
}

/**
 * Agrupa formato inválido, versión inválida y token inexistente: en los tres
 * casos no hay un Ticket real al que enlazar un intento (CheckIn.ticketId es
 * obligatorio en el schema), así que no se persiste nada.
 */
export class InvalidTicketError extends AppError {
  constructor() {
    super("INVALID_TICKET", "El código QR no es válido.", 400);
  }
}
