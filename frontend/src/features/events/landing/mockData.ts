export interface NavLink {
  label: string;
  href: string;
}

export const navLinks: NavLink[] = [
  { label: "Evento", href: "#experience" },
  { label: "Entradas", href: "#tickets" },
  { label: "Experiencia", href: "#experience" },
  { label: "Preguntas", href: "#platform" },
];

export interface MarqueeCard {
  icon: string;
  title: string;
}

export const marqueeRow1: MarqueeCard[] = [
  { icon: "ticket", title: "Entrada General" },
  { icon: "crown", title: "VIP Individual" },
  { icon: "users", title: "VIP Doble" },
  { icon: "qr-code", title: "Acceso QR" },
  { icon: "zap", title: "Confirmación inmediata" },
  { icon: "bell", title: "Recordatorios" },
  { icon: "sparkles", title: "Experiencia VIP" },
];

export const marqueeRow2: MarqueeCard[] = [
  { icon: "user-plus", title: "Registro gratuito" },
  { icon: "smartphone", title: "Entrada digital" },
  { icon: "shield-check", title: "Compra segura" },
  { icon: "gauge", title: "Acceso rápido" },
  { icon: "message-circle", title: "Invitación por WhatsApp" },
  { icon: "mail", title: "Confirmación por email" },
  { icon: "scan-line", title: "Validación en puerta" },
];

export const experienceText =
  "Registrate, recibí tu entrada digital y preparate para una experiencia diseñada para conectar, celebrar y disfrutar desde el primer momento.";

/**
 * Datos del evento demo para mostrar en la entrada descargable. Mockeados
 * (coinciden con los mismos valores ya usados en el ticket del hero) hasta
 * que exista un endpoint real de detalle de evento.
 */
export const eventInfo = {
  name: "Pulse Festival",
  date: "14 · 15 · 16 NOV 2026",
  venue: "Costanera Sur · Buenos Aires",
};

export type PlanVariant = "default" | "gold" | "violet";

export interface TicketPlan {
  id: string;
  name: string;
  kicker: string;
  icon: string;
  price: string;
  priceSuffix?: string;
  variant: PlanVariant;
  featured: boolean;
  perks: string[];
  ctaLabel: string;
}

export const ticketTypes: TicketPlan[] = [
  {
    id: "general",
    name: "General",
    kicker: "Acceso básico",
    icon: "ticket",
    price: "Gratis",
    variant: "default",
    featured: false,
    perks: [
      "Acceso a todo el evento",
      "Entrada digital con QR único",
      "Confirmación por email",
      "Recordatorios automáticos",
    ],
    ctaLabel: "Elegir general",
  },
  {
    id: "vip-individual",
    name: "VIP Individual",
    kicker: "Experiencia premium",
    icon: "crown",
    price: "$35.000",
    priceSuffix: "/ entrada",
    variant: "gold",
    featured: true,
    perks: [
      "Ingreso prioritario",
      "Zona VIP exclusiva",
      "Barra premium incluida",
      "Regalo de bienvenida",
    ],
    ctaLabel: "Elegir VIP",
  },
  {
    id: "vip-doble",
    name: "VIP Doble",
    kicker: "Para compartir",
    icon: "users",
    price: "$60.000",
    priceSuffix: "/ entrada",
    variant: "violet",
    featured: false,
    perks: [
      "Dos accesos VIP",
      "Mesa reservada",
      "Barra premium para dos",
      "Ingreso prioritario",
    ],
    ctaLabel: "Elegir VIP doble",
  },
];

export interface Step {
  num: string;
  icon: string;
  title: string;
  desc: string;
}

export const steps: Step[] = [
  {
    num: "01",
    icon: "user-plus",
    title: "Registrate",
    desc: "Completá tu nombre, email y número de WhatsApp.",
  },
  {
    num: "02",
    icon: "ticket",
    title: "Elegí tu entrada",
    desc: "General, VIP individual o VIP doble. Vos decidís cómo vivirla.",
  },
  {
    num: "03",
    icon: "qr-code",
    title: "Recibí tu QR",
    desc: "Tu entrada digital llega al instante, lista en tu teléfono.",
  },
  {
    num: "04",
    icon: "scan-line",
    title: "Acceso en puerta",
    desc: "Mostrá el QR y entrá sin filas ni papeles.",
  },
];

export interface PlatformFeature {
  icon: string;
  title: string;
  desc: string;
}

export const platformFeatures: PlatformFeature[] = [
  {
    icon: "credit-card",
    title: "Pago seguro",
    desc: "Cobros protegidos y confirmación automática de cada compra.",
  },
  {
    icon: "mail",
    title: "Confirmación por email",
    desc: "Comprobante y entrada enviados apenas se completa el registro.",
  },
  {
    icon: "message-circle",
    title: "Avisos por WhatsApp",
    desc: "Invitaciones y recordatorios directo al teléfono del asistente.",
  },
  {
    icon: "qr-code",
    title: "Entrada digital con QR",
    desc: "Cada pase tiene un código único listo para validar en puerta.",
  },
  {
    icon: "users-round",
    title: "CRM de asistentes",
    desc: "Base de contactos y segmentos para comunicar antes y después.",
  },
  {
    icon: "bar-chart-3",
    title: "Métricas en vivo",
    desc: "Seguí ventas, accesos y aforo en tiempo real durante el evento.",
  },
];

export interface FooterColumn {
  title: string;
  links: string[];
}

export const footerColumns: FooterColumn[] = [
  { title: "Evento", links: ["La experiencia", "Line-up", "Ubicación", "Fechas"] },
  { title: "Entradas", links: ["General", "VIP Individual", "VIP Doble", "Preguntas"] },
  { title: "Ayuda", links: ["Cómo funciona", "Contacto", "Términos", "Privacidad"] },
];
