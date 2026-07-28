import "dotenv/config";

import { PrismaClient, type User } from "@prisma/client";

import { describeStaffUserDiff, parseCreateStaffUserEnv } from "./createStaffUserLogic.js";

const prisma = new PrismaClient();

/**
 * Preprovisiona un usuario ADMIN/VALIDATOR en Postgres (email/displayName/
 * role, status ACTIVE, firebaseUid null) — el paso previo manual para poder
 * crear el primer ADMIN o cualquier VALIDATOR nuevo. La vinculación real con
 * Firebase pasa exclusivamente por `POST /api/auth/session` en el primer
 * login (o, en desarrollo, por `npm run auth:create-test-user` si se quiere
 * saltear Firebase Console — ver docs/LOCAL_SETUP.md). Este script **nunca**
 * toca `firebaseUid`, ni al crear (queda `null`, el default del schema) ni
 * al actualizar. No se ejecuta automáticamente en ningún hook: solo vía
 * `npm run auth:create-staff-user`.
 */
async function main() {
  const input = parseCreateStaffUserEnv(process.env);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        status: "ACTIVE",
      },
    });
    printResult("creado", created);
    return;
  }

  const diff = describeStaffUserDiff(input, existing);
  if (!diff) {
    printResult("sin cambios (ya existía, coincide exactamente con lo pedido)", existing);
    return;
  }

  if (!input.confirmUpdate) {
    // Nunca se degrada/reemplaza un usuario existente sin confirmación
    // explícita: se corta acá, sin escribir nada.
    throw new Error(diff);
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      role: input.role,
      displayName: input.displayName,
      status: "ACTIVE",
    },
  });
  printResult("actualizado (STAFF_CONFIRM_UPDATE=true)", updated);
}

function printResult(action: string, user: Pick<User, "id" | "email" | "displayName" | "role" | "status">): void {
  console.log(`Usuario ${action}:`);
  console.log(`  id:          ${user.id}`);
  console.log(`  email:       ${user.email}`);
  console.log(`  displayName: ${user.displayName ?? "(sin nombre)"}`);
  console.log(`  role:        ${user.role}`);
  console.log(`  status:      ${user.status}`);
  console.log(`  firebaseUid: (sin tocar por este script — se vincula en el primer login real)`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
