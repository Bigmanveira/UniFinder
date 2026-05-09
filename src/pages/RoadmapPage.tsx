import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle, Info,
  ExternalLink, GraduationCap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  POSTGRAD_ROADMAP, UNDERGRAD_ROADMAP,
  type Roadmap, type RoadmapCard, type RoadmapCallout, type RoadmapAction,
} from "../lib/roadmap/content";
import { FadeIn, FadeInItem } from "../components/FadeIn";

// ─────────────────────────────────────────────────────────────────────────────
// Persistence shape (Firestore: roadmapProgress/{uid})
// ─────────────────────────────────────────────────────────────────────────────
interface RoadmapProgress {
  level: "postgrad" | "undergrad";
  completedCards: string[];
  completedChecklistItems: Record<string, string[]>;
  currentStage: number;
  updatedAt?: any;
}

const EMPTY_PROGRESS = (level: Roadmap["level"]): RoadmapProgress => ({
  level,
  completedCards: [],
  completedChecklistItems: {},
  currentStage: 0,
});

// ─────────────────────────────────────────────────────────────────────────────
export default function RoadmapPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [roadmap, setRoadmap] = useState<Roadmap>(POSTGRAD_ROADMAP);
  const [progress, setProgress] = useState<RoadmapProgress>(EMPTY_PROGRESS("postgrad"));
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  // Pick which roadmap based on the latest student profile (or query param override)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(location.search);
    const levelOverride = params.get("level");

    const profileRef = doc(db, "studentProfiles", user.uid);
    const unsub = onSnapshot(profileRef, (snap) => {
      // Default to postgrad — change only if undergrad is signaled.
      let chosen: Roadmap = POSTGRAD_ROADMAP;
      if (levelOverride === "undergrad")          chosen = UNDERGRAD_ROADMAP;
      else if (levelOverride === "postgrad")      chosen = POSTGRAD_ROADMAP;
      else if (snap.exists()) {
        const lvl = (snap.data().level || "").toLowerCase();
        if (lvl.includes("undergrad") || lvl.includes("bachelor")) {
          chosen = UNDERGRAD_ROADMAP;
        }
      }
      setRoadmap(chosen);
    });
    return unsub;
  }, [user, location.search]);

  // Live subscription to roadmap progress
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "roadmapProgress", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as RoadmapProgress;
          setProgress({
            level: data.level || roadmap.level,
            completedCards: data.completedCards || [],
            completedChecklistItems: data.completedChecklistItems || {},
            currentStage: typeof data.currentStage === "number" ? data.currentStage : 0,
          });
        } else {
          setProgress(EMPTY_PROGRESS(roadmap.level));
        }
        setLoading(false);
      },
      (err) => {
        console.error("Roadmap progress subscription error:", err);
        setLoading(false);
      },
    );
    return unsub;
  }, [user, roadmap.level]);

  // Reset progress structure if the user switches between postgrad/undergrad
  useEffect(() => {
    if (progress.level !== roadmap.level) {
      setProgress(EMPTY_PROGRESS(roadmap.level));
    }
  }, [roadmap.level, progress.level]);

  const writeProgress = async (next: RoadmapProgress) => {
    if (!user) return;
    setProgress(next); // optimistic
    try {
      await setDoc(
        doc(db, "roadmapProgress", user.uid),
        { ...next, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (err) {
      console.error("Error writing roadmap progress:", err);
    }
  };

  const stage = roadmap.stages[Math.min(progress.currentStage, roadmap.stages.length - 1)] ?? roadmap.stages[0];
  const totalStages = roadmap.stages.length;
  const stageIndex = progress.currentStage;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const setCardDone = (cardId: string, done: boolean) => {
    const set = new Set(progress.completedCards);
    if (done) set.add(cardId); else set.delete(cardId);
    writeProgress({ ...progress, completedCards: Array.from(set) });
  };

  const setChecklistItemDone = (cardId: string, itemId: string, done: boolean) => {
    const cur = new Set(progress.completedChecklistItems[cardId] || []);
    if (done) cur.add(itemId); else cur.delete(itemId);
    writeProgress({
      ...progress,
      completedChecklistItems: {
        ...progress.completedChecklistItems,
        [cardId]: Array.from(cur),
      },
    });
  };

  const goToStage = (i: number) => {
    setOpenCardId(null);
    writeProgress({ ...progress, currentStage: Math.max(0, Math.min(totalStages - 1, i)) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Stage progress percentage (for the stepper bar) ───────────────────────
  const stageCompletion = useMemo(() => {
    return roadmap.stages.map((s) => {
      // Count cards complete + (for visa/checklist stage) checklist items complete
      const cards = s.cards;
      let total = 0;
      let done = 0;
      for (const c of cards) {
        total += 1;
        if (progress.completedCards.includes(c.id)) done += 1;
        if (c.checklist) {
          total += c.checklist.length;
          done += (progress.completedChecklistItems[c.id] || []).length;
        }
      }
      return total === 0 ? 0 : done / total;
    });
  }, [roadmap.stages, progress.completedCards, progress.completedChecklistItems]);

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-slate-500">Sign in to view your roadmap.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={20} className="text-slate-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-500">Loading your roadmap…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-900 antialiased pb-32 relative overflow-hidden bg-gradient-to-b from-white via-blue-50/30 to-white">
      <div className="pointer-events-none absolute top-[-100px] right-[-100px] w-[440px] h-[440px] bg-blue-200/40 rounded-full blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute top-[120px] left-[-120px] w-[380px] h-[380px] bg-cyan-200/30 rounded-full blur-[120px]" aria-hidden />

      {/* Sticky header */}
      <header className="border-b border-slate-200 sticky top-0 z-40 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/app" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors">
            <ArrowLeft size={15} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">{roadmap.title}</h1>
            <p className="text-xs text-slate-500 truncate">
              Stage {stageIndex + 1} of {totalStages} · {Math.round(stageCompletion[stageIndex] * 100)}% complete
            </p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 text-white flex items-center justify-center">
            <GraduationCap size={15} />
          </div>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-5 py-7">
        {/* Stage stepper */}
        <FadeIn>
          <Stepper
            stages={roadmap.stages.map((s, i) => ({
              label: s.shortLabel,
              done: stageCompletion[i] >= 0.999,
              completion: stageCompletion[i],
            }))}
            current={stageIndex}
            onJump={goToStage}
          />
        </FadeIn>

        {/* Stage hero — gradient feature card with stage progress */}
        <FadeIn delay={0.05} className="mt-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white p-7 sm:p-9">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" aria-hidden />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" aria-hidden />

            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-semibold tracking-wide">
                  Stage {stageIndex + 1} <span className="text-white/40">of</span> {totalStages}
                </span>
                <span className="text-[11px] font-semibold text-white/60 tabular-nums">
                  {Math.round(stageCompletion[stageIndex] * 100)}% complete
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.1] mb-2">
                {stage.title}
              </h2>
              <p className="text-[15px] text-white/75 leading-relaxed max-w-2xl mb-5">{stage.description}</p>

              {/* Stage progress bar */}
              <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-full"
                  initial={false}
                  animate={{ width: `${stageCompletion[stageIndex] * 100}%` }}
                  transition={{ duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
                />
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Cards */}
        <div className="mt-7 space-y-3">
          {stage.cards.map((card, i) => (
            <FadeInItem key={card.id} index={i}>
              <CardAccordion
                card={card}
                open={openCardId === card.id}
                onToggle={() => setOpenCardId(openCardId === card.id ? null : card.id)}
                done={progress.completedCards.includes(card.id)}
                onToggleDone={(d) => setCardDone(card.id, d)}
                completedChecklist={progress.completedChecklistItems[card.id] || []}
                onChecklistToggle={(itemId, d) => setChecklistItemDone(card.id, itemId, d)}
                navigate={navigate}
              />
            </FadeInItem>
          ))}
        </div>

        {/* Bottom navigation */}
        <FadeIn delay={0.1} className="mt-10">
          <div className="border-t border-slate-200 pt-6 flex items-center justify-between gap-3">
            <button
              onClick={() => goToStage(stageIndex - 1)}
              disabled={stageIndex === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <p className="text-sm text-slate-500 tabular-nums">
              {stageIndex + 1} <span className="text-slate-300">/</span> {totalStages}
            </p>
            <button
              onClick={() => goToStage(stageIndex + 1)}
              disabled={stageIndex === totalStages - 1}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md shadow-slate-900/20"
            >
              Next stage <ChevronRight size={14} />
            </button>
          </div>
        </FadeIn>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stepper — top progress bar with circles per stage
// ─────────────────────────────────────────────────────────────────────────────
function Stepper({
  stages, current, onJump,
}: {
  stages: { label: string; done: boolean; completion: number }[];
  current: number;
  onJump: (i: number) => void;
}) {
  // Two-tier responsive design:
  //   • Mobile (<sm): compact circles only, no labels — fits 7 steps in ~320px
  //   • Tablet+ (sm+): full circles + labels with horizontal scroll fallback
  const currentLabel = stages[current]?.label ?? "";

  return (
    <div>
      {/* Mobile: compact stepper + standalone current label below */}
      <div className="sm:hidden">
        <ol className="flex items-center justify-between w-full">
          {stages.map((s, i) => {
            const isCurrent = i === current;
            const isComplete = s.done;
            const showLine = i < stages.length - 1;
            return (
              <li key={i} className="flex items-center flex-1 min-w-0">
                <button
                  onClick={() => onJump(i)}
                  aria-label={`Stage ${i + 1}: ${s.label}`}
                  className="focus:outline-none flex-shrink-0"
                >
                  <motion.span
                    initial={false}
                    animate={isCurrent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                    transition={{ duration: 1.6, repeat: isCurrent ? Infinity : 0, ease: "easeInOut" }}
                    className={[
                      "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all",
                      isCurrent
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-[3px] ring-blue-100"
                        : isComplete
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-400",
                    ].join(" ")}
                  >
                    {isComplete ? <Check size={11} className="stroke-[3]" /> : i + 1}
                  </motion.span>
                </button>
                {showLine && (
                  <div className="relative mx-1 flex-1 h-0.5 bg-slate-200 rounded-full overflow-hidden min-w-[8px]" aria-hidden>
                    <motion.div
                      initial={false}
                      animate={{ width: isComplete ? "100%" : "0%" }}
                      transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
                      className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-center text-[11px] font-semibold text-slate-500">
          <span className="text-slate-900">Stage {current + 1}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          {currentLabel}
        </p>
      </div>

      {/* Tablet+ : full stepper with labels, horizontally scrollable if needed */}
      <div className="hidden sm:block relative">
        <div className="overflow-x-auto -mx-5 px-5 pb-1" style={{ scrollbarWidth: "none" }}>
          <ol className="flex items-start gap-0 min-w-max">
            {stages.map((s, i) => {
              const isCurrent = i === current;
              const isComplete = s.done;
              const showLine = i < stages.length - 1;
              const lineFilled = isComplete;
              return (
                <li key={i} className="flex items-start">
                  <button
                    onClick={() => onJump(i)}
                    className="flex flex-col items-center gap-1.5 min-w-[78px] focus:outline-none group"
                  >
                    <motion.span
                      initial={false}
                      animate={isCurrent ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                      transition={{ duration: 1.6, repeat: isCurrent ? Infinity : 0, ease: "easeInOut" }}
                      className={[
                        "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                        isCurrent
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-4 ring-blue-100"
                          : isComplete
                          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                          : "bg-slate-100 text-slate-400 group-hover:bg-slate-200",
                      ].join(" ")}
                    >
                      {isComplete ? <Check size={14} className="stroke-[3]" /> : i + 1}
                    </motion.span>
                    <span
                      className={[
                        "text-[11px] leading-tight text-center px-1 line-clamp-2 max-w-[88px] mt-1.5",
                        isCurrent ? "text-slate-900 font-semibold" : isComplete ? "text-emerald-700 font-medium" : "text-slate-500",
                      ].join(" ")}
                    >
                      {s.label}
                    </span>
                  </button>
                  {showLine && (
                    <div className="relative mt-[18px] h-0.5 w-7 bg-slate-200 rounded-full flex-shrink-0 overflow-hidden" aria-hidden>
                      <motion.div
                        initial={false}
                        animate={{ width: lineFilled ? "100%" : "0%" }}
                        transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
                        className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Accordion card
// ─────────────────────────────────────────────────────────────────────────────
function CardAccordion({
  card, open, onToggle, done, onToggleDone,
  completedChecklist, onChecklistToggle, navigate,
}: {
  card: RoadmapCard;
  open: boolean;
  onToggle: () => void;
  done: boolean;
  onToggleDone: (d: boolean) => void;
  completedChecklist: string[];
  onChecklistToggle: (itemId: string, d: boolean) => void;
  navigate: (to: string) => void;
}) {
  const totalChecklist = card.checklist?.length ?? 0;
  const completedCount = completedChecklist.length;
  const checklistRatio = totalChecklist > 0 ? completedCount / totalChecklist : 0;

  return (
    <motion.div
      whileHover={{ y: open ? 0 : -2 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={[
        "border rounded-2xl overflow-hidden bg-white transition-colors",
        done && !open ? "border-emerald-200 bg-emerald-50/30" : "",
        open ? "border-slate-300 shadow-[0_12px_40px_rgba(15,23,42,0.08)]" : "border-slate-200 shadow-[0_2px_10px_rgba(15,23,42,0.03)]",
      ].join(" ")}
    >
      {/* Header (always visible) */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-slate-50/60 transition-colors"
      >
        <div
          className={[
            "w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all",
            done
              ? "bg-emerald-50 border border-emerald-200"
              : open
              ? "bg-blue-50 border border-blue-200"
              : "bg-slate-50 border border-slate-200",
          ].join(" ")}
        >
          <span aria-hidden>{card.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 leading-tight">
            {done && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="inline-flex w-5 h-5 rounded-full bg-emerald-500 text-white items-center justify-center flex-shrink-0"
              >
                <Check size={11} className="stroke-[3]" />
              </motion.span>
            )}
            {card.title}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{card.subtitle}</p>
          {totalChecklist > 0 && (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 max-w-[180px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={false}
                  animate={{ width: `${checklistRatio * 100}%` }}
                  transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
                  className={`h-full rounded-full ${checklistRatio >= 0.999 ? "bg-emerald-500" : "bg-slate-900"}`}
                />
              </div>
              <span className={`text-[11px] font-semibold tabular-nums ${checklistRatio >= 0.999 ? "text-emerald-700" : "text-slate-500"}`}>
                {completedCount} / {totalChecklist}
              </span>
            </div>
          )}
        </div>
        <span className="flex-shrink-0 text-slate-400 mt-1.5">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-4">
              {card.bullets.length > 0 && (
                <ul className="space-y-2.5 mt-3">
                  {card.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                      <ArrowRight size={13} className="text-blue-500 flex-shrink-0 mt-1" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              {card.callouts?.map((c, i) => <CalloutBox key={i} callout={c} />)}

              {card.checklist && card.checklist.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {card.checklist.map((item) => {
                    const itemDone = completedChecklist.includes(item.id);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => onChecklistToggle(item.id, !itemDone)}
                          className="w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          <span
                            className={[
                              "w-4 h-4 rounded-md flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors border",
                              itemDone ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-300",
                            ].join(" ")}
                          >
                            {itemDone && <Check size={11} className="stroke-[3]" />}
                          </span>
                          <span className={["text-sm leading-relaxed", itemDone ? "text-slate-400 line-through" : "text-slate-700"].join(" ")}>
                            {item.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {card.actions && card.actions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {card.actions.map((a, i) => <ActionButton key={i} action={a} navigate={navigate} />)}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => onToggleDone(!done)}
                  className={[
                    "inline-flex items-center gap-2 text-sm font-semibold transition-colors active:scale-[0.98]",
                    done ? "text-emerald-700" : "text-slate-500 hover:text-slate-900",
                  ].join(" ")}
                >
                  <motion.span
                    animate={done ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 14 }}
                    className={[
                      "w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-colors border",
                      done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-300",
                    ].join(" ")}
                  >
                    {done && <Check size={12} className="stroke-[3]" />}
                  </motion.span>
                  {done ? "Marked as done" : "Mark as done"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CalloutBox({ callout }: { callout: RoadmapCallout }) {
  const cls = callout.tone === "warn"
    ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", icon: <AlertTriangle size={13} className="text-amber-700" /> }
    : { bg: "bg-blue-50",  border: "border-blue-200",  text: "text-blue-900",  icon: <Info size={13} className="text-blue-700" /> };
  return (
    <div className={`${cls.bg} ${cls.border} border rounded-xl px-4 py-3 flex items-start gap-2.5`}>
      <span className="mt-0.5 flex-shrink-0">{cls.icon}</span>
      <p className={`text-[13px] ${cls.text} leading-relaxed`}>{callout.body}</p>
    </div>
  );
}

function ActionButton({ action, navigate }: { action: RoadmapAction; navigate: (to: string) => void }) {
  const onClick = () => {
    if (action.to)        navigate(action.to);
    else if (action.href) window.open(action.href, "_blank", "noopener,noreferrer");
  };
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
    >
      {action.emoji && <span aria-hidden>{action.emoji}</span>}
      {action.label}
      {action.href && <ExternalLink size={11} className="text-slate-400" />}
    </button>
  );
}
