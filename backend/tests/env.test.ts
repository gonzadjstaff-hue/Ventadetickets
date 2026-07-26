import { afterEach, describe, expect, it, vi } from "vitest";

const EMPTY_STRING_VARS = ["EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM", "EVENT_TIMEZONE"] as const;

describe("env: variables vacías", () => {
  afterEach(() => {
    for (const key of EMPTY_STRING_VARS) {
      delete process.env[key];
    }
  });

  it("EMAIL_PROVIDER, EMAIL_API_KEY, EMAIL_FROM y EVENT_TIMEZONE vacíos no impiden arrancar, y se resuelven como si no estuvieran definidos", async () => {
    for (const key of EMPTY_STRING_VARS) {
      process.env[key] = "";
    }
    vi.resetModules();

    const { env } = await import("../src/config/env.js");

    expect(env.EMAIL_PROVIDER).toBeUndefined();
    expect(env.EMAIL_API_KEY).toBeUndefined();
    expect(env.EMAIL_FROM).toBeUndefined();
    // EVENT_TIMEZONE vacío cae al default documentado, no queda undefined.
    expect(env.EVENT_TIMEZONE).toBe("America/Argentina/Buenos_Aires");
  });

  it("EVENT_TIMEZONE puede sobreescribirse con un valor explícito", async () => {
    process.env.EVENT_TIMEZONE = "UTC";
    vi.resetModules();

    const { env } = await import("../src/config/env.js");

    expect(env.EVENT_TIMEZONE).toBe("UTC");
  });
});

describe("env: MERCADOPAGO_CHECKOUT_AVAILABLE (derivado, no leído directo de process.env)", () => {
  const MP_KEYS = [
    "ENABLE_MERCADOPAGO_CHECKOUT",
    "MERCADOPAGO_ACCESS_TOKEN",
    "MERCADOPAGO_WEBHOOK_SECRET",
    "APP_PUBLIC_URL",
    "BACKEND_PUBLIC_URL",
  ] as const;
  const original = Object.fromEntries(MP_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of MP_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  async function freshEnv() {
    vi.resetModules();
    return (await import("../src/config/env.js")).env;
  }

  it("con las 5 variables completas y el flag en 'true': queda disponible", async () => {
    process.env.ENABLE_MERCADOPAGO_CHECKOUT = "true";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "secret";
    process.env.APP_PUBLIC_URL = "https://app.example.test";
    process.env.BACKEND_PUBLIC_URL = "https://api.example.test";

    const env = await freshEnv();
    expect(env.MERCADOPAGO_CHECKOUT_AVAILABLE).toBe(true);
  });

  it("sin ENABLE_MERCADOPAGO_CHECKOUT (default): no disponible, aunque las credenciales estén completas", async () => {
    delete process.env.ENABLE_MERCADOPAGO_CHECKOUT;
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "secret";
    process.env.APP_PUBLIC_URL = "https://app.example.test";
    process.env.BACKEND_PUBLIC_URL = "https://api.example.test";

    const env = await freshEnv();
    expect(env.MERCADOPAGO_CHECKOUT_AVAILABLE).toBe(false);
  });

  it.each(["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET", "APP_PUBLIC_URL", "BACKEND_PUBLIC_URL"] as const)(
    "con el flag en 'true' pero sin %s: no disponible (no rompe el arranque)",
    async (missingKey) => {
      process.env.ENABLE_MERCADOPAGO_CHECKOUT = "true";
      process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";
      process.env.MERCADOPAGO_WEBHOOK_SECRET = "secret";
      process.env.APP_PUBLIC_URL = "https://app.example.test";
      process.env.BACKEND_PUBLIC_URL = "https://api.example.test";
      delete process.env[missingKey];

      const env = await freshEnv();
      expect(env.MERCADOPAGO_CHECKOUT_AVAILABLE).toBe(false);
    },
  );

  it("strings vacíos en las variables de Mercado Pago se tratan como no definidas", async () => {
    process.env.ENABLE_MERCADOPAGO_CHECKOUT = "true";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "secret";
    process.env.APP_PUBLIC_URL = "https://app.example.test";
    process.env.BACKEND_PUBLIC_URL = "https://api.example.test";

    const env = await freshEnv();
    expect(env.MERCADOPAGO_ACCESS_TOKEN).toBeUndefined();
    expect(env.MERCADOPAGO_CHECKOUT_AVAILABLE).toBe(false);
  });
});
