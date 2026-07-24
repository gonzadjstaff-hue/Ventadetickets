import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";

interface TicketQrCodeProps {
  /** Token crudo del ticket, recibido una sola vez en la respuesta de registro. Nunca se persiste ni se muestra como texto. */
  token: string;
  /** Se llama con el data URL del QR generado, para que el padre pueda habilitar acciones (ej. exportar la entrada completa). */
  onReady?: (dataUrl: string) => void;
  /** Se llama si falla la generación del QR. */
  onError?: () => void;
}

const QR_COLOR = { dark: "#0C0C0C", light: "#E8EEF2" };

/**
 * Contenido codificado en el QR: un formato versionado propio, sin datos
 * personales (ni email, ni nombre, ni IDs de orden/ticket) — solo el token.
 */
function buildQrContent(token: string): string {
  return `pulse-ticket:v1:${token}`;
}

/**
 * Genera y muestra el QR real del ticket. No tiene texto explicativo propio
 * ni botón de descarga: es un bloque enfocado únicamente en QR — el resto de
 * la presentación y la descarga viven en el componente que lo use (EventTicket).
 */
export default function TicketQrCode({ token, onReady, onError }: TicketQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    toDataURL(buildQrContent(token), { width: 190, margin: 1, color: QR_COLOR })
      .then((url) => {
        if (cancelled) return;
        setDataUrl(url);
        onReady?.(url);
      })
      .catch(() => {
        // No se loguea el error: podría filtrar el texto codificado (que incluye el token).
        if (cancelled) return;
        setFailed(true);
        onError?.();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (failed) {
    return (
      <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-center text-sm text-[#f87171]">
        No pudimos generar el código QR. Tu entrada ya quedó confirmada; podés cerrar esta ventana.
      </p>
    );
  }

  if (!dataUrl) {
    return (
      <div
        role="status"
        aria-label="Generando código QR"
        className="h-[156px] w-[156px] animate-pulse rounded-xl bg-[rgba(170,181,190,.1)]"
      />
    );
  }

  return (
    <div className="rounded-xl bg-[#E8EEF2] p-2.5 shadow-[0_8px_22px_-8px_rgba(0,0,0,.6)]">
      <img src={dataUrl} alt="Código QR de tu entrada" width={156} height={156} className="block h-[156px] w-[156px]" />
    </div>
  );
}
