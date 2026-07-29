import { useEffect } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../features/auth/useAuth";

interface NavItem {
  label: string;
  /** Ausente = todavía no tiene una pantalla real detrás (placeholder de navegación, ver punto 4/7 de esta etapa). */
  href?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Resumen" },
  { label: "Órdenes" },
  { label: "Tickets" },
  { label: "Asistentes" },
  { label: "Pagos" },
  { label: "Usuarios" },
  { label: "Check-in", href: "/check-in" },
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  VALIDATOR: "Validador",
  USER: "Usuario",
};

function Sidebar() {
  return (
    <nav
      aria-label="Navegación del panel"
      className="hidden w-56 shrink-0 flex-col gap-1 border-r border-white/10 bg-white/[.03] p-4 md:flex"
    >
      {NAV_ITEMS.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            to={item.href}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#AAB5BE] outline-none transition-colors hover:bg-white/5 hover:text-[#E8EEF2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ADE80]"
          >
            {item.label}
          </Link>
        ) : item.label === "Resumen" ? (
          <span
            key={item.label}
            aria-current="page"
            className="rounded-lg bg-[rgba(74,222,128,.14)] px-3 py-2 text-sm font-semibold text-[#4ADE80]"
          >
            {item.label}
          </span>
        ) : (
          <span
            key={item.label}
            className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#5B6570]"
          >
            {item.label}
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em] text-[#5B6570]">
              Próximamente
            </span>
          </span>
        ),
      )}
    </nav>
  );
}

function Header() {
  const { profile, logout } = useAuth();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
      <h1 className="text-lg font-black uppercase tracking-[.06em] text-[#E8EEF2]">Panel de administración</h1>

      {profile && (
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-[#E8EEF2]">{profile.email}</p>
            <p className="text-xs uppercase tracking-[.04em] text-[#AAB5BE]">
              {ROLE_LABEL[profile.role] ?? profile.role}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-[.06em] text-[#E8EEF2] outline-none transition-all hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8EEF2]"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </header>
  );
}

interface SummaryCard {
  label: string;
}

const SUMMARY_CARDS: SummaryCard[] = [
  { label: "Órdenes totales" },
  { label: "Tickets vendidos" },
  { label: "Ingresos totales" },
  { label: "Check-ins registrados" },
];

/**
 * Contenido de "Resumen" — la única sección funcional de esta etapa (ver
 * docs/DECISIONS.md). Nunca inventa cifras: todavía no existe ningún
 * endpoint de métricas del dashboard, así que cada tarjeta lo dice
 * explícitamente en vez de mostrar un número o un mock.
 */
function SummarySection() {
  return (
    <section aria-labelledby="summary-heading" className="p-6">
      <h2 id="summary-heading" className="text-sm font-bold uppercase tracking-[.06em] text-[#AAB5BE]">
        Resumen
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SUMMARY_CARDS.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
            <p className="text-sm text-[#AAB5BE]">{card.label}</p>
            <p className="mt-3 text-sm font-medium text-[#5B6570]">Pendiente de conectar al backend</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Layout inicial de `/admin` (ver docs/ARCHITECTURE.md): sidebar + header +
 * contenido. Protegida por `ProtectedRoute` (solo ADMIN, ver AppRouter.tsx) —
 * esta pantalla asume que ya hay `profile` resuelto, pero igual se maneja el
 * caso defensivo de no tenerlo todavía (misma razón que getMe en el backend:
 * el tipado no puede probar el invariante por sí solo).
 */
export default function AdminDashboardPage() {
  useEffect(() => {
    document.title = "Panel de administración — Pulse Event";
  }, []);

  const { profile, loading, profileLoading } = useAuth();

  if (loading || profileLoading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C0C0C]">
        <p role="status" className="text-sm text-[#AAB5BE]">
          Cargando…
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0C0C0C]">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1">
          <SummarySection />
        </main>
      </div>
    </div>
  );
}
