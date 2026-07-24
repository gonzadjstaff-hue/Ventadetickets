import { ArrowRight } from "lucide-react";

import DigitalTicket from "./DigitalTicket";
import { navLinks } from "./mockData";

export default function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] flex-col overflow-x-clip bg-[#0C0C0C]"
    >
      <div className="pulse-hero-blob-green pulse-blob pointer-events-none absolute -left-[8%] -top-[10%] h-[42vw] max-h-[620px] w-[42vw] max-w-[620px] rounded-full" />
      <div className="pulse-hero-blob-violet pulse-blob-reverse pointer-events-none absolute -right-[10%] -bottom-[6%] h-[40vw] max-h-[560px] w-[40vw] max-w-[560px] rounded-full" />

      <nav className="pulse-rise relative z-20 flex items-center justify-between gap-6 px-6 pt-6">
        <a
          href="#top"
          className="text-[clamp(1.4rem,2.4vw,1.9rem)] font-black uppercase tracking-[.14em] text-[#E8EEF2]"
        >
          PULSE
        </a>
        <div className="pulse-nav-links items-center gap-[clamp(20px,2.4vw,40px)]">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="pulse-nav-link text-[clamp(.85rem,1.05vw,1.05rem)] font-medium uppercase tracking-[.08em] text-[#D7E2EA]"
            >
              {link.label}
            </a>
          ))}
        </div>
        <a
          href="#final"
          className="pulse-btn-primary inline-flex items-center gap-2 rounded-full px-[22px] py-3 text-[clamp(.78rem,1vw,.98rem)] font-bold uppercase tracking-[.06em]"
        >
          Reservar entrada
        </a>
      </nav>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-[clamp(24px,5vh,56px)] px-5 pt-[clamp(40px,7vh,90px)]">
        <div className="relative w-full text-center">
          <p
            className="pulse-rise mb-[clamp(14px,2.4vh,26px)] text-[clamp(.7rem,1.1vw,.95rem)] font-semibold uppercase tracking-[.34em] text-[#4ADE80]"
            style={{ animationDelay: ".1s" }}
          >
            Pulse Festival · Edición 2026
          </p>
          <h1
            className="pulse-rise pulse-gradient-text text-[clamp(4.5rem,15vw,15rem)] font-black uppercase leading-[.82] tracking-[-.03em]"
            style={{ animationDelay: ".15s" }}
          >
            VIVÍ EL
            <br />
            MOMENTO
          </h1>
          <p
            className="pulse-rise mt-[clamp(16px,2.6vh,30px)] text-[clamp(1rem,1.8vw,1.4rem)] tracking-[.02em] text-[#AAB5BE]"
            style={{ animationDelay: ".28s" }}
          >
            Una experiencia presencial. Tres formas de vivirla.
          </p>
        </div>

        <DigitalTicket />
      </div>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-6 px-6 pb-[clamp(28px,4vh,44px)] pt-[clamp(24px,4vh,44px)]">
        <p
          className="pulse-rise max-w-[420px] text-[clamp(.9rem,1.3vw,1.08rem)] leading-[1.5] text-[#AAB5BE]"
          style={{ animationDelay: ".45s" }}
        >
          Registro digital, pases VIP y acceso mediante QR en una sola experiencia.
        </p>
        <a
          href="#tickets"
          className="pulse-rise pulse-btn-hero-cta inline-flex items-center gap-2.5 rounded-full px-[34px] py-[18px] text-[clamp(.95rem,1.4vw,1.15rem)] font-extrabold uppercase tracking-[.08em]"
          style={{ animationDelay: ".55s" }}
        >
          Conseguir entrada <ArrowRight size={19} />
        </a>
      </div>
    </section>
  );
}
