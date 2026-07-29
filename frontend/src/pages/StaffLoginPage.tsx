import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { UserRole } from "../api/auth";
import { useAuth } from "../features/auth/useAuth";

const inputClassName =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[#E8EEF2] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ADE80]";

/** `null` si el rol no tiene un destino de staff — ver el caso "sin acceso" más abajo. */
function redirectPathForRole(role: UserRole): string | null {
  if (role === "ADMIN") return "/admin";
  if (role === "VALIDATOR") return "/check-in";
  return null;
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0C0C0C] px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,.6)]">
        <h1 className="text-center text-2xl font-black uppercase tracking-[.08em] text-[#E8EEF2]">Pulse Event</h1>
        <p className="mt-1 text-center text-sm text-[#AAB5BE]">Acceso de staff</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function FullScreenStatus({ role, children }: { role: "status" | "alert"; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0C0C0C] px-4">
      <p role={role} className="text-sm text-[#AAB5BE]">
        {children}
      </p>
    </div>
  );
}

/**
 * Login real de staff (ADMIN/VALIDATOR) — a diferencia de `/auth-debug`
 * (técnica/temporal), esta es la ruta pensada para uso real. Flujo: login de
 * Firebase → el contexto (`AuthProvider`, global) obtiene el ID Token y llama
 * `POST /api/auth/session` automáticamente → según el `role` que devuelva el
 * backend, redirige a `/admin` o `/check-in`. Nunca decide el destino por un
 * rol propio: siempre por `profile.role`, la respuesta ya vinculada del
 * backend.
 */
export default function StaffLoginPage() {
  useEffect(() => {
    document.title = "Ingresar — Pulse Event";
  }, []);

  const navigate = useNavigate();
  const { user, profile, loading, configError, profileError, loginError, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSessionError, setLastSessionError] = useState<string | null>(null);

  // Sesión ya vinculada (login recién hecho o rehidratada al recargar) —
  // redirige según el rol real. No depende de `profileLoading` (ver el
  // comentario en el render de abajo: hay un instante donde `user` ya existe
  // pero ese flag todavía no se activó) — `!profile` ya alcanza como gate.
  useEffect(() => {
    if (loading || !user || !profile) return;
    const target = redirectPathForRole(profile.role);
    if (target) navigate(target, { replace: true });
  }, [loading, user, profile, navigate]);

  // POST /api/auth/session falló (401/403/409/500): no dejamos una sesión de
  // Firebase "colgada" sin perfil interno válido — se cierra sola para que el
  // formulario vuelva a estar disponible, mostrando el motivo antes de que el
  // propio logout limpie profileError del contexto.
  useEffect(() => {
    if (!profileError) return;
    let cancelled = false;

    // Agendado como microtask (no un setState síncrono dentro del cuerpo del
    // efecto) — mismo patrón que AuthContext.tsx para configError/profile.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLastSessionError(profileError);
    });
    void logout();

    return () => {
      cancelled = true;
    };
  }, [profileError, logout]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLastSessionError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch {
      // loginError ya quedó seteado por el contexto.
    } finally {
      setSubmitting(false);
    }
  }

  // Firebase no está configurado (faltan las VITE_FIREBASE_*) — se muestra
  // antes que cualquier otro estado, con el mensaje real. Sin este chequeo,
  // el formulario de login se renderiza igual y cualquier intento de
  // loguearse termina mostrando el mensaje genérico de "credenciales
  // incorrectas" (mapFirebaseAuthError no reconoce FirebaseNotConfiguredError,
  // que no tiene `.code`), ocultando la causa real. Mismo criterio que
  // AuthDebugPage.tsx.
  if (configError) {
    return (
      <FullScreenStatus role="alert">
        {configError}
      </FullScreenStatus>
    );
  }

  if (loading) {
    return <FullScreenStatus role="status">Cargando…</FullScreenStatus>;
  }

  // No depende solo de `profileLoading`: hay un render intermedio donde
  // `user` ya está seteado pero ese flag todavía no se activó (el efecto que
  // lo pone en `true` corre en un ciclo posterior) — decidir por acá evita
  // que se muestre el formulario de login de vuelta en ese instante.
  if (user && !profile && !profileError) {
    return <FullScreenStatus role="status">Validando sesión…</FullScreenStatus>;
  }

  if (user && profile) {
    // Con destino de staff: el efecto de arriba ya está navegando — evita el
    // parpadeo del formulario de login durante ese instante.
    if (redirectPathForRole(profile.role)) {
      return <FullScreenStatus role="status">Cargando…</FullScreenStatus>;
    }

    // No debería pasar en la práctica (Firebase Auth es solo para ADMIN/
    // VALIDATOR, ver docs/DECISIONS.md), pero se maneja explícitamente en vez
    // de dejar la pantalla en un estado sin salida.
    return (
      <Card>
        <p role="alert" className="text-center text-sm text-[#F87171]">
          Esta cuenta no tiene acceso al panel de staff.
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 w-full rounded-full border border-white/20 px-8 py-3 text-sm font-bold uppercase tracking-[.06em] text-[#E8EEF2] outline-none transition-all hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8EEF2]"
        >
          Cerrar sesión
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-[#AAB5BE]">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[#AAB5BE]">
          Contraseña
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClassName} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 px-3 text-xs font-bold uppercase tracking-[.04em] text-[#AAB5BE] outline-none hover:text-[#E8EEF2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ADE80]"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </label>

        {(loginError ?? lastSessionError) && (
          <p role="alert" className="text-sm text-[#F87171]">
            {loginError ?? lastSessionError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-full bg-[#4ADE80] px-8 py-3 text-sm font-bold uppercase tracking-[.06em] text-[#04140A] outline-none transition-all hover:-translate-y-0.5 hover:bg-[#3FD374] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8EEF2] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {submitting ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </Card>
  );
}
