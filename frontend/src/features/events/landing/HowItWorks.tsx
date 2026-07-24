import { iconMap } from "./icons";
import { steps, type Step } from "./mockData";
import { useRevealRef } from "./useRevealRef";

function StepCard({ step, index }: { step: Step; index: number }) {
  const ref = useRevealRef<HTMLDivElement>((index % 3) * 0.08);
  const Icon = iconMap[step.icon];

  return (
    <div
      ref={ref}
      className="pulse-reveal pulse-step-card flex min-h-[230px] flex-col gap-[18px] rounded-[20px] p-[clamp(24px,2.6vw,34px)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[2.4rem] font-black text-[rgba(74,222,128,.35)]">{step.num}</span>
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-[rgba(74,222,128,.1)] text-[#4ADE80]">
          {Icon ? <Icon size={23} /> : null}
        </div>
      </div>
      <h3 className="text-[1.3rem] font-bold text-[#E8EEF2]">{step.title}</h3>
      <p className="text-[.98rem] leading-[1.5] text-[#AAB5BE]">{step.desc}</p>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="how" className="border-t border-[rgba(170,181,190,.08)] bg-[#0C0C0C] px-6 py-[clamp(60px,10vh,130px)]">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-[clamp(40px,6vh,64px)] flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[clamp(.72rem,1.1vw,.92rem)] font-semibold uppercase tracking-[.3em] text-[#4ADE80]">
              Simple y rápido
            </p>
            <h2 className="pulse-gradient-text mt-3.5 text-[clamp(2.6rem,6vw,5rem)] font-black uppercase leading-[.9] tracking-[-.02em]">
              Cómo funciona
            </h2>
          </div>
          <p className="max-w-[360px] text-[clamp(.95rem,1.3vw,1.1rem)] leading-[1.5] text-[#AAB5BE]">
            De la reserva a la puerta en cuatro pasos. Tu entrada vive en tu teléfono.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-5">
          {steps.map((step, i) => (
            <StepCard key={step.num} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
