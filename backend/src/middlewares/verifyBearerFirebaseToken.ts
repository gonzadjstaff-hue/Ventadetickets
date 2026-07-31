import type { Request } from "express";

import { verifyFirebaseIdToken } from "../integrations/firebase/firebaseAdmin.js";
import { AppError } from "../shared/AppError.js";
import { UnauthorizedError } from "./authErrors.js";

const BEARER_PREFIX = "Bearer ";

/** Identidad ya verificada contra Firebase — nunca contiene nada más que esto (nunca claims, nunca el token). */
export interface VerifiedFirebaseIdentity {
  uid: string;
  email: string;
}

/**
 * Lee `Authorization: Bearer <token>`, lo verifica contra Firebase, y exige
 * `email` presente + `email_verified === true`. Compartido por `requireAuth`
 * (rutas que ya requieren un `User` vinculado) y `POST /api/auth/session`
 * (que además maneja el caso "todavía no vinculado") — la verificación de
 * identidad es idéntica en los dos casos, solo cambia qué se hace después
 * con el resultado. Nunca consulta Postgres ni decide autorización — eso
 * queda a cargo de quien llame a esta función.
 */
export async function verifyBearerFirebaseToken(req: Request): Promise<VerifiedFirebaseIdentity> {
  const header = req.header("authorization");
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedError();
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    throw new UnauthorizedError();
  }

  const decoded = await verifyFirebaseIdToken(token).catch((error: unknown) => {
    // FirebaseNotConfiguredError es un error de configuración del servidor
    // (500), no una falla de autenticación del cliente (401) — se deja
    // propagar tal cual. Cualquier otro error del SDK (firma inválida,
    // expirado, revocado, malformado, proyecto incorrecto, etc.) se traduce
    // a un 401 genérico: nunca se expone el mensaje crudo del SDK ni ningún
    // detalle del token en la respuesta.
    if (error instanceof AppError) throw error;
    throw new UnauthorizedError();
  });

  if (!decoded.email) {
    throw new UnauthorizedError();
  }
  if (decoded.email_verified !== true) {
    throw new UnauthorizedError();
  }

  return { uid: decoded.uid, email: decoded.email };
}
