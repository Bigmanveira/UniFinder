// MaintenancePage — what users see when the kill switch is flipped.
//
// Design rules (matched to the SeedProd-style "Under Construction"
// reference):
//   - Full-bleed dark hero so the page reads as deliberate, not
//     broken. We use a soft navy gradient with a brand-tinted glow
//     instead of a photograph so the look stays on-brand.
//   - Centered stack: logo → eyebrow → headline → optional countdown
//     → CTA. Vertical rhythm is calm, not crowded.
//   - Live countdown (DAYS / HOURS / MINUTES / SECONDS) when the
//     admin sets an ETA in the ops portal. When no ETA is set, the
//     countdown block hides cleanly and the CTA gets a little more
//     air.
//   - Footer with social icons, terms / privacy / contact, and a
//     copyright line — the page is a discoverable surface for first-
//     time visitors who land on it, not just an apology.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import BrandLogo from "../components/BrandLogo";

// Inline SVGs for the social icons. lucide-react in this project is
// pinned to an old version that doesn't export Twitter / Instagram /
// Linkedin; inline keeps us off a dep upgrade.
const XIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </svg>
);
const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);
const LinkedinIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

interface Props {
  /** Admin-supplied custom headline. Defaults to a friendly fallback. */
  message?:    string | null;
  /** Optional ETA in millis. When set, drives the countdown. */
  etaMs?:      number | null;
}

const SUPPORT_EMAIL = "support@collegeready.io";

const DEFAULT_MESSAGE = "We're making improvements behind the scenes.";

// External social URLs. Set to "" / null to hide an icon; we keep
// the slots reserved so the footer layout stays balanced if we add
// or remove a platform later.
// College Ready is built by 233Labs — the socials point at the studio's
// channels rather than a product-specific handle.
const SOCIALS = [
  { label: "X (233Labs)",      href: "https://x.com/233labs",                       icon: <XIcon /> },
  { label: "Instagram (233Labs)", href: "https://www.instagram.com/233labs",        icon: <InstagramIcon /> },
  { label: "LinkedIn (233Labs)",  href: "https://www.linkedin.com/company/233labs", icon: <LinkedinIcon /> },
];

function diffParts(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days    = Math.floor(total / 86400);
  const hours   = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds };
}

export default function MaintenancePage({ message, etaMs }: Props) {
  // Tick once per second; if there's no ETA the timer is hidden so
  // the cost is two re-renders (mount + a stable null) — negligible.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!etaMs) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [etaMs]);

  const remaining = etaMs && etaMs > now ? etaMs - now : null;
  const parts     = remaining !== null ? diffParts(remaining) : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white font-sans relative overflow-hidden">
      {/* Background atmosphere — soft brand-tinted glows behind the
          centered content, deliberately subtle so they don't compete
          with the headline. Same pattern as the marketing landing. */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-15%] left-[-10%] w-[600px] h-[600px] bg-primary-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[700px] h-[700px] bg-accent-500/10 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,#1e3a8a33,transparent_60%)]" />
      </div>

      {/* Top: logo on its own. Centered so the rest of the layout
          reads as one centered column without competing with a
          left-aligned brand mark. */}
      <header className="relative z-10 pt-10 md:pt-14 flex justify-center">
        <BrandLogo size="lg" tone="light" asLink={false} />
      </header>

      {/* Hero — eyebrow, headline, countdown, CTA. */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center max-w-3xl mx-auto">
        <p className="text-[11px] md:text-xs font-black tracking-[0.3em] text-primary-300 uppercase mb-5">
          Under maintenance
        </p>

        <h1 className="text-3xl md:text-5xl font-black leading-[1.1] tracking-tight mb-5">
          {message?.trim() ? message : DEFAULT_MESSAGE}
        </h1>

        <p className="text-sm md:text-base text-slate-300/90 max-w-xl leading-relaxed mb-10">
          We'll be back shortly. Existing work is safe — nothing was lost. Thanks for your patience while we ship something better.
        </p>

        {parts && (
          <div className="mb-10">
            <p className="text-[10px] md:text-xs font-bold tracking-[0.25em] text-slate-400 uppercase mb-4">
              We'll be back in
            </p>
            <div className="flex items-start gap-3 md:gap-5">
              <CountdownCell value={parts.days}    label="Days" />
              <CountdownCell value={parts.hours}   label="Hours" />
              <CountdownCell value={parts.minutes} label="Minutes" />
              <CountdownCell value={parts.seconds} label="Seconds" />
            </div>
          </div>
        )}

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex items-center gap-2 bg-white text-slate-900 hover:bg-slate-100 transition-colors font-bold px-7 py-3 rounded-full text-sm shadow-lg shadow-slate-900/50"
        >
          <Mail size={14} /> Contact us
        </a>
      </main>

      {/* Footer — socials, links, copyright. */}
      <footer className="relative z-10 pb-8 md:pb-10 px-6">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-4">
          <ul className="flex items-center gap-2">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                >
                  {s.icon}
                </a>
              </li>
            ))}
          </ul>

          <nav className="flex items-center gap-5 text-[11px] font-bold text-slate-400">
            <Link to="/terms"   className="hover:text-white transition-colors">Terms</Link>
            <span className="text-slate-700">·</span>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <span className="text-slate-700">·</span>
            <Link to="/contact" className="hover:text-white transition-colors">Contact</Link>
          </nav>

          <p className="text-[11px] text-slate-500">
            © {new Date().getFullYear()} College Ready. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function CountdownCell({ value, label }: { value: number; label: string }) {
  // Each "cell" is a stacked column: a big tabular two-digit number
  // on top, a small uppercase label below. Matches the reference
  // (DAYS / HOURS / MINUTES / SECONDS) but lives on a transparent
  // background so it sits cleanly on top of the navy hero.
  const v = String(value).padStart(2, "0");
  return (
    <div className="flex flex-col items-center min-w-[64px] md:min-w-[80px]">
      <span className="text-4xl md:text-6xl font-black tabular-nums text-white leading-none">
        {v}
      </span>
      <span className="mt-2 text-[10px] md:text-[11px] font-bold tracking-[0.2em] uppercase text-slate-400">
        {label}
      </span>
    </div>
  );
}
