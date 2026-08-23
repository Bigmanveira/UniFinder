// FeedbackSurveyModal — lightweight rating + optional comment after a
// user finishes a match report unlock or visa interview. Designed to
// be over in 10 seconds. One star scale, one optional comment, and a
// skip button that's always visible.
//
// Surfacing rules live in useShouldShowSurvey — a 14-day cooldown +
// 50% probability gate so the prompt feels occasional, not mechanical.
// This component just handles the modal UI + submission.

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { Star, Loader2, X, CheckCircle2 } from "lucide-react";

export type SurveyTrigger = "match_report" | "visa_interview";

interface Props {
  open:       boolean;
  trigger:    SurveyTrigger;
  triggerId?: string;
  /** Fires on close (skip or after a submitted "Thank you" panel
   *  dismisses). Parent uses this to never re-open in the same
   *  session. */
  onClose:    () => void;
}

const TRIGGER_COPY: Record<SurveyTrigger, { title: string; subtitle: string }> = {
  match_report:   {
    title:    "How was your match report?",
    subtitle: "One quick rating — takes 10 seconds.",
  },
  visa_interview: {
    title:    "How was your visa practice?",
    subtitle: "Quick rating to help us tune the experience.",
  },
};

export default function FeedbackSurveyModal({ open, trigger, triggerId, onClose }: Props) {
  const [rating, setRating]   = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [busy, setBusy]       = useState(false);
  const [thanks, setThanks]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  if (!open) return null;

  // Fire-and-forget the submission so a slow Cloud Function doesn't
  // block the "Thank you" panel. The cooldown logic on the server is
  // robust to a duplicate submit so we don't need to await.
  const submit = async (status: "submitted" | "skipped") => {
    setBusy(true);
    setError(null);
    try {
      const fn = httpsCallable<
        { trigger: SurveyTrigger; triggerId?: string; rating: number | null; comment: string | null; status: "submitted" | "skipped" },
        { ok: boolean; reason?: string }
      >(functions, "submitFeedbackSurvey");
      await fn({
        trigger,
        triggerId,
        rating:  status === "submitted" ? rating : null,
        comment: comment.trim() || null,
        status,
      });
      if (status === "submitted") {
        // Show a 1.5s "thank you" panel then auto-close. Skips just
        // close immediately — no need to interrupt the user further.
        setThanks(true);
        setTimeout(() => onClose(), 1500);
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err?.message ?? "Could not record your feedback. Skipping.");
      // Failure on submit shouldn't trap the user — close after a
      // short delay so the error is visible but the prompt doesn't
      // become a wall.
      setTimeout(() => onClose(), 2000);
    } finally {
      setBusy(false);
    }
  };

  const copy = TRIGGER_COPY[trigger];
  const canSubmit = !busy && rating > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink/60 animate-fade-in"
      onClick={() => !busy && submit("skipped")}
    >
      <div
        className="relative overflow-hidden bg-white rounded-card-lg shadow-card border border-slate-100 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Signature ring decor — sits behind the header copy. */}
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full border-[16px] border-primary-100/70" />

        {thanks ? (
          // ── Thank-you panel ───────────────────────────────────────
          <div className="relative p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[#E8F5E9] text-[#2E7D32] flex items-center justify-center">
              <CheckCircle2 size={26} />
            </div>
            <h2 className="text-lg font-black tracking-tight text-slate-900 mb-1">Thanks for the feedback!</h2>
            <p className="text-sm text-slate-500">It helps us make College Ready better.</p>
          </div>
        ) : (
          <>
            <header className="relative flex items-start justify-between px-6 pt-6">
              <div className="pr-4">
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500">Quick feedback</p>
                <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900 leading-tight">{copy.title}</h2>
                <p className="text-xs text-slate-500 mt-1">{copy.subtitle}</p>
              </div>
              <button
                onClick={() => !busy && submit("skipped")}
                aria-label="Close"
                className="w-8 h-8 shrink-0 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X size={14} />
              </button>
            </header>

            <div className="relative px-6 py-4">
              {/* Star rating row. Click a star to pick. Hover state
                  is purely visual; the chosen rating sticks until
                  the user picks another. */}
              <div className="flex items-center justify-center gap-1.5 my-3" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => {
                  const filled = n <= rating;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      aria-checked={filled}
                      role="radio"
                      className="p-1.5 rounded-full hover:bg-primary-50 transition-colors"
                    >
                      <Star
                        size={28}
                        className={filled ? "text-primary-500 fill-primary-500" : "text-slate-300"}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Comment field appears AFTER a rating is chosen.
                  Optional — keeps the prompt feeling lightweight. */}
              {rating > 0 && (
                <label className="block mt-2 animate-fade-in">
                  <span className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-1.5">
                    One thing we could improve? (optional)
                  </span>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder={trigger === "visa_interview"
                      ? "e.g. Anna asked too many similar questions"
                      : "e.g. Funding info felt thin for HBCUs"}
                    className="w-full bg-white border border-slate-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 rounded-2xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors resize-none"
                  />
                </label>
              )}

              {error && (
                <p className="text-xs text-rose-700 mt-2 leading-snug">{error}</p>
              )}
            </div>

            <footer className="relative px-6 pb-6 pt-1 flex items-center gap-2.5">
              <button
                onClick={() => submit("skipped")}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-50 text-slate-600 font-bold py-3 rounded-full text-sm transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => submit("submitted")}
                disabled={!canSubmit}
                className="flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-full text-sm transition-colors bg-primary-500 hover:bg-primary-600 shadow-glow"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {busy ? "Sending…" : "Submit"}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
