// ─────────────────────────────────────────────────────────────────────────────
// RoadmapPage — personalised Study Abroad Roadmap.
//
// Visual language redesigned 2026-06-09 around the user-supplied inspo:
// light card-on-light background, bold contextual heading, a horizontal
// stepper with circular check icons + numbered step badges + labels.
// Replaces the previous dark gradient hero.
//
// Logic changes in this pass:
//   1. Checklist toggle is now single-click: not_started → completed.
//      The granular "in_progress / blocked / needs_review" states are
//      still available through the expanded controls.
//   2. External activity reconcile on load — if the user already has a
//      match report or visa interview report, the matching checklist
//      items get auto-marked completed (silently, only when currently
//      not_started).
//   3. "Continue to <next stage>" CTA appears once all required items
//      in the current stage are completed.
//   4. CTAs for stages whose tool isn't built yet open a coming-soon
//      modal instead of navigating to a dead route.
//
// Existing live features (auth, Firestore, credits, Paystack, match
// reports, visa interview, admin portal) are not touched by this file.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Loader2,
  AlertTriangle, RotateCw, Pencil, Plus,
  Circle, CheckCircle2, Hourglass, Ban,
  Target, Compass, Flag, Construction,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  reconcileFromExternalActivity,
  subscribeStudyRoadmap,
  updateChecklistItemStatus,
  updateRoadmapStage,
} from "../lib/roadmap/roadmapClient";
import {
  ROADMAP_STAGES,
  ROADMAP_STAGE_ORDER,
  LABELS,
  getNextStage,
  isStageRequiredComplete,
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
  const [updatingStage,  setUpdatingStage]  = useState(false);
  const [stageOpen,      setStageOpen]      = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [comingSoonOpen, setComingSoonOpen] = useState<RoadmapStageId | null>(null);

  // Live subscription. Banner + checklist + tracker all share this stream
  // so any change (here or in another tab) reflects instantly across the
  // entire roadmap surface.
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

  // External-activity reconcile — runs ONCE when the page first loads
  // a real roadmap doc. Marks d_first_match / sm_unlock / v_practice as
  // completed if the user has already done the equivalent action
  // elsewhere in the app.
  const [reconciled, setReconciled] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (reconciled) return;
    if (roadmap === "loading" || roadmap === null) return;
    setReconciled(true);
    void reconcileFromExternalActivity(user.uid).catch((err) => {
      console.warn("[roadmap] reconcile failed (non-fatal):", err);
    });
  }, [user, roadmap, reconciled]);

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

  // Coming-soon-aware CTA handler. If the target stage's tool isn't
  // built yet, open the modal instead of navigating to a placeholder
  // route. The caller passes the stage id so we know which "X is
  // coming soon" copy to render.
  const handleStageCtaClick = (stage: RoadmapStageId) => {
    const meta = ROADMAP_STAGES[stage];
    if (meta.comingSoon) {
      setComingSoonOpen(stage);
      return;
    }
    navigate(meta.toolRoute);
  };

  if (authLoading || roadmap === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={20} className="text-slate-400 animate-spin" />
      </div>
    );
  }
  if (roadmap === null) return null;

  return (
    <>
      <RoadmapDashboard
        roadmap={roadmap}
        updatingItemId={updatingItemId}
        updatingStage={updatingStage}
        stageOpen={stageOpen}
        setStageOpen={setStageOpen}
        error={error}
        onChecklistChange={handleChecklistChange}
        onStageChange={handleStageChange}
        onStageCtaClick={handleStageCtaClick}
      />
      <ComingSoonModal
        stage={comingSoonOpen}
        onClose={() => setComingSoonOpen(null)}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Roadmap dashboard
// ─────────────────────────────────────────────────────────────────────
function RoadmapDashboard({
  roadmap, updatingItemId, updatingStage, stageOpen, setStageOpen,
  error, onChecklistChange, onStageChange, onStageCtaClick,
}: {
  roadmap: StudyRoadmap;
  updatingItemId: string | null;
  updatingStage: boolean;
  stageOpen: boolean;
  setStageOpen: (v: boolean) => void;
  error: string | null;
  onChecklistChange: (item: ChecklistItem, next: ChecklistItemStatus) => Promise<void>;
  onStageChange: (nextStage: RoadmapStageId, nextStatus: CurrentProcessStatus | undefined) => Promise<void>;
  onStageCtaClick: (stage: RoadmapStageId) => void;
}) {
  const { user } = useAuth();
  const currentMeta = ROADMAP_STAGES[roadmap.currentStage];
  const currentStageIndex = ROADMAP_STAGE_ORDER.indexOf(roadmap.currentStage);

  const currentItems = useMemo(
    () => roadmap.checklist.filter((it) => it.stage === roadmap.currentStage),
    [roadmap.checklist, roadmap.currentStage],
  );

  const requiredDone   = currentItems.filter((i) => i.required && i.status === "completed").length;
  const requiredTotal  = currentItems.filter((i) => i.required).length;

  // Are all required items in this stage done? Drives the "Next stage" CTA.
  const stageComplete = isStageRequiredComplete(roadmap.checklist, roadmap.currentStage);
  const nextStage     = getNextStage(roadmap.currentStage);

  const firstName = (user?.displayName ?? user?.email?.split("@")[0] ?? "there").split(/[\s@]/)[0];

  // Contextual hero heading + sub. Keeps the "You're almost there!"
  // feel from the inspo but maps to actual progress state.
  const heroHeadline = stageComplete && nextStage
    ? "You're ready to advance."
    : roadmap.progressPercentage >= 75
      ? "You're almost there."
      : roadmap.progressPercentage >= 25
        ? "Making good progress."
        : "Let's get going.";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 left-1/4 w-[560px] h-[560px] bg-gradient-to-br from-emerald-300/20 via-cyan-200/15 to-transparent rounded-full blur-[160px] animate-pulse" style={{ animationDuration: "10s" }} />
        <div className="absolute top-1/2 -right-32 w-[480px] h-[480px] bg-gradient-to-br from-blue-300/15 via-violet-200/10 to-transparent rounded-full blur-[140px] animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />
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

      <main className="relative max-w-6xl mx-auto px-5 py-8 w-full flex-1 space-y-6">
        {/* ── Hero card (light, inspo-style) ─────────────────────────── */}
        <section className="bg-white rounded-[28px] border border-slate-200 shadow-[0_4px_24px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="p-7 sm:p-9 sm:pb-7">
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-slate-500 mb-3">
              Welcome back, {firstName}
            </p>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-[1.05] mb-3 max-w-3xl">
              {heroHeadline}
            </h2>
            <p className="text-[15px] sm:text-base text-slate-600 leading-relaxed max-w-2xl mb-6">
              You're in <span className="font-bold text-slate-900">{currentMeta.title}</span>. {currentMeta.description}
            </p>

            {/* CTA row */}
            <div className="flex flex-wrap items-center gap-3">
              {stageComplete && nextStage ? (
                <NextStageButton
                  current={roadmap.currentStage}
                  next={nextStage}
                  disabled={updatingStage}
                  onAdvance={() => void onStageChange(nextStage, undefined)}
                />
              ) : (
                <button
                  onClick={() => onStageCtaClick(roadmap.currentStage)}
                  className={`inline-flex items-center justify-center gap-2 text-white text-sm font-bold px-6 py-3 rounded-2xl shadow-md transition-opacity hover:opacity-95 bg-gradient-to-br ${currentMeta.accentFrom} ${currentMeta.accentTo}`}
                >
                  <Target size={14} /> {currentMeta.primaryCta} <ArrowRight size={14} />
                </button>
              )}
              <button
                onClick={() => setStageOpen(!stageOpen)}
                className="inline-flex items-center gap-2 bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 text-sm font-bold px-5 py-3 rounded-2xl transition-colors"
              >
                <Pencil size={13} /> Update my stage
              </button>
            </div>
          </div>

          {/* Stepper — the heart of the redesign. Lives inside the same
              hero card with a subtle gradient background. */}
          <div className="px-7 sm:px-9 pb-7 sm:pb-9 pt-3">
            <StageStepper currentStage={roadmap.currentStage} />
          </div>
        </section>

        {/* ── Stage picker (collapsible) ─────────────────────────────── */}
        {stageOpen && (
          <StagePicker
            current={roadmap.currentStage}
            currentStatus={roadmap.currentProcessStatus}
            disabled={updatingStage}
            onPick={onStageChange}
            onClose={() => setStageOpen(false)}
          />
        )}

        {/* ── Two-column: progress + recommended tool ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ProgressCard
            progressPercentage={roadmap.progressPercentage}
            requiredDone={requiredDone}
            requiredTotal={requiredTotal}
            currentStage={roadmap.currentStage}
            currentStageIndex={currentStageIndex}
          />
          <RecommendedToolCard
            roadmap={roadmap}
            onClick={() => onStageCtaClick(roadmap.currentStage)}
          />
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

        {/* ── Next-stage CTA (full-width banner when stage complete) ── */}
        {stageComplete && nextStage && (
          <NextStageBanner
            current={roadmap.currentStage}
            next={nextStage}
            disabled={updatingStage}
            onAdvance={() => void onStageChange(nextStage, undefined)}
          />
        )}

        {/* ── Upcoming stages preview ───────────────────────────────── */}
        <UpcomingStages currentStage={roadmap.currentStage} checklist={roadmap.checklist} />

        {/* ── Tip pill (inspo footer) ───────────────────────────────── */}
        <div className="flex justify-center pt-2">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm text-[12px] text-slate-700">
            <Flag size={12} className="text-emerald-600" />
            Tip: tick items as you go — your dashboard banner updates instantly.
          </span>
        </div>

        {/* ── Compliance disclaimer ─────────────────────────────────── */}
        <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto leading-relaxed pt-4 pb-2">
          This roadmap is a guide. Steps and requirements vary by school, programme, and embassy. We don't guarantee any admission or visa outcome — verify every detail with your school's DSO and the US embassy in your country.
        </p>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// StageStepper — inspo-styled horizontal stepper.
// Each stage is a circle + step number + label. Connecting gradient
// fills from left to right up to the current stage so completed stages
// read as "green," current as "active," upcoming as muted.
// ─────────────────────────────────────────────────────────────────────
function StageStepper({ currentStage }: { currentStage: RoadmapStageId }) {
  const currentIndex = ROADMAP_STAGE_ORDER.indexOf(currentStage);
  const totalSteps = ROADMAP_STAGE_ORDER.length;
  // Gradient fill stretches to the centre of the current step circle.
  const fillPercent = totalSteps === 1
    ? 100
    : (currentIndex / (totalSteps - 1)) * 100;

  return (
    <div className="relative">
      {/* Track + fill (sit behind the circles) */}
      <div className="absolute left-5 right-5 sm:left-7 sm:right-7 top-5 sm:top-6 h-1.5 rounded-full bg-slate-100 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="h-full bg-gradient-to-r from-emerald-500 via-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      <div className="relative grid grid-cols-6 gap-1 sm:gap-2">
        {ROADMAP_STAGE_ORDER.map((stageId, idx) => {
          const meta  = ROADMAP_STAGES[stageId];
          const state: "completed" | "current" | "upcoming" =
            idx < currentIndex ? "completed" : idx === currentIndex ? "current" : "upcoming";
          return <StepperNode key={stageId} meta={meta} idx={idx} state={state} />;
        })}
      </div>
    </div>
  );
}

function StepperNode({
  meta, idx, state,
}: {
  meta: typeof ROADMAP_STAGES[RoadmapStageId];
  idx: number;
  state: "completed" | "current" | "upcoming";
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all ${
          state === "completed"
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/30"
            : state === "current"
              ? `bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} text-white shadow-lg ring-4 ring-white`
              : "bg-white text-slate-400 border-2 border-slate-200"
        }`}
      >
        {state === "completed"
          ? <Check size={18} className="stroke-[3]" />
          : state === "current"
            ? <Check size={18} className="stroke-[3]" />
            : <Plus size={18} className="stroke-2" />
        }
        {state === "current" && (
          <span className="absolute inset-[-4px] rounded-full border-2 border-white pointer-events-none" />
        )}
      </div>
      <p className={`text-[10px] font-black tabular-nums mt-2 mb-0.5 ${
        state === "upcoming" ? "text-slate-400" : "text-emerald-700"
      }`}>
        {idx + 1}
      </p>
      <p className={`text-[11px] sm:text-[12px] font-black leading-tight px-0.5 ${
        state === "current" ? "text-slate-900" :
        state === "completed" ? "text-slate-700" :
        "text-slate-400"
      }`}>
        {meta.short}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Progress card
// ─────────────────────────────────────────────────────────────────────
function ProgressCard({
  progressPercentage, requiredDone, requiredTotal, currentStage, currentStageIndex,
}: {
  progressPercentage: number;
  requiredDone: number;
  requiredTotal: number;
  currentStage: RoadmapStageId;
  currentStageIndex: number;
}) {
  const meta = ROADMAP_STAGES[currentStage];
  const stageTotal = ROADMAP_STAGE_ORDER.length;
  return (
    <section className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} text-white flex items-center justify-center shadow-md`}>
          <Target size={18} />
        </div>
        <div>
          <p className="text-[10px] font-black tracking-widest uppercase text-slate-500">Your progress</p>
          <p className="text-sm font-black text-slate-900">Stage {currentStageIndex + 1} of {stageTotal}</p>
        </div>
      </div>
      <p className="text-5xl font-black text-slate-900 tabular-nums tracking-tight leading-none mb-3">
        {progressPercentage}<span className="text-2xl text-slate-400">%</span>
      </p>
      <p className="text-xs text-slate-600 leading-relaxed mb-4">
        {requiredDone} of {requiredTotal} required items done in {meta.title}.
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
// Recommended tool card. Click goes through the coming-soon-aware
// handler so stages with placeholder routes get the modal.
// ─────────────────────────────────────────────────────────────────────
function RecommendedToolCard({
  roadmap, onClick,
}: {
  roadmap: StudyRoadmap;
  onClick: () => void;
}) {
  const meta = ROADMAP_STAGES[roadmap.currentStage];
  return (
    <section className="lg:col-span-2 relative overflow-hidden bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
      <div className={`absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} opacity-15 pointer-events-none`} aria-hidden />
      <div className="relative">
        <div className="flex items-start gap-4 mb-5">
          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} text-white flex items-center justify-center shadow-md flex-shrink-0`}>
            <Compass size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-500 mb-1">Recommended next</p>
            <div className="flex items-start gap-2 flex-wrap">
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">{roadmap.recommendedTool.label}</h3>
              {meta.comingSoon && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black uppercase tracking-widest">
                  <Construction size={10} /> Coming soon
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="text-[14px] text-slate-700 leading-relaxed mb-5">
          {roadmap.recommendedTool.description}
        </p>
        <button
          onClick={onClick}
          className={`inline-flex items-center gap-2 text-sm font-bold text-white px-6 py-3 rounded-2xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} hover:opacity-95 shadow-md transition-opacity`}
        >
          {meta.comingSoon ? "Preview the tool" : "Open recommended tool"} <ArrowRight size={14} />
        </button>
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

  // Single-click toggle: not_started → completed; completed → not_started.
  // Granular states are still accessible via the expanded controls.
  const toggle = () => onChange(isCompleted ? "not_started" : "completed");

  return (
    <li
      className={`bg-white rounded-2xl border shadow-sm transition-colors ${
        isCompleted ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <button
          type="button"
          onClick={toggle}
          disabled={updating}
          className={`w-6 h-6 rounded-md flex-shrink-0 mt-0.5 border-2 flex items-center justify-center transition-all ${
            isCompleted
              ? "bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-500 text-white"
              : "bg-white border-slate-300 hover:border-emerald-400 hover:bg-emerald-50"
          }`}
          aria-label={`Mark ${item.title} ${isCompleted ? "incomplete" : "complete"}`}
        >
          {isCompleted && <Check size={14} className="stroke-[3]" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-left flex-1 min-w-0"
            >
              <p className={`text-[14px] font-black leading-snug ${isCompleted ? "text-emerald-900 line-through decoration-emerald-400/40" : "text-slate-900"}`}>
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
// Next-stage CTA (compact, used in hero) + banner version (full-width,
// used at the bottom of the checklist when current stage is complete).
// ─────────────────────────────────────────────────────────────────────
function NextStageButton({
  current, next, disabled, onAdvance,
}: {
  current: RoadmapStageId;
  next: RoadmapStageId;
  disabled: boolean;
  onAdvance: () => void;
}) {
  void current; // referenced for readability
  const nextMeta = ROADMAP_STAGES[next];
  return (
    <button
      onClick={onAdvance}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 text-white text-sm font-bold px-6 py-3 rounded-2xl shadow-md transition-opacity hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-br ${nextMeta.accentFrom} ${nextMeta.accentTo}`}
    >
      Continue to {nextMeta.title}
      {disabled ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
    </button>
  );
}

function NextStageBanner({
  current, next, disabled, onAdvance,
}: {
  current: RoadmapStageId;
  next: RoadmapStageId;
  disabled: boolean;
  onAdvance: () => void;
}) {
  const currentMeta = ROADMAP_STAGES[current];
  const nextMeta    = ROADMAP_STAGES[next];
  return (
    <section className="relative overflow-hidden bg-white rounded-3xl border-2 border-emerald-300 shadow-lg shadow-emerald-500/10 p-6 sm:p-8">
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl bg-gradient-to-br from-emerald-300 to-emerald-500 opacity-25 pointer-events-none" aria-hidden />
      <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/40 flex-shrink-0">
          <CheckCircle2 size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black tracking-[0.18em] uppercase text-emerald-700 mb-1">{currentMeta.title} complete</p>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight mb-1">
            Ready for {nextMeta.title}?
          </h3>
          <p className="text-[13px] text-slate-700 leading-relaxed max-w-md">
            You've ticked every required item. Advance the roadmap to start working through the next stage.
          </p>
        </div>
        <button
          onClick={onAdvance}
          disabled={disabled}
          className={`inline-flex items-center justify-center gap-2 text-white text-sm font-bold px-7 py-3.5 rounded-2xl shadow-md transition-opacity hover:opacity-95 disabled:opacity-60 bg-gradient-to-br ${nextMeta.accentFrom} ${nextMeta.accentTo}`}
        >
          {disabled ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
          Continue <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Upcoming stages preview
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
                  <Plus size={16} className="stroke-2" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upcoming</p>
                    {meta.comingSoon && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-black uppercase tracking-widest">
                        Soon
                      </span>
                    )}
                  </div>
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
// Stage picker — slides out under the hero when user clicks "Update my stage"
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
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black tracking-widest uppercase text-slate-500 mb-0.5">Pick your new stage</p>
          <h3 className="text-lg font-black text-slate-900">Where are you now?</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-900 text-[13px] font-bold transition-colors"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {ROADMAP_STAGE_ORDER.map((stageId) => {
          const meta = ROADMAP_STAGES[stageId];
          const isCurrent = stageId === current;
          return (
            <button
              key={stageId}
              type="button"
              onClick={() => onPick(stageId, undefined)}
              disabled={disabled || isCurrent}
              className={`text-left flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-colors ${
                isCurrent
                  ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                  : "bg-white text-slate-900 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              } disabled:cursor-not-allowed`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isCurrent
                  ? "bg-emerald-500 text-white"
                  : `bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} text-white opacity-90`
              }`}>
                {isCurrent ? <Check size={14} className="stroke-[3]" /> : <span className="text-[11px] font-black">{ROADMAP_STAGE_ORDER.indexOf(stageId) + 1}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black mb-0.5 truncate">{meta.title}</p>
                <p className="text-[11px] text-slate-500 leading-snug truncate">{isCurrent ? "Your current stage" : meta.short}</p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
        Your checklist progress is preserved. Currently labelled "{LABELS.currentProcessStatus[currentStatus]}."
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Coming-soon modal — surfaces when the user clicks a stage CTA whose
// tool isn't built yet (Application, Admission & I-20, Pre-Departure).
// ─────────────────────────────────────────────────────────────────────
function ComingSoonModal({
  stage, onClose,
}: {
  stage: RoadmapStageId | null;
  onClose: () => void;
}) {
  if (!stage) return null;
  const meta = ROADMAP_STAGES[stage];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-[28px] shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} opacity-30 pointer-events-none`} aria-hidden />
        <div className="relative p-7 sm:p-9 text-center">
          <div className={`w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br ${meta.accentFrom} ${meta.accentTo} text-white flex items-center justify-center shadow-lg`}>
            <Construction size={26} />
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black uppercase tracking-widest mb-4">
            <Construction size={10} /> Coming soon
          </span>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2 leading-tight">
            {meta.primaryCta} is on the way
          </h2>
          <p className="text-[14px] text-slate-600 leading-relaxed mb-6">
            We're building a dedicated tool for the {meta.title} stage. In the meantime, work through the checklist below — we'll notify you the moment the tool ships.
          </p>
          <button
            onClick={onClose}
            className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-2xl text-sm transition-colors"
          >
            Back to my roadmap
          </button>
        </div>
      </div>
    </div>
  );
}
