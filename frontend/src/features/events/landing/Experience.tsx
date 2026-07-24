import { ArrowDown, QrCode, Star, Ticket, Wine } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { experienceText } from "./mockData";

export default function Experience() {
  const textRef = useRef<HTMLParagraphElement | null>(null);

  const words = useMemo(() => {
    let idx = 0;
    return experienceText.split(" ").map((word) => word.split("").map((ch) => ({ ch, i: idx++ })));
  }, []);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const chars = entry.target.querySelectorAll<HTMLElement>("[data-char]");
            chars.forEach((c, i) => {
              setTimeout(() => c.classList.add("pulse-exp-char-visible"), i * 16);
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.35 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="experience"
      className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-[#0C0C0C] px-5 py-[clamp(60px,10vh,130px)] text-center"
    >
      <div className="pulse-exp-decor-qr pulse-float absolute left-[7%] top-[12%] flex h-[74px] w-[74px] items-center justify-center rounded-2xl">
        <QrCode size={34} />
      </div>
      <div className="pulse-exp-decor-star pulse-float absolute right-[9%] top-[20%] flex h-16 w-16 items-center justify-center rounded-full [animation-direction:reverse]">
        <Star size={30} />
      </div>
      <div className="pulse-exp-decor-ticket pulse-float absolute bottom-[16%] left-[11%] flex h-[60px] w-[60px] items-center justify-center rounded-[14px]">
        <Ticket size={30} />
      </div>
      <div className="pulse-exp-decor-wine pulse-float absolute bottom-[22%] right-[8%] flex h-14 w-14 items-center justify-center rounded-full [animation-direction:reverse]">
        <Wine size={26} />
      </div>
      <div className="pulse-exp-glow-green pulse-glow pointer-events-none absolute left-[3%] top-[44%] h-[180px] w-[180px] rounded-full" />
      <div className="pulse-exp-glow-violet pulse-glow pointer-events-none absolute right-[2%] top-[38%] h-[200px] w-[200px] rounded-full" />

      <h2 className="pulse-gradient-text relative text-[clamp(3.4rem,11vw,11rem)] font-black uppercase leading-[.84] tracking-[-.03em]">
        UNA NOCHE
        <br />
        PARA RECORDAR
      </h2>

      <p
        ref={textRef}
        className="relative mt-[clamp(24px,4vh,44px)] flex max-w-[820px] flex-wrap justify-center gap-y-0 gap-x-[.32em] text-[clamp(1.05rem,2vw,1.6rem)] leading-[1.55] text-[#AAB5BE]"
      >
        {words.map((word, wi) => (
          <span key={wi} className="inline-flex">
            {word.map(({ ch, i }) => (
              <span key={i} data-char="" className="pulse-exp-char">
                {ch}
              </span>
            ))}
          </span>
        ))}
      </p>

      <a
        href="#tickets"
        className="pulse-btn-outline relative mt-[clamp(32px,5vh,56px)] inline-flex items-center gap-2.5 rounded-full px-8 py-4 text-[clamp(.9rem,1.3vw,1.1rem)] font-bold uppercase tracking-[.08em] text-[#E8EEF2]"
      >
        Ver tipos de entrada <ArrowDown size={18} />
      </a>
    </section>
  );
}
