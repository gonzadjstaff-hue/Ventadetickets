import { AppError } from "../shared/AppError.js";

/**
 * Un único código/mensaje genérico para todas las causas de 401 (header
 * ausente, esquema distinto de Bearer, token vacío, Firebase rechaza el
 * token, token expirado/revocado, sin email, email no verificado, sin User
 * interno vinculado) — a propósito: no hay que darle a quien intenta
 * autenticarse ninguna pista de cuál de esas causas fue.
 */
export class UnauthorizedError extends AppError {
  constructor() {
    super("UNAUTHORIZED", "No autorizado.", 401);
  }
}

/**
 * El cliente sí se autenticó (token válido, User interno existente), pero no
 * tiene permiso: User.status === "BLOCKED" (requireAuth) o su role no está
 * en la lista permitida (requireRole).
 */
export class ForbiddenError extends AppError {
  constructor() {
    super("FORBIDDEN", "No tenés permisos para realizar esta acción.", 403);
  }
}
