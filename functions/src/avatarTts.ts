// ─────────────────────────────────────────────────────────────────────────────
// Server-side text-to-speech for Anna, the practice-interview consular officer.
//
// Why this exists:
//   The HeyGen LiveAvatar SDK has two session modes — LITE and FULL. FULL
//   mode runs an LLM agent on HeyGen's side and ignores literal-text speak
//   commands (the avatar speaks ITS llm's response, not our text), so we
//   can't drive the dialogue with Claude. LITE mode lets us push raw audio
//   for the avatar to lip-sync to, but it has no built-in TTS. So we render
//   Anna's lines to PCM here on the server and ship the audio to the SDK.
//
// Provider: Google Cloud Text-to-Speech. No API key required — Cloud
// Functions auto-authenticates with the project's default service account
// (which has roles/editor by default, granting texttospeech.synthesize).
//
// Output format: base64-encoded PCM @ 24kHz, 16-bit signed, little-endian,
// mono. This is exactly what `session.repeatAudio(b64)` expects. Google
// returns LINEAR16 with a WAV header — we strip it to get raw PCM.
// ─────────────────────────────────────────────────────────────────────────────

import { TextToSpeechClient } from "@google-cloud/text-to-speech";

// "Anna" — friendly, professional female US-English voice.
//
// Voice choice (audit 2026-05-15): switched from `en-US-Studio-O` ($0.16
// per 1k chars) to `en-US-Neural2-F` ($0.016 per 1k chars — exactly 10×
// cheaper). The earlier comment on this line claimed practice interviews
// "stay well inside the free tier"; that math was wrong. Free tier is 100k
// Studio chars/month total across all users — at even ~30 paying users a
// month it's blown. At 1M DAU on Studio the bill is ~$115k/month for TTS
// alone; Neural2 drops that to ~$11.5k for the same usage pattern.
//
// Neural2 is Google's "very natural" tier — voice-actor-quality, just not
// the brand-new Studio recordings. Still well above the older Wavenet/
// Standard voices. A/B in production: if customer feedback singles out
// voice quality, we can selectively upgrade premium-tier interviews to
// Studio, but defaulting Neural2 keeps unit economics intact.
const ANNA_VOICE = {
  languageCode: "en-US",
  name:         "en-US-Neural2-F",
  ssmlGender:   "FEMALE" as const,
};

// Single client per warm Cloud Functions instance. The constructor is
// idempotent and reuses cached auth tokens.
let _client: TextToSpeechClient | null = null;
function client(): TextToSpeechClient {
  if (!_client) _client = new TextToSpeechClient();
  return _client;
}

export interface TtsResult {
  /** Base64 PCM 24kHz audio, ready for `session.repeatAudio()`. */
  audioBase64: string;
  /** Exact duration in milliseconds — used by the client as a fallback if
   *  AVATAR_SPEAK_ENDED never fires. Computed from byte count. */
  durationMs: number;
}

/**
 * WAV files start with a header (RIFF + fmt chunks + data chunk header)
 * before the actual sample bytes. The header length isn't fixed (extra
 * chunks like LIST or INFO can appear), so we scan for the literal "data"
 * marker and skip 8 more bytes (chunk id + chunk size) to land on the
 * first sample.
 */
function stripWavHeader(buf: Buffer): Buffer {
  const dataMarker = Buffer.from("data", "ascii");
  const idx = buf.indexOf(dataMarker);
  if (idx < 0) {
    // Shouldn't happen for Google LINEAR16 output. Defensive fallback:
    // assume the standard 44-byte PCM WAV header.
    return buf.subarray(44);
  }
  return buf.subarray(idx + 8);
}

/**
 * Visa-form names are written like "DS-160" but pronounced like "DS one sixty"
 * — TTS engines default to the cardinal reading ("one hundred and sixty"),
 * which sounds wrong in a consular-officer context. We rewrite the most
 * common forms before synthesis. The transcript saved to Firestore is left
 * untouched; only the audio gets the spoken form.
 */
function speakableVisaTerms(text: string): string {
  return text
    .replace(/\bDS-?160\b/gi,  "DS one sixty")
    .replace(/\bDS-?2019\b/gi, "DS twenty nineteen")
    .replace(/\bI-?20\b/g,     "I twenty")
    .replace(/\bI-?94\b/g,     "I ninety four")
    .replace(/\bF-?1\b/g,      "F one")
    .replace(/\bM-?1\b/g,      "M one")
    .replace(/\bJ-?1\b/g,      "J one");
}

export async function synthesizeOfficerAudio(args: {
  text: string;
}): Promise<TtsResult> {
  const text = args.text.trim();
  if (!text) throw new Error("synthesizeOfficerAudio: empty text");
  if (text.length > 4000) throw new Error("synthesizeOfficerAudio: text too long");

  const spokenText = speakableVisaTerms(text);

  const [response] = await client().synthesizeSpeech({
    input: { text: spokenText },
    voice: ANNA_VOICE,
    audioConfig: {
      audioEncoding:   "LINEAR16",
      sampleRateHertz: 24000,
      // Neural2 voices have natural prosody at 1.0; faster reads sound rushed.
      speakingRate:    1.0,
    },
  });

  if (!response.audioContent) {
    throw new Error("Google TTS returned no audioContent");
  }

  const wavBuf = response.audioContent instanceof Uint8Array
    ? Buffer.from(response.audioContent)
    : Buffer.from(response.audioContent as string, "base64");

  const pcmBuf = stripWavHeader(wavBuf);

  // PCM 24kHz, 16-bit mono = 48,000 bytes per second.
  const durationMs = Math.round((pcmBuf.length / 48000) * 1000);

  return {
    audioBase64: pcmBuf.toString("base64"),
    durationMs,
  };
}
