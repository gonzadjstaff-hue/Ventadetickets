import { afterEach, describe, expect, it, vi } from "vitest";

import { postCheckIn, type CheckInResponse } from "./checkIns";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

const validResponse: CheckInResponse = {
  result: "VALID",
  message: "Acceso permitido.",
  ticketPublicId: "ticket-abc",
  holderName: "Ada Lovelace",
  ticketType: "General",
};

/** Valor de prueba, nunca una credencial real. */
const FAKE_ID_TOKEN = "fake-id-token-for-tests-only";

describe("postCheckIn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hace POST a /api/events/:eventPublicId/check-ins con el header Authorization: Bearer <idToken>", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, validResponse));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postCheckIn("event-public-1", "pulse-ticket:v1:abc", FAKE_ID_TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toContain("/api/events/event-public-1/check-ins");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${FAKE_ID_TOKEN}` });

    // El token viaja únicamente en el header, nunca en el body.
    const parsedBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsedBody).toEqual({ qrPayload: "pulse-ticket:v1:abc" });
    expect(JSON.stringify(parsedBody)).not.toContain(FAKE_ID_TOKEN);

    expect(result).toEqual(validResponse);
  });

  it("no reemplaza otros headers agregados por apiFetch (Content-Type sigue presente)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, validResponse));
    vi.stubGlobal("fetch", fetchMock);

    await postCheckIn("event-public-1", "pulse-ticket:v1:abc", FAKE_ID_TOKEN);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: `Bearer ${FAKE_ID_TOKEN}`,
    });
  });

  it("propaga errores del backend (ApiError) sin exponer el token en el mensaje", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "No autorizado." } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(postCheckIn("event-public-1", "pulse-ticket:v1:abc", FAKE_ID_TOKEN)).rejects.toMatchObject({
      status: 401,
      message: "No autorizado.",
    });
  });
});
