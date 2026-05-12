import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";

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
const PrivacyPage        = lazy(() => import("./pages/PrivacyPage"));
const TermsPage          = lazy(() => import("./pages/TermsPage"));
const ContactPage        = lazy(() => import("./pages/ContactPage"));

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
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/intake" element={<GuestMatchWizard />} />
            <Route path="/results" element={<LockedPreviewPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/schools" element={<BrowseSchoolsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/contact" element={<ContactPage />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/app" element={<DashboardPage />} />
              <Route path="/app/reports/:reportId" element={<FullReportPage />} />
              <Route path="/app/roadmap" element={<RoadmapPage />} />
              <Route path="/app/visa-interview" element={<VisaInterviewPage />} />
              <Route path="/app/interview-reports/:reportId" element={<InterviewReportDetailPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
