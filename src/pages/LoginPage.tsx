import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signInWithEmailAndPassword, signInWithRedirect, getRedirectResult, getAdditionalUserInfo, deleteUser } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { GraduationCap, ArrowRight, Mail, Lock } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromResults = searchParams.get("from") === "results";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // If the user came in via "Already have an account? Log in" from the
  // locked-preview page, their guest profile is still in localStorage and
  // unexpired. Honour that path and send them back to /results so they
  // don't have to redo the wizard.
  const shouldGoToResults = () => {
    if (!fromResults) return false;
    const profile = localStorage.getItem("unifinder_guest_profile");
    const expires = localStorage.getItem("unifinder_preview_expires");
    if (!profile || !expires) return false;
    return Date.now() < parseInt(expires, 10);
  };

  // When the page mounts, check whether we're returning from a Google
  // OAuth redirect. signInWithRedirect bounces the entire page through
  // Google's auth and lands us back here with the credential available
  // via getRedirectResult. Without this listener the auth completes but
  // the page sits doing nothing.
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return; // fresh page load, not a redirect return
        const additionalInfo = getAdditionalUserInfo(result);
        if (additionalInfo?.isNewUser) {
          // Login page = existing accounts only. Firebase just auto-created
          // a Google account; nuke it and tell the user to sign up first.
          try { await deleteUser(result.user); } catch { /* best-effort */ }
          alert("Account not found. Please create an account on the Sign Up page first.");
          return;
        }
        navigate(shouldGoToResults() ? "/results" : "/app", { replace: true });
      })
      .catch((err) => {
        console.error("[auth] redirect result failed:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(shouldGoToResults() ? "/results" : "/app");
    } catch (err) {
      console.error(err);
      alert("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      // Full page redirect (not popup). Avoids COOP, popup blockers,
      // mobile webview popup quirks, and third-party-cookie restrictions.
      // After auth completes, the user lands back on /login and the
      // getRedirectResult effect above takes them to the right place.
      await signInWithRedirect(auth, googleProvider);
      // Code after this line does not execute; the page has navigated.
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 font-sans selection:bg-primary-500 selection:text-white">
      {/* Background Image & Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=2000&auto=format&fit=crop" 
          className="w-full h-full object-cover" 
          alt="University Campus" 
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

      {/* Login Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-2xl shadow-slate-900/50 border border-white/50">
          
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-slate-900 mb-2">Welcome Back</h1>
            <p className="text-slate-500 font-medium text-sm">Log in to view your saved U.S. matches.</p>
          </div>

          <button onClick={handleGoogle} className="w-full bg-slate-50 border border-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl mb-6 hover:bg-slate-100 transition-colors flex items-center justify-center gap-3">
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
            Continue with Google
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Or email</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
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
              <div className="flex justify-between mb-2 ml-1">
                <label className="block text-[10px] font-black tracking-widest text-slate-500 uppercase">Password</label>
                <Link to="#" className="text-[10px] font-black tracking-widest text-primary-600 hover:text-primary-700 uppercase">Forgot?</Link>
              </div>
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
              {loading ? "Logging in..." : "Log In"} <ArrowRight size={18} />
            </button>
          </form>

          <p className="text-sm font-medium text-slate-500 text-center mt-8">
            Don't have an account? <Link to="/signup" className="text-primary-600 font-black hover:underline">Sign up</Link>
          </p>

        </div>
      </motion.div>
    </div>
  );
}
