import { ArrowRight, Crown } from "lucide-react";

export default function FinalCta() {
  return (
    <section id="final" className="relative overflow-hidden bg-[#0C0C0C] px-6 py-[clamp(70px,12vh,150px)]">
      <div className="pulse-final-border mx-auto max-w-[1100px] rounded-[32px] p-[1.5px]">
        <div className="pulse-final-inner relative overflow-hidden rounded-[31px] px-[clamp(28px,5vw,72px)] py-[clamp(44px,7vw,90px)] text-center">
          <div className="pulse-final-glow pointer-events-none absolute -right-[10%] -top-[30%] h-[120%] w-1/2" />
          <p className="relative text-[clamp(.72rem,1.1vw,.92rem)] font-semibold uppercase tracking-[.32em] text-[#4ADE80]">
            Cupos limitados
          </p>
          <h2 className="pulse-gradient-text relative mt-[18px] text-[clamp(3rem,9vw,7.5rem)] font-black uppercase leading-[.86] tracking-[-.03em]">
            TU ENTRADA
            <br />
            TE ESPERA
          </h2>
          <p className="relative mx-auto mt-6 max-w-[520px] text-[clamp(1rem,1.6vw,1.3rem)] leading-[1.5] text-[#AAB5BE]">
            Reservá en menos de un minuto y recibí tu entrada digital al instante.
          </p>
          <div className="relative mt-[clamp(32px,5vh,48px)] flex flex-wrap justify-center gap-4">
            <a
              href="#tickets"
              className="pulse-btn-final-primary inline-flex items-center gap-2.5 rounded-full px-[38px] py-[18px] text-[clamp(.95rem,1.4vw,1.15rem)] font-extrabold uppercase tracking-[.07em]"
            >
              Conseguir entrada <ArrowRight size={19} />
            </a>
            <a
              href="#tickets"
              className="pulse-btn-final-secondary inline-flex items-center gap-2.5 rounded-full px-[34px] py-[18px] text-[clamp(.95rem,1.4vw,1.15rem)] font-extrabold uppercase tracking-[.07em]"
            >
              <Crown size={19} /> Pases VIP
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
