import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TicketQrCode from "./TicketQrCode";

const { mockedToDataURL } = vi.hoisted(() => ({
  mockedToDataURL: vi.fn<(text: string, options?: Record<string, unknown>) => Promise<string>>(),
}));

vi.mock("qrcode", () => ({
  toDataURL: mockedToDataURL,
}));

describe("TicketQrCode", () => {
  beforeEach(() => {
    mockedToDataURL.mockReset();
  });

  it("codifica exactamente pulse-ticket:v1:<token>, sin datos personales", async () => {
    mockedToDataURL.mockResolvedValue("data:image/png;base64,FAKE");

    render(<TicketQrCode token="abc123" />);

    await waitFor(() => expect(mockedToDataURL).toHaveBeenCalled());

    const [content] = mockedToDataURL.mock.calls[0];
    expect(content).toBe("pulse-ticket:v1:abc123");
  });

  it("renderiza la imagen del QR con alt accesible, sin mostrar el token como texto", async () => {
    mockedToDataURL.mockResolvedValue("data:image/png;base64,FAKE");

    render(<TicketQrCode token="abc123" />);

    const img = await screen.findByAltText(/código qr de tu entrada/i);
    expect(img).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("abc123");
  });

  it("llama a onReady con el data URL cuando la generación es exitosa", async () => {
    mockedToDataURL.mockResolvedValue("data:image/png;base64,FAKE");
    const onReady = vi.fn();
    const onError = vi.fn();

    render(<TicketQrCode token="abc123" onReady={onReady} onError={onError} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledWith("data:image/png;base64,FAKE"));
    expect(onError).not.toHaveBeenCalled();
  });

  it("si toDataURL falla, muestra un mensaje controlado y llama a onError, sin exponer el token", async () => {
    mockedToDataURL.mockRejectedValue(new Error("boom, token=abc123"));
    const onReady = vi.fn();
    const onError = vi.fn();

    render(<TicketQrCode token="abc123" onReady={onReady} onError={onError} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no pudimos generar el código qr/i);
    expect(onError).toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("abc123");
    expect(document.body.textContent).not.toContain("boom");
  });
});
