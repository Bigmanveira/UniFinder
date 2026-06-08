// ─────────────────────────────────────────────────────────────────────────────
// GenerationLoader — full-screen-ish loader shown while the AI generates
// a CV. The Sonnet generation takes 10–25 seconds and a static spinner
// reads as "frozen" — so we cycle through mode-specific status lines on
// a 1.6s rhythm to keep the user oriented.
//
// Visual treatment: animated multi-layer gradient halo around a rotating
// sparkle, with a fade-cross transition between status lines so it feels
// alive without screaming for attention.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type CvMode = "review" | "build" | "convert";

// Mode-specific status copy. Stages are deliberately written in the
// present continuous ("Reading…", "Drafting…") so each line reads as
// "something is happening right now." Order roughly matches what Sonnet
// is actually doing under the hood.
const STATUS_LINES: Record<CvMode, string[]> = {
  review: [
    "Reading your CV…",
    "Mapping every section…",
    "Calling out the weak phrasing…",
    "Drafting a sharper version…",
    "Polishing the prose…",
    "Adding the final flourishes…",
  ],
  build: [
    "Gathering your facts…",
    "Choosing the right structure…",
    "Drafting each section…",
    "Tightening the bullet points…",
    "Setting the typography…",
    "Putting the final document together…",
  ],
  convert: [
    "Reading your professional CV…",
    "Spotting the research signals…",
    "Stripping the corporate phrasing…",
    "Reorganising for an academic reader…",
    "Re-titling the sections…",
    "Finishing the conversion…",
  ],
};

// Per-mode accent so the loader matches the brand color of the tool
// the user just clicked from.
const MODE_THEME: Record<CvMode, { from: string; to: string; ring: string; chip: string }> = {
  review:  { from: "from-blue-500",    to: "to-cyan-500",     ring: "ring-blue-500/30",    chip: "bg-blue-50 text-blue-700 border-blue-200" },
  build:   { from: "from-violet-500",  to: "to-fuchsia-500",  ring: "ring-violet-500/30",  chip: "bg-violet-50 text-violet-700 border-violet-200" },
  convert: { from: "from-emerald-500", to: "to-teal-500",     ring: "ring-emerald-500/30", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function GenerationLoader({ mode }: { mode: CvMode }) {
  const lines = STATUS_LINES[mode];
  const theme = MODE_THEME[mode];
  const [stageIndex, setStageIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Cross-fade between status lines. 1.6s per line; the FADE out
  // lasts 250ms before we swap text + fade back in.
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      const timeout = setTimeout(() => {
        setStageIndex((i) => (i + 1) % lines.length);
        setVisible(true);
      }, 250);
      return () => clearTimeout(timeout);
    }, 1_600);
    return () => clearInterval(interval);
  }, [lines.length]);

  const stageLabel = mode === "build" ? "Building" : mode === "convert" ? "Converting" : "Reviewing";

  return (
    <div className="relative bg-white rounded-[32px] border border-slate-200 shadow-xl shadow-slate-900/[0.04] overflow-hidden">
      {/* Animated decorative background — three soft gradient blobs that
          slowly orbit the centre. Pure CSS keyframes (drift-* below)
          mean no JS animation cost. */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className={`absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-gradient-to-br ${theme.from} ${theme.to} opacity-20 rounded-full blur-3xl animate-pulse`} style={{ animationDuration: "4s" }} />
        <div className={`absolute bottom-[-30%] right-[-10%] w-[70%] h-[70%] bg-gradient-to-br ${theme.from} ${theme.to} opacity-15 rounded-full blur-3xl animate-pulse`} style={{ animationDuration: "5s", animationDelay: "1.5s" }} />
      </div>

      <div className="relative px-8 py-14 sm:py-16 flex flex-col items-center text-center">
        {/* Animated sparkle — outer ring spins slowly, inner sparkle
            pulses on a different cadence so the eye keeps catching motion. */}
        <div className="relative mb-7">
          <div className={`absolute inset-[-12px] rounded-full bg-gradient-to-br ${theme.from} ${theme.to} opacity-25 blur-2xl animate-pulse`} aria-hidden />
          <div className={`relative w-20 h-20 rounded-full bg-gradient-to-br ${theme.from} ${theme.to} flex items-center justify-center shadow-2xl ${theme.ring} ring-8`}>
            <Sparkles size={32} className="text-white animate-pulse" style={{ animationDuration: "1.8s" }} />
          </div>
        </div>

        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] uppercase border rounded-full px-2.5 py-1 mb-3 ${theme.chip}`}>
          {stageLabel}
        </span>

        {/* Status line — cross-fade between messages. Min height locks
            the layout so the surrounding card doesn't jump when copy
            changes length. */}
        <div className="h-12 sm:h-14 flex items-center justify-center">
          <p
            className={`text-xl sm:text-2xl font-black tracking-tight text-slate-900 transition-opacity duration-200 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
          >
            {lines[stageIndex]}
          </p>
        </div>

        <p className="text-[13px] text-slate-500 leading-relaxed max-w-md mt-4">
          This usually takes 10–25 seconds. Hang tight — we're writing in your voice, not in chatbot.
        </p>

        {/* Progress dots — purely decorative pacing cue, advances with
            stageIndex so the user has a sense of "this loader knows
            where it is in the process." */}
        <div className="flex items-center gap-2 mt-7" aria-hidden>
          {lines.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                idx === stageIndex
                  ? `w-7 bg-gradient-to-r ${theme.from} ${theme.to}`
                  : idx < stageIndex
                    ? "w-1.5 bg-slate-400"
                    : "w-1.5 bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
