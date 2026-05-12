import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Mail, Check, AlertTriangle, GraduationCap, ShieldAlert, BrainCircuit } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import BrandLogo from "../components/BrandLogo";

// ─────────────────────────────────────────────────────────────────────────────
// Waitlist landing — what the public sees at collegeready.io while we're
// soft-launching. Captures email + an optional name to the `waitlist`
// Firestore collection. Once we're ready to flip the switch, unset
// VITE_WAITLIST_MODE in Vercel and signed-out users start seeing the real
// landing page again.
//
// Design constraints:
//   - First-paint clean. No framer-motion on critical layout — only on the
//     success state, where the perceived weight doesn't matter.
//   - Form is the entire focus. Above the fold, no nav bloat, one CTA.
//   - "Already have access? Log in" link bottom-right so the founder /
//     existing accounts can still sign in and bypass the gate.
// ─────────────────────────────────────────────────────────────────────────────

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "submitted" }
  | { kind: "error"; message: string };

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [name, setName]   = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatus({ kind: "error", message: "That doesn't look like a valid email." });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      await addDoc(collection(db, "waitlist"), {
        email:     trimmedEmail,
        name:      name.trim() || null,
        // Capture any ref= code so we can attribute referral signups later.
        ref:       new URLSearchParams(window.location.search).get("ref") ?? null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
        createdAt: serverTimestamp(),
      });
      setStatus({ kind: "submitted" });
    } catch (err: any) {
      console.error("Waitlist submit failed:", err);
      setStatus({ kind: "error", message: "Couldn't save your spot — please try again in a moment." });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-500 selection:text-white relative overflow-hidden">
      {/* Decorative blobs — desktop only (cheap CPU on mobile is precious). */}
      <div className="hidden md:block absolute top-[-15%] right-[-10%] w-[600px] h-[600px] bg-primary-200/50 rounded-full blur-[120px] pointer-events-none" />
      <div className="hidden md:block absolute -bottom-32 left-[-10%] w-[600px] h-[600px] bg-accent-500/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Top bar — logo on the left, quiet "log in" affordance on the right
          so the founder + early testers can bypass the gate. */}
      <header className="relative px-6 py-5 max-w-6xl mx-auto flex items-center justify-between">
        <BrandLogo size="md" />
        <Link
          to="/login"
          className="text-xs font-bold tracking-wide text-slate-500 hover:text-slate-900 transition-colors"
        >
          Already have access? <span className="underline">Log in</span>
        </Link>
      </header>

      <main className="relative max-w-3xl mx-auto px-6 pt-10 sm:pt-20 pb-20 text-center">
        {/* "Coming soon" badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-primary-700 text-[11px] font-black tracking-widest uppercase mb-6">
          <Sparkles size={12} /> Launching soon
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 leading-[1.05] tracking-tight mb-5">
          Your shortcut to the <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary-600 to-accent-500">
            right U.S. college.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-500 font-medium leading-relaxed max-w-xl mx-auto mb-10">
          AI-powered college matching grounded in verified program data — plus a realistic F-1 visa interview simulator for the moment that actually decides whether you get there.
          <br className="hidden sm:block" />
          Join the waitlist for early access and free credits at launch.
        </p>

        {/* Form / success swap */}
        {status.kind === "submitted" ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto bg-white border border-emerald-200 rounded-3xl p-7 shadow-sm"
          >
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              <Check size={22} />
            </div>
            <p className="text-lg font-black text-slate-900 mb-1">You're on the list.</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              We'll email <span className="font-bold text-slate-700">{email}</span> the minute access opens. No spam in between — promise.
            </p>
          </motion.div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3 text-left"
          >
            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-1.5 uppercase ml-1">Your name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada"
                maxLength={80}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-medium focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-1.5 uppercase ml-1">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-medium focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={status.kind === "submitting"}
              className="w-full inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 rounded-2xl transition-colors active:scale-[0.99] shadow-lg shadow-primary-600/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status.kind === "submitting" ? "Saving your spot…" : "Join the waitlist"}
              {status.kind !== "submitting" && <ArrowRight size={16} />}
            </button>

            {status.kind === "error" && (
              <div className="flex items-start gap-2 text-xs font-semibold text-rose-700 leading-relaxed">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                <span>{status.message}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-1">
              We'll email you once. Unsubscribe with one click. No marketing list resale.
            </p>
          </form>
        )}

        {/* What's coming — three quick value props */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-14 text-left">
          <ValueProp
            icon={<GraduationCap size={18} className="text-primary-600" />}
            title="Verified matches"
            body="Real colleges. Real programs. No AI-invented schools."
          />
          <ValueProp
            icon={<BrainCircuit size={18} className="text-accent-500" />}
            title="Clear reasons"
            body="Each match explains why it fits and what to strengthen."
          />
          <ValueProp
            icon={<ShieldAlert size={18} className="text-amber-500" />}
            title="Visa rehearsal"
            body="An AI consular officer scores your F-1 practice interview."
          />
        </div>
      </main>

      <footer className="relative border-t border-slate-100 bg-white py-8 mt-4">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p className="text-slate-400 font-medium">
            © 2026 CollegeReady. Practice tools only. Not affiliated with any government, embassy, or consular service.
          </p>
          <div className="flex gap-5 font-bold text-slate-400">
            <Link to="/privacy" className="hover:text-primary-600 transition-colors">Privacy</Link>
            <Link to="/terms"   className="hover:text-primary-600 transition-colors">Terms</Link>
            <Link to="/contact" className="hover:text-primary-600 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ValueProp({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-sm transition-shadow">
      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-2">
        {icon}
      </div>
      <p className="text-sm font-bold text-slate-900 mb-0.5">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
    </div>
  );
}
