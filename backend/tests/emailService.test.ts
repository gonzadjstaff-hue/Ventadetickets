import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GeneralTicketEmailInput } from "../src/integrations/email/types.js";

const { mockedToBuffer } = vi.hoisted(() => ({
  mockedToBuffer: vi.fn<(text: string, options?: Record<string, unknown>) => Promise<Buffer>>(),
}));

vi.mock("qrcode", () => ({
  default: { toBuffer: mockedToBuffer },
  toBuffer: mockedToBuffer,
}));

const { RESEND_TIMEOUT_MS } = await import("../src/integrations/email/resendProvider.js");
const { sendGeneralTicketEmail } = await import("../src/integrations/email/emailService.js");

const baseInput: GeneralTicketEmailInput = {
  to: "ada@example.com",
  attendeeName: "Ada Lovelace",
  eventTitle: "Pulse Festival 2026",
  eventStartsAt: new Date("2026-11-15T00:00:00.000Z"),
  eventVenueName: "Costanera Sur",
  eventAddress: "Av. Tristán Achával Rodríguez, Buenos Aires",
  ticketTypeName: "General",
  ticketPublicId: "ticket-public-abc",
  ticketToken: "raw-token-secreto-xyz",
};

const TIMEZONE = "America/Argentina/Buenos_Aires";

describe("sendGeneralTicketEmail", () => {
  beforeEach(() => {
    mockedToBuffer.mockReset();
    mockedToBuffer.mockResolvedValue(Buffer.from("fake-png-bytes"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sin provider configurado devuelve disabled y no hace ninguna llamada de red", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendGeneralTicketEmail(baseInput, {}, TIMEZONE);

    expect(result).toEqual({ status: "disabled" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("provider resend sin apiKey/from configurados devuelve disabled", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendGeneralTicketEmail(baseInput, { provider: "resend" }, TIMEZONE);

    expect(result).toEqual({ status: "disabled" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("provider console", () => {
    it("devuelve simulated (no sent) y no hace ninguna llamada de red", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await sendGeneralTicketEmail(baseInput, { provider: "console" }, TIMEZONE);

      expect(result).toEqual({ status: "simulated" });
      expect(result.status).not.toBe("sent");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("solo loguea un resumen seguro: ticketPublicId, evento, tipo de entrada y estado", async () => {
      vi.stubGlobal("fetch", vi.fn());
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await sendGeneralTicketEmail(baseInput, { provider: "console" }, TIMEZONE);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = logSpy.mock.calls[0]?.join(" ") ?? "";

      expect(logged).toContain(baseInput.ticketPublicId);
      expect(logged).toContain(baseInput.eventTitle);
      expect(logged).toContain(baseInput.ticketTypeName);
      expect(logged).toContain("simulated");

      expect(logged).not.toContain(baseInput.to);
      expect(logged).not.toContain(baseInput.ticketToken);
      expect(logged).not.toContain(`pulse-ticket:v1:${baseInput.ticketToken}`);
      expect(logged).not.toContain("base64");
    });
  });

  describe("provider resend", () => {
    it("respuesta ok del proveedor devuelve sent", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const result = await sendGeneralTicketEmail(
        baseInput,
        { provider: "resend", apiKey: "re_test_key", from: "Pulse Event <no-reply@pulse.dev>" },
        TIMEZONE,
      );

      expect(result).toEqual({ status: "sent" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("el proveedor recibe el HTML con cid:pulse-ticket-qr y un attachment inline con ese content_id", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      await sendGeneralTicketEmail(
        baseInput,
        { provider: "resend", apiKey: "re_test_key", from: "Pulse Event <no-reply@pulse.dev>" },
        TIMEZONE,
      );

      const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(requestInit.body as string);

      expect(body.html).toContain("cid:pulse-ticket-qr");
      expect(body.attachments).toHaveLength(1);
      expect(body.attachments[0]).toMatchObject({
        filename: "pulse-ticket-qr.png",
        content_id: "pulse-ticket-qr",
        content_disposition: "inline",
      });
      expect(typeof body.attachments[0].content).toBe("string");
      expect(body.attachments[0].content.length).toBeGreaterThan(0);
    });

    it("respuesta no-ok del proveedor devuelve failed, sin exponer token ni credenciales en ningún log", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.stubGlobal("fetch", fetchMock);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await sendGeneralTicketEmail(
        baseInput,
        { provider: "resend", apiKey: "re_super_secret_key", from: "Pulse Event <no-reply@pulse.dev>" },
        TIMEZONE,
      );

      expect(result).toEqual({ status: "failed" });

      const loggedText = errorSpy.mock.calls.map((call) => call.join(" ")).join(" ");
      expect(loggedText).not.toContain("re_super_secret_key");
      expect(loggedText).not.toContain(baseInput.ticketToken);
      expect(loggedText).not.toContain(baseInput.to);
    });

    it(
      "un timeout del proveedor produce failed en vez de colgar la request indefinidamente",
      async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          });
        });
        vi.stubGlobal("fetch", fetchMock);
        vi.spyOn(console, "error").mockImplementation(() => {});

        const resultPromise = sendGeneralTicketEmail(
          baseInput,
          { provider: "resend", apiKey: "re_test_key", from: "Pulse Event <no-reply@pulse.dev>" },
          TIMEZONE,
        );

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toEqual({ status: "failed" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
      10000,
    );

    it("respeta RESEND_TIMEOUT_MS como duración configurada del timeout", () => {
      expect(RESEND_TIMEOUT_MS).toBeGreaterThan(0);
      expect(RESEND_TIMEOUT_MS).toBeLessThanOrEqual(15000);
    });

    it("no incluye el token crudo como texto en el request enviado al proveedor", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      await sendGeneralTicketEmail(
        baseInput,
        { provider: "resend", apiKey: "re_test_key", from: "Pulse Event <no-reply@pulse.dev>" },
        TIMEZONE,
      );

      const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const rawBody = requestInit.body as string;

      expect(rawBody).not.toContain(baseInput.ticketToken);
    });
  });
});
