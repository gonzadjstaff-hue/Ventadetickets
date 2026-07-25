import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVipOrder, simulatePayment, type CreateVipOrderResponse, type SimulatePaymentResponse } from "../../../api/orders";
import VipCheckoutModal from "./VipCheckoutModal";

vi.mock("../../../api/orders", () => ({
  createVipOrder: vi.fn(),
  getOrderStatus: vi.fn(),
  simulatePayment: vi.fn(),
}));

const { mockedToDataURL, mockedToPng, mockAddImage, mockAddPage, mockOutput } = vi.hoisted(() => ({
  mockedToDataURL: vi.fn<(text: string, options?: Record<string, unknown>) => Promise<string>>(),
  mockedToPng: vi.fn<(node: HTMLElement, options?: Record<string, unknown>) => Promise<string>>(),
  mockAddImage: vi.fn(),
  mockAddPage: vi.fn(),
  mockOutput: vi.fn(),
}));

vi.mock("qrcode", () => ({ toDataURL: mockedToDataURL }));
vi.mock("html-to-image", () => ({ toPng: mockedToPng }));
vi.mock("jspdf", () => ({
  jsPDF: class MockJsPDF {
    addImage = mockAddImage;
    addPage = mockAddPage;
    output = mockOutput;
  },
}));

const mockedCreateVipOrder = vi.mocked(createVipOrder);
const mockedSimulatePayment = vi.mocked(simulatePayment);

