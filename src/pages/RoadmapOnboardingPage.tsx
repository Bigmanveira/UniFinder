// ─────────────────────────────────────────────────────────────────────────────
// RoadmapOnboardingPage — 6-question diagnostic that produces the user's
// personalised study-abroad roadmap. The questions, options, and
// stage-assignment logic all come from src/lib/roadmap/studyAbroad.ts;
// this file is purely the UI + the write call.
//
// Behaviour:
//   - One question per screen (less overwhelming on mobile).
//   - Back / Next stepper with progress dots.
//   - On submit, calls createRoadmapFromOnboarding(), then navigates
//     the user to /app/roadmap where the new dashboard renders.
//   - If the user already has a roadmap, we still let them re-take the
//     diagnostic (it overwrites). The dashboard's "Update my stage"
//     button uses a separate route so we don't accidentally wipe
//     progress mid-flight.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, MapPin, Compass } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  createRoadmapFromOnboarding,
  getStudyRoadmap,
} from "../lib/roadmap/roadmapClient";
import {
  LABELS,
  type CompletedAcademicLevel,
  type CurrentProcessStatus,
  type OnboardingAnswers,
  type OriginCountry,
  type PrimaryNeed,
  type StartTerm,
  type TargetAcademicLevel,
} from "../lib/roadmap/studyAbroad";

type Q1 = CompletedAcademicLevel;
type Q2 = TargetAcademicLevel;
type Q3 = CurrentProcessStatus;
type Q4 = PrimaryNeed;
type Q5 = OriginCountry;
type Q6 = StartTerm;

// Order matches the spec word-for-word.
const Q1_OPTIONS: { value: Q1; label: string }[] = [
  { value: "shs_wassce",    label: LABELS.completedAcademicLevel.shs_wassce },
  { value: "diploma_hnd",   label: LABELS.completedAcademicLevel.diploma_hnd },
  { value: "bachelors",     label: LABELS.completedAcademicLevel.bachelors },
  { value: "masters",       label: LABELS.completedAcademicLevel.masters },
  { value: "in_university", label: LABELS.completedAcademicLevel.in_university },
  { value: "other",         label: LABELS.completedAcademicLevel.other },
];
const Q2_OPTIONS: { value: Q2; label: string }[] = [
  { value: "bachelors",       label: LABELS.targetAcademicLevel.bachelors },
  { value: "masters",         label: LABELS.targetAcademicLevel.masters },
  { value: "phd",             label: LABELS.targetAcademicLevel.phd },
  { value: "certificate",     label: LABELS.targetAcademicLevel.certificate },
  { value: "english_program", label: LABELS.targetAcademicLevel.english_program },
  { value: "not_sure",        label: LABELS.targetAcademicLevel.not_sure },
];
const Q3_OPTIONS: { value: Q3; label: string }[] = [
  { value: "just_starting",          label: LABELS.currentProcessStatus.just_starting },
  { value: "know_what_to_study",     label: LABELS.currentProcessStatus.know_what_to_study },
  { value: "looking_for_schools",    label: LABELS.currentProcessStatus.looking_for_schools },
  { value: "shortlisted_schools",    label: LABELS.currentProcessStatus.shortlisted_schools },
  { value: "preparing_applications", label: LABELS.currentProcessStatus.preparing_applications },
  { value: "submitted_applications", label: LABELS.currentProcessStatus.submitted_applications },
  { value: "have_admission",         label: LABELS.currentProcessStatus.have_admission },
  { value: "received_i20",           label: LABELS.currentProcessStatus.received_i20 },
  { value: "paid_sevis",             label: LABELS.currentProcessStatus.paid_sevis },
  { value: "completed_ds160",        label: LABELS.currentProcessStatus.completed_ds160 },
  { value: "booked_visa_interview",  label: LABELS.currentProcessStatus.booked_visa_interview },
  { value: "received_visa",          label: LABELS.currentProcessStatus.received_visa },
  { value: "preparing_to_travel",    label: LABELS.currentProcessStatus.preparing_to_travel },
];
const Q4_OPTIONS: { value: Q4; label: string }[] = [
  { value: "finding_schools",            label: LABELS.primaryNeed.finding_schools },
  { value: "choosing_program",           label: LABELS.primaryNeed.choosing_program },
  { value: "understanding_costs",        label: LABELS.primaryNeed.understanding_costs },
  { value: "scholarships_funding",       label: LABELS.primaryNeed.scholarships_funding },
  { value: "application_documents",      label: LABELS.primaryNeed.application_documents },
  { value: "visa_interview_preparation", label: LABELS.primaryNeed.visa_interview_preparation },
  { value: "pre_departure_preparation",  label: LABELS.primaryNeed.pre_departure_preparation },
  { value: "not_sure",                   label: LABELS.primaryNeed.not_sure },
];
const Q5_OPTIONS: { value: Q5; label: string }[] = [
  { value: "ghana",   label: LABELS.originCountry.ghana },
  { value: "nigeria", label: LABELS.originCountry.nigeria },
  { value: "kenya",   label: LABELS.originCountry.kenya },
  { value: "india",   label: LABELS.originCountry.india },
  { value: "other",   label: LABELS.originCountry.other },
];
const Q6_OPTIONS: { value: Q6; label: string }[] = [
  { value: "fall_2026",   label: LABELS.preferredStartTerm.fall_2026 },
  { value: "spring_2027", label: LABELS.preferredStartTerm.spring_2027 },
  { value: "fall_2027",   label: LABELS.preferredStartTerm.fall_2027 },
  { value: "not_sure",    label: LABELS.preferredStartTerm.not_sure },
];

