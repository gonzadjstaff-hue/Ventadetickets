import { describe, expect, it } from "vitest";

import { VerifyStaffEmailEnvError, parseVerifyStaffEmailEnv } from "../scripts/verifyStaffEmailLogic.js";

/** Solo lógica pura: nunca importa Prisma ni Firebase, no se conecta a ningún servicio real. */
describe("parseVerifyStaffEmailEnv", () => {
  it("parsea correctamente STAFF_EMAIL", () => {
    const result = parseVerifyStaffEmailEnv({ STAFF_EMAIL: "admin@test.pulse.local" });
    expect(result).toEqual({ email: "admin@test.pulse.local" });
  });

  it("normaliza el email a minúsculas y recorta espacios", () => {
    const result = parseVerifyStaffEmailEnv({ STAFF_EMAIL: "  Admin@Test.Pulse.Local  " });
    expect(result.email).toBe("admin@test.pulse.local");
  });

  it("lanza VerifyStaffEmailEnvError si falta STAFF_EMAIL", () => {
    expect(() => parseVerifyStaffEmailEnv({})).toThrow(VerifyStaffEmailEnvError);
    expect(() => parseVerifyStaffEmailEnv({})).toThrow(/STAFF_EMAIL/);
  });

  it("lanza VerifyStaffEmailEnvError si STAFF_EMAIL está vacío o son solo espacios", () => {
    expect(() => parseVerifyStaffEmailEnv({ STAFF_EMAIL: "   " })).toThrow(VerifyStaffEmailEnvError);
  });
});
