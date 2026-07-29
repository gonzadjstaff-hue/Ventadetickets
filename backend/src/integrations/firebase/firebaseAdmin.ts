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
 * Las variables de entorno no preservan saltos de línea reales, así que la
 * clave privada PEM suele cargarse con la secuencia literal "\n" en vez de un
 * salto de línea real (Render, Vercel, .env). El SDK de Firebase requiere
 * saltos de línea reales para poder parsear la clave — sin esto, cert()
 * lanza un error de formato antes de poder verificar ningún token.
 */
function normalizePrivateKey(rawKey: string): string {
  return rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
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
        privateKey: normalizePrivateKey(FIREBASE_PRIVATE_KEY),
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
 * Verifica un Firebase ID Token contra el proyecto configurado.
 * `checkRevoked: true` hace una llamada adicional a Firebase para confirmar
 * que el token no fue revocado (ej. el usuario fue deshabilitado o cambió su
 * contraseña) — sin esto, un token todavía no vencido pero ya revocado
 * pasaría la verificación igual.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  return getFirebaseAuth().verifyIdToken(idToken, true);
}
