import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EventTicket, { type EventTicketHandle } from "./EventTicket";

const { mockedToDataURL, mockedToPng } = vi.hoisted(() => ({
  mockedToDataURL: vi.fn<(text: string, options?: Record<string, unknown>) => Promise<string>>(),
  mockedToPng: vi.fn<(node: HTMLElement, options?: Record<string, unknown>) => Promise<string>>(),
}));

vi.mock("qrcode", () => ({
  toDataURL: mockedToDataURL,
}));

vi.mock("html-to-image", () => ({
  toPng: mockedToPng,
}));

const defaultProps = {
  token: "raw-token-nunca-visible",
  attendeeName: "Ada Lovelace",
  ticketType: "General",
  ticketPublicId: "ticket-xyz",
};

describe("EventTicket", () => {
  beforeEach(() => {
    mockedToDataURL.mockReset();
    mockedToPng.mockReset();
    mockedToDataURL.mockResolvedValue("data:image/png;base64,QR_FAKE");
    mockedToPng.mockResolvedValue("data:image/png;base64,TICKET_FAKE");
  });

  it("muestra la entrada visual con el nombre del asistente, 'Entrada General' y el QR", async () => {
    render(<EventTicket {...defaultProps} />);

    expect(await screen.findByAltText(/código qr de tu entrada/i)).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Entrada General")).toBeInTheDocument();
    expect(screen.getByText("Pulse Event")).toBeInTheDocument();
    expect(screen.getByText("ticket-xyz")).toBeInTheDocument();
  });

  it("no aparece el token crudo como texto en ningún lado", async () => {
    render(<EventTicket {...defaultProps} />);
    await screen.findByAltText(/código qr de tu entrada/i);

    expect(document.body.textContent).not.toContain(defaultProps.token);
  });

  it("no tiene ningún botón propio: la descarga/compartir vive en el componente que lo use", async () => {
    render(<EventTicket {...defaultProps} />);
    await screen.findByAltText(/código qr de tu entrada/i);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("si falla la generación del QR, muestra un mensaje controlado", async () => {
    mockedToDataURL.mockRejectedValue(new Error("boom"));

    render(<EventTicket {...defaultProps} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos generar el código qr/i);
  });

  describe("generateCapture (ref imperativo)", () => {
    it("espera a que el QR esté listo antes de capturar y devuelve dataUrl/width/height", async () => {
      const ref = createRef<EventTicketHandle>();
      render(<EventTicket {...defaultProps} ref={ref} />);
      await screen.findByAltText(/código qr de tu entrada/i);

      const capture = await ref.current!.generateCapture();

      expect(capture.dataUrl).toBe("data:image/png;base64,TICKET_FAKE");
      expect(typeof capture.width).toBe("number");
      expect(typeof capture.height).toBe("number");
      expect(mockedToPng).toHaveBeenCalledTimes(1);
    });

    it("rechaza si el QR falló, y nunca llama a toPng", async () => {
      mockedToDataURL.mockRejectedValue(new Error("boom"));
      const ref = createRef<EventTicketHandle>();
      render(<EventTicket {...defaultProps} ref={ref} />);
      await screen.findByRole("alert");

      await expect(ref.current!.generateCapture()).rejects.toThrow();
      expect(mockedToPng).not.toHaveBeenCalled();
    });

    it("si se llama antes de que el QR termine de generarse, espera y captura recién cuando está listo", async () => {
      let resolveQr: (value: string) => void = () => {};
      mockedToDataURL.mockImplementation(() => new Promise((resolve) => { resolveQr = resolve; }));

      const ref = createRef<EventTicketHandle>();
      render(<EventTicket {...defaultProps} ref={ref} />);

      const capturePromise = ref.current!.generateCapture();
      expect(mockedToPng).not.toHaveBeenCalled();

      resolveQr("data:image/png;base64,QR_FAKE");
      const capture = await capturePromise;

      expect(capture.dataUrl).toBe("data:image/png;base64,TICKET_FAKE");
    });

    it("usa getBoundingClientRect (redondeado hacia arriba), no offsetWidth/offsetHeight, para evitar el recorte del borde derecho", async () => {
      const rectSpy = vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue({ width: 339.4, height: 611.2 } as DOMRect);
      const offsetWidthSpy = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
      const offsetHeightSpy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(500);

      const ref = createRef<EventTicketHandle>();
      render(<EventTicket {...defaultProps} ref={ref} />);
      await screen.findByAltText(/código qr de tu entrada/i);

      const capture = await ref.current!.generateCapture();

      // Math.ceil(339.4) = 340, Math.ceil(611.2) = 612 — nunca 300/500 (offsetWidth/Height).
      expect(capture.width).toBe(340);
      expect(capture.height).toBe(612);
      expect(mockedToPng).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ width: 340, height: 612 }));

      rectSpy.mockRestore();
      offsetWidthSpy.mockRestore();
      offsetHeightSpy.mockRestore();
    });

    it("espera a que las fuentes web terminen de cargar (document.fonts.ready) antes de capturar", async () => {
      let resolveFontsReady: () => void = () => {};
      const readyPromise = new Promise<void>((resolve) => {
        resolveFontsReady = resolve;
      });
      const originalFonts = document.fonts;
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: { ready: readyPromise },
      });

      try {
        const ref = createRef<EventTicketHandle>();
        render(<EventTicket {...defaultProps} ref={ref} />);
        await screen.findByAltText(/código qr de tu entrada/i);

        const capturePromise = ref.current!.generateCapture();
        await Promise.resolve();
        await Promise.resolve();
        expect(mockedToPng).not.toHaveBeenCalled();

        resolveFontsReady();
        await capturePromise;
        expect(mockedToPng).toHaveBeenCalledTimes(1);
      } finally {
        Object.defineProperty(document, "fonts", { configurable: true, value: originalFonts });
      }
    });
  });
});
