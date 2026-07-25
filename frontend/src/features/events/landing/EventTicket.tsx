import { toPng } from "html-to-image";
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";

import { eventInfo } from "./mockData";
import TicketQrCode from "./TicketQrCode";

interface EventTicketProps {
  token: string;
  attendeeName: string;
  ticketType: string;
  ticketPublicId: string;
}

export interface TicketCapture {
  /** PNG en `data:` URL, ya recortado a las dimensiones reales del nodo (ver `measureExportSize`). */
  dataUrl: string;
  /** Ancho/alto en px CSS usados para la captura (antes de `pixelRatio`) — el que necesita el PDF para calcular la relación de aspecto real. */
  width: number;
  height: number;
}

/** API imperativa mínima para que un padre (descarga/compartir en PDF, ver
 * `frontend/src/features/events/ticketExport/`) pueda generar la captura de
 * este ticket sin que el propio componente dispare ninguna descarga — la
 * descarga/compartir es responsabilidad exclusiva del padre, unificada entre
 * General, VIP Individual y VIP Doble. */
export interface EventTicketHandle {
  generateCapture: () => Promise<TicketCapture>;
}

/** Ancho fijo del nodo exportado: la entrada descargada debe verse siempre
 * igual, sin importar el tamaño del modal o del viewport que la generó. En
 * pantallas angostas, el contenedor de abajo permite scroll horizontal en vez
 * de achicar la entrada. */
const TICKET_EXPORT_WIDTH = 340;

type QrStatus = "pending" | "ready" | "failed";

/**
 * Mide el nodo con `getBoundingClientRect()` (preciso, con decimales) en vez
 * de `offsetWidth`/`offsetHeight` (enteros, redondeados por el navegador) y
 * redondea siempre hacia arriba. Causa real del recorte del borde derecho que
 * tenía la descarga: cuando el ancho de layout real era, por ejemplo,
 * 339.6px, `offsetWidth` podía devolver 339 (redondeo hacia abajo en algunos
 * motores), y pedirle a `html-to-image` que capture exactamente esos 339px
 * recortaba ~0.6px de contenido real en el borde derecho — imperceptible a
 * pixelRatio 1, pero un corte visible una vez escalado a pixelRatio 2. El
 * fallback a `offsetWidth`/`offsetHeight` es solo defensivo (nunca debería
 * activarse fuera de un entorno de test sin layout real, donde
 * `getBoundingClientRect` devuelve 0).
 */
function measureExportSize(node: HTMLElement): { width: number; height: number } {
  const rect = node.getBoundingClientRect();
  return {
    width: Math.ceil(rect.width) || node.offsetWidth,
    height: Math.ceil(rect.height) || node.offsetHeight,
  };
}

/**
 * Espera a que las fuentes web hayan terminado de cargar antes de capturar.
 * Si `toPng` captura mientras el navegador todavía está mostrando la fuente
 * de reemplazo (FOUT), el texto puede angostarse o ensancharse apenas
 * termine de cargar la fuente real — otra fuente conocida de recortes en
 * `html-to-image`, independiente del cálculo de ancho de arriba.
 */
async function waitForFontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.ready;
  } catch {
    // Si falla la espera, mejor capturar igual que bloquear la descarga.
  }
}