function renderModal(overrides: Partial<Parameters<typeof VipCheckoutModal>[0]> = {}) {
  const onClose = vi.fn();
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <VipCheckoutModal
        open
        onClose={onClose}
        ticketTypeId="vip-doble-id"
        ticketTypeName="VIP Doble"
        ticketsPerUnit={2}
        priceLabel="$60.000"
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

const dobleOrder: CreateVipOrderResponse = {
  orderPublicId: "order-vip-doble-1",
  eventPublicId: "event-1",
  ticketType: "VIP Doble",
  total: 60000,
  currency: "ARS",
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  buyer: { name: "Ada Lovelace", email: "ada@example.com", whatsapp: "+5491122334455" },
  attendees: ["Ada", "Grace"],
  status: "PENDING",
  paymentSimulationAvailable: true,
};

const dobleApproved: SimulatePaymentResponse = {
  orderStatus: "PAID",
  paymentStatus: "APPROVED",
  alreadyProcessed: false,
  tickets: [
    { ticketPublicId: "t1", holderName: "Ada", ticketType: "VIP Doble", token: "token-ada", emailStatus: "sent" },
    { ticketPublicId: "t2", holderName: "Grace", ticketType: "VIP Doble", token: "token-grace", emailStatus: "sent" },
  ],
};

async function approveVipDoble(user: ReturnType<typeof userEvent.setup>) {
  vi.stubEnv("DEV", true);
  mockedCreateVipOrder.mockResolvedValue(dobleOrder);
  await fillBuyerStep(user);
  await fillAttendeesStep(user, ["Ada", "Grace"]);
  await user.click(screen.getByRole("button", { name: /confirmar reserva/i }));
  await screen.findByText(/reserva activa/i);

  mockedSimulatePayment.mockResolvedValue(dobleApproved);
  await user.click(screen.getByRole("button", { name: /aprobar pago/i }));
  await screen.findByText(/compra confirmada/i);
}

async function approveVipIndividual(user: ReturnType<typeof userEvent.setup>, renderOverrides = {}) {
  vi.stubEnv("DEV", true);
  const individualOrder: CreateVipOrderResponse = { ...dobleOrder, ticketType: "VIP Individual", attendees: ["Ada Lovelace"] };
  renderModal({ ticketTypeName: "VIP Individual", ticketsPerUnit: 1, priceLabel: "$35.000", ...renderOverrides });
  mockedCreateVipOrder.mockResolvedValue(individualOrder);
  await fillBuyerStep(user);
  await fillAttendeesStep(user, ["Ada Lovelace"]);
  await user.click(screen.getByRole("button", { name: /confirmar reserva/i }));
  await screen.findByText(/reserva activa/i);

  mockedSimulatePayment.mockResolvedValue({
    orderStatus: "PAID",
    paymentStatus: "APPROVED",
    alreadyProcessed: false,
    tickets: [{ ticketPublicId: "t1", holderName: "Ada Lovelace", ticketType: "VIP Individual", token: "token-1", emailStatus: "sent" }],
  } satisfies SimulatePaymentResponse);
  await user.click(screen.getByRole("button", { name: /aprobar pago/i }));
  await screen.findByText(/compra confirmada/i);
}

function resetSharedMocks() {
  mockedCreateVipOrder.mockReset();
  mockedSimulatePayment.mockReset();
  mockedToDataURL.mockReset();
  mockedToDataURL.mockResolvedValue("data:image/png;base64,QR_FAKE");
  mockedToPng.mockReset();
  mockedToPng.mockResolvedValue("data:image/png;base64,TICKET_FAKE");
  mockAddImage.mockReset();
  mockAddPage.mockReset();
  mockOutput.mockReset();
  mockOutput.mockReturnValue(new Blob(["pdf-fake"], { type: "application/pdf" }));
}

describe("VipCheckoutModal — descarga individual en PDF (VIP Individual)", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetSharedMocks();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clickSpy.mockRestore();
  });

  it("muestra 'Descargar entrada' y nunca 'Descargar ambas entradas'; genera un PDF de una sola página con el nombre correcto", async () => {
    const user = userEvent.setup();
    await approveVipIndividual(user);

    expect(screen.getByRole("button", { name: /^descargar entrada$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /descargar ambas entradas/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^descargar entrada$/i }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));

    expect(mockAddPage).not.toHaveBeenCalled();
    expect(mockAddImage).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("pulse-event-vip-individual-t1.pdf");
  });

  it("no queda ningún código de ZIP: no se arma ningún archivo .zip", async () => {
    const user = userEvent.setup();
    await approveVipIndividual(user);

    await user.click(screen.getByRole("button", { name: /^descargar entrada$/i }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));

    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).not.toContain(".zip");
  });

  it("sin soporte de Web Share API: no muestra 'Compartir entrada', pero la descarga sigue disponible", async () => {
    const user = userEvent.setup();
    const originalShare = (navigator as unknown as { share?: unknown }).share;
    delete (navigator as unknown as { share?: unknown }).share;

    await approveVipIndividual(user);

    expect(screen.queryByRole("button", { name: /^compartir entrada$/i })).not.toBeInTheDocument();
    const downloadButton = screen.getByRole("button", { name: /^descargar entrada$/i });
    expect(downloadButton).toBeEnabled();

    if (originalShare) (navigator as unknown as { share: unknown }).share = originalShare;
  });
});

