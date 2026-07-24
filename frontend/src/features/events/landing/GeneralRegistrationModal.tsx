import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";

import { ApiError } from "../../../api/client";
import { registerGeneralTicket, type GeneralRegistrationResponse } from "../../../api/registrations";
import { demoEvent } from "../../../config/demoEvent";
import EventTicket from "./EventTicket";
import {
  generalRegistrationFormSchema,
  type GeneralRegistrationFormValues,
} from "./generalRegistrationSchema";

const FORM_FIELDS = ["firstName", "lastName", "email", "phone", "acceptedTerms"] as const;

interface GeneralRegistrationModalProps {
  open: boolean;
  onClose: () => void;
}

export default function GeneralRegistrationModal({ open, onClose }: GeneralRegistrationModalProps) {
  const [result, setResult] = useState<GeneralRegistrationResponse | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<GeneralRegistrationFormValues>({
    resolver: zodResolver(generalRegistrationFormSchema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", acceptedTerms: false },
  });

  const mutation = useMutation({
    mutationFn: (values: GeneralRegistrationFormValues) =>
      registerGeneralTicket(demoEvent.eventPublicId, {
        ticketTypeId: demoEvent.generalTicketTypeId,
        ...values,
      }),
    onSuccess: (data) => {
      // El token viaja únicamente en memoria (estado de este componente) y se
      // descarta al cerrar el modal: no se persiste ni se muestra al usuario.
      setResult(data);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        for (const field of FORM_FIELDS) {
          const message = error.fields[field]?.[0];
          if (message) setError(field, { message });
        }
      }
    },
  });

  if (!open) return null;

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(values);
  });

  const duplicateEmail = mutation.error instanceof ApiError && mutation.error.code === "DUPLICATE_REGISTRATION";
  const genericError =
    mutation.isError && !duplicateEmail
      ? mutation.error instanceof ApiError
        ? mutation.error.message
        : "No pudimos conectar con el servidor. Probá de nuevo en un momento."
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="general-registration-title"
    >
      <div className="pulse-landing relative w-full max-w-md rounded-[24px] border border-[rgba(170,181,190,.14)] bg-[#101512] p-6 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 text-[#AAB5BE] transition-colors hover:text-[#E8EEF2]"
        >
          <X size={20} />
        </button>

        {result ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(74,222,128,.14)] text-[#4ADE80]">
              <Check size={28} />
            </div>
            <h2 id="general-registration-title" className="text-xl font-bold text-[#E8EEF2]">
              {result.message}
            </h2>
            <p className="text-[.95rem] text-[#AAB5BE]">
              {result.attendeeName}, tu entrada <span className="text-[#4ADE80]">{result.ticketType}</span> quedó
              confirmada.
            </p>

            <EventTicket
              token={result.ticketToken}
              attendeeName={result.attendeeName}
              ticketType={result.ticketType}
              ticketPublicId={result.ticketPublicId}
            />

            <button
              type="button"
              onClick={onClose}
              className="pulse-btn-primary mt-2 rounded-full px-8 py-3 text-sm font-bold uppercase tracking-[.06em]"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate aria-busy={mutation.isPending} className="flex flex-col gap-4">
            <div>
              <h2 id="general-registration-title" className="text-xl font-bold text-[#E8EEF2]">
                Entrada General
              </h2>
              <p className="mt-1 text-sm text-[#AAB5BE]">Gratis. Completá tus datos para reservar tu lugar.</p>
            </div>

            {duplicateEmail && (
              <p role="alert" className="rounded-lg bg-[rgba(246,196,83,.12)] px-3 py-2 text-sm text-[#F6C453]">
                Este email ya tiene una entrada General para este evento.
              </p>
            )}
            {genericError && (
              <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-sm text-[#f87171]">
                {genericError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" htmlFor="firstName" error={errors.firstName?.message}>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  className={inputClass(!!errors.firstName)}
                  {...register("firstName")}
                />
              </Field>
              <Field label="Apellido" htmlFor="lastName" error={errors.lastName?.message}>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  className={inputClass(!!errors.lastName)}
                  {...register("lastName")}
                />
              </Field>
            </div>

            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={inputClass(!!errors.email)}
                {...register("email")}
              />
            </Field>

            <Field label="WhatsApp" htmlFor="phone" error={errors.phone?.message}>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+5491122334455"
                className={inputClass(!!errors.phone)}
                {...register("phone")}
              />
            </Field>

            <label className="flex items-start gap-2.5 text-sm text-[#D7E2EA]">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 flex-none rounded border-[rgba(170,181,190,.4)] bg-transparent text-[#4ADE80] focus:ring-[#4ADE80]"
                {...register("acceptedTerms")}
              />
              Acepto los términos y condiciones del evento.
            </label>
            {errors.acceptedTerms && (
              <p role="alert" className="-mt-2 text-sm text-[#f87171]">
                {errors.acceptedTerms.message}
              </p>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="pulse-btn-primary mt-2 rounded-full py-3.5 text-sm font-bold uppercase tracking-[.06em] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? "Confirmando…" : "Confirmar entrada gratuita"}
            </button>
          </form>
        )}
      </div>
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
