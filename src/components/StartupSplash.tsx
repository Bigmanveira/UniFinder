import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import SplashScreen from "./SplashScreen";

// ─────────────────────────────────────────────────────────────────────────────
// StartupSplash — the timing brain for the branded splash overlay.
//
// Shows SplashScreen from first mount until BOTH:
//   • Firebase auth has resolved (useAuth().loading === false), and
//   • at least MIN_SPLASH_MS have elapsed (so it never flashes).
// Then fades out over 300ms and unmounts for good. A module-level flag
// guarantees it never replays on client-side remounts (StrictMode,
// HMR, route-level remounts of App internals).
// ─────────────────────────────────────────────────────────────────────────────

const MIN_SPLASH_MS = 1200;

let splashAlreadyShown = false;

export default function StartupSplash() {
  const { loading: authLoading } = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(splashAlreadyShown);
  const [dismissed, setDismissed] = useState(splashAlreadyShown);

  useEffect(() => {
    if (splashAlreadyShown) return;
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  const done = minTimeElapsed && !authLoading;

  useEffect(() => {
    if (done && !dismissed) {
      splashAlreadyShown = true;
      setDismissed(true);
    }
  }, [done, dismissed]);

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          key="startup-splash"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-0 z-[100]"
        >
          <SplashScreen />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
