import type { NextFunction, Request, Response } from "express";

import { prisma } from "../shared/prisma.js";
import { ForbiddenError, UnauthorizedError } from "./authErrors.js";
import type { AuthenticatedUser } from "./authTypes.js";
import { verifyBearerFirebaseToken } from "./verifyBearerFirebaseToken.js";

/**
 * Verifica la identidad (Firebase, vía verifyBearerFirebaseToken) y resuelve
 * la autorización (Postgres) de cada request protegida. No hace vinculación
 * automática por email: si el `uid` del token no tiene todavía un
 * `User.firebaseUid` que lo matchee, responde 401 — esa vinculación inicial
 * es responsabilidad de `POST /api/auth/session`, no de este middleware.
 *
 * Nunca confía en el rol/estado que pudiera venir en el token o en cualquier
 * otro dato del request: `role` y `status` siempre se leen de la fila de
 * `User` recién consultada, ver docs/DECISIONS.md.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const { uid, email } = await verifyBearerFirebaseToken(req);

    const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
    if (!user) {
      throw new UnauthorizedError();
    }

    if (user.status === "BLOCKED") {
      throw new ForbiddenError();
    }

    const authUser: AuthenticatedUser = {
      firebaseUid: uid,
      email,
      emailVerified: true,
      userId: user.id,
      role: user.role,
      status: user.status,
    };

    req.authUser = authUser;
    next();
  } catch (error) {
    next(error);
  }
}
