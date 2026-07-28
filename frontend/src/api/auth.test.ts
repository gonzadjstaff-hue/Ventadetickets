import { afterEach, describe, expect, it, vi } from "vitest";

import { createSession } from "./auth";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

describe("createSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hace POST a /api/auth/session con el Bearer token y sin body (nunca role/email/firebaseUid)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { user: { id: "user-1", email: "admin@test.local", role: "ADMIN", status: "ACTIVE" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSession("id-token-abc");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/auth/session");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer id-token-abc" });
    expect(init.body).toBeUndefined();
    expect(result.user).toEqual({ id: "user-1", email: "admin@test.local", role: "ADMIN", status: "ACTIVE" });
  });

  it("propaga errores del backend (ApiError) sin exponer detalle crudo adicional", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(409, { error: { code: "FIREBASE_UID_CONFLICT", message: "Esta cuenta ya está vinculada a otro usuario de Firebase." } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSession("id-token-abc")).rejects.toMatchObject({
      status: 409,
      message: "Esta cuenta ya está vinculada a otro usuario de Firebase.",
    });
  });
});
