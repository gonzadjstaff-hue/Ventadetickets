import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../api/client";
import { registerGeneralTicket, type GeneralRegistrationResponse } from "../../../api/registrations";
import GeneralRegistrationModal from "./GeneralRegistrationModal";

vi.mock("../../../api/registrations", () => ({
  registerGeneralTicket: vi.fn(),
}));

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

const mockedRegister = vi.mocked(registerGeneralTicket);

function renderModal(open = true) {
  const queryClient = new QueryClient();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <GeneralRegistrationModal open={open} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nombre/i), "Ada");
  await user.type(screen.getByLabelText(/apellido/i), "Lovelace");
  await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
  await user.type(screen.getByLabelText(/whatsapp/i), "+5491122334455");
  await user.click(screen.getByRole("checkbox"));
}

const successResponse: GeneralRegistrationResponse = {
  attendeeName: "Ada Lovelace",
  orderPublicId: "order-1",
  ticketPublicId: "ticket-1",
  ticketToken: "raw-token-nunca-visible",
  ticketType: "General",
  message: "¡Listo! Tu entrada General quedó confirmada.",
  emailStatus: "sent",
  emailSent: true,
};

describe("GeneralRegistrationModal", () => {
  beforeEach(() => {
    mockedRegister.mockReset();
    mockedToDataURL.mockReset();
    mockedToDataURL.mockResolvedValue("data:image/png;base64,FAKE");
    mockedToPng.mockReset();
    mockedToPng.mockResolvedValue("data:image/png;base64,TICKET_FAKE");
  });

  it("no renderiza nada si open es false", () => {
    renderModal(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renderiza el formulario con los campos requeridos", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apellido/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/whatsapp/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("muestra errores de validación por campo si se envía vacío", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByText(/ingresá tu nombre/i)).toBeInTheDocument();
    expect(screen.getByText(/ingresá tu apellido/i)).toBeInTheDocument();
    expect(screen.getByText(/tenés que aceptar los términos/i)).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("muestra estado de carga y deshabilita el botón durante el envío", async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: GeneralRegistrationResponse) => void = () => {};
    mockedRegister.mockReturnValue(
      new Promise<GeneralRegistrationResponse>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    const submitButton = await screen.findByRole("button", { name: /confirmando/i });
    expect(submitButton).toBeDisabled();

    resolvePromise(successResponse);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /quedó confirmada/i })).toBeInTheDocument(),
    );
  });

  it("muestra el mensaje de éxito con los datos devueltos, sin exponer el token", async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue(successResponse);

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByRole("heading", { name: /quedó confirmada/i })).toBeInTheDocument();
    expect(screen.getAllByText(/ada lovelace/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(successResponse.ticketToken)).not.toBeInTheDocument();
  });

  it("muestra un mensaje específico si el email ya está registrado (409)", async () => {
    const user = userEvent.setup();
    mockedRegister.mockRejectedValue(
      new ApiError(409, "Este email ya tiene una entrada General para este evento.", "DUPLICATE_REGISTRATION"),
    );

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByText(/ya tiene una entrada general/i)).toBeInTheDocument();
  });

  it("muestra un error genérico ante una falla de red", async () => {
    const user = userEvent.setup();
    mockedRegister.mockRejectedValue(new TypeError("Failed to fetch"));

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByText(/no pudimos conectar con el servidor/i)).toBeInTheDocument();
  });

  it("muestra el QR recién después de un registro exitoso", async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue(successResponse);

    renderModal();

    expect(screen.queryByAltText(/código qr de tu entrada/i)).not.toBeInTheDocument();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByAltText(/código qr de tu entrada/i)).toBeInTheDocument();
    expect(mockedToDataURL).toHaveBeenCalledWith(
      `pulse-ticket:v1:${successResponse.ticketToken}`,
      expect.anything(),
    );
  });

  it("el QR no aparece antes de que el registro sea exitoso", async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: GeneralRegistrationResponse) => void = () => {};
    mockedRegister.mockReturnValue(
      new Promise<GeneralRegistrationResponse>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    // Mientras el registro está en curso (pendiente), no debe existir ningún QR.
    expect(screen.queryByAltText(/código qr de tu entrada/i)).not.toBeInTheDocument();

    resolvePromise(successResponse);
    expect(await screen.findByAltText(/código qr de tu entrada/i)).toBeInTheDocument();
  });

  it("muestra el botón 'Descargar entrada' tras un registro exitoso", async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue(successResponse);

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByRole("button", { name: /descargar entrada/i })).toBeInTheDocument();
  });

  it("al cerrar y reabrir el modal no queda el QR de la vez anterior", async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue(successResponse);

    const queryClient = new QueryClient();
    const onClose = vi.fn();

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <GeneralRegistrationModal key="instance-1" open={true} onClose={onClose} />
      </QueryClientProvider>,
    );

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));
    await screen.findByAltText(/código qr de tu entrada/i);

    // Cerrar (mismo estado del componente, solo open=false).
    rerender(
      <QueryClientProvider client={queryClient}>
        <GeneralRegistrationModal key="instance-1" open={false} onClose={onClose} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reabrir con una key distinta: mismo mecanismo de remount que usa
    // TicketTypes.tsx en la app real cada vez que se abre el modal.
    rerender(
      <QueryClientProvider client={queryClient}>
        <GeneralRegistrationModal key="instance-2" open={true} onClose={onClose} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^entrada general$/i })).toBeInTheDocument();
    expect(screen.queryByAltText(/código qr de tu entrada/i)).not.toBeInTheDocument();
  });

  it("no persiste nada en localStorage ni sessionStorage durante todo el flujo", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue(successResponse);

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));
    await screen.findByAltText(/código qr de tu entrada/i);

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it("emailStatus 'sent': mensaje normal de éxito, sin advertencia de email", async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue(successResponse);

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByRole("heading", { name: /quedó confirmada/i })).toBeInTheDocument();
    expect(screen.queryByText(/no pudimos enviar el email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/envío de email simulado/i)).not.toBeInTheDocument();
  });

  it("emailStatus 'failed': muestra la advertencia y conserva la descarga", async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue({ ...successResponse, emailStatus: "failed", emailSent: false });

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByText("Tu entrada fue creada, pero no pudimos enviar el email.")).toBeInTheDocument();
    expect(await screen.findByAltText(/código qr de tu entrada/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /descargar entrada/i })).toBeInTheDocument();
  });

  it("emailStatus 'disabled': muestra la misma advertencia y conserva la descarga", async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue({ ...successResponse, emailStatus: "disabled", emailSent: false });

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByText("Tu entrada fue creada, pero no pudimos enviar el email.")).toBeInTheDocument();
    expect(await screen.findByAltText(/código qr de tu entrada/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /descargar entrada/i })).toBeInTheDocument();
  });

  it("emailStatus 'simulated': muestra una indicación discreta (modo desarrollo) y conserva la descarga", async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue({ ...successResponse, emailStatus: "simulated", emailSent: false });

    renderModal();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /confirmar entrada gratuita/i }));

    expect(await screen.findByText(/envío de email simulado/i)).toBeInTheDocument();
    expect(screen.queryByText(/no pudimos enviar el email/i)).not.toBeInTheDocument();
    expect(await screen.findByAltText(/código qr de tu entrada/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /descargar entrada/i })).toBeInTheDocument();
  });
});
