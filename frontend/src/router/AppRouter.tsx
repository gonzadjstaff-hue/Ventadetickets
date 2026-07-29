import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import ProtectedRoute from "../features/auth/ProtectedRoute";
import CheckoutReturnPage from "../pages/CheckoutReturnPage";
import PulseEventLanding from "../pages/PulseEventLanding";

// Carga diferida: /check-in arrastra html5-qrcode (lector de cámara), la
// dependencia más pesada del bundle. La landing pública (ruta "/", la que
// realmente importa para el visitante común) no tiene motivo para pagar ese
// peso si nunca visita el check-in. Ver docs/DECISIONS.md.
const CheckInPage = lazy(() => import("../pages/CheckInPage"));

// Etapa 3 de autenticación (ver docs/DECISIONS.md): pantalla técnica/temporal
// para validar login de Firebase + POST /api/auth/session, no linkeada desde
// la navegación pública, no protege ninguna ruta existente. Distinta de
// /staff/login (login real).
const AuthDebugPage = lazy(() => import("../pages/AuthDebugPage"));

// Login real de staff (ADMIN/VALIDATOR) y panel administrativo — cargados
// diferidos por el mismo motivo que arriba: la landing pública no debe pagar
// el peso de Firebase ni del dashboard si nunca los visita.
const StaffLoginPage = lazy(() => import("../pages/StaffLoginPage"));
const AdminDashboardPage = lazy(() => import("../pages/AdminDashboardPage"));

function PageLoadingFallback() {
  return <div className="flex min-h-screen items-center justify-center bg-[#0C0C0C]" />;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<PulseEventLanding />} />
      {/* Pública: destino de las back_urls de Checkout Pro. Sin dependencias pesadas, no se carga diferida. Ver CheckoutReturnPage. */}
      <Route path="/checkout/return" element={<CheckoutReturnPage />} />

      {/* Login real de staff — no linkeada desde la navegación pública de compradores/asistentes. */}
      <Route
        path="/staff/login"
        element={
          <Suspense fallback={<PageLoadingFallback />}>
            <StaffLoginPage />
          </Suspense>
        }
      />

      {/* Protegida: solo ADMIN. Ver ProtectedRoute y docs/ARCHITECTURE.md. */}
      <Route
        path="/admin"
        element={
          <Suspense fallback={<PageLoadingFallback />}>
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <AdminDashboardPage />
            </ProtectedRoute>
          </Suspense>
        }
      />

      {/* Protegida: ADMIN y VALIDATOR. No linkeada desde la navegación pública. Ver CheckInPage. */}
      <Route
        path="/check-in"
        element={
          <Suspense fallback={<PageLoadingFallback />}>
            <ProtectedRoute allowedRoles={["ADMIN", "VALIDATOR"]}>
              <CheckInPage />
            </ProtectedRoute>
          </Suspense>
        }
      />

      {/* Técnica/temporal, no linkeada desde la navegación pública. Ver AuthDebugPage. */}
      <Route
        path="/auth-debug"
        element={
          <Suspense fallback={<PageLoadingFallback />}>
            <AuthDebugPage />
          </Suspense>
        }
      />
    </Routes>
  );
}
