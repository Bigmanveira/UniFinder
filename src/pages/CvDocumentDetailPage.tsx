// ─────────────────────────────────────────────────────────────────────────────
// CvDocumentDetailPage — opens a past CV from /app/cv-studio/history.
//
// Two states:
//   - Already unlocked → call unlockAcademicCvDocument (idempotent, returns
//     fullMarkdown without charging) and render the unlocked view.
//   - Still in preview → render the preview + paywall card. Same component
//     the studio flows use, so the unlock CTA works identically.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { db, functions } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { isFounderEmail } from "../lib/founders";
import { doc as docRef, onSnapshot as walletSnapshot } from "firebase/firestore";
import CvPreviewPaywall from "../components/cv/CvPreviewPaywall";
import CvStudioFooter from "../components/cv/CvStudioFooter";

interface DocState {
  documentId:      string;
  mode:            "review" | "build" | "convert";
  creditCost:      number;
  previewMarkdown: string;
  fullMarkdown:    string | null;
  unlocked:        boolean;
}

export default function CvDocumentDetailPage() {
  const { documentId } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState<DocState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletCredits, setWalletCredits] = useState<number | null>(null);
  const isFounder = isFounderEmail(user?.email);

  // Live wallet — drives the paywall card's affordability check.
  useEffect(() => {
    if (!user) return;
    const unsub = walletSnapshot(docRef(db, "creditWallets", user.uid), (snap) => {
      if (snap.exists()) {
        const c = snap.data()?.credits;
        setWalletCredits(typeof c === "number" ? c : 0);
      } else {
        setWalletCredits(2);
      }
    });
    return () => unsub();
  }, [user]);

  // Initial fetch. If the doc is unlocked, immediately call the idempotent
  // unlock endpoint to retrieve the fullMarkdown (which lives in a
  // rules-blocked subdoc, so the client can't read it directly).
  useEffect(() => {
    if (!user || !documentId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "academicCvDocuments", documentId));
        if (cancelled) return;
        if (!snap.exists()) {
          setError("CV not found. It may have been deleted.");
          return;
        }
        const data = snap.data() as any;
        if (data.userId !== user.uid) {
          setError("You don't have access to this CV.");
          return;
        }
        const mode: DocState["mode"] = (data.mode === "build" || data.mode === "convert") ? data.mode : "review";
        const base: DocState = {
          documentId,
          mode,
          creditCost:      typeof data.creditCost === "number" ? data.creditCost : 5,
          previewMarkdown: String(data.previewMarkdown ?? ""),
          fullMarkdown:    null,
          unlocked:        data.unlocked === true,
        };
        // Doc is already unlocked → fetch fullMarkdown via the unlock
        // callable (idempotent: returns fullMarkdown without charging when
        // unlocked: true on the doc).
        if (base.unlocked) {
          const fn = httpsCallable<{ documentId: string }, { fullMarkdown: string }>(functions, "unlockAcademicCvDocument");
          const res = await fn({ documentId });
          if (cancelled) return;
          base.fullMarkdown = res.data.fullMarkdown ?? "";
        }
        setState(base);
      } catch (err: any) {
        if (cancelled) return;
        console.error("[cv-detail] fetch error:", err);
        setError(err?.message ?? "Could not load this CV. Please try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [user, documentId]);

  const onUnlocked = (fullMarkdown: string, _newBalance: number | null) => {
    setState((s) => s ? { ...s, fullMarkdown, unlocked: true } : s);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute top-[-160px] right-[-120px] w-[480px] h-[480px] bg-gradient-to-br from-slate-300/40 via-blue-200/20 to-transparent rounded-full blur-[140px]" aria-hidden />

        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
            <Link to="/app/cv-studio/history" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to history">
              <ArrowLeft size={15} />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-bold leading-tight truncate">
                {state ? (state.mode === "review" ? "Review & revamp" : state.mode === "build" ? "Built from scratch" : "Professional → Academic") : "CV document"}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {state?.unlocked ? "Unlocked" : "Preview · unlock to read in full"}
              </p>
            </div>
          </div>
        </header>
      </div>

      <main className="relative max-w-3xl mx-auto px-5 py-8 w-full flex-1">
        {!state && !error && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="text-slate-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium rounded-2xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {state && (
          <CvPreviewPaywall
            documentId={state.documentId}
            mode={state.mode}
            creditCost={state.creditCost}
            previewMarkdown={state.previewMarkdown}
            fullMarkdown={state.fullMarkdown}
            unlocked={state.unlocked}
            walletCredits={walletCredits}
            isFounder={isFounder}
            onUnlocked={onUnlocked}
          />
        )}
      </main>

      <CvStudioFooter />
    </div>
  );
}
