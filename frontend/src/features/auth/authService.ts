import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";

import { getFirebaseAuth } from "./firebaseClient";

export type { User };

/** Devuelve la función de desuscripción — el llamador es responsable de invocarla al desmontar. */
export function subscribeToAuthState(onChange: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), onChange);
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return credential.user;
}

export function logout(): Promise<void> {
  return signOut(getFirebaseAuth());
}

/**
 * `forceRefresh`: pide un token nuevo a Firebase en vez de reutilizar el que
 * el SDK cachea localmente. No hace falta para el uso actual (una consulta
 * puntual a GET /api/auth/me tras el login) — se deja documentado por si una
 * etapa futura con llamadas repetidas/de larga duración lo necesita.
 */
export function getIdToken(user: User, forceRefresh = false): Promise<string> {
  return user.getIdToken(forceRefresh);
}

/**
 * Traduce el `code` de un error de Firebase Auth a un mensaje en español,
 * sin nunca exponer el mensaje crudo del SDK (puede incluir detalles del
 * proyecto). Cualquier código no contemplado cae en un mensaje genérico.
 */
export function mapFirebaseAuthError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;

  if (typeof code === "string") {
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Email o contraseña incorrectos.";
      case "auth/invalid-email":
        return "El email no tiene un formato válido.";
      case "auth/too-many-requests":
        return "Demasiados intentos. Probá de nuevo en unos minutos.";
      case "auth/network-request-failed":
        return "No pudimos conectar con Firebase. Revisá tu conexión.";
      case "auth/user-disabled":
        return "Esta cuenta está deshabilitada.";
      default:
        return "No pudimos iniciar sesión. Probá de nuevo.";
    }
  }

  return "No pudimos iniciar sesión. Probá de nuevo.";
}
