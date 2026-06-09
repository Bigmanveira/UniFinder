// ─────────────────────────────────────────────────────────────────────────────
// RoadmapPage — the new personalised Study Abroad Roadmap.
//
// Replaced (2026-06-09) the prior static 7-stage educational roadmap.
// The old `roadmapProgress/{uid}` collection is left intact in Firestore
// for any historical data; this page no longer reads or writes that
// collection. The legacy content module (src/lib/roadmap/content) is
// also left in the codebase but no longer mounted.
//
// New behaviour:
//   - On load, read studyRoadmaps/{uid} via roadmapClient.
//   - If no doc exists → redirect to /app/roadmap/onboarding (the
//     6-question diagnostic).
//   - Otherwise render: stage tracker → current-stage hero → checklist
//     for the current stage → recommended tool → "update my stage"
//     control → upcoming stages preview.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Loader2,
  Sparkles, Lock, AlertTriangle, RotateCw, Pencil,
  CircleDot, Circle, CheckCircle2, Hourglass, Ban,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  subscribeStudyRoadmap,
  updateChecklistItemStatus,
  updateRoadmapStage,
} from "../lib/roadmap/roadmapClient";
import {
  ROADMAP_STAGES,
  ROADMAP_STAGE_ORDER,
  LABELS,
  type ChecklistItem,
  type ChecklistItemStatus,
  type CurrentProcessStatus,
  type RoadmapStageId,
  type StudyRoadmap,
} from "../lib/roadmap/studyAbroad";

const STATUS_META: Record<ChecklistItemStatus, { label: string; icon: React.ReactNode; chip: string }> = {
  not_started:  { label: "Not started",   icon: <Circle size={13} />,        chip: "bg-slate-100 text-slate-600 border-slate-200" },
  in_progress:  { label: "In progress",   icon: <Hourglass size={13} />,     chip: "bg-blue-50 text-blue-700 border-blue-200" },
  completed:    { label: "Completed",     icon: <CheckCircle2 size={13} />,  chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  blocked:      { label: "Blocked",       icon: <Ban size={13} />,           chip: "bg-rose-50 text-rose-700 border-rose-200" },
  needs_review: { label: "Needs review",  icon: <AlertTriangle size={13} />, chip: "bg-amber-50 text-amber-800 border-amber-200" },
};

export default function RoadmapPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [roadmap, setRoadmap]   = useState<StudyRoadmap | null | "loading">("loading");
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [updatingStage, setUpdatingStage]   = useState(false);
  const [stageOpen, setStageOpen]           = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  // Subscribe to the user's roadmap doc. Live updates so any change
  // (here or in another tab) reflects immediately.
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeStudyRoadmap(
      user.uid,
      (rm) => setRoadmap(rm),
      (err) => {
        console.error("[roadmap] subscribe error:", err);
        setError("Could not load your roadmap. Refresh and try again.");
        setRoadmap(null);
      },
    );
    return () => unsub();
  }, [user]);

  // No-doc → onboarding. Single redirect; do nothing while still
  // resolving auth or the initial Firestore read.
  useEffect(() => {
    if (authLoading) return;
    if (roadmap === "loading") return;
    if (roadmap === null) navigate("/app/roadmap/onboarding", { replace: true });
  }, [roadmap, authLoading, navigate]);

  const handleChecklistChange = async (item: ChecklistItem, next: ChecklistItemStatus) => {
    if (!user) return;
    setUpdatingItemId(item.id);
    setError(null);
    try {
      await updateChecklistItemStatus({ uid: user.uid, itemId: item.id, status: next });
    } catch (err: any) {
      console.error("[roadmap] checklist update failed:", err);
      setError(err?.message ?? "Could not update that item.");
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleStageChange = async (nextStage: RoadmapStageId, nextStatus: CurrentProcessStatus | undefined) => {
    if (!user) return;
    setUpdatingStage(true);
    setError(null);
    try {
      await updateRoadmapStage({
        uid: user.uid,
        newStage: nextStage,
        newProcessStatus: nextStatus,
      });
      setStageOpen(false);
    } catch (err: any) {
      console.error("[roadmap] stage update failed:", err);
      setError(err?.message ?? "Could not update your stage.");
    } finally {
      setUpdatingStage(false);
    }
  };

  if (authLoading || roadmap === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={20} className="text-slate-400 animate-spin" />
      </div>
    );
  }
  if (roadmap === null) {
    // Effect above will redirect; render nothing in the meantime.
    return null;
  }

  return <RoadmapDashboard
    roadmap={roadmap}
    updatingItemId={updatingItemId}
    updatingStage={updatingStage}
    stageOpen={stageOpen}
    setStageOpen={setStageOpen}
    error={error}
    onChecklistChange={handleChecklistChange}
    onStageChange={handleStageChange}
  />;
}

