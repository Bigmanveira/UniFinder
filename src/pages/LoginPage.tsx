// LoginPage — magic-link sign-in + Google. Replaces the older
// email+password flow. Also catches the return trip from a magic-link
// click and completes Firebase email-link auth.
//
// Three paths through this page:
//
//   1. Fresh visit (no email-link params): show the form. Email →
//      request a magic link via sendUserSignInLink. Google → standard
//      OAuth popup.
//
//   2. Return from a magic link (URL has `?apiKey=…&oobCode=…`): we
//      detect this with isSignInWithEmailLink on mount, recover the
//      email from localStorage (or prompt as a fallback), call
//      signInWithEmailLink to complete auth, then run the same
//      first-time-user bootstrap as Google sign-in (provision the
//      /users doc, store any guest profile, apply pending referral
//      code) and navigate to wherever `?next=` points.
//
//   3. Already signed in (rare — App.tsx normally routes them away
//      before this page mounts): the verification effect is a no-op
//      and the form renders normally.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  signInWithPopup,
  isSignInWithEmailLink,
  signInWithEmailLink,
  getAdditionalUserInfo,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, googleProvider, db, functions } from "../lib/firebase";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { Eyebrow } from "../components/ui/Eyebrow";
import { Input } from "../components/ui/Input";
import { motion } from "framer-motion";
import {
  readPendingReferralCode,
  clearPendingReferralCode,
} from "../lib/referrals";
import {
  stashPendingCredential,
  stashPendingEmailLink,
  tryLinkPendingCredential,
} from "../lib/accountLinking";
import { getPostAuthPath, getRequestedPostAuthPath } from "../lib/postAuthRouting";

const EMAIL_LS_KEY = "userApp:emailForSignIn";

function sanitizeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//"))  return null;
  return raw;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromResults = searchParams.get("from") === "results";
  const nextPath    = sanitizeNextPath(searchParams.get("next"));

  // Pre-fill email from ?email=… so visitors arriving via a saved
  // URL or another page don't have to retype.
  const prefillEmail = searchParams.get("email") ?? "";
  const [email, setEmail]       = useState(prefillEmail);
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const shouldGoToResults = () => {
    if (!fromResults) return false;
    const profile = localStorage.getItem("unifinder_guest_profile");
    const expires = localStorage.getItem("unifinder_preview_expires");
    if (!profile || !expires) return false;
    return Date.now() < parseInt(expires, 10);
  };

  const computePostLoginPath = (isNewUser: boolean) => getPostAuthPath({
    nextPath,
    hasGuestResults: shouldGoToResults(),
    isNewUser,
  });

  const requestedPostLoginPath = () => getRequestedPostAuthPath(
    nextPath,
    shouldGoToResults(),
  );

  // Best-effort first-time bootstrap. Runs after every successful
  // auth (magic link OR Google). For an existing user with a /users
  // doc already we just no-op the user-doc write (merge:true protects
  // existing fields). For a brand-new user, this creates the
  // /users doc that onUserCreated needs to fire the welcome email.
  // Stays inside try/catch — a Firestore hiccup here shouldn't block
  // the user from landing in the app.
  const bootstrapUser = async (uid: string, userEmail: string | null): Promise<void> => {
    try {
      // Create-only bootstrap. Two hard-won rules here:
      //   1. NEVER include `role` — firestore.rules rejects any /users
      //      create/update touching the protected role/accountStatus keys,
      //      which silently killed this write (and with it the welcome
      //      email + eager wallet) for every new signup.
      //   2. NEVER re-send `createdAt` for an existing doc — merge:true
      //      was stamping serverTimestamp() on every sign-in, so returning
      //      users kept showing up as brand-new signups in ops analytics.
      // The onAuthUserCreated Cloud Function is the authoritative doc
      // creator; this client write is just a fast-path for the same thing.
      const userRef = doc(db, "users", uid);
      const existing = await getDoc(userRef);
      if (!existing.exists()) {
        await setDoc(userRef, {
          email:     userEmail,
          createdAt: serverTimestamp(),
        });
      } else if (userEmail && existing.data()?.email !== userEmail) {
        await setDoc(userRef, { email: userEmail }, { merge: true });
      }

      const guestProfile = localStorage.getItem("unifinder_guest_profile");
      if (guestProfile) {
        // Only set the studentProfiles doc if it doesn't already exist —
        // returning users with a real profile shouldn't have their
        // saved data overwritten by leftover guest data.
        const profileSnap = await getDoc(doc(db, "studentProfiles", uid));
        if (!profileSnap.exists()) {
          await setDoc(doc(db, "studentProfiles", uid), { ...JSON.parse(guestProfile), updatedAt: serverTimestamp() });
        }
      }
    } catch (err) {
      console.warn("Could not save backend foundation records:", err);
    }
  };

  // Apply whatever referral code is sitting in localStorage. Shared
  // between Google and magic-link paths. Wraps the callable in a
  // try/catch because a 4xx from applyReferralCode shouldn't block
  // sign-in — the user can still land in the dashboard, just without
  // the referral bonus.
  const applyReferralIfPresent = async () => {
    const code = readPendingReferralCode();
    if (!code) return;
    try {
      const fn = httpsCallable(functions, "applyReferralCode");
      await fn({ code });
    } catch (err) {
      console.warn("Referral apply failed:", err);
    } finally {
      clearPendingReferralCode();
    }
  };

  // Magic-link return path. Fires once on mount when the URL carries
  // the Firebase auth params. Order of operations: verify → bootstrap
  // /users doc → apply referral → navigate. Each step is independent
  // enough that a failure in one doesn't strand the user — we always
  // attempt the next + always end with a navigation.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    setVerifying(true);
    let storedEmail = localStorage.getItem(EMAIL_LS_KEY) ?? "";
    if (!storedEmail) {
      // Different browser / cleared storage — ask the user to confirm
      // the address they requested the link for. Firebase needs the
      // email at the verification step for replay protection; without
      // it the call will fail.
      storedEmail = window.prompt("Confirm the email you requested the sign-in link for:") ?? "";
    }
    if (!storedEmail) {
      setError("Sign-in link needs the email it was sent to. Request a new link to continue.");
      setVerifying(false);
      return;
    }

    // Remember the link URL up front. If sign-in fails because a
    // Google account already exists for this email, we'll stash the
    // (email, link) pair and rebuild the credential later — after the
    // user re-authenticates via Google and we attach this email-link
    // method to their existing UID.
    const incomingLink = window.location.href;

    (async () => {
      try {
        const credential = await signInWithEmailLink(auth, storedEmail, window.location.href);
        localStorage.removeItem(EMAIL_LS_KEY);
        // Strip the oobCode params so a reload doesn't try to re-consume
        // an already-spent link.
        window.history.replaceState({}, "", window.location.pathname + window.location.search.replace(/[?&]oobCode=[^&]*/g, "").replace(/[?&]apiKey=[^&]*/g, "").replace(/[?&]mode=[^&]*/g, "").replace(/[?&]continueUrl=[^&]*/g, "").replace(/[?&]lang=[^&]*/g, "").replace(/^&/, "?") || "");

        // Account linking — if the user got here from a Google attempt
        // that bounced because the email-link account already existed,
        // there's a Google credential waiting in sessionStorage. Attach
        // it to this UID so the user has a single account with both
        // sign-in methods.
        await tryLinkPendingCredential(credential.user);

        await bootstrapUser(credential.user.uid, credential.user.email);
        await applyReferralIfPresent();
        const additionalInfo = getAdditionalUserInfo(credential);
        navigate(computePostLoginPath(additionalInfo?.isNewUser === true));
      } catch (err: any) {
        // Mirror case of the Google flow: an account exists for this
        // email via Google. Stash the email-link credential and walk
        // the user through Google sign-in — the Google handler above
        // calls tryLinkPendingCredential after a successful sign-in
        // and attaches the email-link to that UID.
        if (err?.code === "auth/account-exists-with-different-credential") {
          stashPendingEmailLink(storedEmail, incomingLink);
          setError(
            `An account for ${storedEmail} already exists via Google. Click "Continue with Google" below to link your email sign-in to that account.`,
          );
          setVerifying(false);
          return;
        }
        setError(err?.message ?? "Sign-in link could not be verified. Request a new link.");
        setVerifying(false);
      }
    })();
    // The dependency array is intentionally empty — this should run
    // exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const dest = requestedPostLoginPath();
      const params = new URLSearchParams();
      if (dest) params.set("next", dest);
      const query = params.toString();
      const returnUrl = `${window.location.origin}/login${query ? `?${query}` : ""}`;

      const fn = httpsCallable<
        { email: string; returnUrl: string; intent: "signup" | "signin" },
        { ok: boolean }
      >(functions, "sendUserSignInLink");
      await fn({
        email:     email.trim().toLowerCase(),
        returnUrl,
        intent:    "signin",
      });
      localStorage.setItem(EMAIL_LS_KEY, email.trim().toLowerCase());
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Could not send sign-in link. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const additionalInfo = getAdditionalUserInfo(userCredential);

      // Account linking — if the user previously kicked off an email-link
      // sign-in that got blocked because a Google account already
      // existed, the email-link credential is sitting in sessionStorage.
      // Attach it to this Google UID now so future email-link sign-ins
      // for the same address land on this same UID. Best-effort: if it
      // fails (token expired, etc.) we just continue with sign-in.
      await tryLinkPendingCredential(userCredential.user);

      // Returning user → ensure their /users doc is around (merge:true
      // makes this a no-op if it exists) + apply any pending referral
      // code (rare on login, but if they followed a referral link to
      // /login instead of /signup we shouldn't drop the bonus).
      if (additionalInfo?.isNewUser) {
        // Brand-new Google identity that didn't come through signup —
        // bootstrap them as if they just signed up.
        await bootstrapUser(userCredential.user.uid, userCredential.user.email);
      } else {
        await bootstrapUser(userCredential.user.uid, userCredential.user.email);
      }
      await applyReferralIfPresent();
      navigate(computePostLoginPath(additionalInfo?.isNewUser === true));
    } catch (err: any) {
      // Account-linking branch: an account already exists for this email
      // via a DIFFERENT method (email-link). We can't sign in with
      // Google because doing so would create a second UID. Instead:
      //   1. Stash the Google credential so we can attach it after the
      //      user signs in with their existing method.
      //   2. Auto-send the email-link to the same address.
      //   3. Tell the user to check their inbox.
      // When they click the link, the email-link useEffect below
      // succeeds (existing UID), then calls tryLinkPendingCredential
      // which attaches the stashed Google credential to that UID.
      if (err?.code === "auth/account-exists-with-different-credential") {
        const email = (err.customData?.email ?? "").toString().toLowerCase();
        const pendingCred = GoogleAuthProvider.credentialFromError(err);
        if (email && pendingCred) {
          stashPendingCredential(pendingCred, email);
          try {
            const dest = requestedPostLoginPath();
            const params = new URLSearchParams();
            if (dest) params.set("next", dest);
            const query = params.toString();
            const returnUrl = `${window.location.origin}/login${query ? `?${query}` : ""}`;
            const fn = httpsCallable<
              { email: string; returnUrl: string; intent: "signup" | "signin" },
              { ok: boolean }
            >(functions, "sendUserSignInLink");
            await fn({ email, returnUrl, intent: "signin" });
            localStorage.setItem(EMAIL_LS_KEY, email);
            setSent(true);
            setEmail(email);
            setError("We've already got an account for this email. We just sent you a sign-in link — click it to link Google to that account.");
            return;
          } catch (sendErr) {
            console.warn("[login] could not auto-send link for account link:", sendErr);
            setError(`An account for ${email} already exists. Sign in with the email-link option to access it.`);
            return;
          }
        }
      }
      console.error(err);
      setError("Google sign-in failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const signupHref = (() => {
    const params = new URLSearchParams();
    if (fromResults) params.set("from", "results");
    if (nextPath)    params.set("next", nextPath);
    const qs = params.toString();
    return qs ? `/signup?${qs}` : "/signup";
  })();

  if (verifying) {
    // Block the form while we complete the email-link verification.
    // Users who arrive via the link see this state instead of the
    // login form for ~1 second while Firebase + Firestore round-trip.
    return (
      <div className="min-h-screen relative bg-surface flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="absolute top-6 left-6 z-20">
          <BrandLogo size="md" />
        </div>
        <div className="relative z-10 bg-white border border-slate-200/70 rounded-card-lg p-8 max-w-sm w-full text-center shadow-card">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
            <Loader2 size={20} className="text-primary-600 animate-spin" />
          </div>
          <p className="text-sm font-black text-slate-900 mb-1">Signing you in…</p>
          <p className="text-xs font-medium text-slate-500">One moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex font-sans selection:bg-primary-500 selection:text-white">
      {/* Ink backdrop panel — desktop only. Ring + orb decor per the design
          language; the auth card carries the page on smaller screens. */}
      <aside className="hidden lg:flex relative w-[44%] xl:w-2/5 bg-ink text-white flex-col justify-between p-10 xl:p-14 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-12 -top-16 w-64 h-64 rounded-full border-[22px] border-primary-500/15" />
          <div className="absolute -right-6 top-28 w-56 h-56 rounded-full bg-primary-500/15 blur-3xl" />
          <div className="absolute -left-20 -bottom-24 w-64 h-64 rounded-full bg-primary-500/10 blur-3xl" />
        </div>
        <div className="relative">
          <BrandLogo size="md" tone="light" />
        </div>
        <div className="relative max-w-sm">
          <Eyebrow tone="light" className="mb-3">Welcome back</Eyebrow>
          <h2 className="text-3xl xl:text-4xl font-black tracking-tight leading-tight mb-4">
            Your matches are right where you left them.
          </h2>
          <p className="text-sm text-white/60 font-medium leading-relaxed">
            Sign back in to pick up your shortlist, reports, and interview practice.
          </p>
        </div>
        <p className="relative text-[11px] font-medium text-white/40">
          © {new Date().getFullYear()} College Ready
        </p>
      </aside>

      {/* Auth card column */}
      <main className="flex-1 flex flex-col items-center justify-center p-5 sm:p-8">
        <div className="lg:hidden mb-8">
          <BrandLogo size="md" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 w-full max-w-[440px]"
        >
          <div className="bg-white border border-slate-200/70 rounded-card-lg shadow-card p-8 sm:p-10">
            <div className="text-center mb-8">
              <Eyebrow className="mb-2">Log in</Eyebrow>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Welcome back</h1>
              <p className="text-slate-500 font-medium text-sm">Log in to view your saved U.S. matches.</p>
            </div>

            {sent ? (
              <div className="space-y-4">
                <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 flex-shrink-0">
                    <Check size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-primary-900 text-sm mb-0.5">Check your inbox</p>
                    <p className="text-xs text-primary-800 leading-relaxed break-words">
                      A sign-in link is on its way to <span className="font-mono">{email}</span>. Open it on this device to finish.
                    </p>
                    <p className="text-[11px] text-primary-700 mt-1.5 leading-relaxed">
                      If you don't have an account yet, one will be created when you click the link.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setSent(false); setError(null); }}
                  className="w-full text-xs text-slate-500 hover:text-slate-900 font-bold py-2"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleGoogle}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-3 rounded-full bg-white border border-slate-200 text-slate-900 text-sm font-bold py-3.5 px-5 mb-6 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                >
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
                  Continue with Google
                </button>

                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-slate-200"></div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-eyebrow">Or email</span>
                  <div className="flex-1 h-px bg-slate-200"></div>
                </div>

                <form onSubmit={handleSendLink} className="space-y-4">
                  <Input
                    label="Email address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />

                  {error && (
                    <p className="text-xs font-semibold text-rose-600 leading-relaxed text-center">{error}</p>
                  )}

                  <button
                    disabled={loading || !email.trim()}
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-bold py-4 mt-4 shadow-glow transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    {loading ? "Sending link…" : "Send sign-in link"} {!loading && <ArrowRight size={16} />}
                  </button>

                  <p className="text-[11px] font-medium text-slate-400 text-center leading-relaxed">
                    No password needed. We'll email you a one-time sign-in link.
                  </p>
                </form>
              </>
            )}

            <p className="text-sm font-medium text-slate-500 text-center mt-8">
              Don't have an account? <Link to={signupHref} className="text-primary-600 font-black hover:underline">Sign up</Link>
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
