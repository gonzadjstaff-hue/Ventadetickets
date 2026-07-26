import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { getOrderStatus, type OrderStatusResponse } from "../api/orders";
import CheckoutReturnPage from "./CheckoutReturnPage";

vi.mock("../api/orders", () => ({
  getOrderStatus: vi.fn(),
}));

const mockedGetOrderStatus = vi.mocked(getOrderStatus);

/**
 * Bajo fake timers, `screen.findBy*`/`waitFor` de Testing Library no sirven
 * (dependen de sus propios timers reales para reintentar). El `poll()`
 * inicial del componente se dispara sin timer (síncrono en el efecto, con un
 * `await` a la promesa ya resuelta del mock), así que alcanza con vaciar la
 * cola de microtareas unas vueltas dentro de `act` para que React aplique el
 * `setState` resultante.
 */
async function flushInitialPoll() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderReturnPage(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/checkout/return${search}`]}>
      <Routes>
        <Route path="/checkout/return" element={<CheckoutReturnPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function statusResponse(overrides: Partial<OrderStatusResponse> = {}): OrderStatusResponse {
  return {
    orderPublicId: "order-1",
    status: "PENDING",
    ticketType: "VIP Individual",
    total: 35000,
    currency: "ARS",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    buyerName: "Ada Lovelace",
    attendees: ["Ada Lovelace"],
    paymentStatus: null,
    ...overrides,
  };
}

describe("CheckoutReturnPage", () => {
  beforeEach(() => {
    mockedGetOrderStatus.mockReset();
  });

  it("sin orderPublicId en la URL: muestra un error controlado y no llama al backend", async () => {
    renderReturnPage("");

    expect(await screen.findByText(/no pudimos identificar tu compra/i)).toBeInTheDocument();
    expect(mockedGetOrderStatus).not.toHaveBeenCalled();
  });

  it("muestra 'Verificando pago' mientras el estado sigue PENDING", async () => {
    mockedGetOrderStatus.mockResolvedValue(statusResponse({ status: "PENDING" }));
    renderReturnPage("?orderPublicId=order-1");

    expect(await screen.findByText(/verificando pago/i)).toBeInTheDocument();
  });

  it("ignora otros query params de Mercado Pago (status, payment_id, collection_status) y solo usa orderPublicId", async () => {
    mockedGetOrderStatus.mockResolvedValue(statusResponse({ status: "PAID" }));
    renderReturnPage("?orderPublicId=order-1&status=approved&payment_id=999&collection_status=approved");

    expect(await screen.findByText(/pago confirmado/i)).toBeInTheDocument();
    expect(mockedGetOrderStatus).toHaveBeenCalledWith(expect.any(String), "order-1");
  });

  it("PAID: muestra 'Pago confirmado' y el mensaje de entrega por email, sin QR ni botón de descarga", async () => {
    mockedGetOrderStatus.mockResolvedValue(statusResponse({ status: "PAID" }));
    renderReturnPage("?orderPublicId=order-1");

    expect(await screen.findByText(/pago confirmado/i)).toBeInTheDocument();
    expect(screen.getByText(/enviamos tus entradas por email/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /descargar/i })).not.toBeInTheDocument();
  });

  it("CANCELLED: muestra 'Compra cancelada'", async () => {
    mockedGetOrderStatus.mockResolvedValue(statusResponse({ status: "CANCELLED" }));
    renderReturnPage("?orderPublicId=order-1");

    expect(await screen.findByText(/compra cancelada/i)).toBeInTheDocument();
  });

  it("EXPIRED: muestra 'Reserva vencida'", async () => {
    mockedGetOrderStatus.mockResolvedValue(statusResponse({ status: "EXPIRED" }));
    renderReturnPage("?orderPublicId=order-1");

    expect(await screen.findByText(/reserva vencida/i)).toBeInTheDocument();
  });

  it("error de red: muestra mensaje controlado con botón para reintentar, y reintentar vuelve a consultar", async () => {
    mockedGetOrderStatus.mockRejectedValueOnce(new ApiError(500, "Ocurrió un error inesperado.", "INTERNAL_ERROR"));
    renderReturnPage("?orderPublicId=order-1");

    expect(await screen.findByText(/no pudimos verificar tu pago/i)).toBeInTheDocument();

    mockedGetOrderStatus.mockResolvedValueOnce(statusResponse({ status: "PAID" }));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /volver a intentar/i }));

    expect(await screen.findByText(/pago confirmado/i)).toBeInTheDocument();
  });

  /**
   * Los tests de abajo controlan el intervalo de polling con fake timers.
   * `screen.findBy*`/`waitFor` de Testing Library dependen de sus propios
   * timers reales para reintentar, así que bajo fake timers no hay que
   * usarlos: se fuerza el avance con `vi.advanceTimersByTimeAsync` (que sí
   * vacía microtareas y efectos) y después se lee el DOM con `getBy*`/`queryBy*`
   * directamente, nunca con `findBy*`.
   */
  describe("con control manual del intervalo de polling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("detiene el polling al llegar a PAID: no vuelve a llamar al backend después", async () => {
      mockedGetOrderStatus.mockResolvedValue(statusResponse({ status: "PAID" }));
      renderReturnPage("?orderPublicId=order-1");
      await flushInitialPoll();

      expect(screen.getByText(/pago confirmado/i)).toBeInTheDocument();
      const callsAfterPaid = mockedGetOrderStatus.mock.calls.length;

      await vi.advanceTimersByTimeAsync(15000);
      expect(mockedGetOrderStatus).toHaveBeenCalledTimes(callsAfterPaid);
    });

    it("sigue consultando mientras el estado es PENDING, cada pocos segundos", async () => {
      mockedGetOrderStatus.mockResolvedValue(statusResponse({ status: "PENDING" }));
      renderReturnPage("?orderPublicId=order-1");
      await flushInitialPoll();

      const initialCalls = mockedGetOrderStatus.mock.calls.length;
      await vi.advanceTimersByTimeAsync(9000);
      expect(mockedGetOrderStatus.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    it("cleanup: al desmontar deja de consultar (limpia el interval)", async () => {
      mockedGetOrderStatus.mockResolvedValue(statusResponse({ status: "PENDING" }));
      const { unmount } = renderReturnPage("?orderPublicId=order-1");
      await flushInitialPoll();

      unmount();
      const callsAfterUnmount = mockedGetOrderStatus.mock.calls.length;
      await vi.advanceTimersByTimeAsync(20000);
      expect(mockedGetOrderStatus).toHaveBeenCalledTimes(callsAfterUnmount);
    });

    it("tras el tiempo máximo de polling sin resolver, muestra un estado controlado con opción de reintentar", async () => {
      mockedGetOrderStatus.mockResolvedValue(statusResponse({ status: "PENDING" }));
      renderReturnPage("?orderPublicId=order-1");
      await flushInitialPoll();

      await vi.advanceTimersByTimeAsync(95000);

      expect(screen.getByText(/todavía estamos confirmando tu pago/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /volver a intentar/i })).toBeInTheDocument();
    });
  });
});
