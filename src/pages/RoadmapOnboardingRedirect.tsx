import { Navigate, useSearchParams } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// /app/roadmap/onboarding used to render the six-question diagnostic as its own
// full-screen page. The diagnostic is now a modal on /app/roadmap, so this
// route only forwards to it — preserving `?update=1` so a re-run still lands on
// the safe update path rather than a fresh build.
//
// Kept rather than deleted because the signup flow deep-links here
// (`/signup?next=/app/roadmap/onboarding`), the dashboard links here, and users
// may have bookmarked it.
// ─────────────────────────────────────────────────────────────────────────────
export default function RoadmapOnboardingRedirect() {
  const [params] = useSearchParams();
  const update = params.get("update") === "1" ? "&update=1" : "";
  return <Navigate to={`/app/roadmap?onboarding=1${update}`} replace />;
}
