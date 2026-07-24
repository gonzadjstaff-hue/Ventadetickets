import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";

interface TicketQrCodeProps {
  /** Token crudo del ticket, recibido una sola vez en la respuesta de registro. Nunca se persiste ni se muestra como texto. */
  token: string;
  ticketPublicId: string;
}

const QR_COLOR = { dark: "#0C0C0C", light: "#E8EEF2" };

/**
 * Contenido codificado en el QR: un formato versionado propio, sin datos
 * personales (ni email, ni nombre, ni IDs de orden/ticket) — solo el token.
 */
function buildQrContent(token: string): string {
  return `pulse-ticket:v1:${token}`;
}

export default function TicketQrCode({ token, ticketPublicId }: TicketQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    toDataURL(buildQrContent(token), { width: 220, margin: 1, color: QR_COLOR })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        // No se loguea el error: podría filtrar el texto codificado (que incluye el token).
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (failed) {
    return (
      <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-center text-sm text-[#f87171]">
        No pudimos generar el código QR. Tu entrada ya quedó confirmada; podés cerrar esta ventana.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-center text-sm text-[#AAB5BE]">
        Guardá este QR. Lo vas a necesitar para ingresar al evento.
      </p>

      {dataUrl ? (
        <>
          <div className="rounded-xl bg-[#E8EEF2] p-3 shadow-[0_8px_22px_-8px_rgba(0,0,0,.6)]">
            <img
              src={dataUrl}
              alt="Código QR de tu entrada"
              width={200}
              height={200}
              className="block h-[200px] w-[200px]"
            />
          </div>
          <a
            href={dataUrl}
            download={`pulse-event-${ticketPublicId}.png`}
            className="pulse-btn-outline inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold uppercase tracking-[.06em] text-[#E8EEF2]"
          >
            Descargar QR
          </a>
        </>
      ) : (
        <div
          role="status"
          aria-label="Generando código QR"
          className="h-[200px] w-[200px] animate-pulse rounded-xl bg-[rgba(170,181,190,.1)]"
        />
      )}
    </div>
  );
}
