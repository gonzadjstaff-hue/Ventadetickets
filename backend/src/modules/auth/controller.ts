import type { NextFunction, Request, Response } from "express";

import { UnauthorizedError } from "../../middlewares/authErrors.js";
import { verifyBearerFirebaseToken } from "../../middlewares/verifyBearerFirebaseToken.js";
import { resolveOrLinkStaffUser } from "./sessionService.js";

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

/**
 * Primer acceso (o acceso normal, si ya estaba vinculado) de un ADMIN/
 * VALIDATOR previamente autorizado en Postgres. No usa requireAuth: a
 * propósito, porque requireAuth exige que el `User` ya esté vinculado por
 * `firebaseUid`, que es exactamente el caso que este endpoint tiene que
 * poder resolver (ver sessionService.ts). Nunca lee `req.body` — la única
 * identidad que importa es la que sale del token verificado.
 */
export async function postSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { uid, email } = await verifyBearerFirebaseToken(req);
    const user = await resolveOrLinkStaffUser({ firebaseUid: uid, email });
    // Diagnóstico temporal (ver SESSION_HANDOFF.md) — único punto de éxito,
    // cubre los 4 caminos internos que terminan en sesión resuelta/vinculada
    // sin tener que tocar sessionService.ts. Nunca imprime el uid, el email
    // ni ningún dato del User.
    console.warn("[auth_session_diag] AUTH_SESSION_LINKED_OK");

    res.status(200).json({
      user: { id: user.id, email: user.email, role: user.role, status: user.status },
    });
  } catch (error) {
    next(error);
  }
}
