export interface VerifyStaffEmailInput {
  email: string;
}

/** Error de validación de las variables de entrada — nunca uno de Prisma/Firebase. */
export class VerifyStaffEmailEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyStaffEmailEnvError";
  }
}

function requireNonEmpty(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new VerifyStaffEmailEnvError(`Falta la variable ${name} (obligatoria, no puede estar vacía).`);
  }
  return trimmed;
}

/**
 * Valida y normaliza STAFF_EMAIL. Función pura — nunca importa Prisma ni el
 * SDK de Firebase, así que se puede testear sin conectar a ningún servicio
 * real.
 */
export function parseVerifyStaffEmailEnv(env: Record<string, string | undefined>): VerifyStaffEmailInput {
  const email = requireNonEmpty(env.STAFF_EMAIL, "STAFF_EMAIL").toLowerCase();
  return { email };
}
