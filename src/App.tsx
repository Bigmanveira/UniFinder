import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";

import LandingPage from "./pages/LandingPage";
import GuestMatchWizard from "./pages/GuestMatchWizard";
import LockedPreviewPage from "./pages/LockedPreviewPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DashboardPage from "./pages/DashboardPage";
import FAQPage from "./pages/FAQPage";
import BrowseSchoolsPage from "./pages/BrowseSchoolsPage";
import FullReportPage from "./pages/FullReportPage";
import RoadmapPage from "./pages/RoadmapPage";
import VisaInterviewPage from "./pages/VisaInterviewPage";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/intake" element={<GuestMatchWizard />} />
          <Route path="/results" element={<LockedPreviewPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/schools" element={<BrowseSchoolsPage />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<DashboardPage />} />
            <Route path="/app/reports/:reportId" element={<FullReportPage />} />
            <Route path="/app/roadmap" element={<RoadmapPage />} />
            <Route path="/app/visa-interview" element={<VisaInterviewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
