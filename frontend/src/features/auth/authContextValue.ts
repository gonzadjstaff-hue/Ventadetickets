import { createContext } from "react";
import type { User } from "firebase/auth";

import type { SessionResponse } from "../../api/auth";

/** Perfil devuelto por POST /api/auth/session — siempre sale de Postgres, nunca del token ni de datos enviados por el frontend. */
export type AuthProfile = SessionResponse["user"];

export interface AuthContextValue {
  /** `null` mientras no hay sesión de Firebase (o todavía no se resolvió el estado inicial). */
  user: User | null;
  /** `null` mientras no hay sesión vinculada contra el backend todavía (o falló la vinculación). */
  profile: AuthProfile | null;
  /** `true` solo durante la resolución inicial del estado de auth (primer callback de Firebase). */
  loading: boolean;
  /** `true` mientras se resuelve/vincula la sesión contra POST /api/auth/session. */
  profileLoading: boolean;
  /** Firebase no está configurado (faltan VITE_FIREBASE_*) — distinto de un error de login. */
  configError: string | null;
  /** Último error de un intento de login, en español, sin detalle crudo del SDK. */
  loginError: string | null;
  /** Último error de POST /api/auth/session (401/403/409/500) — mensaje ya sanitizado por el backend. */
  profileError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** `null` si no hay usuario autenticado. */
  getIdToken: () => Promise<string | null>;
}

/**
 * Separado de AuthContext.tsx (que solo exporta el componente AuthProvider)
 * y de useAuth.ts (que solo exporta el hook) para que cada archivo exporte
 * una única cosa — evita el warning de Fast Refresh de mezclar componentes
 * con contexto/hooks en el mismo módulo.
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
