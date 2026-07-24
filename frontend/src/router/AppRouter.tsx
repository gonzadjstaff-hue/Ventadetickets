import { Route, Routes } from "react-router-dom";

import PulseEventLanding from "../pages/PulseEventLanding";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<PulseEventLanding />} />
    </Routes>
  );
}
