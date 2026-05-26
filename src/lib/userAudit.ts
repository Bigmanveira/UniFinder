// User-facing audit log helper. Mirrors the ops-portal audit helper
// in spirit but writes to /userAuditLogs (a separate collection from
// the admin /auditLogs) via the recordUserAuditEvent Cloud Function.
//
// Fire-and-forget by design: a failed audit write must NEVER block
// the user's sign-in or sign-out. We swallow errors here so callers
// don't need try/catch noise at every call site.
//
// Sign-in debounce uses the Firebase ID-token `authTime` field. That
// value is the canonical "when did this user actually re-authenticate"
// timestamp — it changes on real sign-in events (password, magic link,
// Google) and stays constant across tab refreshes, hourly token
// rotations, and session restores from Firebase's IndexedDB
// persistence. Storing the last-logged authTime in localStorage and
// comparing on every onAuthStateChanged fire perfectly captures
// "fresh sign-in vs. same session showing up again".

import { httpsCallable } from "firebase/functions";
import { signOut } from "firebase/auth";
import { auth, functions } from "./firebase";

const LAST_AUTH_TIME_PREFIX = "userApp:lastLoggedAuthTime";

export type UserAuditAction = "user_sign_in" | "user_sign_out";

interface UserAuditEventInput {
  action:      UserAuditAction;
  targetType?: string;
  targetId?:   string;
  metadata?:   Record<string, unknown>;
}

/**
 * Fire a user audit event. Never throws. Logs a `console.info` on
 * success so an operator can verify in DevTools that the call
 * landed.
 */
export async function logUserAuditEvent(input: UserAuditEventInput): Promise<void> {
  try {
    const fn = httpsCallable(functions, "recordUserAuditEvent");
    await fn(input);
    // eslint-disable-next-line no-console
    console.info("[user-audit] logged", input.action);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[user-audit] failed to record event:", input.action, err);
  }
}

/**
 * Log a sign-in event only when the user's authTime indicates an
 * actual new sign-in (vs. a tab refresh or session restore).
 *
 * Same authTime-comparison pattern the ops portal uses. authTime is
 * a UTC ISO string on the Firebase IdTokenResult.
 */
export async function logUserSignInIfNewAuth(actorUid: string, authTime: string): Promise<void> {
  const key = `${LAST_AUTH_TIME_PREFIX}:${actorUid}`;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    // Private mode / storage-disabled — fall through and log
    // unconditionally rather than silently swallow a real sign-in.
  }
  if (stored === authTime) {
    return;
  }
  await logUserAuditEvent({ action: "user_sign_in" });
  try {
    localStorage.setItem(key, authTime);
  } catch { /* no-op */ }
}

/**
 * Sign out wrapper that logs the audit event BEFORE the auth token
 * is destroyed (Firebase callable auth context disappears as soon as
 * signOut resolves). All sign-out call sites in the user app should
 * use this instead of calling `signOut(auth)` directly.
 *
 * Awaits the audit write so the event lands before sign-out
 * propagates; failures are swallowed inside logUserAuditEvent so
 * they can't block the sign-out path.
 */
export async function signOutWithAudit(): Promise<void> {
  await logUserAuditEvent({ action: "user_sign_out" });
  await signOut(auth);
}
