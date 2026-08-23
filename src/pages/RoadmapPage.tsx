// ─────────────────────────────────────────────────────────────────────────────
// RoadmapPage — personalised Study Abroad Roadmap.
//
// Visual redesign (2026-06-09 v2): minimalist single-column layout, one
// emerald accent, narrower content (max-w-3xl), trimmed copy. Drops
// the upcoming-stages preview, tip pill, duplicate progress card, and
// separate recommended-tool card. The checklist IS the focus.
//
// Animations: framer-motion drives the stepper fill, the checkbox
// scale-pop, the next-stage banner reveal, and a soft cross-fade
// whenever the user advances to a new stage.
//
// Existing live features (auth, Firestore, credits, Paystack, match
// reports, visa interview, admin portal) are untouched.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import RoadmapOnboardingModal from "./RoadmapOnboardingModal";
import Modal from "../components/Modal";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Check, ChevronDown, Loader2,
  AlertTriangle, RotateCw, Pencil, Plus,
  CheckCircle2, Hourglass, Ban, Circle, Construction, MapPin,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/ui/Button";
import { Eyebrow } from "../components/ui/Eyebrow";
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
  not_started:      { label: "To do",       icon: <Circle size={11} />,        chip: "bg-slate-100 text-slate-600 border-slate-200" },
  in_progress:      { label: "In progress", icon: <Hourglass size={11} />,     chip: "bg-blue-50 text-blue-700 border-blue-200" },
  completed:        { label: "Done",        icon: <CheckCircle2 size={11} />,  chip: "bg-primary-50 text-primary-700 border-primary-200" },
  blocked:          { label: "Blocked",     icon: <Ban size={11} />,           chip: "bg-rose-50 text-rose-700 border-rose-200" },
  needs_review:     { label: "Review",      icon: <AlertTriangle size={11} />, chip: "bg-amber-50 text-amber-800 border-amber-200" },
  // Seeded by the diagnostic on advanced-stage entry. Visually
  // distinct from `completed` so the user knows it's an assumption
  // they can correct. Slate-toned but with a dotted check icon.
  assumed_complete: { label: "Assumed done", icon: <CheckCircle2 size={11} />, chip: "bg-slate-50 text-slate-700 border-slate-300 border-dashed" },
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

  // The diagnostic is a modal on this page rather than its own screen.
  // ?onboarding=1 (set by the old /app/roadmap/onboarding route) opens it, and
  // so does having no roadmap yet.
  const [searchParams, setSearchParams] = useSearchParams();
  const wantsOnboarding = searchParams.get("onboarding") === "1";
  const isReonboarding  = searchParams.get("update") === "1";
  // Derived rather than an effect + setState: the modal is open whenever the
  // URL asked for it or there is no roadmap yet, until the user dismisses it.
  const [dismissed, setDismissed] = useState(false);
  const onboardingOpen =
    !dismissed &&
    !authLoading &&
    roadmap !== "loading" &&
    (wantsOnboarding || roadmap === null);

  const closeOnboarding = () => {
    setDismissed(true);
    // Drop the query params so a refresh doesn't reopen the modal.
    if (wantsOnboarding || isReonboarding) setSearchParams({}, { replace: true });
  };

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

  // External-activity reconcile — runs ONCE per page load. The
  // useRef-gated effect avoids the "setState inside an effect" pattern
  // (which the eslint rule disallows because it can trigger cascading
  // renders). useRef changes don't cause renders, which is what we want.
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    if (reconciledRef.current) return;
    if (roadmap === "loading" || roadmap === null) return;
    reconciledRef.current = true;
    void reconcileFromExternalActivity(user.uid).catch((err) => {
      console.warn("[roadmap] reconcile failed (non-fatal):", err);
    });
  }, [user, roadmap]);


  const handleChecklistChange = async (item: ChecklistItem, next: ChecklistItemStatus) => {
    if (!user) return;
    setUpdatingItemId(item.id);
    setError(null);
    try {
      await updateChecklistItemStatus({ uid: user.uid, itemId: item.id, status: next });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update that item.";
      setError(msg);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleStageChange = async (nextStage: RoadmapStageId, nextStatus: CurrentProcessStatus | undefined) => {
    if (!user) return;
    setUpdatingStage(true);
    setError(null);
    try {
      await updateRoadmapStage({ uid: user.uid, newStage: nextStage, newProcessStatus: nextStatus });
      setStageOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update your stage.";
      setError(msg);
    } finally {
      setUpdatingStage(false);
    }
  };

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
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Loader2 size={20} className="text-slate-400 animate-spin" />
      </div>
    );
  }
  // No roadmap yet: the diagnostic opens over this, and closing it leaves a
  // real screen with a way back in rather than a blank page.
  if (roadmap === null) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-surface px-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-white">
              <MapPin size={20} />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900">Build your roadmap</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Six quick questions and we'll map out where you are and what to do next.
            </p>
            <Button variant="dark" size="lg" className="mt-5" onClick={() => setDismissed(false)}>
              Start <ArrowRight size={15} />
            </Button>
            <div className="mt-3">
              <Link to="/app" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
        <RoadmapOnboardingModal
          open={onboardingOpen}
          isReonboarding={false}
          onClose={closeOnboarding}
          onComplete={closeOnboarding}
        />
      </>
    );
  }

  return (
    <>
      <Dashboard
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
      <ComingSoonModal stage={comingSoonOpen} onClose={() => setComingSoonOpen(null)} />
      <RoadmapOnboardingModal
        open={onboardingOpen}
        isReonboarding={isReonboarding || roadmap !== null}
        onClose={closeOnboarding}
        onComplete={closeOnboarding}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single-column dashboard
// ─────────────────────────────────────────────────────────────────────
function Dashboard({
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
  const currentMeta = ROADMAP_STAGES[roadmap.currentStage];
  const currentStageIndex = ROADMAP_STAGE_ORDER.indexOf(roadmap.currentStage);

  const currentItems = useMemo(
    () => roadmap.checklist.filter((it) => it.stage === roadmap.currentStage),
    [roadmap.checklist, roadmap.currentStage],
  );

  const requiredDone   = currentItems.filter((i) => i.required && i.status === "completed").length;
  const requiredTotal  = currentItems.filter((i) => i.required).length;
  const stageComplete  = isStageRequiredComplete(roadmap.checklist, roadmap.currentStage);
  const nextStage      = getNextStage(roadmap.currentStage);

  return (
    <div className="relative min-h-screen text-slate-900 antialiased overflow-hidden bg-surface">
      {/* Decorative neutral gradients — slate/stone tones only. No AI
          rainbow. Sit behind everything; pointer-events disabled. The
          gradient delivers depth without making the page feel like a
          chatbot. */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -right-40 w-[640px] h-[640px] rounded-full blur-[160px] bg-gradient-to-br from-slate-300/35 via-slate-200/15 to-transparent" />
        <div className="absolute top-1/3 -left-40 w-[520px] h-[520px] rounded-full blur-[160px] bg-gradient-to-br from-stone-200/40 via-slate-100/20 to-transparent" />
        <div className="absolute -bottom-40 right-1/4 w-[560px] h-[560px] rounded-full blur-[160px] bg-gradient-to-tr from-slate-200/30 via-white/0 to-transparent" />
      </div>

      {/* Persistent stage marker rides in the sticky header's action slot, so
          the user can always see which stage they are on and how far through
          it they are — including while the diagnostic modal is open. */}
      <AppHeader
        title="My Roadmap"
        backTo="/app"
        backLabel="Back to home"
        maxWidth="max-w-3xl"
        className="top-16 z-30"
        action={
          <>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${currentMeta.accentChipBg} ${currentMeta.accentText} border-current/20`}
              title={`Stage ${currentStageIndex + 1} of ${ROADMAP_STAGE_ORDER.length}: ${currentMeta.title}`}
            >
              <span className="font-utility tabular-nums opacity-70">
                {currentStageIndex + 1}/{ROADMAP_STAGE_ORDER.length}
              </span>
              <span className="max-w-[9rem] truncate">{currentMeta.short}</span>
              <span className="tabular-nums opacity-70">{roadmap.progressPercentage}%</span>
            </span>
            <Link
              to="/app/roadmap?onboarding=1&update=1"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Refresh your diagnostic answers. Your checklist progress is preserved."
            >
              <RotateCw size={12} /> Update my answers
            </Link>
          </>
        }
      />

      {/* Bottom padding keeps content clear of the chat launcher,
          which now floats on EVERY viewport — no md: opt-out. */}
      <main className="max-w-3xl mx-auto px-5 pt-10 sm:pt-12 pb-24 space-y-8">
        {/* ── Hero ── */}
        <Hero
          stageIndex={currentStageIndex}
          stage={currentMeta}
          requiredDone={requiredDone}
          requiredTotal={requiredTotal}
          progressPercentage={roadmap.progressPercentage}
          comingSoon={!!currentMeta.comingSoon}
          onPrimaryClick={() => onStageCtaClick(roadmap.currentStage)}
          onUpdateStageClick={() => setStageOpen(!stageOpen)}
        />

        {/* ── Stepper ── */}
        <Stepper currentStage={roadmap.currentStage} />

        {/* ── Stage picker ──
            A popup rather than an inline expander: it used to push the whole
            checklist down the page, so changing stage meant losing your place
            in the thing you were reading. */}
        <Modal
          open={stageOpen}
          onClose={() => setStageOpen(false)}
          title="Where are you now?"
          subtitle="Pick the stage that matches where you've actually got to."
          width="md"
        >
          <StagePicker
            current={roadmap.currentStage}
            currentStatus={roadmap.currentProcessStatus}
            disabled={updatingStage}
            onPick={onStageChange}
            onClose={() => setStageOpen(false)}
          />
        </Modal>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium rounded-2xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Checklist (the focal element) ── */}
        <Checklist
          items={currentItems}
          updatingItemId={updatingItemId}
          onChecklistChange={onChecklistChange}
        />

        {/* ── Next-stage CTA ── */}
        <AnimatePresence>
          {stageComplete && nextStage && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <NextStageBanner
                current={roadmap.currentStage}
                next={nextStage}
                disabled={updatingStage}
                onAdvance={() => void onStageChange(nextStage, undefined)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer disclaimer ── */}
        <p className="text-[11px] text-slate-400 text-center max-w-md mx-auto leading-relaxed pt-6">
          A guide, not a guarantee. Verify steps with your school's DSO and the US embassy.
        </p>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Hero — single tight headline + 1-2 CTAs. No verbose subhead.
// ─────────────────────────────────────────────────────────────────────
function Hero({
  stageIndex, stage, requiredDone, requiredTotal, progressPercentage,
  comingSoon, onPrimaryClick, onUpdateStageClick,
}: {
  stageIndex: number;
  stage: typeof ROADMAP_STAGES[RoadmapStageId];
  requiredDone: number;
  requiredTotal: number;
  progressPercentage: number;
  comingSoon: boolean;
  onPrimaryClick: () => void;
  onUpdateStageClick: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative space-y-5 px-6 sm:px-8 py-7 sm:py-9 rounded-card border border-slate-200/70 bg-white shadow-card overflow-hidden"
    >
      {/* Soft brand-blue wash anchored to the upper-right of the hero so
          the eye reads "progress" without the whole card being tinted. */}
      <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl bg-gradient-to-br from-primary-100/60 to-transparent" aria-hidden />
      <div className="flex items-center gap-2">
        <Eyebrow tone="primary">
          Stage {stageIndex + 1} of 6
        </Eyebrow>
        <span className="w-1 h-1 rounded-full bg-slate-300" aria-hidden />
        <p className="text-[11px] font-bold tracking-wide text-slate-500 truncate">
          {requiredDone}/{requiredTotal} required done
        </p>
      </div>

      <h2 className="text-[40px] sm:text-5xl font-black tracking-tight text-slate-900 leading-[1.02]">
        {stage.title}
      </h2>
      <p className="text-[15px] sm:text-base text-slate-600 leading-relaxed max-w-xl">
        {stage.description}
      </p>

      {/* Slim progress bar — sits right under the description */}
      <div className="max-w-md">
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progressPercentage, 100)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full bg-primary-500 rounded-full"
          />
        </div>
        <p className="text-[10px] font-bold text-slate-500 mt-1.5 tabular-nums">
          {progressPercentage}% complete
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <Button
          variant="primary"
          size="lg"
          onClick={onPrimaryClick}
          icon={comingSoon ? <Construction size={13} /> : undefined}
        >
          {stage.primaryCta}
          <ArrowRight size={14} />
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={onUpdateStageClick}
          icon={<Pencil size={12} />}
        >
          Update stage
        </Button>
      </div>
    </motion.section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stepper — slim horizontal stage indicator. Connecting line + small
// circular nodes + tiny labels below. Single emerald accent. Animated
// gradient fill stretches up to the current stage on mount + on advance.
// ─────────────────────────────────────────────────────────────────────
function Stepper({ currentStage }: { currentStage: RoadmapStageId }) {
  const currentIndex = ROADMAP_STAGE_ORDER.indexOf(currentStage);
  const totalSteps = ROADMAP_STAGE_ORDER.length;
  const fillPercent = totalSteps === 1
    ? 100
    : (currentIndex / (totalSteps - 1)) * 100;

  return (
    <section className="bg-white rounded-card border border-slate-200/70 shadow-card px-5 py-7 sm:px-7">
      <div className="relative">
        {/* Track + animated fill */}
        <div className="absolute left-[14px] right-[14px] sm:left-[18px] sm:right-[18px] top-[14px] sm:top-[18px] h-[3px] rounded-full bg-slate-200 overflow-hidden pointer-events-none" aria-hidden>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${fillPercent}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="h-full bg-primary-500 rounded-full"
          />
        </div>

        <div className="relative grid grid-cols-6 gap-1 sm:gap-2">
          {ROADMAP_STAGE_ORDER.map((stageId, idx) => {
            const meta = ROADMAP_STAGES[stageId];
            const state: "completed" | "current" | "upcoming" =
              idx < currentIndex ? "completed" : idx === currentIndex ? "current" : "upcoming";
            return (
              <div key={stageId} className="flex flex-col items-center text-center">
                <motion.div
                  initial={false}
                  animate={{
                    scale: state === "current" ? 1.05 : 1,
                  }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={`relative w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[11px] font-black ${
                    state === "completed"
                      ? "bg-primary-500 text-white"
                      : state === "current"
                        ? "bg-white text-primary-700 border-[3px] border-primary-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]"
                        : "bg-white text-slate-400 border border-slate-300"
                  }`}
                >
                  {state === "completed"
                    ? <Check size={14} className="stroke-[3]" />
                    : idx + 1
                  }
                </motion.div>
                <p className={`text-[10px] sm:text-[11px] font-bold mt-2.5 leading-tight px-0.5 ${
                  state === "current" ? "text-slate-900" :
                  state === "completed" ? "text-slate-700" :
                  "text-slate-400"
                }`}>
                  {meta.short}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Checklist — the focal element. Plain white card containing rows.
// Each row: single-click checkbox + title + status chip + chevron.
// ─────────────────────────────────────────────────────────────────────
function Checklist({
  items, updatingItemId, onChecklistChange,
}: {
  items: ChecklistItem[];
  updatingItemId: string | null;
  onChecklistChange: (item: ChecklistItem, next: ChecklistItemStatus) => Promise<void>;
}) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
      className="bg-white rounded-card border border-slate-200/70 shadow-card overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-baseline justify-between">
        <h3 className="text-[15px] font-black text-slate-900">Your checklist</h3>
        <p className="text-[11px] font-bold text-slate-500 tabular-nums">
          {items.length} item{items.length === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            updating={updatingItemId === item.id}
            onChange={(next) => onChecklistChange(item, next)}
          />
        ))}
      </ul>
    </motion.section>
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
  const isAssumed   = item.status === "assumed_complete";

  // Single click semantics:
  //   - not_started → completed (manual tick)
  //   - completed   → not_started (manual untick)
  //   - assumed_complete → completed (confirms the assumption was right)
  //   Other statuses (in_progress, blocked, needs_review) only change
  //   via the expanded controls.
  const toggle = () => {
    if (isCompleted)   return onChange("not_started");
    return onChange("completed");
  };

  return (
    <li className="group">
      <div className="flex items-start gap-3 px-5 sm:px-6 py-4 hover:bg-slate-50/50 transition-colors">
        <motion.button
          type="button"
          onClick={toggle}
          disabled={updating}
          whileTap={{ scale: 0.88 }}
          className={`w-5 h-5 rounded-md flex-shrink-0 mt-0.5 border-2 flex items-center justify-center transition-colors ${
            isCompleted
              ? "bg-primary-500 border-primary-500 text-white"
              : isAssumed
                ? "bg-white border-slate-400 border-dashed text-slate-600 hover:border-primary-400"
                : "bg-white border-slate-300 hover:border-primary-400"
          } disabled:opacity-60`}
          aria-label={
            isCompleted ? `Mark ${item.title} incomplete`
              : isAssumed ? `Confirm ${item.title} as done`
              : `Mark ${item.title} complete`
          }
          title={isAssumed ? "Click to confirm. We assumed this was done based on your diagnostic answers." : undefined}
        >
          <AnimatePresence>
            {(isCompleted || isAssumed) && (
              <motion.span
                key="check"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <Check size={13} className="stroke-[3]" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-left w-full"
          >
            <p className={`text-[14px] font-bold leading-snug transition-colors ${
              isCompleted ? "text-slate-400 line-through decoration-slate-300"
                : isAssumed ? "text-slate-500"
                : "text-slate-900"
            }`}>
              {item.title}
              {item.required && !isCompleted && <span className="text-primary-600 ml-1">*</span>}
            </p>
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ overflow: "hidden" }}
              >
                <div className="pt-2 pb-1 space-y-3">
                  <p className="text-[13px] text-slate-600 leading-relaxed">{item.description}</p>

                  {/* Primary action — "Open tool" sits ABOVE the status
                      pills as the dominant CTA so the user's eye lands
                      there first. Solid brand blue, full width on mobile,
                      auto width on desktop, soft shadow. */}
                  {item.toolRoute && (
                    <Link
                      to={item.toolRoute}
                      className="group inline-flex items-center justify-between w-full sm:w-auto sm:min-w-[220px] gap-3 px-4 py-3 rounded-full text-[13px] font-bold bg-primary-500 hover:bg-primary-600 text-white shadow-glow hover:-translate-y-0.5 transition-all"
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center">
                          <ArrowRight size={12} />
                        </span>
                        Open this tool
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/80 group-hover:text-white transition-colors">
                        Go &rarr;
                      </span>
                    </Link>
                  )}

                  {/* Secondary controls — status pills. Small, muted. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="w-full text-[10px] font-black tracking-widest uppercase text-slate-400 mb-0.5">Mark this task as</p>
                    {(["not_started", "in_progress", "completed", "blocked", "needs_review"] as ChecklistItemStatus[]).map((s) => {
                      const m = STATUS_META[s];
                      const active = item.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onChange(s)}
                          disabled={updating}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                            active ? "bg-ink text-white border-ink"
                                   : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                          } disabled:opacity-50`}
                        >
                          {m.icon} {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.chip}`}>
            {meta.icon} {meta.label}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronDown size={13} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Next-stage banner — appears when required items in current stage
// are all done.
// ─────────────────────────────────────────────────────────────────────
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
    <section className="bg-ink text-white rounded-card-lg overflow-hidden p-6 sm:p-7 relative">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 w-36 h-36 rounded-full border-[18px] border-primary-500/20" />
      <div aria-hidden className="pointer-events-none absolute -right-6 top-8 w-48 h-48 rounded-full bg-primary-500/15 blur-3xl" />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={22} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <Eyebrow tone="light" className="mb-1">{currentMeta.title} complete</Eyebrow>
          <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
            Ready for {nextMeta.title}?
          </h3>
        </div>
        <button
          onClick={onAdvance}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 bg-white text-ink hover:bg-slate-100 text-sm font-bold px-5 py-3 rounded-full transition-all active:scale-95 disabled:opacity-60 whitespace-nowrap"
        >
          {disabled ? <Loader2 size={14} className="animate-spin" /> : null}
          Continue <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stage picker
// ─────────────────────────────────────────────────────────────────────
function StagePicker({
  current, currentStatus, disabled, onPick, onClose,
}: {
  current: RoadmapStageId;
  /** Legacy docs carry a single string; new docs carry an array of
   *  every status the user ticked during onboarding. We coerce to an
   *  array at the boundary so display + writes stay consistent. */
  currentStatus: CurrentProcessStatus | CurrentProcessStatus[];
  disabled: boolean;
  onPick: (stage: RoadmapStageId, status: CurrentProcessStatus | undefined) => void;
  onClose: () => void;
}) {
  return (
    <section className="bg-white rounded-card border border-slate-200/70 shadow-card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-black text-slate-900">Where are you now?</h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-900 text-[12px] font-bold transition-colors">
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ROADMAP_STAGE_ORDER.map((stageId) => {
          const meta = ROADMAP_STAGES[stageId];
          const isCurrent = stageId === current;
          const stageIndex = ROADMAP_STAGE_ORDER.indexOf(stageId);
          return (
            <button
              key={stageId}
              type="button"
              onClick={() => onPick(stageId, undefined)}
              disabled={disabled || isCurrent}
              className={`text-left p-3 rounded-2xl border-2 transition-all ${
                isCurrent
                  ? "bg-primary-50 border-primary-300 text-primary-900"
                  : "bg-white border-slate-200 text-slate-900 hover:border-slate-300 hover:bg-slate-50"
              } disabled:cursor-not-allowed`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-black ${
                  isCurrent ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600"
                }`}>
                  {isCurrent ? <Check size={11} className="stroke-[3]" /> : stageIndex + 1}
                </span>
                <p className="text-[12px] font-black truncate">{meta.short}</p>
              </div>
              <p className="text-[10px] text-slate-500 leading-snug">
                {isCurrent ? "Current" : meta.title}
              </p>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 mt-4">
        Your checklist progress is preserved. Currently labelled "{
          (Array.isArray(currentStatus) ? currentStatus : [currentStatus])
            .map((s) => LABELS.currentProcessStatus[s])
            .join(", ")
        }".
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Coming-soon modal
// ─────────────────────────────────────────────────────────────────────
function ComingSoonModal({
  stage, onClose,
}: {
  stage: RoadmapStageId | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {stage && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative bg-white rounded-card-lg shadow-card border border-slate-200/70 max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-7 sm:p-9 text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-primary-50 border border-primary-200 text-primary-700 flex items-center justify-center">
                <Construction size={22} />
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black uppercase tracking-widest mb-3">
                Coming soon
              </span>
              <h2 className="text-xl font-black text-slate-900 tracking-tight mb-2 leading-tight">
                {ROADMAP_STAGES[stage].primaryCta} is on the way
              </h2>
              <p className="text-[13px] text-slate-600 leading-relaxed mb-6">
                We're building a dedicated tool for this stage. In the meantime, work through your checklist — we'll notify you the moment it ships.
              </p>
              <button
                onClick={onClose}
                className="w-full inline-flex items-center justify-center gap-2 bg-ink hover:bg-slate-800 text-white font-bold py-3 rounded-full text-sm transition-all active:scale-95"
              >
                Back to my roadmap
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// suppress unused import warning — `Plus` reserved for future "Add custom item" UX
void Plus;
