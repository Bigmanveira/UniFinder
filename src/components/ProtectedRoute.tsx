import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Send unauthenticated users to the landing page instead of /login.
  // The landing page hosts the Log In / Start CTAs and is what users expect
  // to see after signing out (vs. immediately re-entering credentials).
  return user ? <Outlet /> : <Navigate to="/" replace />;
};
