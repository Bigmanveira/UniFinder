import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import SplashScreen from "./SplashScreen";

// ─────────────────────────────────────────────────────────────────────────────
// Wraps protected /app routes. If the user is signed-out, we bounce them to
// /login but preserve the path they were trying to reach via a `?next=…`
// query param. LoginPage and SignupPage honour that param after a successful
// sign-in so the user lands where they intended — instead of being dumped on
// the dashboard or the landing page.
// ─────────────────────────────────────────────────────────────────────────────
export const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // The branded splash — matches the StartupSplash overlay so nothing
    // unbranded flashes underneath it during the initial auth resolution.
    return <SplashScreen />;
  }

  if (!user) {
    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    // Don't bother round-tripping "/" — that's just the landing page and
    // adding it as a redirect target is noise.
    const search = nextPath && nextPath !== "/"
      ? `?next=${encodeURIComponent(nextPath)}`
      : "";
    return <Navigate to={`/login${search}`} replace />;
  }

  return <Outlet />;
};
