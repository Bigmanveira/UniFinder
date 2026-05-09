// ─────────────────────────────────────────────────────────────────────────────
// useSpeechRecognition — thin wrapper around the browser Web Speech API.
//
// Why we own this rather than reach for a library:
//   - LITE-mode HeyGen does ONLY TTS (avatar lipsyncs text we provide).
//     We need our own STT to capture what the user says back so we can feed
//     it to Claude.
//   - Browser-native STT (webkitSpeechRecognition / SpeechRecognition) is
//     free, low-latency, and Good Enough for short interview-style answers.
//   - Cloud STT would add cost + a roundtrip; not worth it for v1.
//
// Browser support: Chromium (Chrome/Edge/Brave/Opera/Arc) + Safari 14.1+.
// Firefox does NOT support it. We surface `isSupported` so the UI can
// show a clean "use Chrome or Safari" message.
//
// Usage:
//   const sr = useSpeechRecognition({ onFinal: (text) => sendAnswer(text) });
//   sr.start();   // listen
//   sr.stop();    // commit current buffer + stop
//   sr.abort();   // discard buffer + stop
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = any;

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export interface UseSpeechRecognitionOptions {
  /** Called once with the user's complete utterance after they pause. */
  onFinal?: (text: string) => void;
  /** Called for every interim result so the UI can show a live caption. */
  onInterim?: (text: string) => void;
  /** Called when recognition errors — `not-allowed` means the user denied the mic. */
  onError?: (code: string, message: string) => void;
  /** BCP-47 language code. Defaults to "en-US" (visa interviews are conducted in English). */
  lang?: string;
}

export interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  /** Live (final + interim) transcript while listening. Cleared each time start() is called. */
  transcript: string;
  start: () => void;
  /** Stop listening and emit whatever final text we have. */
  stop: () => void;
  /** Cancel without emitting. */
  abort: () => void;
}

const Ctor: typeof window.SpeechRecognition | undefined =
  typeof window !== "undefined"
    ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
    : undefined;

export function useSpeechRecognition(
  opts: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionResult {
  const { onFinal, onInterim, onError, lang = "en-US" } = opts;

  const recRef          = useRef<SpeechRecognitionLike | null>(null);
  const finalBufferRef  = useRef("");
  const interimRef      = useRef("");
  // We keep callbacks in refs so the recognition instance never goes stale.
  const onFinalRef      = useRef(onFinal);
  const onInterimRef    = useRef(onInterim);
  const onErrorRef      = useRef(onError);
  // Silence detector: with continuous=true the browser never auto-ends, so
  // we have to detect end-of-utterance ourselves. Reset on every result;
  // when it fires we call rec.stop() which triggers onend → onFinal.
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SILENCE_END_MS = 1800;

  const [isListening, setIsListening] = useState(false);
  const [transcript,  setTranscript]  = useState("");

  useEffect(() => { onFinalRef.current   = onFinal;   }, [onFinal]);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  useEffect(() => { onErrorRef.current   = onError;   }, [onError]);

  const isSupported = !!Ctor;

  // Lazy init on first start(). Re-creating per session means a stuck
  // recognition instance can't hold our callback closures hostage.
  const ensureRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (!Ctor) return null;
    if (recRef.current) return recRef.current;

    const rec = new Ctor();
    rec.continuous     = true;   // keep capturing across short pauses
    rec.interimResults = true;   // emit partial transcripts
    rec.lang           = lang;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let interim = "";
      // The `resultIndex` lets us only process new results since the last event.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text: string = r[0]?.transcript ?? "";
        if (r.isFinal) {
          finalBufferRef.current = (finalBufferRef.current + " " + text).trim();
        } else {
          interim += text;
        }
      }
      interimRef.current = interim;
      const combined = (finalBufferRef.current + " " + interim).trim();
      setTranscript(combined);
      if (interim) onInterimRef.current?.(interim);

      // Restart the silence timer on every result. When the user stops
      // speaking, no more results arrive and the timer fires after
      // SILENCE_END_MS, calling rec.stop() to commit the answer.
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (combined) {
        silenceTimerRef.current = setTimeout(() => {
          console.log("[speech] silence detected, committing answer");
          try { rec.stop(); } catch { /* already stopped */ }
        }, SILENCE_END_MS);
      }
    };

    rec.onerror = (event: any) => {
      const code: string = event?.error ?? "unknown";
      // `no-speech` and `aborted` are expected lifecycle events, not real errors.
      if (code === "no-speech" || code === "aborted") return;
      console.warn("[speech] error:", code, event?.message);
      onErrorRef.current?.(code, event?.message ?? code);
    };

    rec.onend = () => {
      console.log("[speech] onend, finalBuffer =", JSON.stringify(finalBufferRef.current.slice(0, 80)));
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      setIsListening(false);
      const finalText = finalBufferRef.current.trim();
      // Clear buffers BEFORE notifying so a synchronous start() inside the
      // callback gets a fresh slate.
      finalBufferRef.current = "";
      interimRef.current     = "";
      if (finalText) onFinalRef.current?.(finalText);
    };

    recRef.current = rec;
    return rec;
  }, [lang]);

  const start = useCallback(() => {
    const rec = ensureRecognition();
    if (!rec) {
      onErrorRef.current?.("not-supported", "Speech recognition is not available in this browser.");
      return;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    finalBufferRef.current = "";
    interimRef.current     = "";
    setTranscript("");
    console.log("[speech] start()");
    try {
      rec.start();
      setIsListening(true);
    } catch (err: any) {
      // `start()` throws "InvalidStateError" if already started. Treat as no-op.
      const msg = String(err?.message ?? err);
      if (!/already started/i.test(msg)) {
        onErrorRef.current?.("start-failed", msg);
      }
    }
  }, [ensureRecognition]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try { rec.stop(); } catch { /* already stopped */ }
  }, []);

  const abort = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    // Drop the buffer so onend doesn't fire onFinal.
    finalBufferRef.current = "";
    interimRef.current     = "";
    try { rec.abort(); } catch { /* ignore */ }
  }, []);

  // Tear down on unmount so the page doesn't keep the mic light on.
  useEffect(() => () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror  = null;
      rec.onend    = null;
      rec.abort();
    } catch { /* ignore */ }
    recRef.current = null;
  }, []);

  return { isSupported, isListening, transcript, start, stop, abort };
}
