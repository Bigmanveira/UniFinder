import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

// ── Idle-timeout config ───────────────────────────────────────────────────────
// Sign the user out after 15 minutes of no input. Resets on any user-driven
// event (pointer move, key press, touch). We use both pointer and touch
// listeners so mobile users count as active when they're tapping the screen.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
// Activity events that should reset the idle timer. `visibilitychange` covers
// "tab brought back to focus"; `keydown` covers desktop typing; pointer/touch
// cover everything else.
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "pointerdown", "pointermove", "keydown", "touchstart", "scroll", "visibilitychange",
];

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to Firebase auth state once.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Idle-timeout watcher. Only armed while a user is signed in — guests don't
  // have a session to sign out of, and arming the listeners would cost CPU
  // for nothing.
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        console.log("[auth] 15min idle — signing out");
        signOut(auth).catch(() => { /* best-effort; onAuthStateChanged will catch the result */ });
      }, IDLE_TIMEOUT_MS);
    };

    // Start the timer immediately so a stationary user who reloads the page
    // and walks away still hits the 15-minute cap.
    resetTimer();

    const handler = () => resetTimer();
    for (const evt of ACTIVITY_EVENTS) {
      document.addEventListener(evt, handler, { passive: true });
    }

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      for (const evt of ACTIVITY_EVENTS) {
        document.removeEventListener(evt, handler);
      }
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
