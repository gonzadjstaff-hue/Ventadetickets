import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../api/client";
import {
  createVipOrder,
  getOrderStatus,
  simulatePayment,
  type CreateVipOrderResponse,
  type OrderStatusResponse,
  type SimulatePaymentResponse,
} from "../../../api/orders";
import VipCheckoutModal from "./VipCheckoutModal";

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

const mockedCreateVipOrder = vi.mocked(createVipOrder);
const mockedGetOrderStatus = vi.mocked(getOrderStatus);
const mockedSimulatePayment = vi.mocked(simulatePayment);

function renderModal(overrides: Partial<Parameters<typeof VipCheckoutModal>[0]> = {}) {
  const onClose = vi.fn();
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <VipCheckoutModal
        open
        onClose={onClose}
        ticketTypeId="vip-individual-id"
        ticketTypeName="VIP Individual"
        ticketsPerUnit={1}
        priceLabel="$35.000"
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onClose };
}

async function fillBuyerStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^nombre$/i), "Ada Lovelace");
  await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
  await user.type(screen.getByLabelText(/whatsapp/i), "+5491122334455");
  await user.click(screen.getByRole("button", { name: /siguiente/i }));
}

async function fillAttendeesStep(user: ReturnType<typeof userEvent.setup>, names: string[]) {
  for (let i = 0; i < names.length; i++) {
    const inputs = screen.getAllByLabelText(/asistente/i);
    await user.type(inputs[i], names[i]);
  }
  await user.click(screen.getByRole("button", { name: /siguiente/i }));
}

const pendingOrder: CreateVipOrderResponse = {
  orderPublicId: "order-vip-1",
  eventPublicId: "event-1",
  ticketType: "VIP Individual",
  total: 35000,
  currency: "ARS",
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  buyer: { name: "Ada Lovelace", email: "ada@example.com", whatsapp: "+5491122334455" },
  attendees: ["Ada Lovelace"],
  status: "PENDING",
  paymentSimulationAvailable: true,
};

