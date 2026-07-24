import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EventTicket from "./EventTicket";

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
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedToDataURL.mockReset();
    mockedToPng.mockReset();
    mockedToDataURL.mockResolvedValue("data:image/png;base64,QR_FAKE");
    mockedToPng.mockResolvedValue("data:image/png;base64,TICKET_FAKE");
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it("muestra la entrada visual con el nombre del asistente, 'Entrada General' y el QR", async () => {
    render(<EventTicket {...defaultProps} />);

    expect(await screen.findByAltText(/código qr de tu entrada/i)).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Entrada General")).toBeInTheDocument();
    expect(screen.getByText("Pulse Event")).toBeInTheDocument();
  });

  it("muestra el botón 'Descargar entrada'", async () => {
    render(<EventTicket {...defaultProps} />);
    await screen.findByAltText(/código qr de tu entrada/i);

    expect(screen.getByRole("button", { name: /descargar entrada/i })).toBeInTheDocument();
  });

  it("el archivo descargado usa pulse-event-ticket-<ticketPublicId>.png", async () => {
    const user = userEvent.setup();
    render(<EventTicket {...defaultProps} />);

    const button = await screen.findByRole("button", { name: /descargar entrada/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));

    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("pulse-event-ticket-ticket-xyz.png");
    expect(anchor.href).toContain("TICKET_FAKE");
  });

  it("no aparece el token crudo como texto en ningún lado", async () => {
    render(<EventTicket {...defaultProps} />);
    await screen.findByAltText(/código qr de tu entrada/i);

    expect(document.body.textContent).not.toContain(defaultProps.token);
  });

  it("si falla la generación del QR, muestra un mensaje controlado y deshabilita la descarga", async () => {
    mockedToDataURL.mockRejectedValue(new Error("boom"));

    render(<EventTicket {...defaultProps} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos generar el código qr/i);
    expect(screen.getByRole("button", { name: /descargar entrada/i })).toBeDisabled();
  });

  it("si falla la exportación a PNG, muestra un mensaje controlado sin romper el resto de la entrada", async () => {
    const user = userEvent.setup();
    mockedToPng.mockRejectedValue(new Error("export failed"));

    render(<EventTicket {...defaultProps} />);

    const button = await screen.findByRole("button", { name: /descargar entrada/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos exportar tu entrada/i);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByAltText(/código qr de tu entrada/i)).toBeInTheDocument();
  });
});
