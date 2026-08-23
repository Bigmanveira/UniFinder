import { useEffect, useState } from "react";
import BrandLogo from "./BrandLogo";

// ─────────────────────────────────────────────────────────────────────────────
// SplashScreen — full-screen branded loading surface: animated logo badge,
// an indeterminate progress sweep, and rotating study-abroad facts.
//
// Pure CSS animation on purpose: this renders during the app's very first
// paint, so it must not pull framer-motion (~40 KB gz) into the entry
// chunk. Timing (minimum display, fade-out, show-once) lives in
// StartupSplash.
// ─────────────────────────────────────────────────────────────────────────────

const FACTS = [
  "Over 1.1 million international students study in the US each year.",
  "Most F-1 visa interviews last less than 3 minutes.",
  "STEM graduates in the US can extend their OPT work period to 3 years.",
  "More than $10 billion in scholarships is awarded to international students annually.",
  "US universities consider your whole profile — not just your grades.",
  "The SEVIS I-901 fee must be paid before your visa interview.",
  "Strong ties to your home country are the #1 factor visa officers assess.",
  "Many US graduate programs waive application fees if you simply ask.",
  "Community colleges can cut the cost of a US degree by more than half.",
  "Over 400,000 international students receive assistantships or fellowships.",
] as const;

const FACT_INTERVAL_MS = 2500;

export default function SplashScreen() {
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % FACTS.length);
    }, FACT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-ink flex flex-col items-center justify-center overflow-hidden">
      {/* Local keyframes — scoped here so the entry CSS stays tiny. All
          honor prefers-reduced-motion below. */}
      <style>{`
        @keyframes crSplashPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes crSplashSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        @keyframes crSplashIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .cr-splash-logo, .cr-splash-sweep { animation: none !important; }
          .cr-splash-sweep { width: 100%; opacity: 0.45; transform: none; }
        }
      `}</style>

      {/* Decorative ring + glow orbs, matching the dark Card decor language */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full border-[24px] border-primary-500/10" />
        <div className="absolute -left-24 -bottom-28 w-80 h-80 rounded-full border-[28px] border-white/5" />
        <div className="absolute right-1/4 top-1/3 w-64 h-64 rounded-full bg-primary-500/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center px-8">
        {/* Animated logo: scale-in, then a gentle breathing pulse with glow */}
        <div className="relative mb-10">
          <div aria-hidden className="absolute inset-0 -m-6 rounded-full bg-primary-500/30 blur-2xl" />
          <div
            className="cr-splash-logo relative"
            style={{ animation: "crSplashIn 0.4s ease-out, crSplashPulse 2s ease-in-out 0.4s infinite" }}
          >
            <BrandLogo size="lg" tone="light" iconOnly asLink={false} />
          </div>
        </div>

        {/* Loading widget: thin indeterminate sweep bar */}
        <div className="w-40 h-1 rounded-full bg-white/10 overflow-hidden mb-8" role="progressbar" aria-label="Loading">
          <div
            className="cr-splash-sweep h-full w-1/3 bg-primary-400 rounded-full"
            style={{ animation: "crSplashSweep 1.4s ease-in-out infinite" }}
          />
        </div>

        {/* Rotating facts — key remount retriggers the entry animation */}
        <div className="h-10 flex items-start justify-center max-w-xs" aria-live="polite">
          <p
            key={factIndex}
            className="animate-fade-in-up text-sm font-medium text-white/60 text-center leading-snug"
          >
            {FACTS[factIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
