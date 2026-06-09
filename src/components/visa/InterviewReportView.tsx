import { motion } from "framer-motion";
import { Award, AlertTriangle, Wand2, RotateCcw, ArrowLeft, Lightbulb, Check } from "lucide-react";
import type { VisaInterviewReport } from "../../types";

interface Props {
  report:    VisaInterviewReport;
  onRetry:   () => void;
  onBack:    () => void;
}

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

function scoreColor(s: number): string {
  if (s >= 80) return "text-emerald-700";
  if (s >= 60) return "text-blue-700";
  if (s >= 40) return "text-amber-700";
  return "text-rose-700";
}

function ringColor(s: number): string {
  if (s >= 80) return "stroke-emerald-500";
  if (s >= 60) return "stroke-blue-500";
  if (s >= 40) return "stroke-amber-500";
  return "stroke-rose-500";
}

export default function InterviewReportView({ report, onRetry, onBack }: Props) {
  const overall = report.overallScore;
  const ringR   = 56;
  const circ    = 2 * Math.PI * ringR;
  const offset  = circ - (Math.max(0, Math.min(100, overall)) / 100) * circ;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Hero — overall + meta scores */}
      <section className="bg-slate-950 text-white rounded-3xl p-7 sm:p-8 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-start gap-6 flex-wrap">
          {/* Score ring */}
          <div className="relative w-36 h-36 flex-shrink-0">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 144 144">
              <circle cx="72" cy="72" r={ringR} className="stroke-white/10" strokeWidth="12" fill="none" />
              <motion.circle
                cx="72" cy="72" r={ringR}
                className={ringColor(overall)}
                strokeWidth="12"
                strokeLinecap="round"
                fill="none"
                initial={{ strokeDasharray: circ, strokeDashoffset: circ }}
                animate={{ strokeDasharray: circ, strokeDashoffset: offset }}
                transition={{ duration: 1.0, ease: [0.21, 0.47, 0.32, 0.98] }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums">{overall}</span>
              <span className="text-[11px] text-white/60 mt-0.5">/ 100</span>
            </div>
          </div>

          <div className="flex-1 min-w-[220px]">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur border border-white/15 text-[11px] font-semibold mb-3">
              <Award size={11} className="text-amber-300" /> Practice score
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-2">Your interview feedback</h2>
            <p className="text-sm text-white/70 leading-relaxed max-w-xl">{report.disclaimer}</p>
          </div>
        </div>

        {/* Sub-scores grid — show "score / 100" so the user reads each as a
            fraction, not an opaque number. The dimmer "/100" suffix keeps
            the headline number prominent while making the scale obvious. */}
        <div className="relative mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SCORE_LABELS.map(({ key, label }) => {
            const v = (report[key] as number) ?? 0;
            return (
              <div key={key} className="bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5">
                <p className="text-[11px] text-white/60 leading-none mb-1.5">{label}</p>
                <p className={`leading-none ${scoreColor(v)} brightness-150`}>
                  <span className="text-xl font-bold tabular-nums">{v}</span>
                  <span className="text-[11px] font-medium opacity-60 ml-0.5">/100</span>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Strengths + weaknesses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FeedbackList
          title="What went well"
          tone="emerald"
          icon={<Wand2 size={14} className="text-emerald-700" />}
          items={report.strengths}
        />
        <FeedbackList
          title="Areas to improve"
          tone="rose"
          icon={<AlertTriangle size={14} className="text-rose-700" />}
          items={report.weaknesses}
        />
      </div>

      {/* Red flags */}
      {report.redFlagsToImprove.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h3 className="text-base font-bold text-amber-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-700" /> Red flags to address before the real interview
          </h3>
          <ul className="space-y-1.5">
            {report.redFlagsToImprove.map((s, i) => (
              <li key={i} className="text-sm text-amber-900 flex items-start gap-2 leading-relaxed">
                <span className="mt-0.5 text-amber-700">•</span>{s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recommended practice */}
      {report.recommendedPractice.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Lightbulb size={15} className="text-amber-500" /> Recommended practice
          </h3>
          <ol className="space-y-2">
            {report.recommendedPractice.map((s, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2 leading-relaxed">
                <span className="text-slate-400 font-bold tabular-nums w-4">{i + 1}.</span>{s}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Sample improved answers */}
      {report.sampleImprovedAnswers.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Check size={15} className="text-emerald-700" /> Sample improved answers
          </h3>
          {report.sampleImprovedAnswers.map((s, i) => (
            <div key={i} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Q. {s.question}</p>
              <p className="text-sm text-slate-900 leading-relaxed mb-2">{s.improvedAnswer}</p>
              <p className="text-xs text-slate-500 italic leading-relaxed">{s.whyBetter}</p>
            </div>
          ))}
        </section>
      )}

      {/* Footer actions */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <button
          onClick={onBack}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft size={14} /> Back to dashboard
        </button>
        <button
          onClick={onRetry}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-md shadow-slate-900/20"
        >
          <RotateCcw size={14} /> Practice again
        </button>
      </div>

      <p className="text-[11px] text-slate-400 text-center pt-2 leading-relaxed max-w-xl mx-auto">
        {report.disclaimer}
      </p>
    </motion.div>
  );
}

function FeedbackList({
  title, items, icon, tone,
}: {
  title: string;
  items: string[];
  icon:  React.ReactNode;
  tone:  "emerald" | "rose";
}) {
  if (items.length === 0) return null;
  const cls =
    tone === "emerald"
      ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
      : "bg-rose-50/60 border-rose-200 text-rose-900";
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <h3 className="text-sm font-bold flex items-center gap-2 mb-2">{icon} {title}</h3>
      <ul className="space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className="text-[13px] flex items-start gap-2 leading-relaxed">
            <span className="mt-1 opacity-70">•</span>{s}
          </li>
        ))}
      </ul>
    </div>
  );
}
