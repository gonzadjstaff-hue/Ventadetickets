import type { SimulatedPaymentResult } from "../../../api/orders";

interface SimulatePaymentControlsProps {
  onSimulate: (result: SimulatedPaymentResult) => void;
  disabled: boolean;
}

const OPTIONS: Array<{ result: SimulatedPaymentResult; label: string; className: string }> = [
  { result: "approved", label: "Aprobar pago", className: "bg-[#4ADE80] text-[#04140A] hover:bg-[#3FD374]" },
  {
    result: "pending",
    label: "Dejar pendiente",
    className: "border border-[rgba(170,181,190,.35)] text-[#E8EEF2] hover:bg-[rgba(170,181,190,.1)]",
  },
  { result: "rejected", label: "Rechazar", className: "bg-[rgba(239,68,68,.16)] text-[#f87171] hover:bg-[rgba(239,68,68,.26)]" },
  { result: "cancelled", label: "Cancelar", className: "bg-[rgba(170,181,190,.14)] text-[#AAB5BE] hover:bg-[rgba(170,181,190,.22)]" },
];

/**
 * Solo se usa en desarrollo, contra el simulador de pago del backend (ver
 * ENABLE_MVP_PAYMENT_SIMULATOR en docs/LOCAL_SETUP.md). El padre decide si
 * corresponde renderizarlo (import.meta.env.DEV + paymentSimulationAvailable).
 */
export default function SimulatePaymentControls({ onSimulate, disabled }: SimulatePaymentControlsProps) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl border border-dashed border-[rgba(246,196,83,.4)] bg-[rgba(246,196,83,.06)] p-4">
      <p className="text-center text-[.68rem] font-bold uppercase tracking-[.14em] text-[#F6C453]">
        Simulador de pago (solo desarrollo)
      </p>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.result}
            type="button"
            disabled={disabled}
            onClick={() => onSimulate(option.result)}
            className={`rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-[.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${option.className}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
