import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import SplashScreen from "./SplashScreen";

// ─────────────────────────────────────────────────────────────────────────────
// StartupSplash — the timing brain for the branded splash overlay.
//
// Shows SplashScreen from first mount until BOTH auth has resolved and
// MIN_SPLASH_MS elapsed, then fades out via a CSS opacity transition and
// unmounts for good (module-level flag guards remounts). CSS-only on
// purpose — this is in the entry chunk and must not drag framer-motion in.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_SPLASH_MS = 400;
const FADE_MS = 300;

let splashAlreadyShown = false;

export default function StartupSplash() {
  const { loading: authLoading } = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(splashAlreadyShown);
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(splashAlreadyShown);
  // Guards the fade sequence so it starts exactly once. CRITICAL: the
  // effect below must depend ONLY on `done` — a previous version also
  // depended on `fading`, so setFading(true) re-ran the effect, whose
  // cleanup cancelled the unmount timer. The invisible full-screen
  // overlay then stayed mounted forever, swallowing every click on the
  // page underneath.
  const fadeStartedRef = useRef(false);

  useEffect(() => {
    if (splashAlreadyShown) return;
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  const done = minTimeElapsed && !authLoading;

  useEffect(() => {
    if (!done || fadeStartedRef.current) return;
    fadeStartedRef.current = true;
    splashAlreadyShown = true;
    setFading(true);
    const timer = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(timer);
  }, [done]);

  if (gone) return null;

  return (
    <div
      // pointer-events-none the moment the fade starts — even if unmounting
      // were ever delayed again, the page underneath stays clickable.
      className={`fixed inset-0 z-[100] transition-opacity ease-out ${fading ? "pointer-events-none" : ""}`}
      style={{ transitionDuration: `${FADE_MS}ms`, opacity: fading ? 0 : 1 }}
    >
      <SplashScreen />
    </div>
  );
}
