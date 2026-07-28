import { describe, expect, it } from "vitest";

import {
  CreateStaffUserEnvError,
  describeStaffUserDiff,
  parseCreateStaffUserEnv,
} from "../scripts/createStaffUserLogic.js";

/**
 * Solo lógica pura: nunca importa Prisma, así que no hay nada que mockear —
 * no se conecta a ninguna base.
 */
describe("parseCreateStaffUserEnv", () => {
  const validEnv: Record<string, string | undefined> = {
    STAFF_EMAIL: "Admin@Test.Pulse.Local",
    STAFF_ROLE: "ADMIN",
  };

  it("parsea correctamente con las 2 variables obligatorias (displayName null, confirmUpdate false por default)", () => {
    const result = parseCreateStaffUserEnv(validEnv);

    expect(result).toEqual({
      email: "admin@test.pulse.local",
      displayName: null,
      role: "ADMIN",
      confirmUpdate: false,
    });
  });

  it("acepta STAFF_DISPLAY_NAME opcional", () => {
    const result = parseCreateStaffUserEnv({ ...validEnv, STAFF_DISPLAY_NAME: "  Ada Lovelace  " });
    expect(result.displayName).toBe("Ada Lovelace");
  });

  it('STAFF_CONFIRM_UPDATE solo es true con el string exacto "true" (case-insensitive)', () => {
    expect(parseCreateStaffUserEnv({ ...validEnv, STAFF_CONFIRM_UPDATE: "true" }).confirmUpdate).toBe(true);
    expect(parseCreateStaffUserEnv({ ...validEnv, STAFF_CONFIRM_UPDATE: "TRUE" }).confirmUpdate).toBe(true);
    expect(parseCreateStaffUserEnv({ ...validEnv, STAFF_CONFIRM_UPDATE: "1" }).confirmUpdate).toBe(false);
    expect(parseCreateStaffUserEnv({ ...validEnv, STAFF_CONFIRM_UPDATE: "yes" }).confirmUpdate).toBe(false);
  });

  it("normaliza el email a minúsculas y recorta espacios", () => {
    const result = parseCreateStaffUserEnv({ ...validEnv, STAFF_EMAIL: "  Admin@Test.Pulse.Local  " });
    expect(result.email).toBe("admin@test.pulse.local");
  });

  it.each(["STAFF_EMAIL", "STAFF_ROLE"])("lanza CreateStaffUserEnvError si falta %s", (missingKey) => {
    const env = { ...validEnv };
    delete env[missingKey];

    expect(() => parseCreateStaffUserEnv(env)).toThrow(CreateStaffUserEnvError);
    expect(() => parseCreateStaffUserEnv(env)).toThrow(new RegExp(missingKey));
  });

  it("lanza un error claro si STAFF_ROLE no es ADMIN ni VALIDATOR", () => {
    expect(() => parseCreateStaffUserEnv({ ...validEnv, STAFF_ROLE: "SUPERADMIN" })).toThrow(/STAFF_ROLE inválido/);
  });

  it("rechaza STAFF_ROLE=USER explícitamente (no se preprovisiona con este script)", () => {
    expect(() => parseCreateStaffUserEnv({ ...validEnv, STAFF_ROLE: "USER" })).toThrow(/STAFF_ROLE inválido/);
  });

  it("acepta VALIDATOR además de ADMIN", () => {
    expect(parseCreateStaffUserEnv({ ...validEnv, STAFF_ROLE: "VALIDATOR" }).role).toBe("VALIDATOR");
  });
});

describe("describeStaffUserDiff", () => {
  const input = { role: "ADMIN" as const, displayName: "Ada Lovelace" };

  it("script idempotente: sin diferencia con lo ya existente, devuelve null (no hay nada que escribir)", () => {
    const existing = { role: "ADMIN" as const, displayName: "Ada Lovelace", status: "ACTIVE" as const };
    expect(describeStaffUserDiff(input, existing)).toBeNull();
  });

  it("detecta diferencia de role y no la aplica sola: solo la describe", () => {
    const existing = { role: "VALIDATOR" as const, displayName: "Ada Lovelace", status: "ACTIVE" as const };
    const message = describeStaffUserDiff(input, existing);

    expect(message).toContain('role: "VALIDATOR" → "ADMIN"');
    expect(message).toContain("STAFF_CONFIRM_UPDATE=true");
  });

  it("detecta diferencia de displayName", () => {
    const existing = { role: "ADMIN" as const, displayName: "Otro Nombre", status: "ACTIVE" as const };
    const message = describeStaffUserDiff(input, existing);

    expect(message).toContain("displayName");
    expect(message).toContain("Otro Nombre");
  });

  it("detecta que el status existente no es ACTIVE (ej. BLOCKED) y lo describe, sin aplicarlo solo", () => {
    const existing = { role: "ADMIN" as const, displayName: "Ada Lovelace", status: "BLOCKED" as const };
    const message = describeStaffUserDiff(input, existing);

    expect(message).toContain('status: "BLOCKED" → "ACTIVE"');
  });

  it("el mensaje aclara que firebaseUid nunca se toca, y no incluye ningún valor de uid (la función ni siquiera lo recibe como parámetro)", () => {
    const existing = { role: "VALIDATOR" as const, displayName: null, status: "ACTIVE" as const };
    const message = describeStaffUserDiff(input, existing);

    // La función no acepta ningún dato de firebaseUid en su firma — no hay
    // forma de que este mensaje contenga un valor de uid real.
    expect(message).toContain("firebaseUid nunca se toca");
  });
});
