import { Check } from "lucide-react";
import { useState } from "react";

import GeneralRegistrationModal from "./GeneralRegistrationModal";
import { iconMap } from "./icons";
import { ticketTypes, type PlanVariant, type TicketPlan } from "./mockData";
import { useRevealRef } from "./useRevealRef";

const variantClasses: Record<
  PlanVariant,
  { border: string; bg: string; iconWrap: string; kicker: string; price: string; cta: string }
> = {
  default: {
    border: "pulse-plan-border-default",
    bg: "pulse-plan-bg-default",
    iconWrap: "bg-[rgba(74,222,128,.1)] text-[#4ADE80]",
    kicker: "text-[#4ADE80]",
    price: "text-[#E8EEF2]",
    cta: "bg-[rgba(74,222,128,.1)] text-[#4ADE80]",
  },
  gold: {
    border: "pulse-plan-border-gold p-[1.5px]",
    bg: "pulse-plan-bg-gold",
    iconWrap: "bg-[rgba(246,196,83,.14)] text-[#F6C453]",
    kicker: "text-[#F6C453]",
    price: "text-[#F6C453]",
    cta: "pulse-plan-cta-gold",
  },
  violet: {
    border: "pulse-plan-border-violet",
    bg: "pulse-plan-bg-violet",
    iconWrap: "bg-[rgba(124,58,237,.16)] text-[#b794ff]",
    kicker: "text-[#b794ff]",
    price: "text-[#E8EEF2]",
    cta: "pulse-plan-cta-violet",
  },
};

function TicketPlanCard({
  plan,
  index,
  onSelectGeneral,
}: {
  plan: TicketPlan;
  index: number;
  onSelectGeneral: () => void;
}) {
  const ref = useRevealRef<HTMLDivElement>((index % 3) * 0.08);
  const styles = variantClasses[plan.variant];
  const Icon = iconMap[plan.icon];
  const isGeneral = plan.id === "general";

  return (
    <div
      ref={ref}
      className={`pulse-reveal relative rounded-[24px] p-px ${styles.border}`}
    >
      <div className={`relative flex h-full flex-col gap-5 overflow-hidden rounded-[23px] p-[clamp(26px,3vw,38px)] ${styles.bg}`}>
        {plan.featured && (
          <span className="pulse-plan-featured-badge absolute right-5 top-5 rounded-full px-3 py-1.5 text-[.62rem] font-extrabold uppercase tracking-[.12em]">
            Más elegida
          </span>
        )}
        <div className={`flex h-[52px] w-[52px] items-center justify-center rounded-[14px] ${styles.iconWrap}`}>
          {Icon ? <Icon size={26} /> : null}
        </div>
        <div>
          <p className={`text-[.72rem] font-semibold uppercase tracking-[.14em] ${styles.kicker}`}>{plan.kicker}</p>
          <h3 className="mt-1 text-[clamp(1.7rem,3vw,2.3rem)] font-extrabold text-[#E8EEF2]">{plan.name}</h3>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[clamp(2rem,4vw,2.8rem)] font-black ${styles.price}`}>{plan.price}</span>
          {plan.priceSuffix && <span className="text-[.9rem] text-[#AAB5BE]">{plan.priceSuffix}</span>}
        </div>
        <ul className="mt-1 flex flex-1 flex-col gap-3">
          {plan.perks.map((perk) => (
            <li key={perk} className="flex items-center gap-2.5 text-[.98rem] text-[#D7E2EA]">
              <Check size={17} className="flex-none text-[#4ADE80]" />
              {perk}
            </li>
          ))}
        </ul>
        {isGeneral ? (
          <button
            type="button"
            onClick={onSelectGeneral}
            className={`pulse-ticket-cta mt-auto rounded-full py-[15px] text-center text-[.95rem] font-extrabold uppercase tracking-[.06em] ${styles.cta}`}
          >
            {plan.ctaLabel}
          </button>
        ) : (
          <a
            href="#final"
            className={`pulse-ticket-cta mt-auto rounded-full py-[15px] text-center text-[.95rem] font-extrabold uppercase tracking-[.06em] ${styles.cta}`}
          >
            {plan.ctaLabel}
          </a>
        )}
      </div>
    </div>
  );
}

export default function TicketTypes() {
  const [isGeneralModalOpen, setGeneralModalOpen] = useState(false);
  // Cambia en cada apertura para forzar un remount del modal (formulario y
  // resultado limpios), en vez de resetear estado manualmente en un efecto.
  const [generalModalInstance, setGeneralModalInstance] = useState(0);

  const openGeneralModal = () => {
    setGeneralModalInstance((instance) => instance + 1);
    setGeneralModalOpen(true);
  };

  return (
    <section id="tickets" className="relative bg-[#0C0C0C] px-6 py-[clamp(60px,10vh,130px)]">
      <div className="mx-auto max-w-[1200px]">
        <p className="text-center text-[clamp(.72rem,1.1vw,.92rem)] font-semibold uppercase tracking-[.3em] text-[#4ADE80]">
          Elegí cómo vivirla
        </p>
        <h2 className="pulse-gradient-text mt-4 text-center text-[clamp(2.6rem,6vw,5rem)] font-black uppercase leading-[.9] tracking-[-.02em]">
          Tres formas
          <br />
          de entrar
        </h2>
        <div className="mt-[clamp(40px,6vh,72px)] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-stretch gap-6">
          {ticketTypes.map((plan, i) => (
            <TicketPlanCard key={plan.id} plan={plan} index={i} onSelectGeneral={openGeneralModal} />
          ))}
        </div>
      </div>

      <GeneralRegistrationModal
        key={generalModalInstance}
        open={isGeneralModalOpen}
        onClose={() => setGeneralModalOpen(false)}
      />
    </section>
  );
}
