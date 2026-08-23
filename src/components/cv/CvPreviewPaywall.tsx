// ─────────────────────────────────────────────────────────────────────────────
// CvPreviewPaywall — the "you've seen ~30% of your CV, unlock the rest"
// surface used by all three CV Studio flows after the AI returns the
// generated document.
//
// Visual treatment:
//   - The preview Markdown renders inside a paper-shadow document card
//     (8.5×11 feel, soft drop-shadow, off-white background) so it reads
//     like a printed CV rather than a generic web pane.
//   - Floating section badges around the card label what the candidate
//     gets (Education / Work / Skills / Leadership). They're decorative
//     anchor points + a subtle "real CV, real sections" signal.
//   - The paywall card sits below the preview as a separate ink-dark
//     surface — clear visual break between "what you see" and "what you
//     pay to see."
//
// State machine:
//   unlocked = false → paper preview + paywall card with Unlock CTA
//   unlocked = true  → full paper document + copy/download bar
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import {
  Lock, Loader2, Wand2, ArrowRight, Copy, Check, Download,
  GraduationCap, Briefcase, Award, Wrench, Users, ScrollText, FileText,
} from "lucide-react";
import CvMarkdown from "./CvMarkdown";
import { formatTokens } from "../../lib/tokens";
import { Button } from "../ui/Button";
import { IconChip } from "../ui/IconChip";

interface UnlockResult {
  fullMarkdown:    string;
  unlocked:        boolean;
  alreadyUnlocked: boolean;
  newBalance?:     number | null;
}

// Per-mode metadata. The redesign is single-accent (primary blue), so the
// only thing that still varies by mode is the human-readable label — the
// mode-selection logic stays intact.
const MODE_THEME: Record<"review" | "build" | "convert", {
  label: string;
}> = {
  review:  { label: "Review & revamp" },
  build:   { label: "Build from scratch" },
  convert: { label: "Professional → Academic" },
};

// Floating decorative section icons. Positioned around the document
// card to hint "your CV will have these sections." Purely visual.
const FLOATING_SECTIONS: { icon: React.ReactNode; label: string; pos: string }[] = [
  { icon: <GraduationCap size={14} />, label: "Education",   pos: "top-2 -left-4 sm:-left-6" },
  { icon: <Briefcase     size={14} />, label: "Work",        pos: "top-1/3 -right-4 sm:-right-6" },
  { icon: <Award         size={14} />, label: "Awards",      pos: "bottom-1/3 -left-4 sm:-left-6" },
  { icon: <Users         size={14} />, label: "Leadership",  pos: "bottom-6 -right-4 sm:-right-6" },
];

