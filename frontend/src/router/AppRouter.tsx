import { Route, Routes } from "react-router-dom";

import CheckInPage from "../pages/CheckInPage";
import PulseEventLanding from "../pages/PulseEventLanding";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<PulseEventLanding />} />
      {/* MVP sin autenticación, no linkeada desde la navegación pública. Ver CheckInPage. */}
      <Route path="/check-in" element={<CheckInPage />} />
    </Routes>
  );
}