describe("VipCheckoutModal", () => {
  beforeEach(() => {
    mockedCreateVipOrder.mockReset();
    mockedGetOrderStatus.mockReset();
    mockedSimulatePayment.mockReset();
    mockedToDataURL.mockReset();
    mockedToDataURL.mockResolvedValue("data:image/png;base64,FAKE");
    mockedToPng.mockReset();
    mockedToPng.mockResolvedValue("data:image/png;base64,TICKET_FAKE");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no renderiza nada si open es false", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <VipCheckoutModal open={false} onClose={vi.fn()} ticketTypeId="x" ticketTypeName="VIP Individual" ticketsPerUnit={1} priceLabel="$35.000" />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bloquea el scroll del fondo mientras está abierto y lo restaura al cerrarse", () => {
    document.body.style.overflow = "";
    const queryClient = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <VipCheckoutModal open onClose={vi.fn()} ticketTypeId="x" ticketTypeName="VIP Individual" ticketsPerUnit={1} priceLabel="$35.000" />
      </QueryClientProvider>,
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <QueryClientProvider client={queryClient}>
        <VipCheckoutModal open={false} onClose={vi.fn()} ticketTypeId="x" ticketTypeName="VIP Individual" ticketsPerUnit={1} priceLabel="$35.000" />
      </QueryClientProvider>,
    );

    expect(document.body.style.overflow).toBe("");
  });

  it("VIP Individual pide exactamente un campo de asistente", async () => {
    renderModal({ ticketsPerUnit: 1 });
    const user = userEvent.setup();
    await fillBuyerStep(user);

    expect(screen.getAllByLabelText(/asistente/i)).toHaveLength(1);
  });

  it("VIP Doble pide exactamente dos campos de asistente, claramente diferenciados", async () => {
    renderModal({ ticketTypeName: "VIP Doble", ticketsPerUnit: 2, priceLabel: "$60.000" });
    const user = userEvent.setup();
    await fillBuyerStep(user);

    expect(screen.getByLabelText(/primer asistente/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/segundo asistente/i)).toBeInTheDocument();
  });

  it("valida los datos del comprador antes de avanzar", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(await screen.findByText(/el nombre es obligatorio/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/asistente/i)).not.toBeInTheDocument();
  });

  it("valida el nombre del asistente antes de avanzar al resumen", async () => {
    renderModal();
    const user = userEvent.setup();
    await fillBuyerStep(user);

    await user.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(await screen.findByText(/falta el nombre del asistente/i)).toBeInTheDocument();
  });

  it("muestra el resumen correcto (tipo, accesos y total) antes de confirmar", async () => {
    renderModal({ ticketTypeName: "VIP Doble", ticketsPerUnit: 2, priceLabel: "$60.000" });
    const user = userEvent.setup();
    await fillBuyerStep(user);
    await fillAttendeesStep(user, ["Ada", "Grace"]);

    expect(await screen.findByText(/paso 3 de 3/i)).toBeInTheDocument();
    expect(screen.getAllByText("VIP Doble")).toHaveLength(2); // título del paso + fila del resumen
    expect(screen.getByText("$60.000")).toBeInTheDocument();
  });

  it("crea la orden y pasa a estado PENDING con los datos devueltos", async () => {
    mockedCreateVipOrder.mockResolvedValue(pendingOrder);
    renderModal();
    const user = userEvent.setup();
    await fillBuyerStep(user);
    await fillAttendeesStep(user, ["Ada Lovelace"]);
    await user.click(screen.getByRole("button", { name: /confirmar reserva/i }));

    expect(await screen.findByText(/reserva activa/i)).toBeInTheDocument();
    expect(mockedCreateVipOrder).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ ticketTypeId: "vip-individual-id", attendees: [{ name: "Ada Lovelace" }] }),
    );
  });

  it("muestra el error de capacidad agotada de forma controlada", async () => {
    mockedCreateVipOrder.mockRejectedValue(new ApiError(409, "Ya no quedan unidades disponibles de este tipo de entrada.", "SOLD_OUT"));
    renderModal();
    const user = userEvent.setup();
    await fillBuyerStep(user);
    await fillAttendeesStep(user, ["Ada Lovelace"]);
    await user.click(screen.getByRole("button", { name: /confirmar reserva/i }));

    expect(await screen.findByText(/ya no quedan unidades disponibles/i)).toBeInTheDocument();
  });

  async function createPendingOrderInUi(user: ReturnType<typeof userEvent.setup>, attendees: string[] = ["Ada Lovelace"]) {
    mockedCreateVipOrder.mockResolvedValue(pendingOrder);
    await fillBuyerStep(user);
    await fillAttendeesStep(user, attendees);
    await user.click(screen.getByRole("button", { name: /confirmar reserva/i }));
    await screen.findByText(/reserva activa/i);
  }

  it("muestra los controles de simulación solo en desarrollo y si el backend los habilita", async () => {
    vi.stubEnv("DEV", true);
    const user = userEvent.setup();
    renderModal();
    await createPendingOrderInUi(user);

    expect(await screen.findByRole("button", { name: /aprobar pago/i })).toBeInTheDocument();
  });

  it("no muestra los controles de simulación fuera de desarrollo", async () => {
    vi.stubEnv("DEV", false);
    const user = userEvent.setup();
    renderModal();
    await createPendingOrderInUi(user);

    expect(screen.queryByRole("button", { name: /aprobar pago/i })).not.toBeInTheDocument();
  });

  it("APPROVED en VIP Individual muestra exactamente 1 entrada", async () => {
    vi.stubEnv("DEV", true);
    const user = userEvent.setup();
    renderModal();
    await createPendingOrderInUi(user);

    mockedSimulatePayment.mockResolvedValue({
      orderStatus: "PAID",
      paymentStatus: "APPROVED",
      alreadyProcessed: false,
      tickets: [
        { ticketPublicId: "t1", holderName: "Ada Lovelace", ticketType: "VIP Individual", token: "token-1", emailStatus: "sent" },
      ],
    } satisfies SimulatePaymentResponse);

    await user.click(screen.getByRole("button", { name: /aprobar pago/i }));

    expect(await screen.findByText(/compra confirmada/i)).toBeInTheDocument();
    const qrImages = await screen.findAllByAltText(/código qr de tu entrada/i);
    expect(qrImages).toHaveLength(1);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("APPROVED en VIP Doble muestra 2 entradas con asistentes distintos, cada una con su propio QR", async () => {
    vi.stubEnv("DEV", true);
    const user = userEvent.setup();
    renderModal({ ticketTypeName: "VIP Doble", ticketsPerUnit: 2, priceLabel: "$60.000" });
    mockedCreateVipOrder.mockResolvedValue({ ...pendingOrder, ticketType: "VIP Doble", attendees: ["Ada", "Grace"] });
    await fillBuyerStep(user);
    await fillAttendeesStep(user, ["Ada", "Grace"]);
    await user.click(screen.getByRole("button", { name: /confirmar reserva/i }));
    await screen.findByText(/reserva activa/i);

    mockedSimulatePayment.mockResolvedValue({
      orderStatus: "PAID",
      paymentStatus: "APPROVED",
      alreadyProcessed: false,
      tickets: [
        { ticketPublicId: "t1", holderName: "Ada", ticketType: "VIP Doble", token: "token-ada", emailStatus: "sent" },
        { ticketPublicId: "t2", holderName: "Grace", ticketType: "VIP Doble", token: "token-grace", emailStatus: "sent" },
      ],
    } satisfies SimulatePaymentResponse);

    await user.click(screen.getByRole("button", { name: /aprobar pago/i }));

    expect(await screen.findByText(/compra confirmada/i)).toBeInTheDocument();
    const qrImages = await screen.findAllByAltText(/código qr de tu entrada/i);
    expect(qrImages).toHaveLength(2);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Grace")).toBeInTheDocument();
    expect(mockedToDataURL).toHaveBeenCalledWith("pulse-ticket:v1:token-ada", expect.anything());
    expect(mockedToDataURL).toHaveBeenCalledWith("pulse-ticket:v1:token-grace", expect.anything());
  });

  it("permite descargar la entrada luego de la aprobación", async () => {
    vi.stubEnv("DEV", true);
    const user = userEvent.setup();
    renderModal();
    await createPendingOrderInUi(user);

    mockedSimulatePayment.mockResolvedValue({
      orderStatus: "PAID",
      paymentStatus: "APPROVED",
      alreadyProcessed: false,
      tickets: [{ ticketPublicId: "t1", holderName: "Ada Lovelace", ticketType: "VIP Individual", token: "token-1", emailStatus: "sent" }],
    } satisfies SimulatePaymentResponse);
    await user.click(screen.getByRole("button", { name: /aprobar pago/i }));
    await screen.findByText(/compra confirmada/i);

    expect(await screen.findByRole("button", { name: /descargar entrada/i })).toBeInTheDocument();
  });

  it("REJECTED muestra el aviso y permite reintentar mientras la reserva siga vigente", async () => {
    vi.stubEnv("DEV", true);
    const user = userEvent.setup();
    renderModal();
    await createPendingOrderInUi(user);

    mockedSimulatePayment.mockResolvedValue({
      orderStatus: "PENDING",
      paymentStatus: "REJECTED",
      alreadyProcessed: false,
    } satisfies SimulatePaymentResponse);

    await user.click(screen.getByRole("button", { name: /rechazar/i }));

    expect(await screen.findByText(/el pago fue rechazado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /aprobar pago/i })).toBeInTheDocument();
  });

  it("CANCELLED muestra compra cancelada y no permite reintentar sobre la misma orden", async () => {
    vi.stubEnv("DEV", true);
    const user = userEvent.setup();
    renderModal();
    await createPendingOrderInUi(user);

    mockedSimulatePayment.mockResolvedValue({
      orderStatus: "CANCELLED",
      paymentStatus: "CANCELLED",
      alreadyProcessed: false,
    } satisfies SimulatePaymentResponse);

    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(await screen.findByText(/compra cancelada/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aprobar pago/i })).not.toBeInTheDocument();
  });

  it("EXPIRED muestra reserva vencida y permite iniciar una compra nueva", async () => {
    vi.stubEnv("DEV", true);
    const user = userEvent.setup();
    renderModal();
    await createPendingOrderInUi(user);

    mockedGetOrderStatus.mockResolvedValue({
      orderPublicId: pendingOrder.orderPublicId,
      status: "EXPIRED",
      ticketType: "VIP Individual",
      total: 35000,
      currency: "ARS",
      expiresAt: pendingOrder.expiresAt,
      buyerName: "Ada Lovelace",
      attendees: ["Ada Lovelace"],
      paymentStatus: null,
    } satisfies OrderStatusResponse);

    await user.click(screen.getByRole("button", { name: /actualizar estado/i }));

    expect(await screen.findByText(/reserva vencida/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /iniciar nueva compra/i }));
    expect(await screen.findByLabelText(/^nombre$/i)).toBeInTheDocument();
  });

  it("no persiste nada en localStorage ni sessionStorage durante todo el flujo", async () => {
    vi.stubEnv("DEV", true);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    renderModal();
    await createPendingOrderInUi(user);

    mockedSimulatePayment.mockResolvedValue({
      orderStatus: "PAID",
      paymentStatus: "APPROVED",
      alreadyProcessed: false,
      tickets: [{ ticketPublicId: "t1", holderName: "Ada Lovelace", ticketType: "VIP Individual", token: "token-1", emailStatus: "sent" }],
    } satisfies SimulatePaymentResponse);
    await user.click(screen.getByRole("button", { name: /aprobar pago/i }));
    await screen.findByText(/compra confirmada/i);

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it("evita doble submit mientras la creación de la orden está en curso", async () => {
    let resolvePromise: (value: CreateVipOrderResponse) => void = () => {};
    mockedCreateVipOrder.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve; }));
    const user = userEvent.setup();
    renderModal();
    await fillBuyerStep(user);
    await fillAttendeesStep(user, ["Ada Lovelace"]);

    const confirmButton = screen.getByRole("button", { name: /confirmar reserva/i });
    await user.click(confirmButton);

    await waitFor(() => expect(screen.getByRole("button", { name: /reservando/i })).toBeDisabled());
    expect(mockedCreateVipOrder).toHaveBeenCalledTimes(1);

    resolvePromise(pendingOrder);
    await screen.findByText(/reserva activa/i);
  });
});
