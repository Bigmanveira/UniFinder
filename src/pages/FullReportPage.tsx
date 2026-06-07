import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { db, functions } from "../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  MapPin, Globe, Heart, ArrowLeft, ArrowRight, AlertTriangle, Sparkles,
  Check, ChevronDown, ChevronUp, Lightbulb, DollarSign,
  Star, Loader2, Target, Percent, Send, BookOpen, RefreshCw, Lock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { bucketizeMatches } from "../lib/matching/matchSchools";
import SchoolCardArt from "../components/schools/SchoolCardArt";
import { logoUrl, faviconUrl } from "../lib/schools/schoolLogo";
import type { SchoolMatch } from "../types";
import { FadeIn, FadeInItem } from "../components/FadeIn";
import FeedbackSurveyModal from "../components/FeedbackSurveyModal";
import { useShouldShowSurvey } from "../hooks/useShouldShowSurvey";

// ─────────────────────────────────────────────────────────────────────────────
// SchoolLogo — small circular logo badge with graceful Clearbit → favicon
// → null fallback. Renders nothing if all sources fail.
// ─────────────────────────────────────────────────────────────────────────────
function SchoolLogo({
  schoolUrl, size = "md",
}: {
  schoolUrl: string | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const [src, setSrc] = useState<string | null>(() => logoUrl(schoolUrl, 200));
  const [hidden, setHidden] = useState(false);
  if (!src || hidden) return null;
  const dim = size === "sm" ? "w-9 h-9" : size === "lg" ? "w-14 h-14" : "w-11 h-11";
  return (
    <div className={`${dim} rounded-full bg-white shadow-md ring-1 ring-slate-200 p-1.5 flex items-center justify-center flex-shrink-0`}>
      <img
        src={src}
        alt=""
        className="w-full h-full object-contain"
        onError={() => {
          // Clearbit miss → try Google favicon. Favicon miss → hide.
          const fallback = faviconUrl(schoolUrl, 128);
          if (fallback && fallback !== src) setSrc(fallback);
          else setHidden(true);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────
interface SchoolExplanation {
  schoolName: string;
  tagline: string;
  programAvailability: "yes" | "likely" | "check" | "unknown";
  programNote: string;
  whyYouFit: string;
  applicationTips: string[];
  fundingTips: string[];
}
interface AiReportExplanation {
  headline: string;
  summary: string;
  topStrengths: string[];
  quickWins: string[];
  schoolExplanations: SchoolExplanation[];
}

type BucketKey = "all" | "reach" | "target" | "safety";

const BUCKETS = {
  reach: {
    title: "Reach",
    desc:  "Selective programs where you're competitive but not guaranteed.",
    dot:   "bg-rose-500",
    accent: "text-rose-700",
    chip:   "bg-rose-50 text-rose-700 border-rose-200",
    rule:   "from-rose-300 to-transparent",
  },
  target: {
    title: "Target",
    desc:  "Realistic matches — your profile aligns with their typical admit.",
    dot:   "bg-blue-500",
    accent: "text-blue-700",
    chip:   "bg-blue-50 text-blue-700 border-blue-200",
    rule:   "from-blue-300 to-transparent",
  },
  safety: {
    title: "Safety",
    desc:  "High admission probability. Solid backups for your shortlist.",
    dot:   "bg-emerald-500",
    accent: "text-emerald-700",
    chip:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    rule:   "from-emerald-300 to-transparent",
  },
} as const;

function budgetTone(v: string): "good" | "warn" | "bad" | "neutral" {
  if (v === "Excellent" || v === "Good") return "good";
  if (v === "Stretch") return "warn";
  if (v === "Out of Budget") return "bad";
  return "neutral";
}

// ─────────────────────────────────────────────────────────────────────────────
// AI hero — clean dark feature card with deep blue tones
// ─────────────────────────────────────────────────────────────────────────────
function AiHero({ ai }: { ai: AiReportExplanation }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[28px] bg-slate-950 text-white"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950" />
      <div className="absolute -top-32 -right-32 w-80 h-80 bg-blue-500/15 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl" />

      <div className="relative p-7 sm:p-8">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-semibold mb-4">
          <Sparkles size={11} className="text-amber-300" /> AI Insight
        </span>
        <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight leading-[1.15] mb-3 max-w-3xl">{ai.headline}</h2>
        <p className="text-[14px] sm:text-[15px] text-white/75 leading-relaxed max-w-2xl mb-6">{ai.summary}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-4 backdrop-blur-md">
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-7 h-7 rounded-full bg-amber-400/20 flex items-center justify-center">
                <Star size={11} className="text-amber-300" />
              </div>
              <p className="text-[11px] font-semibold text-white/60 tracking-wide">YOUR STRENGTHS</p>
            </div>
            <ul className="space-y-1.5">
              {ai.topStrengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-white/90 leading-relaxed">
                  <Check size={11} className="text-emerald-300 flex-shrink-0 mt-1" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-4 backdrop-blur-md">
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-7 h-7 rounded-full bg-amber-400/20 flex items-center justify-center">
                <Lightbulb size={12} className="text-amber-300" />
              </div>
              <p className="text-[11px] font-semibold text-white/60 tracking-wide">QUICK WINS</p>
            </div>
            <ol className="space-y-1.5">
              {ai.quickWins.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-white/90 leading-relaxed">
                  <span className="text-white/40 flex-shrink-0 tabular-nums w-3 font-semibold">{i + 1}</span>
                  <span>{w}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Image-only "place" card — tap to open detail modal
// ─────────────────────────────────────────────────────────────────────────────
function PlaceCard({
  match, ai, saved, onClick,
}: {
  match: SchoolMatch;
  ai: SchoolExplanation | null;
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-[3/4] w-full rounded-[28px] overflow-hidden text-left active:scale-[0.98] transition-transform shadow-[0_4px_24px_rgba(15,23,42,0.08)] hover:shadow-[0_12px_40px_rgba(15,23,42,0.16)]"
    >
      <SchoolCardArt
        unitId={match.school.unitId}
        schoolUrl={match.school.schoolUrl}
        name={match.school.name}
        className="absolute inset-0 w-full h-full transition-transform duration-700 ease-out group-hover:scale-105"
      />
      {/* Bottom-only gradient so the school name + chips stay legible */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

      {/* Save heart top-right with spring bounce when toggling state */}
      <motion.div
        animate={saved ? { scale: [1, 1.25, 1] } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 14 }}
        className={`absolute top-3 right-3 w-9 h-9 rounded-full shadow-md flex items-center justify-center transition-colors ${
          saved ? "bg-rose-500 text-white" : "bg-white text-slate-900"
        }`}
      >
        <Heart size={14} className={saved ? "fill-current" : ""} />
      </motion.div>

      {/* Bottom overlay: logo + name + chips */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="flex items-end gap-2.5 mb-2">
          <SchoolLogo schoolUrl={match.school.schoolUrl} size="sm" />
          <h3 className="text-white text-[15px] sm:text-base font-bold leading-tight line-clamp-2 drop-shadow flex-1 min-w-0">
            {match.school.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-white text-[11px] font-semibold">
            <MapPin size={10} /> {match.school.state || "USA"}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-slate-900 text-[11px] font-bold">
            <Star size={10} className="fill-current" /> {match.matchScore}
          </span>
          {ai && match.admissionLikelihood != null && match.admissionLikelihood >= 70 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold">High odds</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail modal — mirrors the reference's right screen
// Image hero → name + match → Overview → stat pills → description → tips → CTA
// ─────────────────────────────────────────────────────────────────────────────
function DetailModal({
  match, ai, saved, bucket, onClose, onSave,
}: {
  match: SchoolMatch;
  ai: SchoolExplanation | null;
  saved: boolean;
  bucket: keyof typeof BUCKETS;
  onClose: () => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = BUCKETS[bucket];
  const tone = budgetTone(match.budgetFit);
  const admit = match.school.admissionRate != null
    ? `${Math.round(match.school.admissionRate * 100)}%`
    : "—";
  const likelihood = match.admissionLikelihood ?? null;

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Image hero */}
        <div className="relative flex-shrink-0 h-64 sm:h-72">
          <SchoolCardArt
            unitId={match.school.unitId}
            schoolUrl={match.school.schoolUrl}
            name={match.school.name}
            className="absolute inset-0 w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 to-transparent pointer-events-none" />

          {/* Close top-left, save top-right (mirrors reference) */}
          <button onClick={onClose}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-slate-900 hover:bg-slate-50">
            <ArrowLeft size={16} />
          </button>
          <motion.button
            onClick={onSave}
            disabled={saved}
            animate={saved ? { scale: [1, 1.25, 1] } : { scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 14 }}
            className={`absolute top-4 right-4 w-10 h-10 rounded-full shadow-md flex items-center justify-center transition-colors ${
              saved ? "bg-rose-500 text-white" : "bg-white text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Heart size={16} className={saved ? "fill-current" : ""} />
          </motion.button>

          {/* Bucket chip overlaid on bottom of image */}
          <div className="absolute bottom-4 left-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md text-slate-900 text-[11px] font-bold shadow-md">
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {meta.title}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Header row: logo + name + match */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <SchoolLogo schoolUrl={match.school.schoolUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[22px] font-bold leading-tight tracking-tight mb-1">{match.school.name}</h2>
                  <p className="text-sm text-slate-500 flex items-center gap-1">
                    <MapPin size={12} /> {match.school.city ? `${match.school.city}, ${match.school.state}` : match.school.state}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] text-slate-500">Match</p>
                <p className="text-2xl font-bold tabular-nums leading-none">{match.matchScore}</p>
              </div>
            </div>

            {/* Overview header */}
            <div className="pt-2">
              <h3 className="text-base font-bold">Overview</h3>
            </div>

            {/* Stats row — three pills like reference */}
            <div className="grid grid-cols-3 gap-2">
              <StatPill icon={<Percent size={13} />}    label="Admit"     value={admit} />
              <StatPill icon={<DollarSign size={13} />} label="Budget"    value={match.budgetFit} tone={tone} />
              <StatPill icon={<Target size={13} />}     label="Your odds" value={likelihood !== null ? `${likelihood}` : "—"} />
            </div>

            {/* Verified program note */}
            {ai && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                ai.programAvailability === "yes" || ai.programAvailability === "likely"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}>
                {ai.programAvailability === "yes" || ai.programAvailability === "likely"
                  ? <Check size={11} />
                  : <BookOpen size={11} />}
                {ai.programNote}
              </div>
            )}

            {/* Description */}
            {ai && (
              <div className="space-y-2">
                <p className="text-[13px] text-slate-500 italic leading-relaxed">{ai.tagline}</p>
                <p className="text-sm text-slate-700 leading-relaxed">{ai.whyYouFit}</p>
              </div>
            )}

            {/* Tips drawer */}
            {ai && (
              <div>
                <button onClick={() => setOpen(v => !v)}
                  className="flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-900">
                  {open ? "Hide tips" : "Admission & funding tips"}
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <AnimatePresence>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-3">
                        <TipBlock title="Admission" icon={<Check size={11} />} tips={ai.applicationTips} />
                        <TipBlock title="Funding" icon={<DollarSign size={11} />} tips={ai.fundingTips} accent="emerald" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Sticky CTA — Visit website + Save school as paired pills */}
        <div className="flex-shrink-0 border-t border-slate-100 p-4 bg-white">
          <div className="flex items-center gap-2">
            {match.school.schoolUrl && (
              <a
                href={match.school.schoolUrl.startsWith("http") ? match.school.schoolUrl : `https://${match.school.schoolUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 text-sm sm:text-base font-semibold py-4 rounded-2xl transition-colors active:scale-[0.99] bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                <Globe size={15} /> Visit website
              </a>
            )}
            <button
              onClick={onSave}
              disabled={saved}
              className={`flex-1 flex items-center justify-center gap-2 text-sm sm:text-base font-semibold py-4 rounded-2xl transition-all active:scale-[0.99] ${
                saved
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                  : "bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20"
              }`}
            >
              {saved ? <><Check size={16} /> Saved</> : <>Save school <Send size={15} /></>}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatPill({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string | number;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const valueCls =
    tone === "good" ? "text-emerald-700"
    : tone === "warn" ? "text-amber-700"
    : tone === "bad"  ? "text-rose-600"
    : "text-slate-900";
  return (
    <div className="bg-slate-50 rounded-2xl p-3 flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-[13px] font-bold tabular-nums leading-none truncate ${valueCls}`}>{value}</p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-none">{label}</p>
      </div>
    </div>
  );
}

function TipBlock({ title, icon, tips, accent = "slate" }: {
  title: string;
  icon: React.ReactNode;
  tips: string[];
  accent?: "slate" | "emerald";
}) {
  const cls = accent === "emerald"
    ? { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", num: "text-emerald-400" }
    : { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-700",   num: "text-slate-400" };
  return (
    <div className={`${cls.bg} ${cls.border} border rounded-2xl p-4`}>
      <div className="flex items-center gap-1.5 mb-2">
        <div className={`w-6 h-6 rounded-full bg-white flex items-center justify-center ${cls.text}`}>{icon}</div>
        <p className={`text-[11px] font-semibold ${cls.text}`}>{title}</p>
      </div>
      <ul className="space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="text-[13px] text-slate-700 flex items-start gap-1.5 leading-relaxed">
            <span className={`${cls.num} flex-shrink-0 tabular-nums w-3 font-semibold`}>{i + 1}.</span>{tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function BucketSection({
  bucket, matches, schoolAiMap, savedIds, onCardClick, showHeader,
}: {
  bucket: keyof typeof BUCKETS;
  matches: SchoolMatch[];
  schoolAiMap: Record<string, SchoolExplanation>;
  savedIds: string[];
  onCardClick: (m: SchoolMatch, b: keyof typeof BUCKETS) => void;
  showHeader: boolean;
}) {
  if (matches.length === 0) return null;
  const meta = BUCKETS[bucket];
  return (
    <section>
      {showHeader && (
        <FadeIn>
          <header className="mb-5 sm:mb-6">
            <div className="flex items-center gap-3 mb-2">
              <span className={`inline-flex items-center justify-center w-3 h-3 rounded-full ${meta.dot} shadow-sm`} aria-hidden />
              <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${meta.accent}`}>
                {meta.title} <span className="text-slate-900">schools</span>
              </h2>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tabular-nums border ${meta.chip}`}>
                {matches.length}
              </span>
              <div className={`hidden sm:block flex-1 h-px bg-gradient-to-r ${meta.rule}`} aria-hidden />
            </div>
            <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{meta.desc}</p>
          </header>
        </FadeIn>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {matches.map((m, i) => (
          <FadeInItem key={i} index={i}>
            <PlaceCard
              match={m}
              ai={schoolAiMap[m.school.name] ?? null}
              saved={savedIds.includes(m.school.unitId)}
              onClick={() => onCardClick(m, bucket)}
            />
          </FadeInItem>
        ))}
      </div>
    </section>
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
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function FullReportPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<BucketKey>("all");
  const [openMatch, setOpenMatch] = useState<{ match: SchoolMatch; bucket: keyof typeof BUCKETS } | null>(null);

  // Feedback survey eligibility — gated by useShouldShowSurvey
  // (14-day cooldown + 50% probability). Prompt opens once per
  // report view, ~5 seconds after the report has loaded so the
  // user has time to actually look at it before being asked to
  // rate it.
  const { shouldShow: surveyEligible } = useShouldShowSurvey();
  const [surveyOpen, setSurveyOpen] = useState(false);
  useEffect(() => {
    if (!surveyEligible || loading || error || !report) return;
    const t = setTimeout(() => setSurveyOpen(true), 5_000);
    return () => clearTimeout(t);
  }, [surveyEligible, loading, error, report]);

  // Live wallet balance — drives the "you have N credits" hint on the
  // locked-bucket cards + grays out the Reveal button when the user
  // can't afford a 5-credit reveal. onSnapshot so a successful
  // purchase mid-page-view enables the button without a refresh.
  const [walletCredits, setWalletCredits] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "creditWallets", user.uid), (snap) => {
      if (snap.exists()) {
        const c = snap.data()?.credits;
        setWalletCredits(typeof c === "number" ? c : 0);
      } else {
        // Wallet not yet materialised — treat as the implicit signup grant
        // so the UI matches the dashboard / ops portal default.
        setWalletCredits(2);
      }
    });
    return () => unsub();
  }, [user]);

  // Per-bucket reveal action. Atomic on the backend; we optimistically
  // toggle local state once the callable resolves so the locked card
  // flips to the school list immediately. The report `unlockedBuckets`
  // field is also updated server-side; if the user navigates away and
  // back, the new state is persisted.
  const [revealingBucket, setRevealingBucket] = useState<"reach" | "safety" | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const handleReveal = async (bucket: "reach" | "safety") => {
    if (!reportId || revealingBucket) return;
    setRevealingBucket(bucket);
    setRevealError(null);
    try {
      const fn = httpsCallable<{ reportId: string; bucket: "reach" | "safety" }, { ok: boolean; alreadyUnlocked: boolean }>(
        functions, "revealMatchReportBucket",
      );
      await fn({ reportId, bucket });
      // Optimistic local update — the server-side write is in flight
      // (or done). Either way the UI should flip to "unlocked" now.
      setReport((prev: any) => prev ? {
        ...prev,
        unlockedBuckets: { ...(prev.unlockedBuckets ?? {}), [bucket]: true },
      } : prev);
    } catch (err: any) {
      setRevealError(err?.message ?? "Could not reveal this category. Please try again.");
    } finally {
      setRevealingBucket(null);
    }
  };

  // Re-match flow: clear cached profile so the wizard starts fresh, then go to /intake
  const handleRunNewMatch = () => {
    try { localStorage.removeItem("unifinder_guest_profile"); } catch { /* noop */ }
    navigate("/intake");
  };

  useEffect(() => {
    async function loadReport() {
      if (!user || !reportId) return;
      try {
        const ref = doc(db, "matchReports", reportId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.userId === user.uid) setReport(data);
          else setError("Unauthorized access.");
        } else {
          setError("Report not found.");
        }
        const savedRef = doc(db, "savedSchools", user.uid);
        const savedSnap = await getDoc(savedRef);
        if (savedSnap.exists()) {
          const data = savedSnap.data();
          if (data.schools) setSavedIds(data.schools.map((s: any) => s.unitId));
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [user, reportId]);

  const handleSave = async (school: any) => {
    if (!user || savedIds.includes(school.unitId)) return;
    setSavedIds(prev => [...prev, school.unitId]);
    const savedRef = doc(db, "savedSchools", user.uid);
    try {
      const snap = await getDoc(savedRef);
      const data = {
        unitId: school.unitId, name: school.name, city: school.city, state: school.state,
        schoolUrl: school.schoolUrl || null, ownership: school.ownership || null,
      };
      if (snap.exists()) {
        await updateDoc(savedRef, { schools: arrayUnion(data) });
      } else {
        await setDoc(savedRef, { userId: user.uid, schools: [data] });
      }
    } catch (err) {
      console.error("Error saving school:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={20} className="text-slate-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-500">Loading your report…</p>
        </div>
      </div>
    );
  }
  if (error || !report) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-rose-50 border border-rose-200 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={18} />
          </div>
          <h2 className="text-xl font-bold mb-2 tracking-tight">Report not found</h2>
          <p className="text-sm text-slate-500 mb-6">{error || "Something went wrong."}</p>
          <Link to="/app" className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-5 py-2.5 rounded-2xl inline-block transition-colors">Return to dashboard</Link>
        </div>
      </div>
    );
  }

  // Bucket data — prefer backend-precomputed, fall back gracefully.
  const reachStored:  SchoolMatch[] | undefined = report.bucketReach;
  const targetStored: SchoolMatch[] | undefined = report.bucketTarget;
  const safetyStored: SchoolMatch[] | undefined = report.bucketSafety;
  const top10FromBackend: SchoolMatch[] | undefined = report.top10Matches;

  const bucketed =
    reachStored && targetStored && safetyStored
      ? {
          reach:  reachStored,
          target: targetStored,
          safety: safetyStored,
          top10:  top10FromBackend ?? [...reachStored, ...targetStored, ...safetyStored],
        }
      : top10FromBackend
        ? bucketizeMatches(top10FromBackend)
        : bucketizeMatches(
            ((report.matches as SchoolMatch[] | undefined) ?? []).filter(
              m => m.category === "Strong Fit" || m.category === "Good Fit" || m.category === "Exploratory Fit"
            )
          );

  const ai: AiReportExplanation | null = report.aiExplanation ?? null;
  const schoolAiMap: Record<string, SchoolExplanation> = {};
  if (ai?.schoolExplanations) {
    for (const se of ai.schoolExplanations) {
      schoolAiMap[se.schoolName] = se;
      schoolAiMap[se.schoolName.trim().replace(/\.$/, "")] = se;
    }
  }

  const counts = {
    all:    bucketed.top10.length,
    reach:  bucketed.reach.length,
    target: bucketed.target.length,
    safety: bucketed.safety.length,
  };

  const initial = (user?.email?.[0] ?? "U").toUpperCase();

  return (
    <div className="min-h-screen text-slate-900 antialiased pb-24 relative overflow-hidden bg-gradient-to-b from-white via-blue-50/30 to-white">
      {/* Decorative soft glow blobs */}
      <div className="pointer-events-none absolute top-[-100px] right-[-100px] w-[440px] h-[440px] bg-blue-200/40 rounded-full blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute top-[120px] left-[-120px] w-[380px] h-[380px] bg-cyan-200/30 rounded-full blur-[120px]" aria-hidden />

      {/* Sticky header — back, title, run-new-match, avatar */}
      <header className="border-b border-slate-200 sticky top-0 z-40 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/app" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors">
            <ArrowLeft size={15} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">Your top {bucketed.top10.length} matches</h1>
            <p className="text-xs text-slate-500 truncate">
              {bucketed.reach.length} reach · {bucketed.target.length} target · {bucketed.safety.length} safety
            </p>
          </div>
          <button
            onClick={handleRunNewMatch}
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            title="Try different criteria"
          >
            <RefreshCw size={12} /> New match
          </button>
          <button
            onClick={handleRunNewMatch}
            className="sm:hidden w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors"
            aria-label="Run new match"
          >
            <RefreshCw size={14} />
          </button>
          <div className="w-9 h-9 rounded-full ring-2 ring-white shadow-sm bg-gradient-to-br from-blue-500 to-cyan-600 text-white flex items-center justify-center font-bold text-sm">
            {initial}
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-5 py-7 space-y-9">
        {ai && <AiHero ai={ai} />}

        {/* Pill filters + bucket sections */}
        <FadeIn delay={0.1}>
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

        {/* Per-bucket lock gating. Legacy reports without an
            unlockedBuckets field are treated as fully unlocked so we
            don't retroactively re-gate old reports. New reports
            (post-feature) start with only Target unlocked; Reach +
            Safety stay behind a 5-credit reveal each. */}
        {(() => {
          const unlocks = report.unlockedBuckets ?? { target: true, reach: true, safety: true };
          const isUnlocked = (b: "reach" | "target" | "safety") => unlocks[b] !== false;
          const showSection = (b: "reach" | "target" | "safety") =>
            activeFilter === "all" || activeFilter === b;

          return (
            <div className="space-y-10">
              {showSection("reach") && (
                isUnlocked("reach")
                  ? <BucketSection bucket="reach"  matches={bucketed.reach}  schoolAiMap={schoolAiMap} savedIds={savedIds} onCardClick={(m, b) => setOpenMatch({ match: m, bucket: b })} showHeader={activeFilter === "all"} />
                  : <LockedBucketCard bucket="reach"  count={bucketed.reach.length}  walletCredits={walletCredits} busy={revealingBucket === "reach"}  onReveal={() => handleReveal("reach")}  showHeader={activeFilter === "all"} />
              )}
              {showSection("target") && (
                // Target is always unlocked post-initial-unlock. We
                // still gate on the field for completeness — if it
                // somehow says target:false, render the lock. In
                // practice this branch is the BucketSection path
                // 100% of the time.
                isUnlocked("target")
                  ? <BucketSection bucket="target" matches={bucketed.target} schoolAiMap={schoolAiMap} savedIds={savedIds} onCardClick={(m, b) => setOpenMatch({ match: m, bucket: b })} showHeader={activeFilter === "all"} />
                  : <div className="text-xs text-slate-400">Target should always be unlocked after the initial report unlock — report this if you see it.</div>
              )}
              {showSection("safety") && (
                isUnlocked("safety")
                  ? <BucketSection bucket="safety" matches={bucketed.safety} schoolAiMap={schoolAiMap} savedIds={savedIds} onCardClick={(m, b) => setOpenMatch({ match: m, bucket: b })} showHeader={activeFilter === "all"} />
                  : <LockedBucketCard bucket="safety" count={bucketed.safety.length} walletCredits={walletCredits} busy={revealingBucket === "safety"} onReveal={() => handleReveal("safety")} showHeader={activeFilter === "all"} />
              )}
              {revealError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {revealError}
                </p>
              )}
            </div>
          );
        })()}

        {/* Next stage — roadmap CTA */}
        <FadeIn>
          <button
            onClick={() => navigate("/app/roadmap")}
            className="group w-full text-left bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900 text-white rounded-3xl p-6 sm:p-7 relative overflow-hidden hover:shadow-xl hover:shadow-slate-900/20 transition-shadow"
          >
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl" aria-hidden />
            <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-cyan-500/15 rounded-full blur-3xl" aria-hidden />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white flex-shrink-0">
                <Sparkles size={20} className="text-amber-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold tracking-wide text-amber-300 mb-1">NEXT STAGE</p>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Your application roadmap</h3>
                <p className="text-sm text-white/70 mt-1 leading-relaxed">
                  Now that you have your shortlist, follow the step-by-step plan to apply, fund, and secure your visa.
                </p>
              </div>
              <div className="hidden sm:flex w-10 h-10 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors items-center justify-center text-white flex-shrink-0">
                <ArrowRight size={16} />
              </div>
            </div>
          </button>
        </FadeIn>

        <p className="text-xs text-slate-400 text-center max-w-xl mx-auto pt-6 leading-relaxed">
          Admission likelihood uses each school's overall admit rate as a proxy. Doctoral and competitive master's programs are typically more selective than the institutional average — verify on each program's official page.
        </p>
      </main>

      {/* Detail modal */}
      <AnimatePresence>
        {openMatch && (
          <DetailModal
            match={openMatch.match}
            bucket={openMatch.bucket}
            ai={schoolAiMap[openMatch.match.school.name] ?? null}
            saved={savedIds.includes(openMatch.match.school.unitId)}
            onClose={() => setOpenMatch(null)}
            onSave={() => handleSave(openMatch.match.school)}
          />
        )}
      </AnimatePresence>

      <FeedbackSurveyModal
        open={surveyOpen}
        trigger="match_report"
        triggerId={reportId}
        onClose={() => setSurveyOpen(false)}
      />
    </div>
  );
}

// ── Locked bucket card ────────────────────────────────────────────────
// Renders in place of <BucketSection> when the user hasn't unlocked
// that bucket yet. Shows a count of schools waiting + the reveal CTA.
// Wallet-aware: if the user can't afford the 5-credit reveal, swap the
// button for a "Get credits" link pointing at /pricing so they don't
// dead-end.

const REVEAL_BUCKET_COST = 5;

function LockedBucketCard({
  bucket, count, walletCredits, busy, onReveal, showHeader,
}: {
  bucket:        "reach" | "safety";
  count:         number;
  walletCredits: number | null;
  busy:          boolean;
  onReveal:      () => void;
  showHeader:    boolean;
}) {
  const meta = BUCKETS[bucket];
  const canAfford = walletCredits !== null && walletCredits >= REVEAL_BUCKET_COST;

  return (
    <section>
      {showHeader && (
        <div className="flex items-center gap-3 mb-4">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${meta.dot}`} aria-hidden />
          <h3 className={`text-base font-bold tracking-tight ${meta.accent}`}>{meta.title}</h3>
          <span className="text-xs text-slate-400 font-medium tabular-nums">{count} school{count === 1 ? "" : "s"}</span>
        </div>
      )}
      <div className="relative bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Decorative blurred placeholder rows underneath the card so
            the user gets a visual sense of "schools are here, you just
            can't see them yet." */}
        <div className="absolute inset-0 p-6 space-y-3 pointer-events-none opacity-30 blur-sm select-none" aria-hidden>
          {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded bg-slate-200 w-2/3" />
                <div className="h-2.5 rounded bg-slate-200 w-1/3" />
              </div>
            </div>
          ))}
        </div>

        <div className="relative p-7 sm:p-8 text-center">
          <div className={`w-14 h-14 rounded-2xl ${meta.chip} flex items-center justify-center mx-auto mb-4`}>
            <Lock size={22} />
          </div>
          <h4 className="text-lg font-black text-slate-900 mb-1">
            {count} {meta.title} school{count === 1 ? "" : "s"} waiting
          </h4>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed mb-5">
            {meta.desc} Unlock this category to see the full list with the same per-school detail as your Target picks.
          </p>
          {canAfford ? (
            <>
              <button
                onClick={onReveal}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-colors shadow-md bg-primary-600 hover:bg-primary-700 text-white shadow-primary-600/30 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                {busy ? "Revealing…" : `Reveal ${meta.title} for ${REVEAL_BUCKET_COST} credits`}
              </button>
              <p className="text-[11px] text-slate-400 mt-2">
                You have {walletCredits} credit{walletCredits === 1 ? "" : "s"} · this leaves you with {(walletCredits ?? 0) - REVEAL_BUCKET_COST}.
              </p>
            </>
          ) : (
            <>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-colors shadow-md bg-slate-900 hover:bg-slate-800 text-white"
              >
                <ArrowRight size={14} /> Get credits to reveal
              </Link>
              <p className="text-[11px] text-slate-500 mt-2">
                Revealing this category costs {REVEAL_BUCKET_COST} credits. You currently have {walletCredits ?? 0}.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
