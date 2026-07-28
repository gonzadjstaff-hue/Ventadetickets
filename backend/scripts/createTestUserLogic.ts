import { UserRole, UserStatus } from "@prisma/client";

export interface CreateTestUserInput {
  firebaseUid: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

/** Error de validación de las variables de entrada — nunca uno de Prisma/Firebase. */
export class CreateTestUserEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateTestUserEnvError";
  }
}

const ROLE_VALUES = Object.values(UserRole);
const STATUS_VALUES = Object.values(UserStatus);

function requireNonEmpty(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new CreateTestUserEnvError(`Falta la variable ${name} (obligatoria, no puede estar vacía).`);
  }
  return trimmed;
}

/**
 * Valida y normaliza FIREBASE_UID/USER_EMAIL/USER_ROLE/USER_STATUS. Función
 * pura — nunca importa Prisma ni el SDK de Firebase, así que se puede testear
 * sin conectar a ningún servicio real. `env` es cualquier objeto tipo
 * `process.env` (nunca se le pasa `process.env` completo a un log ni se
 * imprime nada de acá para afuera).
 */
export function parseCreateTestUserEnv(env: Record<string, string | undefined>): CreateTestUserInput {
  const firebaseUid = requireNonEmpty(env.FIREBASE_UID, "FIREBASE_UID");
  const email = requireNonEmpty(env.USER_EMAIL, "USER_EMAIL").toLowerCase();

  const rawRole = requireNonEmpty(env.USER_ROLE, "USER_ROLE");
  if (!ROLE_VALUES.includes(rawRole as UserRole)) {
    throw new CreateTestUserEnvError(`USER_ROLE inválido ("${rawRole}"). Valores permitidos: ${ROLE_VALUES.join(", ")}.`);
  }

  const rawStatus = env.USER_STATUS?.trim();
  const status = rawStatus && rawStatus.length > 0 ? rawStatus : UserStatus.ACTIVE;
  if (!STATUS_VALUES.includes(status as UserStatus)) {
    throw new CreateTestUserEnvError(
      `USER_STATUS inválido ("${status}"). Valores permitidos: ${STATUS_VALUES.join(", ")}.`,
    );
  }

  return { firebaseUid, email, role: rawRole as UserRole, status: status as UserStatus };
}

/**
 * Pura: recibe el resultado de una consulta ya hecha (findUnique por
 * firebaseUid), nunca consulta nada por su cuenta. El entrypoint debe cortar
 * ANTES de cualquier escritura si esto devuelve un mensaje no nulo — evita
 * que el upsert por email pise sin querer el firebaseUid de otro usuario
 * (`firebaseUid` es `@unique`, pero Prisma fallaría recién en el momento del
 * write con un error crudo P2002; esta función da un mensaje claro antes).
 */
export function describeFirebaseUidConflict(
  input: Pick<CreateTestUserInput, "firebaseUid" | "email">,
  existingUserWithSameFirebaseUid: { email: string } | null,
): string | null {
  if (!existingUserWithSameFirebaseUid) return null;
  if (existingUserWithSameFirebaseUid.email === input.email) return null;

  return (
    `El FIREBASE_UID "${input.firebaseUid}" ya está asignado a otro usuario ` +
    `(${existingUserWithSameFirebaseUid.email}), distinto de USER_EMAIL ("${input.email}"). ` +
    `No se realizó ningún cambio.`
  );
}
