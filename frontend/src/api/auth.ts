import { apiFetch } from "./client";

export type UserRole = "USER" | "VALIDATOR" | "ADMIN";
export type UserStatus = "ACTIVE" | "BLOCKED";

export interface MeResponse {
  user: {
    id: string;
    firebaseUid: string;
    email: string;
    role: UserRole;
    status: UserStatus;
  };
}

/** Requiere un Firebase ID Token vigente (ver features/auth/). Nunca cachea ni persiste el token. */
export function getMe(idToken: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/auth/me", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

export interface SessionResponse {
  user: {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
  };
}

/**
 * Primer acceso (vincula firebaseUid ↔ User preprovisionado) o resolución de
 * una sesión ya vinculada — idempotente una vez linkeado (ver
 * backend/src/modules/auth/sessionService.ts). Nunca manda body: la única
 * identidad que cuenta es la del Firebase ID Token, que el backend verifica
 * por su cuenta — nunca datos que el frontend pudiera enviar (role/email/uid).
 */
export function createSession(idToken: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/api/auth/session", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
}
