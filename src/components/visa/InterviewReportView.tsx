import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Check, Lightbulb, RotateCcw, Target } from "lucide-react";
import type { VisaInterviewReport } from "../../types";

interface Props {
  report:    VisaInterviewReport;
  onRetry:   () => void;
  onBack:    () => void;
}

/** The score a single dimension has to reach to count as interview-ready.
 *  The whole profile chart is read against this one reference line, so it
 *  lives here rather than being repeated as a magic number. */
const READY_LINE = 60;

const SCORE_LABELS: { key: keyof VisaInterviewReport; label: string }[] = [
  { key: "clarityScore",                  label: "Clarity" },
  { key: "consistencyScore",              label: "Consistency" },
  { key: "confidenceScore",               label: "Confidence" },
  { key: "financialReadinessScore",       label: "Financial readiness" },
  { key: "schoolProgramExplanationScore", label: "School & programme" },
  { key: "careerPlanScore",               label: "Career plan" },
  { key: "homeTiesScore",                 label: "Home ties" },
  { key: "documentReadinessScore",        label: "Document readiness" },
];

/* Readiness bands, running warm (at risk) to cool (ready).
 *
 * NOTE: tailwind.config.js aliases emerald/green/lime/teal to brandBlue, so
 * this palette contains no green at all — `text-emerald-700` resolves to the
 * same blue as `text-blue-700`. The previous thresholds therefore painted
 * 60-79 and 80+ in an identical colour, making the top two bands impossible
 * to tell apart. Every colour below resolves to a genuinely distinct value. */
interface Band {
  fill:  string;  // bar fill on the profile chart
  text:  string;  // numeral colour on light surfaces
  onInk: string;  // numeral colour on the dark header
  label: string;
}

function bandFor(score: number): Band {
  if (score >= 80)         return { fill: "bg-blue-600",   text: "text-blue-700",  onInk: "text-blue-200",  label: "Strong" };
  if (score >= READY_LINE) return { fill: "bg-accent-500", text: "text-sky-600",   onInk: "text-sky-200",   label: "Steady" };
  if (score >= 40)         return { fill: "bg-amber-400",  text: "text-amber-600", onInk: "text-amber-200", label: "Shaky"  };
  return                          { fill: "bg-rose-500",   text: "text-rose-600",  onInk: "text-rose-200",  label: "Weak"   };
}

/* Describes the run that just happened. Deliberately worded as an account of
 * this practice session and never as a prediction of a real visa outcome —
 * the Terms commit to that distinction. */
function verdictFor(overall: number, belowCount: number): { headline: string; detail: string } {
  const headline =
    overall >= 80         ? "Strong practice run"
    : overall >= READY_LINE ? "Solid, with gaps"
    : overall >= 40         ? "Uneven across the board"
    :                         "Early days";

  const detail =
    belowCount === 0
      ? `Every area cleared the ${READY_LINE} benchmark in this run.`
      : belowCount === 1
        ? `One area came in under the ${READY_LINE} benchmark in this run.`
        : `${belowCount} of ${SCORE_LABELS.length} areas came in under the ${READY_LINE} benchmark in this run.`;

  return { headline, detail };
}

