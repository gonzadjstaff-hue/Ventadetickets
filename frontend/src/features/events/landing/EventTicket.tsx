import { toPng } from "html-to-image";
import { useRef, useState, type ReactNode } from "react";

import { eventInfo } from "./mockData";
import TicketQrCode from "./TicketQrCode";

interface EventTicketProps {
  token: string;
  attendeeName: string;
  ticketType: string;
  ticketPublicId: string;
}

/** Ancho fijo del nodo exportado: la entrada descargada debe verse siempre
 * igual, sin importar el tamaño del modal o del viewport que la generó. En
 * pantallas angostas, el contenedor de abajo permite scroll horizontal en vez
 * de achicar la entrada. */
const TICKET_EXPORT_WIDTH = 340;

export default function EventTicket({ token, attendeeName, ticketType, ticketPublicId }: EventTicketProps) {
  const ticketRef = useRef<HTMLDivElement | null>(null);
  const [qrReady, setQrReady] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);

  const handleDownload = async () => {
    if (!ticketRef.current) return;

    setExporting(true);
    setExportFailed(false);

    try {
      const pngDataUrl = await toPng(ticketRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        width: ticketRef.current.offsetWidth,
        height: ticketRef.current.offsetHeight,
      });

      const link = document.createElement("a");
      link.href = pngDataUrl;
      link.download = `pulse-event-ticket-${ticketPublicId}.png`;
      link.click();
    } catch {
      // No se loguea: evitamos dejar rastro de cualquier detalle interno del fallo.
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="w-full overflow-x-auto">
        <div
          ref={ticketRef}
          style={{
            width: TICKET_EXPORT_WIDTH,
            boxSizing: "border-box",
          }}
          className="pulse-ticket-border mx-auto rounded-[26px] p-[1.5px]"
        >
          <div className="pulse-ticket-inner relative overflow-hidden rounded-[25px]">
            <div className="pulse-ticket-glow-green absolute -top-[35%] -left-[25%] h-[70%] w-[70%]" />
            <div className="pulse-ticket-glow-violet absolute -bottom-[25%] -right-[20%] h-[60%] w-[60%]" />

            <div className="relative border-b border-dashed border-[rgba(170,181,190,.28)] px-6 pb-4 pt-6 text-center">
              <p className="text-lg font-black uppercase tracking-[.14em] text-[#E8EEF2]">Pulse Event</p>
              <p className="mt-1 text-[.62rem] font-semibold uppercase tracking-[.22em] text-[#AAB5BE]">
                Entrada digital
              </p>
            </div>

            <div className="relative px-6 py-5 text-center">
              <p className="text-xl font-extrabold leading-tight text-[#E8EEF2]">{eventInfo.name}</p>
              <p className="mt-2 text-sm font-medium text-[#AAB5BE]">{eventInfo.date}</p>
              <p className="text-sm font-medium text-[#AAB5BE]">{eventInfo.venue}</p>
            </div>

            <div className="relative flex justify-center px-6 pb-5">
              <TicketQrCode
                token={token}
                onReady={() => {
                  setQrReady(true);
                  setQrFailed(false);
                }}
                onError={() => {
                  setQrReady(false);
                  setQrFailed(true);
                }}
              />
            </div>

            <div className="relative h-0">
              <div className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-[#0C0C0C]" />
              <div className="absolute -right-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-[#0C0C0C]" />
              <div className="mx-3.5 border-t-2 border-dashed border-[rgba(170,181,190,.28)]" />
            </div>

            <div className="relative flex flex-col gap-3 px-6 py-5">
              <DetailRow label="Tipo de entrada" value={`Entrada ${ticketType}`} accent />
              <DetailRow label="Asistente" value={attendeeName} />
              <DetailRow label="N.º de ticket" value={ticketPublicId} mono />
            </div>

            <div className="relative bg-[rgba(170,181,190,.06)] px-6 py-4">
              <p className="text-[.6rem] font-bold uppercase tracking-[.18em] text-[#7d8790]">
                Información importante
              </p>
              <p className="mt-2 text-[.78rem] leading-[1.5] text-[#AAB5BE]">
                Entrada personal e intransferible. Presentá este código QR en el ingreso, desde tu teléfono o
                impreso. Te recomendamos llegar con anticipación.
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-[#AAB5BE]">
        Guardá esta entrada. La vas a necesitar para ingresar al evento.
      </p>

      <button
        type="button"
        onClick={handleDownload}
        disabled={!qrReady || qrFailed || exporting}
        className="pulse-btn-outline inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold uppercase tracking-[.06em] text-[#E8EEF2] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exporting ? "Generando…" : "Descargar entrada"}
      </button>

      {exportFailed && (
        <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-center text-sm text-[#f87171]">
          No pudimos exportar tu entrada. Tu registro ya está confirmado; podés cerrar esta ventana.
        </p>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[.62rem] font-semibold uppercase tracking-[.16em] text-[#7d8790]">{label}</p>

      <p
        className={`truncate text-right text-[.9rem] font-bold ${accent ? "text-[#4ADE80]" : "text-[#E8EEF2]"
          } ${mono ? "font-mono tracking-[.05em]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}