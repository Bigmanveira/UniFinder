import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  FileText,
  Landmark,
  Loader2,
  Mic,
  Plane,
  RotateCw,
  ShieldAlert,
  UserPlus,
  Video,
  WalletCards,
} from "lucide-react";
import type { VisaApplicantContext } from "../../types";

const DISCLAIMER =
  "This is a simulated F-1 visa interview for practice only. It is not legal advice, " +
  "not an official U.S. government service, and does not guarantee visa approval. " +
  "Final decisions are made by U.S. consular officers.";

const VISA_INTERVIEW_PAID_COST = 15;

const CONTEXT_OPTIONS: Array<{
  id: VisaApplicantContext;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    id: "first_time_applicant",
    label: "First time applicant",
    description: "This is my first U.S. visa application.",
    icon: <UserPlus size={17} />,
  },
  {
    id: "previous_refusal",
    label: "Returning after refusal",
    description: "I am returning after a U.S. visa refusal.",
    icon: <RotateCw size={17} />,
  },
  {
    id: "changed_school_or_program",
    label: "School or programme changed",
    description: "My new application has a different academic choice.",
    icon: <Landmark size={17} />,
  },
  {
    id: "changed_funding_or_sponsor",
    label: "Funding changed",
    description: "My sponsor or source of funds is different now.",
    icon: <WalletCards size={17} />,
  },
  {
    id: "document_practice",
    label: "Document practice",
    description: "I want more I-20, DS-160, and process questions.",
    icon: <FileText size={17} />,
  },
  {
    id: "international_travel_history",
    label: "Travel history",
    description: "I have previous international travel to discuss.",
    icon: <Plane size={17} />,
  },
];

// "First time applicant" and "Returning after refusal" describe mutually
// exclusive histories. Selecting one clears the other so the question
// retriever never receives contradictory pre-interview context.
const CONFLICTING_CONTEXT: Partial<Record<VisaApplicantContext, VisaApplicantContext>> = {
  first_time_applicant: "previous_refusal",
  previous_refusal:     "first_time_applicant",
};

