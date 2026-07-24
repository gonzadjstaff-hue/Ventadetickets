import { iconMap } from "./icons";
import { marqueeRow1, marqueeRow2, type MarqueeCard } from "./mockData";

function MarqueeTrack({
  cards,
  direction,
  variant,
}: {
  cards: MarqueeCard[];
  direction: "l" | "r";
  variant: "green" | "violet";
}) {
  // Se duplica la fila para que el loop de translateX(-50%) sea continuo, sin salto visible.
  const loopCards = [...cards, ...cards];
  const trackClass = direction === "l" ? "pulse-marquee-track-l" : "pulse-marquee-track-r";
  const borderClass = variant === "green" ? "pulse-marquee-card-green" : "pulse-marquee-card-violet";
  const innerClass =
    variant === "green" ? "pulse-marquee-card-green-inner" : "pulse-marquee-card-violet-inner";
  const iconWrapClass = variant === "green" ? "bg-[rgba(74,222,128,.12)] text-[#4ADE80]" : "bg-[rgba(124,58,237,.14)] text-[#b794ff]";

  return (
    <div className={`flex w-max gap-5 will-change-transform ${trackClass}`}>
      {loopCards.map((card, i) => {
        const Icon = iconMap[card.icon];
        return (
          <div
            key={`${card.title}-${i}`}
            className={`h-[clamp(140px,24vw,180px)] w-[clamp(240px,42vw,320px)] flex-none rounded-[20px] p-px ${borderClass}`}
          >
            <div className={`flex h-full flex-col justify-between rounded-[19px] p-[22px] ${innerClass}`}>
              <div className={`flex h-[46px] w-[46px] items-center justify-center rounded-xl ${iconWrapClass}`}>
                {Icon ? <Icon size={23} /> : null}
              </div>
              <p className="text-[clamp(1.05rem,2vw,1.35rem)] font-bold text-[#E8EEF2]">{card.title}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TicketMarquee() {
  return (
    <section className="relative overflow-hidden border-y border-[rgba(170,181,190,.08)] bg-[#0C0C0C] py-[clamp(40px,7vh,84px)]">
      <div className="mb-5">
        <MarqueeTrack cards={marqueeRow1} direction="l" variant="green" />
      </div>
      <MarqueeTrack cards={marqueeRow2} direction="r" variant="violet" />
    </section>
  );
}
