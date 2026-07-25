import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";

import {
  createVipOrder,
  getOrderStatus,
  simulatePayment,
  type CreateVipOrderResponse,
  type OrderStatus,
  type PaymentStatus,
  type SimulatedPaymentResult,
  type SimulatedTicket,
} from "../../../api/orders";
import { ApiError } from "../../../api/client";
import { demoEvent } from "../../../config/demoEvent";
import EventTicket, { type EventTicketHandle } from "../landing/EventTicket";
import TicketDeliveryButtons from "../ticketExport/TicketDeliveryButtons";
import { supportsFileShare } from "../ticketExport/share";
import { sanitizeFileNameId } from "../ticketExport/ticketPdf";
import { useTicketPdfDelivery } from "../ticketExport/useTicketPdfDelivery";
import SimulatePaymentControls from "./SimulatePaymentControls";
import { buildVipCheckoutSchema, type VipCheckoutFormValues } from "./vipCheckoutSchema";

type Step = "buyer" | "attendees" | "summary";

interface VipCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  ticketTypeId: string;
  ticketTypeName: string;
  ticketsPerUnit: 1 | 2;
  priceLabel: string;
}

const ATTENDEE_LABELS = ["Primer asistente", "Segundo asistente"];
const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ADE80]";

/** Mensaje uniforme para las 3 mutaciones del checkout: un error controlado del backend (`ApiError`) se muestra tal cual; cualquier otra falla (red caída, timeout) usa un mensaje genérico sin detalle técnico. */
function getErrorMessage(isError: boolean, error: unknown): string | null {
  if (!isError) return null;
  if (error instanceof ApiError) return error.message;
  return "No pudimos conectar con el servidor. Probá de nuevo en un momento.";
}

