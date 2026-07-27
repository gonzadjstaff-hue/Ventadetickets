import type { NextFunction, Request, Response } from "express";

import { UnauthorizedError } from "../../middlewares/authErrors.js";

/**
 * Devuelve el perfil mínimo del usuario autenticado. Todo sale de
 * `req.authUser` (ya resuelto por requireAuth desde Postgres) — no vuelve a
 * consultar Prisma ni expone nada del token crudo de Firebase.
 *
 * El guard de `req.authUser` es defensivo, no debería poder fallar detrás de
 * requireAuth: se prefiere esto a un cast (`req.authUser!`) para que el
 * tipado siga siendo correcto sin asumir un invariante que el compilador no
 * puede verificar por sí solo.
 */
export function getMe(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    next(new UnauthorizedError());
    return;
  }

  const { userId, firebaseUid, email, role, status } = req.authUser;
  res.status(200).json({
    user: { id: userId, firebaseUid, email, role, status },
  });
}

/**
 * Ruta técnica y temporal para validar de punta a punta requireAuth +
 * requireRole("ADMIN") de forma manual/local, sin ningún efecto de negocio.
 * No lee ni escribe nada — si llegó hasta acá, ya pasó ambos middlewares.
 */
export function getAdminCheck(_req: Request, res: Response): void {
  res.status(200).json({ ok: true, message: "Admin access confirmed" });
}
