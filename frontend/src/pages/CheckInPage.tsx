import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client";
import { postCheckIn } from "../api/checkIns";
import { demoEvent } from "../config/demoEvent";
import { eventInfo } from "../features/events/landing/mockData";
import CheckInResultPanel, { type ScanOutcome } from "../features/scanner/CheckInResultPanel";
import ManualQrInput from "../features/scanner/ManualQrInput";
import QrScanner from "../features/scanner/QrScanner";

/**
 * Pantalla MVP de control de acceso: sin autenticación de validadores
 * todavía, no está en la navegación pública y consume un endpoint que puede
 * estar deshabilitado en el backend (ENABLE_MVP_CHECKIN). Provisional hasta
 * que exista auth y selección real de evento — ver backend/src/modules/check-in/.
 */
export default function CheckInPage() {
  useEffect(() => {
    document.title = "Control de acceso — Pulse Event";
  }, []);

  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const pendingRef = useRef(false);

  const handlePayload = useCallback(async (qrPayload: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;

    setPending(true);
    setOutcome(null);

    try {
      const response = await postCheckIn(demoEvent.eventPublicId, qrPayload);
      setOutcome({ kind: response.result, response });
    } catch (error) {
      if (error instanceof ApiError) {
        setOutcome({ kind: "INVALID", message: error.message });
      } else {
        setOutcome({ kind: "NETWORK_ERROR", message: "No pudimos conectar con el servidor. Probá de nuevo." });
      }
    } finally {
      setPending(false);
      pendingRef.current = false;
    }
  }, []);

  const handleScanNext = () => {
    setOutcome(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-[#0C0C0C] px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-black uppercase tracking-[.08em] text-[#E8EEF2]">Control de acceso</h1>
        <p className="mt-1 text-sm text-[#AAB5BE]">{eventInfo.name}</p>
      </div>

      {!outcome && (
        <div className="flex w-full flex-col items-center gap-6">
          <QrScanner enabled={!pending} onDecode={handlePayload} />
          <ManualQrInput onSubmitPayload={handlePayload} disabled={pending} />
        </div>
      )}

      {pending && (
        <p role="status" className="text-sm text-[#AAB5BE]">
          Validando…
        </p>
      )}

      {outcome && (
        <div className="flex w-full flex-col items-center gap-4">
          <CheckInResultPanel outcome={outcome} />
          <button
            type="button"
            onClick={handleScanNext}
            className="rounded-full bg-[#4ADE80] px-8 py-3 text-sm font-bold uppercase tracking-[.06em] text-[#04140A] shadow-[0_10px_30px_-10px_rgba(74,222,128,.65)] outline-none transition-all hover:-translate-y-0.5 hover:bg-[#3FD374] hover:shadow-[0_14px_36px_-10px_rgba(74,222,128,.8)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8EEF2] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
          >
            Escanear siguiente
          </button>
        </div>
      )}
    </div>
  );
}
