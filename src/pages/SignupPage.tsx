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
import { ArrowRight, Mail, Check, Loader2, Tag, ChevronDown, ChevronUp } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
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
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 font-sans selection:bg-primary-500 selection:text-white">
      {/* Background image + overlay (unchanged from the password version) */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1606761568499-6d2451b23c66?q=80&w=2000&auto=format&fit=crop"
          className="w-full h-full object-cover"
          alt="Graduation"
        />
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
      </div>

      <div className="absolute top-6 left-6 z-20">
        <BrandLogo size="md" tone="light" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-2xl shadow-slate-900/50 border border-white/50">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-slate-900 mb-2">Create Account</h1>
            <p className="text-slate-500 font-medium text-sm">Join today and get 200 free tokens.</p>
          </div>

          {sent ? (
            // After we ship the magic link, swap to a "check your inbox"
            // confirmation state so the user knows what to do next.
            // They never see the password field or any of the
            // pre-submit form again unless they click "Use a
            // different email" to reset.
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
                  <Check size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-emerald-900 text-sm mb-0.5">Check your inbox</p>
                  <p className="text-xs text-emerald-800 leading-relaxed break-words">
                    A sign-in link is on its way to <span className="font-mono">{email}</span> from <span className="font-mono">noreply@collegeready.io</span>. Open it on this device to finish.
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-1.5 leading-relaxed">
                    If this email is already registered, you'll be signed into that account.
                  </p>
                  {referralCode.trim() && (
                    <p className="text-[11px] text-emerald-700 mt-1 leading-relaxed">
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
                className="w-full bg-slate-50 border border-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl mb-6 hover:bg-slate-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-3"
              >
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
                Sign Up with Google
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 h-px bg-slate-200"></div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Or email</span>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>

              <form onSubmit={handleSendLink} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-5 py-3.5 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                {/* "I have a referral code" — collapsed by default so the
                    primary signup flow is the lowest-friction path. Click
                    to expand and reveal the input. Pre-fills if a ?ref=
                    landed via URL so the user can confirm or correct. */}
                <div className="bg-slate-50/60 border border-slate-200 rounded-2xl overflow-hidden">
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
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                        placeholder="JANE2025"
                      />
                      <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                        Got a code from a marketer or friend? Bonus tokens land in your wallet right after you sign in.
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="text-xs text-rose-600 leading-relaxed text-center">{error}</p>
                )}

                <button
                  disabled={loading || !email.trim()}
                  type="submit"
                  className="w-full bg-primary-600 text-white font-bold py-4 rounded-2xl mt-4 hover:bg-primary-700 transition-transform active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? "Sending link…" : "Send sign-in link"} {!loading && <ArrowRight size={18} />}
                </button>

                <p className="text-[11px] text-slate-500 text-center leading-relaxed">
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
    </div>
  );
}
