import type { CheckInResponse } from "../../api/checkIns";

export type ScanOutcome =
  | { kind: "VALID" | "ALREADY_USED"; response: CheckInResponse }
  | { kind: "WRONG_EVENT" | "NOT_PAID" | "CANCELLED"; response: CheckInResponse }
  | { kind: "INVALID"; message: string }
  | { kind: "NETWORK_ERROR"; message: string };

const PANEL_STYLES: Record<"green" | "yellow" | "red", string> = {
  green: "border-[#4ADE80] bg-[rgba(74,222,128,.12)] text-[#4ADE80]",
  yellow: "border-[#F6C453] bg-[rgba(246,196,83,.12)] text-[#F6C453]",
  red: "border-[#f87171] bg-[rgba(239,68,68,.12)] text-[#f87171]",
};

function colorFor(kind: ScanOutcome["kind"]): "green" | "yellow" | "red" {
  if (kind === "VALID") return "green";
  if (kind === "ALREADY_USED") return "yellow";
  return "red";
}

function headlineFor(kind: ScanOutcome["kind"]): string {
  switch (kind) {
    case "VALID":
      return "Acceso permitido";
    case "ALREADY_USED":
      return "Ticket ya utilizado";
    case "WRONG_EVENT":
      return "Evento incorrecto";
    case "NOT_PAID":
      return "Orden no válida";
    case "CANCELLED":
      return "Ticket cancelado";
    case "INVALID":
      return "QR inválido";
    case "NETWORK_ERROR":
      return "Error de conexión";
  }
}

export default function CheckInResultPanel({ outcome }: { outcome: ScanOutcome }) {
  const color = colorFor(outcome.kind);
  const message = "response" in outcome ? outcome.response.message : outcome.message;

  return (
    <div
      role={color === "red" ? "alert" : "status"}
      className={`flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl border-2 px-6 py-8 text-center ${PANEL_STYLES[color]}`}
    >
      <p className="text-2xl font-black uppercase tracking-[.04em]">{headlineFor(outcome.kind)}</p>
      <p className="text-sm text-[#E8EEF2]">{message}</p>

      {(outcome.kind === "VALID" || outcome.kind === "ALREADY_USED") && (
        <div className="mt-2 flex flex-col gap-1 text-sm text-[#E8EEF2]">
          {outcome.response.holderName && <p className="font-bold">{outcome.response.holderName}</p>}
          {outcome.response.ticketType && <p>{outcome.response.ticketType}</p>}
          {outcome.response.ticketPublicId && (
            <p className="font-mono text-xs tracking-[.04em] [overflow-wrap:anywhere]">
              {outcome.response.ticketPublicId}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
