import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { postCheckIn, type CheckInResponse } from "../api/checkIns";
import CheckInPage from "./CheckInPage";

vi.mock("../api/checkIns", () => ({
  postCheckIn: vi.fn(),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: vi.fn().mockImplementation(function MockHtml5Qrcode() {
    return {
      isScanning: false,
      start: () => new Promise(() => {}), // nunca resuelve: estos tests manejan todo por carga manual.
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      clear: vi.fn(),
    };
  }),
}));

const mockedPostCheckIn = vi.mocked(postCheckIn);

async function submitManualPayload(user: ReturnType<typeof userEvent.setup>, payload: string) {
  await user.type(screen.getByLabelText(/contenido del qr/i), payload);
  await user.click(screen.getByRole("button", { name: /validar/i }));
}

const validResponse: CheckInResponse = {
  result: "VALID",
  message: "Acceso permitido.",
  ticketPublicId: "ticket-abc",
  holderName: "Ada Lovelace",
  ticketType: "General",
};

const alreadyUsedResponse: CheckInResponse = {
  result: "ALREADY_USED",
  message: "Este ticket ya fue utilizado.",
  ticketPublicId: "ticket-abc",
  holderName: "Ada Lovelace",
  ticketType: "General",
};

describe("CheckInPage", () => {
  beforeEach(() => {
    mockedPostCheckIn.mockReset();
  });

  it("renderiza la pantalla de control de acceso con el bloque de cámara y la carga manual", () => {
    render(<CheckInPage />);

    expect(screen.getByRole("heading", { name: /control de acceso/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar cámara/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/contenido del qr/i)).toBeInTheDocument();
  });

  it("validación manual exitosa: acceso permitido", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(validResponse);

    render(<CheckInPage />);
    await submitManualPayload(user, "pulse-ticket:v1:abc");

    expect(await screen.findByText(/^acceso permitido$/i)).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(mockedPostCheckIn).toHaveBeenCalledWith(expect.any(String), "pulse-ticket:v1:abc");
  });

  it("ticket ya utilizado", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(alreadyUsedResponse);

    render(<CheckInPage />);
    await submitManualPayload(user, "pulse-ticket:v1:abc");

    expect(await screen.findByText(/ticket ya utilizado/i)).toBeInTheDocument();
  });

  it("QR inválido", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockRejectedValue(new ApiError(400, "El código QR no es válido.", "INVALID_TICKET"));

    render(<CheckInPage />);
    await submitManualPayload(user, "esto-no-es-un-qr");

    expect(await screen.findByText(/qr inválido/i)).toBeInTheDocument();
    expect(screen.getByText(/el código qr no es válido/i)).toBeInTheDocument();
  });

  it("error de red", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<CheckInPage />);
    await submitManualPayload(user, "pulse-ticket:v1:abc");

    expect(await screen.findByText(/error de conexión/i)).toBeInTheDocument();
    expect(screen.getByText(/no pudimos conectar con el servidor/i)).toBeInTheDocument();
  });

  it("evita requests duplicadas mientras hay una validación en curso", async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: CheckInResponse) => void = () => {};
    mockedPostCheckIn.mockReturnValue(
      new Promise<CheckInResponse>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    render(<CheckInPage />);
    await submitManualPayload(user, "pulse-ticket:v1:abc");

    // Mientras está pendiente, el formulario de carga manual queda deshabilitado.
    const submitButton = screen.getByRole("button", { name: /validar/i });
    expect(submitButton).toBeDisabled();
    await user.click(submitButton);
    expect(mockedPostCheckIn).toHaveBeenCalledTimes(1);

    resolvePromise(validResponse);
    await screen.findByText(/^acceso permitido$/i);

    expect(mockedPostCheckIn).toHaveBeenCalledTimes(1);
  });

  it("permite escanear el siguiente ticket tras un resultado", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(validResponse);

    render(<CheckInPage />);
    await submitManualPayload(user, "pulse-ticket:v1:abc");
    await screen.findByText(/^acceso permitido$/i);

    await user.click(screen.getByRole("button", { name: /escanear siguiente/i }));

    expect(screen.queryByText(/^acceso permitido$/i)).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/contenido del qr/i)).toBeInTheDocument();
  });

  it("no persiste nada en localStorage ni sessionStorage durante todo el flujo", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(validResponse);

    render(<CheckInPage />);
    await submitManualPayload(user, "pulse-ticket:v1:abc");
    await screen.findByText(/^acceso permitido$/i);

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    setItemSpy.mockRestore();
  });

  it("no muestra el payload crudo del QR en ningún texto visible", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(validResponse);

    render(<CheckInPage />);
    await submitManualPayload(user, "pulse-ticket:v1:token-secreto-xyz");
    await screen.findByText(/^acceso permitido$/i);

    expect(document.body.textContent).not.toContain("token-secreto-xyz");
  });
});
