import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client";
import { postCheckIn } from "../api/checkIns";
import { demoEvent } from "../config/demoEvent";
import { useAuth } from "../features/auth/useAuth";
import { eventInfo } from "../features/events/landing/mockData";
import CheckInResultPanel, { type ScanOutcome } from "../features/scanner/CheckInResultPanel";
import ManualQrInput from "../features/scanner/ManualQrInput";
import QrScanner from "../features/scanner/QrScanner";

/**
 * Pantalla de control de acceso: protegida por rol (ADMIN/VALIDATOR) vía
 * ProtectedRoute en el router, y por requireAuth/requireRole en el backend.
 * El token de Firebase se obtiene en el momento de cada check-in (no se
 * cachea) y nunca se persiste. Consume un endpoint que puede estar
 * deshabilitado en el backend (ENABLE_MVP_CHECKIN). Sigue pendiente la
 * selección real de evento — ver backend/src/modules/check-in/.
 */
export default function CheckInPage() {
  useEffect(() => {
    document.title = "Control de acceso — Pulse Event";
  }, []);

  const { getIdToken } = useAuth();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  /**
   * Caso defensivo (no debería ocurrir detrás de ProtectedRoute): getIdToken()
   * devuelve null. Se maneja aparte de `outcome`/CheckInResultPanel porque
   * ese componente no tiene un `kind` de sesión — reusar NETWORK_ERROR
   * mostraría el título fijo "Error de conexión", un mensaje engañoso para
   * lo que en realidad es una sesión ausente o vencida.
   */
  const [sessionError, setSessionError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const handlePayload = useCallback(
    async (qrPayload: string) => {
      if (pendingRef.current) return;
      pendingRef.current = true;

      setPending(true);
      setOutcome(null);
      setSessionError(null);

      try {
        // Se pide en el momento de cada check-in (no se reutiliza uno viejo) para evitar mandar un token vencido.
        const idToken = await getIdToken();
        if (!idToken) {
          setSessionError("Tu sesión no está disponible o expiró. Volvé a iniciar sesión para continuar.");
          return;
        }

        const response = await postCheckIn(demoEvent.eventPublicId, qrPayload, idToken);
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
    },
    [getIdToken],
  );

  const handleScanNext = () => {
    setOutcome(null);
    setSessionError(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-[#0C0C0C] px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-black uppercase tracking-[.08em] text-[#E8EEF2]">Control de acceso</h1>
        <p className="mt-1 text-sm text-[#AAB5BE]">{eventInfo.name}</p>
      </div>

      {!outcome && !sessionError && (
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

      {sessionError && (
        <div className="flex w-full flex-col items-center gap-4">
          <div
            role="alert"
            className="flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl border-2 border-[#f87171] bg-[rgba(239,68,68,.12)] px-6 py-8 text-center text-[#f87171]"
          >
            <p className="text-2xl font-black uppercase tracking-[.04em]">Sesión no disponible</p>
            <p className="text-sm text-[#E8EEF2]">{sessionError}</p>
          </div>
          <button
            type="button"
            onClick={handleScanNext}
            className="rounded-full bg-[#4ADE80] px-8 py-3 text-sm font-bold uppercase tracking-[.06em] text-[#04140A] shadow-[0_10px_30px_-10px_rgba(74,222,128,.65)] outline-none transition-all hover:-translate-y-0.5 hover:bg-[#3FD374] hover:shadow-[0_14px_36px_-10px_rgba(74,222,128,.8)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8EEF2]"
          >
            Reintentar
          </button>
        </div>
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
