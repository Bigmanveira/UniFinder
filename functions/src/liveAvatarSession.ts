import { logger } from "firebase-functions";

// ─────────────────────────────────────────────────────────────────────────────
// HeyGen LiveAvatar — backend token issuance.
//
// LiveAvatar is HeyGen's new product (replacing the legacy /v1/streaming.* API
// which is sunsetting in March 2026). Auth flow:
//
//   1. Backend (here) calls POST https://api.liveavatar.com/v1/sessions/token
//      with X-API-KEY and a LITE-mode body containing the avatar_id.
//   2. Endpoint returns { session_id, session_token (JWT) }.
//   3. We pass the session_token to the browser, which feeds it into
//      `new LiveAvatarSession(session_token)` from @heygen/liveavatar-web-sdk.
//   4. The SDK calls /v1/sessions/start internally and joins the LiveKit room.
//
// The API key never leaves Cloud Functions. The browser sees only the
// short-lived session JWT.
// ─────────────────────────────────────────────────────────────────────────────

const LIVEAVATAR_TOKEN_URL = "https://api.liveavatar.com/v1/sessions/token";

// Default avatar — "Ann Therapist", a public LiveAvatar marketplace avatar.
// To change: GET https://api.liveavatar.com/v1/avatars/public and pick a UUID.
const DEFAULT_AVATAR_ID = "513fd1b7-7ef9-466d-9af2-344e51eeb833";

// LITE mode is the only mode that lets us drive the avatar with our own
// content while keeping Claude as the LLM. FULL mode unconditionally runs
// HeyGen's own agent participant — `repeat(text)` in FULL is treated as
// input to that agent, so the avatar speaks the agent's response, not
// our text. In LITE we render text → PCM ourselves (see avatarTts.ts)
// and ship the audio via `session.repeatAudio(b64)`, which the avatar
// lip-syncs to verbatim.
const SESSION_MODE = "LITE" as const;

export interface LiveAvatarTokenResult {
  ready: boolean;
  /** Short-lived JWT session token, fed to the browser SDK */
  sessionToken?: string;
  /** Server-assigned session id (for our own bookkeeping) */
  avatarSessionId?: string;
  /** Avatar UUID — passed back to the client only for display/debug; the SDK doesn't need it again */
  avatarId?: string;
  /** Voice id is unused in LITE mode but kept on the type for compatibility */
  voiceId?: string;
  /** Human-readable failure reason — safe to surface to the user */
  reason?: string;
}

interface LiveAvatarTokenResponse {
  code?: number;
  message?: string;
  data?: { session_id?: string; session_token?: string };
}

export async function createHeyGenSessionToken(args: {
  heygenApiKey: string | null;
  userId:       string;
  sessionId:    string;
}): Promise<LiveAvatarTokenResult> {
  // Treat empty / placeholder values as "not configured" so the user sees a
  // clean message instead of a 401 from HeyGen.
  const apiKey = args.heygenApiKey ?? "";
  const looksLikePlaceholder =
    !apiKey ||
    apiKey.startsWith("PLACEHOLDER") ||
    apiKey === "not_configured" ||
    apiKey.length < 10;
  if (looksLikePlaceholder) {
    return {
      ready: false,
      reason:
        "Live Avatar mode is not yet configured on this environment. " +
        "Set the real HeyGen LiveAvatar key with `firebase functions:secrets:set HEYGEN_API_KEY` and redeploy.",
    };
  }

  let res: Response;
  try {
    res = await fetch(LIVEAVATAR_TOKEN_URL, {
      method: "POST",
      headers: {
        "X-API-KEY":    apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode:      SESSION_MODE,
        avatar_id: DEFAULT_AVATAR_ID,
      }),
    });
  } catch (err: any) {
    logger.error("[liveAvatar] LiveAvatar network error:", err?.message);
    return { ready: false, reason: "Could not reach the avatar service. Try again in a moment." };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn(`[liveAvatar] LiveAvatar ${res.status}: ${body.slice(0, 300)}`);
    if (res.status === 401 || res.status === 403) {
      return { ready: false, reason: "LiveAvatar service rejected our key. Verify the key has streaming access." };
    }
    if (res.status === 422) {
      return { ready: false, reason: "Avatar configuration is invalid. Check the avatar_id is a valid UUID." };
    }
    if (res.status === 429) {
      return { ready: false, reason: "Avatar service is rate-limited. Try again shortly." };
    }
    return { ready: false, reason: `Avatar service returned ${res.status}.` };
  }

  let json: LiveAvatarTokenResponse;
  try {
    json = (await res.json()) as LiveAvatarTokenResponse;
  } catch {
    return { ready: false, reason: "Avatar service returned an invalid response." };
  }

  // LiveAvatar returns code=1000 on success
  if (json.code !== 1000 || !json.data?.session_token) {
    logger.warn(`[liveAvatar] Unexpected payload: ${JSON.stringify(json).slice(0, 300)}`);
    return {
      ready: false,
      reason: json.message ?? "Avatar service did not return a session token.",
    };
  }

  return {
    ready:           true,
    sessionToken:    json.data.session_token,
    avatarSessionId: json.data.session_id,
    avatarId:        DEFAULT_AVATAR_ID,
    voiceId:         "", // LITE mode uses the avatar's default voice
  };
}

export async function endHeyGenSession(args: {
  userId:    string;
  sessionId: string;
  avatarSessionId?: string | null;
}): Promise<{ ok: true }> {
  void args;
  // The browser SDK calls session.stop() on its end which fires the proper
  // teardown. The HeyGen session JWT is short-lived and self-expires.
  // Hook left here for future usage logging / premium-credit accounting.
  return { ok: true };
}
