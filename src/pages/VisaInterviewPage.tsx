import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Loader2, AlertTriangle, Mic, MicOff, Volume2, StopCircle } from "lucide-react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import type {
  VisaDocumentType, VisaInterviewMessage, VisaInterviewReport,
} from "../types";
import InterviewIntroCard from "../components/visa/InterviewIntroCard";
import DocumentUploadModal from "../components/visa/DocumentUploadModal";
import InterviewReportView from "../components/visa/InterviewReportView";
import LiveAvatarPanel from "../components/visa/LiveAvatarPanel";
import { useSpeechRecognition } from "../lib/visa/useSpeechRecognition";

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

  const startInterview = async (accepted: boolean) => {
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
      const res = await fn({ mode: "avatar", disclaimerAccepted: accepted });
      const data = res.data as {
        sessionId: string;
        firstMessage?: string;
        requiresDocumentUpload?: VisaDocumentType | null;
      };
      console.log("[visa] session started:", data.sessionId, "firstMessage?", !!data.firstMessage, "needsDoc?", data.requiresDocumentUpload);
      setSessionId(data.sessionId);
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
      if (e?.code === "resource-exhausted" || /Insufficient credits/i.test(e?.message ?? "")) {
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
    try {
      const fn = httpsCallable(functions, "finishVisaInterviewSession", { timeout: 180_000 });
      const res = await fn({ sessionId });
      setReport(res.data as VisaInterviewReport);
      setPhase("report");
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Could not finish the interview. Please try again.");
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

        {phase === "intro" && (
          <div className="max-w-2xl mx-auto">
            <InterviewIntroCard
              onStart={startInterview}
              starting={starting}
              speechSupported={speech.isSupported}
            />
          </div>
        )}

        {phase === "active" && sessionId && (
          <ActiveInterviewLayout
            sessionId={sessionId}
            latestOfficer={latestOfficer}
            stage={stage}
            transcript={speech.transcript}
            ending={ending}
            messageCount={messages.length}
            fatalReason={fatalReason}
            onAvatarLive={handleAvatarLive}
            onAvatarSpeakStarted={handleAvatarSpeakStarted}
            onAvatarSpeakEnded={handleAvatarSpeakEnded}
            onAvatarTtsFailed={handleAvatarTtsFailed}
            onAvatarFallback={handleAvatarFallback}
            onMicRetry={handleMicRetry}
            onEnd={endInterview}
          />
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
// Active interview layout: avatar centered, status pill, end button.
// No chat — the user's answers and officer questions live in the audio
// channel only (and in the post-interview report).
// ─────────────────────────────────────────────────────────────────────────────
function ActiveInterviewLayout({
  sessionId, latestOfficer, stage, transcript, ending, messageCount, fatalReason,
  onAvatarLive, onAvatarSpeakStarted, onAvatarSpeakEnded, onAvatarTtsFailed, onAvatarFallback, onMicRetry, onEnd,
}: {
  sessionId:            string;
  latestOfficer:        string | undefined;
  stage:                ActiveStage;
  transcript:           string;
  ending:               boolean;
  messageCount:         number;
  fatalReason:          string | null;
  onAvatarLive:         () => void;
  onAvatarSpeakStarted: () => void;
  onAvatarSpeakEnded:   () => void;
  onAvatarTtsFailed:    () => void;
  onAvatarFallback:     (reason: string) => void;
  onMicRetry:           () => void;
  onEnd:                () => Promise<void>;
}) {
  return (
    <div className="max-w-2xl mx-auto flex flex-col items-center gap-5">
      <div className="w-full">
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

      <StatusPill stage={stage} />

      {/* Live transcription preview — gives the user visual feedback that the
          mic actually picked up their voice. Disappears between turns. */}
      {stage === "listening" && (
        <div className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm min-h-[3rem]">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">You</p>
          <p className="text-sm text-slate-800 leading-relaxed">
            {transcript || <span className="text-slate-400">Listening… speak when ready.</span>}
          </p>
        </div>
      )}

      {stage === "failed" && (
        <div className="w-full bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 text-sm text-rose-800">
          <p className="font-semibold mb-1">Interview cannot continue.</p>
          <p className="leading-relaxed">{fatalReason ?? "The avatar service is unavailable. Try again in a few minutes; your credit will be refunded if no answers were recorded."}</p>
        </div>
      )}

      {stage === "micBlocked" && (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-sm text-amber-900">
          <p className="font-semibold mb-2 flex items-center gap-2"><MicOff size={15} /> Microphone access blocked</p>
          <p className="leading-relaxed mb-3">
            Enable microphone access for this site in your browser (look for the mic icon in the address bar), then tap Retry. Your interview will pick up where it left off.
          </p>
          <button
            onClick={onMicRetry}
            className="inline-flex items-center gap-2 bg-amber-900 hover:bg-amber-950 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors active:scale-[0.99]"
          >
            <Mic size={14} /> Retry microphone
          </button>
        </div>
      )}

      <button
        onClick={onEnd}
        disabled={ending || messageCount === 0}
        className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20"
      >
        {ending ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} />}
        {ending ? "Scoring your interview…" : "End interview & get feedback"}
      </button>

      <p className="text-[11px] text-slate-500 text-center max-w-md leading-relaxed">
        Tap the button above when you're ready to wrap up. You'll get a written score and feedback on what to improve.
      </p>
    </div>
  );
}

function StatusPill({ stage }: { stage: ActiveStage }) {
  const map: Record<ActiveStage, { icon: React.ReactNode; label: string; className: string }> = {
    connecting: {
      icon: <Loader2 size={13} className="animate-spin" />,
      label: "Connecting officer…",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    },
    speaking: {
      icon: <Volume2 size={13} />,
      label: "Officer is speaking",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    },
    listening: {
      icon: <Mic size={13} className="animate-pulse" />,
      label: "Listening — your turn",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    processing: {
      icon: <Loader2 size={13} className="animate-spin" />,
      label: "Officer is thinking…",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    micBlocked: {
      icon: <MicOff size={13} />,
      label: "Microphone needed",
      className: "bg-amber-50 text-amber-800 border-amber-200",
    },
    failed: {
      icon: <AlertTriangle size={13} />,
      label: "Connection failed",
      className: "bg-rose-50 text-rose-700 border-rose-200",
    },
  };
  const s = map[stage];
  return (
    <div className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm font-semibold ${s.className}`}>
      {s.icon} {s.label}
    </div>
  );
}
