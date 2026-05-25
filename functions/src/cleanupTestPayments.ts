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
//   4. Sets every `creditWallets` balance to 0, then plants the live
//      payer's wallet with the credits the live pack actually granted.
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
//   - /users, /studentProfiles, /savedSchools, /roadmapProgress — user
//     state survives. We're cleaning revenue + credit accounting only.
//   - /matchReports, /aiRuns, /visaInterview* — product activity from
//     test mode lingers but is read-only history; doesn't pollute the
//     Payments dashboard or the audit picture.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from "firebase-admin";

export interface CleanupTestPaymentsArgs {
  liveReference: string;
}

export interface CleanupTestPaymentsResult {
  paystackPaymentsDeleted:   number;
  creditTransactionsDeleted: number;
  walletsReset:              number;
  liveUserId:                string;
  liveCreditsGranted:        number;
}

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
    const balance = doc.id === liveUserId ? liveCreditsGranted : 0;
    batch.set(doc.ref, { credits: balance, updatedAt: now }, { merge: true });
  });

  return {
    paystackPaymentsDeleted:   paymentRefsToDelete.length,
    creditTransactionsDeleted: txRefsToDelete.length,
    walletsReset:              allWallets.size,
    liveUserId,
    liveCreditsGranted,
  };
}
