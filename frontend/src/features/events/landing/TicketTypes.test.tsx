import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerGeneralTicket } from "../../../api/registrations";
import { createVipOrder } from "../../../api/orders";
import TicketTypes from "./TicketTypes";

vi.mock("../../../api/registrations", () => ({
  registerGeneralTicket: vi.fn(),
}));

vi.mock("../../../api/orders", () => ({
  createVipOrder: vi.fn(),
  getOrderStatus: vi.fn(),
  simulatePayment: vi.fn(),
}));

const { mockedToDataURL, mockedToPng } = vi.hoisted(() => ({
  mockedToDataURL: vi.fn<(text: string, options?: Record<string, unknown>) => Promise<string>>(),
  mockedToPng: vi.fn<(node: HTMLElement, options?: Record<string, unknown>) => Promise<string>>(),
}));

vi.mock("qrcode", () => ({ toDataURL: mockedToDataURL }));
vi.mock("html-to-image", () => ({ toPng: mockedToPng }));

const mockedRegisterGeneral = vi.mocked(registerGeneralTicket);
const mockedCreateVipOrder = vi.mocked(createVipOrder);

function renderTicketTypes() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <TicketTypes />
    </QueryClientProvider>,
  );
}

describe("TicketTypes: conexión de los botones de compra", () => {
  beforeEach(() => {
    mockedRegisterGeneral.mockReset();
    mockedCreateVipOrder.mockReset();
    mockedToDataURL.mockReset();
    mockedToDataURL.mockResolvedValue("data:image/png;base64,FAKE");
    mockedToPng.mockReset();
  });

  it("'Elegir general' abre el modal de registro General (no VIP)", async () => {
    const user = userEvent.setup();
    renderTicketTypes();

    await user.click(screen.getByRole("button", { name: /elegir general/i }));

    expect(await screen.findByRole("heading", { name: /^entrada general$/i })).toBeInTheDocument();
    expect(screen.queryByText(/paso 1 de 3/i)).not.toBeInTheDocument();
  });

  it("'Elegir VIP' abre el checkout de VIP Individual", async () => {
    const user = userEvent.setup();
    renderTicketTypes();

    await user.click(screen.getByRole("button", { name: /^elegir vip$/i }));

    // level: 2 para apuntar al título del modal (h2), no a la card de la landing (h3), que también dice "VIP Individual".
    expect(await screen.findByRole("heading", { name: /vip individual/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/paso 1 de 3/i)).toBeInTheDocument();
  });

  it("'Elegir VIP doble' abre el checkout de VIP Doble con dos campos de asistente", async () => {
    const user = userEvent.setup();
    renderTicketTypes();

    await user.click(screen.getByRole("button", { name: /elegir vip doble/i }));

    expect(await screen.findByRole("heading", { name: /vip doble/i, level: 2 })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^nombre$/i), "Ada Lovelace");
    await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
    await user.type(screen.getByLabelText(/whatsapp/i), "+5491122334455");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(await screen.findByLabelText(/primer asistente/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/segundo asistente/i)).toBeInTheDocument();
  });
});
