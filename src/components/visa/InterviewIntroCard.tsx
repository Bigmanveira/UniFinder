import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, ArrowRight, Loader2, Sparkles, Check, Video, Mic, AlertTriangle } from "lucide-react";

const DISCLAIMER =
  "This is a simulated F-1 visa interview for practice only. It is not legal advice, " +
  "not an official U.S. government service, and does not guarantee visa approval. " +
  "Final decisions are made by U.S. consular officers.";

export default function InterviewIntroCard({
  onStart, starting, speechSupported,
}: {
  onStart: (accepted: boolean) => Promise<void>;
  starting: boolean;
  speechSupported: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const canStart = accepted && !starting && speechSupported;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 flex-shrink-0">
          <ShieldAlert size={20} />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">F-1 Visa Interview Practice</h2>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
            A live AI avatar plays the role of a consular officer. It speaks each question to you, listens to your spoken answer, then gives a written score and feedback at the end — just like the real thing.
          </p>
        </div>
      </div>

      {/* What you'll get */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
        <Feature icon={<Video size={16} />}    label="Live AI avatar" hint="Speaks each question to you in real time." />
        <Feature icon={<Mic size={16} />}      label="Voice answers"  hint="Reply naturally — no typing required." />
        <Feature icon={<Sparkles size={16} />} label="AI feedback"    hint="Scores 9 dimensions, with sample answers." />
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 mb-5">
        <p className="text-[13px] text-amber-900 leading-relaxed">
          <span className="font-semibold">Important —</span> {DISCLAIMER}
        </p>
      </div>

      {/* Browser / mic readiness */}
      {speechSupported ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-[12px] text-blue-900 leading-relaxed mb-5">
          <p className="font-semibold mb-0.5">Before you start:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Use Chrome, Edge, Brave, or Safari on a stable connection.</li>
            <li>Allow microphone access when prompted — the interview is voice-only.</li>
            <li>Keep this tab focused and find a quiet space; the avatar takes a few seconds to wake up.</li>
          </ul>
        </div>
      ) : (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-[12px] text-rose-900 leading-relaxed mb-5 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold mb-0.5">This browser doesn't support voice input.</p>
            <p>Open Unifinder in Chrome, Edge, Brave, or Safari to start the interview.</p>
          </div>
        </div>
      )}

      {/* Acceptance + start */}
      <label className="flex items-start gap-3 mb-5 cursor-pointer select-none">
        <span
          className={[
            "w-5 h-5 rounded-md flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors border",
            accepted ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300",
          ].join(" ")}
          onClick={() => setAccepted((v) => !v)}
        >
          {accepted && <Check size={12} className="stroke-[3]" />}
        </span>
        <span className="text-sm text-slate-700 leading-relaxed">
          I understand this is a practice simulator only. I will answer truthfully — Unifinder does not coach dishonesty,
          and a good practice score does not predict the real interview outcome.
        </span>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="sr-only"
        />
      </label>

      <button
        onClick={() => canStart && onStart(accepted)}
        disabled={!canStart}
        className="flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 text-white text-base font-semibold py-4 rounded-2xl transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20"
      >
        {starting ? <Loader2 size={16} className="animate-spin" /> : <>Start live avatar interview · 1 credit <ArrowRight size={16} /></>}
      </button>
    </motion.div>
  );
}

function Feature({ icon, label, hint }: { icon: React.ReactNode; label: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-center gap-2 mb-1 text-slate-700">
        <span className="text-blue-600">{icon}</span>
        <span className="text-sm font-bold text-slate-900">{label}</span>
      </div>
      <p className="text-[12px] text-slate-500 leading-snug">{hint}</p>
    </div>
  );
}
