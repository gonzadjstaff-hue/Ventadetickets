import { useEffect, useRef } from "react";

/**
 * Agrega la clase "pulse-reveal-visible" al elemento cuando entra en viewport,
 * una sola vez. Pensado para usarse junto a la clase CSS "pulse-reveal".
 */
export function useRevealRef<T extends HTMLElement>(delaySeconds = 0) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.transitionDelay = `${delaySeconds}s`;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("pulse-reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delaySeconds]);

  return ref;
}
