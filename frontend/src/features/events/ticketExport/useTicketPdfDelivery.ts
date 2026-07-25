import { useCallback, useEffect, useRef, useState } from "react";

import type { TicketCapture } from "../landing/EventTicket";
import { triggerBlobDownload } from "./downloadBlob";
import { shareFile } from "./share";
import { buildTicketsPdf } from "./ticketPdf";

export type DeliveryStatus = "idle" | "preparing";

export interface UseTicketPdfDeliveryParams {
  /** Pide la captura de cada ticket a mostrar en el PDF, en el orden en que deben quedar las páginas. */
  getCaptures: () => Promise<TicketCapture[]>;
  fileName: string;
  shareTitle: string;
  /** Se llama una vez, tras una descarga o un share exitosos — nunca ante un share cancelado por el usuario. */
  onDelivered?: () => void;
}

export interface UseTicketPdfDeliveryResult {
  status: DeliveryStatus;
  error: string | null;
  download: () => void;
  share: () => void;
}

/**
 * Única pieza de lógica para "armar el PDF de uno o más tickets y
 * descargarlo o compartirlo", reutilizada por General, VIP Individual y VIP
 * Doble — evita tres implementaciones separadas (ver docs/DECISIONS.md).
 * No cachea el PDF entre descarga y share: se re-arma en cada acción,
 * intencionalmente simple para este alcance (los tickets ya están en
 * memoria, rearmar el PDF es barato).
 */
export function useTicketPdfDelivery(params: UseTicketPdfDeliveryParams): UseTicketPdfDeliveryResult {
  const [status, setStatus] = useState<DeliveryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const paramsRef = useRef(params);
  // Sincronizado en un efecto (no durante el render): `run` siempre debe leer
  // los props/callbacks más recientes sin quedar en la dependencia de
  // `useCallback`, pero escribir un ref en el cuerpo del render es inseguro.
  useEffect(() => {
    paramsRef.current = params;
  });

  const run = useCallback(async (kind: "download" | "share") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("preparing");
    setError(null);

    try {
      const captures = await paramsRef.current.getCaptures();
      const blob = await buildTicketsPdf(captures);

      if (kind === "download") {
        triggerBlobDownload(blob, paramsRef.current.fileName);
        paramsRef.current.onDelivered?.();
        return;
      }

      const file = new File([blob], paramsRef.current.fileName, { type: "application/pdf" });
      const outcome = await shareFile(file, paramsRef.current.shareTitle);

      if (outcome === "shared") {
        paramsRef.current.onDelivered?.();
      } else if (outcome === "failed") {
        setError("No pudimos compartir tu entrada. Podés descargarla en su lugar.");
      }
      // "cancelled" (el usuario cerró el selector nativo) y "unsupported"
      // no son errores: se queda en idle sin mensaje.
    } catch {
      // No se loguea: podría filtrar detalles internos del fallo.
      setError(
        kind === "download"
          ? "No pudimos preparar tu entrada para descargar. Tus tickets siguen disponibles acá arriba — probá de nuevo."
          : "No pudimos preparar tu entrada para compartir. Tus tickets siguen disponibles acá arriba — probá de nuevo.",
      );
    } finally {
      setStatus("idle");
      busyRef.current = false;
    }
  }, []);

  return {
    status,
    error,
    download: () => void run("download"),
    share: () => void run("share"),
  };
}
