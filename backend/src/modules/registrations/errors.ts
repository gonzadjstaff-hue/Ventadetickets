import { AppError } from "../../shared/AppError.js";

export class EventNotFoundError extends AppError {
  constructor() {
    super("EVENT_NOT_FOUND", "El evento indicado no existe.", 404);
  }
}

export class TicketTypeNotFoundError extends AppError {
  constructor() {
    super("TICKET_TYPE_NOT_FOUND", "El tipo de entrada indicado no existe para este evento.", 404);
  }
}

export class EventNotPublishedError extends AppError {
  constructor() {
    super("EVENT_NOT_PUBLISHED", "Este evento todavía no está disponible para registrarse.", 422);
  }
}

export class TicketTypeNotActiveError extends AppError {
  constructor() {
    super("TICKET_TYPE_NOT_ACTIVE", "Este tipo de entrada no está activo.", 400);
  }
}

export class TicketTypeNotFreeError extends AppError {
  constructor() {
    super("TICKET_TYPE_NOT_FREE", "Este tipo de entrada no es gratuito.", 400);
  }
}

export class OutsideSalesWindowError extends AppError {
  constructor() {
    super("OUTSIDE_SALES_WINDOW", "El registro para este tipo de entrada no está abierto en este momento.", 422);
  }
}

export class SoldOutError extends AppError {
  constructor() {
    super("SOLD_OUT", "Ya no quedan entradas disponibles de este tipo.", 409);
  }
}

export class DuplicateRegistrationError extends AppError {
  constructor() {
    super("DUPLICATE_REGISTRATION", "Este email ya tiene una entrada General para este evento.", 409);
  }
}

export class RegistrationConflictError extends AppError {
  constructor() {
    super(
      "REGISTRATION_CONFLICT",
      "Hubo un conflicto al procesar tu registro por alta demanda simultánea. Probá de nuevo en unos segundos.",
      409,
    );
  }
}