export default function InterviewIntroCard({
  onStart,
  starting,
  speechSupported,
  walletCredits,
  isFounder,
}: {
  onStart: (accepted: boolean, applicantContexts: VisaApplicantContext[]) => Promise<void>;
  starting: boolean;
  speechSupported: boolean;
  walletCredits: number | null;
  isFounder: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [applicantContexts, setApplicantContexts] = useState<VisaApplicantContext[]>([]);
  const canStart = accepted && !starting && speechSupported;
  const willBePreview = !isFounder && walletCredits !== null && walletCredits < VISA_INTERVIEW_PAID_COST;

  const toggleContext = (context: VisaApplicantContext) => {
    setApplicantContexts((current) =>
      current.includes(context)
        ? current.filter((value) => value !== context)
        : [...current.filter((value) => value !== CONFLICTING_CONTEXT[context]), context],
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0.4, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      {/* Briefing hero — dark ink surface with the signature ring/orb decor */}
      <section className="relative overflow-hidden rounded-card-lg bg-ink text-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-8 -top-10 w-40 h-40 rounded-full border-[18px] border-primary-500/20" />
          <div className="absolute -right-6 top-10 w-48 h-48 rounded-full bg-primary-500/15 blur-3xl" />
        </div>
        <div className="relative grid gap-0 sm:grid-cols-[1.15fr_0.85fr]">
          <div className="p-6 sm:p-8">
            <div className="mb-8 flex items-center justify-between sm:mb-12">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-eyebrow text-white/50">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-400" /> Interview briefing
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-white/70 sm:hidden">
                F-1 practice
              </span>
            </div>

            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <div className="absolute -inset-1 rounded-2xl bg-primary-500/35 blur-md" aria-hidden />
                <img
                  src="/anna.webp"
                  alt="Anna, your practice visa officer"
                  width={88}
                  height={104}
                  className="relative h-[104px] w-[88px] rounded-2xl border border-white/20 object-cover object-top shadow-xl"
                />
              </div>
              <div className="min-w-0 pt-1">
                <p className="text-xs font-semibold text-primary-300">Live with Anna</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-[2rem]">
                  Prepare the interview around your application.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-white/65">
                  Add the circumstances that matter. Anna will adapt using approved questions only.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/[0.045] p-6 backdrop-blur-sm sm:border-l sm:border-t-0 sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-white/50">Session format</p>
            <div className="mt-5 space-y-4">
              <SessionDetail icon={<Video size={16} />} label="Live interviewer" value="Face-to-face simulation" />
              <SessionDetail icon={<Mic size={16} />} label="Voice answers" value="No typing during the mock" />
              <SessionDetail icon={<ClipboardCheck size={16} />} label="Feedback" value="Evidence-based scoring" />
            </div>
          </div>
        </div>
      </section>

      {/* Applicant context picker */}
      <section className="rounded-card border border-slate-200/70 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-primary-600">Applicant context</p>
            <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">What applies to this application?</h3>
          </div>
          <p className="text-xs text-slate-500">Select any that apply</p>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {CONTEXT_OPTIONS.map((option) => {
            const selected = applicantContexts.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleContext(option.id)}
                aria-pressed={selected}
                className={[
                  "group flex min-h-[88px] items-start gap-3 rounded-2xl border p-3.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                  selected
                    ? "border-primary-500 bg-primary-50 shadow-[0_8px_22px_rgba(59,130,246,0.12)]"
                    : "border-slate-200 bg-slate-50/60 hover:border-primary-300 hover:bg-white",
                ].join(" ")}
              >
                <span className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                  selected ? "bg-ink text-white" : "bg-white text-slate-500 shadow-sm ring-1 ring-slate-200",
                ].join(" ")}>
                  {option.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm font-bold text-slate-900">
                    {option.label}
                    <span className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      selected ? "border-primary-600 bg-primary-600 text-white" : "border-slate-300 bg-white text-transparent",
                    ].join(" ")}>
                      <Check size={12} className="stroke-[3]" />
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        {applicantContexts.includes("previous_refusal") && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-xs leading-5 text-primary-900"
          >
            Anna will ask what reason you were given for the refusal and what changed in your new application.
          </motion.div>
        )}
      </section>

      {willBePreview && (
        <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3.5 text-[13px] leading-relaxed text-primary-900">
          <p className="font-bold">Free 2-minute preview</p>
          <p className="mt-0.5 text-primary-700">The full scored report unlocks with a 1,500-token interview.</p>
        </div>
      )}

      {!speechSupported && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-[13px] leading-relaxed text-rose-900">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <p><span className="font-bold">Voice input is unavailable.</span> Open College Ready in Chrome, Edge, Brave, or Safari.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAccepted((current) => !current)}
        aria-pressed={accepted}
        className={[
          "flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          accepted ? "border-primary-500 bg-primary-50" : "border-slate-200 bg-white hover:border-slate-300",
        ].join(" ")}
      >
        <span className={[
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
          accepted ? "border-primary-600 bg-primary-600 text-white" : "border-slate-300 bg-white text-transparent",
        ].join(" ")}>
          <Check size={12} className="stroke-[3]" />
        </span>
        <span className="text-[12.5px] leading-5 text-slate-600">
          <span className="font-bold text-slate-800">Practice simulation only.</span> {DISCLAIMER} I will answer truthfully.
        </span>
      </button>

      <button
        onClick={() => canStart && onStart(accepted, applicantContexts)}
        disabled={!canStart}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary-500 py-4 text-base font-bold text-white shadow-glow transition-all hover:bg-primary-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {starting ? (
          <Loader2 size={17} className="animate-spin" />
        ) : willBePreview ? (
          <>Start free preview <ArrowRight size={17} /></>
        ) : (
          <>Start interview · 1,500 tokens <ArrowRight size={17} /></>
        )}
      </button>
    </motion.div>
  );
}

function SessionDetail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-primary-300">
        {icon}
      </span>
      <div>
        <p className="text-xs font-bold text-white">{label}</p>
        <p className="mt-0.5 text-[11px] text-white/50">{value}</p>
      </div>
    </div>
  );
}
