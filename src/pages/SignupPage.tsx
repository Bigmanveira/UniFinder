import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createUserWithEmailAndPassword, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, googleProvider, db, functions } from "../lib/firebase";
import { GraduationCap, ArrowRight, Mail, Lock } from "lucide-react";
import { motion } from "framer-motion";
import {
  captureReferralCodeFromUrl,
  readPendingReferralCode,
  clearPendingReferralCode,
} from "../lib/referrals";

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromResults = searchParams.get("from") === "results";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Always clear stale guest data on mount — only redirect when explicitly coming from the wizard
  useEffect(() => {
    if (!fromResults) {
      localStorage.removeItem("unifinder_guest_profile");
      localStorage.removeItem("unifinder_preview_expires");
    }
    // Stash any ?ref=CODE on the URL so we can apply it after signup completes,
    // even if the user re-enters via Google OAuth (which round-trips off-domain).
    captureReferralCodeFromUrl();
  }, [fromResults]);

  // Best-effort referral application — never blocks signup completion.
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

  // Helper: only valid if coming from wizard AND profile is unexpired
  const shouldGoToResults = () => {
    if (!fromResults) return false;
    const profile = localStorage.getItem("unifinder_guest_profile");
    const expires = localStorage.getItem("unifinder_preview_expires");
    if (!profile || !expires) return false;
    return Date.now() < parseInt(expires, 10);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      try {
        const uid = userCredential.user.uid;
        const userEmail = userCredential.user.email;
        
        await setDoc(doc(db, "users", uid), {
          email: userEmail,
          createdAt: serverTimestamp(),
          role: "student"
        }, { merge: true });

        const guestProfile = localStorage.getItem("unifinder_guest_profile");
        if (guestProfile) {
          await setDoc(doc(db, "studentProfiles", uid), JSON.parse(guestProfile));
        }
      } catch (dbError) {
        console.warn("Could not save backend foundation records:", dbError);
      }

      await applyReferralIfPresent();

      if (shouldGoToResults()) {
        navigate("/results");
      } else {
        navigate("/app");
      }
    } catch (err) {
      console.error(err);
      alert("Error signing up. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle the redirect return from Google's auth. signInWithRedirect
  // does a full page navigation through Google's OAuth and lands us back
  // here; getRedirectResult retrieves the credential on the second mount.
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        try {
          const uid = result.user.uid;
          const userEmail = result.user.email;
          await setDoc(doc(db, "users", uid), {
            email: userEmail,
            createdAt: serverTimestamp(),
            role: "student",
          }, { merge: true });
          const guestProfile = localStorage.getItem("unifinder_guest_profile");
          if (guestProfile) {
            await setDoc(doc(db, "studentProfiles", uid), JSON.parse(guestProfile));
          }
        } catch (dbError) {
          console.warn("Could not save backend foundation records:", dbError);
        }
        await applyReferralIfPresent();
        navigate(shouldGoToResults() ? "/results" : "/app", { replace: true });
      })
      .catch((err) => {
        console.error("[auth] redirect result failed:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogle = async () => {
    try {
      // Full page redirect through Google's OAuth. Avoids the popup-based
      // failure modes (COOP, popup blockers, mobile WebView quirks). When
      // the user lands back on this page the getRedirectResult effect
      // above takes over and routes them to the right destination.
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error(err);
    }
  };


  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 font-sans selection:bg-primary-500 selection:text-white">
      {/* Background Image & Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1606761568499-6d2451b23c66?q=80&w=2000&auto=format&fit=crop"
          className="w-full h-full object-cover" 
          alt="Graduation" 
        />
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
      </div>

      <Link to="/" className="absolute top-6 left-6 z-20 flex items-center gap-2 text-white hover:opacity-80 transition-opacity">
        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
          <GraduationCap size={22} />
        </div>
        <span className="text-xl font-black tracking-tight hidden sm:block">College Ready</span>
      </Link>

      {/* Signup Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-2xl shadow-slate-900/50 border border-white/50">
          
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-slate-900 mb-2">Create Account</h1>
            <p className="text-slate-500 font-medium text-sm">Join today and get 20 free credits.</p>
          </div>

          <button onClick={handleGoogle} className="w-full bg-slate-50 border border-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl mb-6 hover:bg-slate-100 transition-colors flex items-center justify-center gap-3">
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
            Sign Up with Google
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Or email</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Mail size={18} />
                </div>
                <input 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-5 py-3.5 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" 
                  placeholder="you@example.com" 
                />
              </div>
            </div>
            
            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Lock size={18} />
                </div>
                <input 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-5 py-3.5 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" 
                  placeholder="••••••••" 
                />
              </div>
            </div>

            <button 
              disabled={loading} 
              type="submit" 
              className="w-full bg-primary-600 text-white font-bold py-4 rounded-2xl mt-4 hover:bg-primary-700 transition-transform active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Sign Up Free"} <ArrowRight size={18} />
            </button>
          </form>

          <p className="text-sm font-medium text-slate-500 text-center mt-8">
            Already have an account? <Link to={fromResults ? "/login?from=results" : "/login"} className="text-primary-600 font-black hover:underline">Log in</Link>
          </p>

        </div>
      </motion.div>
    </div>
  );
}
