import { randomUUID } from "node:crypto";

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { verifyFirebaseIdTokenMock } = vi.hoisted(() => ({
  verifyFirebaseIdTokenMock: vi.fn(),
}));

// Se mockea la integración entera: estos tests ejercitan la lógica real del
// middleware y de Prisma, nunca el SDK de Firebase (ni credenciales reales).
vi.mock("../src/integrations/firebase/firebaseAdmin.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/integrations/firebase/firebaseAdmin.js")>();
  return {
    ...original,
    verifyFirebaseIdToken: verifyFirebaseIdTokenMock,
  };
});

const { errorHandler } = await import("../src/middlewares/errorHandler.js");
const { requireAuth } = await import("../src/middlewares/requireAuth.js");
const { createFixtureUser, cleanupUserByEmail } = await import("./helpers/fixtures.js");

function buildTestApp() {
  const app = express();
  app.get("/protected", requireAuth, (req, res) => {
    res.json({ authUser: req.authUser });
  });
  app.use(errorHandler);
  return app;
}

function decodedToken(overrides: Partial<{ uid: string; email: string; email_verified: boolean }> = {}) {
  return {
    uid: "uid-default",
    email: "default@test.pulse.local",
    email_verified: true,
    ...overrides,
  };
}

describe("requireAuth", () => {
  const emailsToCleanup: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();
    for (const email of emailsToCleanup.splice(0)) {
      await cleanupUserByEmail(email);
    }
  });

  it("responde 401 sin exponer detalles si falta el header Authorization", async () => {
    const app = buildTestApp();

    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHORIZED", message: "No autorizado." } });
    expect(verifyFirebaseIdTokenMock).not.toHaveBeenCalled();
  });

  it("responde 401 si el esquema de autenticación no es Bearer", async () => {
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Basic dXNlcjpwYXNz");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(verifyFirebaseIdTokenMock).not.toHaveBeenCalled();
  });

  it("responde 401 si el token Bearer está vacío", async () => {
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer ");

    expect(response.status).toBe(401);
    expect(verifyFirebaseIdTokenMock).not.toHaveBeenCalled();
  });

  it("responde 401 si Firebase rechaza el token (firma inválida) sin filtrar el motivo real", async () => {
    verifyFirebaseIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Firebase ID token has invalid signature."), { code: "auth/argument-error" }),
    );
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-malo");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHORIZED", message: "No autorizado." } });
    expect(JSON.stringify(response.body)).not.toContain("invalid signature");
  });

  it("responde 401 si el token está expirado", async () => {
    verifyFirebaseIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Firebase ID token has expired."), { code: "auth/id-token-expired" }),
    );
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-expirado");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 401 si el token fue revocado", async () => {
    verifyFirebaseIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Firebase ID token has been revoked."), { code: "auth/id-token-revoked" }),
    );
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-revocado");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 401 si el token no contiene email", async () => {
    verifyFirebaseIdTokenMock.mockResolvedValueOnce({ uid: "uid-sin-email", email_verified: true });
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-sin-email");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 401 si email_verified no es true", async () => {
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(
      decodedToken({ uid: "uid-no-verificado", email: "no-verificado@test.pulse.local", email_verified: false }),
    );
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-no-verificado");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 401 si no existe un User interno vinculado a ese firebaseUid (sin vinculación automática por email)", async () => {
    const uid = `uid-huerfano-${randomUUID()}`;
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(decodedToken({ uid, email: "huerfano@test.pulse.local" }));
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-sin-user");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 403 (no 401) si el User interno está BLOCKED", async () => {
    const suffix = randomUUID();
    const user = await createFixtureUser({
      email: `blocked-${suffix}@test.pulse.local`,
      firebaseUid: `uid-blocked-${suffix}`,
      role: "ADMIN",
      status: "BLOCKED",
    });
    emailsToCleanup.push(user.email);
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(decodedToken({ uid: user.firebaseUid!, email: user.email }));
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-bloqueado");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "FORBIDDEN", message: "No tenés permisos para realizar esta acción." },
    });
  });

  it("adjunta req.authUser y deja pasar a un User ACTIVE con role ADMIN", async () => {
    const suffix = randomUUID();
    const user = await createFixtureUser({
      email: `admin-${suffix}@test.pulse.local`,
      firebaseUid: `uid-admin-${suffix}`,
      role: "ADMIN",
      status: "ACTIVE",
    });
    emailsToCleanup.push(user.email);
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(decodedToken({ uid: user.firebaseUid!, email: user.email }));
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-admin");

    expect(response.status).toBe(200);
    expect(response.body.authUser).toEqual({
      firebaseUid: user.firebaseUid,
      email: user.email,
      emailVerified: true,
      userId: user.id,
      role: "ADMIN",
      status: "ACTIVE",
    });
  });

  it("adjunta req.authUser y deja pasar a un User ACTIVE con role VALIDATOR", async () => {
    const suffix = randomUUID();
    const user = await createFixtureUser({
      email: `validator-${suffix}@test.pulse.local`,
      firebaseUid: `uid-validator-${suffix}`,
      role: "VALIDATOR",
      status: "ACTIVE",
    });
    emailsToCleanup.push(user.email);
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(decodedToken({ uid: user.firebaseUid!, email: user.email }));
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-validator");

    expect(response.status).toBe(200);
    expect(response.body.authUser.role).toBe("VALIDATOR");
    expect(response.body.authUser.userId).toBe(user.id);
  });

  it("un error inesperado/no clasificado del SDK nunca filtra su mensaje crudo en la respuesta", async () => {
    verifyFirebaseIdTokenMock.mockRejectedValueOnce(
      new Error("stack trace interno con detalles de la cuenta de servicio y del proyecto de Firebase"),
    );
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-cualquiera");

    expect(response.status).toBe(401);
    expect(JSON.stringify(response.body)).not.toContain("cuenta de servicio");
    expect(JSON.stringify(response.body)).not.toContain("stack trace");
  });

  it("propaga como 500 (no 401) un error de configuración del propio servidor (FirebaseNotConfiguredError)", async () => {
    const { FirebaseNotConfiguredError } = await import("../src/integrations/firebase/firebaseAdmin.js");
    verifyFirebaseIdTokenMock.mockRejectedValueOnce(new FirebaseNotConfiguredError());
    const app = buildTestApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer token-cualquiera");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("FIREBASE_NOT_CONFIGURED");
  });
});
