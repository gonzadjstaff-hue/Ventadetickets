import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Nunca llama al SDK real de Firebase (ni sale a la red, ni requiere
 * credenciales reales): se reemplazan `firebase-admin/app` y
 * `firebase-admin/auth` enteros por mocks controlados, igual criterio que
 * mercadoPagoCheckout.test.ts con el proveedor de Mercado Pago.
 */
const { certMock, getAppsMock, initializeAppMock, getAuthMock, verifyIdTokenMock } = vi.hoisted(() => ({
  certMock: vi.fn((options: unknown) => ({ __cert: options })),
  getAppsMock: vi.fn(() => [] as unknown[]),
  initializeAppMock: vi.fn((options: unknown) => ({ __app: options })),
  getAuthMock: vi.fn((app: unknown) => ({ verifyIdToken: verifyIdTokenMock, __app: app })),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock("firebase-admin/app", () => ({
  cert: certMock,
  getApps: getAppsMock,
  initializeApp: initializeAppMock,
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: getAuthMock,
}));

const FIREBASE_ENV_KEYS = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"] as const;
const originalEnv = Object.fromEntries(FIREBASE_ENV_KEYS.map((key) => [key, process.env[key]]));

function setCompleteFirebaseEnv(privateKey = "-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----\n") {
  process.env.FIREBASE_PROJECT_ID = "demo-project";
  process.env.FIREBASE_CLIENT_EMAIL = "sa@demo-project.iam.gserviceaccount.com";
  process.env.FIREBASE_PRIVATE_KEY = privateKey;
}

afterEach(() => {
  for (const key of FIREBASE_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  certMock.mockClear();
  initializeAppMock.mockClear();
  getAuthMock.mockClear();
  getAppsMock.mockReset();
  getAppsMock.mockReturnValue([]);
  verifyIdTokenMock.mockReset();
});

async function freshFirebaseAdminModule() {
  vi.resetModules();
  return import("../src/integrations/firebase/firebaseAdmin.js");
}

describe("firebaseAdmin: inicialización perezosa", () => {
  it("importar el módulo no inicializa nada (sin credenciales configuradas)", async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    await freshFirebaseAdminModule();

    expect(initializeAppMock).not.toHaveBeenCalled();
    expect(certMock).not.toHaveBeenCalled();
  });

  it("verifyFirebaseIdToken lanza FirebaseNotConfiguredError si falta cualquiera de las 3 credenciales", async () => {
    for (const missingKey of FIREBASE_ENV_KEYS) {
      setCompleteFirebaseEnv();
      delete process.env[missingKey];

      const { verifyFirebaseIdToken, FirebaseNotConfiguredError } = await freshFirebaseAdminModule();

      await expect(verifyFirebaseIdToken("cualquier-token")).rejects.toBeInstanceOf(FirebaseNotConfiguredError);
      expect(initializeAppMock).not.toHaveBeenCalled();
    }
  });

  it("el error de configuración no incluye ninguna credencial ni detalle interno en su mensaje", async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();

    await expect(verifyFirebaseIdToken("token")).rejects.toMatchObject({
      code: "FIREBASE_NOT_CONFIGURED",
      statusCode: 500,
      message: "La autenticación no está disponible en este momento.",
    });
  });

  it("normaliza los \\n literales de FIREBASE_PRIVATE_KEY a saltos de línea reales antes de inicializar", async () => {
    setCompleteFirebaseEnv("-----BEGIN PRIVATE KEY-----\\nAAA\\nBBB\\n-----END PRIVATE KEY-----\\n");
    verifyIdTokenMock.mockResolvedValueOnce({ uid: "uid-1", email: "a@test.pulse.local", email_verified: true });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await verifyFirebaseIdToken("token");

    expect(certMock).toHaveBeenCalledTimes(1);
    const passedKey = (certMock.mock.calls[0]?.[0] as { privateKey: string }).privateKey;
    expect(passedKey).toContain("\n");
    expect(passedKey).not.toContain("\\n");
    expect(passedKey.startsWith("-----BEGIN PRIVATE KEY-----\n")).toBe(true);
  });

  it("una clave que ya tiene saltos de línea reales queda igual (no le agrega ni le saca nada)", async () => {
    const alreadyRealNewlines = "-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----\n";
    setCompleteFirebaseEnv(alreadyRealNewlines);
    verifyIdTokenMock.mockResolvedValueOnce({ uid: "uid-1", email: "a@test.pulse.local", email_verified: true });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await verifyFirebaseIdToken("token");

    const passedKey = (certMock.mock.calls[0]?.[0] as { privateKey: string }).privateKey;
    expect(passedKey).toBe(alreadyRealNewlines);
  });

  it("quita comillas dobles envolventes (paste del campo JSON completo, con \\n literales adentro)", async () => {
    const inner = "-----BEGIN PRIVATE KEY-----\\nAAA\\nBBB\\n-----END PRIVATE KEY-----\\n";
    setCompleteFirebaseEnv(`"${inner}"`);
    verifyIdTokenMock.mockResolvedValueOnce({ uid: "uid-1", email: "a@test.pulse.local", email_verified: true });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await verifyFirebaseIdToken("token");

    const passedKey = (certMock.mock.calls[0]?.[0] as { privateKey: string }).privateKey;
    expect(passedKey.startsWith('"')).toBe(false);
    expect(passedKey.endsWith('"')).toBe(false);
    expect(passedKey).toBe("-----BEGIN PRIVATE KEY-----\nAAA\nBBB\n-----END PRIVATE KEY-----\n");
  });

  it("quita comillas simples envolventes (clave ya con saltos de línea reales adentro)", async () => {
    const inner = "-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----\n";
    setCompleteFirebaseEnv(`'${inner}'`);
    verifyIdTokenMock.mockResolvedValueOnce({ uid: "uid-1", email: "a@test.pulse.local", email_verified: true });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await verifyFirebaseIdToken("token");

    const passedKey = (certMock.mock.calls[0]?.[0] as { privateKey: string }).privateKey;
    expect(passedKey).toBe(inner);
  });

  it("no toca comillas que no envuelven el valor completo (asimétricas o en el medio)", async () => {
    const asymmetric = '"-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----\n';
    setCompleteFirebaseEnv(asymmetric);
    verifyIdTokenMock.mockResolvedValueOnce({ uid: "uid-1", email: "a@test.pulse.local", email_verified: true });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await verifyFirebaseIdToken("token");

    const passedKey = (certMock.mock.calls[0]?.[0] as { privateKey: string }).privateKey;
    expect(passedKey).toBe(asymmetric);
  });

  it("rechaza como configuración incompleta (500, nunca 401) una clave sin los marcadores PEM esperados", async () => {
    setCompleteFirebaseEnv("esto-no-es-una-clave-privada-valida");

    const { verifyFirebaseIdToken, FirebaseNotConfiguredError } = await freshFirebaseAdminModule();

    await expect(verifyFirebaseIdToken("token")).rejects.toBeInstanceOf(FirebaseNotConfiguredError);
    expect(certMock).not.toHaveBeenCalled();
    expect(initializeAppMock).not.toHaveBeenCalled();
  });

  it("rechaza como configuración incompleta una clave truncada (falta el marcador END, paste cortado)", async () => {
    setCompleteFirebaseEnv("-----BEGIN PRIVATE KEY-----\\nAAA\\nBBB");

    const { verifyFirebaseIdToken, FirebaseNotConfiguredError } = await freshFirebaseAdminModule();

    await expect(verifyFirebaseIdToken("token")).rejects.toBeInstanceOf(FirebaseNotConfiguredError);
    expect(certMock).not.toHaveBeenCalled();
  });

  it("el error de clave con formato inválido no incluye ninguna credencial ni detalle interno en su mensaje", async () => {
    setCompleteFirebaseEnv("esto-no-es-una-clave-privada-valida");

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();

    await expect(verifyFirebaseIdToken("token")).rejects.toMatchObject({
      code: "FIREBASE_NOT_CONFIGURED",
      statusCode: 500,
      message: "La autenticación no está disponible en este momento.",
    });
  });

  it("inicializa la app una sola vez aunque se verifiquen varios tokens", async () => {
    setCompleteFirebaseEnv();
    verifyIdTokenMock.mockResolvedValue({ uid: "uid-1", email: "a@test.pulse.local", email_verified: true });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await verifyFirebaseIdToken("token-1");
    await verifyFirebaseIdToken("token-2");

    expect(initializeAppMock).toHaveBeenCalledTimes(1);
  });

  it("reutiliza una app ya inicializada (getApps) en vez de llamar initializeApp de nuevo", async () => {
    setCompleteFirebaseEnv();
    getAppsMock.mockReturnValue([{ __existingApp: true }]);
    verifyIdTokenMock.mockResolvedValueOnce({ uid: "uid-1", email: "a@test.pulse.local", email_verified: true });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await verifyFirebaseIdToken("token");

    expect(initializeAppMock).not.toHaveBeenCalled();
  });

  it("pide checkRevoked=true a verifyIdToken, para detectar tokens revocados", async () => {
    setCompleteFirebaseEnv();
    verifyIdTokenMock.mockResolvedValueOnce({ uid: "uid-1", email: "a@test.pulse.local", email_verified: true });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await verifyFirebaseIdToken("token");

    expect(verifyIdTokenMock).toHaveBeenCalledWith("token", true);
  });

  it("propaga el rechazo de verifyIdToken (token inválido/expirado/revocado) sin envolverlo", async () => {
    setCompleteFirebaseEnv();
    const sdkError = Object.assign(new Error("Firebase ID token has expired"), { code: "auth/id-token-expired" });
    verifyIdTokenMock.mockRejectedValueOnce(sdkError);

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();

    await expect(verifyFirebaseIdToken("token")).rejects.toBe(sdkError);
  });
});

/** Construye un JWT sin firmar (header.payload.signature) con el único fin de controlar el claim "aud" en los tests de diagnóstico — nunca se verifica ni se usa para autenticar nada. */
function buildFakeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fake-signature`;
}

describe("firebaseAdmin: diagnóstico interno de rechazo de credenciales/tokens", () => {
  it("loguea FIREBASE_ADMIN_CERT_INIT_FAILED si cert()/initializeApp() lanza con las 3 credenciales presentes y con formato válido", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setCompleteFirebaseEnv();
    certMock.mockImplementationOnce(() => {
      throw new Error("error interno de la librería de credenciales, con detalle sensible");
    });

    const { verifyFirebaseIdToken, FirebaseNotConfiguredError } = await freshFirebaseAdminModule();

    await expect(verifyFirebaseIdToken("token")).rejects.not.toBeInstanceOf(FirebaseNotConfiguredError);
    expect(initializeAppMock).not.toHaveBeenCalled();

    const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toBe("[auth_session_diag] FIREBASE_ADMIN_CERT_INIT_FAILED");
    expect(logged).not.toContain("detalle sensible");
    warnSpy.mockRestore();
  });

  it("no loguea diagnóstico de credencial ante FirebaseNotConfiguredError (ya es una señal distinta y suficiente)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    const { verifyFirebaseIdToken, FirebaseNotConfiguredError } = await freshFirebaseAdminModule();

    await expect(verifyFirebaseIdToken("token")).rejects.toBeInstanceOf(FirebaseNotConfiguredError);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("loguea FIREBASE_TOKEN_EXPIRED para auth/id-token-expired", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setCompleteFirebaseEnv();
    verifyIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Firebase ID token has expired."), { code: "auth/id-token-expired" }),
    );

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await expect(verifyFirebaseIdToken("token")).rejects.toBeInstanceOf(Error);

    const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toBe("[auth_session_diag] FIREBASE_TOKEN_EXPIRED");
    warnSpy.mockRestore();
  });

  it("loguea FIREBASE_TOKEN_REVOKED para auth/id-token-revoked", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setCompleteFirebaseEnv();
    verifyIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Firebase ID token has been revoked."), { code: "auth/id-token-revoked" }),
    );

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await expect(verifyFirebaseIdToken("token")).rejects.toBeInstanceOf(Error);

    const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toBe("[auth_session_diag] FIREBASE_TOKEN_REVOKED");
    warnSpy.mockRestore();
  });

  it('loguea FIREBASE_TOKEN_PROJECT_MISMATCH para auth/argument-error cuando el "aud" del token no coincide con FIREBASE_PROJECT_ID', async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setCompleteFirebaseEnv();
    verifyIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error('Firebase ID token has incorrect "aud" (audience) claim.'), {
        code: "auth/argument-error",
      }),
    );
    const tokenFromAnotherProject = buildFakeIdToken({ aud: "otro-proyecto-distinto", sub: "uid-1" });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await expect(verifyFirebaseIdToken(tokenFromAnotherProject)).rejects.toBeInstanceOf(Error);

    const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toBe("[auth_session_diag] FIREBASE_TOKEN_PROJECT_MISMATCH");
    expect(logged).not.toContain("otro-proyecto-distinto");
    expect(logged).not.toContain("demo-project");
    warnSpy.mockRestore();
  });

  it('loguea FIREBASE_TOKEN_INVALID_SIGNATURE para auth/argument-error cuando el "aud" del token sí coincide con FIREBASE_PROJECT_ID', async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setCompleteFirebaseEnv();
    verifyIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Firebase ID token has invalid signature."), { code: "auth/argument-error" }),
    );
    const tokenFromConfiguredProject = buildFakeIdToken({ aud: "demo-project", sub: "uid-1" });

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await expect(verifyFirebaseIdToken(tokenFromConfiguredProject)).rejects.toBeInstanceOf(Error);

    const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toBe("[auth_session_diag] FIREBASE_TOKEN_INVALID_SIGNATURE");
    warnSpy.mockRestore();
  });

  it("loguea FIREBASE_TOKEN_OTHER_REJECTION para auth/argument-error cuando el token no se puede decodificar (no se puede afirmar mismatch ni firma)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setCompleteFirebaseEnv();
    verifyIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Decoding Firebase ID token failed."), { code: "auth/argument-error" }),
    );

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await expect(verifyFirebaseIdToken("no-es-un-jwt-valido")).rejects.toBeInstanceOf(Error);

    const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toBe("[auth_session_diag] FIREBASE_TOKEN_OTHER_REJECTION");
    warnSpy.mockRestore();
  });

  it("loguea FIREBASE_TOKEN_OTHER_REJECTION para cualquier otro código o error sin código reconocido", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setCompleteFirebaseEnv();
    verifyIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error("Error interno inesperado del SDK."), { code: "auth/internal-error" }),
    );

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await expect(verifyFirebaseIdToken("token")).rejects.toBeInstanceOf(Error);

    const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toBe("[auth_session_diag] FIREBASE_TOKEN_OTHER_REJECTION");
    warnSpy.mockRestore();
  });

  it("propaga siempre el error original sin envolverlo, aunque se haya logueado un diagnóstico", async () => {
    setCompleteFirebaseEnv();
    const sdkError = Object.assign(new Error("Firebase ID token has invalid signature."), {
      code: "auth/argument-error",
    });
    verifyIdTokenMock.mockRejectedValueOnce(sdkError);

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();

    await expect(verifyFirebaseIdToken(buildFakeIdToken({ aud: "demo-project" }))).rejects.toBe(sdkError);
  });

  it("ningún diagnóstico de esta sección imprime nunca el token, uid, email ni las credenciales configuradas", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setCompleteFirebaseEnv();
    const secretLookingToken = buildFakeIdToken({ aud: "otro-proyecto-distinto", sub: "uid-secreto-123" });
    verifyIdTokenMock.mockRejectedValueOnce(
      Object.assign(new Error('incorrect "aud" claim'), { code: "auth/argument-error" }),
    );

    const { verifyFirebaseIdToken } = await freshFirebaseAdminModule();
    await expect(verifyFirebaseIdToken(secretLookingToken)).rejects.toBeInstanceOf(Error);

    const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain(secretLookingToken);
    expect(logged).not.toContain("uid-secreto-123");
    expect(logged).not.toContain("demo-project");
    expect(logged).not.toContain("sa@demo-project.iam.gserviceaccount.com");
    warnSpy.mockRestore();
  });
});
