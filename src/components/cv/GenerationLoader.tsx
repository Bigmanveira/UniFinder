// ─────────────────────────────────────────────────────────────────────────────
// GenerationLoader — full-screen-ish loader shown while the AI generates
// a CV. The Sonnet generation takes 10–25 seconds and a static spinner
// reads as "frozen" — so we cycle through mode-specific status lines on
// a 1.6s rhythm to keep the user oriented.
//
// Visual treatment: matches the app's splash language — a white card with
// a primary icon chip, a primary sweep bar that advances with the status
// stage, and a muted label. Single-accent (primary blue) by design.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import { Eyebrow } from "../ui/Eyebrow";
import { IconChip } from "../ui/IconChip";

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

export default function GenerationLoader({ mode }: { mode: CvMode }) {
  const lines = STATUS_LINES[mode];
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
    <div className="relative bg-white rounded-card-lg border border-slate-200/70 shadow-card overflow-hidden">
      <div className="relative px-8 py-14 sm:py-16 flex flex-col items-center text-center">
        {/* Modern orbital loader: a rotating ring segment orbits a steady
            pen icon — motion carries the "working" signal, the icon stays
            calm. Halo pulse kept for depth. */}
        <div className="relative mb-7">
          <div className="absolute inset-[-12px] rounded-full bg-primary-500/15 blur-2xl animate-pulse" aria-hidden />
          <div
            aria-hidden
            className="absolute inset-[-7px] rounded-full border-[3px] border-primary-100 border-t-primary-500 animate-spin"
            style={{ animationDuration: "1.1s" }}
          />
          <IconChip
            icon={<PenLine size={26} />}
            tint="primary"
            size="lg"
            className="relative w-16 h-16 rounded-full shadow-xl shadow-primary-600/10"
          />
        </div>

        <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 mb-3">
          <Eyebrow tone="primary">{stageLabel}</Eyebrow>
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

        {/* Primary sweep bar — advances with stageIndex so the user has
            a sense of "this loader knows where it is in the process." */}
        <div className="w-full max-w-xs h-1.5 rounded-full bg-slate-100 overflow-hidden mt-7" aria-hidden>
          <div
            className="h-full rounded-full bg-primary-600 transition-all duration-500"
            style={{ width: `${((stageIndex + 1) / lines.length) * 100}%` }}
          />
        </div>

        {/* Progress dots — purely decorative pacing cue, advances with
            stageIndex. */}
        <div className="flex items-center gap-2 mt-4" aria-hidden>
          {lines.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                idx === stageIndex
                  ? "w-7 bg-primary-600"
                  : idx < stageIndex
                    ? "w-1.5 bg-primary-300"
                    : "w-1.5 bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
