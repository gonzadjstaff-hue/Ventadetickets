import type { UserRole, UserStatus } from "@prisma/client";

/** `USER` no se preprovisiona acá: los compradores/asistentes nunca necesitan Firebase. */
export type StaffRole = Extract<UserRole, "ADMIN" | "VALIDATOR">;

const STAFF_ROLE_VALUES: StaffRole[] = ["ADMIN", "VALIDATOR"];

export interface CreateStaffUserInput {
  email: string;
  displayName: string | null;
  role: StaffRole;
  /** `STAFF_CONFIRM_UPDATE=true` — habilita actualizar un usuario ya existente que difiere de lo pedido. */
  confirmUpdate: boolean;
}

/** Error de validación de las variables de entrada — nunca uno de Prisma. */
export class CreateStaffUserEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateStaffUserEnvError";
  }
}

function requireNonEmpty(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new CreateStaffUserEnvError(`Falta la variable ${name} (obligatoria, no puede estar vacía).`);
  }
  return trimmed;
}

/**
 * Valida y normaliza STAFF_EMAIL/STAFF_DISPLAY_NAME/STAFF_ROLE/
 * STAFF_CONFIRM_UPDATE. Función pura — nunca importa Prisma, se puede
 * testear sin conectar a ninguna base.
 */
export function parseCreateStaffUserEnv(env: Record<string, string | undefined>): CreateStaffUserInput {
  const email = requireNonEmpty(env.STAFF_EMAIL, "STAFF_EMAIL").toLowerCase();

  const rawRole = requireNonEmpty(env.STAFF_ROLE, "STAFF_ROLE");
  if (!STAFF_ROLE_VALUES.includes(rawRole as StaffRole)) {
    throw new CreateStaffUserEnvError(
      `STAFF_ROLE inválido ("${rawRole}"). Valores permitidos: ${STAFF_ROLE_VALUES.join(", ")} ` +
        `(USER no se preprovisiona: los compradores/asistentes nunca necesitan Firebase).`,
    );
  }

  const rawDisplayName = env.STAFF_DISPLAY_NAME?.trim();
  const displayName = rawDisplayName && rawDisplayName.length > 0 ? rawDisplayName : null;

  const confirmUpdate = (env.STAFF_CONFIRM_UPDATE?.trim() ?? "").toLowerCase() === "true";

  return { email, displayName, role: rawRole as StaffRole, confirmUpdate };
}

export interface ExistingStaffUserSnapshot {
  role: UserRole;
  displayName: string | null;
  status: UserStatus;
}

/**
 * Pura: compara lo que ya existe contra lo pedido. Devuelve `null` si son
 * idénticos (no hay nada que escribir, rerun seguro — idempotente), o una
 * descripción de la diferencia si hace falta confirmación explícita
 * (`STAFF_CONFIRM_UPDATE=true`) para aplicarla. Nunca considera ni menciona
 * `firebaseUid`: este script no lo lee ni lo escribe jamás — la vinculación
 * real pasa exclusivamente por `POST /api/auth/session`.
 */
export function describeStaffUserDiff(
  input: Pick<CreateStaffUserInput, "role" | "displayName">,
  existing: ExistingStaffUserSnapshot,
): string | null {
  const changes: string[] = [];

  if (existing.role !== input.role) {
    changes.push(`role: "${existing.role}" → "${input.role}"`);
  }
  if (existing.displayName !== input.displayName) {
    changes.push(`displayName: ${JSON.stringify(existing.displayName)} → ${JSON.stringify(input.displayName)}`);
  }
  if (existing.status !== "ACTIVE") {
    changes.push(`status: "${existing.status}" → "ACTIVE"`);
  }

  if (changes.length === 0) return null;

  return (
    `Ya existe un usuario con ese email y difiere de lo pedido (${changes.join("; ")}). ` +
    `Volvé a correr con STAFF_CONFIRM_UPDATE=true si querés aplicar estos cambios explícitamente. ` +
    `firebaseUid nunca se toca desde este script.`
  );
}
