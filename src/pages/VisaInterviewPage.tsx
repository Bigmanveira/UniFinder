import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Loader2, AlertTriangle, Mic, MicOff, Volume2, StopCircle } from "lucide-react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { isFounderEmail } from "../lib/founders";
import type {
  VisaApplicantContext, VisaDocumentType, VisaInterviewMessage, VisaInterviewReport,
} from "../types";
import InterviewIntroCard from "../components/visa/InterviewIntroCard";
import DocumentUploadModal from "../components/visa/DocumentUploadModal";
import InterviewReportView from "../components/visa/InterviewReportView";
import LiveAvatarPanel from "../components/visa/LiveAvatarPanel";
import { useSpeechRecognition } from "../lib/visa/useSpeechRecognition";
import FeedbackSurveyModal from "../components/FeedbackSurveyModal";
import { useShouldShowSurvey } from "../hooks/useShouldShowSurvey";

type Phase = "intro" | "active" | "report";

// During an active interview, this finer-grained state drives the on-screen
// status pill so the user always knows whose turn it is.
type ActiveStage =
  | "connecting"  // avatar still spinning up
  | "speaking"    // avatar is talking
  | "listening"   // mic is hot
  | "processing"  // we sent the answer, waiting on Claude
  | "micBlocked"  // mic permission denied — waiting on user to enable + tap retry
  | "failed";     // avatar couldn't come up — interview is dead in the water

