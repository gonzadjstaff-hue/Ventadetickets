import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { getMe, type MeResponse } from "../api/auth";
import { ApiError } from "../api/client";
import { AuthProvider } from "../features/auth/AuthContext";
import { useAuth } from "../features/auth/useAuth";

type MeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: MeResponse["user"] }
  | { status: "error"; message: string };

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-[#0C0C0C] px-4 py-10">
      <h1 className="text-2xl font-black uppercase tracking-[.08em] text-[#E8EEF2]">Auth (técnico)</h1>
      {children}
    </div>
  );
}

const inputClassName =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[#E8EEF2] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ADE80]";

function AuthDebugScreen() {
  useEffect(() => {
    document.title = "Auth (técnico) — Pulse Event";
  }, []);

  const { user, loading, configError, loginError, login, logout, getIdToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [meState, setMeState] = useState<MeState>({ status: "idle" });

  useEffect(() => {
    // Sin usuario no hay nada que consultar — y la rama de render de "sin
    // sesión" (más abajo) nunca lee `meState`, así que no hace falta
    // resetearlo acá: cuando vuelva a haber usuario, este mismo efecto ya lo
    // sobreescribe con "loading" antes de la próxima consulta.
    if (!user) return;

    let cancelled = false;

    void (async () => {
      setMeState({ status: "loading" });
      try {
        const token = await getIdToken();
        if (!token) throw new Error("No se pudo obtener el ID Token.");
        const response = await getMe(token);
        if (!cancelled) setMeState({ status: "success", data: response.user });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof ApiError ? error.message : "No pudimos validar la sesión contra el backend.";
        setMeState({ status: "error", message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, getIdToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch {
      // loginError ya quedó seteado por el contexto.
    } finally {
      setSubmitting(false);
    }
  }

  if (configError) {
    return (
      <Shell>
        <p role="alert" className="max-w-sm text-center text-sm text-[#F87171]">
          {configError}
        </p>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <p role="status" className="text-sm text-[#AAB5BE]">
          Cargando…
        </p>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
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
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClassName}
            />
          </label>
          {loginError && (
            <p role="alert" className="text-sm text-[#F87171]">
              {loginError}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-[#4ADE80] px-8 py-3 text-sm font-bold uppercase tracking-[.06em] text-[#04140A] outline-none transition-all hover:-translate-y-0.5 hover:bg-[#3FD374] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8EEF2] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm text-[#AAB5BE]">Sesión de Firebase iniciada como {user.email ?? "—"}</p>

      {meState.status === "loading" && (
        <p role="status" className="text-sm text-[#AAB5BE]">
          Validando sesión contra el backend…
        </p>
      )}

      {meState.status === "error" && (
        <p role="alert" className="max-w-sm text-center text-sm text-[#F87171]">
          {meState.message}
        </p>
      )}

      {meState.status === "success" && (
        <dl className="w-full max-w-sm space-y-2 text-sm text-[#E8EEF2]">
          <div className="flex justify-between gap-4">
            <dt className="text-[#AAB5BE]">Email</dt>
            <dd>{meState.data.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#AAB5BE]">Rol</dt>
            <dd>{meState.data.role}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#AAB5BE]">Estado</dt>
            <dd>{meState.data.status}</dd>
          </div>
        </dl>
      )}

      <button
        type="button"
        onClick={() => void logout()}
        className="rounded-full border border-white/20 px-8 py-3 text-sm font-bold uppercase tracking-[.06em] text-[#E8EEF2] outline-none transition-all hover:-translate-y-0.5 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8EEF2]"
      >
        Cerrar sesión
      </button>
    </Shell>
  );
}

/**
 * Pantalla técnica/temporal para validar de punta a punta login → ID Token →
 * GET /api/auth/me (ver docs/DECISIONS.md). No está en la navegación
 * pública, no protege ninguna ruta existente. AuthProvider se monta acá
 * mismo (no en main.tsx) para que este bloque quede completamente aislado:
 * nada de este código carga a menos que alguien visite /auth-debug.
 */
export default function AuthDebugPage() {
  return (
    <AuthProvider>
      <AuthDebugScreen />
    </AuthProvider>
  );
}
