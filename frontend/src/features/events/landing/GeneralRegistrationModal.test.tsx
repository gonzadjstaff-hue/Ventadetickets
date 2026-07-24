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
};

describe("GeneralRegistrationModal", () => {
  beforeEach(() => {
    mockedRegister.mockReset();
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
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
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
});
