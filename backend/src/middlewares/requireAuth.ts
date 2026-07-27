import type { NextFunction, Request, Response } from "express";

import { verifyFirebaseIdToken } from "../integrations/firebase/firebaseAdmin.js";
import { prisma } from "../shared/prisma.js";
import { AppError } from "../shared/AppError.js";
import { UnauthorizedError, ForbiddenError } from "./authErrors.js";
import type { AuthenticatedUser } from "./authTypes.js";

const BEARER_PREFIX = "Bearer ";

/**
 * Verifica la identidad (Firebase) y resuelve la autorización (Postgres) de
 * cada request protegida. No hace vinculación automática por email: si el
 * `uid` del token no tiene todavía un `User.firebaseUid` que lo matchee,
 * responde 401 — esa vinculación inicial es responsabilidad de
 * `POST /api/auth/session`, que se implementa en la Etapa 2, no acá.
 *
 * Nunca confía en el rol/estado que pudiera venir en el token o en cualquier
 * otro dato del request: `role` y `status` siempre se leen de la fila de
 * `User` recién consultada, ver docs/DECISIONS.md.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header("authorization");
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedError();
    }

    const token = header.slice(BEARER_PREFIX.length).trim();
    if (!token) {
      throw new UnauthorizedError();
    }

    const decoded = await verifyFirebaseIdToken(token).catch((error: unknown) => {
      // FirebaseNotConfiguredError es un error de configuración del
      // servidor (500), no una falla de autenticación del cliente (401) —
      // se deja propagar tal cual. Cualquier otro error del SDK (firma
      // inválida, expirado, revocado, malformado, proyecto incorrecto, etc.)
      // se traduce a un 401 genérico: nunca se expone el mensaje crudo del
      // SDK ni ningún detalle del token en la respuesta.
      if (error instanceof AppError) throw error;
      throw new UnauthorizedError();
    });

    if (!decoded.email || decoded.email_verified !== true) {
      throw new UnauthorizedError();
    }

    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) {
      throw new UnauthorizedError();
    }

    if (user.status === "BLOCKED") {
      throw new ForbiddenError();
    }

    const authUser: AuthenticatedUser = {
      firebaseUid: decoded.uid,
      email: decoded.email,
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
