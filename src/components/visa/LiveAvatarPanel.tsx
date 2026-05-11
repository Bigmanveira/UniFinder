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
  const queueRef     = useRef<{ audioBase64: string; durationMs: number }[]>([]);
  const speakingRef  = useRef(false);
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
  const speakEndedFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => { onSpeakStartedRef.current = onSpeakStarted; }, [onSpeakStarted]);
  useEffect(() => { onSpeakEndedRef.current   = onSpeakEnded;   }, [onSpeakEnded]);
  useEffect(() => { onTtsFailedRef.current    = onTtsFailed;    }, [onTtsFailed]);
  useEffect(() => { onLiveRef.current         = onLive;         }, [onLive]);
  useEffect(() => { onFallbackRef.current     = onFallback;     }, [onFallback]);

  // Drain the queue when we have a handle. Note: speakingRef flips back to
  // false in the AVATAR_SPEAK_ENDED callback, NOT after .speak() resolves
  // — `repeat()` only sends a command, the actual speech runs async.
  const drainQueue = () => {
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
    // Try to send the audio FIRST. If the session has dropped, repeatAudio()
    // throws synchronously and we route through onTtsFailed without ever
    // claiming the avatar started speaking — otherwise the duration-fallback
    // timer below would fire onSpeakEnded for a line that never actually
    // played, and any downstream auto-end-on-final-line would trigger.
    handleRef.current.speakAudio(item.audioBase64).catch((err: any) => {
      console.warn("[avatar] speakAudio failed (session dropped?):", err?.message);
      speakingRef.current = false;
      if (speakEndedFallbackRef.current) {
        clearTimeout(speakEndedFallbackRef.current);
        speakEndedFallbackRef.current = null;
      }
      onTtsFailedRef.current?.();
    });
    speakingRef.current = true;
    // Optimistic SPEAK_STARTED — if the SDK's agent-event channel doesn't
    // deliver, AVATAR_SPEAK_STARTED will never fire and the page stays on
    // "connecting" even though the avatar is actually talking. Calling
    // onSpeakStarted ourselves makes the UI responsive; the real event, if
    // it arrives, is idempotent (sets the same state). If speakAudio's
    // promise rejects above, the catch handler will roll all of this back.
    onSpeakStartedRef.current?.();
    // Fallback for missing AVATAR_SPEAK_ENDED: use the exact duration the
    // TTS endpoint reported, plus 1s padding for network jitter. If the
    // real event fires first we cancel this.
    const estimatedMs = item.durationMs + 1000;
    if (speakEndedFallbackRef.current) clearTimeout(speakEndedFallbackRef.current);
    speakEndedFallbackRef.current = setTimeout(() => {
      if (!speakingRef.current) return;
      console.warn("[avatar] AVATAR_SPEAK_ENDED never fired, falling back to duration estimate");
      speakingRef.current = false;
      if (queueRef.current.length > 0) drainQueue();
      else onSpeakEndedRef.current?.();
    }, estimatedMs);
  };

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
            // Stop pinging keep-alive against a dead session. We don't
            // auto-fail on short blips — the interview can keep going via
            // the fallback signal if it never recovers.
            if (keepAliveIntervalRef.current) {
              clearInterval(keepAliveIntervalRef.current);
              keepAliveIntervalRef.current = null;
            }
          },
          onSpeakStarted: () => {
            console.log("[avatar] AVATAR_SPEAK_STARTED");
            speakingRef.current = true;
            // First message arrived — cancel the idle watchdog.
            if (idleAfterLiveTimeoutRef.current) {
              clearTimeout(idleAfterLiveTimeoutRef.current);
              idleAfterLiveTimeoutRef.current = null;
            }
            onSpeakStartedRef.current?.();
          },
          onSpeakEnded: () => {
            console.log("[avatar] AVATAR_SPEAK_ENDED");
            // Real event fired — cancel the time-estimate fallback so we don't
            // also fire onSpeakEnded a second time.
            if (speakEndedFallbackRef.current) {
              clearTimeout(speakEndedFallbackRef.current);
              speakEndedFallbackRef.current = null;
            }
            speakingRef.current = false;
            if (queueRef.current.length > 0) {
              drainQueue();
            } else {
              onSpeakEndedRef.current?.();
            }
          },
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
      if (speakEndedFallbackRef.current) {
        clearTimeout(speakEndedFallbackRef.current);
        speakEndedFallbackRef.current = null;
      }
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      handleRef.current?.stop().catch(() => {});
      handleRef.current = null;
      // Deliberately DO NOT touch queueRef / lastEnqueuedRef / speakingRef
      // here. React 19 dev runs every effect setup → cleanup → setup, and
      // clearing the queue between the two setups would lose the officer
      // message that the parallel useEffect on `officerSpeech` enqueued
      // during the first setup (the dedup ref then blocks the second
      // setup from re-enqueueing). On a real session change the panel
      // unmounts entirely, taking these refs with it.
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
        queueRef.current.push({ audioBase64: data.audioBase64, durationMs: data.durationMs ?? 4000 });
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
      />

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
