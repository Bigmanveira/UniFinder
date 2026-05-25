// MaintenanceGate — route wrapper that swaps the rendered route with
// the branded MaintenancePage whenever the kill switch is on AND the
// current user isn't an admin. Admins pass through normally so they
// can keep testing the app during a maintenance window.
//
// Used as a layout route in App.tsx around the routes we want to
// block (the guest matching flow + every authenticated /app route).
// Marketing routes (landing, FAQ, /schools, /privacy, /terms,
// /contact, /waitlist/*) are deliberately NOT wrapped — visitors
// keep their normal experience and can still sign up for the
// waitlist during a maintenance window.

import { Outlet } from "react-router-dom";
import { useMaintenanceMode } from "../hooks/useMaintenanceMode";
import MaintenancePage from "../pages/MaintenancePage";

export const MaintenanceGate = () => {
  const { loading, isMaintenance, isAdmin, message, etaMs } = useMaintenanceMode();
  // Initial flash protection: while the config listener is doing its
  // first round-trip we render nothing rather than briefly showing the
  // app and then snapping to maintenance (or vice-versa). The wrapping
  // <Suspense> fallback already covers this slot.
  if (loading) return null;
  if (isMaintenance && !isAdmin) {
    return <MaintenancePage message={message} etaMs={etaMs} />;
  }
  return <Outlet />;
};
