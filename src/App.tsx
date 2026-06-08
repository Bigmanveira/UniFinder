import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { MaintenanceGate } from "./components/MaintenanceGate";

// Landing is eager so the very first paint doesn't wait on an extra
// round-trip — it's by far the most common entry point and we don't want
// a Suspense flash for visitors who never click anywhere.
import LandingPage from "./pages/LandingPage";

// Every other route is code-split. Each becomes its own chunk that only
// loads when the user navigates to that path. Cuts the landing-page JS
// from ~980 KB to roughly the size of LandingPage + framework — material
// on slow mobile networks.
const GuestMatchWizard   = lazy(() => import("./pages/GuestMatchWizard"));
const LockedPreviewPage  = lazy(() => import("./pages/LockedPreviewPage"));
const LoginPage          = lazy(() => import("./pages/LoginPage"));
const SignupPage         = lazy(() => import("./pages/SignupPage"));
const DashboardPage      = lazy(() => import("./pages/DashboardPage"));
const FAQPage            = lazy(() => import("./pages/FAQPage"));
const BrowseSchoolsPage  = lazy(() => import("./pages/BrowseSchoolsPage"));
const FullReportPage     = lazy(() => import("./pages/FullReportPage"));
const RoadmapPage        = lazy(() => import("./pages/RoadmapPage"));
const VisaInterviewPage  = lazy(() => import("./pages/VisaInterviewPage"));
const InterviewReportDetailPage = lazy(() => import("./pages/InterviewReportDetailPage"));
const CvStudioPage        = lazy(() => import("./pages/CvStudioPage"));
const CvStudioReviewPage  = lazy(() => import("./pages/CvStudioReviewPage"));
const CvStudioBuildPage   = lazy(() => import("./pages/CvStudioBuildPage"));
const CvStudioConvertPage = lazy(() => import("./pages/CvStudioConvertPage"));
const PrivacyPage        = lazy(() => import("./pages/PrivacyPage"));
const TermsPage          = lazy(() => import("./pages/TermsPage"));
const ContactPage        = lazy(() => import("./pages/ContactPage"));
const PricingPage        = lazy(() => import("./pages/PricingPage"));
const WaitlistPage       = lazy(() => import("./pages/WaitlistPage"));

// Set VITE_WAITLIST_MODE=true in Vercel to gate the public site behind the
// waitlist. Anyone hitting "/" while signed out sees WaitlistPage instead of
// LandingPage. Signed-in users still get the full app, and /login + /signup
// remain reachable so the founder + early testers can authenticate normally.
// Flip to false (or remove the env var) to go public.
const WAITLIST_MODE = import.meta.env.VITE_WAITLIST_MODE === "true";

function PageLoader() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <Loader2 size={20} className="text-slate-400 animate-spin" />
    </div>
  );
}

// React Router doesn't restore scroll position on navigation, so a fresh
// route would open mid-page if the previous one was scrolled. This sits
// inside <BrowserRouter> and snaps to the top on every pathname change.
// Skipped when a `#hash` is in the URL — those anchors target a specific
// section on the destination page, so we honour them. `instant` keeps the
// snap imperceptible; users on slow devices won't see a smooth-scroll lag.
// Decides what shows at "/" depending on the waitlist flag and auth state.
//   - WAITLIST_MODE off  → always LandingPage (current public behaviour).
//   - WAITLIST_MODE on   → signed-in users still see LandingPage (they can
//     navigate into /app themselves), signed-out users see WaitlistPage.
// Auth still loading? Show a minimal loader so we don't flash the waitlist
// at users who are about to be recognised as logged-in.
function HomeGate() {
  const { user, loading } = useAuth();
  if (!WAITLIST_MODE) return <LandingPage />;
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 size={20} className="text-slate-400 animate-spin" />
      </div>
    );
  }
  return user ? <LandingPage /> : <WaitlistPage />;
}

function ScrollToTopOnNavigation() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTopOnNavigation />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes that ALWAYS stay live — marketing + legal
                + auth surfaces never go into maintenance mode so the
                waitlist keeps growing and admins can still sign in
                during a downtime window. */}
            <Route path="/" element={<HomeGate />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/schools" element={<BrowseSchoolsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/pricing" element={<PricingPage />} />

            {/* Legacy waitlist paths — redirect to their live-mode
                equivalents so any bookmarked or emailed link still
                lands somewhere sensible. /support has no main-app
                twin, so it folds into /contact. */}
            <Route path="/waitlist/privacy" element={<Navigate to="/privacy" replace />} />
            <Route path="/waitlist/terms"   element={<Navigate to="/terms"   replace />} />
            <Route path="/waitlist/support" element={<Navigate to="/contact" replace />} />
            <Route path="/waitlist/faq"     element={<Navigate to="/faq"     replace />} />

            {/* Gated routes — show MaintenancePage when the kill
                switch is on (unless the user carries the admin
                claim). The guest matching flow + every authenticated
                /app route lives behind this gate because each one
                depends on Cloud Functions that themselves enforce
                the same flag server-side. */}
            <Route element={<MaintenanceGate />}>
              <Route path="/intake" element={<GuestMatchWizard />} />
              <Route path="/results" element={<LockedPreviewPage />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<DashboardPage />} />
                <Route path="/app/reports/:reportId" element={<FullReportPage />} />
                <Route path="/app/roadmap" element={<RoadmapPage />} />
                <Route path="/app/visa-interview" element={<VisaInterviewPage />} />
                <Route path="/app/interview-reports/:reportId" element={<InterviewReportDetailPage />} />
                <Route path="/app/cv-studio"          element={<CvStudioPage />} />
                <Route path="/app/cv-studio/review"   element={<CvStudioReviewPage />} />
                <Route path="/app/cv-studio/build"    element={<CvStudioBuildPage />} />
                <Route path="/app/cv-studio/convert"  element={<CvStudioConvertPage />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
