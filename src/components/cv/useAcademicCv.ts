// ─────────────────────────────────────────────────────────────────────────────
// useAcademicCv — shared state + actions for the three Studio flows.
//
// One submit path (paste-text OR file-base64 OR builder-JSON), one unlock
// callback, one wallet listener. Pages compose this into their own form
// + intake-vs-preview UI; the heavy lifting lives here so all three
// flows behave the same.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, onSnapshot } from "firebase/firestore";
import { functions, db } from "../../lib/firebase";
import { isFounderEmail } from "../../lib/founders";
import { useAuth } from "../../hooks/useAuth";

export type CvMode = "review" | "build" | "convert";

export interface GeneratedDocument {
  documentId:      string;
  mode:            CvMode;
  previewMarkdown: string;
  fullMarkdown:    string | null;
  creditCost:      number;
  unlocked:        boolean;
}

interface GeneratePayload {
  inputText?:     string;
  fileBase64?:    string;
  fileMediaType?: string;
}

export function useAcademicCv(mode: CvMode) {
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [doc_,  setDoc] = useState<GeneratedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live wallet — drives the CvPreviewPaywall's affordability gate.
  const [walletCredits, setWalletCredits] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "creditWallets", user.uid), (snap) => {
      if (snap.exists()) {
        const c = snap.data()?.credits;
        setWalletCredits(typeof c === "number" ? c : 0);
      } else {
        setWalletCredits(2); // implicit signup grant
      }
    });
    return () => unsub();
  }, [user]);

  const isFounder = isFounderEmail(user?.email);

  const generate = async (payload: GeneratePayload) => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const fn = httpsCallable<
        { mode: CvMode } & GeneratePayload,
        { documentId: string; mode: CvMode; previewMarkdown: string; creditCost: number; unlocked: boolean }
      >(functions, "generateAcademicCvDocument", { timeout: 120_000 });
      const res = await fn({ mode, ...payload });
      setDoc({
        documentId:      res.data.documentId,
        mode:            res.data.mode,
        previewMarkdown: res.data.previewMarkdown,
        fullMarkdown:    null,
        creditCost:      res.data.creditCost,
        unlocked:        false,
      });
    } catch (err: any) {
      if (err?.details?.reason === "academic_cv_rate_limited") {
        setError("You've already used your free preview for this tool in the last 24 hours. Top up to unlock a previous run or come back tomorrow.");
      } else if (err?.details?.reason === "academic_cv_extraction_failed") {
        setError("We couldn't read text from that file. Try a clearer scan or paste the CV directly.");
      } else {
        setError(err?.message ?? "Could not generate the CV. Please try again.");
      }
    } finally {
      setGenerating(false);
    }
  };

  const onUnlocked = (fullMarkdown: string, _newBalance: number | null) => {
    setDoc((d) => d ? { ...d, fullMarkdown, unlocked: true } : d);
  };

  const reset = () => { setDoc(null); setError(null); };

  return { generating, document: doc_, error, walletCredits, isFounder, generate, onUnlocked, reset };
}
