// ─────────────────────────────────────────────────────────────────────────────
// cleanupTestPayments — one-shot maintenance helper for purging test-mode
// payment data after going live with Paystack.
//
// What it does:
//   1. Finds the single live `paystackPayments` doc by reference.
//   2. Deletes every OTHER paystackPayments doc.
//   3. Deletes every `creditTransactions` doc whose reference doesn't match
//      the live one — wipes test-mode purchase ledger entries as well as
//      every non-purchase movement (free signup credits, match-unlock
//      spends, etc.) so the ledger reads as "fresh launch".
//   4. Resets every `creditWallets` balance to the FREE_CREDITS_ON_SIGNUP
//      grant (so signed-up users keep the welcome credits they're
//      entitled to), then plants the live payer's wallet with the
//      credits the live pack actually granted. Prior to 2026-05-27
//      this step wrote 0 — which silently wiped freshly-signed-up
//      accounts whose wallets had been eagerly materialized by
//      onUserCreated to credits:2. The signup grant is now preserved.
//   5. Wipes every product-activity collection — matchReports, aiRuns,
//      visaInterviewSessions / Messages / Reports / Documents, errorLogs.
//      User accounts + their state (/users, /studentProfiles,
//      /savedSchools, /roadmapProgress) deliberately stay put so
//      dormant test accounts keep their profile.
//
// Why a Cloud Function and not a local script:
//   - Admin SDK runs server-side with privileged Firestore access; no
//     service-account JSON for the operator to manage locally.
//   - The callable is admin-gated and writes an `auditLogs` entry, so
//     the action is traceable.
//   - Idempotent: re-running with the same liveReference is safe (the
//     other paystackPayments are already gone; wallets re-zero; the
//     live wallet still ends up with the right grant).
//
// Safety bar:
//   - Caller must carry the `admin: true` custom claim.
//   - Caller must pass `confirm: "CONFIRM"` exactly (not booleable).
//   - If the liveReference isn't found, we throw before deleting anything.
//
// NOT-touched collections (intentional):
//   - /users, /studentProfiles, /savedSchools, /roadmapProgress,
//     /referralCodes — user identity + state survives.
//   - /auditLogs — the cleanup itself writes an entry here, and
//     prior entries are the historical record of admin actions.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from "firebase-admin";

export interface CleanupTestPaymentsArgs {
  liveReference: string;
  /** Base balance every non-live wallet is reset to after the wipe.
   *  Passed in from the caller so this module doesn't have to import
   *  FREE_CREDITS_ON_SIGNUP from index.ts (avoids a circular dep). */
  freeSignupCredits: number;
}

export interface CleanupTestPaymentsResult {
  paystackPaymentsDeleted:   number;
  creditTransactionsDeleted: number;
  walletsReset:              number;
  liveUserId:                string;
  liveCreditsGranted:        number;
  /** Per-collection delete counts for the activity wipe. Keys are
   *  the Firestore collection names; values are doc counts deleted. */
  activityDeleted:           Record<string, number>;
}

// Collections that hold pure test-usage data — every doc gets purged.
// User identity + state (/users, /studentProfiles, /savedSchools,
// /roadmapProgress) deliberately stays put so dormant test accounts
// keep their profile rather than losing it by surprise.
const ACTIVITY_COLLECTIONS = [
  "matchReports",
  "aiRuns",
  "visaInterviewSessions",
  "visaInterviewMessages",
  "visaInterviewReports",
  "visaInterviewDocuments",
  "errorLogs",
] as const;

// Firestore caps a single WriteBatch at 500 ops. 400 leaves headroom
// in case we ever combine writes from multiple collections in one
// batch later.
const BATCH_SIZE = 400;

async function batchedWrite<T>(
  items: T[],
  apply: (batch: FirebaseFirestore.WriteBatch, item: T) => void,
): Promise<void> {
  const db = admin.firestore();
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const item of items.slice(i, i + BATCH_SIZE)) apply(batch, item);
    await batch.commit();
  }
}

