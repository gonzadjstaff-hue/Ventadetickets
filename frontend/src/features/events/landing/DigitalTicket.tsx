import { Crown } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { buildQrGrid } from "./buildQrGrid";

export default function DigitalTicket() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const qrCells = useMemo(() => buildQrGrid(17), []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const wrap = wrapRef.current;
      const card = cardRef.current;
      if (!wrap || !card) return;

      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / rect.width;
      const dy = (e.clientY - cy) / rect.height;

      card.style.transform = `rotate(-4deg) rotateY(${dx * 14}deg) rotateX(${-dy * 14}deg) translate(${dx * 10}px, ${dy * 10}px)`;
    };

    const handleLeave = () => {
      const card = cardRef.current;
      if (card) card.style.transform = "rotate(-4deg)";
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="pulse-rise mx-auto w-[min(92vw,440px)]"
      style={{ perspective: "1200px", animationDelay: ".35s" }}
    >
      <div ref={cardRef} className="pulse-ticket-card pulse-float">
        <div className="pulse-ticket-border relative rounded-[26px] p-[1.5px]">
          <div className="pulse-ticket-inner relative overflow-hidden rounded-[25px]">
            <div className="pulse-ticket-glow-green absolute -top-[40%] -left-[30%] h-[80%] w-[80%]" />
            <div className="pulse-ticket-glow-violet absolute -bottom-[30%] -right-[20%] h-[70%] w-[70%]" />

            <div className="relative flex items-start justify-between px-6 pt-6">
              <div>
                <p className="text-[.62rem] font-semibold uppercase tracking-[.22em] text-[#AAB5BE]">
                  Entrada digital
                </p>
                <p className="mt-1.5 text-2xl leading-[1.05] font-extrabold text-[#E8EEF2]">
                  PULSE
                  <br />
                  FESTIVAL
                </p>
              </div>
              <span className="pulse-ticket-vip-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[.66rem] font-extrabold uppercase tracking-[.1em]">
                <Crown size={13} />
                VIP
              </span>
            </div>

            <div className="relative grid grid-cols-[1fr_auto] items-end gap-5 px-6 py-5">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-[.58rem] font-semibold uppercase tracking-[.18em] text-[#7d8790]">Fecha</p>
                  <p className="text-[.98rem] font-semibold text-[#E8EEF2]">14 · 15 · 16 NOV 2026</p>
                </div>
                <div>
                  <p className="text-[.58rem] font-semibold uppercase tracking-[.18em] text-[#7d8790]">Ubicación</p>
                  <p className="text-[.98rem] font-semibold text-[#E8EEF2]">Costanera Sur · Buenos Aires</p>
                </div>
                <div>
                  <p className="text-[.58rem] font-semibold uppercase tracking-[.18em] text-[#7d8790]">Tipo</p>
                  <p className="text-[.98rem] font-bold text-[#4ADE80]">VIP Doble</p>
                </div>
              </div>
              <div className="rounded-xl bg-[#E8EEF2] p-2.5 shadow-[0_8px_22px_-8px_rgba(0,0,0,.6)]">
                <div className="grid h-[118px] w-[118px] grid-cols-[repeat(17,1fr)]">
                  {qrCells.map((cell, i) => (
                    <div key={i} className={cell.filled ? "bg-[#0C0C0C]" : "bg-transparent"} />
                  ))}
                </div>
              </div>
            </div>

            <div className="relative h-0">
              <div className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-[#0C0C0C]" />
              <div className="absolute -right-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-[#0C0C0C]" />
              <div className="mx-3.5 border-t-2 border-dashed border-[rgba(170,181,190,.28)]" />
            </div>

            <div className="relative flex items-center justify-between px-6 pb-5.5 pt-4">
              <p className="text-[.6rem] font-semibold uppercase tracking-[.2em] text-[#7d8790]">Ticket N.º</p>
              <p className="font-mono text-[.9rem] font-semibold tracking-[.14em] text-[#E8EEF2]">PLS-2026-0447</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
