import { ChevronRight, Mic } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// InterviewRow — list row for F-1 practice interview reports, used by the
// Practice history screen. (The old ReportRow twin was removed once the
// Matches tab replaced the dashboard report list.)
// ─────────────────────────────────────────────────────────────────────────────

export function InterviewRow({ report, onClick }: { report: any; onClick: () => void }) {
  const overall = typeof report.overallScore === "number" ? report.overallScore : null;
  const created = report.createdAt?.toDate?.() as Date | undefined;
  const dateStr = created
    ? created.toLocaleDateString(undefined, { month: "short", day: "numeric", year: created.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
    : "Recent";

  // Score-colored dot. Mirrors the palette inside InterviewReportView so the
  // dashboard preview reads consistently with the detail page.
  const dotClass =
    overall == null    ? "bg-slate-300"
    : overall >= 80    ? "bg-emerald-500"
    : overall >= 60    ? "bg-blue-500"
    : overall >= 40    ? "bg-amber-500"
    :                    "bg-rose-500";

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-card border border-slate-200/70 shadow-card hover:shadow-card-hover p-4 sm:p-5 transition-shadow group flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-2xl bg-ink text-white flex items-center justify-center flex-shrink-0">
        <Mic size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <h3 className="text-[15px] font-bold text-slate-900 truncate">F-1 practice interview</h3>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
            {overall != null ? `${overall}/100` : "—"}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">
          With Anna · {dateStr}
        </p>
      </div>
      <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
    </button>
  );
}