export async function runCleanupTestPayments(
  args: CleanupTestPaymentsArgs,
): Promise<CleanupTestPaymentsResult> {
  const db = admin.firestore();
  const liveReference = args.liveReference.trim();
  if (!liveReference) {
    throw new Error("liveReference is required.");
  }

  // 1. Resolve the live payment. We look it up by `reference` field
  //    rather than by doc id because callers naturally have the
  //    reference (Paystack shows it; the ops portal table shows it),
  //    not the Firestore doc id (which equals the reference in our
  //    schema, but we don't want to bake that assumption into the
  //    operator interface).
  const liveSnap = await db
    .collection("paystackPayments")
    .where("reference", "==", liveReference)
    .limit(1)
    .get();
  if (liveSnap.empty) {
    throw new Error(`No paystackPayments doc found with reference: ${liveReference}`);
  }
  const liveDoc           = liveSnap.docs[0];
  const liveData          = liveDoc.data();
  const liveUserId        = String(liveData.userId ?? "").trim();
  const liveCreditsGranted = typeof liveData.creditsGranted === "number"
    ? liveData.creditsGranted
    : 0;

  if (!liveUserId) {
    throw new Error(`Live payment ${liveReference} has no userId on the doc; refusing to proceed.`);
  }

  // 2. Identify every paystackPayments doc that is NOT the live one.
  const allPayments = await db.collection("paystackPayments").get();
  const paymentRefsToDelete = allPayments.docs
    .filter((d) => d.id !== liveDoc.id)
    .map((d) => d.ref);

  // 3. Identify every creditTransactions doc whose `reference` field
  //    doesn't match the live reference. Non-purchase transactions
  //    (free_signup, referral, match_unlock spends, etc.) typically
  //    have no `reference` field at all — those are caught by the
  //    "!= liveReference" check too.
  const allTxs = await db.collection("creditTransactions").get();
  const txRefsToDelete = allTxs.docs
    .filter((d) => (d.data().reference ?? null) !== liveReference)
    .map((d) => d.ref);

  // 4. Snapshot every wallet so we can rewrite them in one pass.
  const allWallets = await db.collection("creditWallets").get();

  // 5. Execute. Each batch is committed independently — if a later
  //    batch fails, the earlier batches still landed. That's the
  //    correct semantics for cleanup: partial progress is better
  //    than a phantom rollback that would leave us with mixed state.
  await batchedWrite(paymentRefsToDelete, (batch, ref) => batch.delete(ref));
  await batchedWrite(txRefsToDelete,      (batch, ref) => batch.delete(ref));

  const now = admin.firestore.FieldValue.serverTimestamp();
  await batchedWrite(allWallets.docs, (batch, doc) => {
    // Non-live wallets get the signup grant back, NOT 0. Anyone who's
    // signed up is entitled to FREE_CREDITS_ON_SIGNUP; cleaning up
    // test transactions shouldn't strip that. Live payer keeps the
    // credits their real pack granted (typically far above the grant,
    // so the comparison ?? floor isn't needed — but kept defensive).
    const balance = doc.id === liveUserId
      ? Math.max(liveCreditsGranted, args.freeSignupCredits)
      : args.freeSignupCredits;
    batch.set(doc.ref, { credits: balance, updatedAt: now }, { merge: true });
  });

  // 6. Wipe product-activity collections. These are pure test usage —
  //    every doc goes. Post-cleanup the Business Report's funnel,
  //    product-usage, COGS, and Health page all read as "zero
  //    activity" until real users start interacting.
  const activityDeleted: Record<string, number> = {};
  for (const collName of ACTIVITY_COLLECTIONS) {
    const snap = await db.collection(collName).get();
    await batchedWrite(snap.docs.map((d) => d.ref), (batch, ref) => batch.delete(ref));
    activityDeleted[collName] = snap.size;
  }

  return {
    paystackPaymentsDeleted:   paymentRefsToDelete.length,
    creditTransactionsDeleted: txRefsToDelete.length,
    walletsReset:              allWallets.size,
    liveUserId,
    liveCreditsGranted,
    activityDeleted,
  };
}
