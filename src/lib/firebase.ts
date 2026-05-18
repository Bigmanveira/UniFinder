import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ─────────────────────────────────────────────────────────────────────────────
// App Check
//
// reCAPTCHA v3 attests "this request came from a real browser running our app"
// to Firestore, Cloud Functions and Storage. Combined with the maxInstances
// caps shipped 2026-05-15, this is the second half of the abuse-prevention
// story — the caps limit damage rate; App Check limits who can knock on the
// door. The waitlist Joe-job risk and the anonymous aiMatchSchoolsCallable
// Claude-proxy vector are both closed by enforcement.
//
// IMPORTANT: this initialization MUST run before any Firestore/Functions
// call; the SDK is "fail-open" today so missing tokens don't break anything
// while server-side enforcement is off, but they'll start being rejected
// once we flip `enforceAppCheck: true` on the backend in Step 5.
//
// Local dev: set `VITE_APP_CHECK_DEBUG_TOKEN=true` in .env.local to print a
// debug token to console; register that token in Firebase Console →
// App Check → Manage debug tokens. Localhost is also whitelisted on the
// reCAPTCHA site key so most flows just work.
//
// The site key is PUBLIC — reCAPTCHA's design pairs a public site key with
// a server-side secret key. Firebase fetches the secret itself; we never
// see it. Hardcoding is therefore correct, not a leak.
// ─────────────────────────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  // Debug token mode — only active when explicitly enabled by env var. The
  // global must be set BEFORE initializeAppCheck() is called.
  if (import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN) {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider("6LfHtfAsAAAAAKkgNaP-h-RWefq5j_hRDXn0KObT"),
      // Auto-refresh tokens before expiry so a long-lived tab doesn't drop
      // halfway through an interview when the 1-hour token expires.
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // If init throws (e.g. running in an iframe with no DOM), don't take
    // the whole app down. Server-side enforcement isn't on yet, so the
    // user can still use the site; we just lose attestation for this load.
    console.warn("[firebase] App Check init failed:", err);
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);

// Force Google's account picker on every sign-in. Without `prompt: select_account`
// Chrome silently re-authenticates the most recently used Google account, which
// surprises users on shared phones — they tap "Sign in with Google" expecting
// to choose an account and instead get auto-logged in without confirmation.
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const appleProvider = new OAuthProvider('apple.com');
export const functions = getFunctions(app);
export const storage = getStorage(app);
