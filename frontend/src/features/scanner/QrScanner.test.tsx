import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QrScanner from "./QrScanner";

const { startMock, stopMock, pauseMock, clearMock, capturedSuccessCallback } = vi.hoisted(() => ({
  startMock: vi.fn(),
  stopMock: vi.fn(),
  pauseMock: vi.fn(),
  clearMock: vi.fn(),
  capturedSuccessCallback: { current: null as ((text: string) => void) | null },
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: vi.fn().mockImplementation(function MockHtml5Qrcode() {
    return {
      isScanning: true,
      start: (_cameraConfig: unknown, _scanConfig: unknown, onSuccess: (text: string) => void) => {
        capturedSuccessCallback.current = onSuccess;
        return startMock();
      },
      stop: stopMock,
      pause: pauseMock,
      clear: clearMock,
    };
  }),
}));

describe("QrScanner", () => {
  beforeEach(() => {
    startMock.mockReset().mockResolvedValue(null);
    stopMock.mockReset().mockResolvedValue(undefined);
    pauseMock.mockReset();
    clearMock.mockReset();
    capturedSuccessCallback.current = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("no arranca la cámara sola: muestra el botón 'Iniciar cámara' y ningún preview", () => {
    render(<QrScanner enabled onDecode={vi.fn()} />);

    expect(screen.getByRole("button", { name: /iniciar cámara/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /detener cámara/i })).not.toBeInTheDocument();
    expect(startMock).not.toHaveBeenCalled();
  });

  it("al clickear 'Iniciar cámara' arranca el lector y pasa a 'Detener cámara'", async () => {
    const user = userEvent.setup();
    render(<QrScanner enabled onDecode={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /iniciar cámara/i }));

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: /detener cámara/i })).toBeInTheDocument();
  });

  it("al clickear 'Detener cámara' frena el lector y vuelve a 'Iniciar cámara'", async () => {
    const user = userEvent.setup();
    render(<QrScanner enabled onDecode={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /iniciar cámara/i }));
    await screen.findByRole("button", { name: /detener cámara/i });

    await user.click(screen.getByRole("button", { name: /detener cámara/i }));

    expect(await screen.findByRole("button", { name: /iniciar cámara/i })).toBeInTheDocument();
    await waitFor(() => expect(stopMock).toHaveBeenCalled());
  });

  it("llama a onDecode una sola vez aunque el lector dispare el callback dos veces seguidas", async () => {
    const onDecode = vi.fn();
    const user = userEvent.setup();
    render(<QrScanner enabled onDecode={onDecode} />);

    await user.click(screen.getByRole("button", { name: /iniciar cámara/i }));
    await waitFor(() => expect(capturedSuccessCallback.current).not.toBeNull());

    capturedSuccessCallback.current!("pulse-ticket:v1:abc123");
    capturedSuccessCallback.current!("pulse-ticket:v1:abc123");

    expect(onDecode).toHaveBeenCalledTimes(1);
    expect(onDecode).toHaveBeenCalledWith("pulse-ticket:v1:abc123");
    expect(pauseMock).toHaveBeenCalledWith(true);
  });

  it("detiene la cámara al desmontarse mientras está corriendo", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<QrScanner enabled onDecode={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /iniciar cámara/i }));
    await screen.findByRole("button", { name: /detener cámara/i });

    unmount();

    await waitFor(() => expect(stopMock).toHaveBeenCalled());
  });

  it("apaga la cámara y deshabilita el botón cuando enabled pasa a false", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<QrScanner enabled onDecode={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /iniciar cámara/i }));
    await screen.findByRole("button", { name: /detener cámara/i });

    rerender(<QrScanner enabled={false} onDecode={vi.fn()} />);

    await waitFor(() => expect(stopMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /iniciar cámara/i })).toBeDisabled();
  });

  it("muestra un mensaje accesible si falla el acceso a la cámara, y permite reintentar", async () => {
    startMock.mockRejectedValueOnce(new Error("Permission denied"));
    const user = userEvent.setup();
    render(<QrScanner enabled onDecode={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /iniciar cámara/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos acceder a la cámara/i);
    expect(screen.getByRole("button", { name: /iniciar cámara/i })).toBeInTheDocument();
  });

  it("no muestra ni guarda el payload decodificado en ningún texto visible", async () => {
    const onDecode = vi.fn();
    const user = userEvent.setup();
    render(<QrScanner enabled onDecode={onDecode} />);

    await user.click(screen.getByRole("button", { name: /iniciar cámara/i }));
    await waitFor(() => expect(capturedSuccessCallback.current).not.toBeNull());
    capturedSuccessCallback.current!("pulse-ticket:v1:super-secreto");

    expect(document.body.textContent).not.toContain("super-secreto");
  });
});