export default function VipCheckoutModal({
  open,
  onClose,
  ticketTypeId,
  ticketTypeName,
  ticketsPerUnit,
  priceLabel,
}: VipCheckoutModalProps) {
  const [step, setStep] = useState<Step>("buyer");
  const [order, setOrder] = useState<CreateVipOrderResponse | null>(null);
  const [liveStatus, setLiveStatus] = useState<OrderStatus>("PENDING");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  // Se setea una sola vez, con la primera respuesta de aprobación: el token
  // crudo no se puede volver a pedir después (ver docs/DECISIONS.md), así
  // que ninguna consulta/simulación posterior debe pisar este estado.
  const [approvedTickets, setApprovedTickets] = useState<SimulatedTicket[] | null>(null);
  // Bloque 7 (prevención de pérdida accidental): true recién cuando el
  // usuario efectivamente descargó su(s) entrada(s) — individual o el ZIP
  // conjunto. Nunca implica persistir el token en ningún lado, solo un flag
  // en memoria de este componente.
  const [ticketsDownloaded, setTicketsDownloaded] = useState(false);
  const [pendingCloseConfirm, setPendingCloseConfirm] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open || !order || liveStatus !== "PENDING") return;
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [open, order, liveStatus]);

  // El fondo (landing) no debe poder scrollearse mientras el modal está
  // abierto. Se restaura el valor previo, no un "" a secas, por si algún
  // ancestro ya tenía un overflow explícito distinto del default.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<VipCheckoutFormValues>({
    resolver: zodResolver(buildVipCheckoutSchema(ticketsPerUnit)),
    defaultValues: {
      buyer: { name: "", email: "", whatsapp: "" },
      attendees: Array.from({ length: ticketsPerUnit }, () => ({ name: "" })),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: VipCheckoutFormValues) =>
      createVipOrder(demoEvent.eventPublicId, {
        ticketTypeId,
        buyer: values.buyer,
        attendees: values.attendees,
      }),
    onSuccess: (data) => {
      setOrder(data);
      setLiveStatus("PENDING");
      setPaymentStatus(null);
    },
  });

  const simulateMutation = useMutation({
    mutationFn: (result: SimulatedPaymentResult) => simulatePayment(order!.orderPublicId, result),
    onSuccess: (data) => {
      setLiveStatus(data.orderStatus);
      setPaymentStatus(data.paymentStatus);
      if (data.tickets) {
        setApprovedTickets(data.tickets);
        setTicketsDownloaded(false);
      }
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => getOrderStatus(demoEvent.eventPublicId, order!.orderPublicId),
    onSuccess: (data) => {
      setLiveStatus(data.status);
      setPaymentStatus(data.paymentStatus);
      // GET nunca trae el token crudo: si ya lo tenemos guardado de la
      // aprobación original, no lo tocamos.
    },
  });

  if (!open) return null;

  const hasUndownloadedTickets = liveStatus === "PAID" && !!approvedTickets && !ticketsDownloaded;

  const handleClose = () => {
    if (hasUndownloadedTickets && !pendingCloseConfirm) {
      setPendingCloseConfirm(true);
      return;
    }
    onClose();
  };

  const goToAttendees = async () => {
    const valid = await trigger(["buyer.name", "buyer.email", "buyer.whatsapp"]);
    if (valid) setStep("attendees");
  };

  const goToSummary = async () => {
    const valid = await trigger("attendees");
    if (valid) setStep("summary");
  };

  const onConfirm = handleSubmit((values) => {
    createMutation.mutate(values);
  });

  const handleStartOver = () => {
    setOrder(null);
    setLiveStatus("PENDING");
    setPaymentStatus(null);
    setApprovedTickets(null);
    setTicketsDownloaded(false);
    setPendingCloseConfirm(false);
    setStep("buyer");
  };

  const createError = getErrorMessage(createMutation.isError, createMutation.error);
  const simulateError = getErrorMessage(simulateMutation.isError, simulateMutation.error);
  const refreshError = getErrorMessage(refreshMutation.isError, refreshMutation.error);

  const minutesLeft = order?.expiresAt
    ? Math.max(0, Math.ceil((new Date(order.expiresAt).getTime() - now) / 60000))
    : null;
  // La reserva ya venció según el reloj local, pero el backend todavía no lo
  // confirmó (expiración perezosa, ver docs/DECISIONS.md): se refleja acá
  // para no dejar aprobar visualmente algo que el backend va a rechazar de
  // todos modos, sin necesidad de disparar un refresh automático.
  const isLocallyExpired = minutesLeft !== null && minutesLeft <= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vip-checkout-title"
    >
      <div className="pulse-landing relative w-full max-w-md overflow-y-auto rounded-[24px] border border-[rgba(170,181,190,.14)] bg-[#101512] p-6 sm:p-8" style={{ maxHeight: "90vh" }}>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar modal"
          className={`absolute right-4 top-4 rounded-full text-[#AAB5BE] transition-colors hover:text-[#E8EEF2] ${FOCUS_RING}`}
        >
          <X size={20} />
        </button>

        {pendingCloseConfirm ? (
          <CloseConfirmView isMultiple={ticketsPerUnit > 1} onCancel={() => setPendingCloseConfirm(false)} onConfirm={onClose} />
        ) : (
          <>
            {!order && (
              <form onSubmit={(e) => e.preventDefault()} noValidate className="flex flex-col gap-4">
                <div>
                  <h2 id="vip-checkout-title" className="text-xl font-bold text-[#E8EEF2]">
                    {ticketTypeName}
                  </h2>
                  <p className="mt-1 text-sm text-[#AAB5BE]">
                    {priceLabel} · {ticketsPerUnit} {ticketsPerUnit === 1 ? "acceso" : "accesos"}
                  </p>
                </div>

                {step === "buyer" && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#4ADE80]">Paso 1 de 3 · Datos del comprador</p>
                    <Field label="Nombre" htmlFor="buyer-name" error={errors.buyer?.name?.message}>
                      <input id="buyer-name" type="text" className={inputClass(!!errors.buyer?.name)} {...register("buyer.name")} />
                    </Field>
                    <Field label="Email" htmlFor="buyer-email" error={errors.buyer?.email?.message}>
                      <input id="buyer-email" type="email" className={inputClass(!!errors.buyer?.email)} {...register("buyer.email")} />
                    </Field>
                    <Field label="WhatsApp" htmlFor="buyer-whatsapp" error={errors.buyer?.whatsapp?.message}>
                      <input
                        id="buyer-whatsapp"
                        type="tel"
                        placeholder="+5491122334455"
                        className={inputClass(!!errors.buyer?.whatsapp)}
                        {...register("buyer.whatsapp")}
                      />
                    </Field>
                    <button type="button" onClick={goToAttendees} className={`pulse-btn-primary mt-2 rounded-full py-3.5 text-sm font-bold uppercase tracking-[.06em] ${FOCUS_RING}`}>
                      Siguiente
                    </button>
                  </>
                )}

                {step === "attendees" && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#4ADE80]">Paso 2 de 3 · Asistentes</p>
                    {Array.from({ length: ticketsPerUnit }, (_, i) => (
                      <Field
                        key={i}
                        label={ticketsPerUnit === 1 ? "Nombre del asistente" : ATTENDEE_LABELS[i]}
                        htmlFor={`attendee-${i}`}
                        error={errors.attendees?.[i]?.name?.message}
                      >
                        <input
                          id={`attendee-${i}`}
                          type="text"
                          className={inputClass(!!errors.attendees?.[i]?.name)}
                          {...register(`attendees.${i}.name` as const)}
                        />
                      </Field>
                    ))}
                    <div className="mt-2 flex gap-3">
                      <button type="button" onClick={() => setStep("buyer")} className={`flex-1 rounded-full border border-[rgba(170,181,190,.3)] py-3 text-sm font-bold uppercase tracking-[.06em] text-[#AAB5BE] ${FOCUS_RING}`}>
                        Atrás
                      </button>
                      <button type="button" onClick={goToSummary} className={`pulse-btn-primary flex-1 rounded-full py-3 text-sm font-bold uppercase tracking-[.06em] ${FOCUS_RING}`}>
                        Siguiente
                      </button>
                    </div>
                  </>
                )}

                {step === "summary" && (
                  <SummaryStep
                    ticketTypeName={ticketTypeName}
                    priceLabel={priceLabel}
                    ticketsPerUnit={ticketsPerUnit}
                    onBack={() => setStep("attendees")}
                    onConfirm={onConfirm}
                    pending={createMutation.isPending}
                    error={createError}
                  />
                )}
              </form>
            )}

            {order && liveStatus === "PENDING" && (
              <PendingOrderView
                order={order}
                paymentStatus={paymentStatus}
                minutesLeft={minutesLeft}
                isLocallyExpired={isLocallyExpired}
                onSimulate={(result) => simulateMutation.mutate(result)}
                onRefresh={() => refreshMutation.mutate()}
                simulating={simulateMutation.isPending}
                refreshing={refreshMutation.isPending}
                simulateError={simulateError}
                refreshError={refreshError}
              />
            )}

            {order && liveStatus === "PAID" && (
              <ApprovedOrderView
                order={order}
                tickets={approvedTickets}
                onClose={handleClose}
                onDelivered={() => setTicketsDownloaded(true)}
              />
            )}

            {order && liveStatus === "CANCELLED" && (
              <StatusMessageView
                headline="Compra cancelada"
                message="Esta reserva fue cancelada. No se generó ningún ticket."
                tone="red"
                actionLabel="Cerrar"
                onAction={handleClose}
              />
            )}

            {order && liveStatus === "EXPIRED" && (
              <StatusMessageView
                headline="Reserva vencida"
                message="Pasaron los 15 minutos de la reserva. Podés iniciar una compra nueva."
                tone="yellow"
                actionLabel="Iniciar nueva compra"
                onAction={handleStartOver}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CloseConfirmView({ isMultiple, onCancel, onConfirm }: { isMultiple: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(246,196,83,.14)] text-[#F6C453]">
        <X size={28} />
      </div>
      <h2 role="alert" className="text-xl font-bold text-[#E8EEF2]">
        Todavía no descargaste {isMultiple ? "tus entradas" : "tu entrada"}
      </h2>
      <p className="text-[.95rem] text-[#AAB5BE]">
        Si cerrás esta ventana, no vamos a poder volver a mostrarte {isMultiple ? "estos códigos QR" : "este código QR"} desde
        esta sesión.
      </p>
      <div className="mt-2 flex w-full gap-3">
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 rounded-full border border-[rgba(170,181,190,.3)] py-3 text-sm font-bold uppercase tracking-[.06em] text-[#AAB5BE] ${FOCUS_RING}`}
        >
          Volver a las entradas
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`flex-1 rounded-full bg-[rgba(239,68,68,.16)] py-3 text-sm font-bold uppercase tracking-[.06em] text-[#f87171] ${FOCUS_RING}`}
        >
          Cerrar de todas formas
        </button>
      </div>
    </div>
  );
}

function SummaryStep({
  ticketTypeName,
  priceLabel,
  ticketsPerUnit,
  onBack,
  onConfirm,
  pending,
  error,
}: {
  ticketTypeName: string;
  priceLabel: string;
  ticketsPerUnit: 1 | 2;
  onBack: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#4ADE80]">Paso 3 de 3 · Resumen</p>
      <div className="flex flex-col gap-2 rounded-2xl bg-[rgba(170,181,190,.06)] p-4 text-sm text-[#E8EEF2]">
        <SummaryRow label="Evento" value="Pulse Festival" />
        <SummaryRow label="Tipo de entrada" value={ticketTypeName} />
        <SummaryRow label="Accesos" value={String(ticketsPerUnit)} />
        <SummaryRow label="Total" value={priceLabel} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-sm text-[#f87171]">
          {error}
        </p>
      )}
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={onBack} disabled={pending} className={`flex-1 rounded-full border border-[rgba(170,181,190,.3)] py-3 text-sm font-bold uppercase tracking-[.06em] text-[#AAB5BE] disabled:opacity-50 ${FOCUS_RING}`}>
          Atrás
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`pulse-btn-primary flex-1 rounded-full py-3 text-sm font-bold uppercase tracking-[.06em] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
        >
          {pending ? "Reservando…" : "Confirmar reserva"}
        </button>
      </div>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#7d8790]">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function PendingOrderView({
  order,
  paymentStatus,
  minutesLeft,
  isLocallyExpired,
  onSimulate,
  onRefresh,
  simulating,
  refreshing,
  simulateError,
  refreshError,
}: {
  order: CreateVipOrderResponse;
  paymentStatus: PaymentStatus | null;
  minutesLeft: number | null;
  isLocallyExpired: boolean;
  onSimulate: (result: SimulatedPaymentResult) => void;
  onRefresh: () => void;
  simulating: boolean;
  refreshing: boolean;
  simulateError: string | null;
  refreshError: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(246,196,83,.14)] text-[#F6C453]">
        <Check size={28} />
      </div>
      <h2 className="text-xl font-bold text-[#E8EEF2]">Reserva activa</h2>
      <p className="text-[.95rem] text-[#AAB5BE]">
        Tu lugar para <span className="text-[#4ADE80]">{order.ticketType}</span> está reservado. Confirmá el pago
        antes de que venza la reserva.
      </p>
      {minutesLeft !== null && (
        <p role="status" className="text-sm font-semibold text-[#F6C453]">
          {isLocallyExpired ? "La reserva venció. Actualizá el estado para confirmarlo." : `Quedan ~${minutesLeft} min de reserva.`}
        </p>
      )}

      {paymentStatus === "REJECTED" && (
        <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-sm text-[#f87171]">
          El pago fue rechazado. Podés volver a intentar mientras la reserva siga vigente.
        </p>
      )}

      {simulateError && (
        <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-sm text-[#f87171]">
          {simulateError}
        </p>
      )}

      {refreshError && (
        <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-sm text-[#f87171]">
          {refreshError}
        </p>
      )}

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className={`rounded text-xs font-semibold uppercase tracking-[.08em] text-[#AAB5BE] underline-offset-2 hover:underline disabled:opacity-50 ${FOCUS_RING}`}
      >
        {refreshing ? "Actualizando…" : "Actualizar estado"}
      </button>

      {!isLocallyExpired && import.meta.env.DEV && order.paymentSimulationAvailable && (
        <SimulatePaymentControls onSimulate={onSimulate} disabled={simulating} />
      )}
    </div>
  );
}

function ApprovedOrderView({
  order,
  tickets,
  onClose,
  onDelivered,
}: {
  order: CreateVipOrderResponse;
  tickets: SimulatedTicket[] | null;
  onClose: () => void;
  onDelivered: () => void;
}) {
  const ticketRefs = useRef<Array<EventTicketHandle | null>>([]);
  const isMultiple = (tickets?.length ?? 0) > 1;

  const fileName = !tickets
    ? ""
    : isMultiple
      ? `pulse-event-vip-doble-${sanitizeFileNameId(order.orderPublicId)}.pdf`
      : `pulse-event-vip-individual-${sanitizeFileNameId(tickets[0].ticketPublicId)}.pdf`;

  const delivery = useTicketPdfDelivery({
    getCaptures: async () => {
      if (!tickets) throw new Error("no-tickets");
      return Promise.all(
        tickets.map((_, index) => {
          const handle = ticketRefs.current[index];
          if (!handle) throw new Error("ticket-not-ready");
          return handle.generateCapture();
        }),
      );
    },
    fileName,
    shareTitle: isMultiple ? "Tus entradas VIP Doble — Pulse Event" : "Tu entrada VIP — Pulse Event",
    onDelivered,
  });

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(74,222,128,.14)] text-[#4ADE80]">
        <Check size={28} />
      </div>
      <h2 className="text-xl font-bold text-[#E8EEF2]">Compra confirmada</h2>
      <p className="text-[.95rem] text-[#AAB5BE]">
        Tu entrada <span className="text-[#4ADE80]">{order.ticketType}</span> quedó confirmada.
      </p>

      {tickets ? (
        <div className="flex w-full flex-col items-center gap-8">
          {tickets.map((ticket, index) => (
            <EventTicket
              key={ticket.ticketPublicId}
              ref={(handle) => {
                ticketRefs.current[index] = handle;
              }}
              token={ticket.token}
              attendeeName={ticket.holderName}
              ticketType={ticket.ticketType}
              ticketPublicId={ticket.ticketPublicId}
            />
          ))}

          <TicketDeliveryButtons
            downloadLabel={isMultiple ? "Descargar ambas entradas" : "Descargar entrada"}
            preparingLabel={isMultiple ? "Preparando ambas entradas…" : "Preparando entrada…"}
            shareLabel={isMultiple ? "Compartir ambas entradas" : "Compartir entrada"}
            status={delivery.status}
            error={delivery.error}
            canShare={supportsFileShare()}
            onDownload={delivery.download}
            onShare={delivery.share}
          />
        </div>
      ) : (
        <p role="alert" className="rounded-lg bg-[rgba(246,196,83,.12)] px-3 py-2 text-sm text-[#F6C453]">
          Esta orden ya había sido aprobada antes. Las entradas se mostraron en el momento exacto de la aprobación y
          no se pueden volver a mostrar acá.
        </p>
      )}

      <button
        type="button"
        onClick={onClose}
        className={`pulse-btn-primary rounded-full px-8 py-3 text-sm font-bold uppercase tracking-[.06em] ${FOCUS_RING}`}
      >
        Cerrar
      </button>
    </div>
  );
}

function StatusMessageView({
  headline,
  message,
  tone,
  actionLabel,
  onAction,
}: {
  headline: string;
  message: string;
  tone: "red" | "yellow";
  actionLabel: string;
  onAction: () => void;
}) {
  const toneClass = tone === "red" ? "bg-[rgba(239,68,68,.14)] text-[#f87171]" : "bg-[rgba(246,196,83,.14)] text-[#F6C453]";

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${toneClass}`}>
        <X size={28} />
      </div>
      <h2 role="alert" className="text-xl font-bold text-[#E8EEF2]">
        {headline}
      </h2>
      <p className="text-[.95rem] text-[#AAB5BE]">{message}</p>
      <button
        type="button"
        onClick={onAction}
        className={`pulse-btn-primary rounded-full px-8 py-3 text-sm font-bold uppercase tracking-[.06em] ${FOCUS_RING}`}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-[#D7E2EA]">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-[#f87171]">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `rounded-xl border bg-[#0C0C0C] px-4 py-2.5 text-[#E8EEF2] outline-none transition-colors placeholder:text-[#7d8790] focus:border-[#4ADE80] ${
    hasError ? "border-[#f87171]" : "border-[rgba(170,181,190,.2)]"
  }`;
}