describe("VipCheckoutModal — descarga conjunta en PDF (VIP Doble)", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetSharedMocks();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clickSpy.mockRestore();
  });

  it("muestra las dos entradas visibles, ningún botón individual, y exactamente un botón 'Descargar ambas entradas'", async () => {
    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Grace")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /descargar ambas entradas/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^descargar entrada$/i })).not.toBeInTheDocument();
  });

  it("genera un único PDF de exactamente 2 páginas, una por asistente, con el nombre correcto", async () => {
    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    await user.click(screen.getByRole("button", { name: /descargar ambas entradas/i }));

    await waitFor(() => expect(mockOutput).toHaveBeenCalledTimes(1));
    expect(mockedToPng).toHaveBeenCalledTimes(2);
    expect(mockAddPage).toHaveBeenCalledTimes(1); // 2 páginas = 1 addPage (la primera ya viene con el doc)
    expect(mockAddImage).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("pulse-event-vip-doble-order-vip-doble-1.pdf");
  });

  it("las dos páginas tienen dos ticketPublicId y dos QR distintos, sin mezclarlos", async () => {
    mockedToPng.mockReset();
    mockedToPng
      .mockResolvedValueOnce("data:image/png;base64,PAGE_ADA")
      .mockResolvedValueOnce("data:image/png;base64,PAGE_GRACE");

    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    await user.click(screen.getByRole("button", { name: /descargar ambas entradas/i }));
    await waitFor(() => expect(mockAddImage).toHaveBeenCalledTimes(2));

    const [firstCall, secondCall] = mockAddImage.mock.calls as Array<[string, ...unknown[]]>;
    expect(firstCall[0]).toBe("data:image/png;base64,PAGE_ADA");
    expect(secondCall[0]).toBe("data:image/png;base64,PAGE_GRACE");
  });

  it("muestra 'Preparando ambas entradas…', aria-busy y deshabilita el botón mientras genera", async () => {
    const resolvers: Array<(value: string) => void> = [];
    mockedToPng.mockReset();
    mockedToPng.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    const button = screen.getByRole("button", { name: /descargar ambas entradas/i });
    await user.click(button);

    await waitFor(() => expect(screen.getByRole("button", { name: /preparando ambas entradas/i })).toBeDisabled());
    expect(screen.getByRole("button", { name: /preparando ambas entradas/i })).toHaveAttribute("aria-busy", "true");

    await waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers.forEach((resolve) => resolve("data:image/png;base64,TICKET_FAKE"));
    await waitFor(() => expect(screen.getByRole("button", { name: /descargar ambas entradas/i })).not.toBeDisabled());
  });

  it("no genera una segunda descarga por doble clic mientras la primera está en curso", async () => {
    const resolvers: Array<(value: string) => void> = [];
    mockedToPng.mockReset();
    mockedToPng.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    const button = screen.getByRole("button", { name: /descargar ambas entradas/i });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    button.click();

    await waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers.forEach((resolve) => resolve("data:image/png;base64,TICKET_FAKE"));
    await waitFor(() => expect(mockOutput).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("si falla la primera entrada no descarga el PDF, mantiene los tickets visibles y permite reintentar", async () => {
    mockedToPng.mockReset();
    mockedToPng.mockRejectedValueOnce(new Error("boom")).mockResolvedValue("data:image/png;base64,TICKET_FAKE");

    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    await user.click(screen.getByRole("button", { name: /descargar ambas entradas/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos preparar tu entrada/i);
    expect(mockOutput).not.toHaveBeenCalled();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Grace")).toBeInTheDocument();
    expect(await screen.findAllByAltText(/código qr de tu entrada/i)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /descargar ambas entradas/i }));
    await waitFor(() => expect(mockOutput).toHaveBeenCalledTimes(1));
  });

  it("si falla la segunda entrada no descarga el PDF", async () => {
    let calls = 0;
    mockedToPng.mockReset();
    mockedToPng.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) throw new Error("boom");
      return "data:image/png;base64,TICKET_FAKE";
    });

    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    await user.click(screen.getByRole("button", { name: /descargar ambas entradas/i }));

    expect(await screen.findByText(/no pudimos preparar tu entrada/i)).toBeInTheDocument();
    expect(mockOutput).not.toHaveBeenCalled();
  });
});

