import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { MaintenanceGate } from "./components/MaintenanceGate";
import { AccountStatusGate } from "./components/AccountStatusGate";
import SupportChatWidget from "./components/SupportChatWidget";
import SplashScreen from "./components/SplashScreen";
import StartupSplash from "./components/StartupSplash";
import BrandLogo from "./components/BrandLogo";

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
const AppShell           = lazy(() => import("./components/layout/AppShell"));
const HomeScreen         = lazy(() => import("./pages/app/HomeScreen"));
const DiscoverScreen     = lazy(() => import("./pages/app/DiscoverScreen"));
const MatchesScreen      = lazy(() => import("./pages/app/MatchesScreen"));
const VisaHubScreen      = lazy(() => import("./pages/app/VisaHubScreen"));
const SavedSchoolsPage   = lazy(() => import("./pages/app/SavedSchoolsPage"));
const BillingPage        = lazy(() => import("./pages/app/BillingPage"));
const ProfilePage        = lazy(() => import("./pages/app/ProfilePage"));
const InterviewHistoryPage = lazy(() => import("./pages/app/InterviewHistoryPage"));
const NotFoundPage       = lazy(() => import("./pages/NotFoundPage"));
const FAQPage            = lazy(() => import("./pages/FAQPage"));
const BrowseSchoolsPage  = lazy(() => import("./pages/BrowseSchoolsPage"));
const FullReportPage     = lazy(() => import("./pages/FullReportPage"));
const RoadmapPage        = lazy(() => import("./pages/RoadmapPage"));
const VisaInterviewPage  = lazy(() => import("./pages/VisaInterviewPage"));
const InterviewReportDetailPage = lazy(() => import("./pages/InterviewReportDetailPage"));
const RoadmapOnboardingRedirect = lazy(() => import("./pages/RoadmapOnboardingRedirect"));
const CvStudioPage         = lazy(() => import("./pages/CvStudioPage"));
const CvStudioReviewPage   = lazy(() => import("./pages/CvStudioReviewPage"));
const CvStudioBuildPage    = lazy(() => import("./pages/CvStudioBuildPage"));
const CvStudioConvertPage  = lazy(() => import("./pages/CvStudioConvertPage"));
const CvStudioHistoryPage  = lazy(() => import("./pages/CvStudioHistoryPage"));
const CvDocumentDetailPage = lazy(() => import("./pages/CvDocumentDetailPage"));
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

// Lightweight Suspense fallback for lazy route chunks after startup. The
// full branded splash (StartupSplash) only plays once at cold start; this
// stays minimal so in-app navigations never replay a 1.2s hold.
function PageLoader() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="animate-pulse-slow">
        <BrandLogo size="md" iconOnly asLink={false} />
      </div>
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
    return <SplashScreen />;
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
        <StartupSplash />
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
                <Route element={<AccountStatusGate />}>
                  {/* Persistent app shell: one floating navy pill tab bar on
                      every viewport. The old dashboard tabs are real routes
                      now. Roadmap lives in the shell too (it keeps its own
                      sticky page header). */}
                  <Route element={<AppShell />}>
                    {/* The four Sleek tabs */}
                    <Route path="/app" element={<HomeScreen />} />
                    <Route path="/app/discover" element={<DiscoverScreen />} />
                    <Route path="/app/matches" element={<MatchesScreen />} />
                    <Route path="/app/visa" element={<VisaHubScreen />} />
                    {/* Stack-style pages reachable from the tabs */}
                    <Route path="/app/saved" element={<SavedSchoolsPage />} />
                    <Route path="/app/billing" element={<BillingPage />} />
                    <Route path="/app/profile" element={<ProfilePage />} />
                    <Route path="/app/interviews" element={<InterviewHistoryPage />} />
                    <Route path="/app/roadmap" element={<RoadmapPage />} />
                  </Route>
                  <Route path="/app/reports/:reportId" element={<FullReportPage />} />
                  {/* The diagnostic is a modal on /app/roadmap now. This route
                      is kept so old links, bookmarks and the signup `next=`
                      deep link still open it. */}
                  <Route path="/app/roadmap/onboarding" element={<RoadmapOnboardingRedirect />} />
                  <Route path="/app/visa-interview" element={<VisaInterviewPage />} />
                  <Route path="/app/interview-reports/:reportId" element={<InterviewReportDetailPage />} />
                  <Route path="/app/cv-studio"                    element={<CvStudioPage />} />
                  <Route path="/app/cv-studio/review"             element={<CvStudioReviewPage />} />
                  <Route path="/app/cv-studio/build"              element={<CvStudioBuildPage />} />
                  <Route path="/app/cv-studio/convert"            element={<CvStudioConvertPage />} />
                  <Route path="/app/cv-studio/history"            element={<CvStudioHistoryPage />} />
                  <Route path="/app/cv-studio/document/:documentId" element={<CvDocumentDetailPage />} />
                </Route>
              </Route>
            </Route>

            {/* Catch-all 404 — unknown URLs previously rendered blank. */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        <SupportChatWidget />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
