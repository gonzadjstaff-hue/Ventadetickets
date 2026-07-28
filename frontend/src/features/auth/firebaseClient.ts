import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Firebase Authentication es solo para ADMIN/VALIDATOR (ver
 * backend/src/integrations/firebase/firebaseAdmin.ts) — nunca para
 * compradores/asistentes, que siguen sin cuenta. Inicialización perezosa,
 * mismo criterio que el backend: importar este módulo no tiene ningún efecto
 * secundario, así que el resto de la app (landing, checkout, check-in) sigue
 * funcionando igual aunque VITE_FIREBASE_* no estén configuradas.
 */
export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super("Firebase no está configurado. Definí las variables VITE_FIREBASE_* (ver docs/LOCAL_SETUP.md).");
    this.name = "FirebaseNotConfiguredError";
  }
}

interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

let cachedAuth: Auth | undefined;

function readConfig(): FirebaseClientConfig {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  };

  const isComplete = Object.values(config).every((value) => typeof value === "string" && value.length > 0);
  if (!isComplete) {
    throw new FirebaseNotConfiguredError();
  }

  return config as FirebaseClientConfig;
}

function getFirebaseApp(): FirebaseApp {
  const existingApp = getApps()[0];
  return existingApp ?? initializeApp(readConfig());
}

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseApp());
  return cachedAuth;
}
