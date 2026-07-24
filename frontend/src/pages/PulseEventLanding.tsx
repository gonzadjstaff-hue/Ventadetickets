import { useEffect } from "react";

import Experience from "../features/events/landing/Experience";
import FinalCta from "../features/events/landing/FinalCta";
import Footer from "../features/events/landing/Footer";
import Hero from "../features/events/landing/Hero";
import HowItWorks from "../features/events/landing/HowItWorks";
import "../features/events/landing/pulse-landing.css";
import Platform from "../features/events/landing/Platform";
import TicketMarquee from "../features/events/landing/TicketMarquee";
import TicketTypes from "../features/events/landing/TicketTypes";

export default function PulseEventLanding() {
  useEffect(() => {
    document.title = "Pulse Event — Entradas";
  }, []);

  return (
    <div className="pulse-landing">
      <Hero />
      <TicketMarquee />
      <Experience />
      <TicketTypes />
      <HowItWorks />
      <Platform />
      <FinalCta />
      <Footer />
    </div>
  );
}
