import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, ArrowRight, Loader2, Wand2, Check, Video, Mic, AlertTriangle, RotateCw } from "lucide-react";

const DISCLAIMER =
  "This is a simulated F-1 visa interview for practice only. It is not legal advice, " +
  "not an official U.S. government service, and does not guarantee visa approval. " +
  "Final decisions are made by U.S. consular officers.";

const VISA_INTERVIEW_PAID_COST = 15;

export default function InterviewIntroCard({
  onStart, starting, speechSupported, walletCredits, isFounder,
}: {
  onStart: (accepted: boolean, isReturningApplicant: boolean) => Promise<void>;
  starting: boolean;
  speechSupported: boolean;
  /** Live wallet balance â€” drives the CTA copy (free preview vs paid).
   *  null = still loading; treat as "unknown, default to paid copy". */
  walletCredits: number | null;
  isFounder: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [isReturningApplicant, setIsReturningApplicant] = useState(false);
  const canStart = accepted && !starting && speechSupported;

  // Mode the user is about to land in. Founders always paid. Anyone else
  // with < 15 credits gets the free 3-min preview. The backend re-derives
  // this from the wallet at start time â€” this client-side decision is
  // just for the CTA copy. Mismatch is impossible: if the wallet drops
  // between this render and the start click, the backend will route to
  // preview correctly regardless of what the button said.
  const willBePreview = !isFounder && walletCredits !== null && walletCredits < VISA_INTERVIEW_PAID_COST;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Hero card â€” matches the dashboard F-1 CTA visual language */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 text-white p-7 sm:p-9 shadow-xl shadow-slate-950/30">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950" aria-hidden />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" aria-hidden />
        <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" aria-hidden />

        {/* Status chips top */}
        <div className="absolute top-5 left-5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-300 text-[10px] font-bold uppercase tracking-widest z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> Live
        </div>
        <div className="absolute top-5 right-5 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900/70 border border-white/10 text-white/70 text-[10px] font-bold uppercase tracking-widest z-10">
          <ShieldAlert size={10} className="text-amber-300" /> Simulation
        </div>

        <div className="relative pt-6 sm:pt-2">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6">
            {/* Anna avatar â€” same breathing animation as dashboard CTA */}
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-primary-500/30 animate-ping" style={{ animationDuration: "2.5s" }} aria-hidden />
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-primary-400 via-primary-500 to-accent-500 ring-2 ring-white/20 shadow-2xl overflow-hidden">
                <img
                  src="/anna.webp"
                  alt="Anna, your AI consular officer"
                  decoding="async"
                  width={96}
                  height={96}
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <p className="text-[10px] font-bold tracking-widest text-primary-300 uppercase mb-1">F-1 visa interview practice</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight text-white mb-2">
                Anna's ready when you are.
              </h2>
              <p className="text-[15px] text-white/70 leading-relaxed max-w-md sm:max-w-lg">
                A live AI consular officer reads your I-20 and DS-160, asks the questions a real officer would, and scores your answers across nine dimensions.
              </p>
            </div>
          </div>

          {/* Feature pills */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-7">
            <DarkPill icon={<Video size={16} />}    label="Live avatar"     />
            <DarkPill icon={<Mic size={16} />}      label="Voice answers"   />
            <DarkPill icon={<Wand2 size={16} />} label="Scored feedback" />
          </div>
        </div>
      </div>

      {/* Preview-mode banner â€” appears only when the user is going into a
          free 3-minute preview because they don't have 15 credits yet.
          Sets the expectation BEFORE they start so the cut-off at 3 minutes
          isn't a surprise. */}
      {willBePreview && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3.5 text-[13px] text-emerald-900 leading-relaxed flex items-start gap-2.5">
          <Wand2 size={16} className="mt-0.5 text-emerald-700 flex-shrink-0" />
          <div>
            <p className="font-bold mb-0.5">Free 3-minute preview</p>
            <p className="text-emerald-800">
              You don't have enough credits for a full mock yet, so you're getting a free 3-minute taste of the live interview. Anna will close at the 3-minute mark; top up 15 credits to run a full mock and get your scored feedback report.
            </p>
          </div>
        </div>
      )}

      {/* Setup checklist â€” only when supported */}
      {speechSupported ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3.5 text-[13px] text-blue-900 leading-relaxed">
          <p className="font-bold mb-1.5">Before you start</p>
          <ul className="space-y-1 text-[12.5px]">
            <li className="flex items-start gap-2"><Check size={14} className="text-blue-600 mt-0.5 flex-shrink-0" /> Use Chrome, Edge, Brave, or Safari on a stable connection.</li>
            <li className="flex items-start gap-2"><Check size={14} className="text-blue-600 mt-0.5 flex-shrink-0" /> Allow microphone access when prompted â€” the interview is voice-only.</li>
            <li className="flex items-start gap-2"><Check size={14} className="text-blue-600 mt-0.5 flex-shrink-0" /> Find a quiet space; the avatar takes a few seconds to wake up.</li>
          </ul>
        </div>
      ) : (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3.5 text-[13px] text-rose-900 leading-relaxed flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold mb-0.5">This browser doesn't support voice input.</p>
            <p>Open College Ready in Chrome, Edge, Brave, or Safari to start the interview.</p>
          </div>
        </div>
      )}

      {/* Returning-applicant checkbox. When ticked, the AI is informed and
          asks "What has changed since your last interview?" early in the
          flow â€” same probe a real consular officer uses on repeat
          applicants. Wrapped in a button for a single tap target. */}
      <button
        type="button"
        onClick={() => setIsReturningApplicant((v) => !v)}
        aria-pressed={isReturningApplicant}
        className={[
          "w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all cursor-pointer select-none",
          isReturningApplicant
            ? "bg-amber-50 border-amber-500 ring-1 ring-amber-200"
            : "bg-white border-slate-200 hover:border-slate-300",
        ].join(" ")}
      >
        <span
          className={[
            "w-5 h-5 rounded-md flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors border-2",
            isReturningApplicant ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-slate-300",
          ].join(" ")}
          aria-hidden
        >
          {isReturningApplicant && <Check size={12} className="stroke-[3]" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-slate-900 mb-0.5 inline-flex items-center gap-1.5">
            <RotateCw size={13} className="text-amber-600" /> I'm a returning applicant
          </p>
          <p className="text-[12.5px] text-slate-600 leading-relaxed">
            I've applied for an F-1 visa before and was denied or had to reapply. Anna will ask what's changed since then.
          </p>
        </div>
      </button>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 text-[12.5px] text-amber-900 leading-relaxed flex items-start gap-2.5">
        <ShieldAlert size={16} className="mt-0.5 text-amber-700 flex-shrink-0" />
        <p><span className="font-bold">Important â€”</span> {DISCLAIMER}</p>
      </div>

      {/* Acceptance â€” single tap target.
          Pre-fix bug: the visible checkbox span had its own onClick AND
          was wrapped in a <label> that also toggled the hidden <input>.
          Tapping the box toggled state twice (became a no-op) while tapping
          the text only toggled once. Now: one button covers both, no
          hidden input, no double-fire. */}
      <button
        type="button"
        onClick={() => setAccepted((v) => !v)}
        aria-pressed={accepted}
        className={[
          "w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all cursor-pointer select-none",
          accepted
            ? "bg-blue-50 border-blue-600 ring-1 ring-blue-200"
            : "bg-white border-slate-200 hover:border-slate-300",
        ].join(" ")}
      >
        <span
          className={[
            "w-5 h-5 rounded-md flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors border-2",
            accepted ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300",
          ].join(" ")}
          aria-hidden
        >
          {accepted && <Check size={12} className="stroke-[3]" />}
        </span>
        <span className="text-[13.5px] text-slate-700 leading-relaxed">
          I understand this is a practice simulator only. I will answer truthfully â€” College Ready does not coach dishonesty, and a good practice score does not predict the real interview outcome.
        </span>
      </button>

      <button
        onClick={() => canStart && onStart(accepted, isReturningApplicant)}
        disabled={!canStart}
        className="flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 text-white text-base font-semibold py-4 rounded-2xl transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20"
      >
        {starting
          ? <Loader2 size={16} className="animate-spin" />
          : willBePreview
            ? <>Start free 3-minute preview <ArrowRight size={16} /></>
            : <>Start the interview Â· 15 credits <ArrowRight size={16} /></>
        }
      </button>
    </motion.div>
  );
}

function DarkPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-white/10 border border-white/15 rounded-2xl px-2 py-2.5 text-center backdrop-blur-sm">
      <div className="flex items-center justify-center text-primary-300 mb-1">{icon}</div>
      <p className="text-[10.5px] sm:text-[11px] font-bold text-white/85">{label}</p>
    </div>
  );
}
