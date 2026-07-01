import { useEffect, useRef, useState } from "react";
import { ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { connectLiveAvatar, type LiveAvatarHandle } from "../../lib/liveavatar/liveAvatarClient";

interface Props {
  /** Visa interview session id — used to mint a HeyGen token + log status */
  sessionId: string;
  /** Latest officer line we want the avatar to speak. Pass a NEW string each turn. */
  officerSpeech?: string;
  /** Page calls this if the avatar can't be brought up — page should surface a clean error */
  onFallback?: (reason: string) => void;
  /** Fires when the avatar's stream is playing — page uses this to know it can start the conversation */
  onLive?: () => void;
  /** Fires when the avatar starts a speech segment — page uses this to switch the status pill */
  onSpeakStarted?: () => void;
  /** Fires when the avatar finishes a speech segment — page uses this to start listening */
  onSpeakEnded?: () => void;
  /** Fires when TTS fetch failed before any audio could play. Distinct from
   *  onSpeakEnded so the page can avoid e.g. auto-ending the interview when
   *  the closing line never actually got spoken. */
  onTtsFailed?: () => void;
}

type Phase = "idle" | "connecting" | "live" | "failed";
type QueuedSpeech = {
  audioBase64: string;
  durationMs: number;
  attempts: number;
  started: boolean;
};

/**
 * Self-contained avatar pane. Manages the HeyGen connection, plays the
 * stream into a <video>, and queues officer lines so each one is spoken
 * exactly once — even if a line arrives before the stream is live.
 *
 * Speech-end is forwarded to the parent so it can re-arm the microphone
 * (the avatar must finish before the user starts talking, else the SDK
 * picks up our audio and STT degrades).
 */
export default function LiveAvatarPanel({
  sessionId, officerSpeech, onFallback, onLive, onSpeakStarted, onSpeakEnded, onTtsFailed,
}: Props) {
  const videoRef     = useRef<HTMLVideoElement | null>(null);
  const handleRef    = useRef<LiveAvatarHandle | null>(null);
  // Queue holds pre-rendered audio (TTS'd from the officer text). We don't
  // queue raw text because the TTS fetch can take 1-2s and we don't want to
  // block the avatar while we're waiting.
  const queueRef     = useRef<QueuedSpeech[]>([]);
  const currentSpeechRef = useRef<QueuedSpeech | null>(null);
  const speakingRef  = useRef(false);
  const acceptSpeechEventsRef = useRef(false);
  const mediaInterruptedRef = useRef(false);
  const lastEnqueuedRef = useRef("");
  // Latest callback refs so the connect effect (which only runs once)
  // always invokes the current parent handlers.
  const onSpeakStartedRef = useRef(onSpeakStarted);
  const onSpeakEndedRef   = useRef(onSpeakEnded);
  const onTtsFailedRef    = useRef(onTtsFailed);
  const onLiveRef         = useRef(onLive);
  const onFallbackRef     = useRef(onFallback);
  // If the stream goes live but no officer line arrives within this window,
  // we tear down — otherwise HeyGen keeps billing for an idle session.
  const idleAfterLiveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fallback timer for AVATAR_SPEAK_ENDED if the SDK's agent-event socket
  // isn't delivering events. See drainQueue() for why.
  const speakStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakEndedFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Periodic keep-alive ping. HeyGen's server tears down idle sessions
  // (typically ~60s of no commands) — so when the user lingers on a
  // doc-upload modal, the LiveKit room dies and subsequent repeatAudio()
  // calls reach nothing. Pinging every 30s prevents that.
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const KEEPALIVE_INTERVAL_MS = 30_000;
  // First line includes ~1-2s of OpenAI TTS latency on top of HeyGen connect
  // time, so we give it more headroom than the old text-mode 20s.
  const FIRST_LINE_TIMEOUT_MS = 30_000;

  const [phase,  setPhase]  = useState<Phase>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);

  useEffect(() => { onSpeakStartedRef.current = onSpeakStarted; }, [onSpeakStarted]);
  useEffect(() => { onSpeakEndedRef.current   = onSpeakEnded;   }, [onSpeakEnded]);
  useEffect(() => { onTtsFailedRef.current    = onTtsFailed;    }, [onTtsFailed]);
  useEffect(() => { onLiveRef.current         = onLive;         }, [onLive]);
  useEffect(() => { onFallbackRef.current     = onFallback;     }, [onFallback]);

  function clearSpeechTimers() {
    if (speakStartTimeoutRef.current) {
      clearTimeout(speakStartTimeoutRef.current);
      speakStartTimeoutRef.current = null;
    }
    if (speakEndedFallbackRef.current) {
      clearTimeout(speakEndedFallbackRef.current);
      speakEndedFallbackRef.current = null;
    }
  }

  function completeCurrentSpeech() {
    clearSpeechTimers();
    currentSpeechRef.current = null;
    acceptSpeechEventsRef.current = false;
    speakingRef.current = false;
    if (queueRef.current.length > 0) {
      drainQueue();
    } else {
      onSpeakEndedRef.current?.();
    }
  }

  function failCurrentSpeech(message: string) {
    console.warn("[avatar] speech failed:", message);
    clearSpeechTimers();
    currentSpeechRef.current = null;
    acceptSpeechEventsRef.current = false;
    speakingRef.current = false;
    mediaInterruptedRef.current = false;
    setMediaNotice(null);
    onTtsFailedRef.current?.();
    if (queueRef.current.length > 0) drainQueue();
  }

  async function sendCurrentSpeech() {
    const item = currentSpeechRef.current;
    const handle = handleRef.current;
    if (!item || !handle?.ready || mediaInterruptedRef.current) return;

    acceptSpeechEventsRef.current = false;
    try {
      await handle.ensurePlayback();
      if (item.attempts > 0) {
        await handle.interrupt();
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (currentSpeechRef.current !== item || mediaInterruptedRef.current) return;
      await handle.speakAudio(item.audioBase64);
      acceptSpeechEventsRef.current = true;
      speakStartTimeoutRef.current = setTimeout(() => {
        if (currentSpeechRef.current !== item || item.started || mediaInterruptedRef.current) return;
        failCurrentSpeech("Avatar did not confirm speech start within 10 seconds.");
      }, 10_000);
    } catch (error: any) {
      if (currentSpeechRef.current !== item || mediaInterruptedRef.current) return;
      failCurrentSpeech(error?.message ?? "Could not send audio to the avatar.");
    }
  }

  function drainQueue() {
    if (speakingRef.current) {
      console.log("[avatar] drainQueue: already speaking, skipping");
      return;
    }
    if (!handleRef.current?.ready) {
      console.log("[avatar] drainQueue: handle not ready, queue size =", queueRef.current.length);
      return;
    }
    const item = queueRef.current.shift();
    if (!item) {
      console.log("[avatar] drainQueue: queue empty");
      return;
    }
    console.log("[avatar] drainQueue: speaking audio", item.durationMs, "ms");
    currentSpeechRef.current = item;
    speakingRef.current = true;
    void sendCurrentSpeech();
  }

  function handleMediaInterrupted(reasonCode: string) {
    if (mediaInterruptedRef.current) return;
    mediaInterruptedRef.current = true;
    acceptSpeechEventsRef.current = false;
    clearSpeechTimers();
    if (currentSpeechRef.current) currentSpeechRef.current.started = false;
    setMediaNotice("Connection interrupted. Anna will replay the question when the stream recovers.");
    void handleRef.current?.interrupt();
    if (mediaRecoveryTimeoutRef.current) clearTimeout(mediaRecoveryTimeoutRef.current);
    mediaRecoveryTimeoutRef.current = setTimeout(() => {
      const msg = `Avatar media did not recover after ${reasonCode}. Please restart the interview.`;
      setPhase("failed");
      setReason(msg);
      setMediaNotice(null);
      void handleRef.current?.stop();
      handleRef.current = null;
      onFallbackRef.current?.(msg);
    }, 15_000);
  }

  function handleMediaRecovered() {
    if (!mediaInterruptedRef.current) return;
    mediaInterruptedRef.current = false;
    if (mediaRecoveryTimeoutRef.current) {
      clearTimeout(mediaRecoveryTimeoutRef.current);
      mediaRecoveryTimeoutRef.current = null;
    }
    const item = currentSpeechRef.current;
    if (!item) {
      setMediaNotice(null);
      return;
    }
    if (item.attempts >= 1) {
      failCurrentSpeech("Avatar media was interrupted twice during the same question.");
      return;
    }
    item.attempts += 1;
    item.started = false;
    setMediaNotice("Connection restored. Replaying Anna's question.");
    setTimeout(() => {
      if (currentSpeechRef.current !== item || mediaInterruptedRef.current) return;
      setMediaNotice(null);
      void sendCurrentSpeech();
    }, 250);
  }

  // ── Connect on mount, cleanup on unmount ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setPhase("connecting");
      setReason(null);

      // 1. Ask backend for a session token
      let tokenData: any;
      try {
        const fn = httpsCallable(functions, "createLiveAvatarSession");
        const res = await fn({ visaInterviewSessionId: sessionId });
        tokenData = res.data;
      } catch (err: any) {
        if (cancelled) return;
        // Race-window: startVisaInterviewSession saw an open slot but
        // it got taken before our HeyGen call. The backend has already
        // refunded the 15 credits + marked the session aborted —
        // surface the friendly at-capacity message to the user with a
        // line about the refund.
        const detailsReason = err?.details?.reason;
        if (detailsReason === "heygen_at_capacity") {
          const refundedAmount = err?.details?.refundedAmount ?? 15;
          const msg = err?.details?.refunded === false
            ? "Interview rooms are full at the moment. Kindly check back shortly."
            : `Interview rooms are full at the moment. Kindly check back shortly. Your ${refundedAmount} credits have been refunded.`;
          setPhase("failed");
          setReason(msg);
          onFallbackRef.current?.(msg);
          return;
        }
        const msg = err?.message ?? "Could not start the avatar session.";
        setPhase("failed");
        setReason(msg);
        onFallbackRef.current?.(msg);
        return;
      }
      if (cancelled) return;
      if (!tokenData?.ready) {
        const msg = tokenData?.reason ?? "Avatar service is not ready.";
        setPhase("failed");
        setReason(msg);
        onFallbackRef.current?.(msg);
        return;
      }

      // 2. Hand the token to the SDK and wait for the stream to play
      try {
        if (!videoRef.current) throw new Error("Video element not ready.");
        const handle = await connectLiveAvatar({
          sessionToken: tokenData.sessionToken,
          avatarId:     tokenData.avatarId,
          voiceId:      tokenData.voiceId ?? "",
          videoEl:      videoRef.current,
          onLive:       (h) => {
            if (cancelled) { void h.stop(); return; }
            // Assign the handle SYNCHRONOUSLY here. The `await connectLiveAvatar`
            // below resolves AFTER this callback returns, so without this line
            // the drainQueue() call further down would always see handleRef.current
            // as null and skip the very first speak.
            handleRef.current = h;
            console.log("[avatar] state CONNECTED — handle ready, draining queue");
            setPhase("live");
            // Start the keep-alive heartbeat now that the session is live.
            if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
            keepAliveIntervalRef.current = setInterval(() => {
              if (cancelled) return;
              void h.keepAlive();
            }, KEEPALIVE_INTERVAL_MS);
            httpsCallable(functions, "markAvatarStatus")({ visaInterviewSessionId: sessionId, status: "active" }).catch(() => {});
            onLiveRef.current?.();
            drainQueue();
            // Start the idle-watchdog: if nothing has been queued (and thus
            // nothing has started speaking) within FIRST_LINE_TIMEOUT_MS,
            // assume the backend message pipe is broken and tear down so we
            // stop paying HeyGen for an empty stream.
            if (idleAfterLiveTimeoutRef.current) clearTimeout(idleAfterLiveTimeoutRef.current);
            idleAfterLiveTimeoutRef.current = setTimeout(() => {
              if (cancelled) return;
              if (speakingRef.current || queueRef.current.length > 0) return;
              const msg = "Avatar connected but no question arrived within 30s. Tearing down to save credits.";
              console.warn("[avatar]", msg);
              setPhase("failed");
              setReason("No question arrived. Your interview credits can be refunded — contact support.");
              handleRef.current?.stop().catch(() => {});
              handleRef.current = null;
              httpsCallable(functions, "markAvatarStatus")({ visaInterviewSessionId: sessionId, status: "failed", reason: msg }).catch(() => {});
              onFallbackRef.current?.(msg);
            }, FIRST_LINE_TIMEOUT_MS);
          },
          onDisconnect: (rsn) => {
            if (cancelled) return;
            console.warn("[avatar] disconnected:", rsn);
            if (keepAliveIntervalRef.current) {
              clearInterval(keepAliveIntervalRef.current);
              keepAliveIntervalRef.current = null;
            }
            if (!handleRef.current) return;
            handleRef.current = null;
            clearSpeechTimers();
            const msg = "The avatar connection ended unexpectedly. Please restart the interview.";
            setPhase("failed");
            setReason(msg);
            setMediaNotice(null);
            onFallbackRef.current?.(msg);
          },
          onSpeakStarted: () => {
            console.log("[avatar] AVATAR_SPEAK_STARTED");
            const item = currentSpeechRef.current;
            if (!item || item.started || mediaInterruptedRef.current || !acceptSpeechEventsRef.current) return;
            item.started = true;
            speakingRef.current = true;
            if (speakStartTimeoutRef.current) {
              clearTimeout(speakStartTimeoutRef.current);
              speakStartTimeoutRef.current = null;
            }
            // First message arrived — cancel the idle watchdog.
            if (idleAfterLiveTimeoutRef.current) {
              clearTimeout(idleAfterLiveTimeoutRef.current);
              idleAfterLiveTimeoutRef.current = null;
            }
            onSpeakStartedRef.current?.();
            speakEndedFallbackRef.current = setTimeout(() => {
              if (currentSpeechRef.current !== item || !item.started || mediaInterruptedRef.current) return;
              console.warn("[avatar] AVATAR_SPEAK_ENDED missing; completing after guarded duration fallback");
              completeCurrentSpeech();
            }, item.durationMs + 4_000);
          },
          onSpeakEnded: () => {
            console.log("[avatar] AVATAR_SPEAK_ENDED");
            const item = currentSpeechRef.current;
            if (!item || !item.started || mediaInterruptedRef.current || !acceptSpeechEventsRef.current) return;
            completeCurrentSpeech();
          },
          onMediaInterrupted: handleMediaInterrupted,
          onMediaRecovered: handleMediaRecovered,
        });
        if (cancelled) { void handle.stop(); return; }
        // onLive already assigned handleRef.current — this is a defensive
        // fallback in case the SDK ever resolves connectLiveAvatar without
        // firing onLive.
        if (!handleRef.current) handleRef.current = handle;
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message ?? "Avatar SDK failed to connect.";
        console.error("[avatar] connect error:", msg);
        setPhase("failed");
        setReason(msg);
        httpsCallable(functions, "markAvatarStatus")({ visaInterviewSessionId: sessionId, status: "failed", reason: msg }).catch(() => {});
        onFallbackRef.current?.(msg);
      }
    })();

    return () => {
      cancelled = true;
      if (idleAfterLiveTimeoutRef.current) {
        clearTimeout(idleAfterLiveTimeoutRef.current);
        idleAfterLiveTimeoutRef.current = null;
      }
      clearSpeechTimers();
      if (mediaRecoveryTimeoutRef.current) {
        clearTimeout(mediaRecoveryTimeoutRef.current);
        mediaRecoveryTimeoutRef.current = null;
      }
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      handleRef.current?.stop().catch(() => {});
      handleRef.current = null;
      acceptSpeechEventsRef.current = false;
      mediaInterruptedRef.current = false;
      if (currentSpeechRef.current) {
        currentSpeechRef.current.started = false;
        currentSpeechRef.current.attempts = 0;
        queueRef.current.unshift(currentSpeechRef.current);
        currentSpeechRef.current = null;
      }
      speakingRef.current = false;
      httpsCallable(functions, "endLiveAvatarSession")({ visaInterviewSessionId: sessionId }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Pipe officer text → TTS fetch → speak queue ──────────────────────────
  // We fetch audio on-demand from the backend (OpenAI TTS) when a new officer
  // line arrives. Each fetch takes ~1-2s; while it's in flight the avatar
  // sits idle but stays connected. Cancellation is by the lastEnqueuedRef
  // dedup — if a new line arrives while we're still fetching the previous,
  // both end up queued in arrival order.
  useEffect(() => {
    if (!officerSpeech) return;
    if (officerSpeech === lastEnqueuedRef.current) return;
    console.log("[avatar] enqueue officer line:", officerSpeech.slice(0, 60) + (officerSpeech.length > 60 ? "…" : ""));
    lastEnqueuedRef.current = officerSpeech;

    // Fire-and-forget TTS fetch. When it resolves we push to the queue and
    // try to drain. If the fetch fails we fall through to the speak-ended
    // callback so the UI can recover (mic still arms after the timeout).
    (async () => {
      try {
        const fn = httpsCallable(functions, "generateAvatarSpeech", { timeout: 60_000 });
        const res = await fn({ sessionId, text: officerSpeech });
        const data = res.data as { audioBase64: string; durationMs: number };
        if (!data?.audioBase64) throw new Error("Empty TTS response");
        queueRef.current.push({
          audioBase64: data.audioBase64,
          durationMs: data.durationMs ?? 4000,
          attempts: 0,
          started: false,
        });
        drainQueue();
      } catch (err: any) {
        console.error("[avatar] TTS fetch failed:", err?.message);
        // Don't fire the regular speak-ended callback here — that's the
        // signal "Anna finished talking, move on." If we forwarded TTS
        // failures through it, an auto-end-on-final-line would trigger
        // immediately and skip Anna's actual goodbye. The page handles
        // recovery via onTtsFailed instead.
        onTtsFailedRef.current?.();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officerSpeech]);

  return (
    <div className="bg-slate-950 text-white rounded-3xl overflow-hidden border border-slate-800 relative aspect-[3/4] sm:aspect-video shadow-2xl">
      {/* Always render the video so the ref is bound before connect resolves */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${phase === "live" ? "opacity-100" : "opacity-0"}`}
        playsInline
        autoPlay
        preload="auto"
      />

      {phase === "live" && mediaNotice && (
        <div className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/25 bg-slate-950/85 px-4 py-3 text-xs font-semibold text-amber-100 shadow-xl backdrop-blur-md">
          <span>{mediaNotice}</span>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-slate-900 transition hover:bg-slate-100"
            onClick={() => void handleRef.current?.ensurePlayback().catch(() => {})}
          >
            Resume
          </button>
        </div>
      )}

      {/* Overlay states */}
      {phase !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-slate-950">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mb-3">
            {phase === "connecting" || phase === "idle" ? (
              <Loader2 size={22} className="text-white animate-spin" />
            ) : (
              <AlertTriangle size={22} className="text-amber-300" />
            )}
          </div>
          <p className="text-base font-semibold mb-1">
            {phase === "failed" ? "Avatar unavailable" : "Connecting consular officer…"}
          </p>
          {phase !== "failed" && (
            <p className="text-xs text-white/60 max-w-xs leading-relaxed">
              This takes a few seconds — keep this tab in focus.
            </p>
          )}
          {reason && <p className="text-xs text-rose-300 max-w-xs leading-relaxed mt-2">{reason}</p>}
        </div>
      )}

      {/* Persistent simulation badge */}
      <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-900/70 backdrop-blur text-[10px] font-semibold text-white/85 border border-white/10">
        <ShieldAlert size={11} className="text-amber-300" /> Simulation only
      </div>
    </div>
  );
}
