import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import BrandLogo from "./BrandLogo";

// ─────────────────────────────────────────────────────────────────────────────
// SplashScreen — full-screen branded loading surface: animated logo badge,
// an indeterminate progress sweep, and rotating study-abroad facts.
//
// Pure visual — it renders for as long as it is mounted. Timing (minimum
// display, fade-out, show-once) lives in StartupSplash. Also used directly
// as the loading branch of the auth gates so nothing unbranded ever flashes
// underneath the startup overlay.
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
  const reduceMotion = useReducedMotion();
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % FACTS.length);
    }, FACT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-ink flex flex-col items-center justify-center overflow-hidden">
      {/* Decorative ring + glow orbs, matching the dark Card decor language */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full border-[24px] border-primary-500/10" />
        <div className="absolute -left-24 -bottom-28 w-80 h-80 rounded-full border-[28px] border-white/5" />
        <div className="absolute right-1/4 top-1/3 w-64 h-64 rounded-full bg-primary-500/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center px-8">
        {/* Animated logo: scale-in, then a gentle breathing pulse with glow */}
        <div className="relative mb-10">
          <div
            aria-hidden
            className="absolute inset-0 -m-6 rounded-full bg-primary-500/30 blur-2xl"
          />
          {reduceMotion ? (
            <div className="relative">
              <BrandLogo size="lg" tone="light" iconOnly asLink={false} />
            </div>
          ) : (
            <motion.div
              className="relative"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: [1, 1.06, 1], opacity: 1 }}
              transition={{
                opacity: { duration: 0.4, ease: "easeOut" },
                scale: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 },
              }}
            >
              <BrandLogo size="lg" tone="light" iconOnly asLink={false} />
            </motion.div>
          )}
        </div>

        {/* Loading widget: thin indeterminate sweep bar */}
        <div className="w-40 h-1 rounded-full bg-white/10 overflow-hidden mb-8" role="progressbar" aria-label="Loading">
          {reduceMotion ? (
            <div className="h-full w-full bg-primary-400/45 rounded-full" />
          ) : (
            <motion.div
              className="h-full w-1/3 bg-primary-400 rounded-full"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>

        {/* Rotating facts */}
        <div className="h-10 flex items-start justify-center max-w-xs" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.p
              key={factIndex}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.3 }}
              className="text-sm font-medium text-white/60 text-center leading-snug"
            >
              {FACTS[factIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
