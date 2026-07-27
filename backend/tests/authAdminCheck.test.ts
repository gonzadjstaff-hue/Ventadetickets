import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeDecodedToken, fakeUser } from "./helpers/authFixtures.js";

/**
 * Mismo aislamiento que authMe.test.ts: ni Firebase ni Postgres reales.
 * Objetivo específico de esta ruta (técnica/temporal, ver
 * modules/auth/routes.ts): validar de punta a punta requireAuth encadenado
 * con requireRole("ADMIN").
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

function authenticateAs(user: ReturnType<typeof fakeUser>): void {
  verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: user.firebaseUid!, email: user.email }));
  findUniqueMock.mockResolvedValueOnce(user);
}

describe("GET /api/auth/admin-check", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("responde 401 sin autenticación", async () => {
    const response = await request(app).get("/api/auth/admin-check");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHORIZED", message: "No autorizado." } });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("responde 403 con un usuario autenticado con rol VALIDATOR (no permitido acá)", async () => {
    authenticateAs(fakeUser({ role: "VALIDATOR" }));

    const response = await request(app).get("/api/auth/admin-check").set("Authorization", "Bearer token-validator");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "FORBIDDEN", message: "No tenés permisos para realizar esta acción." },
    });
  });

  it("responde 403 con un usuario autenticado con rol USER (no permitido acá)", async () => {
    authenticateAs(fakeUser({ role: "USER" }));

    const response = await request(app).get("/api/auth/admin-check").set("Authorization", "Bearer token-user");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("responde 200 con un usuario autenticado con rol ADMIN", async () => {
    authenticateAs(fakeUser({ role: "ADMIN" }));

    const response = await request(app).get("/api/auth/admin-check").set("Authorization", "Bearer token-admin");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, message: "Admin access confirmed" });
  });

  it("requireRole decide exclusivamente por req.authUser: un VALIDATOR autenticado sigue en 403 aunque mande pistas falsas de rol ADMIN en headers/query/body", async () => {
    authenticateAs(fakeUser({ role: "VALIDATOR" }));

    const response = await request(app)
      .get("/api/auth/admin-check?role=ADMIN")
      .set("Authorization", "Bearer token-validator")
      .set("x-role", "ADMIN")
      .send({ role: "ADMIN" });

    expect(response.status).toBe(403);
  });

  it("un usuario BLOCKED nunca llega a requireRole: requireAuth ya lo corta antes con 403", async () => {
    authenticateAs(fakeUser({ role: "ADMIN", status: "BLOCKED" }));

    const response = await request(app).get("/api/auth/admin-check").set("Authorization", "Bearer token-bloqueado");

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe("No tenés permisos para realizar esta acción.");
  });
});
