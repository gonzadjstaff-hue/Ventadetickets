import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVipOrder, type CreateVipOrderResponse } from "../../../api/orders";
import VipCheckoutModal from "./VipCheckoutModal";

vi.mock("../../../api/orders", () => ({
  createVipOrder: vi.fn(),
  getOrderStatus: vi.fn(),
  simulatePayment: vi.fn(),
}));

vi.mock("qrcode", () => ({ toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR_FAKE") }));
vi.mock("html-to-image", () => ({ toPng: vi.fn().mockResolvedValue("data:image/png;base64,TICKET_FAKE") }));

const mockedCreateVipOrder = vi.mocked(createVipOrder);

function renderModal() {
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
      />
    </QueryClientProvider>,
  );
  return { onClose };
}

function orderExpiringInMinutes(minutes: number): CreateVipOrderResponse {
  return {
    orderPublicId: "order-countdown-1",
    eventPublicId: "event-1",
    ticketType: "VIP Individual",
    total: 35000,
    currency: "ARS",
    expiresAt: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    buyer: { name: "Ada Lovelace", email: "ada@example.com", whatsapp: "+5491122334455" },
    attendees: ["Ada Lovelace"],
    status: "PENDING",
    paymentSimulationAvailable: true,
  };
}

async function reachPendingOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^nombre$/i), "Ada Lovelace");
  await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
  await user.type(screen.getByLabelText(/whatsapp/i), "+5491122334455");
  await user.click(screen.getByRole("button", { name: /siguiente/i }));
  await user.type(screen.getByLabelText(/nombre del asistente/i), "Ada Lovelace");
  await user.click(screen.getByRole("button", { name: /siguiente/i }));
  await user.click(screen.getByRole("button", { name: /confirmar reserva/i }));
  await screen.findByText(/reserva activa/i);
}

describe("VipCheckoutModal — contador de reserva (timers falsos)", () => {
  beforeEach(() => {
    mockedCreateVipOrder.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("baja con el paso del tiempo usando expiresAt del backend, sin agregar minutos localmente", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    mockedCreateVipOrder.mockResolvedValue(orderExpiringInMinutes(5));

    renderModal();
    await reachPendingOrder(user);

    expect(screen.getByText(/quedan ~5 min de reserva/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 15000);

    expect(screen.getByText(/quedan ~3 min de reserva/i)).toBeInTheDocument();
  });

  it("al llegar a cero muestra que la reserva venció, nunca un valor negativo, y oculta el simulador de pago", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    mockedCreateVipOrder.mockResolvedValue(orderExpiringInMinutes(1));

    renderModal();
    await reachPendingOrder(user);
    expect(screen.getByRole("button", { name: /aprobar pago/i })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);

    expect(screen.getByText(/la reserva venció/i)).toBeInTheDocument();
    expect(screen.queryByText(/-\d+ min/)).not.toBeInTheDocument();
    // Ya no se ofrece aprobar visualmente una reserva vencida.
    expect(screen.queryByRole("button", { name: /aprobar pago/i })).not.toBeInTheDocument();
  });

  it("orden ya vencida al abrir (expiresAt en el pasado): refleja la reserva vencida sin esperar ningún tick", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    mockedCreateVipOrder.mockResolvedValue(orderExpiringInMinutes(-5));

    renderModal();
    await reachPendingOrder(user);

    expect(screen.getByText(/la reserva venció/i)).toBeInTheDocument();
  });

  it("limpia el interval al desmontar: no queda actualizando estado ni logueando warnings después de unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    mockedCreateVipOrder.mockResolvedValue(orderExpiringInMinutes(5));

    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <VipCheckoutModal open onClose={vi.fn()} ticketTypeId="x" ticketTypeName="VIP Individual" ticketsPerUnit={1} priceLabel="$35.000" />
      </QueryClientProvider>,
    );
    await reachPendingOrder(user);

    const clearCallsBeforeUnmount = clearIntervalSpy.mock.calls.length;
    unmount();
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearCallsBeforeUnmount);

    // Si el interval hubiera seguido corriendo tras el unmount, este avance
    // dispararía un intento de actualizar estado de un componente ya
    // desmontado (warning de React) o un error no controlado.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("al pasar a APPROVED detiene el contador (no queda ningún interval corriendo)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    mockedCreateVipOrder.mockResolvedValue(orderExpiringInMinutes(5));

    renderModal();
    await reachPendingOrder(user);

    const { simulatePayment } = await import("../../../api/orders");
    vi.mocked(simulatePayment).mockResolvedValue({
      orderStatus: "PAID",
      paymentStatus: "APPROVED",
      alreadyProcessed: false,
      tickets: [{ ticketPublicId: "t1", holderName: "Ada Lovelace", ticketType: "VIP Individual", token: "token-1", emailStatus: "sent" }],
    });

    const clearCallsBefore = clearIntervalSpy.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /aprobar pago/i }));
    await screen.findByText(/compra confirmada/i);

    // El efecto del contador se vuelve a ejecutar porque liveStatus cambió:
    // limpia el interval de PENDING y, al no volver a cumplir la condición
    // (liveStatus ya no es PENDING), no crea uno nuevo.
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearCallsBefore);

    // Avanzar mucho tiempo no debe volver a tocar el estado de la orden ni tirar errores.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(screen.getByText(/compra confirmada/i)).toBeInTheDocument();
  });
});
