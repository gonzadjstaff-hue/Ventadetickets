import type { NextFunction, Request, Response } from "express";

import { UnauthorizedError } from "../../middlewares/authErrors.js";
import { checkInSchema } from "./schemas.js";
import { checkInTicket } from "./service.js";

/**
 * Guard defensivo, no debería poder fallar detrás de requireAuth+requireRole
 * (ver routes.ts) — se prefiere esto a un cast (`req.authUser!`) para que el
 * tipado siga siendo correcto sin asumir un invariante que el compilador no
 * puede verificar por sí solo (mismo patrón que getMe en modules/auth).
 */
export async function createCheckIn(
  req: Request<{ eventPublicId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new UnauthorizedError();
    }

    const input = checkInSchema.parse(req.body);
    const outcome = await checkInTicket(
      req.params.eventPublicId,
      input.qrPayload,
      req.authUser.userId,
      req.get("user-agent"),
    );

    res.status(200).json(outcome);
  } catch (error) {
    next(error);
  }
}