const TOTAL_STEPS = 6;

export default function RoadmapOnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReonboarding = searchParams.get("update") === "1";

  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Partial<OnboardingAnswers>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a roadmap already exists and the user didn't explicitly ask to
  // re-onboard, bounce them straight to the dashboard. Stops a stray
  // bookmark from accidentally re-running the wizard.
  useEffect(() => {
    if (!user || isReonboarding) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await getStudyRoadmap(user.uid);
        if (cancelled) return;
        if (existing) navigate("/app/roadmap", { replace: true });
      } catch {
        // Silent — if the read fails, we just show onboarding.
      }
    })();
    return () => { cancelled = true; };
  }, [user, isReonboarding, navigate]);

  const setAnswer = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    setError(null);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };
  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    if (!user) { navigate("/login"); return; }
    if (!isComplete(answers)) {
      setError("Pick an answer for every question first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createRoadmapFromOnboarding({
        uid: user.uid,
        answers: answers as OnboardingAnswers,
      });
      navigate("/app/roadmap", { replace: true });
    } catch (err: any) {
      console.error("[roadmap-onboarding] create failed:", err);
      setError(err?.message ?? "Could not save your answers. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Per-step gating: Next disabled until the current step has an answer.
  const canAdvance = (() => {
    switch (step) {
      case 1: return Boolean(answers.completedAcademicLevel);
      case 2: return Boolean(answers.targetAcademicLevel);
      case 3: return Array.isArray(answers.currentProcessStatus) && answers.currentProcessStatus.length > 0;
      case 4: return Boolean(answers.primaryNeed);
      case 5: return Boolean(answers.originCountry);
      case 6: return Boolean(answers.preferredStartTerm);
      default: return false;
    }
  })();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 left-1/4 w-[560px] h-[560px] bg-gradient-to-br from-blue-300/25 via-violet-300/15 to-transparent rounded-full blur-[140px] animate-pulse" style={{ animationDuration: "9s" }} />
        <div className="absolute top-1/2 -right-32 w-[480px] h-[480px] bg-gradient-to-br from-emerald-300/20 via-cyan-200/10 to-transparent rounded-full blur-[140px] animate-pulse" style={{ animationDuration: "11s", animationDelay: "2s" }} />
      </div>

      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/app" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to dashboard">
            <ArrowLeft size={15} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">Build your roadmap</h1>
            <p className="text-xs text-slate-500 truncate">{isReonboarding ? "Updating your study-abroad answers" : "Six quick questions — about a minute"}</p>
          </div>
          <span className="hidden sm:inline-block text-[11px] font-black tracking-widest uppercase text-slate-500">
            Step {step} / {TOTAL_STEPS}
          </span>
        </div>
      </header>

      <main className="relative flex-1 max-w-2xl mx-auto px-5 py-10 sm:py-14 w-full">
        {/* Progress dots — visual cue of how far through the user is. */}
        <div className="flex items-center justify-center gap-1.5 mb-10" aria-hidden>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
            const idx = i + 1;
            const done   = idx < step;
            const active = idx === step;
            return (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  active ? "w-8 bg-gradient-to-r from-blue-500 to-violet-500"
                  : done  ? "w-1.5 bg-slate-700"
                  :         "w-1.5 bg-slate-300"
                }`}
              />
            );
          })}
        </div>

        {step === 1 && (
          <QuestionPanel
            kicker="About you"
            question="What academic level have you completed?"
            sub="The highest qualification you've already finished — not what you're applying for."
            icon={<Compass size={20} />}
            iconBg="from-blue-500 to-blue-700"
            options={Q1_OPTIONS}
            value={answers.completedAcademicLevel}
            onPick={(v) => { setAnswer("completedAcademicLevel", v); }}
          />
        )}
        {step === 2 && (
          <QuestionPanel
            kicker="Your goal"
            question="What level are you seeking admission for?"
            sub="The programme you want to enrol in next."
            icon={<Compass size={20} />}
            iconBg="from-violet-500 to-purple-600"
            options={Q2_OPTIONS}
            value={answers.targetAcademicLevel}
            onPick={(v) => { setAnswer("targetAcademicLevel", v); }}
          />
        )}
        {step === 3 && (
          <MultiSelectPanel<Q3>
            kicker="Where you are"
            question="Where are you currently in the process?"
            sub="Tick every one that applies. We'll route you to the furthest-along stage and surface the right next steps."
            icon={<MapPin size={20} />}
            iconBg="from-fuchsia-500 to-pink-600"
            options={Q3_OPTIONS}
            values={answers.currentProcessStatus ?? []}
            onToggle={(v) => {
              const current = answers.currentProcessStatus ?? [];
              const next = current.includes(v)
                ? current.filter((x) => x !== v)
                : [...current, v];
              setAnswer("currentProcessStatus", next);
            }}
            twoColumns
          />
        )}
        {step === 4 && (
          <QuestionPanel
            kicker="What you need"
            question="What do you need help with most right now?"
            sub="We'll surface the right tool first based on this."
            icon={<Compass size={20} />}
            iconBg="from-amber-500 to-orange-600"
            options={Q4_OPTIONS}
            value={answers.primaryNeed}
            onPick={(v) => { setAnswer("primaryNeed", v); }}
          />
        )}
        {step === 5 && (
          <QuestionPanel
            kicker="Where you're applying from"
            question="What country are you applying from?"
            sub="We're built for African students first — Ghana is the home market — but the tools work for anyone."
            icon={<MapPin size={20} />}
            iconBg="from-rose-500 to-red-600"
            options={Q5_OPTIONS}
            value={answers.originCountry}
            onPick={(v) => { setAnswer("originCountry", v); }}
          />
        )}
        {step === 6 && (
          <QuestionPanel
            kicker="When you'll start"
            question="When do you hope to start?"
            sub="Most US programmes have a main Fall intake. Spring is smaller."
            icon={<Compass size={20} />}
            iconBg="from-emerald-500 to-teal-600"
            options={Q6_OPTIONS}
            value={answers.preferredStartTerm}
            onPick={(v) => { setAnswer("preferredStartTerm", v); }}
          />
        )}

        {error && (
          <div className="mt-6 bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium rounded-2xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Footer controls */}
        <div className="mt-10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-[13px] font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canAdvance || submitting}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold bg-gradient-to-br from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Building your roadmap…" : "Build my roadmap"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function isComplete(a: Partial<OnboardingAnswers>): a is OnboardingAnswers {
  return Boolean(
    a.completedAcademicLevel &&
    a.targetAcademicLevel &&
    Array.isArray(a.currentProcessStatus) && a.currentProcessStatus.length > 0 &&
    a.primaryNeed &&
    a.originCountry &&
    a.preferredStartTerm,
  );
}

// ── QuestionPanel ─────────────────────────────────────────────────────
function QuestionPanel<T extends string>({
  kicker, question, sub, icon, iconBg, options, value, onPick, twoColumns,
}: {
  kicker: string;
  question: string;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onPick: (v: T) => void;
  twoColumns?: boolean;
}) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-7 sm:p-9">
      <div className="flex items-start gap-4 mb-7">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconBg} text-white flex items-center justify-center shadow-md flex-shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black tracking-[0.18em] uppercase text-slate-500 mb-1">{kicker}</p>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-tight mb-1.5">{question}</h2>
          <p className="text-[13px] text-slate-600 leading-relaxed">{sub}</p>
        </div>
      </div>

      <div className={`grid gap-2.5 ${twoColumns ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPick(opt.value)}
              aria-pressed={selected}
              className={`text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all ${
                selected
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-900 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-colors border-2 ${
                selected ? "bg-white border-white text-slate-900" : "bg-white border-slate-300"
              }`} aria-hidden>
                {selected && <Check size={12} className="stroke-[3]" />}
              </span>
              <span className="text-[14px] font-bold leading-snug">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── MultiSelectPanel ──────────────────────────────────────────────────
// Multi-select variant of QuestionPanel. Used by Step 3 so the user
// can tick every process-status that applies (e.g. "I have admission"
// + "I have paid SEVIS" + "I have completed DS-160"). The stage
// assignment picks the furthest-along selection.
function MultiSelectPanel<T extends string>({
  kicker, question, sub, icon, iconBg, options, values, onToggle, twoColumns,
}: {
  kicker: string;
  question: string;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
  options: { value: T; label: string }[];
  values: T[];
  onToggle: (v: T) => void;
  twoColumns?: boolean;
}) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-7 sm:p-9">
      <div className="flex items-start gap-4 mb-7">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconBg} text-white flex items-center justify-center shadow-md flex-shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black tracking-[0.18em] uppercase text-slate-500 mb-1">{kicker}</p>
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-tight">{question}</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-widest">
              Multi-select
            </span>
          </div>
          <p className="text-[13px] text-slate-600 leading-relaxed">{sub}</p>
        </div>
      </div>

      <div className={`grid gap-2.5 ${twoColumns ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        {options.map((opt) => {
          const selected = values.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              aria-pressed={selected}
              className={`text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all ${
                selected
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-900 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-colors border-2 ${
                selected ? "bg-white border-white text-slate-900" : "bg-white border-slate-300"
              }`} aria-hidden>
                {selected && <Check size={12} className="stroke-[3]" />}
              </span>
              <span className="text-[14px] font-bold leading-snug">{opt.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500 mt-4">
        {values.length === 0
          ? "Tick at least one."
          : `${values.length} selected.`}
      </p>
    </section>
  );
}
