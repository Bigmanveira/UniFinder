// WaitlistDocLayout — shared chrome for the four pre-launch info pages
// (Privacy, Terms, Support, FAQ). These pages are reachable ONLY from
// the waitlist footer; the main app's footer links to a different set of
// pages designed around the full product. Keeping them in their own
// folder + layout means we can speak in a "pre-launch" voice here
// without worrying about consistency with production copy.

import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import webLogo from "../assets/weblogo.png";

export default function WaitlistDocLayout({
  title,
  subtitle,
  children,
}: {
  title:    string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={webLogo} alt="" className="w-7 h-7 rounded-lg" />
            <span className="font-bold text-white text-sm tracking-tight">College Ready</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={12} /> Back to waitlist
          </Link>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <header className="mb-10">
            <p className="text-[10px] font-bold tracking-widest text-blue-400 uppercase mb-2">College Ready</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{title}</h1>
            {subtitle && (
              <p className="mt-3 text-base text-slate-400 leading-relaxed">{subtitle}</p>
            )}
            <p className="mt-4 text-xs text-slate-500">Last updated 2026-05-19 — these terms apply during the soft-launch waitlist period.</p>
          </header>

          {/* Page-specific content. Children should be a series of <section>
              blocks with their own h2/p. The prose styling here is
              intentionally minimal so each page can customise. */}
          <div className="space-y-8 text-[15px] leading-relaxed text-slate-300">
            {children}
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-5 text-xs sm:text-sm text-slate-500">
          © 2026 CollegeReady · Practice tools only.{" "}
          <Link to="/" className="text-slate-400 hover:text-white transition-colors">Back to waitlist</Link>
        </div>
      </footer>
    </div>
  );
}
