import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedToBuffer } = vi.hoisted(() => ({
  mockedToBuffer: vi.fn<(text: string, options?: Record<string, unknown>) => Promise<Buffer>>(),
}));

vi.mock("qrcode", () => ({
  default: { toBuffer: mockedToBuffer },
  toBuffer: mockedToBuffer,
}));

const { QR_CONTENT_ID, buildGeneralTicketEmailContent } = await import("../src/integrations/email/template.js");

const baseInput = {
  to: "ada@example.com",
  attendeeName: "Ada Lovelace",
  eventTitle: "Pulse Festival 2026",
  eventStartsAt: new Date("2026-11-15T00:00:00.000Z"), // 2026-11-14 21:00 en America/Argentina/Buenos_Aires (UTC-3)
  eventVenueName: "Costanera Sur",
  eventAddress: "Av. Tristán Achával Rodríguez, Buenos Aires",
  ticketTypeName: "General",
  ticketPublicId: "ticket-public-abc",
  ticketToken: "raw-token-secreto-xyz",
};

describe("buildGeneralTicketEmailContent", () => {
  beforeEach(() => {
    mockedToBuffer.mockReset();
    mockedToBuffer.mockResolvedValue(Buffer.from("fake-png-bytes"));
  });

  it("el QR generado codifica exactamente pulse-ticket:v1:<ticketToken>", async () => {
    await buildGeneralTicketEmailContent(baseInput, "America/Argentina/Buenos_Aires");

    expect(mockedToBuffer).toHaveBeenCalledWith(
      `pulse-ticket:v1:${baseInput.ticketToken}`,
      expect.objectContaining({ margin: 1 }),
    );
  });

  it("el HTML referencia el QR como cid:pulse-ticket-qr", async () => {
    const content = await buildGeneralTicketEmailContent(baseInput, "America/Argentina/Buenos_Aires");

    expect(QR_CONTENT_ID).toBe("pulse-ticket-qr");
    expect(content.html).toContain('src="cid:pulse-ticket-qr"');
    expect(content.qrContentId).toBe("pulse-ticket-qr");
  });

  it("no genera el QR como data URI dentro del HTML", async () => {
    const content = await buildGeneralTicketEmailContent(baseInput, "America/Argentina/Buenos_Aires");

    expect(content.html).not.toContain("data:image");
    expect(content.qrPng).toBeInstanceOf(Buffer);
  });

  it("incluye evento, fecha, ubicación, asistente, tipo de entrada y ticketPublicId", async () => {
    const content = await buildGeneralTicketEmailContent(baseInput, "America/Argentina/Buenos_Aires");

    expect(content.html).toContain("Pulse Festival 2026");
    expect(content.html).toContain("Ada Lovelace");
    expect(content.html).toContain("General");
    expect(content.html).toContain("ticket-public-abc");
    expect(content.html).toContain("Costanera Sur");
    expect(content.html).toContain("Av. Tristán Achával Rodríguez, Buenos Aires");
  });

  it("formatea fecha y horario usando la zona horaria configurada, no la del servidor", async () => {
    const contentBA = await buildGeneralTicketEmailContent(baseInput, "America/Argentina/Buenos_Aires");
    const contentUTC = await buildGeneralTicketEmailContent(baseInput, "UTC");

    // 2026-11-15T00:00:00Z es 21:00 en Buenos Aires (UTC-3) y 00:00 en UTC: deben diferir.
    expect(contentBA.html).toContain("21:00");
    expect(contentUTC.html).toContain("00:00");
    expect(contentBA.html).not.toContain(">00:00<");
  });

  it("escapa HTML en nombre del asistente, título del evento, ubicación, dirección, tipo de entrada y ticketPublicId", async () => {
    const maliciousInput = {
      ...baseInput,
      attendeeName: '<img src=x onerror="alert(1)">',
      eventTitle: "<script>alert('evt')</script>",
      eventVenueName: '<b onclick="x()">Venue</b>',
      eventAddress: "<i>Dirección</i>",
      ticketTypeName: "<u>General</u>",
      ticketPublicId: '"><script>alert(2)</script>',
    };

    const content = await buildGeneralTicketEmailContent(maliciousInput, "America/Argentina/Buenos_Aires");

    expect(content.html).not.toContain("<script>");
    expect(content.html).not.toContain("<img src=x onerror=");
    expect(content.html).not.toContain('<b onclick="x()">');
    expect(content.html).not.toContain("<i>Dirección</i>");
    expect(content.html).not.toContain("<u>General</u>");
    expect(content.html).toContain("&lt;script&gt;");
    expect(content.html).toContain("&lt;img src=x onerror=");
  });

  it("no incluye el token crudo como texto en ningún lado del HTML ni del asunto", async () => {
    const content = await buildGeneralTicketEmailContent(baseInput, "America/Argentina/Buenos_Aires");

    expect(content.html).not.toContain(baseInput.ticketToken);
    expect(content.subject).not.toContain(baseInput.ticketToken);
  });
});