describe("VipCheckoutModal — compartir en PDF (Web Share API)", () => {
  beforeEach(() => {
    resetSharedMocks();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("VIP Doble: con soporte de Web Share, muestra 'Compartir ambas entradas' y comparte un único File PDF", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, share, canShare });

    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    const shareButton = await screen.findByRole("button", { name: /compartir ambas entradas/i });
    await user.click(shareButton);

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const [args] = share.mock.calls[0] as [{ files: File[]; title: string; url?: string }];
    expect(args.files).toHaveLength(1);
    expect(args.files[0].type).toBe("application/pdf");
    expect(args.files[0].name).toBe("pulse-event-vip-doble-order-vip-doble-1.pdf");
    expect(args.url).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("si el usuario cancela el selector nativo, no se muestra como error", async () => {
    const abortError = new DOMException("cancelled", "AbortError");
    const share = vi.fn().mockRejectedValue(abortError);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, share, canShare });

    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    const shareButton = await screen.findByRole("button", { name: /compartir ambas entradas/i });
    await user.click(shareButton);

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("si compartir falla de verdad, muestra un error y la descarga sigue disponible", async () => {
    const share = vi.fn().mockRejectedValue(new Error("share roto"));
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, share, canShare });

    const user = userEvent.setup();
    renderModal();
    await approveVipDoble(user);

    const shareButton = await screen.findByRole("button", { name: /compartir ambas entradas/i });
    await user.click(shareButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos compartir/i);
    expect(screen.getByRole("button", { name: /descargar ambas entradas/i })).toBeEnabled();

    vi.unstubAllGlobals();
  });
});

describe("VipCheckoutModal — confirmación antes de cerrar sin descargar", () => {
  beforeEach(() => {
    resetSharedMocks();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("VIP Doble: pide confirmación al cerrar si todavía no se descargó ni compartió, y no cierra hasta confirmar", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await approveVipDoble(user);

    await user.click(screen.getByRole("button", { name: /^cerrar$/i }));

    expect(await screen.findByText(/todavía no descargaste tus entradas/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /volver a las entradas/i }));
    expect(screen.getByRole("button", { name: /descargar ambas entradas/i })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("VIP Doble: 'Cerrar de todas formas' cierra igual sin haber descargado", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await approveVipDoble(user);

    await user.click(screen.getByRole("button", { name: /^cerrar$/i }));
    await user.click(screen.getByRole("button", { name: /cerrar de todas formas/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("VIP Doble: no pide confirmación si ya se descargó el PDF", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await approveVipDoble(user);

    await user.click(screen.getByRole("button", { name: /descargar ambas entradas/i }));
    await waitFor(() => expect(mockOutput).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /^cerrar$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/todavía no descargaste/i)).not.toBeInTheDocument();
  });

  it("VIP Individual: no pide confirmación si ya se descargó la entrada", async () => {
    const user = userEvent.setup();
    const { onClose } = await (async () => {
      const utils = renderModal({ ticketTypeName: "VIP Individual", ticketsPerUnit: 1, priceLabel: "$35.000" });
      const individualOrder: CreateVipOrderResponse = { ...dobleOrder, ticketType: "VIP Individual", attendees: ["Ada Lovelace"] };
      mockedCreateVipOrder.mockResolvedValue(individualOrder);
      await fillBuyerStep(user);
      await fillAttendeesStep(user, ["Ada Lovelace"]);
      await user.click(screen.getByRole("button", { name: /confirmar reserva/i }));
      await screen.findByText(/reserva activa/i);
      vi.stubEnv("DEV", true);
      mockedSimulatePayment.mockResolvedValue({
        orderStatus: "PAID",
        paymentStatus: "APPROVED",
        alreadyProcessed: false,
        tickets: [{ ticketPublicId: "t1", holderName: "Ada Lovelace", ticketType: "VIP Individual", token: "token-1", emailStatus: "sent" }],
      } satisfies SimulatePaymentResponse);
      await user.click(screen.getByRole("button", { name: /aprobar pago/i }));
      await screen.findByText(/compra confirmada/i);
      return utils;
    })();

    await user.click(screen.getByRole("button", { name: /^descargar entrada$/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^descargar entrada$/i })).not.toBeDisabled());

    await user.click(screen.getByRole("button", { name: /^cerrar$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no pide confirmación al cerrar en estados sin tickets (PENDING)", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    mockedCreateVipOrder.mockResolvedValue(dobleOrder);
    await fillBuyerStep(user);
    await fillAttendeesStep(user, ["Ada", "Grace"]);
    await user.click(screen.getByRole("button", { name: /confirmar reserva/i }));
    await screen.findByText(/reserva activa/i);

    await user.click(screen.getByRole("button", { name: /cerrar modal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
