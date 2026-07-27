import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";

import { ForbiddenError, UnauthorizedError } from "./authErrors.js";

/**
 * Asume que requireAuth ya corrió antes en la cadena de middlewares — solo
 * lee `req.authUser.role` (resuelto ahí desde Postgres). Nunca lee ningún
 * candidato a rol de `req.body`, `req.query`, headers personalizados ni del
 * token de Firebase: si `req.authUser` no existe, es 401 (nadie se
 * autenticó), no un "rol faltante".
 */
export function requireRole(...roles: UserRole[]) {
  return function requireRoleMiddleware(req: Request, _res: Response, next: NextFunction): void {
    if (!req.authUser) {
      next(new UnauthorizedError());
      return;
    }

    if (!roles.includes(req.authUser.role)) {
      next(new ForbiddenError());
      return;
    }

    next();
  };
}
