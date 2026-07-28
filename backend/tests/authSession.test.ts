import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeDecodedToken, fakeUser } from "./helpers/authFixtures.js";

/**
 * Aislado por completo de servicios externos: ni Firebase ni Postgres se
 * tocan de verdad. Se mockea `firebaseAdmin.js` (igual que en
 * requireAuth.test.ts/authMe.test.ts) y `shared/prisma.js` entero, incluido
 * `$transaction` (se ejecuta el callback contra el mismo objeto mockeado,
 * ya que estos tests no necesitan aislamiento real de transacción).
 */
const { verifyFirebaseIdTokenMock, findUniqueMock, updateManyMock, findUniqueOrThrowMock, auditLogCreateMock, transactionMock } =
  vi.hoisted(() => ({
    verifyFirebaseIdTokenMock: vi.fn(),
    findUniqueMock: vi.fn(),
    updateManyMock: vi.fn(),
    findUniqueOrThrowMock: vi.fn(),
    auditLogCreateMock: vi.fn(),
    transactionMock: vi.fn(),
  }));

vi.mock("../src/integrations/firebase/firebaseAdmin.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/integrations/firebase/firebaseAdmin.js")>();
  return {
    ...original,
    verifyFirebaseIdToken: verifyFirebaseIdTokenMock,
  };
});

const mockedTx = {
  user: { updateMany: updateManyMock, findUniqueOrThrow: findUniqueOrThrowMock },
  auditLog: { create: auditLogCreateMock },
};

vi.mock("../src/shared/prisma.js", () => ({
  prisma: {
    user: { findUnique: findUniqueMock, updateMany: updateManyMock, findUniqueOrThrow: findUniqueOrThrowMock },
    auditLog: { create: auditLogCreateMock },
    $transaction: transactionMock,
  },
}));

const { createApp } = await import("../src/app.js");

const app = createApp();

