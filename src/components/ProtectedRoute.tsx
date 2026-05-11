import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin"></div>
      </div>
    );
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
