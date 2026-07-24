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
