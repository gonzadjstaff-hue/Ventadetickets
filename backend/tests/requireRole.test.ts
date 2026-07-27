import type { UserRole } from "@prisma/client";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../src/middlewares/errorHandler.js";
import { requireRole } from "../src/middlewares/requireRole.js";
import type { AuthenticatedUser } from "../src/middlewares/authTypes.js";

/**
 * requireRole asume que requireAuth ya corrió. Estos tests lo ejercitan de
 * forma aislada: un middleware previo simula el resultado de requireAuth
 * (adjunta o no req.authUser con el role indicado), nunca pasa por Firebase
 * ni por Prisma — eso ya lo cubre requireAuth.test.ts. La ruta de prueba
 * existe únicamente dentro de este archivo de test, no se monta en la app de
 * producción.
 */
function buildTestApp(allowedRoles: UserRole[], authUser: AuthenticatedUser | null) {
  const app = express();
  app.get(
    "/protected",
    (req, _res, next) => {
      if (authUser) req.authUser = authUser;
      next();
    },
    requireRole(...allowedRoles),
    (req, res) => {
      res.json({ ok: true, role: req.authUser?.role });
    },
  );
  app.use(errorHandler);
  return app;
}

function fakeAuthUser(role: UserRole, overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    firebaseUid: "uid-fake",
    email: "fake@test.pulse.local",
    emailVerified: true,
    userId: "user-fake",
    role,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("requireRole", () => {
  it("responde 401 si no hay contexto autenticado (req.authUser ausente)", async () => {
    const app = buildTestApp(["ADMIN"], null);

    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHORIZED", message: "No autorizado." } });
  });

  it("permite el acceso a ADMIN en una ruta que exige ADMIN", async () => {
    const app = buildTestApp(["ADMIN"], fakeAuthUser("ADMIN"));

    const response = await request(app).get("/protected");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, role: "ADMIN" });
  });

  it("permite el acceso a VALIDATOR cuando la ruta lo incluye entre los roles permitidos", async () => {
    const app = buildTestApp(["ADMIN", "VALIDATOR"], fakeAuthUser("VALIDATOR"));

    const response = await request(app).get("/protected");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, role: "VALIDATOR" });
  });

  it("rechaza con 403 a VALIDATOR en una ruta que exige exclusivamente ADMIN", async () => {
    const app = buildTestApp(["ADMIN"], fakeAuthUser("VALIDATOR"));

    const response = await request(app).get("/protected");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "FORBIDDEN", message: "No tenés permisos para realizar esta acción." },
    });
  });

  it("rechaza con 403 a USER en una ruta de ADMIN/VALIDATOR", async () => {
    const app = buildTestApp(["ADMIN", "VALIDATOR"], fakeAuthUser("USER"));

    const response = await request(app).get("/protected");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("permite múltiples roles: ADMIN y VALIDATOR pasan la misma ruta, cada uno con su propio contexto", async () => {
    const adminApp = buildTestApp(["ADMIN", "VALIDATOR"], fakeAuthUser("ADMIN"));
    const validatorApp = buildTestApp(["ADMIN", "VALIDATOR"], fakeAuthUser("VALIDATOR"));

    const adminResponse = await request(adminApp).get("/protected");
    const validatorResponse = await request(validatorApp).get("/protected");

    expect(adminResponse.status).toBe(200);
    expect(validatorResponse.status).toBe(200);
  });

  it("nunca lee el rol desde un header personalizado: un USER autenticado con header x-role: ADMIN sigue rechazado", async () => {
    const app = buildTestApp(["ADMIN"], fakeAuthUser("USER"));

    const response = await request(app).get("/protected").set("x-role", "ADMIN");

    expect(response.status).toBe(403);
  });

  it("nunca lee el rol desde el body ni la query: un USER autenticado con role=ADMIN en el body/query sigue rechazado", async () => {
    const app = buildTestApp(["ADMIN"], fakeAuthUser("USER"));

    const response = await request(app).get("/protected?role=ADMIN").send({ role: "ADMIN" });

    expect(response.status).toBe(403);
  });
});
