import { describe, expect, it } from "vitest";

import {
  CreateTestUserEnvError,
  describeFirebaseUidConflict,
  parseCreateTestUserEnv,
} from "../scripts/createTestUserLogic.js";

/**
 * Solo lógica pura: nunca importa Prisma ni el SDK de Firebase, así que no
 * hay nada que mockear — no se conecta a ninguna base ni a ningún servicio
 * real.
 */
describe("parseCreateTestUserEnv", () => {
  const validEnv: Record<string, string | undefined> = {
    FIREBASE_UID: "uid-abc123",
    USER_EMAIL: "Admin@Test.Pulse.Local",
    USER_ROLE: "ADMIN",
  };

  it("parsea correctamente con las 3 variables obligatorias (USER_STATUS cae al default ACTIVE)", () => {
    const result = parseCreateTestUserEnv(validEnv);

    expect(result).toEqual({
      firebaseUid: "uid-abc123",
      email: "admin@test.pulse.local",
      role: "ADMIN",
      status: "ACTIVE",
    });
  });

  it("acepta USER_STATUS explícito (BLOCKED)", () => {
    const result = parseCreateTestUserEnv({ ...validEnv, USER_STATUS: "BLOCKED" });
    expect(result.status).toBe("BLOCKED");
  });

  it("normaliza el email a minúsculas y recorta espacios", () => {
    const result = parseCreateTestUserEnv({ ...validEnv, USER_EMAIL: "  Admin@Test.Pulse.Local  " });
    expect(result.email).toBe("admin@test.pulse.local");
  });

  it("recorta espacios en FIREBASE_UID", () => {
    const result = parseCreateTestUserEnv({ ...validEnv, FIREBASE_UID: "  uid-abc123  " });
    expect(result.firebaseUid).toBe("uid-abc123");
  });

  it.each(["FIREBASE_UID", "USER_EMAIL", "USER_ROLE"])("lanza CreateTestUserEnvError si falta %s", (missingKey) => {
    const env = { ...validEnv };
    delete env[missingKey];

    expect(() => parseCreateTestUserEnv(env)).toThrow(CreateTestUserEnvError);
    expect(() => parseCreateTestUserEnv(env)).toThrow(new RegExp(missingKey));
  });

  it.each(["FIREBASE_UID", "USER_EMAIL", "USER_ROLE"])(
    "lanza CreateTestUserEnvError si %s está vacío o son solo espacios",
    (key) => {
      expect(() => parseCreateTestUserEnv({ ...validEnv, [key]: "   " })).toThrow(CreateTestUserEnvError);
    },
  );

  it("lanza un error claro si USER_ROLE no es un valor válido del enum (nunca crea nada por defecto)", () => {
    expect(() => parseCreateTestUserEnv({ ...validEnv, USER_ROLE: "SUPERADMIN" })).toThrow(/USER_ROLE inválido/);
  });

  it("lanza un error claro si USER_STATUS no es un valor válido del enum", () => {
    expect(() => parseCreateTestUserEnv({ ...validEnv, USER_STATUS: "PENDING" })).toThrow(/USER_STATUS inválido/);
  });

  it("acepta VALIDATOR y USER como roles válidos, además de ADMIN", () => {
    expect(parseCreateTestUserEnv({ ...validEnv, USER_ROLE: "VALIDATOR" }).role).toBe("VALIDATOR");
    expect(parseCreateTestUserEnv({ ...validEnv, USER_ROLE: "USER" }).role).toBe("USER");
  });
});

describe("describeFirebaseUidConflict", () => {
  const input = { firebaseUid: "uid-abc123", email: "admin@test.pulse.local" };

  it("no hay conflicto si ningún otro usuario tiene ese firebaseUid", () => {
    expect(describeFirebaseUidConflict(input, null)).toBeNull();
  });

  it("no hay conflicto si el firebaseUid ya pertenece exactamente al mismo email (es una actualización)", () => {
    expect(describeFirebaseUidConflict(input, { email: input.email })).toBeNull();
  });

  it("hay conflicto si el firebaseUid ya pertenece a un email distinto — mensaje claro, sin ambigüedad", () => {
    const message = describeFirebaseUidConflict(input, { email: "otro@test.pulse.local" });

    expect(message).not.toBeNull();
    expect(message).toContain("otro@test.pulse.local");
    expect(message).toContain(input.firebaseUid);
    expect(message).toContain(input.email);
  });
});
