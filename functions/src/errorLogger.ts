// errorLogger — write a structured record of an error to Firestore so the
// ops portal can surface it to analysts. Designed to be bulletproof: any
// failure inside this module is swallowed so it can NEVER take down the
// caller's error path.
//
// USAGE PATTERN
//   import { logError } from "./errorLogger.js";
//
//   try {
//     ...
//   } catch (err: any) {
//     console.warn("[dodo] webhook signature invalid:", err?.message ?? err);
//     // ADD logError NEXT TO the existing log — do NOT replace.
//     // Fire-and-forget: don't await inside a webhook handler.
//     void logError({
//       category: "payment_webhook",
//       source:   "dodo.signature_invalid",
//       severity: "error",
//       message:  err?.message ?? String(err),
//       context:  { webhookId },
//     });
//     res.status(400).send("Invalid signature");
//     return;
//   }
//
// WHY ADDITIVELY (NOT REPLACING)
//   - Cloud Logging continues to receive the original console.warn/error,
//     so existing observability is unchanged.
//   - If errorLogger has a bug or Firestore is degraded, ops still has
//     Cloud Logging as the source of truth.
//   - One-direction risk: we add a new Firestore write that *should* be
//     completely separate from the caller's logic. The internals here are
//     defensive — see "BULLETPROOFING" below.
//
// BULLETPROOFING
//   - All Firestore work happens inside try/catch that swallows everything.
//   - Returns a Promise (void) but callers should NOT await it inside
//     latency-sensitive handlers (webhooks). The promise resolves once
//     the write either lands or fails-silently.
//   - Input is sanitized to strip undefined (Firestore rejects it) and
//     drop functions / symbols / depth-bombs.
//   - If admin.firestore() is somehow not initialized, the catch handles it.
//   - Cloud Logging fallback: even if the Firestore write fails, we re-log
//     with logger.warn so the record isn't lost.

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

export type ErrorCategory =
  | "payment_webhook"
  | "ai_call"
  | "email_send"
  | "external_api"
  | "storage"
  | "tts"
  | "other";

export type ErrorSeverity = "error" | "warning";

export interface LogErrorArgs {
  /** Coarse bucket for filtering in the ops portal */
  category: ErrorCategory;
  /** Narrow label, e.g. "dodo.signature_invalid", "heygen.token_network" */
  source: string;
  /** Defaults to "error". Use "warning" for non-fatal (e.g. receipt email failed but credits granted). */
  severity?: ErrorSeverity;
  /** Human-readable error message */
  message: string;
  /** Optional correlation fields — populate whichever are available */
  userId?:    string | null;
  paymentId?: string | null;
  sessionId?: string | null;
  reportId?:  string | null;
  /** Free-form per-error context (request fragments, stack snippets, etc.) */
  context?: Record<string, unknown>;
}

/**
 * Best-effort write to `errorLogs` collection. Never throws. Caller should
 * fire-and-forget (`void logError({...})`) in latency-sensitive paths.
 *
 * Returns a Promise that resolves once the write attempt completes, but
 * resolves equally on success and on swallowed-failure.
 */
export async function logError(args: LogErrorArgs): Promise<void> {
  // Build the payload up-front so a failure of one step (e.g. sanitization)
  // can't leave us with a half-built doc.
  const severity: ErrorSeverity = args.severity ?? "error";
  let payload: Record<string, unknown>;
  try {
    payload = sanitize({
      category:  args.category,
      source:    args.source,
      severity,
      message:   args.message,
      userId:    args.userId    ?? undefined,
      paymentId: args.paymentId ?? undefined,
      sessionId: args.sessionId ?? undefined,
      reportId:  args.reportId  ?? undefined,
      context:   args.context,
    }) as Record<string, unknown>;
  } catch {
    // Even sanitize shouldn't throw, but be paranoid.
    payload = {
      category: args.category,
      source:   args.source,
      severity,
      message:  String(args.message ?? "unknown"),
    };
  }

  // Firestore Admin SDK rejects writes with undefined values; the sanitize
  // pass above strips them. Now stamp the server timestamp last so a bad
  // earlier step can't accidentally drop it.
  try {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  } catch {
    // No timestamp is still acceptable — the doc just lands without it.
  }

  // Attempt the write. Swallow any error; fall back to a Cloud Logging
  // re-emit so the record isn't lost.
  try {
    await admin.firestore().collection("errorLogs").add(payload);
  } catch (err) {
    try {
      logger.warn("[errorLogger] failed to persist errorLog doc (continuing)", {
        source:           args.source,
        category:         args.category,
        innerErrorMessage: (err as any)?.message ?? String(err),
      });
    } catch {
      // Even logger failed — there's nothing more we can safely do.
    }
  }
}

// ─── Sanitization ────────────────────────────────────────────────────────
// Firestore (Admin SDK) rejects:
//   - undefined values at any depth → throws "Unsupported field value: undefined"
//   - functions, symbols (silently ignored, but explicit is safer)
//   - cyclic references (throws)
//
// We:
//   - drop undefined / function / symbol values from their parent (so the
//     parent object survives, just without that key)
//   - preserve null
//   - leave Dates and Firestore Timestamps intact (Admin SDK accepts both)
//   - cap recursion depth to defuse circular refs / runaway nesting
//
// Returns `undefined` for values that should be stripped by the caller.
// At top-level (depth 0) we always return an object.

const MAX_SANITIZE_DEPTH = 8;
const MAX_STRING_LENGTH  = 4000;   // truncate giant error strings / stacks

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return "[truncated:depth]";
  if (value === undefined) return undefined;
  if (value === null) return null;

  const t = typeof value;
  if (t === "function" || t === "symbol") return undefined;
  if (t === "string") {
    const s = value as string;
    return s.length > MAX_STRING_LENGTH
      ? s.slice(0, MAX_STRING_LENGTH) + `…[truncated:${s.length - MAX_STRING_LENGTH}chars]`
      : s;
  }
  if (t === "number" || t === "boolean" || t === "bigint") return value;

  if (value instanceof Date) return value;
  // Firestore Timestamp — leave intact (duck-type to avoid an admin import dep here)
  if (value && typeof (value as any).toDate === "function" && typeof (value as any).seconds === "number") {
    return value;
  }
  // Buffer / typed arrays — convert to a short summary; persisting binary
  // payloads in errorLogs is never useful and bloats the doc.
  if (value instanceof Uint8Array || (typeof Buffer !== "undefined" && value instanceof Buffer)) {
    return `[binary:${(value as any).length ?? "?"}bytes]`;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const v of value) {
      const cleaned = sanitize(v, depth + 1);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }
  if (t === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) {
      const cleaned = sanitize(v, depth + 1);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  // Anything else — coerce to string defensively.
  try {
    return String(value);
  } catch {
    return undefined;
  }
}
