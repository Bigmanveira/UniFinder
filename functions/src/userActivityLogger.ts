// ─────────────────────────────────────────────────────────────────────────────
// userActivityLogger — server-side writer for /userAuditLogs.
//
// The collection used to only carry sign_in / sign_out events written by the
// client-side recordUserAuditEvent callable. That was useful for proving a
// user was on the app but useless for diagnosing "they paid, nothing
// happened" — because the silent webhook failure left no user-visible
// trail.
//
// This module lets every Cloud Function that handles a meaningful user
// action stamp a row on /userAuditLogs (via Admin SDK, no claim check
// needed). The ops portal's User detail page then surfaces the timeline
// in chronological order so a support analyst can instantly see what the
// user actually did + what the system did in response.
//
// Use this for backend-initiated activity. Sign-in / sign-out continues to
// be written client-side via recordUserAuditEvent — those events need IP
// + user-agent attribution which only the client knows.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from "firebase-admin";

/** Closed set of action types accepted by this writer. Add a new type
 *  here AND update ACTION_META in the ops portal's user-activity panel
 *  so it renders with a label + colour. Otherwise the UI falls back to a
 *  neutral chip. */
export type UserActivityAction =
  | "purchase_initiated"        // Paystack checkout requested
  | "purchase_completed"        // Webhook fired + wallet credited
  | "purchase_failed"           // Webhook fired but processing rejected (signature, metadata, amount, etc.)
  | "purchase_refunded"         // Refund processed via webhook
  | "match_report_unlocked"     // 1 credit spent on a match report
  | "match_report_bucket_revealed" // 5 credits spent to reveal a Reach/Safety bucket
  | "academic_cv_generated"     // Free generation; preview stored, paywall in place
  | "academic_cv_unlocked"      // 5/8 credits spent to unlock the full CV
  | "visa_interview_started"    // 15 credits spent on a visa session
  | "visa_interview_completed"  // Session finished + scored
  | "visa_document_uploaded"    // I-20 / DS-160 uploaded + extracted
  | "referral_code_applied"     // Standard user referral applied (pending or paid-out)
  | "marketer_code_applied"     // Marketer code redeemed
  | "credits_granted_manual"    // Founder manually granted credits (typically to recover from a failed webhook)
  | "engagement_reminder_sent"  // Lifecycle: "continue where you left off" nudge emailed
  | "feedback_request_sent";    // Lifecycle: post-completion feedback request emailed

export interface LogUserActivityArgs {
  /** The user the action belongs to. */
  userId:      string;
  /** What happened. Closed allow-list — keep in sync with UserActivityAction. */
  action:      UserActivityAction;
  /** Optional pointer to the thing the action operated on. E.g.,
   *  `targetType: "matchReport"`, `targetId: <reportId>`. */
  targetType?: string;
  /** Free-form, capped at ~4KB after JSON-stringify. Use for the small
   *  details a support agent will want at a glance: pack name, amount,
   *  reference, reason-on-failure. Don't dump full request bodies. */
  targetId?:   string;
  metadata?:   Record<string, unknown>;
}

/**
 * Append a row to /userAuditLogs. Best-effort: failures are logged but
 * never thrown, so a hiccup in this side-write can't break the primary
 * user action (a purchase, an unlock, etc.). Without that guarantee a
 * Firestore outage would block paying customers from getting credits.
 */
export async function logUserActivity(args: LogUserActivityArgs): Promise<void> {
  try {
    // Sanitise metadata: JSON-roundtrip strips functions/undefined and
    // gives us a way to size-cap. Same hygiene errorLogger uses on its
    // context field. Skipped if no metadata supplied.
    let metadata: Record<string, unknown> | null = null;
    if (args.metadata) {
      try {
        const json = JSON.stringify(args.metadata);
        if (json.length <= 4_000) metadata = JSON.parse(json);
      } catch {
        metadata = null;
      }
    }

    await admin.firestore().collection("userAuditLogs").add({
      actorUid:   args.userId,
      action:     args.action,
      targetType: args.targetType ?? null,
      targetId:   args.targetId   ?? null,
      metadata,
      // Backend-initiated rows can't capture client IP / user-agent.
      // Sign-in / sign-out rows from the client carry them — the ops
      // portal renders whichever fields are present.
      source:     "server",
      createdAt:  admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err: any) {
    // Don't propagate. Activity logging is observability, not a critical
    // path. Log to Cloud Functions console so we can spot a chronic
    // failure mode if it happens.
    console.warn("[user-activity] write failed", { action: args.action, userId: args.userId, err: err?.message ?? err });
  }
}
