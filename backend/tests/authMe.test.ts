import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeDecodedToken, fakeUser } from "./helpers/authFixtures.js";

/**
 * Aislado por completo de servicios externos: ni Firebase ni Postgres se
 * tocan de verdad. `firebaseAdmin.js` se mockea igual que en
 * requireAuth.test.ts (Etapa 1); acá además se mockea `shared/prisma.js`
 * entero, así que ni siquiera abre una conexión a la base de test — a
 * diferencia de requireAuth.test.ts, que sí ejercita Prisma contra
 * tickets_test.
 */
const { verifyFirebaseIdTokenMock, findUniqueMock } = vi.hoisted(() => ({
  verifyFirebaseIdTokenMock: vi.fn(),
  findUniqueMock: vi.fn(),
}));

vi.mock("../src/integrations/firebase/firebaseAdmin.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/integrations/firebase/firebaseAdmin.js")>();
  return {
    ...original,
    verifyFirebaseIdToken: verifyFirebaseIdTokenMock,
  };
});

vi.mock("../src/shared/prisma.js", () => ({
  prisma: { user: { findUnique: findUniqueMock } },
}));

const { createApp } = await import("../src/app.js");

const app = createApp();

describe("GET /api/auth/me", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("responde 401 sin Authorization header", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHORIZED", message: "No autorizado." } });
    expect(verifyFirebaseIdTokenMock).not.toHaveBeenCalled();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("responde 401 si Authorization no usa el esquema Bearer", async () => {
    const response = await request(app).get("/api/auth/me").set("Authorization", "Basic dXNlcjpwYXNz");

    expect(response.status).toBe(401);
    expect(verifyFirebaseIdTokenMock).not.toHaveBeenCalled();
  });

  it("responde 401 si el Bearer no trae token", async () => {
    const response = await request(app).get("/api/auth/me").set("Authorization", "Bearer ");

    expect(response.status).toBe(401);
    expect(verifyFirebaseIdTokenMock).not.toHaveBeenCalled();
  });

  it("responde 401 si el token es inválido (Firebase lo rechaza)", async () => {
    verifyFirebaseIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Firebase ID token has invalid signature."), { code: "auth/argument-error" }),
    );

    const response = await request(app).get("/api/auth/me").set("Authorization", "Bearer token-invalido");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHORIZED", message: "No autorizado." } });
    expect(JSON.stringify(response.body)).not.toContain("invalid signature");
  });

  it("responde con el error controlado (500 FIREBASE_NOT_CONFIGURED) si Firebase no está configurado", async () => {
    const { FirebaseNotConfiguredError } = await import("../src/integrations/firebase/firebaseAdmin.js");
    verifyFirebaseIdTokenMock.mockRejectedValueOnce(new FirebaseNotConfiguredError());

    const response = await request(app).get("/api/auth/me").set("Authorization", "Bearer cualquier-token");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "FIREBASE_NOT_CONFIGURED", message: "La autenticación no está disponible en este momento." },
    });
  });

  it("responde 401 si el token es válido pero no existe ningún User en Postgres con ese firebaseUid", async () => {
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: "uid-sin-user" }));
    findUniqueMock.mockResolvedValueOnce(null);

    const response = await request(app).get("/api/auth/me").set("Authorization", "Bearer token-valido");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { firebaseUid: "uid-sin-user" } });
  });

  it("responde 403 si el token es válido pero el User está BLOCKED", async () => {
    const blockedUser = fakeUser({ status: "BLOCKED" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(
      fakeDecodedToken({ uid: blockedUser.firebaseUid!, email: blockedUser.email }),
    );
    findUniqueMock.mockResolvedValueOnce(blockedUser);

    const response = await request(app).get("/api/auth/me").set("Authorization", "Bearer token-valido");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "FORBIDDEN", message: "No tenés permisos para realizar esta acción." },
    });
  });

  it("responde 200 con el perfil mínimo cuando el token es válido y el User está ACTIVE", async () => {
    const user = fakeUser({ role: "ADMIN", status: "ACTIVE" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: user.firebaseUid!, email: user.email }));
    findUniqueMock.mockResolvedValueOnce(user);

    const response = await request(app).get("/api/auth/me").set("Authorization", "Bearer token-valido");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
  });

  it("la respuesta 200 nunca expone el token, ni displayName/phone/createdAt/updatedAt/emailVerified", async () => {
    const user = fakeUser({ role: "VALIDATOR", displayName: "No debería aparecer", phone: "+5491100000000" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: user.firebaseUid!, email: user.email }));
    findUniqueMock.mockResolvedValueOnce(user);

    const response = await request(app).get("/api/auth/me").set("Authorization", "Bearer token-super-secreto-123");

    expect(Object.keys(response.body.user).sort()).toEqual(["email", "firebaseUid", "id", "role", "status"]);
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain("token-super-secreto-123");
    expect(raw).not.toContain("No debería aparecer");
    expect(raw).not.toContain("+5491100000000");
    expect(raw).not.toContain("createdAt");
    expect(raw).not.toContain("emailVerified");
  });
});
