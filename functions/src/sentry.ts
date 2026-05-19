// ─────────────────────────────────────────────────────────────────────────────
// Sentry — backend error capture for Cloud Functions.
//
// Unified observability with the frontend (src/main.tsx): same DSN, same
// Sentry project, both sides' errors land in one Issues inbox. The DSN is
// a public identifier (Sentry pairs it with a server-only secret we never
// see), so hardcoding is safe.
//
// Pattern: this module re-exports `onCall`, `onRequest`, and
// `onDocumentCreated` from firebase-functions, but each one auto-wraps its
// handler with try/captureException/flush/rethrow. In `index.ts` we just
// import these instead of the raw Firebase ones — every handler is now
// observable with zero per-handler boilerplate.
//
// We DELIBERATELY skip capturing intentional 4xx HttpsErrors ("Insufficient
// credits", "Sign in first", etc.) — those are normal client-misuse
// responses, not real bugs. Only unexpected errors + 5xx-class HttpsErrors
// get reported. Otherwise Sentry's inbox becomes useless noise.
//
// Flush behavior: after each error we await Sentry.flush(2000) so the event
// reaches Sentry before Cloud Run pauses the container. Without the flush,
// short-lived cold-start instances would drop their errors on the floor.
// 2000ms is generous; success-path events queue and send via the next
// invocation on the same warm instance — no flush cost on the happy path.
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from "@sentry/node";
import {
  onCall as fbOnCall,
  onRequest as fbOnRequest,
} from "firebase-functions/v2/https";
import { onDocumentCreated as fbOnDocumentCreated } from "firebase-functions/v2/firestore";

const SENTRY_DSN = "https://6a370ec76f07e64c42e64208e0d1a80e@o4511392172408832.ingest.us.sentry.io/4511392181387264";

// Init at module load. Idempotent — Sentry.init is safe to call multiple
// times, but since this module is imported once by index.ts the side-effect
// runs exactly once per Cloud Run container.
Sentry.init({
  dsn: SENTRY_DSN,
  // K_REVISION is set by Cloud Run for deployed functions; absent on the
  // emulator / local dev. Useful for filtering noise in the dashboard.
  environment: process.env.K_REVISION ? "production" : "development",
  // K_REVISION includes a build-id-like suffix that drifts with each
  // deploy — fine as a release identifier.
  release: process.env.K_REVISION || undefined,
  // 100% sampling at launch volume. Drop to ~0.1 once we cross Sentry's
  // free transaction tier (currently 10k/month).
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
});

// HttpsError codes that represent intentional client-facing errors. These
// are NOT bugs and should NOT pollute the Sentry issues inbox.
const INTENTIONAL_ERROR_CODES = new Set([
  "invalid-argument",
  "failed-precondition",
  "unauthenticated",
  "permission-denied",
  "not-found",
  "already-exists",
  "resource-exhausted",
  "out-of-range",
  "unimplemented",
  "cancelled",
  "unavailable",
  "deadline-exceeded",
]);

function shouldCapture(err: any): boolean {
  // Anything that's NOT an HttpsError → capture (probably a thrown
  // unexpected exception or a wrapped network/Claude/Dodo error).
  // HttpsError with an internal/unknown/data-loss code → capture.
  // HttpsError with an intentional code → skip.
  const code = err?.code;
  if (typeof code !== "string") return true;
  return !INTENTIONAL_ERROR_CODES.has(code);
}

/**
 * Wrap a handler so every uncaught error gets reported to Sentry before
 * being re-thrown. Generic over the handler signature so it works for
 * onCall (request → result), onRequest (req,res → void), and
 * onDocumentCreated (event → void) without separate wrappers.
 */
function withSentry<T extends (...args: any[]) => Promise<any>>(handler: T): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (err: any) {
      if (shouldCapture(err)) {
        Sentry.captureException(err);
        // Flush is the difference between a useful Sentry and a silent
        // one on Cloud Functions. Don't let a flush timeout propagate —
        // we still want to re-throw the original error to the caller.
        await Sentry.flush(2000).catch(() => {});
      }
      throw err;
    }
  }) as unknown as T;
}

// ─── Re-exports ──────────────────────────────────────────────────────────────
// Same call signatures as the Firebase originals, just wrapped. Type
// assertions via `as any` because Firebase's overloads are fussy and we
// don't need stricter typing than the originals (which are well-typed at
// the call site).

export const onCall: typeof fbOnCall = ((...args: any[]) => {
  if (args.length === 1 && typeof args[0] === "function") {
    // onCall(handler) — one-arity form (no options)
    return fbOnCall(withSentry(args[0]));
  }
  // onCall(opts, handler) — the form we use everywhere in this repo
  return fbOnCall(args[0], withSentry(args[1]));
}) as any;

export const onRequest: typeof fbOnRequest = ((...args: any[]) => {
  if (args.length === 1 && typeof args[0] === "function") {
    return fbOnRequest(withSentry(args[0]));
  }
  return fbOnRequest(args[0], withSentry(args[1]));
}) as any;

export const onDocumentCreated: typeof fbOnDocumentCreated = ((opts: any, handler: any) => {
  return fbOnDocumentCreated(opts, withSentry(handler));
}) as any;

// Pass-through so index.ts only needs one import path for these primitives.
export { HttpsError } from "firebase-functions/v2/https";
