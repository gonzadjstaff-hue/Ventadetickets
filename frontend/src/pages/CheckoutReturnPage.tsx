import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { demoEvent } from "../config/demoEvent";
import { getOrderStatus, type OrderStatus } from "../api/orders";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;
const TERMINAL_STATUSES: OrderStatus[] = ["PAID", "CANCELLED", "EXPIRED"];

type ViewState =
  | { kind: "missing-order" }
  | { kind: "verifying" }
  | { kind: "paid" }
  | { kind: "cancelled" }
  | { kind: "expired" }
  | { kind: "timed-out" }
  | { kind: "error"; message: string };

/**
 * Pantalla de retorno pública tras el checkout de Mercado Pago. Lee
 * únicamente `orderPublicId` de la URL (identificador público, no sensible,
 * el mismo que ya circula por toda la API) — **nunca** lee ni confía en
 * ningún otro query param (`status`, `payment_id`, `collection_status`,
 * etc.) que Mercado Pago pueda agregar a la redirección: la única fuente de
 * verdad sobre el pago es GET /orders/:orderPublicId, nunca la URL de
 * retorno. Ver docs/DECISIONS.md.
 */
export default function CheckoutReturnPage() {
  const [searchParams] = useSearchParams();
  const orderPublicId = searchParams.get("orderPublicId");

  const [state, setState] = useState<ViewState>(() => (orderPublicId ? { kind: "verifying" } : { kind: "missing-order" }));
  const [pollAttempt, setPollAttempt] = useState(0);
  // 0 es solo un valor inicial descartable: el efecto de abajo lo pisa con
  // Date.now() real antes de arrancar a pollear — `Date.now()` es impuro y
  // no puede llamarse directo en el cuerpo del render (regla react-hooks/purity).
  const startedAtRef = useRef(0);

  useEffect(() => {
    document.title = "Verificando pago — Pulse Event";
  }, []);

  useEffect(() => {
    if (!orderPublicId) return;

    let cancelled = false;
    startedAtRef.current = Date.now();

    async function poll() {
      try {
        const data = await getOrderStatus(demoEvent.eventPublicId, orderPublicId!);
        if (cancelled) return;

        if (data.status === "PAID") {
          setState({ kind: "paid" });
        } else if (data.status === "CANCELLED") {
          setState({ kind: "cancelled" });
        } else if (data.status === "EXPIRED") {
          setState({ kind: "expired" });
        } else if (Date.now() - startedAtRef.current >= POLL_TIMEOUT_MS) {
          setState({ kind: "timed-out" });
        } else {
          setState({ kind: "verifying" });
        }

        if (TERMINAL_STATUSES.includes(data.status)) {
          clearInterval(intervalId);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof ApiError ? error.message : "No pudimos conectar con el servidor. Probá de nuevo en un momento.";
        setState({ kind: "error", message });
      }
    }

    // `poll()` recién lee `intervalId` después de su primer `await` (una
    // continuación async, en un microtask posterior) — para entonces esta
    // misma llamada síncrona ya terminó de ejecutarse, así que no hay
    // problema de orden pese a que la declaración de `intervalId` queda
    // textualmente después de `void poll()`.
    void poll();
    const intervalId = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [orderPublicId, pollAttempt]);

  const retry = () => {
    startedAtRef.current = Date.now();
    setState({ kind: "verifying" });
    setPollAttempt((value) => value + 1);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0C0C0C] px-6 py-10 text-center">
      <div className="w-full max-w-md">
        {state.kind === "missing-order" && (
          <StatusBlock
            tone="error"
            headline="No pudimos identificar tu compra"
            message="Falta el identificador de la orden en el enlace. Volvé a la página principal y probá de nuevo desde ahí."
          />
        )}

        {state.kind === "verifying" && (
          <StatusBlock tone="pending" headline="Verificando pago…" message="Estamos confirmando tu pago con Mercado Pago. Esto puede tardar unos segundos." />
        )}

        {state.kind === "paid" && (
          <StatusBlock tone="success" headline="Pago confirmado" message="Enviamos tus entradas por email. Revisá tu bandeja de entrada (y spam) en los próximos minutos." />
        )}

        {state.kind === "cancelled" && (
          <StatusBlock tone="error" headline="Compra cancelada" message="Esta reserva fue cancelada. No se generó ningún ticket." />
        )}

        {state.kind === "expired" && (
          <StatusBlock tone="error" headline="Reserva vencida" message="La reserva venció antes de que se confirmara el pago. Volvé a la página principal para intentar de nuevo." />
        )}

        {state.kind === "timed-out" && (
          <StatusBlock
            tone="pending"
            headline="Todavía estamos confirmando tu pago"
            message="Si ya pagaste, te va a llegar el email con tus entradas en los próximos minutos. Si el problema persiste, escribinos."
          >
            <button
              type="button"
              onClick={retry}
              className="mt-2 rounded-full bg-[#4ADE80] px-8 py-3 text-sm font-bold uppercase tracking-[.06em] text-[#04140A] outline-none transition-colors hover:bg-[#3FD374] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8EEF2]"
            >
              Volver a intentar
            </button>
          </StatusBlock>
        )}

        {state.kind === "error" && (
          <StatusBlock tone="error" headline="No pudimos verificar tu pago" message={state.message}>
            <button
              type="button"
              onClick={retry}
              className="mt-2 rounded-full bg-[#4ADE80] px-8 py-3 text-sm font-bold uppercase tracking-[.06em] text-[#04140A] outline-none transition-colors hover:bg-[#3FD374] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8EEF2]"
            >
              Volver a intentar
            </button>
          </StatusBlock>
        )}
      </div>
    </div>
  );
}

function StatusBlock({
  tone,
  headline,
  message,
  children,
}: {
  tone: "pending" | "success" | "error";
  headline: string;
  message: string;
  children?: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "bg-[rgba(74,222,128,.14)] text-[#4ADE80]"
      : tone === "error"
        ? "bg-[rgba(239,68,68,.14)] text-[#f87171]"
        : "bg-[rgba(246,196,83,.14)] text-[#F6C453]";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold ${toneClass}`}>
        {tone === "success" ? "✓" : tone === "error" ? "!" : "…"}
      </div>
      <h1 role="status" className="text-xl font-bold text-[#E8EEF2]">
        {headline}
      </h1>
      <p className="text-[.95rem] text-[#AAB5BE]">{message}</p>
      {children}
    </div>
  );
}
