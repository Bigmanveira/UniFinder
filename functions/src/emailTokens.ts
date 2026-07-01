// ─────────────────────────────────────────────────────────────────────────────
// emailTokens — signed one-click unsubscribe tokens for lifecycle emails
// (engagement reminders + feedback requests).
//
// A token carries the user's uid and the email CATEGORY they want to opt out
// of, signed with an HMAC so the public unsubscribe endpoint can trust it
// without the user being logged in. No expiry: an unsubscribe link should keep
// working forever — a stale link that silently fails would be worse than one
// that always honours the opt-out.
//
// Format:  base64url(`${uid}:${category}`) + "." + hex(HMAC-SHA256(payload))
// The secret is EMAIL_TOKEN_SECRET (Firebase Secret Manager). It is NEVER the
// Resend key or any other credential — a leak of this secret only lets an
// attacker unsubscribe users, not send mail or read data.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "node:crypto";

// Categories a user can be opted out of. "all" is a convenience that the
// endpoint expands into every category.
export type EmailCategory = "reminders" | "feedback" | "all";

const VALID_CATEGORIES: ReadonlySet<string> = new Set(["reminders", "feedback", "all"]);

function b64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Mint an unsubscribe token for a user + category. Deterministic (same inputs
 * → same token) so re-sends of the same email carry a stable link.
 */
export function makeUnsubscribeToken(uid: string, category: EmailCategory, secret: string): string {
  const payload = b64urlEncode(`${uid}:${category}`);
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verify a token and return its uid + category, or null if the signature is
 * invalid / the token is malformed. Uses a timing-safe compare so we don't
 * leak signature-guess progress.
 */
export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): { uid: string; category: EmailCategory } | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const dot = token.lastIndexOf(".");
  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  if (!payload || !provided) return null;

  const expected = sign(payload, secret);
  // timingSafeEqual throws if lengths differ, so guard first.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"))) {
    return null;
  }

  let decoded: string;
  try {
    decoded = b64urlDecode(payload);
  } catch {
    return null;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return null;
  const uid = decoded.slice(0, sep);
  const category = decoded.slice(sep + 1);
  if (!uid || !VALID_CATEGORIES.has(category)) return null;

  return { uid, category: category as EmailCategory };
}

/**
 * Build the absolute URL for the public unsubscribe endpoint. Uses the classic
 * cloudfunctions.net alias (works for both 1st- and 2nd-gen functions) with the
 * project id from the runtime environment and the default us-central1 region.
 */
export function buildUnsubscribeUrl(uid: string, category: EmailCategory, secret: string): string {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "unifinder-dev-d61aa";
  const token = makeUnsubscribeToken(uid, category, secret);
  return `https://us-central1-${project}.cloudfunctions.net/unsubscribeEmail?token=${encodeURIComponent(token)}`;
}
