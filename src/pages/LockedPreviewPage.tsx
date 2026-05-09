import { Link, useNavigate } from "react-router-dom";
import {
  Lock, ArrowRight, Sparkles, AlertTriangle, Info,
  MapPin, GraduationCap, Loader2, Star, ChevronRight, Send,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { getActiveSchools } from "../lib/schools/getSchools";
import SchoolCardArt from "../components/schools/SchoolCardArt";
import { getEligibleUnitIds } from "../lib/programs/getPrograms";
import { FadeIn, FadeInItem } from "../components/FadeIn";
import {
  getDeterministicMatches,
  getProfileImprovementAdvice,
  isPostgraduateApplicant,
  bucketizeMatches,
} from "../lib/matching/matchSchools";
import type { SchoolMatch, StudentProfile, ProfileAdvice } from "../types";
import { useAuth } from "../hooks/useAuth";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

type GateState = "enforced" | "no-eligible" | "not-enforced";
type BucketKey = "all" | "reach" | "target" | "safety";

const STUDY_TIPS = [
  "Most U.S. graduate programs review applications on a rolling basis — the earlier you apply, the better your funding odds.",
  "F-1 student visas require an I-20 form, which the school issues only after you accept the offer.",
  "Many doctoral programs fully fund admitted students with tuition waivers, stipends, and health insurance.",
  "WES is the most widely accepted credential evaluator for international transcripts.",
  "A strong Statement of Purpose names specific faculty and research labs you want to work with.",
  "GRE policies vary — some programs have made it optional, others still require it. Check each program directly.",
  "TOEFL/IELTS waivers are often available if your prior degree was taught in English.",
  "Out-of-state tuition can be waived through teaching or research assistantships at most public universities.",
];

const STAGES: { until: number; label: string }[] = [
  { until: 6,   label: "Verifying program eligibility" },
  { until: 18,  label: "Matching schools to your profile" },
  { until: 50,  label: "Writing personalized recommendations" },
  { until: 999, label: "Finalizing your report" },
];

function progressFor(s: number) { return Math.min(95, 100 - 100 * Math.exp(-s / 30)); }

const BUCKETS = {
  reach:  { title: "Reach",  desc: "Selective programs where you're competitive but not guaranteed.", dot: "bg-violet-500" },
  target: { title: "Target", desc: "Realistic matches — your profile aligns with their typical admit.", dot: "bg-blue-500" },
  safety: { title: "Safety", desc: "High admission probability. Solid backups for your shortlist.",     dot: "bg-emerald-500" },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
export default function LockedPreviewPage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [allMatches, setAllMatches] = useState<SchoolMatch[]>([]);
  const [bucketed, setBucketed] = useState<ReturnType<typeof bucketizeMatches> | null>(null);
  const [advice, setAdvice] = useState<ProfileAdvice[]>([]);
  const [loading, setLoading] = useState(true);
  const [programGate, setProgramGate] = useState<GateState>("not-enforced");
  const [activeFilter, setActiveFilter] = useState<BucketKey>("all");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [unlockElapsed, setUnlockElapsed] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    async function loadMatches() {
      const stored = localStorage.getItem("unifinder_guest_profile");
      if (!stored) { setLoading(false); return; }
      const parsed = JSON.parse(stored) as StudentProfile;
      setProfile(parsed);
      try {
        const degreeLevel = isPostgraduateApplicant(parsed) ? "graduate" : "undergraduate";
        const [schools, gate] = await Promise.all([
          getActiveSchools(degreeLevel),
          getEligibleUnitIds(parsed),
        ]);
        const computedMatches = getDeterministicMatches(schools, parsed, gate.eligibleUnitIds);
        const recommended = computedMatches.filter(
          m => m.category === "Strong Fit" || m.category === "Good Fit" || m.category === "Exploratory Fit"
        );
        const top = bucketizeMatches(recommended);
        setAllMatches(computedMatches);
        setBucketed(top);
        setAdvice(getProfileImprovementAdvice(parsed));
        if (gate.eligibleUnitIds === null) setProgramGate("not-enforced");
        else if (top.top10.length === 0) setProgramGate("no-eligible");
        else setProgramGate("enforced");
      } catch (err) { console.error("Error matching:", err); }
      finally { setLoading(false); }
    }
    loadMatches();
  }, []);

  useEffect(() => {
    if (!unlocking) { setUnlockElapsed(0); setTipIndex(0); return; }
    const start = Date.now();
    const elapsedId = setInterval(() => setUnlockElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    const tipId = setInterval(() => setTipIndex(i => (i + 1) % STUDY_TIPS.length), 5000);
    return () => { clearInterval(elapsedId); clearInterval(tipId); };
  }, [unlocking]);

  const handleUnlock = async () => {
    if (!user) { navigate("/signup?from=results"); return; }
    setUnlocking(true);
    setUnlockError("");
    try {
      const recommendedMatches = allMatches.filter(
        m => m.category === "Strong Fit" || m.category === "Good Fit" || m.category === "Exploratory Fit"
      );
      const unlockFn = httpsCallable(functions, "unlockMatchReport", { timeout: 240_000 });
      const result = await unlockFn({ profile, matches: recommendedMatches });
      const data = result.data as any;
      if (data.noEligiblePrograms) { setUnlockError("no_eligible_programs"); return; }
      navigate(`/app/reports/${data.reportId}`);
    } catch (err: any) {
      console.error(err);
      if (err.code === "resource-exhausted" || err.message?.includes("Insufficient credits")) {
        setUnlockError("insufficient_credits");
      } else {
        setUnlockError(err.message || "An error occurred while unlocking.");
      }
    } finally { setUnlocking(false); }
  };

  if (loading) return <PageLoader label="Running matching algorithm" />;

  const top10Count = bucketed?.top10.length ?? 0;
  const counts = {
    all:    bucketed?.top10.length  ?? 0,
    reach:  bucketed?.reach.length  ?? 0,
    target: bucketed?.target.length ?? 0,
    safety: bucketed?.safety.length ?? 0,
  };
  const initial = (user?.email?.[0] ?? "U").toUpperCase();

  return (
    <div className="min-h-screen text-slate-900 antialiased pb-40 relative overflow-hidden bg-gradient-to-b from-white via-blue-50/30 to-white">
      {/* Decorative soft glow blobs in the hero */}
      <div className="pointer-events-none absolute top-[-80px] right-[-120px] w-[420px] h-[420px] bg-blue-200/40 rounded-full blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute top-[180px] left-[-100px] w-[360px] h-[360px] bg-violet-200/30 rounded-full blur-[120px]" aria-hidden />

      {/* Header — logo + avatar */}
      <header className="relative px-5 py-5 max-w-6xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
            <GraduationCap size={16} />
          </div>
          <span className="text-lg font-bold tracking-tight">Unifinder</span>
        </Link>
        {user ? (
          <Link to="/app" className="w-10 h-10 rounded-full ring-2 ring-white shadow-md bg-gradient-to-br from-blue-500 to-indigo-700 text-white flex items-center justify-center font-bold">
            {initial}
          </Link>
        ) : (
          <Link to="/login" className="text-sm font-semibold text-slate-700 hover:text-slate-900">Log in</Link>
        )}
      </header>

      <main className="relative max-w-6xl mx-auto px-5">
        {/* Hero greeting — bold, big, with emoji */}
        <FadeIn as="section" className="pt-4 pb-7">
          <h1 className="text-[34px] sm:text-5xl font-bold tracking-tight leading-[1.05] text-slate-900">
            {programGate === "no-eligible"
              ? "No verified programs found"
              : <>Your top {top10Count} matches <span className="inline-block ml-1">🎯</span></>}
          </h1>
          <p className="text-base text-slate-500 mt-2 max-w-xl">
            {programGate === "no-eligible"
              ? "Try a closely related field or a different degree level."
              : "Sorted by admission likelihood. Reach, Target, and Safety."}
          </p>
        </FadeIn>

        {/* Profile-improvement advice */}
        {advice.length > 0 && (
          <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-3">
            {advice.map((item, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={14} className="text-amber-700" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-900 mb-0.5">{item.title}</h3>
                  <p className="text-xs text-amber-900/80 leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Empty state */}
        {programGate === "no-eligible" && (
          <section className="bg-white border border-slate-200 rounded-3xl p-10 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-rose-50 border border-rose-200 text-rose-500 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h3 className="text-lg font-bold mb-2">No verified programs for {profile?.field || "this field"} ({profile?.level || "this level"})</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              Unifinder only recommends schools with a verified program record at your chosen level.
            </p>
          </section>
        )}

        {/* Filter pills */}
        {bucketed && bucketed.top10.length > 0 && (
          <>
            <FadeIn delay={0.05}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold tracking-tight">Your shortlist</h2>
                <span className="text-sm font-semibold text-slate-400 tabular-nums">{counts.all} schools</span>
              </div>
              <div className="flex gap-2 mb-7 overflow-x-auto -mx-1 px-1 pb-1" style={{ scrollbarWidth: "none" }}>
                <FilterPill label="All"    count={counts.all}    active={activeFilter === "all"}    onClick={() => setActiveFilter("all")} />
                <FilterPill label="Reach"  count={counts.reach}  active={activeFilter === "reach"}  onClick={() => setActiveFilter("reach")} />
                <FilterPill label="Target" count={counts.target} active={activeFilter === "target"} onClick={() => setActiveFilter("target")} />
                <FilterPill label="Safety" count={counts.safety} active={activeFilter === "safety"} onClick={() => setActiveFilter("safety")} />
              </div>
            </FadeIn>

            <div className="space-y-10 pb-8">
              {(activeFilter === "all" || activeFilter === "reach")  && <BucketSection bucket="reach"  matches={bucketed.reach}  showHeader={activeFilter === "all"} />}
              {(activeFilter === "all" || activeFilter === "target") && <BucketSection bucket="target" matches={bucketed.target} showHeader={activeFilter === "all"} />}
              {(activeFilter === "all" || activeFilter === "safety") && <BucketSection bucket="safety" matches={bucketed.safety} showHeader={activeFilter === "all"} />}
            </div>
          </>
        )}
      </main>

      {bucketed && bucketed.top10.length > 0 && (
        <UnlockDock
          user={user}
          unlocking={unlocking}
          unlockError={unlockError}
          unlockElapsed={unlockElapsed}
          tip={STUDY_TIPS[tipIndex]}
          onUnlock={handleUnlock}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function PageLoader({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={20} className="text-slate-400 mx-auto mb-3 animate-spin" />
        <p className="text-sm text-slate-500">{label}…</p>
      </div>
    </div>
  );
}

function FilterPill({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
        active
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      }`}>
      {label}{count > 0 && active && <span className="ml-1.5 opacity-70">{count}</span>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function BucketSection({ bucket, matches, showHeader }: {
  bucket: keyof typeof BUCKETS;
  matches: SchoolMatch[];
  showHeader: boolean;
}) {
  if (matches.length === 0) return null;
  const meta = BUCKETS[bucket];
  return (
    <section>
      {showHeader && (
        <FadeIn>
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                <h3 className="text-base font-bold">{meta.title}</h3>
                <span className="text-sm text-slate-400 tabular-nums">{matches.length}</span>
              </div>
              <p className="text-xs text-slate-500">{meta.desc}</p>
            </div>
          </div>
        </FadeIn>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {matches.map((m, i) => (
          <FadeInItem key={i} index={i} as="article">
            <PlaceCard match={m} />
          </FadeInItem>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Image-only "place" card matching the Mount-Fuji card from the reference.
// Locked: school name is a frosted blur, lock icon top-right.
// ─────────────────────────────────────────────────────────────────────────────
function PlaceCard({ match }: { match: SchoolMatch }) {
  return (
    <div className="relative aspect-[3/4] rounded-[28px] overflow-hidden group cursor-not-allowed shadow-[0_4px_24px_rgba(15,23,42,0.08)] hover:shadow-[0_12px_40px_rgba(15,23,42,0.16)] transition-shadow">
      <SchoolCardArt
        unitId={match.school.unitId}
        schoolUrl={match.school.schoolUrl}
        name={match.school.name}
        className="absolute inset-0 w-full h-full transition-transform duration-700 ease-out group-hover:scale-105"
      />
      {/* Bottom gradient for text legibility */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

      {/* Lock chip top-right */}
      <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-slate-900">
        <Lock size={13} />
      </div>

      {/* Bottom overlay: locked name shimmer + chips */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="h-5 bg-white/30 backdrop-blur-md rounded-md w-2/3 mb-1.5 animate-pulse" />
        <div className="h-3 bg-white/20 backdrop-blur-md rounded-md w-1/2 mb-3" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-white text-[11px] font-semibold">
            <MapPin size={10} /> {match.school.state || "USA"}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-slate-900 text-[11px] font-bold">
            <Star size={10} className="fill-current" /> {match.matchScore}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sticky unlock dock — full width on mobile, max-w-xl on desktop
// During unlock: morphs into staged progress + tip card
// ─────────────────────────────────────────────────────────────────────────────
function UnlockDock({
  user, unlocking, unlockError, unlockElapsed, tip, onUnlock,
}: {
  user: ReturnType<typeof useAuth>["user"];
  unlocking: boolean;
  unlockError: string;
  unlockElapsed: number;
  tip: string;
  onUnlock: () => void;
}) {
  const progress = unlocking ? progressFor(unlockElapsed) : 0;
  const stageLabel = useMemo(
    () => STAGES.find(s => unlockElapsed < s.until)?.label ?? STAGES[STAGES.length - 1].label,
    [unlockElapsed],
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-5 pointer-events-none">
      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
        className="max-w-xl mx-auto pointer-events-auto"
      >
        {!unlocking ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_12px_50px_rgba(15,23,42,0.12)] p-4">
            {unlockError && <UnlockErrorBanner kind={unlockError} />}
            <button onClick={onUnlock}
              className="flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 text-white text-base font-semibold py-4 rounded-2xl transition-all active:scale-[0.99]">
              {user ? <>Unlock report · 1 credit <Send size={15} /></>
                    : <>Create free account <ArrowRight size={15} /></>}
            </button>
            {!user && (
              <p className="mt-3 text-center text-[11px] text-slate-500">
                Includes 2 free credits · Save schools · No card required
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_12px_50px_rgba(15,23,42,0.12)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Loader2 size={16} className="text-slate-700 animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={stageLabel}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="text-sm font-semibold text-slate-900 truncate"
                  >
                    {stageLabel}
                  </motion.p>
                </AnimatePresence>
                <p className="text-[11px] text-slate-500 mt-0.5">Usually 30–60 seconds · {unlockElapsed}s</p>
              </div>
              <span className="text-sm font-bold text-slate-900 tabular-nums">{Math.round(progress)}%</span>
            </div>

            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
              <motion.div
                className="h-full bg-slate-900 rounded-full"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 min-h-[88px]">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={12} className="text-amber-500" />
                <p className="text-[11px] font-semibold text-slate-500">Did you know</p>
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={tip}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="text-[13px] text-slate-700 leading-relaxed"
                >
                  {tip}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function UnlockErrorBanner({ kind }: { kind: string }) {
  if (kind === "insufficient_credits")
    return (
      <div className="mb-3 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl text-xs font-medium text-rose-700 flex items-center justify-between">
        <span>Not enough credits.</span>
        <Link to="/app/credits" className="underline hover:no-underline font-semibold inline-flex items-center gap-1">Get more <ChevronRight size={11} /></Link>
      </div>
    );
  if (kind === "no_eligible_programs")
    return (
      <div className="mb-3 bg-amber-50 border border-amber-200 px-3.5 py-2.5 rounded-xl text-xs font-medium text-amber-800">
        No verified programs for this field/level yet — no credit deducted.
      </div>
    );
  return (
    <div className="mb-3 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl text-xs font-medium text-rose-700">
      <Info size={12} className="inline mr-1" />{kind}
    </div>
  );
}
