import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/AppError.js";

/**
 * Error de configuración del servidor (falta o está incompleta
 * FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY), nunca un
 * error del cliente — por eso 500, no 401. requireAuth.ts lo deja propagar
 * tal cual hacia errorHandler en vez de traducirlo a "no autorizado": son dos
 * causas distintas que conviene poder distinguir en logs/monitoreo.
 */
export class FirebaseNotConfiguredError extends AppError {
  constructor() {
    super("FIREBASE_NOT_CONFIGURED", "La autenticación no está disponible en este momento.", 500);
  }
}

let cachedApp: App | undefined;

/**
 * Comillas envolventes accidentales (típicamente al copiar el valor completo
 * del campo `"private_key"` del JSON de la cuenta de servicio, comillas del
 * JSON incluidas, en vez de solo el contenido de adentro) rompen el formato
 * PEM antes de poder normalizar los "\n" literales. Solo se quitan si el
 * valor completo empieza y termina con el mismo tipo de comilla — nunca se
 * tocan comillas que no envuelven el valor entero (ej. una comilla suelta en
 * el medio, o comillas asimétricas, quedan tal cual y el error de formato
 * sigue siendo visible en vez de enmascararse a medias).
 */
function stripWrappingQuotes(rawKey: string): string {
  if (rawKey.length < 2) return rawKey;
  const first = rawKey[0];
  const last = rawKey[rawKey.length - 1];
  const isWrapped = (first === '"' && last === '"') || (first === "'" && last === "'");
  return isWrapped ? rawKey.slice(1, -1) : rawKey;
}

/**
 * Las variables de entorno no preservan saltos de línea reales, así que la
 * clave privada PEM suele cargarse con la secuencia literal "\n" en vez de un
 * salto de línea real (Render, Vercel, .env). El SDK de Firebase requiere
 * saltos de línea reales para poder parsear la clave — sin esto, cert()
 * lanza un error de formato antes de poder verificar ningún token. Las
 * comillas envolventes se quitan antes de esta conversión, para que la
 * detección de "\n" literales opere sobre el contenido real de la clave.
 */
function normalizePrivateKey(rawKey: string): string {
  const unquoted = stripWrappingQuotes(rawKey);
  return unquoted.includes("\\n") ? unquoted.replace(/\\n/g, "\n") : unquoted;
}

const PEM_PRIVATE_KEY_BEGIN_MARKER = "-----BEGIN PRIVATE KEY-----";
const PEM_PRIVATE_KEY_END_MARKER = "-----END PRIVATE KEY-----";

/**
 * Validación mínima de forma, nunca de contenido criptográfico: confirma que,
 * ya sin comillas envolventes y con los "\n" normalizados, la clave todavía
 * contiene los marcadores PEM esperados. No prueba que la clave sea
 * válida/parseable (eso solo lo puede confirmar cert() contra el valor real),
 * pero sí detecta el caso común de un paste incompleto o de un valor que
 * directamente no es una clave privada. Nunca imprime el valor evaluado.
 */
function hasValidPrivateKeyMarkers(normalizedKey: string): boolean {
  return normalizedKey.includes(PEM_PRIVATE_KEY_BEGIN_MARKER) && normalizedKey.includes(PEM_PRIVATE_KEY_END_MARKER);
}

/**
 * Inicialización perezosa y una única vez: importar este módulo no tiene
 * ningún efecto secundario (no llama a initializeApp), así que el backend
 * puede arrancar y los tests pueden importar el módulo sin credenciales
 * reales de Firebase. La app solo se crea la primera vez que efectivamente
 * hace falta verificar un token.
 */
function getFirebaseApp(): App {
  if (cachedApp) return cachedApp;

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new FirebaseNotConfiguredError();
  }

  const normalizedPrivateKey = normalizePrivateKey(FIREBASE_PRIVATE_KEY);
  // Mismo error que "falta una variable": desde afuera, una clave con
  // formato inválido (comillas que no se pudieron quitar del todo, paste
  // incompleto, valor que no es una clave) es indistinguible de "no
  // configurado" — ambas son fallas de configuración del servidor (500), no
  // del cliente. Sin este chequeo, cert() lanzaría más abajo y ese error se
  // traduciría en un 401 engañoso en verifyBearerFirebaseToken.ts.
  if (!hasValidPrivateKeyMarkers(normalizedPrivateKey)) {
    throw new FirebaseNotConfiguredError();
  }

  // Reutiliza una app ya inicializada por otro import si existiera (evita
  // que "app already exists" rompa el arranque si algo más del proceso
  // también llama a initializeApp), en vez de asumir que esta función es la
  // única fuente posible de inicialización.
  const existingApp = getApps()[0];
  cachedApp =
    existingApp ??
    initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: normalizedPrivateKey,
      }),
    });

  return cachedApp;
}

/**
 * Instancia de Firebase Auth (Admin SDK) ya inicializada — reutilizada por
 * `verifyFirebaseIdToken` y por scripts administrativos (ej.
 * `scripts/verifyStaffEmail.ts`) que necesitan operar sobre usuarios de
 * Firebase directamente (gestión, nunca verificación de tokens de terceros).
 */
export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

