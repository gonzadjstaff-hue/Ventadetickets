import { AppError } from "../../shared/AppError.js";

export class OrderNotFoundError extends AppError {
  constructor() {
    super("ORDER_NOT_FOUND", "La orden indicada no existe.", 404);
  }
}
