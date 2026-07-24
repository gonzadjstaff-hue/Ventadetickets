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

    render(<TicketQrCode token="abc123" ticketPublicId="ticket-xyz" />);

    await waitFor(() => expect(mockedToDataURL).toHaveBeenCalled());

    const [content] = mockedToDataURL.mock.calls[0];
    expect(content).toBe("pulse-ticket:v1:abc123");
  });

  it("renderiza la imagen del QR con alt accesible, sin mostrar el token como texto", async () => {
    mockedToDataURL.mockResolvedValue("data:image/png;base64,FAKE");

    render(<TicketQrCode token="abc123" ticketPublicId="ticket-xyz" />);

    const img = await screen.findByAltText(/código qr de tu entrada/i);
    expect(img).toBeInTheDocument();
    expect(screen.queryByText("abc123")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("abc123");
  });

  it("el botón de descarga usa pulse-event-<ticketPublicId>.png", async () => {
    mockedToDataURL.mockResolvedValue("data:image/png;base64,FAKE");

    render(<TicketQrCode token="abc123" ticketPublicId="ticket-xyz" />);

    const link = await screen.findByRole("link", { name: /descargar qr/i });
    expect(link).toHaveAttribute("download", "pulse-event-ticket-xyz.png");
  });

  it("si toDataURL falla, muestra un mensaje controlado sin romper ni exponer el token", async () => {
    mockedToDataURL.mockRejectedValue(new Error("boom, token=abc123"));

    render(<TicketQrCode token="abc123" ticketPublicId="ticket-xyz" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no pudimos generar el código qr/i);
    expect(screen.queryByAltText(/código qr/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /descargar qr/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("abc123");
    expect(document.body.textContent).not.toContain("boom");
  });
});
