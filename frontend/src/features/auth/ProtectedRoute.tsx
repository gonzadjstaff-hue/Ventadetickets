import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import type { UserRole } from "../../api/auth";
import { useAuth } from "./useAuth";

function FullScreenStatus({ role, children }: { role: "status" | "alert"; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0C0C0C] px-4">
      <p role={role} className="text-sm text-[#AAB5BE]">
        {children}
      </p>
    </div>
  );
}

interface ProtectedRouteProps {
  /** Roles internos (Postgres, vía `profile.role`) habilitados para esta ruta. */
  allowedRoles: UserRole[];
  children: ReactNode;
}

/**
 * Gate de UI, no de seguridad real: la única autoridad es el backend
 * (`requireAuth`/`requireRole`, ver docs/DECISIONS.md) — esto solo evita
 * mostrarle a alguien sin sesión o sin el rol correcto una pantalla que de
 * todos modos fallaría contra la API, y da una redirección prolija en vez de
 * un error crudo o un parpadeo de contenido protegido.
 *
 * Nunca decide por `user` (Firebase) solo: exige `profile` (la respuesta ya
 * vinculada de POST /api/auth/session), porque `user` puede existir con una
 * sesión de Firebase válida pero sin `User` interno vinculado todavía o
 * bloqueado (`profileError`) — en ese caso tampoco hay nada que autorizar acá.
 *
 * La decisión de "todavía cargando" se basa en `profile`/`profileError`
 * (no en `profileLoading`): el efecto que resuelve el perfil en AuthContext
 * corre en un ciclo de render posterior al que recién puso `user`, así que
 * hay un instante donde `user` ya existe pero `profileLoading` todavía no se
 * activó — decidir por ese flag ahí causaría una redirección prematura a
 * /staff/login antes de que la sesión termine de resolverse.
 */
export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, profile, profileError, loading } = useAuth();

  if (loading || (user && !profile && !profileError)) {
    return <FullScreenStatus role="status">Cargando…</FullScreenStatus>;
  }

  if (!user || !profile) {
    return <Navigate to="/staff/login" replace />;
  }

  if (!allowedRoles.includes(profile.role)) {
    return (
      <FullScreenStatus role="alert">No tenés permisos para acceder a esta sección.</FullScreenStatus>
    );
  }

  return <>{children}</>;
}
