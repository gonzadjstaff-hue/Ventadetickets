import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildTicketsPdf, sanitizeFileNameId } from "./ticketPdf";

const { mockAddImage, mockAddPage, mockOutput, MockJsPDF } = vi.hoisted(() => {
  const mockAddImage = vi.fn();
  const mockAddPage = vi.fn();
  const mockOutput = vi.fn();
  class MockJsPDF {
    addImage = mockAddImage;
    addPage = mockAddPage;
    output = mockOutput;
  }
  return { mockAddImage, mockAddPage, mockOutput, MockJsPDF };
});

vi.mock("jspdf", () => ({ jsPDF: MockJsPDF }));

describe("sanitizeFileNameId", () => {
  it("deja pasar cuids alfanuméricos tal cual", () => {
    expect(sanitizeFileNameId("ckor2x9c40003uud8vv9ej3dx")).toBe("ckor2x9c40003uud8vv9ej3dx");
  });

  it("elimina espacios, símbolos y cualquier carácter fuera de [a-zA-Z0-9_-]", () => {
    expect(sanitizeFileNameId("ada lovelace / ../etc; DROP")).toBe("adalovelaceetcDROP");
  });
});

describe("buildTicketsPdf", () => {
  beforeEach(() => {
    mockAddImage.mockReset();
    mockAddPage.mockReset();
    mockOutput.mockReset();
    mockOutput.mockReturnValue(new Blob(["pdf-fake"]));
  });

  it("con 1 captura: no llama a addPage, agrega 1 imagen y pide el output como blob", async () => {
    const blob = await buildTicketsPdf([{ dataUrl: "data:image/png;base64,AAA", width: 340, height: 600 }]);

    expect(mockAddPage).not.toHaveBeenCalled();
    expect(mockAddImage).toHaveBeenCalledTimes(1);
    expect(mockOutput).toHaveBeenCalledWith("blob");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("con 2 capturas: llama a addPage exactamente 1 vez (antes de la segunda imagen) y agrega 2 imágenes", async () => {
    await buildTicketsPdf([
      { dataUrl: "data:image/png;base64,AAA", width: 340, height: 600 },
      { dataUrl: "data:image/png;base64,BBB", width: 340, height: 600 },
    ]);

    expect(mockAddPage).toHaveBeenCalledTimes(1);
    expect(mockAddImage).toHaveBeenCalledTimes(2);
  });

  it("usa PNG, nunca JPEG, para no comprimir el QR con pérdida", async () => {
    await buildTicketsPdf([{ dataUrl: "data:image/png;base64,AAA", width: 340, height: 600 }]);

    const [, format] = mockAddImage.mock.calls[0] as [string, string];
    expect(format).toBe("PNG");
  });

  it("conserva la relación de aspecto (nunca estira la imagen)", async () => {
    // Ticket angosto y alto (relación de aspecto real de la app: ~340x600).
    await buildTicketsPdf([{ dataUrl: "data:image/png;base64,AAA", width: 340, height: 680 }]);

    const [, , , , renderWidth, renderHeight] = mockAddImage.mock.calls[0] as [
      string,
      string,
      number,
      number,
      number,
      number,
    ];
    const sourceAspect = 340 / 680;
    const renderedAspect = renderWidth / renderHeight;
    expect(renderedAspect).toBeCloseTo(sourceAspect, 3);
  });

  it("centra la imagen dentro de la página (mismo margen a ambos lados)", async () => {
    await buildTicketsPdf([{ dataUrl: "data:image/png;base64,AAA", width: 340, height: 680 }]);

    const [, , x, , renderWidth] = mockAddImage.mock.calls[0] as [string, string, number, number, number, number];
    const pageWidthMm = 210;
    const marginLeft = x;
    const marginRight = pageWidthMm - (x + renderWidth);
    expect(marginRight).toBeCloseTo(marginLeft, 3);
  });

  it("no genera ninguna página si no hay capturas", async () => {
    await buildTicketsPdf([]);

    expect(mockAddImage).not.toHaveBeenCalled();
    expect(mockAddPage).not.toHaveBeenCalled();
  });
});
