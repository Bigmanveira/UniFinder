// ─────────────────────────────────────────────────────────────────────────────
// CvStudioFooter — shared footer that lives at the bottom of every CV
// Studio page. Mirrors the PricingPage / LandingPage footer treatment so
// the studio doesn't feel like an island.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";
import BrandLogo from "../BrandLogo";

export default function CvStudioFooter() {
  return (
    <footer className="bg-white py-12 border-t border-slate-100 mt-16">
      <div className="max-w-6xl mx-auto px-6 flex flex-col gap-8">
        <div className="flex flex-col items-center md:flex-row md:justify-between gap-6">
          <BrandLogo size="sm" />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-bold text-slate-400">
            <Link to="/app" className="hover:text-primary-600 transition-colors">Dashboard</Link>
            <Link to="/app/cv-studio" className="hover:text-primary-600 transition-colors">CV Studio</Link>
            <Link to="/pricing" className="hover:text-primary-600 transition-colors">Pricing</Link>
            <Link to="/faq" className="hover:text-primary-600 transition-colors">FAQ</Link>
            <Link to="/privacy" className="hover:text-primary-600 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-primary-600 transition-colors">Terms</Link>
            <Link to="/contact" className="hover:text-primary-600 transition-colors">Contact</Link>
          </nav>
        </div>
        <p className="text-xs font-medium text-slate-400 text-center md:text-left border-t border-slate-100 pt-6">
          © 2026 College Ready. AI tools for academic CV preparation. Outputs are drafts — review and edit before submitting.
        </p>
      </div>
    </footer>
  );
}
