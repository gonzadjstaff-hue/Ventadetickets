import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { createSession, type SessionResponse } from "../../api/auth";
import { ApiError } from "../../api/client";
import { AuthContext, type AuthContextValue, type AuthProfile } from "./authContextValue";
import { FirebaseNotConfiguredError } from "./firebaseClient";
import {
  getIdToken as fetchIdToken,
  loginWithEmail,
  logout as logoutService,
  mapFirebaseAuthError,
  subscribeToAuthState,
} from "./authService";
import type { User } from "firebase/auth";

/** El backend ya devuelve mensajes genéricos y seguros para cada error (401/403/409/500) — nunca se reexponen detalles crudos. */
function describeSessionError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "No pudimos validar tu sesión con el servidor.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

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

  // Resuelve (o vincula, la primera vez) el perfil de Postgres cada vez que
  // cambia el usuario de Firebase — la misma llamada cubre tanto el primer
  // login como la rehidratación al recargar con una sesión de Firebase ya
  // existente, porque POST /api/auth/session es idempotente una vez
  // vinculado (ver sessionService.ts en el backend). Se dispara solo cuando
  // `user` cambia de verdad (login/logout/rehidratación inicial), nunca en
  // cada render.
  useEffect(() => {
    let cancelled = false;

    if (!user) {
      // Agendado como microtask (no un setState síncrono dentro del cuerpo
      // del efecto), mismo motivo que el efecto de configError más arriba.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const token = await fetchIdToken(user);
        const response: SessionResponse = await createSession(token);
        if (!cancelled) setProfile(response.user);
      } catch (error) {
        if (cancelled) return;
        setProfile(null);
        setProfileError(describeSessionError(error));
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

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
    () => ({
      user,
      profile,
      loading,
      profileLoading,
      configError,
      loginError,
      profileError,
      login,
      logout,
      getIdToken,
    }),
    [user, profile, loading, profileLoading, configError, loginError, profileError, login, logout, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
