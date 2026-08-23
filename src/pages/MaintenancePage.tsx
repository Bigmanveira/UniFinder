// MaintenancePage — what users see when the kill switch is flipped.
//
// Design rules (Sleek design language — sibling of NotFoundPage):
//   - Dark ink hero card centered on bg-surface with the signature
//     ring + orb decor, so the page reads as deliberate, not broken.
//   - Centered stack inside the card: logo → eyebrow → headline →
//     optional countdown → CTA. Vertical rhythm is calm, not crowded.
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
import { Eyebrow } from "../components/ui/Eyebrow";

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
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-5 font-sans">
      {/* Hero — dark ink card, sibling of NotFoundPage. */}
      <main className="relative w-full max-w-xl bg-ink text-white rounded-card-lg overflow-hidden shadow-2xl p-8 sm:p-12 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-12 -top-16 w-56 h-56 rounded-full border-[22px] border-primary-500/15" />
          <div className="absolute -left-16 -bottom-20 w-56 h-56 rounded-full bg-primary-500/15 blur-3xl" />
        </div>

        <div className="relative flex flex-col items-center">
          <BrandLogo size="md" tone="light" iconOnly asLink={false} className="mb-6" />
          <Eyebrow tone="light" className="mb-2">Under maintenance</Eyebrow>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight mb-4">
            {message?.trim() ? message : DEFAULT_MESSAGE}
          </h1>

          <p className="text-sm text-white/60 font-medium leading-relaxed mb-8 max-w-sm">
            We'll be back shortly. Existing work is safe — nothing was lost. Thanks for your patience while we ship something better.
          </p>

          {parts && (
            <div className="mb-8">
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-white/50 mb-4">
                We'll be back in
              </p>
              <div className="flex items-start gap-3 sm:gap-5 justify-center">
                <CountdownCell value={parts.days}    label="Days" />
                <CountdownCell value={parts.hours}   label="Hours" />
                <CountdownCell value={parts.minutes} label="Minutes" />
                <CountdownCell value={parts.seconds} label="Seconds" />
              </div>
            </div>
          )}

          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 rounded-full bg-primary-500 hover:bg-primary-600 text-white font-bold px-7 py-3.5 text-sm shadow-glow transition-all active:scale-95"
          >
            <Mail size={14} /> Contact us
          </a>
        </div>
      </main>

      {/* Footer — socials, links, copyright on the light surface. */}
      <footer className="mt-8 px-6">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-4">
          <ul className="flex items-center gap-2">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="w-9 h-9 rounded-full bg-white border border-slate-200/70 shadow-sm hover:border-slate-300 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
                >
                  {s.icon}
                </a>
              </li>
            ))}
          </ul>

          <nav className="flex items-center gap-5 text-[11px] font-bold text-slate-400">
            <Link to="/terms"   className="hover:text-slate-900 transition-colors">Terms</Link>
            <span className="text-slate-300">·</span>
            <Link to="/privacy" className="hover:text-slate-900 transition-colors">Privacy</Link>
            <span className="text-slate-300">·</span>
            <Link to="/contact" className="hover:text-slate-900 transition-colors">Contact</Link>
          </nav>

          <p className="text-[11px] font-medium text-slate-400">
            © {new Date().getFullYear()} College Ready. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function CountdownCell({ value, label }: { value: number; label: string }) {
  // Each "cell" is a stacked column: a big tabular two-digit number
  // on top, a small uppercase label below. Lives on the ink card so
  // the numbers stay white and the labels muted.
  const v = String(value).padStart(2, "0");
  return (
    <div className="flex flex-col items-center min-w-[56px] sm:min-w-[72px]">
      <span className="text-3xl sm:text-5xl font-black tabular-nums text-white leading-none">
        {v}
      </span>
      <span className="mt-2 text-[10px] sm:text-[11px] font-semibold tracking-eyebrow uppercase text-white/50">
        {label}
      </span>
    </div>
  );
}
