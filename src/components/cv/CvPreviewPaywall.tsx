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
//   - The paywall card sits below the preview as a separate gradient-bordered
//     surface — clear visual break between "what you see" and "what you
//     pay to see."
//
// State machine:
//   unlocked = false → paper preview + paywall card with Unlock CTA
//   unlocked = true  → full paper document + copy/download bar
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import {
  Lock, Loader2, Wand2, ArrowRight, Copy, Check, Download,
  GraduationCap, Briefcase, Award, Wrench, Users, ScrollText, FileText,
} from "lucide-react";
import CvMarkdown from "./CvMarkdown";
import { formatTokens } from "../../lib/tokens";

interface UnlockResult {
  fullMarkdown:    string;
  unlocked:        boolean;
  alreadyUnlocked: boolean;
  newBalance?:     number | null;
}

// Per-mode theming so the paywall + section badges echo the tool's color.
const MODE_THEME: Record<"review" | "build" | "convert", {
  gradient: string;
  ringSoft: string;
  ctaBg:    string;
  ctaShadow:string;
  chipBg:   string;
  chipBorder: string;
  chipText: string;
  label:    string;
}> = {
  review:  { gradient: "from-blue-100/60 via-white to-cyan-50/40",
             ringSoft: "ring-blue-200/60",
             ctaBg: "bg-blue-600 hover:bg-blue-700",
             ctaShadow: "shadow-blue-500/30",
             chipBg: "bg-blue-50", chipBorder: "border-blue-200", chipText: "text-blue-700",
             label: "Review & revamp" },
  build:   { gradient: "from-violet-100/60 via-white to-fuchsia-50/40",
             ringSoft: "ring-violet-200/60",
             ctaBg: "bg-violet-600 hover:bg-violet-700",
             ctaShadow: "shadow-violet-500/30",
             chipBg: "bg-violet-50", chipBorder: "border-violet-200", chipText: "text-violet-700",
             label: "Build from scratch" },
  convert: { gradient: "from-emerald-100/60 via-white to-teal-50/40",
             ringSoft: "ring-emerald-200/60",
             ctaBg: "bg-emerald-600 hover:bg-emerald-700",
             ctaShadow: "shadow-emerald-500/30",
             chipBg: "bg-emerald-50", chipBorder: "border-emerald-200", chipText: "text-emerald-700",
             label: "Professional → Academic" },
};

// Floating decorative section icons. Positioned around the document
// card to hint "your CV will have these sections." Purely visual.
const FLOATING_SECTIONS: { icon: React.ReactNode; label: string; pos: string; color: string; delay: string }[] = [
  { icon: <GraduationCap size={14} />, label: "Education",   pos: "top-2 -left-4 sm:-left-6",          color: "from-blue-500 to-blue-600",       delay: "0s" },
  { icon: <Briefcase     size={14} />, label: "Work",        pos: "top-1/3 -right-4 sm:-right-6",      color: "from-emerald-500 to-emerald-600", delay: "0.4s" },
  { icon: <Award         size={14} />, label: "Awards",      pos: "bottom-1/3 -left-4 sm:-left-6",     color: "from-amber-500 to-amber-600",     delay: "0.8s" },
  { icon: <Users         size={14} />, label: "Leadership",  pos: "bottom-6 -right-4 sm:-right-6",     color: "from-violet-500 to-violet-600",   delay: "1.2s" },
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
        <div className="bg-gradient-to-r from-emerald-50 via-emerald-50 to-white border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/30">
            <Wand2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-emerald-900">Unlocked · ready to download</p>
            <p className="text-xs text-emerald-800/80">Your full document is below. Copy or download as Markdown.</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-[13px] font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-md shadow-slate-900/20"
          >
            {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
            {copyState === "copied" ? "Copied" : "Copy Markdown"}
          </button>
          <button
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-[13px] font-bold bg-white text-slate-900 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <Download size={14} /> Download .md
          </button>
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
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-slate-500 ml-2">
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
            className={`absolute ${s.pos} hidden md:flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full bg-white border border-slate-200 shadow-lg animate-pulse`}
            style={{ animationDuration: "4s", animationDelay: s.delay }}
            aria-hidden
          >
            <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${s.color} text-white flex items-center justify-center`}>
              {s.icon}
            </div>
            <span className="text-[11px] font-black tracking-wider text-slate-700 uppercase">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Paywall card */}
      <div className={`relative bg-gradient-to-br ${theme.gradient} rounded-[28px] border border-slate-200 ring-1 ${theme.ringSoft} shadow-xl shadow-slate-900/[0.04] overflow-hidden`}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className={`absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl bg-gradient-to-br ${theme.gradient} opacity-60`} />
        </div>

        <div className="relative p-8 sm:p-10 flex flex-col lg:flex-row items-center gap-7 lg:gap-10">
          {/* Left — message */}
          <div className="flex-1 text-center lg:text-left">
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] uppercase ${theme.chipBg} ${theme.chipText} border ${theme.chipBorder} rounded-full px-2.5 py-1 mb-4`}>
              <Lock size={10} /> Locked · unlock to read in full
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-[1.1] mb-3">
              Want the rest of your CV?
            </h3>
            <p className="text-[15px] text-slate-700 leading-relaxed max-w-md">
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
                  className={`inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl text-sm font-bold text-white shadow-lg ${theme.ctaBg} ${theme.ctaShadow} transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap`}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {busy ? "Unlocking…" : "Unlock — free for you"}
                </button>
                <p className="text-[11px] text-slate-500 text-center lg:text-right">Founder account — no tokens charged.</p>
              </>
            ) : canAfford ? (
              <>
                <button
                  onClick={handleUnlock}
                  disabled={busy}
                  className={`inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl text-sm font-bold text-white shadow-lg ${theme.ctaBg} ${theme.ctaShadow} transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap`}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  {busy ? "Unlocking…" : `Unlock — ${formatTokens(creditCost)} tokens`}
                </button>
                <p className="text-[11px] text-slate-500 text-center lg:text-right">
                  You have {formatTokens(walletCredits)} · {formatTokens((walletCredits ?? 0) - creditCost)} left after
                </p>
              </>
            ) : (
              <>
                <Link
                  to="/pricing"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20 transition-colors whitespace-nowrap"
                >
                  Get tokens to unlock <ArrowRight size={16} />
                </Link>
                <p className="text-[11px] text-slate-500 text-center lg:text-right">
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
    <div className="relative bg-white rounded-[24px] border border-slate-200 shadow-2xl shadow-slate-900/[0.06] overflow-hidden">
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
    <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 px-3 py-2.5 flex items-center justify-center gap-2 text-center">
      <span className="text-slate-500">{icon}</span>
      <span className="text-[12px] font-bold text-slate-700">{label}</span>
    </div>
  );
}
