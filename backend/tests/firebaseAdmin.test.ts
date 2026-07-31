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
