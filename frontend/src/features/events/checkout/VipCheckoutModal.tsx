import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
import EventTicket from "../landing/EventTicket";
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!order || liveStatus !== "PENDING") return;
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [order, liveStatus]);

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
      if (data.tickets) setApprovedTickets(data.tickets);
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

  const handleClose = () => {
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
    setStep("buyer");
  };

  const createError =
    createMutation.error instanceof ApiError
      ? createMutation.error.message
      : createMutation.isError
        ? "No pudimos conectar con el servidor. Probá de nuevo en un momento."
        : null;

  const minutesLeft = order?.expiresAt
    ? Math.max(0, Math.ceil((new Date(order.expiresAt).getTime() - now) / 60000))
    : null;

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
          aria-label="Cerrar"
          className="absolute right-4 top-4 text-[#AAB5BE] transition-colors hover:text-[#E8EEF2]"
        >
          <X size={20} />
        </button>

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
                <button type="button" onClick={goToAttendees} className="pulse-btn-primary mt-2 rounded-full py-3.5 text-sm font-bold uppercase tracking-[.06em]">
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
                  <button type="button" onClick={() => setStep("buyer")} className="flex-1 rounded-full border border-[rgba(170,181,190,.3)] py-3 text-sm font-bold uppercase tracking-[.06em] text-[#AAB5BE]">
                    Atrás
                  </button>
                  <button type="button" onClick={goToSummary} className="pulse-btn-primary flex-1 rounded-full py-3 text-sm font-bold uppercase tracking-[.06em]">
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
            onSimulate={(result) => simulateMutation.mutate(result)}
            onRefresh={() => refreshMutation.mutate()}
            simulating={simulateMutation.isPending}
            refreshing={refreshMutation.isPending}
          />
        )}

        {order && liveStatus === "PAID" && (
          <ApprovedOrderView order={order} tickets={approvedTickets} onClose={handleClose} />
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
        <button type="button" onClick={onBack} disabled={pending} className="flex-1 rounded-full border border-[rgba(170,181,190,.3)] py-3 text-sm font-bold uppercase tracking-[.06em] text-[#AAB5BE] disabled:opacity-50">
          Atrás
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="pulse-btn-primary flex-1 rounded-full py-3 text-sm font-bold uppercase tracking-[.06em] disabled:cursor-not-allowed disabled:opacity-60"
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
  onSimulate,
  onRefresh,
  simulating,
  refreshing,
}: {
  order: CreateVipOrderResponse;
  paymentStatus: PaymentStatus | null;
  minutesLeft: number | null;
  onSimulate: (result: SimulatedPaymentResult) => void;
  onRefresh: () => void;
  simulating: boolean;
  refreshing: boolean;
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
          {minutesLeft > 0 ? `Quedan ~${minutesLeft} min de reserva.` : "La reserva está por vencer."}
        </p>
      )}

      {paymentStatus === "REJECTED" && (
        <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-sm text-[#f87171]">
          El pago fue rechazado. Podés volver a intentar mientras la reserva siga vigente.
        </p>
      )}

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="text-xs font-semibold uppercase tracking-[.08em] text-[#AAB5BE] underline-offset-2 hover:underline disabled:opacity-50"
      >
        {refreshing ? "Actualizando…" : "Actualizar estado"}
      </button>

      {import.meta.env.DEV && order.paymentSimulationAvailable && (
        <SimulatePaymentControls onSimulate={onSimulate} disabled={simulating} />
      )}
    </div>
  );
}

function ApprovedOrderView({
  order,
  tickets,
  onClose,
}: {
  order: CreateVipOrderResponse;
  tickets: SimulatedTicket[] | null;
  onClose: () => void;
}) {
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
          {tickets.map((ticket) => (
            <EventTicket
              key={ticket.ticketPublicId}
              token={ticket.token}
              attendeeName={ticket.holderName}
              ticketType={ticket.ticketType}
              ticketPublicId={ticket.ticketPublicId}
            />
          ))}
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
        className="pulse-btn-primary rounded-full px-8 py-3 text-sm font-bold uppercase tracking-[.06em]"
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
        className="pulse-btn-primary rounded-full px-8 py-3 text-sm font-bold uppercase tracking-[.06em]"
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
