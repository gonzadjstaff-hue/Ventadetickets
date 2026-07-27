import type { UserRole, UserStatus } from "@prisma/client";

/**
 * Contexto autenticado mínimo, adjuntado a `req.authUser` por requireAuth.
 * `role` y `status` vienen siempre de la fila de `User` en Postgres, nunca
 * del token de Firebase ni de nada enviado por el cliente — ver
 * requireAuth.ts y docs/DECISIONS.md.
 */
export interface AuthenticatedUser {
  firebaseUid: string;
  email: string;
  emailVerified: boolean;
  userId: string;
  role: UserRole;
  status: UserStatus;
}
