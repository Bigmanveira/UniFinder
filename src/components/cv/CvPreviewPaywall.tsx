// ─────────────────────────────────────────────────────────────────────────────
// CvPreviewPaywall — the shared "you've seen ~30% of your CV, unlock the rest"
// surface. Used by all three CV Studio flows after the AI returns the
// generated document.
//
// State machine:
//   props.unlocked = false  → show preview only + paywall card with Unlock CTA
//   props.unlocked = true   → show full document + copy/download CTAs
//
// Wallet-aware: if the user can't afford the unlock cost, the CTA swaps
// to "Get credits" pointing at /pricing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { Lock, Loader2, Sparkles, ArrowRight, Copy, Check, Download } from "lucide-react";
import CvMarkdown from "./CvMarkdown";

interface UnlockResult {
  fullMarkdown:    string;
  unlocked:        boolean;
  alreadyUnlocked: boolean;
  newBalance?:     number | null;
}

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
  fullMarkdown:    string | null;        // null until unlocked
  unlocked:        boolean;
  walletCredits:   number | null;
  isFounder:       boolean;
  onUnlocked:      (fullMarkdown: string, newBalance: number | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

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
        setError("Not enough credits. Top up your wallet, then come back.");
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
    // Plain .md download — opens in any text editor. PDF export is a
    // V2 follow-up (jsPDF / browser print).
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

  // ── Unlocked state ─────────────────────────────────────────────────────
  if (unlocked && fullMarkdown) {
    return (
      <div className="space-y-5">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3.5 text-[13px] text-emerald-900 leading-relaxed flex items-center gap-2.5">
          <Sparkles size={15} className="text-emerald-700 flex-shrink-0" />
          <span><span className="font-bold">Unlocked.</span> Your full document is below. Copy it or download as Markdown.</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors"
          >
            {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
            {copyState === "copied" ? "Copied" : "Copy Markdown"}
          </button>
          <button
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold bg-white text-slate-900 border border-slate-200 hover:border-slate-300 transition-colors"
          >
            <Download size={14} /> Download .md
          </button>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-7 sm:p-9">
          <CvMarkdown markdown={fullMarkdown} />
        </div>
      </div>
    );
  }

  // ── Preview + paywall state ────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="relative bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-7 sm:p-9">
          <CvMarkdown markdown={previewMarkdown} />
        </div>
        {/* Fade — softens the cut at the preview boundary so the document
            looks like it continues behind the paywall card rather than
            abruptly ending. */}
        <div className="h-24 bg-gradient-to-b from-transparent via-white/70 to-white pointer-events-none" aria-hidden />
      </div>

      <div className="relative bg-gradient-to-br from-blue-50 via-white to-white rounded-3xl border border-blue-200 ring-1 ring-blue-100 shadow-sm p-7 sm:p-9 text-center">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] uppercase bg-blue-100 text-blue-800 border border-blue-200 rounded-full px-2.5 py-1 mb-5">
          <Lock size={10} /> Locked
        </span>
        <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-500/30">
          <Lock size={26} />
        </div>
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-2">
          Unlock the full CV
        </h3>
        <p className="text-base text-slate-700 max-w-md mx-auto leading-relaxed mb-6">
          You've seen the first portion. Unlock the complete document — every section, every detail — and download it as Markdown.
        </p>

        {isFounder ? (
          <>
            <button
              onClick={handleUnlock}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {busy ? "Unlocking…" : "Unlock — free for you"}
            </button>
            <p className="text-[11px] text-slate-500 mt-2.5">Founder account — credits aren't charged.</p>
          </>
        ) : canAfford ? (
          <>
            <button
              onClick={handleUnlock}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {busy ? "Unlocking…" : `Unlock — ${creditCost} credits`}
            </button>
            <p className="text-[11px] text-slate-500 mt-2.5">
              You have {walletCredits} credit{walletCredits === 1 ? "" : "s"} · this leaves {(walletCredits ?? 0) - creditCost} after.
            </p>
          </>
        ) : (
          <>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-md transition-colors"
            >
              Get credits to unlock <ArrowRight size={14} />
            </Link>
            <p className="text-[11px] text-slate-500 mt-2.5">
              Unlocking costs {creditCost} credits. You have {walletCredits ?? 0}.
            </p>
          </>
        )}

        {error && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}