export default function InterviewReportView({ report, onRetry, onBack }: Props) {
  const reduceMotion = useReducedMotion();
  const overall = Math.max(0, Math.min(100, report.overallScore));

  const rows = SCORE_LABELS.map(({ key, label }) => {
    const value = Math.max(0, Math.min(100, (report[key] as number) ?? 0));
    return { key, label, value, band: bandFor(value) };
  });

  const below   = rows.filter((r) => r.value < READY_LINE);
  const verdict = verdictFor(overall, below.length);

  // The two weakest areas, surfaced as an explicit next step. The chart itself
  // stays in canonical order so a returning user can compare runs at a glance;
  // this callout is what turns the chart into a priority.
  const focus = [...rows].sort((a, b) => a.value - b.value).slice(0, 2);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* ---- Verdict header -------------------------------------------- */}
      <section className="overflow-hidden rounded-[26px] border border-[#22376d] bg-[#07142f] text-white">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-3 sm:px-8">
          <p className="font-utility text-[10px] uppercase tracking-[0.22em] text-[#8fa6e8]">
            F-1 practice assessment
          </p>
          {report.scoringVersion && (
            <p className="font-utility text-[10px] uppercase tracking-[0.14em] text-white/35">
              {report.scoringVersion}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 px-6 py-7 sm:px-8">
          <div className="flex items-start gap-1">
            <span className="font-display text-[68px] font-bold leading-[0.85] tracking-tight tabular-nums sm:text-[84px]">
              {overall}
            </span>
            <span className="font-utility mt-2 text-xs text-white/40">/100</span>
          </div>

          <div className="min-w-[220px] flex-1">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              {verdict.headline}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-white/65">{verdict.detail}</p>
          </div>
        </div>

        {/* The disclaimer sits directly against the number it qualifies —
            shown once here rather than repeated in the footer. */}
        <p className="border-t border-white/10 px-6 py-3.5 text-[12.5px] leading-relaxed text-white/55 sm:px-8">
          {report.disclaimer}
        </p>
      </section>

      {/* ---- Readiness profile ----------------------------------------- */}
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-bold tracking-tight text-slate-900">
            Readiness profile
          </h3>
          <p className="font-utility text-[10px] uppercase tracking-[0.16em] text-slate-400">
            Benchmark {READY_LINE}
          </p>
        </div>

        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.key as string}>
              {/* Narrow screens: label and value ride above the full-width bar. */}
              <div className="mb-1.5 flex items-baseline justify-between gap-3 sm:hidden">
                <span className="text-[13px] font-semibold text-slate-700">{row.label}</span>
                <span className={`font-utility text-[13px] font-semibold tabular-nums ${row.band.text}`}>
                  {row.value}
                </span>
              </div>

              <div className="sm:grid sm:grid-cols-[164px_1fr_60px] sm:items-center sm:gap-4">
                <span className="hidden text-[13px] font-semibold text-slate-700 sm:block">
                  {row.label}
                </span>

                <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    className={`h-full rounded-full ${row.band.fill}`}
                    /* "0%" rather than 0: Framer Motion cannot interpolate a
                       unitless number (read as px) to a percentage target, and
                       silently pins the bar at 0px if the units differ. */
                    initial={reduceMotion ? false : { width: "0%" }}
                    animate={{ width: `${row.value}%` }}
                    transition={{
                      duration: 0.75,
                      delay: reduceMotion ? 0 : 0.12 + i * 0.055,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                  {/* The benchmark line — the one mark every bar is read
                      against, and the reason the chart beats eight tiles. */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-slate-900/25"
                    style={{ left: `${READY_LINE}%` }}
                  />
                </div>

                <span
                  className={`hidden text-right font-utility text-[13px] font-semibold tabular-nums sm:block ${row.band.text}`}
                >
                  {row.value}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-5 border-t border-slate-100 pt-3.5 text-xs leading-relaxed text-slate-500">
          The line marks {READY_LINE}. Bars short of it are the areas this run left unproven.
        </p>
      </section>

      {/* ---- Where to start next --------------------------------------- */}
      {below.length > 0 && (
        <section className="rounded-[26px] border border-[#c8d2f8] bg-[#f4f6ff] p-5 sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-[#1b2f68]">
            <Target size={15} className="text-[#5169c7]" /> Start here next time
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#31437e]">
            Your two lowest areas from this run. Rehearse these before booking anything.
          </p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {focus.map((row) => (
              <div
                key={row.key as string}
                className="flex items-baseline justify-between gap-3 rounded-2xl border border-[#ccd6fb] bg-white px-4 py-3"
              >
                <span className="text-sm font-bold text-slate-900">{row.label}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="font-utility text-[10px] uppercase tracking-[0.14em] text-slate-400">
                    {row.band.label}
                  </span>
                  <span className={`font-utility text-base font-bold tabular-nums ${row.band.text}`}>
                    {row.value}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Strengths + weaknesses ------------------------------------ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FeedbackList title="What went well"    tone="blue" items={report.strengths} />
        <FeedbackList title="Areas to improve"  tone="rose" items={report.weaknesses} />
      </div>

      {/* ---- Red flags -------------------------------------------------- */}
      {report.redFlagsToImprove.length > 0 && (
        <section className="rounded-[26px] border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-amber-900">
            <AlertTriangle size={15} className="text-amber-600" /> Fix before the real interview
          </h3>
          <ul className="mt-3 space-y-2">
            {report.redFlagsToImprove.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-amber-900">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Recommended practice --------------------------------------- */}
      {report.recommendedPractice.length > 0 && (
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-slate-900">
            <Lightbulb size={15} className="text-amber-500" /> Recommended practice
          </h3>
          <ul className="mt-3 space-y-2.5">
            {report.recommendedPractice.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
                <span className="font-utility mt-px w-4 shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Sample improved answers ------------------------------------ */}
      {report.sampleImprovedAnswers.length > 0 && (
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-slate-900">
            <Check size={15} className="text-blue-600" /> Stronger versions of your answers
          </h3>
          <div className="mt-4 space-y-4">
            {report.sampleImprovedAnswers.map((s, i) => (
              <div key={i} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                <p className="font-utility text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  Asked
                </p>
                <p className="mt-1 text-[13px] font-semibold leading-relaxed text-slate-500">
                  {s.question}
                </p>
                <p className="mt-2.5 border-l-2 border-blue-500 pl-3.5 text-sm leading-relaxed text-slate-900">
                  {s.improvedAnswer}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{s.whyBetter}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Actions ----------------------------------------------------- */}
      <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
        <button
          onClick={onBack}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6179d8] focus-visible:ring-offset-2"
        >
          <ArrowLeft size={15} /> Back to dashboard
        </button>
        <button
          onClick={onRetry}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#07142f] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#07142f]/20 transition-colors hover:bg-[#102454] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6179d8] focus-visible:ring-offset-2"
        >
          <RotateCcw size={15} /> Practice again
        </button>
      </div>
    </motion.div>
  );
}

function FeedbackList({
  title, items, tone,
}: {
  title: string;
  items: string[];
  tone:  "blue" | "rose";
}) {
  if (items.length === 0) return null;

  const surface = tone === "blue"
    ? "border-[#c8d2f8] bg-[#f4f6ff]"
    : "border-rose-200 bg-rose-50/70";
  const heading = tone === "blue" ? "text-[#1b2f68]" : "text-rose-900";
  const body    = tone === "blue" ? "text-[#31437e]" : "text-rose-900";
  const marker  = tone === "blue" ? "bg-[#6078d5]"   : "bg-rose-400";

  return (
    <section className={`rounded-[26px] border p-5 ${surface}`}>
      <h3 className={`font-display text-base font-bold tracking-tight ${heading}`}>{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((s, i) => (
          <li key={i} className={`flex items-start gap-2.5 text-[13px] leading-relaxed ${body}`}>
            <span aria-hidden className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${marker}`} />
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}
