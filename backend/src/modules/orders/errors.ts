import { AppError } from "../../shared/AppError.js";

export class EventNotFoundError extends AppError {
  constructor() {
    super("EVENT_NOT_FOUND", "El evento indicado no existe.", 404);
  }
}

export class EventNotPublishedError extends AppError {
  constructor() {
    super("EVENT_NOT_PUBLISHED", "Este evento todavía no está disponible para la venta.", 422);
  }
}

export class TicketTypeNotFoundError extends AppError {
  constructor() {
    super("TICKET_TYPE_NOT_FOUND", "El tipo de entrada indicado no existe para este evento.", 404);
  }
}

export class TicketTypeNotActiveError extends AppError {
  constructor() {
    super("TICKET_TYPE_NOT_ACTIVE", "Este tipo de entrada no está activo.", 400);
  }
}

/** Rechaza explícitamente TicketType gratuitos (General) en el flujo VIP. */
export class TicketTypeNotVipError extends AppError {
  constructor() {
    super("TICKET_TYPE_NOT_VIP", "Este tipo de entrada no corresponde a una compra VIP.", 400);
  }
}

export class InvalidAttendeeCountError extends AppError {
  constructor(expected: number) {
    super(
      "INVALID_ATTENDEE_COUNT",
      `Este tipo de entrada requiere exactamente ${expected} asistente${expected === 1 ? "" : "s"}.`,
      400,
    );
  }
}

export class OutsideSalesWindowError extends AppError {
  constructor() {
    super("OUTSIDE_SALES_WINDOW", "La venta para este tipo de entrada no está abierta en este momento.", 422);
  }
}

export class SoldOutError extends AppError {
  constructor() {
    super("SOLD_OUT", "Ya no quedan unidades disponibles de este tipo de entrada.", 409);
  }
}

export class OrderConflictError extends AppError {
  constructor() {
    super(
      "ORDER_CONFLICT",
      "Hubo un conflicto al procesar tu compra por alta demanda simultánea. Probá de nuevo en unos segundos.",
      409,
    );
  }
}

/**
 * Se usa tanto para "no existe" como para "existe pero es de otro evento":
 * responder distinto revelaría que una orden ajena existe, así que ambos
 * casos comparten el mismo código y status.
 */
export class OrderNotFoundError extends AppError {
  constructor() {
    super("ORDER_NOT_FOUND", "La orden indicada no existe.", 404);
  }
}
