import { iconMap } from "./icons";
import { platformFeatures, type PlatformFeature } from "./mockData";
import { useRevealRef } from "./useRevealRef";

function FeatureCard({ feature, index }: { feature: PlatformFeature; index: number }) {
  const ref = useRevealRef<HTMLDivElement>((index % 3) * 0.08);
  const Icon = iconMap[feature.icon];

  return (
    <div ref={ref} className="pulse-reveal pulse-feature-card flex flex-col gap-3.5 rounded-[18px] p-[26px] text-left">
      <div className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-[rgba(124,58,237,.14)] text-[#b794ff]">
        {Icon ? <Icon size={22} /> : null}
      </div>
      <h3 className="text-[1.18rem] font-bold text-[#E8EEF2]">{feature.title}</h3>
      <p className="text-[.94rem] leading-[1.5] text-[#AAB5BE]">{feature.desc}</p>
    </div>
  );
}

export default function Platform() {
  return (
    <section id="platform" className="relative overflow-hidden bg-[#0C0C0C] px-6 py-[clamp(60px,10vh,130px)]">
      <div className="pulse-platform-glow pointer-events-none absolute left-1/2 top-1/2 h-[min(90vw,900px)] w-[min(90vw,900px)] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="relative mx-auto max-w-[1100px] text-center">
        <p className="text-[clamp(.72rem,1.1vw,.92rem)] font-semibold uppercase tracking-[.3em] text-[#b794ff]">
          Tecnología detrás
        </p>
        <h2 className="pulse-gradient-text mt-4 text-[clamp(2.6rem,6vw,5rem)] font-black uppercase leading-[.9] tracking-[-.02em]">
          Una plataforma,
          <br />
          todo el evento
        </h2>
        <p className="mx-auto mt-[22px] max-w-[620px] text-[clamp(1rem,1.5vw,1.25rem)] leading-[1.55] text-[#AAB5BE]">
          Pagos, confirmaciones, recordatorios y validación en puerta funcionando en conjunto para que la
          experiencia sea impecable.
        </p>
        <div className="mt-[clamp(40px,6vh,64px)] grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[18px]">
          {platformFeatures.map((feature, i) => (
            <FeatureCard key={feature.title} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
