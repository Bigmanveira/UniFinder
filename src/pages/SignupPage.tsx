// SignupPage — magic-link signup + Google. Replaces the older
// email+password flow.
//
// Two paths in:
//   1. Google sign-in (unchanged) — instant signup via OAuth popup.
//   2. Email — visitor types their address, we send a one-time
//      sign-in link via the sendUserSignInLink Cloud Function. They
//      click the link in their inbox and land on /login signed-in
//      (Firebase email-link auth creates the Auth user on first
//      click). No password ever set; future logins go through the
//      same magic-link flow on LoginPage.
//
// Two locally-stored bits travel across the magic-link round trip:
//   - email (so signInWithEmailLink can verify on click-back)
//   - optional referral code (typed manually or captured from ?ref=…)
// Both live in localStorage and are read by LoginPage's verification
// path right after the link is consumed.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signInWithPopup, getAdditionalUserInfo, GoogleAuthProvider } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, googleProvider, db, functions } from "../lib/firebase";
import { ArrowRight, Check, Loader2, Tag, ChevronDown, ChevronUp } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { Eyebrow } from "../components/ui/Eyebrow";
import { Input } from "../components/ui/Input";
import { motion } from "framer-motion";
import {
  captureReferralCodeFromUrl,
  readPendingReferralCode,
  clearPendingReferralCode,
  setPendingReferralCode,
} from "../lib/referrals";
import {
  stashPendingCredential,
  tryLinkPendingCredential,
} from "../lib/accountLinking";
import { getPostAuthPath, getRequestedPostAuthPath } from "../lib/postAuthRouting";

// Same key the LoginPage reads. Pinned here so a rename in one place
// doesn't silently break the round-trip.
const EMAIL_LS_KEY = "userApp:emailForSignIn";

function sanitizeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//"))  return null;
  return raw;
}

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromResults = searchParams.get("from") === "results";
  const nextPath    = sanitizeNextPath(searchParams.get("next"));

  // Pre-fill email from ?email=… so visitors who arrive via a
  // marketing link, a forwarded URL, or a previous tab don't have
  // to retype their address.
  const prefillEmail = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(prefillEmail);
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralCode,  setReferralCode] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Capture any ?ref=… on mount and pre-fill the manual entry so the
  // user can confirm or correct it. Also clear stale guest data when
  // they're not coming from the intake wizard.
  useEffect(() => {
    if (!fromResults) {
      localStorage.removeItem("unifinder_guest_profile");
      localStorage.removeItem("unifinder_preview_expires");
    }
    captureReferralCodeFromUrl();
    const existing = readPendingReferralCode();
    if (existing) {
      setReferralCode(existing);
      setReferralOpen(true);
    }
  }, [fromResults]);

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

  const shouldGoToResults = () => {
    if (!fromResults) return false;
    const profile = localStorage.getItem("unifinder_guest_profile");
    const expires = localStorage.getItem("unifinder_preview_expires");
    if (!profile || !expires) return false;
    return Date.now() < parseInt(expires, 10);
  };

  const computePostSignupPath = (isNewUser: boolean) => getPostAuthPath({
    nextPath,
    hasGuestResults: shouldGoToResults(),
    isNewUser,
  });

  // Build the URL we want the magic link to bounce the user back to.
  // Only explicit destinations are embedded as `next`. For the normal
  // signup path, LoginPage uses Firebase's isNewUser result to choose
  // roadmap for a new account or dashboard for a returning account.
  const buildReturnUrl = (): string => {
    const dest = getRequestedPostAuthPath(nextPath, shouldGoToResults());
    const params = new URLSearchParams();
    if (dest) params.set("next", dest);
    const query = params.toString();
    return `${window.location.origin}/login${query ? `?${query}` : ""}`;
  };

  // Stash the referral code (if the user typed one) before we hit the
  // callable. The applyReferralIfPresent flow on LoginPage reads this
  // right after sign-in completes. Empty string clears any stale code.
  const persistReferralCode = () => {
    setPendingReferralCode(referralCode.trim() || null);
  };

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      persistReferralCode();
      const fn = httpsCallable<
        { email: string; returnUrl: string; intent: "signup" | "signin" },
        { ok: boolean }
      >(functions, "sendUserSignInLink");
      await fn({
        email:     email.trim().toLowerCase(),
        returnUrl: buildReturnUrl(),
        intent:    "signup",
      });
      // Stash the email so signInWithEmailLink can verify it on
      // click-back. Firebase requires the email at the verification
      // step for replay protection.
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
      persistReferralCode();
      const userCredential = await signInWithPopup(auth, googleProvider);
      const additionalInfo = getAdditionalUserInfo(userCredential);

      // Account linking — if a previous email-link attempt got blocked
      // because a Google account already existed, the email-link
      // credential is in sessionStorage waiting for this Google sign-in.
      // Attach it here so both methods land on this single UID.
      await tryLinkPendingCredential(userCredential.user);

      try {
        const uid = userCredential.user.uid;
        const userEmail = userCredential.user.email;

        await setDoc(doc(db, "users", uid), {
          email: userEmail,
          createdAt: serverTimestamp(),
          role: "student",
        }, { merge: true });

        const guestProfile = localStorage.getItem("unifinder_guest_profile");
        if (guestProfile) {
          await setDoc(doc(db, "studentProfiles", uid), { ...JSON.parse(guestProfile), updatedAt: serverTimestamp() });
        }
      } catch (dbError) {
        console.warn("Could not save backend foundation records:", dbError);
      }

      await applyReferralIfPresent();
      navigate(computePostSignupPath(additionalInfo?.isNewUser === true));
    } catch (err: any) {
      // Mirror LoginPage: existing account via email-link → stash the
      // Google credential and send the user a sign-in link. When they
      // click it, the LoginPage email-link handler runs
      // tryLinkPendingCredential and attaches Google to the existing
      // UID. End state: one account, two sign-in methods.
      if (err?.code === "auth/account-exists-with-different-credential") {
        const linkEmail = (err.customData?.email ?? "").toString().toLowerCase();
        const pendingCred = GoogleAuthProvider.credentialFromError(err);
        if (linkEmail && pendingCred) {
          stashPendingCredential(pendingCred, linkEmail);
          try {
            const dest = getRequestedPostAuthPath(nextPath, shouldGoToResults());
            const params = new URLSearchParams();
            if (dest) params.set("next", dest);
            const query = params.toString();
            const returnUrl = `${window.location.origin}/login${query ? `?${query}` : ""}`;
            const fn = httpsCallable<
              { email: string; returnUrl: string; intent: "signup" | "signin" },
              { ok: boolean }
            >(functions, "sendUserSignInLink");
            await fn({ email: linkEmail, returnUrl, intent: "signin" });
            localStorage.setItem(EMAIL_LS_KEY, linkEmail);
            setEmail(linkEmail);
            setSent(true);
            setError("You already have an account for this email. We sent you a sign-in link — click it to link Google to that account.");
            return;
          } catch (sendErr) {
            console.warn("[signup] could not auto-send link for account link:", sendErr);
            setError(`An account for ${linkEmail} already exists. Use email-link sign-in to access it.`);
            return;
          }
        }
      }
      console.error(err);
      setError("Google sign-up failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const loginHref = (() => {
    const params = new URLSearchParams();
    if (fromResults) params.set("from", "results");
    if (nextPath)    params.set("next", nextPath);
    const qs = params.toString();
    return qs ? `/login?${qs}` : "/login";
  })();

  return (
    <div className="min-h-screen bg-surface flex font-sans selection:bg-primary-500 selection:text-white">
      {/* Ink backdrop panel — desktop only. Same treatment as LoginPage so
          the two auth surfaces read as siblings. */}
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
          <Eyebrow tone="light" className="mb-3">Get started</Eyebrow>
          <h2 className="text-3xl xl:text-4xl font-black tracking-tight leading-tight mb-4">
            Find your fit. Practice the interview. Land ready.
          </h2>
          <p className="text-sm text-white/60 font-medium leading-relaxed">
            Join today and get 200 free tokens to explore verified matches and interview practice.
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
              <Eyebrow className="mb-2">Sign up</Eyebrow>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Create account</h1>
              <p className="text-slate-500 font-medium text-sm">Join today and get 200 free tokens.</p>
            </div>

          {sent ? (
            // After we ship the magic link, swap to a "check your inbox"
            // confirmation state so the user knows what to do next.
            // They never see the password field or any of the
            // pre-submit form again unless they click "Use a
            // different email" to reset.
            <div className="space-y-4">
              <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 flex-shrink-0">
                  <Check size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-primary-900 text-sm mb-0.5">Check your inbox</p>
                  <p className="text-xs text-primary-800 leading-relaxed break-words">
                    A sign-in link is on its way to <span className="font-mono">{email}</span> from <span className="font-mono">noreply@collegeready.io</span>. Open it on this device to finish.
                  </p>
                  <p className="text-[11px] text-primary-700 mt-1.5 leading-relaxed">
                    If this email is already registered, you'll be signed into that account.
                  </p>
                  {referralCode.trim() && (
                    <p className="text-[11px] text-primary-700 mt-1 leading-relaxed">
                      Referral code <span className="font-mono font-bold">{referralCode.trim().toUpperCase()}</span> will be applied automatically when you land. Your referrer gets 500 tokens once you make your first purchase.
                    </p>
                  )}
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
                Sign Up with Google
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

                {/* "I have a referral code" — collapsed by default so the
                    primary signup flow is the lowest-friction path. Click
                    to expand and reveal the input. Pre-fills if a ?ref=
                    landed via URL so the user can confirm or correct. */}
                <div className="bg-slate-50/60 border border-slate-200/70 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setReferralOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-100/60 transition-colors"
                  >
                    <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                      <Tag size={13} className="text-primary-600" />
                      I have a referral code
                    </span>
                    {referralOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </button>
                  {referralOpen && (
                    <div className="px-4 pb-3 pt-1">
                      <input
                        type="text"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        maxLength={32}
                        autoCapitalize="characters"
                        spellCheck={false}
                        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
                        placeholder="JANE2025"
                      />
                      <p className="text-[10px] font-medium text-slate-500 mt-1.5 leading-relaxed">
                        Got a code from a marketer or friend? Bonus tokens land in your wallet right after you sign in.
                      </p>
                    </div>
                  )}
                </div>

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
              Already have an account? <Link to={loginHref} className="text-primary-600 font-black hover:underline">Log in</Link>
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
