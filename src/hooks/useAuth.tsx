import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { logUserSignInIfNewAuth, signOutWithAudit } from "../lib/userAudit";

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

  // Subscribe to Firebase auth state once. Also fires the user-side
  // audit log when authTime indicates a fresh sign-in event — same
  // pattern the ops portal uses. Fire-and-forget; the audit write is
  // best-effort and never blocks app state updates.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        try {
          const tokenResult = await currentUser.getIdTokenResult();
          void logUserSignInIfNewAuth(currentUser.uid, tokenResult.authTime);
        } catch (err) {
          // Token-read failure shouldn't break auth state. Just log.
          // eslint-disable-next-line no-console
          console.warn("[auth] could not read token for audit log:", err);
        }
      }
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
        // signOutWithAudit awaits the audit write before signing out
        // so the user_sign_out entry lands while the auth token is
        // still valid. Failure modes are swallowed inside the helper.
        signOutWithAudit().catch(() => { /* best-effort */ });
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