export default function VisaInterviewPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [phase,        setPhase]        = useState<Phase>("intro");
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  const [messages,     setMessages]     = useState<VisaInterviewMessage[]>([]);
  const [starting,     setStarting]     = useState(false);
  const [ending,       setEnding]       = useState(false);
  const [report,       setReport]       = useState<VisaInterviewReport | null>(null);
  const [error,        setError]        = useState("");
  // At-capacity popup state. Surfaced when HeyGen has no concurrent
  // session slots free — we throw before charging credits so this is
  // a "try again in a moment" UX, not a "you've been charged and
  // it failed" UX.
  const [atCapacityOpen, setAtCapacityOpen] = useState(false);

  // Wallet credits — used to decide which CTA the intro card shows
  // (free 3-min preview vs paid 15-credit interview). The backend
  // re-derives this from the wallet on start so a stale client read
  // can't trick it into a wrong-mode session.
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

  // Session kind ("preview" | "paid") returned by startVisaInterviewSession.
  // Drives the preview-end paywall — when a preview ends, finishVisaInterview
  // refuses to score and we open this modal instead of the report view.
  const [sessionKind, setSessionKind] = useState<"preview" | "paid" | null>(null);
  const [previewEndOpen, setPreviewEndOpen] = useState(false);
  const [previewCooldownOpen, setPreviewCooldownOpen] = useState(false);

  // Feedback survey — opens ~7 seconds after the report renders so
  // the user has time to actually read their score before we ask
  // them to rate the experience. Eligibility gate (14-day cooldown
  // + 50% probability) lives in useShouldShowSurvey.
  const { shouldShow: surveyEligible } = useShouldShowSurvey();
  const [surveyOpen, setSurveyOpen] = useState(false);
  useEffect(() => {
    if (!surveyEligible) return;
    if (phase !== "report" || !report) return;
    const t = setTimeout(() => setSurveyOpen(true), 7_000);
    return () => clearTimeout(t);
    // We intentionally depend on phase + report so the timer (re)
    // starts the moment the report state lands. The eligibility
    // flag is stable for the page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, report, surveyEligible]);
  const [latestOfficer, setLatestOfficer] = useState<string | undefined>(undefined);
  const [pendingUpload, setPendingUpload] = useState<VisaDocumentType | null>(null);
  // When set, the upload modal opens AFTER the avatar finishes speaking the
  // line that asked for the document. Without this, the modal would pop while
  // Anna is still mid-sentence. Cleared once handleAvatarSpeakEnded fires.
  const [pendingUploadAfterSpeech, setPendingUploadAfterSpeech] = useState<VisaDocumentType | null>(null);
  // True when Anna's most recent reply was her closing line (isFinalQuestion).
  // We let her finish speaking before kicking off scoring so the user hears
  // the goodbye instead of being yanked to the report screen mid-sentence.
  const [pendingEndAfterSpeech, setPendingEndAfterSpeech] = useState(false);
  // True when mic permission was just denied and we've queued Anna's
  // "please enable mic" line. After she finishes speaking it, we flip
  // stage to "micBlocked" and show a Retry button instead of auto-arming.
  const [pendingMicRecoveryAfterSpeech, setPendingMicRecoveryAfterSpeech] = useState(false);
  const [stage,        setStage]        = useState<ActiveStage>("connecting");
  const [fatalReason,  setFatalReason]  = useState<string | null>(null);

  // Track which officer messages we've spoken so a remount/snapshot replay
  // doesn't make the avatar re-read the whole interview.
  const spokenOfficerIdsRef = useRef<Set<string>>(new Set());

  // ── Speech recognition ───────────────────────────────────────────────────
  const speech = useSpeechRecognition({
    onFinal: (text) => {
      console.log("[visa] onFinal — sending answer:", text.slice(0, 80));
      void sendAnswer(text);
    },
    onError: (code, message) => {
      if (code === "not-allowed") {
        // Mic permission denied. Don't kill the interview — have Anna ASK
        // the user to enable mic, then surface a Retry button.
        setError("");
        setPendingMicRecoveryAfterSpeech(true);
        setLatestOfficer("I can't hear you yet. Please allow microphone access for this site in your browser, then tap the Retry button below so we can continue.");
      } else if (code === "not-supported") {
        setError("Your browser doesn't support voice input. Use Chrome, Edge, or Safari.");
        setStage("failed");
        setFatalReason("Speech recognition unavailable.");
      } else {
        // Other errors (network, audio-capture) — note them but don't kill the session.
        console.warn("[speech] error:", code, message);
      }
    },
  });

  // Tap-Retry handler: re-arm the mic. If permission is still denied, the
  // speech hook's onError will set pendingMicRecoveryAfterSpeech again and
  // Anna will repeat the request.
  const handleMicRetry = () => {
    setStage("listening");
    setError("");
    speech.start();
  };

  // Subscribe to messages once we have a session
  useEffect(() => {
    if (!user || !sessionId) return;
    // The userId filter is REQUIRED for Firestore's rules engine to accept
    // this collection query — without it the rule
    //   auth.uid == resource.data.userId
    // can't be proven for every matching doc and the listener throws
    // permission-denied.
    const q = query(
      collection(db, "visaInterviewMessages"),
      where("userId",    "==", user.uid),
      where("sessionId", "==", sessionId),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: VisaInterviewMessage[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setMessages(list);
        const lastOfficer = [...list].reverse().find((m) => m.role === "officer");
        // Only push a new officerSpeech if this id hasn't been spoken yet — this
        // both (a) avoids re-speaking on snapshot replay, and (b) ensures the
        // LiveAvatarPanel sees a string-identity change to enqueue the new line.
        if (lastOfficer?.id && !spokenOfficerIdsRef.current.has(lastOfficer.id)) {
          spokenOfficerIdsRef.current.add(lastOfficer.id);
          setLatestOfficer(lastOfficer.text);
        }
      },
      (err) => {
        // Snapshot errors are silent by default — without this branch, a
        // permission-denied or missing-index error leaves the page stuck on
        // "connecting" while HeyGen burns credits in the background. Surface
        // it immediately so the avatar tears down.
        console.error("[visa] message snapshot error:", err.code, err.message);
        setError(`Could not load interview messages: ${err.message}`);
        setStage("failed");
        setFatalReason("Lost connection to the interview backend. The avatar has been stopped — your interview credit will need to be refunded manually for now.");
      },
    );
    return unsub;
  }, [user, sessionId]);

  const startInterview = async (accepted: boolean, applicantContexts: VisaApplicantContext[]) => {
    if (!user) { navigate("/login"); return; }
    if (!speech.isSupported) {
      setError("Voice mode requires Chrome, Edge, or Safari. This browser doesn't support speech recognition.");
      return;
    }
    setStarting(true);
    setError("");
    setStage("connecting");
    setFatalReason(null);
    spokenOfficerIdsRef.current.clear();

    // Prompt for mic + speech permission BEFORE creating the session, so we
    // don't burn a 15-credit interview on a doomed mic. iOS Safari especially
    // requires the prompt to happen inside this user-gesture handler — by the
    // time the avatar finishes its greeting and we try to auto-arm the mic
    // from a callback, the gesture is consumed and the prompt silently fails.
    const perm = await speech.requestPermission();
    if (!perm.ok) {
      setStarting(false);
      setStage("connecting");
      if (perm.code === "not-allowed") {
        setError("Microphone access is blocked. Enable it for this site in your browser settings (tap the address-bar lock icon on iOS Safari), then try again.");
      } else if (perm.code === "no-microphone") {
        setError("No microphone detected on this device. Plug one in or switch devices to start the interview.");
      } else if (perm.code === "insecure-context") {
        setError("Microphone access requires a secure connection. Open College Ready over HTTPS to start the interview.");
      } else if (perm.code === "not-supported") {
        setError("This browser doesn't support voice input. Open College Ready in Chrome, Edge, Brave, or Safari.");
      } else {
        setError(perm.message || "Could not access the microphone. Check browser permissions and try again.");
      }
      return;
    }

    try {
      const fn = httpsCallable(functions, "startVisaInterviewSession");
      const res = await fn({
        mode: "avatar",
        disclaimerAccepted: accepted,
        applicantContexts,
        isReturningApplicant: applicantContexts.includes("previous_refusal"),
      });
      const data = res.data as {
        sessionId: string;
        firstMessage?: string;
        requiresDocumentUpload?: VisaDocumentType | null;
        kind?: "preview" | "paid";
      };
      console.log("[visa] session started:", data.sessionId, "kind:", data.kind, "firstMessage?", !!data.firstMessage, "needsDoc?", data.requiresDocumentUpload);
      setSessionId(data.sessionId);
      setSessionKind(data.kind ?? "paid");
      // Use the first officer line from the start response directly. This
      // means the avatar can begin speaking the moment the SDK is live —
      // independent of whether the Firestore snapshot has caught up yet.
      // The snapshot still feeds subsequent turns.
      if (data.firstMessage) {
        setLatestOfficer(data.firstMessage);
      }
      // Queue the document modal for AFTER Anna finishes speaking the greeting.
      if (data.requiresDocumentUpload) {
        setPendingUploadAfterSpeech(data.requiresDocumentUpload);
      }
      setPhase("active");
    } catch (e: any) {
      console.error(e);
      // HeyGen has a concurrent-session cap (3 on the base plan). When
      // it's hit, the server throws resource-exhausted with
      // details.reason === "heygen_at_capacity". Distinguish that from
      // the generic "not enough credits" case so the user sees the
      // right message — and so they know their wallet wasn't charged.
      // Firebase exposes the HttpsError details on `e.details`.
      const detailsReason = e?.details?.reason;
      if (detailsReason === "heygen_at_capacity") {
        setAtCapacityOpen(true);
      } else if (detailsReason === "preview_cooldown_active") {
        // User already used their free preview in the last 7 days.
        // Surface a dedicated modal pointing at /pricing so they
        // understand it's a cooldown, not a system failure.
        setPreviewCooldownOpen(true);
      } else if (e?.code === "resource-exhausted" || /Insufficient credits/i.test(e?.message ?? "")) {
        setError("Not enough credits to start a practice interview. Top up your wallet to try again.");
      } else {
        setError(e?.message ?? "Could not start the interview. Please try again.");
      }
    } finally {
      setStarting(false);
    }
  };

  const sendAnswer = async (text: string) => {
    if (!sessionId) return;
    setError("");
    setStage("processing");
    try {
      const fn = httpsCallable(functions, "sendVisaInterviewAnswer", { timeout: 90_000 });
      const res = await fn({ sessionId, answer: text });
      const data = res.data as {
        requiresDocumentUpload: VisaDocumentType | null;
        isFinalQuestion: boolean;
      };
      if (data.requiresDocumentUpload) {
        // Pause speech work and surface the upload modal AFTER Anna finishes
        // speaking the line that asked for the doc.
        setPendingUploadAfterSpeech(data.requiresDocumentUpload);
      }
      if (data.isFinalQuestion) {
        // Anna just delivered her closing line. Let her finish speaking, then
        // auto-trigger scoring instead of arming the mic for another answer.
        setPendingEndAfterSpeech(true);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Could not send your answer. Please try again.");
      // If sending failed, give the user another shot: re-arm the mic.
      setStage("listening");
      speech.start();
    }
  };

  const endInterview = async () => {
    if (!sessionId) return;
    setEnding(true);
    setError("");
    speech.abort();

    // Preview sessions never get a scored report — short-circuit straight
    // to the paywall modal without hitting finishVisaInterviewSession.
    // Saves one round-trip + avoids logging a noisy permission-denied
    // error for the expected "preview ended" case.
    if (sessionKind === "preview") {
      setPreviewEndOpen(true);
      setEnding(false);
      return;
    }

    try {
      const fn = httpsCallable(functions, "finishVisaInterviewSession", { timeout: 180_000 });
      const res = await fn({ sessionId });
      setReport(res.data as VisaInterviewReport);
      setPhase("report");
    } catch (e: any) {
      console.error(e);
      // Belt-and-braces: if the server says this was a preview session
      // (e.g. sessionKind state somehow drifted), open the same paywall
      // modal rather than dumping a raw error to the user.
      if (e?.details?.reason === "preview_session_no_report") {
        setPreviewEndOpen(true);
      } else {
        setError(e?.message ?? "Could not finish the interview. Please try again.");
      }
    } finally {
      setEnding(false);
    }
  };

  // ── Avatar lifecycle hooks ───────────────────────────────────────────────
  const handleAvatarLive = () => {
    // Avatar pipe is open. We deliberately stay on "connecting" until
    // AVATAR_SPEAK_STARTED fires — that way, if Firestore is silent (eg.
    // permissions issue) the user sees a clearly stalled state instead of
    // a misleading "Officer is speaking".
  };

  const handleAvatarSpeakStarted = () => {
    // Avatar is now talking — flip the pill to "speaking" regardless of
    // whether we were in "processing" (Claude reply just landed) or
    // "connecting" (very first turn).
    setStage((s) => (s === "failed" ? s : "speaking"));
  };

  const handleAvatarSpeakEnded = () => {
    // Avatar finished its line. Decide what comes next, in priority order:
    //   1. Anna's last line was her sign-off → auto-end and go to scoring.
    //   2. Anna just asked the user to enable mic → wait for explicit Retry tap.
    //   3. There's an upload queued for after speech → open the modal.
    //   4. A modal is already open → do nothing.
    //   5. The session has failed → do nothing.
    //   6. Otherwise it's the student's turn → arm the mic.
    if (pendingEndAfterSpeech) {
      setPendingEndAfterSpeech(false);
      void endInterview();
      return;
    }
    if (pendingMicRecoveryAfterSpeech) {
      setPendingMicRecoveryAfterSpeech(false);
      setStage("micBlocked");
      return;
    }
    if (pendingUploadAfterSpeech) {
      setPendingUpload(pendingUploadAfterSpeech);
      setPendingUploadAfterSpeech(null);
      setStage("processing");
      return;
    }
    if (pendingUpload) return;
    if (stage === "failed" || stage === "micBlocked") return;
    setStage("listening");
    speech.start();
  };

  const handleAvatarFallback = (reason: string) => {
    // No graceful fallback — the entire UX is voice. Show a hard error so
    // the user knows the interview can't proceed and can claim their credit
    // back if needed.
    setStage("failed");
    setFatalReason(reason);
    speech.abort();
  };

  const handleAvatarTtsFailed = () => {
    // TTS for the most recent line never produced audio. We must NOT
    // auto-end the interview here — if Claude flagged this as the closing
    // line, ending without playing it would feel abrupt and silent. Cancel
    // the pending auto-end and surface a recoverable error so the user can
    // either keep talking or click the manual End button.
    if (pendingEndAfterSpeech) {
      setPendingEndAfterSpeech(false);
      setError("Couldn't play the avatar's voice for that line. Click 'End interview & get feedback' to score now.");
      setStage("processing");
      return;
    }
    // Mid-interview TTS failure. Quietly arm the mic so the user can keep
    // going — they missed Anna's spoken question but the chat won't lock up.
    setError("Audio for the avatar's last line failed. Please continue speaking.");
    setStage("listening");
    speech.start();
  };

  const reset = () => {
    speech.abort();
    setPhase("intro");
    setSessionId(null);
    setMessages([]);
    setReport(null);
    setError("");
    setLatestOfficer(undefined);
    setPendingUpload(null);
    setPendingUploadAfterSpeech(null);
    setPendingEndAfterSpeech(false);
    setPendingMicRecoveryAfterSpeech(false);
    setFatalReason(null);
    spokenOfficerIdsRef.current.clear();
    setStage("connecting");
  };

  // When a document upload modal opens, mute the mic. When it closes, the
  // avatar's next line will re-arm us via onSpeakEnded.
  useEffect(() => {
    if (pendingUpload && speech.isListening) {
      speech.abort();
      setStage("processing");
    }
  }, [pendingUpload, speech]);

  const headerSubtitle = useMemo(() => {
    if (phase === "intro")  return "Pre-flight your F-1 interview with realistic questions and AI feedback.";
    if (phase === "active") return "Answer truthfully — College Ready doesn't coach dishonesty.";
    return "Practice feedback — not an official assessment.";
  }, [phase]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 size={20} className="text-slate-400 animate-spin" />
      </div>
    );
  }

  // Active phase renders a full-bleed dark layout (Zoom/Meet-style) so the
  // avatar dominates the screen and the controls float as overlays. Intro
  // and report phases keep the existing light page chrome — they're more
  // document-like and deserve the standard header+main shell.
  if (phase === "active" && sessionId) {
    return (
      <>
        <FullScreenInterview
          sessionId={sessionId}
          latestOfficer={latestOfficer}
          stage={stage}
          ending={ending}
          messageCount={messages.length}
          fatalReason={fatalReason}
          error={error}
          onAvatarLive={handleAvatarLive}
          onAvatarSpeakStarted={handleAvatarSpeakStarted}
          onAvatarSpeakEnded={handleAvatarSpeakEnded}
          onAvatarTtsFailed={handleAvatarTtsFailed}
          onAvatarFallback={handleAvatarFallback}
          onMicRetry={handleMicRetry}
          onEnd={endInterview}
        />

        {/* Preview / cooldown / capacity modals MUST render in this branch
            too — the previous build only rendered them in the intro/report
            JSX block, so when a preview session ended (or the user clicked
            End mid-interview), endInterview's setPreviewEndOpen(true) fired
            but no modal was in the tree to receive it. Result: the user
            was stuck on a frozen-feeling interview screen. Both modals
            are fixed-position overlays so they sit above FullScreenInterview's
            z-40 backdrop. */}
        <PreviewEndModal
          open={previewEndOpen}
          onClose={() => { setPreviewEndOpen(false); navigate("/app"); }}
        />
        <PreviewCooldownModal
          open={previewCooldownOpen}
          onClose={() => { setPreviewCooldownOpen(false); navigate("/app"); }}
        />
        <AtCapacityModal
          open={atCapacityOpen}
          onClose={() => setAtCapacityOpen(false)}
        />

        {/* Document upload modal sits at the page level so it overlays the
            full-screen interview without any z-index gymnastics. */}
        {user && pendingUpload && (
          <DocumentUploadModal
            open
            onClose={() => setPendingUpload(null)}
            userId={user.uid}
            sessionId={sessionId}
            documentType={pendingUpload}
            allowSkip={pendingUpload !== "i20" && pendingUpload !== "ds160_confirmation"}
            onUploaded={async (docType) => {
              try {
                const fn = httpsCallable(functions, "recordVisaInterviewDocument", { timeout: 90_000 });
                const res = await fn({ sessionId, documentType: docType });
                const data = res.data as {
                  requiresDocumentUpload: VisaDocumentType | null;
                  interviewStarted: boolean;
                  isFinalQuestion?: boolean;
                };
                if (data.requiresDocumentUpload) {
                  setPendingUploadAfterSpeech(data.requiresDocumentUpload);
                }
                if (data.isFinalQuestion) setPendingEndAfterSpeech(true);
              } catch (e: any) {
                console.error("[visa] recordVisaInterviewDocument failed:", e);
                setError(e?.message ?? "Could not record the upload. Try again.");
              }
            }}
            onSkipped={async (docType) => {
              try {
                const fn = httpsCallable(functions, "recordVisaInterviewDocument", { timeout: 90_000 });
                const res = await fn({ sessionId, documentType: docType, skipped: true });
                const data = res.data as {
                  requiresDocumentUpload: VisaDocumentType | null;
                  isFinalQuestion?: boolean;
                };
                if (data.requiresDocumentUpload) {
                  setPendingUploadAfterSpeech(data.requiresDocumentUpload);
                }
                if (data.isFinalQuestion) setPendingEndAfterSpeech(true);
              } catch (e: any) {
                console.error("[visa] skip failed:", e);
                setError(e?.message ?? "Could not skip the document. Try again.");
                setStage("listening");
                speech.start();
              }
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-blue-50/30 to-white text-slate-900 antialiased pb-20 relative overflow-hidden">
      <div className="pointer-events-none absolute top-[-100px] right-[-100px] w-[440px] h-[440px] bg-blue-200/40 rounded-full blur-[120px]" aria-hidden />

      <header className="border-b border-slate-200 sticky top-0 z-40 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/app" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to dashboard">
            <ArrowLeft size={15} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">F-1 Visa Interview Practice</h1>
            <p className="text-xs text-slate-500 truncate">{headerSubtitle}</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-200">
            <ShieldAlert size={11} /> Simulation only
          </span>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-5 py-6">
        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium rounded-xl px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            {error.includes("credits") && (
              <Link to="/app" className="text-xs font-bold underline hover:no-underline flex-shrink-0">Get credits</Link>
            )}
          </div>
        )}

        <AtCapacityModal
          open={atCapacityOpen}
          onClose={() => setAtCapacityOpen(false)}
        />

        <PreviewEndModal
          open={previewEndOpen}
          onClose={() => { setPreviewEndOpen(false); navigate("/app"); }}
        />

        <PreviewCooldownModal
          open={previewCooldownOpen}
          onClose={() => { setPreviewCooldownOpen(false); navigate("/app"); }}
        />

        <FeedbackSurveyModal
          open={surveyOpen}
          trigger="visa_interview"
          triggerId={sessionId ?? undefined}
          onClose={() => setSurveyOpen(false)}
        />


        {phase === "intro" && (
          <div className="max-w-3xl mx-auto">
            <InterviewIntroCard
              onStart={startInterview}
              starting={starting}
              speechSupported={speech.isSupported}
              walletCredits={walletCredits}
              isFounder={isFounder}
            />
          </div>
        )}

        {phase === "report" && report && (
          <div className="max-w-3xl mx-auto">
            <InterviewReportView
              report={report}
              onRetry={reset}
              onBack={() => navigate("/app")}
            />
          </div>
        )}
      </main>

      {sessionId && user && pendingUpload && (
        <DocumentUploadModal
          open
          onClose={() => setPendingUpload(null)}
          userId={user.uid}
          sessionId={sessionId}
          documentType={pendingUpload}
          // Only the initial DS-160 / I-20 are mandatory. Any supporting doc
          // Anna asks for mid-interview can be declined.
          allowSkip={pendingUpload !== "i20" && pendingUpload !== "ds160_confirmation"}
          onUploaded={async (docType) => {
            try {
              const fn = httpsCallable(functions, "recordVisaInterviewDocument", { timeout: 90_000 });
              const res = await fn({ sessionId, documentType: docType });
              const data = res.data as {
                requiresDocumentUpload: VisaDocumentType | null;
                interviewStarted: boolean;
                isFinalQuestion?: boolean;
              };
              if (data.requiresDocumentUpload) {
                setPendingUploadAfterSpeech(data.requiresDocumentUpload);
              }
              if (data.isFinalQuestion) setPendingEndAfterSpeech(true);
            } catch (e: any) {
              console.error("[visa] recordVisaInterviewDocument failed:", e);
              setError(e?.message ?? "Could not record the upload. Try again.");
            }
          }}
          onSkipped={async (docType) => {
            // User clicked "I don't have this." Tell the backend; it'll
            // record the decline as a spoken answer and have Claude probe
            // verbally on the same topic. Snapshot delivers the new line,
            // avatar speaks it, mic arms after speak-ended.
            try {
              const fn = httpsCallable(functions, "recordVisaInterviewDocument", { timeout: 90_000 });
              const res = await fn({ sessionId, documentType: docType, skipped: true });
              const data = res.data as {
                requiresDocumentUpload: VisaDocumentType | null;
                isFinalQuestion?: boolean;
              };
              if (data.requiresDocumentUpload) {
                setPendingUploadAfterSpeech(data.requiresDocumentUpload);
              }
              if (data.isFinalQuestion) setPendingEndAfterSpeech(true);
            } catch (e: any) {
              console.error("[visa] skip failed:", e);
              setError(e?.message ?? "Could not skip the document. Try again.");
              // If skip failed, let the user retry — re-arm the mic so
              // they're not stuck.
              setStage("listening");
              speech.start();
            }
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FullScreenInterview — immersive Zoom/Meet-style layout for the active
// phase. Dark backdrop, avatar centred and dominant, all chrome floats as
// overlays. Reuses every callback and the state machine wholesale; only
// the visual presentation changed.
// ─────────────────────────────────────────────────────────────────────────────
function FullScreenInterview({
  sessionId, latestOfficer, stage, ending, messageCount, fatalReason, error,
  onAvatarLive, onAvatarSpeakStarted, onAvatarSpeakEnded, onAvatarTtsFailed, onAvatarFallback, onMicRetry, onEnd,
}: {
  sessionId:            string;
  latestOfficer:        string | undefined;
  stage:                ActiveStage;
  ending:               boolean;
  messageCount:         number;
  fatalReason:          string | null;
  error:                string;
  onAvatarLive:         () => void;
  onAvatarSpeakStarted: () => void;
  onAvatarSpeakEnded:   () => void;
  onAvatarTtsFailed:    () => void;
  onAvatarFallback:     (reason: string) => void;
  onMicRetry:           () => void;
  onEnd:                () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950 text-white overflow-hidden">
      {/* Soft ambient glow behind the avatar — gives the dark background
          some life without distracting from the video. */}
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vmin] h-[80vmin] bg-blue-500/10 rounded-full blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[40vmin] h-[40vmin] bg-cyan-500/10 rounded-full blur-[100px]" aria-hidden />

      {ending && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/88 px-5 backdrop-blur-xl"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-sm rounded-[28px] border border-white/15 bg-white/[0.08] p-7 text-center shadow-2xl shadow-black/50">
            <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 rounded-full border border-blue-300/25" />
              <span className="absolute inset-1 animate-spin rounded-full border-2 border-transparent border-t-blue-300 border-r-violet-300" />
              <Loader2 size={22} className="animate-spin text-white" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-blue-200">Interview complete</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-white">Building your feedback report</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Reviewing each answer against the question bank and calculating your performance scores.
            </p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-blue-400 to-violet-400" />
            </div>
          </div>
        </div>
      )}

      {/* ── Avatar — centered, sized to fit the viewport. The internal
            LiveAvatarPanel maintains its own aspect ratio (3:4 on mobile,
            16:9 on sm+). We just give it room to breathe. ───────────── */}
      <div className="absolute inset-0 flex items-center justify-center px-4 sm:px-8 pt-20 pb-44 sm:pb-40">
        <div className="w-full h-full max-w-5xl flex items-center justify-center">
          <div className="w-full max-h-full">
            <LiveAvatarPanel
              sessionId={sessionId}
              officerSpeech={latestOfficer}
              onLive={onAvatarLive}
              onSpeakStarted={onAvatarSpeakStarted}
              onSpeakEnded={onAvatarSpeakEnded}
              onTtsFailed={onAvatarTtsFailed}
              onFallback={onAvatarFallback}
            />
          </div>
        </div>
      </div>

      {/* ── Top overlay — back link + simulation badge ────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 sm:px-6 py-4 flex items-center justify-between pointer-events-none">
        <Link
          to="/app"
          className="pointer-events-auto inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 text-sm font-semibold text-white/90 hover:text-white transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        <span className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 backdrop-blur-md border border-amber-400/30 text-amber-200 text-[11px] font-bold tracking-widest uppercase">
          <ShieldAlert size={11} /> Simulation
        </span>
      </div>

      {/* ── Bottom overlay — status pill + end button ─────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 sm:px-6 pb-5 sm:pb-7 flex flex-col items-center gap-4 pointer-events-none">
        {/* Error banner (rendered above the pill when present). Surfaces
            credit-exhausted etc. inside the immersive shell. */}
        {error && (
          <div className="pointer-events-auto max-w-md w-full bg-rose-500/15 backdrop-blur-md border border-rose-400/40 rounded-2xl px-4 py-3 text-sm text-rose-100 flex items-start gap-2.5 shadow-lg shadow-rose-900/30">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-rose-300" />
            <span className="flex-1 leading-relaxed">{error}</span>
            {error.includes("credits") && (
              <Link to="/app" className="text-xs font-bold underline text-rose-200 hover:text-white flex-shrink-0">Get credits</Link>
            )}
          </div>
        )}

        {/* Mic-blocked recovery card — only shown when the speech hook says
            permission was denied. Overlays everything else with a clear
            call-to-action. */}
        {stage === "micBlocked" && (
          <div className="pointer-events-auto max-w-md w-full bg-amber-500/15 backdrop-blur-md border border-amber-400/40 rounded-2xl px-5 py-4 text-sm text-amber-50 shadow-xl shadow-amber-900/30">
            <p className="font-bold mb-2 flex items-center gap-2"><MicOff size={15} /> Microphone access blocked</p>
            <p className="leading-relaxed mb-3 text-amber-100/90">
              Enable microphone access for this site in your browser (look for the mic icon in the address bar), then tap Retry.
            </p>
            <button
              onClick={onMicRetry}
              className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-amber-950 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors active:scale-[0.99]"
            >
              <Mic size={14} /> Retry microphone
            </button>
          </div>
        )}

        {/* Fatal-error card — interview can't continue. Stops the user
            from tapping End on an empty transcript. */}
        {stage === "failed" && (
          <div className="pointer-events-auto max-w-md w-full bg-rose-500/15 backdrop-blur-md border border-rose-400/40 rounded-2xl px-5 py-4 text-sm text-rose-50 shadow-xl shadow-rose-900/30">
            <p className="font-bold mb-1.5">Interview cannot continue.</p>
            <p className="leading-relaxed text-rose-100/90">{fatalReason ?? "The avatar service is unavailable. Try again in a few minutes; your credit will be refunded if no answers were recorded."}</p>
          </div>
        )}

        {/* Status pill — the centrepiece "what's happening" indicator. */}
        <div className="pointer-events-auto">
          <BeautifulStatusPill stage={stage} />
        </div>

        {/* End interview CTA — the only persistent control besides the
            top-left back button. Subtle glass treatment matches the rest
            of the overlay vocabulary. */}
        <button
          onClick={onEnd}
          disabled={ending || messageCount === 0}
          className="pointer-events-auto inline-flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-slate-100 disabled:bg-white/20 disabled:text-white/60 disabled:cursor-not-allowed text-sm font-bold px-5 py-3 rounded-2xl transition-all active:scale-[0.99] shadow-xl shadow-black/40"
        >
          {ending ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} />}
          {ending ? "Scoring your interview…" : "End interview & get feedback"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BeautifulStatusPill — glassmorphism, per-stage colourway, animated mic
// halo + audio-bar EQ on the "Listening" state. Designed to sit on a dark
// backdrop so every variant uses translucent fills with subtle borders.
// ─────────────────────────────────────────────────────────────────────────────
function BeautifulStatusPill({ stage }: { stage: ActiveStage }) {
  // "Listening" gets its own treatment because it's the user's turn —
  // the moment that needs to feel alive. Animated halo around the mic
  // plus EQ bars communicate "we hear you" before the user even speaks.
  if (stage === "listening") {
    return (
      <div className="inline-flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-emerald-500/15 backdrop-blur-xl border border-emerald-300/40 text-emerald-50 shadow-xl shadow-emerald-900/30">
        {/* Mic chip with pulsing halo. The outer span animates a ping
            that radiates outward; the inner circle holds the icon. */}
        <span className="relative flex items-center justify-center w-9 h-9 flex-shrink-0">
          <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" />
          <span className="absolute inset-0 rounded-full bg-emerald-400/20" />
          <span className="relative w-7 h-7 rounded-full bg-gradient-to-br from-emerald-300 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40">
            <Mic size={13} className="text-emerald-950" />
          </span>
        </span>
        <span className="text-sm font-bold tracking-tight">Listening</span>
        {/* EQ bars — five staggered vertical bars, each on its own
            scaleY animation delay so the dance looks organic. */}
        <span className="flex items-end gap-[3px] h-4 ml-0.5" aria-hidden>
          <span className="w-[3px] h-full rounded-full bg-emerald-200/90 animate-audio-bar" />
          <span className="w-[3px] h-full rounded-full bg-emerald-200/90 animate-audio-bar animate-audio-bar-delay-1" />
          <span className="w-[3px] h-full rounded-full bg-emerald-200/90 animate-audio-bar animate-audio-bar-delay-2" />
          <span className="w-[3px] h-full rounded-full bg-emerald-200/90 animate-audio-bar animate-audio-bar-delay-3" />
          <span className="w-[3px] h-full rounded-full bg-emerald-200/90 animate-audio-bar animate-audio-bar-delay-4" />
        </span>
      </div>
    );
  }

  // Every other state shares the same glassmorphism shell — just different
  // colour + icon. Keeps the visual rhythm coherent as the pill transitions.
  const variant: Record<Exclude<ActiveStage, "listening">, { icon: React.ReactNode; label: string; cls: string }> = {
    connecting: {
      icon:  <Loader2 size={13} className="animate-spin" />,
      label: "Connecting officer…",
      cls:   "bg-slate-500/15 border-slate-300/30 text-slate-100",
    },
    speaking: {
      icon:  <Volume2 size={14} className="text-blue-200" />,
      label: "Officer is speaking",
      cls:   "bg-blue-500/15 border-blue-300/40 text-blue-50",
    },
    processing: {
      icon:  <Loader2 size={13} className="animate-spin text-amber-200" />,
      label: "Officer is thinking…",
      cls:   "bg-amber-500/15 border-amber-300/40 text-amber-50",
    },
    micBlocked: {
      icon:  <MicOff size={13} className="text-amber-200" />,
      label: "Microphone needed",
      cls:   "bg-amber-500/15 border-amber-300/40 text-amber-50",
    },
    failed: {
      icon:  <AlertTriangle size={13} className="text-rose-200" />,
      label: "Connection failed",
      cls:   "bg-rose-500/15 border-rose-300/40 text-rose-50",
    },
  };
  const v = variant[stage];

  return (
    <div className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full backdrop-blur-xl border text-sm font-bold tracking-tight shadow-xl shadow-black/30 ${v.cls}`}>
      {v.icon}
      {v.label}
    </div>
  );
}

// ─── At-capacity modal ───────────────────────────────────────────────
// Surfaced when the HeyGen concurrent-session cap is hit. The server
// refuses the start BEFORE deducting credits, so the user explicitly
// hasn't lost anything. The copy mirrors the user's preferred wording.

// ─────────────────────────────────────────────────────────────────────────────
// PreviewEndModal — shown when a free 3-minute preview session ends. Used
// in place of the scored-report view (preview sessions never get scored).
// Routes the user to /pricing for the 15-credit top-up that unlocks both
// the full 5-minute interview AND the report.
// ─────────────────────────────────────────────────────────────────────────────

function PreviewEndModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <Volume2 size={22} />
        </div>
        <h2 className="text-lg font-black text-slate-900 mb-2">Your preview is up</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-5">
          You just experienced a live AI consular interview. Top up 15 credits to run a full 5-minute mock — Anna will probe deeper and you'll get your scored feedback across nine dimensions.
        </p>
        <Link
          to="/pricing"
          className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-2xl text-sm transition-colors mb-2"
        >
          Top up to continue · 15 credits
        </Link>
        <button
          onClick={onClose}
          className="w-full inline-flex items-center justify-center text-xs font-bold text-slate-500 hover:text-slate-700 py-2 transition-colors"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PreviewCooldownModal — surfaced when a user tries to start a free preview
// but already used their preview within the 7-day cooldown window. Explains
// the cooldown + offers the paid path so they're not dead-ended.
// ─────────────────────────────────────────────────────────────────────────────

function PreviewCooldownModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
          <ShieldAlert size={22} />
        </div>
        <h2 className="text-lg font-black text-slate-900 mb-2">Preview already used</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-5">
          You've already run your free preview in the last 7 days. Top up 15 credits to start a full 5-minute mock interview with scored feedback.
        </p>
        <Link
          to="/pricing"
          className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-2xl text-sm transition-colors mb-2"
        >
          Top up · 15 credits
        </Link>
        <button
          onClick={onClose}
          className="w-full inline-flex items-center justify-center text-xs font-bold text-slate-500 hover:text-slate-700 py-2 transition-colors"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

function AtCapacityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <ShieldAlert size={22} />
        </div>
        <h2 className="text-lg font-black text-slate-900 mb-2">Interview rooms are full</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-1">
          All our practice rooms are in use at the moment. Kindly check back shortly.
        </p>
        <p className="text-xs text-emerald-700 font-bold mb-5">
          You haven't been charged — your credits are safe.
        </p>
        <button
          onClick={onClose}
          className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-2xl text-sm transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
