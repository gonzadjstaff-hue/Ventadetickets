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
