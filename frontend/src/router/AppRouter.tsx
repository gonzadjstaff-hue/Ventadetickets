import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import CheckoutReturnPage from "../pages/CheckoutReturnPage";
import PulseEventLanding from "../pages/PulseEventLanding";

// Carga diferida: /check-in arrastra html5-qrcode (lector de cámara), la
// dependencia más pesada del bundle. La landing pública (ruta "/", la que
// realmente importa para el visitante común) no tiene motivo para pagar ese
// peso si nunca visita el check-in. Ver docs/DECISIONS.md.
const CheckInPage = lazy(() => import("../pages/CheckInPage"));

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<PulseEventLanding />} />
      {/* Pública: destino de las back_urls de Checkout Pro. Sin dependencias pesadas, no se carga diferida. Ver CheckoutReturnPage. */}
      <Route path="/checkout/return" element={<CheckoutReturnPage />} />
      {/* MVP sin autenticación, no linkeada desde la navegación pública. Ver CheckInPage. */}
      <Route
        path="/check-in"
        element={
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0C0C0C]" />}>
            <CheckInPage />
          </Suspense>
        }
      />
    </Routes>
  );
}
