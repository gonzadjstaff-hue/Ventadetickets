import { AppError } from "../../shared/AppError.js";

export class OrderNotFoundError extends AppError {
  constructor() {
    super("ORDER_NOT_FOUND", "La orden indicada no existe.", 404);
  }
}

export class EventNotFoundError extends AppError {
  constructor() {
    super("EVENT_NOT_FOUND", "El evento indicado no existe.", 404);
  }
}