/**
 * Códigos de error que expone `firebase-admin/auth` (siempre con el prefijo
 * "auth/", ver node_modules/firebase-admin/lib/auth/error.js). El SDK usa el
 * mismo código genérico `auth/argument-error` tanto para una firma inválida
 * como para un "aud"/"iss" (proyecto) incorrecto — no hay forma de
 * distinguir esos dos casos mirando solo `error.code` (confirmado leyendo
 * `node_modules/firebase-admin/lib/auth/token-verifier.js`, método
 * `mapJwtErrorToAuthError`/`verifyContent`). Por eso, para ese código puntual,
 * se decodifica (sin verificar firma) el claim "aud" del propio token y se lo
 * compara contra `FIREBASE_PROJECT_ID` — nunca se usa `error.message`.
 */
const FIREBASE_AUTH_ERROR_CODE = {
  ID_TOKEN_EXPIRED: "auth/id-token-expired",
  ID_TOKEN_REVOKED: "auth/id-token-revoked",
  ARGUMENT_ERROR: "auth/argument-error",
} as const;

/**
 * Lee el claim "aud" de un JWT sin verificar su firma ni su validez (nunca se
 * usa para autenticar ni autorizar nada, solo para diagnóstico interno) y
 * confirma si coincide con el proyecto de Firebase configurado en el
 * backend. Devuelve `undefined` si el token no se puede decodificar como JWT
 * (estructura inesperada) — en ese caso no se puede afirmar nada sobre la
 * causa real. Nunca imprime el token ni el valor decodificado.
 */
function tokenAudienceMatchesConfiguredProject(idToken: string, expectedProjectId: string): boolean | undefined {
  try {
    const payloadSegment = idToken.split(".")[1];
    if (!payloadSegment) return undefined;

    const payload: unknown = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null || !("aud" in payload)) return undefined;

    const aud = (payload as { aud?: unknown }).aud;
    return typeof aud === "string" ? aud === expectedProjectId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Diagnóstico temporal (ver SESSION_HANDOFF.md): distingue, solo en los logs
 * del servidor, por qué el Admin SDK rechazó un ID token — nunca cambia qué
 * se lanza ni la respuesta HTTP pública (`verifyBearerFirebaseToken.ts` sigue
 * tratando cualquier rechazo del SDK exactamente igual que antes). Reglas
 * estrictas: solo `error.code` del SDK (nunca `error.message`), y nunca se
 * imprime el token, uid, email, projectId, clientEmail, privateKey ni ningún
 * claim — el resultado de comparar el "aud" contra el proyecto configurado
 * se usa únicamente para elegir el código a loguear, nunca se imprime el
 * valor comparado.
 */
function logTokenRejectionDiagnostic(idToken: string, error: unknown): void {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;

  if (code === FIREBASE_AUTH_ERROR_CODE.ID_TOKEN_EXPIRED) {
    console.warn("[auth_session_diag] FIREBASE_TOKEN_EXPIRED");
    return;
  }
  if (code === FIREBASE_AUTH_ERROR_CODE.ID_TOKEN_REVOKED) {
    console.warn("[auth_session_diag] FIREBASE_TOKEN_REVOKED");
    return;
  }
  if (code === FIREBASE_AUTH_ERROR_CODE.ARGUMENT_ERROR) {
    const audienceMatches = tokenAudienceMatchesConfiguredProject(idToken, env.FIREBASE_PROJECT_ID ?? "");
    if (audienceMatches === false) {
      console.warn("[auth_session_diag] FIREBASE_TOKEN_PROJECT_MISMATCH");
    } else if (audienceMatches === true) {
      console.warn("[auth_session_diag] FIREBASE_TOKEN_INVALID_SIGNATURE");
    } else {
      console.warn("[auth_session_diag] FIREBASE_TOKEN_OTHER_REJECTION");
    }
    return;
  }
  console.warn("[auth_session_diag] FIREBASE_TOKEN_OTHER_REJECTION");
}

/**
 * Verifica un Firebase ID Token contra el proyecto configurado.
 * `checkRevoked: true` hace una llamada adicional a Firebase para confirmar
 * que el token no fue revocado (ej. el usuario fue deshabilitado o cambió su
 * contraseña) — sin esto, un token todavía no vencido pero ya revocado
 * pasaría la verificación igual. Esa misma llamada adicional necesita poder
 * autenticarse ante Google con la credencial de servicio configurada — si esa
 * credencial es incoherente (ej. la clave privada no corresponde de verdad a
 * `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PROJECT_ID`, aunque tenga formato PEM
 * válido), el rechazo ocurre acá, no en el chequeo de formato de
 * `firebaseAdmin.ts` ya existente.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  let auth: ReturnType<typeof getFirebaseAuth>;
  try {
    auth = getFirebaseAuth();
  } catch (error) {
    // FirebaseNotConfiguredError ya es un diagnóstico claro y distinto (falta
    // una variable, o la clave no tiene los marcadores PEM esperados) — no
    // hace falta duplicar esa señal. Cualquier otro error acá viene de
    // cert()/initializeApp() con las 3 variables presentes y con formato
    // válido: la credencial en sí no pudo construirse (ej. contenido de la
    // clave corrupto más allá de lo que el chequeo de marcadores detecta).
    if (!(error instanceof FirebaseNotConfiguredError)) {
      console.warn("[auth_session_diag] FIREBASE_ADMIN_CERT_INIT_FAILED");
    }
    throw error;
  }

  try {
    return await auth.verifyIdToken(idToken, true);
  } catch (error) {
    logTokenRejectionDiagnostic(idToken, error);
    throw error;
  }
}
