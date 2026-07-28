import { createContext } from "react";
import type { User } from "firebase/auth";

export interface AuthContextValue {
  /** `null` mientras no hay sesión de Firebase (o todavía no se resolvió el estado inicial). */
  user: User | null;
  /** `true` solo durante la resolución inicial del estado de auth (primer callback de Firebase). */
  loading: boolean;
  /** Firebase no está configurado (faltan VITE_FIREBASE_*) — distinto de un error de login. */
  configError: string | null;
  /** Último error de un intento de login, en español, sin detalle crudo del SDK. */
  loginError: string | null;
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
