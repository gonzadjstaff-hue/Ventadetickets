import type { Express } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Archivo dedicado: cada caso fuerza su propia combinación de FRONTEND_URL /
 * CORS_ALLOWED_ORIGINS y reimporta app.ts en un registro de módulos aislado
 * (mismo criterio que mercadoPagoCheckout.disabled.test.ts) — env.ts calcula
 * CORS_ALLOWED_ORIGINS_LIST una sola vez al importarse, así que no alcanza
 * con cambiar process.env sin resetear módulos.
 */
describe("CORS", () => {
  const ENV_KEYS = ["FRONTEND_URL", "CORS_ALLOWED_ORIGINS"] as const;
  const originalValues = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
  });

  async function freshApp(): Promise<Express> {
    vi.resetModules();
    const { createApp } = await import("../src/app.js");
    return createApp();
  }

  it("permite el origen por defecto de desarrollo (http://localhost:5173)", async () => {
    delete process.env.FRONTEND_URL;
    delete process.env.CORS_ALLOWED_ORIGINS;
    const app = await freshApp();

    const response = await request(app).get("/api/health").set("Origin", "http://localhost:5173");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("permite un origen agregado explícitamente en CORS_ALLOWED_ORIGINS, sin dejar de permitir FRONTEND_URL", async () => {
    process.env.FRONTEND_URL = "http://localhost:5173";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.vercel.app,https://otro.example.test";
    const app = await freshApp();

    const vercelResponse = await request(app).get("/api/health").set("Origin", "https://app.example.vercel.app");
    const devResponse = await request(app).get("/api/health").set("Origin", "http://localhost:5173");

    expect(vercelResponse.headers["access-control-allow-origin"]).toBe("https://app.example.vercel.app");
    expect(devResponse.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("no agrega el header de CORS para un origen no permitido", async () => {
    process.env.FRONTEND_URL = "http://localhost:5173";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.vercel.app";
    const app = await freshApp();

    const response = await request(app).get("/api/health").set("Origin", "https://otro-sitio-cualquiera.test");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("una request sin header Origin (server-to-server, ej. webhook de Mercado Pago) nunca es bloqueada por CORS", async () => {
    process.env.FRONTEND_URL = "http://localhost:5173";
    delete process.env.CORS_ALLOWED_ORIGINS;
    const app = await freshApp();

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
  });
});