export default function CvPreviewPaywall({
  documentId,
  mode,
  creditCost,
  previewMarkdown,
  fullMarkdown,
  unlocked,
  walletCredits,
  isFounder,
  onUnlocked,
}: {
  documentId:      string;
  mode:            "review" | "build" | "convert";
  creditCost:      number;
  previewMarkdown: string;
  fullMarkdown:    string | null;
  unlocked:        boolean;
  walletCredits:   number | null;
  isFounder:       boolean;
  onUnlocked:      (fullMarkdown: string, newBalance: number | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const theme = MODE_THEME[mode];

  const canAfford = isFounder || (walletCredits !== null && walletCredits >= creditCost);

  const handleUnlock = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fn = httpsCallable<{ documentId: string }, UnlockResult>(functions, "unlockAcademicCvDocument");
      const res = await fn({ documentId });
      onUnlocked(res.data.fullMarkdown, res.data.newBalance ?? null);
    } catch (err: any) {
      if (err?.details?.reason === "insufficient_credits") {
        setError("Not enough tokens. Top up your wallet, then come back.");
      } else {
        setError(err?.message ?? "Could not unlock. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!fullMarkdown) return;
    try {
      await navigator.clipboard.writeText(fullMarkdown);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2_000);
    } catch {
      setError("Could not copy to clipboard. Select the text manually instead.");
    }
  };

  const handleDownload = () => {
    if (!fullMarkdown) return;
    const blob = new Blob([fullMarkdown], { type: "text/markdown;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `academic-cv-${mode}-${documentId.slice(0, 8)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Unlocked state ────────────────────────────────────────────────
  if (unlocked && fullMarkdown) {
    return (
      <div className="space-y-5">
        {/* Status bar */}
        <div className="bg-white border border-slate-200/70 rounded-card shadow-card px-5 py-4 flex items-center gap-3">
          <IconChip icon={<Wand2 size={18} />} tint="primary" size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black tracking-tight text-slate-900">Unlocked · ready to download</p>
            <p className="text-xs text-slate-500">Your full document is below. Copy or download as Markdown.</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex gap-2">
          <Button
            onClick={handleCopy}
            variant="dark"
            icon={copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
          >
            {copyState === "copied" ? "Copied" : "Copy Markdown"}
          </Button>
          <Button onClick={handleDownload} variant="outline" icon={<Download size={14} />}>
            Download .md
          </Button>
        </div>

        {/* Paper document */}
        <PaperDocument>
          <CvMarkdown markdown={fullMarkdown} />
        </PaperDocument>
      </div>
    );
  }

  // ── Preview + paywall state ───────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Decorated preview region — paper doc + floating section badges */}
      <div className="relative">
        {/* Top-of-document tab — visual "draft v1" feel */}
        <div className="flex items-center gap-2 mb-3 ml-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-primary-200" />
            <span className="w-2.5 h-2.5 rounded-full bg-primary-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-primary-600" />
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-eyebrow text-slate-400 ml-2">
            <FileText size={10} /> {theme.label} · Draft preview
          </span>
        </div>

        {/* The paper. Lives in a relative wrapper so floating icons can
            absolute-position around it. */}
        <PaperDocument>
          <CvMarkdown markdown={previewMarkdown} />
          {/* Fade-out at bottom so the cut isn't abrupt */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white pointer-events-none" aria-hidden />
        </PaperDocument>

        {/* Floating section anchors */}
        {FLOATING_SECTIONS.map((s) => (
          <div
            key={s.label}
            className={`absolute ${s.pos} hidden md:flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full bg-white border border-slate-200/70 shadow-card`}
            aria-hidden
          >
            <div className="w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center">
              {s.icon}
            </div>
            <span className="text-[11px] font-semibold tracking-eyebrow text-slate-700 uppercase">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Paywall card — ink-dark surface with the signature ring + orb decor */}
      <div className="relative bg-ink text-white rounded-card-lg overflow-hidden shadow-card">
        <div aria-hidden className="absolute -right-8 -top-10 w-36 h-36 rounded-full border-[18px] border-primary-500/20" />
        <div aria-hidden className="absolute -right-6 top-8 w-48 h-48 rounded-full bg-primary-500/15 blur-3xl" />

        <div className="relative p-8 sm:p-10 flex flex-col lg:flex-row items-center gap-7 lg:gap-10">
          {/* Left — message */}
          <div className="flex-1 text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-eyebrow uppercase bg-white/10 text-white/80 border border-white/15 rounded-full px-2.5 py-1 mb-4">
              <Lock size={10} /> Locked · unlock to read in full
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-[1.1] mb-3">
              Want the rest of your CV?
            </h3>
            <p className="text-[15px] text-white/70 leading-relaxed max-w-md">
              You've seen the first portion. Unlock to read every section in full and download as a clean Markdown file.
            </p>
          </div>

          {/* Right — CTA stack */}
          <div className="w-full lg:w-auto flex flex-col items-stretch lg:items-end gap-2">
            {isFounder ? (
              <>
                <button
                  onClick={handleUnlock}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 shadow-glow active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {busy ? "Unlocking…" : "Unlock — free for you"}
                </button>
                <p className="text-[11px] text-white/50 text-center lg:text-right">Founder account — no tokens charged.</p>
              </>
            ) : canAfford ? (
              <>
                <button
                  onClick={handleUnlock}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 shadow-glow active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  {busy ? "Unlocking…" : `Unlock — ${formatTokens(creditCost)} tokens`}
                </button>
                <p className="text-[11px] text-white/50 text-center lg:text-right">
                  You have {formatTokens(walletCredits)} · {formatTokens((walletCredits ?? 0) - creditCost)} left after
                </p>
              </>
            ) : (
              <>
                <Button to="/pricing" variant="primary" size="lg" className="whitespace-nowrap">
                  Get tokens to unlock <ArrowRight size={16} />
                </Button>
                <p className="text-[11px] text-white/50 text-center lg:text-right">
                  {formatTokens(creditCost)} tokens needed · you have {formatTokens(walletCredits ?? 0)}
                </p>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="relative px-8 sm:px-10 pb-6 -mt-4">
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>
          </div>
        )}
      </div>

      {/* Reassurance row — three quick benefits to push the unlock decision */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <ReassureChip icon={<ScrollText size={14} />} label="Every section" />
        <ReassureChip icon={<Wrench size={14} />}     label="Editable Markdown" />
        <ReassureChip icon={<Download size={14} />}   label="Instant download" />
      </div>
    </div>
  );
}

// ── Paper document container ─────────────────────────────────────────
// A soft drop-shadow + subtle inset highlight makes the markdown read
// like a printed page rather than a content area. The padding mirrors
// standard letter-page margins.
function PaperDocument({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative bg-white rounded-card border border-slate-200/70 shadow-card overflow-hidden">
      {/* Top-edge highlight to suggest real paper */}
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" aria-hidden />
      <div className="relative p-8 sm:p-12 lg:p-14">
        {children}
      </div>
    </div>
  );
}

function ReassureChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-white rounded-full border border-slate-200/70 shadow-sm px-3 py-2.5 flex items-center justify-center gap-2 text-center">
      <span className="text-primary-600">{icon}</span>
      <span className="text-[12px] font-bold text-slate-700">{label}</span>
    </div>
  );
}
