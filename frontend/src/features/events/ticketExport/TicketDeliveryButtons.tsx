const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ADE80]";

interface TicketDeliveryButtonsProps {
  downloadLabel: string;
  preparingLabel: string;
  shareLabel: string;
  status: "idle" | "preparing";
  error: string | null;
  canShare: boolean;
  onDownload: () => void;
  onShare: () => void;
}

/**
 * Botones de descarga/compartir reutilizados por General, VIP Individual y
 * VIP Doble — solo cambian las etiquetas y si hay una o dos entradas detrás.
 * "Compartir" solo se renderiza si el navegador lo soporta (ver
 * `ticketExport/share.ts`); nunca se muestra un botón roto en desktop o en
 * navegadores incompatibles.
 */
export default function TicketDeliveryButtons({
  downloadLabel,
  preparingLabel,
  shareLabel,
  status,
  error,
  canShare,
  onDownload,
  onShare,
}: TicketDeliveryButtonsProps) {
  const busy = status === "preparing";

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          aria-busy={busy}
          className={`pulse-btn-primary flex-1 rounded-full py-3.5 text-sm font-bold uppercase tracking-[.06em] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
        >
          {busy ? preparingLabel : downloadLabel}
        </button>

        {canShare && (
          <button
            type="button"
            onClick={onShare}
            disabled={busy}
            aria-busy={busy}
            className={`flex-1 rounded-full border border-[rgba(170,181,190,.35)] py-3.5 text-sm font-bold uppercase tracking-[.06em] text-[#E8EEF2] transition-colors hover:bg-[rgba(170,181,190,.1)] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            {busy ? preparingLabel : shareLabel}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-center text-sm text-[#f87171]">
          {error}
        </p>
      )}
    </div>
  );
}
