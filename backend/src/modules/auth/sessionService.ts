import type { User } from "@prisma/client";

import { prisma } from "../../shared/prisma.js";
import { FirebaseUidConflictError, ForbiddenError, UnauthorizedError } from "../../middlewares/authErrors.js";

export interface LinkFirebaseSessionInput {
  firebaseUid: string;
  email: string;
}

/**
 * Resuelve (y, si hace falta, vincula por primera vez) el `User` interno
 * correspondiente a una identidad de Firebase ya verificada
 * (`verifyBearerFirebaseToken`). Nunca crea un `User` nuevo — solo puede
 * devolver uno preprovisionado explícitamente de antemano (ver
 * backend/scripts/createStaffUser.ts). El email se compara normalizado
 * (minúsculas, recortado) para que mayúsculas/espacios no rompan el match.
 *
 * Nunca confía en nada del body de la request: la única fuente de
 * `firebaseUid`/`email` es la identidad ya verificada que recibe como
 * parámetro — quien llama a esta función es responsable de haberla obtenido
 * de Firebase, nunca de `req.body`.
 */
export async function resolveOrLinkStaffUser(input: LinkFirebaseSessionInput): Promise<User> {
  const normalizedEmail = input.email.trim().toLowerCase();

  // Caso A: ya está vinculado.
  const byFirebaseUid = await prisma.user.findUnique({ where: { firebaseUid: input.firebaseUid } });
  if (byFirebaseUid) {
    if (byFirebaseUid.status === "BLOCKED") throw new ForbiddenError();
    return byFirebaseUid;
  }

  // Caso B: no está vinculado por firebaseUid — buscar por email.
  const byEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!byEmail) {
    // Nunca se crea un User acá: solo puede autenticarse quien ya fue
    // preprovisionado explícitamente. El mismo 401 genérico que cualquier
    // otra causa de "no autorizado" — no confirma ni descarta que el email
    // exista en otro estado.
    throw new UnauthorizedError();
  }
  if (byEmail.status === "BLOCKED") {
    throw new ForbiddenError();
  }
  if (byEmail.firebaseUid && byEmail.firebaseUid !== input.firebaseUid) {
    throw new FirebaseUidConflictError();
  }
  if (byEmail.firebaseUid === input.firebaseUid) {
    // Caso borde: alguien más vinculó este mismo par (uid, email) entre el
    // findUnique por firebaseUid de arriba y este findUnique por email (dos
    // requests concurrentes con el mismo token). Nada que escribir.
    return byEmail;
  }

  // Vinculación atómica: el WHERE incluye firebaseUid: null como condición.
  // Si dos requests concurrentes llegan hasta acá para el mismo email, solo
  // una gana (count === 1, Postgres relee la condición al tomar el lock de
  // fila); la otra ve count === 0 y relee el estado real en vez de asumir
  // que ganó — mismo patrón que updateMany condicionado por status usado en
  // check-in/pagos (ver docs/DECISIONS.md).
  return prisma.$transaction(async (tx) => {
    const updateResult = await tx.user.updateMany({
      where: { id: byEmail.id, firebaseUid: null },
      data: { firebaseUid: input.firebaseUid },
    });

    if (updateResult.count === 1) {
      // Auditoría en la misma transacción: nunca queda un User vinculado
      // sin su AuditLog correspondiente, ni viceversa. Nunca se registra el
      // firebaseUid completo ni el token — solo la acción y a quién.
      await tx.auditLog.create({
        data: {
          userId: byEmail.id,
          action: "STAFF_FIREBASE_UID_LINKED",
          entityType: "User",
          entityId: byEmail.id,
          metadata: { method: "POST /api/auth/session" },
        },
      });
      return tx.user.findUniqueOrThrow({ where: { id: byEmail.id } });
    }

    // Perdió la carrera: alguien más escribió firebaseUid entre el
    // findUnique de arriba y este updateMany. Releemos el estado real —
    // puede haber ganado una request concurrente con el mismo uid (éxito,
    // sin duplicar el AuditLog) o una con un uid distinto (conflicto real).
    const current = await tx.user.findUniqueOrThrow({ where: { id: byEmail.id } });
    if (current.firebaseUid !== input.firebaseUid) {
      throw new FirebaseUidConflictError();
    }
    return current;
  });
}
