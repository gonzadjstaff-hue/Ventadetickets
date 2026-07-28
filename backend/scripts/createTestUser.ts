import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { describeFirebaseUidConflict, parseCreateTestUserEnv } from "./createTestUserLogic.js";

const prisma = new PrismaClient();

/**
 * Inserta o actualiza un usuario ADMIN/VALIDATOR de prueba para validar el
 * flujo de Firebase Auth de punta a punta (ver docs/LOCAL_SETUP.md, sección
 * 8). Nunca crea nada en Firebase (el usuario de Firebase se crea a mano en
 * la Console, antes de correr esto) — solo escribe en `User` de Postgres.
 * No se ejecuta automáticamente en ningún hook (postinstall, seed, tests):
 * solo vía `npm run auth:create-test-user`.
 */
async function main() {
  const input = parseCreateTestUserEnv(process.env);

  // Chequeo explícito ANTES de cualquier escritura: si el firebaseUid ya
  // pertenece a otro email, cortamos acá con un mensaje claro en vez de
  // dejar que el upsert de abajo falle con un P2002 crudo de Prisma.
  const existingByFirebaseUid = await prisma.user.findUnique({
    where: { firebaseUid: input.firebaseUid },
    select: { email: true },
  });
  const conflict = describeFirebaseUidConflict(input, existingByFirebaseUid);
  if (conflict) {
    throw new Error(conflict);
  }

  const existedBeforeByEmail = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      firebaseUid: input.firebaseUid,
      role: input.role,
      status: input.status,
    },
    create: {
      email: input.email,
      firebaseUid: input.firebaseUid,
      role: input.role,
      status: input.status,
    },
  });

  // Nunca se imprime DATABASE_URL ni ninguna otra variable de entorno más
  // allá de los 5 campos del propio registro creado/actualizado.
  console.log(`Usuario ${existedBeforeByEmail ? "actualizado" : "creado"}:`);
  console.log(`  id:          ${user.id}`);
  console.log(`  email:       ${user.email}`);
  console.log(`  firebaseUid: ${user.firebaseUid}`);
  console.log(`  role:        ${user.role}`);
  console.log(`  status:      ${user.status}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
