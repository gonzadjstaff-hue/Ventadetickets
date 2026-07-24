import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useId, useRef, useState } from "react";

interface QrScannerProps {
  /** El padre puede forzar apagar la cámara (ej. mientras hay un request en curso). No la prende solo. */
  enabled: boolean;
  /** Se llama una sola vez por código detectado, con el texto crudo del QR. Nunca se persiste acá. */
  onDecode: (payload: string) => void;
}

/**
 * Lector de cámara sobre html5-qrcode, con inicio/detención manual por
 * botón. No arranca la cámara solo al montarse: además de ser el
 * comportamiento pedido, esto evita a propósito el doble-invocado de efectos
 * de React StrictMode en el montaje (que sí afecta a un efecto que arranca la
 * cámara automáticamente, y puede dejar dos instancias de Html5Qrcode
 * compitiendo por el mismo contenedor). Arrancar por click de usuario ocurre
 * en un render posterior al montaje, así que no le pega ese doble-invocado.
 */
export default function QrScanner({ enabled, onDecode }: QrScannerProps) {
  const containerId = `qr-scanner-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockedRef = useRef(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Se deriva en vez de mantenerse como estado propio sincronizado por
  // efecto: evita un round-trip extra de render y refleja al toque cuando el
  // padre apaga la cámara (enabled=false) aunque cameraOn siga en true.
  const running = cameraOn && enabled;
  const starting = running && !ready && !cameraError;

  useEffect(() => {
    if (!running) return;

    lockedRef.current = false;
    let cancelled = false;

    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    const stopOrphan = () => {
      scanner.stop().catch(() => {}).finally(() => scanner.clear());
    };

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decodedText) => {
          if (lockedRef.current) return;
          lockedRef.current = true;
          scanner.pause(true);
          onDecode(decodedText);
        },
        () => {
          // Fallo de decodificación de un frame individual: es normal mientras
          // la cámara todavía no encuadra un QR, se ignora.
        },
      )
      .then(() => {
        if (cancelled) {
          // El efecto ya se había limpiado (ej. el usuario apretó "detener"
          // o el padre apagó enabled) antes de que start() terminara de
          // resolver. Frenamos esta instancia en vez de dejarla corriendo
          // huérfana sobre un contenedor que ya no le pertenece.
          stopOrphan();
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCameraError("No pudimos acceder a la cámara. Revisá los permisos del navegador o probá la carga manual.");
        setCameraOn(false);
      });

    return () => {
      cancelled = true;
      scannerRef.current = null;
      if (scanner.isScanning) stopOrphan();
    };
  }, [running, containerId, onDecode]);

  const handleToggleCamera = () => {
    if (cameraOn) {
      setCameraOn(false);
      setReady(false);
    } else {
      setCameraError(null);
      setReady(false);
      setCameraOn(true);
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <div id={containerId} className="h-64 w-full overflow-hidden rounded-2xl bg-black" />

      {starting && (
        <p role="status" className="text-sm text-[#AAB5BE]">
          Iniciando cámara…
        </p>
      )}

      {cameraError && (
        <p role="alert" className="rounded-lg bg-[rgba(239,68,68,.12)] px-3 py-2 text-center text-sm text-[#f87171]">
          {cameraError}
        </p>
      )}

      <button
        type="button"
        onClick={handleToggleCamera}
        disabled={!enabled}
        className="rounded-full bg-[rgba(170,181,190,.12)] px-6 py-2.5 text-sm font-bold uppercase tracking-[.06em] text-[#E8EEF2] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? "Detener cámara" : "Iniciar cámara"}
      </button>
    </div>
  );
}