function postSession(body: unknown = undefined, token = "token-valido") {
  const req = request(app).post("/api/auth/session").set("Authorization", `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

describe("POST /api/auth/session", () => {
  beforeEach(() => {
    transactionMock.mockImplementation(async (callback: (tx: typeof mockedTx) => unknown) => callback(mockedTx));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("responde 401 sin Authorization header", async () => {
    const response = await request(app).post("/api/auth/session").send();

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHORIZED", message: "No autorizado." } });
    expect(verifyFirebaseIdTokenMock).not.toHaveBeenCalled();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("responde 401 si el token es inválido (Firebase lo rechaza)", async () => {
    verifyFirebaseIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Firebase ID token has invalid signature."), { code: "auth/argument-error" }),
    );

    const response = await postSession();

    expect(response.status).toBe(401);
    expect(JSON.stringify(response.body)).not.toContain("invalid signature");
  });

  it("responde 401 si el email no está verificado", async () => {
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ email_verified: false }));

    const response = await postSession();

    expect(response.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("responde 401 si el token no contiene email", async () => {
    verifyFirebaseIdTokenMock.mockResolvedValueOnce({ uid: "uid-sin-email", email_verified: true });

    const response = await postSession();

    expect(response.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("caso A — User ya vinculado y ACTIVE: devuelve el perfil sin escribir nada", async () => {
    const user = fakeUser({ role: "ADMIN", status: "ACTIVE" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: user.firebaseUid!, email: user.email }));
    findUniqueMock.mockResolvedValueOnce(user); // findUnique por firebaseUid

    const response = await postSession();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: user.id, email: user.email, role: "ADMIN", status: "ACTIVE" },
    });
    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { firebaseUid: user.firebaseUid } });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("caso A — User ya vinculado y BLOCKED: 403", async () => {
    const user = fakeUser({ status: "BLOCKED" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: user.firebaseUid!, email: user.email }));
    findUniqueMock.mockResolvedValueOnce(user);

    const response = await postSession();

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "FORBIDDEN", message: "No tenés permisos para realizar esta acción." },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("caso B — User inexistente (ni por firebaseUid ni por email): 401 genérico", async () => {
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: "uid-nuevo", email: "nadie@test.pulse.local" }));
    findUniqueMock.mockResolvedValueOnce(null); // por firebaseUid
    findUniqueMock.mockResolvedValueOnce(null); // por email

    const response = await postSession();

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHORIZED", message: "No autorizado." } });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("caso B — User preprovisionado por email, BLOCKED: 403 sin vincular", async () => {
    const preprovisioned = fakeUser({ firebaseUid: null, status: "BLOCKED" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(
      fakeDecodedToken({ uid: "uid-nuevo", email: preprovisioned.email }),
    );
    findUniqueMock.mockResolvedValueOnce(null); // por firebaseUid
    findUniqueMock.mockResolvedValueOnce(preprovisioned); // por email

    const response = await postSession();

    expect(response.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("caso B — User con otro firebaseUid ya asignado: 409, sin mencionar el otro uid ni escribir nada", async () => {
    const other = fakeUser({ firebaseUid: "uid-de-otra-cuenta", status: "ACTIVE" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: "uid-atacante", email: other.email }));
    findUniqueMock.mockResolvedValueOnce(null); // por firebaseUid (uid-atacante no existe)
    findUniqueMock.mockResolvedValueOnce(other); // por email, ya tiene otro firebaseUid

    const response = await postSession();

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: "FIREBASE_UID_CONFLICT", message: "Esta cuenta ya está vinculada a otro usuario de Firebase." },
    });
    expect(JSON.stringify(response.body)).not.toContain("uid-de-otra-cuenta");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("caso B — preprovisionado con firebaseUid null: vinculación exitosa, AuditLog creado, respuesta correcta", async () => {
    const preprovisioned = fakeUser({ firebaseUid: null, role: "VALIDATOR", status: "ACTIVE" });
    const linked = { ...preprovisioned, firebaseUid: "uid-nuevo" };

    verifyFirebaseIdTokenMock.mockResolvedValueOnce(
      fakeDecodedToken({ uid: "uid-nuevo", email: preprovisioned.email }),
    );
    findUniqueMock.mockResolvedValueOnce(null); // por firebaseUid
    findUniqueMock.mockResolvedValueOnce(preprovisioned); // por email
    updateManyMock.mockResolvedValueOnce({ count: 1 });
    findUniqueOrThrowMock.mockResolvedValueOnce(linked);

    const response = await postSession();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: linked.id, email: linked.email, role: "VALIDATOR", status: "ACTIVE" },
    });

    // Vinculación atómica por id + firebaseUid: null.
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: preprovisioned.id, firebaseUid: null },
      data: { firebaseUid: "uid-nuevo" },
    });

    // AuditLog creado, sin firebaseUid completo ni token en metadata.
    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    const auditCall = auditLogCreateMock.mock.calls[0]?.[0];
    expect(auditCall.data).toMatchObject({
      userId: preprovisioned.id,
      action: "STAFF_FIREBASE_UID_LINKED",
      entityType: "User",
      entityId: preprovisioned.id,
    });
    expect(JSON.stringify(auditCall.data.metadata)).not.toContain("uid-nuevo");
    expect(JSON.stringify(auditCall)).not.toContain("token-valido");
  });

  it("conflicto concurrente — perdió la carrera y el ganador fue OTRO firebaseUid: 409", async () => {
    const preprovisioned = fakeUser({ firebaseUid: null, status: "ACTIVE" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: "uid-mio", email: preprovisioned.email }));
    findUniqueMock.mockResolvedValueOnce(null);
    findUniqueMock.mockResolvedValueOnce(preprovisioned);
    updateManyMock.mockResolvedValueOnce({ count: 0 }); // perdió la carrera
    findUniqueOrThrowMock.mockResolvedValueOnce({ ...preprovisioned, firebaseUid: "uid-de-otra-request" });

    const response = await postSession();

    expect(response.status).toBe(409);
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("conflicto concurrente — perdió la carrera pero el ganador fue la MISMA request (mismo uid): 200, sin duplicar el AuditLog", async () => {
    const preprovisioned = fakeUser({ firebaseUid: null, status: "ACTIVE" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: "uid-mio", email: preprovisioned.email }));
    findUniqueMock.mockResolvedValueOnce(null);
    findUniqueMock.mockResolvedValueOnce(preprovisioned);
    updateManyMock.mockResolvedValueOnce({ count: 0 });
    findUniqueOrThrowMock.mockResolvedValueOnce({ ...preprovisioned, firebaseUid: "uid-mio" });

    const response = await postSession();

    expect(response.status).toBe(200);
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("el rol de la respuesta siempre sale de Postgres, nunca del token", async () => {
    const user = fakeUser({ role: "ADMIN", status: "ACTIVE" });
    // El decoded token de Firebase no tiene (ni podría tener, en un caso real
    // no confiable) ningún campo "role" — igual la respuesta trae el de la DB.
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: user.firebaseUid!, email: user.email }));
    findUniqueMock.mockResolvedValueOnce(user);

    const response = await postSession();

    expect(response.body.user.role).toBe("ADMIN");
  });

  it("ignora completamente email/role/firebaseUid falsos enviados en el body", async () => {
    const user = fakeUser({ id: "user-real", email: "real@test.pulse.local", role: "VALIDATOR", status: "ACTIVE" });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: user.firebaseUid!, email: user.email }));
    findUniqueMock.mockResolvedValueOnce(user);

    const response = await postSession({
      email: "atacante@evil.test",
      role: "ADMIN",
      firebaseUid: "uid-inventado",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: "user-real", email: "real@test.pulse.local", role: "VALIDATOR", status: "ACTIVE" },
    });
    // Nunca se buscó nada con los valores del body.
    expect(findUniqueMock).not.toHaveBeenCalledWith({ where: { firebaseUid: "uid-inventado" } });
  });

  it("la respuesta nunca expone firebaseUid, token, teléfono, displayName ni fechas", async () => {
    const user = fakeUser({
      role: "ADMIN",
      status: "ACTIVE",
      displayName: "No debería aparecer",
      phone: "+5491100000000",
    });
    verifyFirebaseIdTokenMock.mockResolvedValueOnce(fakeDecodedToken({ uid: user.firebaseUid!, email: user.email }));
    findUniqueMock.mockResolvedValueOnce(user);

    const response = await postSession(undefined, "token-super-secreto-999");

    expect(Object.keys(response.body.user).sort()).toEqual(["email", "id", "role", "status"]);
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain("token-super-secreto-999");
    expect(raw).not.toContain(user.firebaseUid!);
    expect(raw).not.toContain("No debería aparecer");
    expect(raw).not.toContain("+5491100000000");
    expect(raw).not.toContain("createdAt");
  });
});
