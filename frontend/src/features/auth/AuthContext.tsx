import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AuthContext, type AuthContextValue } from "./authContextValue";
import { FirebaseNotConfiguredError } from "./firebaseClient";
import {
  getIdToken as fetchIdToken,
  loginWithEmail,
  logout as logoutService,
  mapFirebaseAuthError,
  subscribeToAuthState,
} from "./authService";
import type { User } from "firebase/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    try {
      unsubscribe = subscribeToAuthState((firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
      });
    } catch (error) {
      // Se agenda como microtask (no un setState síncrono dentro del cuerpo
      // del efecto) — getFirebaseAuth() lanza sincrónicamente cuando faltan
      // las VITE_FIREBASE_*, y React desaconseja actualizar estado en el
      // mismo tick del montaje.
      const message = error instanceof FirebaseNotConfiguredError ? error.message : "No pudimos inicializar Firebase.";
      Promise.resolve().then(() => {
        if (cancelled) return;
        setConfigError(message);
        setLoading(false);
      });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoginError(null);
    try {
      await loginWithEmail(email, password);
    } catch (error) {
      setLoginError(mapFirebaseAuthError(error));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutService();
  }, []);

  const getIdToken = useCallback(async () => {
    if (!user) return null;
    return fetchIdToken(user);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, configError, loginError, login, logout, getIdToken }),
    [user, loading, configError, loginError, login, logout, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