const EventTicket = forwardRef<EventTicketHandle, EventTicketProps>(function EventTicket(
  { token, attendeeName, ticketType, ticketPublicId },
  ref,
) {
  const ticketRef = useRef<HTMLDivElement | null>(null);

  // Permite esperar de forma async a que el QR esté listo (o haya fallado),
  // sin importar si `generateCapture` se llama antes o después de que
  // TicketQrCode termine de generarlo — evita una carrera entre el padre
  // (descarga/compartir) y el QR todavía en construcción.
  const qrStatusRef = useRef<QrStatus>("pending");
  const qrWaitersRef = useRef<Array<(status: QrStatus) => void>>([]);

  function resolveQrStatus(status: QrStatus) {
    qrStatusRef.current = status;
    const waiters = qrWaitersRef.current;
    qrWaitersRef.current = [];
    waiters.forEach((resolve) => resolve(status));
  }

  function waitForQrStatus(): Promise<QrStatus> {
    if (qrStatusRef.current !== "pending") return Promise.resolve(qrStatusRef.current);
    return new Promise((resolve) => qrWaitersRef.current.push(resolve));
  }

  async function generateCapture(): Promise<TicketCapture> {
    if (!ticketRef.current) throw new Error("ticket-not-mounted");
    const status = await waitForQrStatus();
    if (status === "failed") throw new Error("qr-generation-failed");

    await waitForFontsReady();
    const { width, height } = measureExportSize(ticketRef.current);
    const dataUrl = await toPng(ticketRef.current, { pixelRatio: 2, cacheBust: true, width, height });
    return { dataUrl, width, height };
  }

  useImperativeHandle(ref, () => ({ generateCapture }));

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="w-full overflow-x-auto">
        <div
          ref={ticketRef}
          style={{
            width: TICKET_EXPORT_WIDTH,
            boxSizing: "border-box",
          }}
          className="pulse-ticket-dl-border mx-auto rounded-[26px] p-[1.5px]"
        >
          <div className="pulse-ticket-dl-inner relative overflow-hidden rounded-[25px]">
            <div className="pulse-ticket-dl-glow-green absolute -top-[35%] -left-[25%] h-[45%] w-[45%]" />
            <div className="pulse-ticket-dl-glow-violet absolute -bottom-[25%] -right-[20%] h-[42%] w-[42%]" />

            <div className="relative border-b border-dashed border-[rgba(170,181,190,.28)] px-6 pb-3 pt-5 text-center">
              <p className="text-lg font-black uppercase tracking-[.14em] text-[#E8EEF2]">Pulse Event</p>
              <p className="mt-1 text-[.62rem] font-semibold uppercase tracking-[.22em] text-[#AAB5BE]">
                Entrada digital
              </p>
            </div>

            <div className="relative px-6 py-4 text-center">
              <p className="text-xl font-extrabold leading-tight text-[#E8EEF2]">{eventInfo.name}</p>
              <p className="mt-1.5 text-sm font-medium text-[#AAB5BE]">{eventInfo.date}</p>
              <p className="text-sm font-medium text-[#AAB5BE]">{eventInfo.venue}</p>
            </div>

            <div className="relative flex justify-center px-6 pb-4">
              <TicketQrCode
                token={token}
                onReady={() => resolveQrStatus("ready")}
                onError={() => resolveQrStatus("failed")}
              />
            </div>

            <div className="relative h-0">
              <div className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-[#0C0C0C]" />
              <div className="absolute -right-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-[#0C0C0C]" />
              <div className="mx-3.5 border-t-2 border-dashed border-[rgba(170,181,190,.28)]" />
            </div>

            <div className="relative flex flex-col gap-2.5 px-6 py-4">
              <DetailRow label="Tipo de entrada" value={`Entrada ${ticketType}`} accent />
              <DetailRow label="Asistente" value={attendeeName} />
              <DetailRow label="N.º de ticket" value={ticketPublicId} mono />
            </div>

            <div className="relative bg-[rgba(170,181,190,.06)] px-6 py-3">
              <p className="text-[.6rem] font-bold uppercase tracking-[.18em] text-[#7d8790]">
                Información importante
              </p>
              <p className="mt-1.5 text-[.78rem] leading-[1.35] text-[#AAB5BE]">
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
    </div>
  );
});

export default EventTicket;

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
    <div className="flex flex-col gap-1 text-left">
      <p className="text-[.62rem] font-semibold uppercase tracking-[.16em] text-[#7d8790]">{label}</p>

      <p
        style={mono ? { overflowWrap: "anywhere" } : undefined}
        className={`font-bold ${mono ? "text-[.78rem] font-mono tracking-[.04em] break-all" : "text-[.9rem]"} ${
          accent ? "text-[#4ADE80]" : "text-[#E8EEF2]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
