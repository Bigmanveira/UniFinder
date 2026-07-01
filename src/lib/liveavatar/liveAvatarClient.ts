// ─────────────────────────────────────────────────────────────────────────────
import { reportClientError } from "../clientErrorReporter";

// HeyGen LiveAvatar — frontend SDK wrapper.
//
// Uses @heygen/liveavatar-web-sdk (v0.0.18+). Loaded via dynamic import so
// the ~1 MB bundle (LiveKit + WebRTC) is only fetched when avatar mode is
// actually used.
//
// Flow:
//   1. Backend calls /v1/sessions/token with X-API-KEY → gets a JWT.
//   2. Frontend (this file) calls `new LiveAvatarSession(jwt)`.
//   3. We attach the SDK to a <video> element via session.attach().
//   4. session.start() joins the LiveKit room (SDK handles /v1/sessions/start).
//   5. session.repeat(text) makes the avatar speak the supplied text exactly.
//   6. session.stop() tears down.
//
// AVATAR_SPEAK_ENDED is the signal we use to resume the user's microphone —
// without it we'd talk over each other.
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveAvatarConnectArgs {
  sessionToken: string;
  avatarId:     string;       // not strictly needed by SDK, kept for logging
  voiceId:      string;       // unused in LITE mode but kept for the call site
  videoEl:      HTMLVideoElement;
  /**
   * Called once the WebRTC stream is playing in the video element.
   * Receives the handle so the caller can use it synchronously — the
   * `await connectLiveAvatar(...)` resolves AFTER this callback returns,
   * so by the time the awaiter assigns the handle to a ref, this callback
   * (and any drainQueue() it triggers) has already run with a null handle.
   */
  onLive?:      (handle: LiveAvatarHandle) => void;
  /** Called if the stream disconnects after going live */
  onDisconnect?: (reason?: string) => void;
  /** Called when the avatar starts a speech segment (ie. starts talking) */
  onSpeakStarted?: () => void;
  /** Called when the avatar finishes a speech segment (ie. stops talking) */
  onSpeakEnded?: () => void;
  /** Reports the SDK's combined LiveKit/WebRTC connection health. */
  onConnectionQualityChanged?: (quality: LiveAvatarConnectionQuality) => void;
  /** Fires when playback stalls long enough to risk dropping audio or video. */
  onMediaInterrupted?: (reason: string) => void;
  /** Fires after the same media element is playing normally again. */
  onMediaRecovered?: () => void;
}

export type LiveAvatarConnectionQuality = "GOOD" | "BAD" | "UNKNOWN";

export interface LiveAvatarHandle {
  ready: boolean;
  /**
   * Make the avatar speak by lip-syncing to pre-rendered PCM 24kHz audio
   * (base64). LITE mode requires audio, not text — we TTS server-side and
   * pass the result here. See functions/src/avatarTts.ts for why.
   */
  speakAudio: (audioBase64: string) => Promise<void>;
  /** Ensure both remote tracks are actively playing before sending speech. */
  ensurePlayback: () => Promise<void>;
  /**
   * Poke HeyGen's `/v1/sessions/keep-alive` so the server doesn't time out
   * the session when the user lingers on a doc-upload modal. Caller should
   * fire this on a ~30s interval while the session is live; otherwise the
   * underlying LiveKit room is torn down server-side and subsequent
   * `speakAudio()` calls go to /dev/null.
   */
  keepAlive: () => Promise<void>;
  /** Cancel any current speech */
  interrupt: () => Promise<void>;
  /** Tear down the streaming session and free resources */
  stop:  () => Promise<void>;
}

const STREAM_READY_TIMEOUT_MS = 30_000;

