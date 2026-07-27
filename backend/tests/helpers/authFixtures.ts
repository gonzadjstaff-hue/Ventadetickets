import type { User } from "@prisma/client";

/**
 * Fila de `User` "de mentira", con todos los campos del modelo — para los
 * tests de autenticación que mockean Prisma entero (`shared/prisma.js`) en
 * vez de usar la base de test real. Nunca toca Postgres. Ver
 * backend/tests/authMe.test.ts y authAdminCheck.test.ts.
 */
export function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-fake-1",
    firebaseUid: "uid-fake-1",
    email: "fake@test.pulse.local",
    displayName: null,
    phone: null,
    role: "ADMIN",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/**
 * Forma mínima de lo que `verifyFirebaseIdToken` resuelve, para mockearlo
 * sin depender del tipo completo `DecodedIdToken` del SDK.
 */
export function fakeDecodedToken(
  overrides: Partial<{ uid: string; email: string; email_verified: boolean }> = {},
) {
  return {
    uid: "uid-fake-1",
    email: "fake@test.pulse.local",
    email_verified: true,
    ...overrides,
  };
}
