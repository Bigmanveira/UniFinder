import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bot,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Mic,
  HelpCircle,
} from "lucide-react";
import { useAppData } from "../../hooks/useAppData";
import { TabScreen } from "../../components/layout/AppShell";
import { ScreenHeader, HeaderIconButton } from "../../components/layout/ScreenHeader";
import AppFooter from "../../components/layout/AppFooter";
import { ROADMAP_STAGES, ROADMAP_STAGE_ORDER, type ChecklistItem } from "../../lib/roadmap/studyAbroad";

// ─────────────────────────────────────────────────────────────────────────────
// VisaHubScreen — the mockups' "F-1 Visa Hub": stage readiness card from the
// user's real roadmap checklist, the AI interview simulator card (live HeyGen
// session behind /app/visa-interview), and recent practice scores.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_QUESTION =
  "Why did you choose this specific university in the US instead of studying in your home country?";

export default function VisaHubScreen() {
  const navigate = useNavigate();
  const { studyRoadmap, interviewReports } = useAppData();

  const stageMeta = studyRoadmap ? ROADMAP_STAGES[studyRoadmap.currentStage] : null;
  const stageNumber = studyRoadmap ? ROADMAP_STAGE_ORDER.indexOf(studyRoadmap.currentStage) + 1 : 0;

  // The current stage's checklist slice — capped at 4 rows like the mockup.
  const stageItems: ChecklistItem[] = useMemo(() => {
    if (!studyRoadmap) return [];
    // Legacy roadmap docs may predate the checklist field — guard so a
    // missing array can never crash the screen.
    const items = (studyRoadmap.checklist ?? []).filter((i) => i.stage === studyRoadmap.currentStage);
    const done = items.filter((i) => i.status === "completed" || i.status === "assumed_complete");
    const open = items.filter((i) => !(i.status === "completed" || i.status === "assumed_complete"));
    return [...done.slice(0, 3), ...open].slice(0, 4);
  }, [studyRoadmap]);

  const latestScore = interviewReports[0]?.overallScore ?? null;

  return (
    <TabScreen>
      <ScreenHeader
        eyebrow="Immigration readiness"
        title="F-1 Visa Hub"
        action={
          <HeaderIconButton
            icon={<Calendar size={20} />}
            label="Open roadmap timeline"
            onClick={() => navigate("/app/roadmap")}
          />
        }
      />

      {/* Readiness card — real roadmap stage + checklist */}
      <section className="mb-6 rounded-card-lg border border-slate-100 bg-white p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-eyebrow text-primary-500">
              {studyRoadmap ? `Stage ${stageNumber} of ${ROADMAP_STAGE_ORDER.length}` : "Get started"}
            </span>
            <h2 className="truncate text-lg font-black tracking-tight">
              {stageMeta ? stageMeta.title : "Build your readiness plan"}
            </h2>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-sm font-black text-primary-600">
            {studyRoadmap ? `${Math.min(studyRoadmap.progressPercentage, 100)}%` : "0%"}
          </div>
        </div>
        <p className="mb-4 text-xs font-medium text-slate-500">
          {stageMeta
            ? stageMeta.description
            : "Six quick questions build a stage-by-stage checklist from first shortlist to your embassy window."}
        </p>

        {studyRoadmap ? (
          <div className="space-y-2">
            {stageItems.map((item, i) => {
              const done = item.status === "completed" || item.status === "assumed_complete";
              const active = !done && stageItems.findIndex((x) => !(x.status === "completed" || x.status === "assumed_complete")) === i;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate("/app/roadmap")}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors ${
                    active
                      ? "border-primary-300 bg-primary-50 hover:border-primary-400"
                      : "border-slate-100 bg-surface hover:border-slate-200"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 size={20} className="shrink-0 text-[#2E7D32]" />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary-500">
                      {active && <span className="h-2 w-2 rounded-full bg-primary-500" />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{item.title}</p>
                    <p className={`truncate text-[10px] font-medium ${active ? "text-primary-600" : "text-slate-500"}`}>
                      {item.description}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      done
                        ? "bg-[#E8F5E9] text-[#2E7D32]"
                        : active
                          ? "bg-white text-primary-600 shadow-sm"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {done ? "Done" : active ? "Active" : "To do"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Link
            to="/app/roadmap/onboarding"
            className="inline-flex items-center gap-2 rounded-full bg-primary-500 px-5 py-2.5 text-xs font-bold text-white shadow-glow transition-colors hover:bg-primary-600"
          >
            Start the 6-question diagnostic <ChevronRight size={14} />
          </Link>
        )}
      </section>

      {/* AI Interview Simulator */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">AI Interview Simulator</h2>
          <span className="text-xs font-bold text-primary-500">Live &amp; voice</span>
        </div>
        <div className="relative overflow-hidden rounded-card-lg bg-ink p-5 text-white shadow-[0_12px_32px_-8px_rgba(26,33,56,0.18)]">
          <div aria-hidden className="absolute -right-10 -top-12 h-40 w-40 rounded-full border-[16px] border-primary-500/20" />
          <div className="relative">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src="/anna.webp"
                  alt="Anna, AI consular officer"
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-white/20 object-cover object-top"
                />
                <div>
                  <p className="text-xs font-bold">Officer Anna</p>
                  <p className="text-[10px] font-medium text-white/60">Strict &amp; real-time simulation</p>
                </div>
              </div>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">
                {latestScore != null ? `Last: ${latestScore}/100` : "~5 min"}
              </span>
            </div>
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-eyebrow text-primary-300">Example question</p>
              <p className="text-sm font-semibold leading-snug">“{SAMPLE_QUESTION}”</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/app/visa-interview"
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary-500 py-3 text-xs font-bold text-white shadow-glow transition-colors hover:bg-primary-600"
              >
                <Mic size={16} /> Start mock interview
              </Link>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white" aria-hidden>
                <Bot size={20} />
              </div>
            </div>
            <p className="mt-3 text-[10px] font-medium text-white/40">
              Practice simulation only — not an official government service.
            </p>
          </div>
        </div>
      </section>

      {/* Practice history */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">Practice history</h2>
          <Link to="/app/interviews" className="text-xs font-bold text-primary-500">View all</Link>
        </div>
        {interviewReports.length === 0 ? (
          <div className="rounded-card border border-dashed border-slate-300 bg-white p-5 text-center shadow-card">
            <p className="text-sm font-black">No sessions yet</p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Your first mock interview gets scored across 8 readiness dimensions.
            </p>
          </div>
        ) : (
          <div className="rounded-card border border-slate-100 bg-white p-2 shadow-card">
            {interviewReports.slice(0, 3).map((r, i) => {
              const score = typeof r.overallScore === "number" ? r.overallScore : null;
              const created = r.createdAt?.toDate?.() as Date | undefined;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate(`/app/interview-reports/${r.id}`)}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface ${
                    i > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
                    <Mic size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold">Practice with Anna</p>
                    <p className="text-[10px] font-medium text-slate-500">
                      {created ? created.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Recent"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-black">
                    {score != null ? `${score}/100` : "—"}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-slate-400" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Question nudge */}
      <section className="mb-4">
        <div className="flex items-center gap-3 rounded-card border border-slate-100 bg-white p-4 shadow-card">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
            <HelpCircle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold">Have a visa question?</p>
            <p className="text-[10px] font-medium text-slate-500">Ask about 214(b), home ties, or OPT in the support chat.</p>
          </div>
          <span className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white">Chat ↘</span>
        </div>
      </section>

      <AppFooter />
    </TabScreen>
  );
}
