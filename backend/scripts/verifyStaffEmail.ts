import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { getFirebaseAuth } from "../src/integrations/firebase/firebaseAdmin.js";
import { parseVerifyStaffEmailEnv } from "./verifyStaffEmailLogic.js";

const prisma = new PrismaClient();

/**
 * Marca `emailVerified: true` en Firebase Auth para un usuario ADMIN/
 * VALIDATOR ya preprovisionado en Postgres (ver `createStaffUser.ts`).
 * Necesario porque "Authentication → Users → Add user" en Firebase Console
 * no marca el email como verificado por defecto, y
 * `verifyBearerFirebaseToken.ts` exige `email_verified === true` de forma
 * estricta (ver docs/DECISIONS.md) — sin esto, el primer login real falla
 * con 401 aunque el token y el `User` preprovisionado sean correctos.
 *
 * Nunca escribe en Postgres: solo lo lee, para confirmar que STAFF_EMAIL
 * corresponde a un ADMIN/VALIDATOR real preprovisionado antes de tocar
 * Firebase — nunca verifica el email de una cuenta arbitraria. Idempotente:
 * si ya estaba verificado, no hace ningún cambio. No se ejecuta
 * automáticamente en ningún hook: solo vía `npm run auth:verify-staff-email`.
 */
async function main() {
  const input = parseVerifyStaffEmailEnv(process.env);

  const staffUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (!staffUser || (staffUser.role !== "ADMIN" && staffUser.role !== "VALIDATOR")) {
    throw new Error(
      "No hay ningún ADMIN/VALIDATOR preprovisionado con ese email en Postgres (ver createStaffUser.ts). No se tocó Firebase.",
    );
  }

  const auth = getFirebaseAuth();
  const firebaseUser = await auth.getUserByEmail(input.email);

  if (firebaseUser.emailVerified) {
    console.log("El email ya estaba verificado en Firebase — no se hizo ningún cambio.");
    return;
  }

  await auth.updateUser(firebaseUser.uid, { emailVerified: true });
  console.log("Email marcado como verificado en Firebase.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