export async function connectLiveAvatar(args: LiveAvatarConnectArgs): Promise<LiveAvatarHandle> {
  // Dynamic import keeps the SDK (~1 MB with LiveKit + WebRTC) out of the
  // main bundle — Vite emits it as its own chunk and only fetches it when a
  // user actually opens the visa-interview page. We deliberately let Vite
  // resolve this specifier (no /* @vite-ignore */); a previous version of
  // this file used @vite-ignore and broke the production build because the
  // browser can't resolve bare npm specifiers at runtime.
  const sdk: any = await import("@heygen/liveavatar-web-sdk")
    .catch((err) => {
      console.error("[liveAvatar] SDK package not installed:", err?.message);
      throw new Error(
        "Avatar SDK is not installed. Run `npm install @heygen/liveavatar-web-sdk` and reload.",
      );
    });

  const LiveAvatarSession = sdk.LiveAvatarSession;
  const SessionEvent      = sdk.SessionEvent;
  const SessionState      = sdk.SessionState;
  const AgentEventsEnum   = sdk.AgentEventsEnum;
  if (!LiveAvatarSession || !SessionEvent || !SessionState || !AgentEventsEnum) {
    throw new Error("Avatar SDK exports an unexpected shape — verify the @heygen/liveavatar-web-sdk version.");
  }

  const session = new LiveAvatarSession(args.sessionToken);
  let connected = false;
  let disposed = false;
  let streamReady = false;
  let mediaInterrupted = false;
  let connectionQuality: LiveAvatarConnectionQuality = "UNKNOWN";
  let mediaIssueTimer: ReturnType<typeof setTimeout> | null = null;

  const clearMediaIssueTimer = () => {
    if (!mediaIssueTimer) return;
    clearTimeout(mediaIssueTimer);
    mediaIssueTimer = null;
  };

  const reportMediaIssue = (reason: string, error?: unknown) => {
    reportClientError(error ?? new Error(`Live avatar media interrupted: ${reason}`), {
      source: "client.live_avatar.media_interrupted",
      severity: "warning",
      context: {
        reason,
        avatarId: args.avatarId,
        connectionQuality,
        readyState: args.videoEl.readyState,
        networkState: args.videoEl.networkState,
        paused: args.videoEl.paused,
      },
    });
  };

  const markMediaInterrupted = (reason: string) => {
    if (disposed || !connected || mediaInterrupted) return;
    mediaInterrupted = true;
    args.videoEl.pause();
    reportMediaIssue(reason);
    try { args.onMediaInterrupted?.(reason); } catch (error) { console.warn("[liveAvatar] onMediaInterrupted threw:", error); }
  };

  const markMediaRecovered = () => {
    if (!mediaInterrupted || disposed || connectionQuality === "BAD") return;
    mediaInterrupted = false;
    try { args.onMediaRecovered?.(); } catch (error) { console.warn("[liveAvatar] onMediaRecovered threw:", error); }
  };

  const resumeMediaPlayback = async () => {
    if (disposed || !streamReady || connectionQuality === "BAD") return;
    args.videoEl.muted = false;
    args.videoEl.volume = 1;
    try {
      await args.videoEl.play();
      markMediaRecovered();
    } catch (error) {
      reportMediaIssue("playback_blocked", error);
      markMediaInterrupted("playback_blocked");
      throw error;
    }
  };

  const scheduleMediaInterruption = (reason: string) => {
    if (disposed || !connected || mediaInterrupted) return;
    clearMediaIssueTimer();
    mediaIssueTimer = setTimeout(() => {
      mediaIssueTimer = null;
      if (args.videoEl.readyState >= 3 && !args.videoEl.paused) return;
      markMediaInterrupted(reason);
    }, 1_500);
  };

  const onMediaWaiting = () => scheduleMediaInterruption("media_waiting");
  const onMediaStalled = () => scheduleMediaInterruption("media_stalled");
  const onMediaPause = () => scheduleMediaInterruption("unexpected_pause");
  const onMediaPlaying = () => {
    clearMediaIssueTimer();
    markMediaRecovered();
  };
  const onMediaCanPlay = () => {
    clearMediaIssueTimer();
    if (mediaInterrupted && connectionQuality !== "BAD") void resumeMediaPlayback();
  };

  args.videoEl.addEventListener("waiting", onMediaWaiting);
  args.videoEl.addEventListener("stalled", onMediaStalled);
  args.videoEl.addEventListener("pause", onMediaPause);
  args.videoEl.addEventListener("playing", onMediaPlaying);
  args.videoEl.addEventListener("canplay", onMediaCanPlay);

  const cleanupMedia = () => {
    clearMediaIssueTimer();
    args.videoEl.removeEventListener("waiting", onMediaWaiting);
    args.videoEl.removeEventListener("stalled", onMediaStalled);
    args.videoEl.removeEventListener("pause", onMediaPause);
    args.videoEl.removeEventListener("playing", onMediaPlaying);
    args.videoEl.removeEventListener("canplay", onMediaCanPlay);
    args.videoEl.pause();
    args.videoEl.srcObject = null;
  };
  // NOTE: do NOT call session.attach(videoEl) here. The SDK's attach() is a
  // no-op until the remote video/audio tracks are populated, which happens
  // mid-`start()`. We attach inside the SESSION_STREAM_READY handler below.

  // Construct the handle up-front so we can pass it into onLive. handle.ready
  // flips to true once the SDK is fully CONNECTED (not just streaming).
  const handle: LiveAvatarHandle = {
    ready: false,
    speakAudio: async (audioBase64: string) => {
      // session.repeatAudio() takes base64-encoded PCM 24kHz audio and
      // streams it to the avatar in chunks for real-time lip-sync.
      // Returns synchronously (event id) in this SDK build, but throws
      // synchronously with "Session needs to be connected to send command
      // event" if the LiveAvatar session has been torn down (server-side
      // idle timeout, network drop, etc.). We let that throw propagate so
      // the caller can react — swallowing it would let the optimistic
      // SPEAK_STARTED + duration-fallback machinery run as if the avatar
      // had spoken, causing downstream effects like auto-end-on-final-line
      // to fire after a closing line that never actually played.
      session.repeatAudio(audioBase64);
    },
    ensurePlayback: async () => {
      if (disposed || !connected) throw new Error("Avatar session is not connected.");
      if (connectionQuality === "BAD") throw new Error("Avatar connection is unstable.");
      await resumeMediaPlayback();
      if (args.videoEl.paused) throw new Error("Avatar media playback is paused.");
    },
    keepAlive: async () => {
      try { await session.keepAlive(); }
      catch (err: any) { console.warn("[liveAvatar] keepAlive failed:", err?.message); }
    },
    interrupt: async () => {
      try { session.interrupt?.(); } catch { /* ignore */ }
    },
    stop: async () => {
      disposed = true;
      connected = false;
      handle.ready = false;
      cleanupMedia();
      try { await session.stop(); } catch { /* ignore */ }
    },
  };

  // Subscribe to avatar speech events up-front so we don't miss the first
  // SPEAK_STARTED if the avatar speaks immediately after going live.
  try {
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
      try { args.onSpeakStarted?.(); } catch (e) { console.warn("[liveAvatar] onSpeakStarted threw:", e); }
    });
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
      try { args.onSpeakEnded?.(); } catch (e) { console.warn("[liveAvatar] onSpeakEnded threw:", e); }
    });
  } catch (e) {
    console.warn("[liveAvatar] agent event subscription failed:", e);
  }

  // Wait for the SDK to reach SessionState.CONNECTED. STREAM_READY fires
  // earlier (during room.connect, before the command WebSocket is up), so
  // session.repeat() called on STREAM_READY will throw "Session needs to be
  // connected to send command event". We resolve only on CONNECTED.
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Avatar did not reach CONNECTED state within 30 seconds."));
    }, STREAM_READY_TIMEOUT_MS);

    const onStreamReady = () => {
      // Tracks are now populated — attach them to the <video> element.
      try { session.attach(args.videoEl); } catch (e) { console.warn("[liveAvatar] attach failed:", e); }
      streamReady = true;
      // Browsers block autoplay unless triggered from a user gesture; we are
      // (the user just clicked Start), but call play() defensively.
      void resumeMediaPlayback().catch(() => {});
    };

    const onStateChanged = (state: any) => {
      if (settled) return;
      if (state !== SessionState.CONNECTED) return;
      settled = true;
      clearTimeout(timeout);
      connected = true;
      handle.ready = true;
      void resumeMediaPlayback().catch(() => {});
      // Hand the live handle to the caller BEFORE resolving the promise so
      // they can use it synchronously inside onLive.
      try { args.onLive?.(handle); } catch (e) { console.warn("[liveAvatar] onLive threw:", e); }
      resolve();
    };

    const onDisconnect = (reason?: any) => {
      connected = false;
      handle.ready = false;
      disposed = true;
      cleanupMedia();
      args.onDisconnect?.(String(reason ?? "stream_disconnected"));
    };

    const onConnectionQualityChanged = (quality: any) => {
      const normalized: LiveAvatarConnectionQuality =
        quality === "GOOD" || quality === "BAD" ? quality : "UNKNOWN";
      connectionQuality = normalized;
      try { args.onConnectionQualityChanged?.(normalized); } catch (error) { console.warn("[liveAvatar] quality callback threw:", error); }
      if (normalized === "BAD") {
        markMediaInterrupted("connection_quality_bad");
      } else if (mediaInterrupted) {
        void resumeMediaPlayback().catch(() => {});
      }
    };

    try {
      session.on(SessionEvent.SESSION_STREAM_READY,  onStreamReady);
      session.on(SessionEvent.SESSION_STATE_CHANGED, onStateChanged);
      session.on(SessionEvent.SESSION_DISCONNECTED,  onDisconnect);
      session.on(SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED, onConnectionQualityChanged);
    } catch (e) {
      console.warn("[liveAvatar] event subscription failed:", e);
    }

    // Kick off the streaming session. The SDK calls /v1/sessions/start
    // internally, joins the LiveKit room, opens the command WebSocket, and
    // configures the session — only then does state become CONNECTED.
    Promise.resolve(session.start()).catch((err: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error(String(err?.message ?? err)));
    });
  });

  return handle;
}