// ─────────────────────────────────────────────────────────────────────
// Roadmap dashboard — the meat of the new page.
// ─────────────────────────────────────────────────────────────────────
function RoadmapDashboard({
  roadmap, updatingItemId, updatingStage, stageOpen, setStageOpen,
  error, onChecklistChange, onStageChange,
}: {
  roadmap: StudyRoadmap;
  updatingItemId: string | null;
  updatingStage: boolean;
  stageOpen: boolean;
  setStageOpen: (v: boolean) => void;
  error: string | null;
  onChecklistChange: (item: ChecklistItem, next: ChecklistItemStatus) => Promise<void>;
  onStageChange: (nextStage: RoadmapStageId, nextStatus: CurrentProcessStatus | undefined) => Promise<void>;
}) {
  const { user } = useAuth();
  const currentMeta = ROADMAP_STAGES[roadmap.currentStage];
  const currentStageIndex = ROADMAP_STAGE_ORDER.indexOf(roadmap.currentStage);

  // Items relevant to the current stage — surfaced first
  const currentItems = useMemo(
    () => roadmap.checklist.filter((it) => it.stage === roadmap.currentStage),
    [roadmap.checklist, roadmap.currentStage],
  );

  const requiredDone   = currentItems.filter((i) => i.required && i.status === "completed").length;
  const requiredTotal  = currentItems.filter((i) => i.required).length;

  // First-name from the auth user (or display name); fallback to email handle.
  const firstName = (user?.displayName ?? user?.email?.split("@")[0] ?? "there").split(/[\s@]/)[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 left-1/4 w-[560px] h-[560px] bg-gradient-to-br from-blue-300/20 via-violet-300/15 to-transparent rounded-full blur-[140px] animate-pulse" style={{ animationDuration: "9s" }} />
        <div className="absolute top-1/2 -right-32 w-[480px] h-[480px] bg-gradient-to-br from-emerald-300/15 via-cyan-200/10 to-transparent rounded-full blur-[140px] animate-pulse" style={{ animationDuration: "11s", animationDelay: "2s" }} />
      </div>

      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/app" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to dashboard">
            <ArrowLeft size={15} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">My Study Abroad Roadmap</h1>
            <p className="text-xs text-slate-500 truncate">Your personalised journey to studying in the USA</p>
          </div>
          <Link
            to="/app/roadmap/onboarding?update=1"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Re-run the diagnostic"
          >
            <RotateCw size={12} /> Re-run diagnostic
          </Link>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-5 py-8 w-full flex-1 space-y-7">
        {/* ── Hero / welcome ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-[28px] bg-slate-950 text-white p-7 sm:p-10 shadow-xl shadow-slate-900/20">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 pointer-events-none" aria-hidden />
          <div className={`absolute -top-32 -right-32 w-72 h-72 bg-gradient-to-br ${currentMeta.accentFrom} ${currentMeta.accentTo} opacity-30 rounded-full blur-3xl pointer-events-none`} aria-hidden />
          <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" aria-hidden />

          <div className="relative">
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-blue-300 mb-3">
              Welcome back, {firstName} 👋
            </p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.05] mb-3 max-w-3xl">
              You're in{" "}
              <span className={`bg-gradient-to-r ${currentMeta.accentFrom} ${currentMeta.accentTo} bg-clip-text text-transparent`}>
                {currentMeta.title}
              </span>
              .
            </h2>
            <p className="text-[15px] sm:text-base text-white/75 leading-relaxed max-w-2xl mb-6">
              {currentMeta.description}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={roadmap.recommendedTool.route}
                className="inline-flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-slate-100 text-sm font-bold px-6 py-3 rounded-2xl transition-colors shadow-lg"
              >
                <Sparkles size={14} /> {roadmap.recommendedTool.label} <ArrowRight size={14} />
              </Link>
              <button
                onClick={() => setStageOpen(!stageOpen)}
                className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/15 text-white text-sm font-bold px-5 py-3 rounded-2xl transition-colors"
              >
                <Pencil size={13} /> Update my stage
              </button>
            </div>

            {stageOpen && (
              <StagePicker
                current={roadmap.currentStage}
                currentStatus={roadmap.currentProcessStatus}
                disabled={updatingStage}
                onPick={onStageChange}
                onClose={() => setStageOpen(false)}
              />
            )}
          </div>
        </section>

        {/* ── Stage tracker ─────────────────────────────────────────── */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-black tracking-[0.18em] uppercase text-slate-500">Your journey</p>
            <p className="text-xs text-slate-500">
              Stage <span className="font-black text-slate-900">{currentStageIndex + 1}</span> of {ROADMAP_STAGE_ORDER.length}
            </p>
          </div>
          <StageTracker currentStage={roadmap.currentStage} />
        </section>

        {/* ── Two-column: progress + recommended tool ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ProgressCard
            progressPercentage={roadmap.progressPercentage}
            requiredDone={requiredDone}
            requiredTotal={requiredTotal}
            currentStage={roadmap.currentStage}
          />
          <RecommendedToolCard roadmap={roadmap} />
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium rounded-2xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Checklist ─────────────────────────────────────────────── */}
        <ChecklistSection
          items={currentItems}
          stage={roadmap.currentStage}
          updatingItemId={updatingItemId}
          onChecklistChange={onChecklistChange}
        />

        {/* ── Upcoming stages preview ───────────────────────────────── */}
        <UpcomingStages currentStage={roadmap.currentStage} checklist={roadmap.checklist} />

        {/* ── Compliance disclaimer ─────────────────────────────────── */}
        <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto leading-relaxed pt-4">
          This roadmap is a guide. Steps and requirements vary by school, programme, and embassy. We don't guarantee any admission or visa outcome — verify every detail with your school's DSO and the US embassy in your country.
        </p>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stage tracker — horizontal pipeline of stages.
// ─────────────────────────────────────────────────────────────────────
function StageTracker({ currentStage }: { currentStage: RoadmapStageId }) {
  const currentIndex = ROADMAP_STAGE_ORDER.indexOf(currentStage);
  return (
    <div className="overflow-x-auto -mx-2 px-2" style={{ scrollbarWidth: "none" }}>
      <div className="inline-flex items-center gap-2 sm:gap-3 min-w-full">
        {ROADMAP_STAGE_ORDER.map((stageId, idx) => {
          const meta   = ROADMAP_STAGES[stageId];
          const state: "completed" | "current" | "upcoming" =
            idx < currentIndex ? "completed" : idx === currentIndex ? "current" : "upcoming";
          return (
            <div key={stageId} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-[180px]">
              <div className="flex-1 min-w-0">
                <div className={`relative rounded-2xl border-2 p-3 sm:p-4 transition-all ${
                  state === "current"
                    ? `bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} text-white border-transparent shadow-md`
                    : state === "completed"
                      ? "bg-white border-slate-300 text-slate-900"
                      : "bg-slate-50 border-slate-200 text-slate-400"
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-[10px] font-black ${
                      state === "current" ? "bg-white/20 text-white" :
                      state === "completed" ? "bg-emerald-100 text-emerald-700" :
                      "bg-slate-200 text-slate-500"
                    }`}>
                      {state === "completed" ? <Check size={12} className="stroke-[3]" /> : idx + 1}
                    </span>
                    <span className={`text-[10px] font-black tracking-widest uppercase ${
                      state === "current" ? "text-white/80" :
                      state === "completed" ? "text-slate-500" : "text-slate-400"
                    }`}>
                      {state === "completed" ? "Done" : state === "current" ? "You are here" : "Upcoming"}
                    </span>
                  </div>
                  <p className={`text-sm font-black leading-tight ${
                    state === "current" ? "text-white" :
                    state === "completed" ? "text-slate-900" : "text-slate-500"
                  }`}>
                    {meta.title}
                  </p>
                </div>
              </div>
              {idx < ROADMAP_STAGE_ORDER.length - 1 && (
                <ArrowRight size={16} className="text-slate-300 flex-shrink-0 hidden sm:block" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Progress card
// ─────────────────────────────────────────────────────────────────────
function ProgressCard({
  progressPercentage, requiredDone, requiredTotal, currentStage,
}: {
  progressPercentage: number;
  requiredDone: number;
  requiredTotal: number;
  currentStage: RoadmapStageId;
}) {
  const meta = ROADMAP_STAGES[currentStage];
  return (
    <section className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} text-white flex items-center justify-center shadow-md`}>
          <CircleDot size={18} />
        </div>
        <div>
          <p className="text-[10px] font-black tracking-widest uppercase text-slate-500">Your progress</p>
          <p className="text-sm font-black text-slate-900">{meta.title}</p>
        </div>
      </div>
      <p className="text-4xl font-black text-slate-900 tabular-nums tracking-tight leading-none mb-3">{progressPercentage}<span className="text-2xl text-slate-400">%</span></p>
      <p className="text-xs text-slate-600 leading-relaxed mb-4">
        {requiredDone} of {requiredTotal} required items done in this stage.
      </p>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${meta.accentFrom} ${meta.accentTo} rounded-full transition-all duration-700`}
          style={{ width: `${Math.min(progressPercentage, 100)}%` }}
        />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Recommended tool card
// ─────────────────────────────────────────────────────────────────────
function RecommendedToolCard({ roadmap }: { roadmap: StudyRoadmap }) {
  const meta = ROADMAP_STAGES[roadmap.currentStage];
  return (
    <section className="lg:col-span-2 relative overflow-hidden bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
      <div className={`absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} opacity-15 pointer-events-none`} aria-hidden />
      <div className="relative">
        <div className="flex items-start gap-4 mb-5">
          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} text-white flex items-center justify-center shadow-md flex-shrink-0`}>
            <Sparkles size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-500 mb-1">Recommended next</p>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">{roadmap.recommendedTool.label}</h3>
          </div>
        </div>
        <p className="text-[14px] text-slate-700 leading-relaxed mb-5">
          {roadmap.recommendedTool.description}
        </p>
        <Link
          to={roadmap.recommendedTool.route}
          className={`inline-flex items-center gap-2 text-sm font-bold text-white px-6 py-3 rounded-2xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} hover:opacity-95 shadow-md transition-opacity`}
        >
          Open recommended tool <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Checklist — current stage only
// ─────────────────────────────────────────────────────────────────────
function ChecklistSection({
  items, stage, updatingItemId, onChecklistChange,
}: {
  items: ChecklistItem[];
  stage: RoadmapStageId;
  updatingItemId: string | null;
  onChecklistChange: (item: ChecklistItem, next: ChecklistItemStatus) => Promise<void>;
}) {
  const meta = ROADMAP_STAGES[stage];
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black tracking-widest uppercase text-slate-500 mb-1">Stage checklist</p>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">{meta.title}</h3>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${meta.accentChipBg} ${meta.accentText} ${meta.accentChipBorder}`}>
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="space-y-2.5">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            updating={updatingItemId === item.id}
            onChange={(next) => onChecklistChange(item, next)}
          />
        ))}
      </ul>
    </section>
  );
}

function ChecklistRow({
  item, updating, onChange,
}: {
  item: ChecklistItem;
  updating: boolean;
  onChange: (next: ChecklistItemStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[item.status];
  const isCompleted = item.status === "completed";

  return (
    <li
      className={`bg-white rounded-2xl border shadow-sm transition-colors ${
        isCompleted ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        {/* Toggle button — single tap cycles not_started → in_progress → completed. Other statuses available via expanded controls. */}
        <button
          type="button"
          onClick={() => {
            if (item.status === "not_started")      onChange("in_progress");
            else if (item.status === "in_progress") onChange("completed");
            else if (item.status === "completed")   onChange("not_started");
            else                                    onChange("not_started"); // blocked / needs_review → reset
          }}
          disabled={updating}
          className={`w-6 h-6 rounded-md flex-shrink-0 mt-0.5 border-2 flex items-center justify-center transition-colors ${
            isCompleted
              ? "bg-emerald-500 border-emerald-500 text-white"
              : item.status === "in_progress"
                ? "bg-blue-100 border-blue-400 text-blue-700"
                : "bg-white border-slate-300 hover:border-slate-400"
          }`}
          aria-label={`Toggle ${item.title}`}
        >
          {isCompleted && <Check size={14} className="stroke-[3]" />}
          {item.status === "in_progress" && <Hourglass size={11} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-left flex-1 min-w-0"
            >
              <p className={`text-[14px] font-black leading-snug ${isCompleted ? "text-emerald-900" : "text-slate-900"}`}>
                {item.title}
                {item.required && <span className="text-rose-500 ml-1">*</span>}
              </p>
              {!expanded && (
                <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>
              )}
            </button>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${meta.chip} flex-shrink-0`}>
              {meta.icon} {meta.label}
            </span>
          </div>

          {expanded && (
            <div className="mt-3 space-y-3">
              <p className="text-[13px] text-slate-700 leading-relaxed">{item.description}</p>
              <div className="flex flex-wrap items-center gap-2">
                {(["not_started", "in_progress", "completed", "blocked", "needs_review"] as ChecklistItemStatus[]).map((s) => {
                  const m = STATUS_META[s];
                  const active = item.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onChange(s)}
                      disabled={updating}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                        active
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                      } disabled:opacity-50`}
                    >
                      {m.icon} {m.label}
                    </button>
                  );
                })}
                {item.toolRoute && (
                  <Link
                    to={item.toolRoute}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors"
                  >
                    Open tool <ArrowRight size={11} />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors flex-shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Upcoming stages — collapsed preview of what's next
// ─────────────────────────────────────────────────────────────────────
function UpcomingStages({
  currentStage, checklist,
}: {
  currentStage: RoadmapStageId;
  checklist: ChecklistItem[];
}) {
  const currentIdx = ROADMAP_STAGE_ORDER.indexOf(currentStage);
  const upcoming = ROADMAP_STAGE_ORDER.slice(currentIdx + 1);
  if (upcoming.length === 0) return null;

  return (
    <section>
      <p className="text-[10px] font-black tracking-widest uppercase text-slate-500 mb-3">Coming up</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {upcoming.map((stageId) => {
          const meta = ROADMAP_STAGES[stageId];
          const itemCount = checklist.filter((i) => i.stage === stageId).length;
          return (
            <div key={stageId} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} opacity-80 text-white flex items-center justify-center flex-shrink-0`}>
                  <Lock size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upcoming</p>
                  <p className="text-[15px] font-black text-slate-900 leading-tight">{meta.title}</p>
                </div>
              </div>
              <p className="text-[12px] text-slate-600 leading-relaxed">{meta.description}</p>
              <p className="text-[10px] text-slate-400 mt-3">{itemCount} item{itemCount === 1 ? "" : "s"} when you get here</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stage picker — opens from "Update my stage" button.
// ─────────────────────────────────────────────────────────────────────
function StagePicker({
  current, currentStatus, disabled, onPick, onClose,
}: {
  current: RoadmapStageId;
  currentStatus: CurrentProcessStatus;
  disabled: boolean;
  onPick: (stage: RoadmapStageId, status: CurrentProcessStatus | undefined) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-black tracking-widest uppercase text-white/80">Pick your new stage</p>
        <button
          type="button"
          onClick={onClose}
          className="text-white/60 hover:text-white text-[12px] font-bold transition-colors"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ROADMAP_STAGE_ORDER.map((stageId) => {
          const meta = ROADMAP_STAGES[stageId];
          const isCurrent = stageId === current;
          return (
            <button
              key={stageId}
              type="button"
              onClick={() => onPick(stageId, undefined)}
              disabled={disabled || isCurrent}
              className={`text-left px-4 py-3 rounded-2xl border transition-colors ${
                isCurrent
                  ? "bg-white text-slate-900 border-white"
                  : "bg-white/5 text-white border-white/15 hover:bg-white/15 hover:border-white/25"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <p className="text-[13px] font-black mb-0.5">{meta.title}</p>
              <p className={`text-[11px] leading-snug ${isCurrent ? "text-slate-500" : "text-white/60"}`}>
                {isCurrent ? "Your current stage" : meta.short}
              </p>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-white/60 mt-4 leading-relaxed">
        Your checklist progress is preserved. Currently labelled "{LABELS.currentProcessStatus[currentStatus]}."
      </p>
    </div>
  );
}
