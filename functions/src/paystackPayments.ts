// ─────────────────────────────────────────────────────────────────────────────
// Paystack integration — hosted checkout + signed webhook.
//
// Architecture:
//   1. Client calls `createPaystackCheckout({ packId })` → we ask Paystack
//      for a hosted-checkout `authorization_url`, return it, client redirects.
//   2. User pays on Paystack's hosted page (cards + bank transfer + mobile
//      money for supported merchant tiers).
//   3. Paystack POSTs `charge.success` (and `refund.processed` etc.) to
//      our `/paystackWebhook` endpoint.
//   4. We verify the HMAC-SHA512 signature with the secret key and atomically
//      credit the user's wallet inside a Firestore transaction.
//
// Why we don't pre-create "products" in Paystack:
//   Paystack accepts arbitrary `amount` (in the smallest currency unit) per
//   call — no product entities required. Pricing lives entirely in our
//   CREDIT_PACKS constant; Paystack just charges what we tell it.
//
// Currency:
//   Charging in GHS (Ghanaian Cedi) — the default settlement currency on
//   a Paystack-Ghana merchant account. Paystack `amount` is in pesewas
//   (1 GHS = 100 pesewas), so we multiply our cedi prices by 100 before
//   sending. If we ever need to charge in another currency (USD, NGN, ZAR…)
//   the Paystack account must have that currency enabled first — otherwise
//   `transaction/initialize` returns 403 "currency not supported".
//
// Idempotency: webhooks can fire multiple times. We dedupe on `reference`
// (the unique transaction id Paystack returns) by storing every fulfilled
// payment in `paystackPayments/{reference}` and short-circuiting if a doc
// already exists.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from "firebase-admin";
import * as crypto from "crypto";

/** Currency for all Paystack charges. GHS is the default on a Paystack-
 *  Ghana merchant account; any other currency needs to be enabled with
 *  Paystack support first or `transaction/initialize` returns 403. */
const PAYSTACK_CURRENCY = "GHS" as const;

export interface PaystackInitArgs {
  secretKey:    string;
  amountSubunit: number;   // smallest currency unit (pesewas for GHS, kobo for NGN, cents for USD)
  email:        string;
  callbackUrl:  string;
  metadata:     Record<string, unknown>;
}

export interface PaystackInitResult {
  checkoutUrl: string;
  reference:   string;
}

/**
 * Initialize a one-time transaction on Paystack and return the hosted-
 * checkout URL the browser should redirect to. The `metadata` object
 * is echoed back verbatim in the webhook event so we can match the
 * payment to a user + pack without trusting client-side state.
 */
export async function initPaystackTransaction(args: PaystackInitArgs): Promise<PaystackInitResult> {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${args.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email:        args.email,
      amount:       args.amountSubunit,
      currency:     PAYSTACK_CURRENCY,
      callback_url: args.callbackUrl,
      metadata:     args.metadata,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Paystack init failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = await res.json() as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string; access_code?: string };
  };

  if (!json.status || !json.data?.authorization_url || !json.data.reference) {
    throw new Error(`Paystack init returned no authorization_url: ${JSON.stringify(json).slice(0, 200)}`);
  }

  return {
    checkoutUrl: json.data.authorization_url,
    reference:   json.data.reference,
  };
}

/**
 * Verify a Paystack webhook signature.
 *
 * Paystack signs the raw request body with HMAC-SHA512 using the merchant's
 * secret key (same key used for API auth — Paystack does NOT use a
 * separate webhook signing secret). Header is `x-paystack-signature`.
 * Returns true if valid.
 */
export function verifyPaystackWebhook(args: {
  rawBody:    string;
  signature:  string;
  secretKey:  string;
}): boolean {
  if (!args.signature) return false;
  const expected = crypto
    .createHmac("sha512", args.secretKey)
    .update(args.rawBody)
    .digest("hex");
  // Constant-time comparison to avoid timing-attack leakage of the signature.
  const a = Buffer.from(args.signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface PaystackWebhookEvent {
  event: string;
  data: {
    id?:        number;
    reference?: string;
    status?:    string;
    amount?:    number;     // smallest currency unit (pesewas for GHS)
    currency?:  string;
    customer?:  { email?: string };
    metadata?:  Record<string, any>;
    [k: string]: any;
  };
}

/**
 * Apply a `charge.success` webhook to the user's wallet. Idempotent on the
 * `reference` field — repeat firings short-circuit and return duplicated:true.
 *
 * On the applied:true branch returns the data the caller needs to fire a
 * receipt email AFTER the transaction commits (matching the pattern
 * applyPaymentSucceeded used).
 */
export async function applyPaystackChargeSuccess(event: PaystackWebhookEvent): Promise<
  | { applied: false; duplicated?: boolean; reason?: string }
  | {
      applied:        true;
      newCredits:     number;
      customerEmail:  string | null;
      packId:         string;
      creditsGranted: number;
      priceLocal:     number;
      currency:       string;
      reference:      string;
    }
> {
  const data = event.data;
  if (!data) return { applied: false, reason: "missing data" };

  const reference = data.reference;
  if (!reference) return { applied: false, reason: "missing reference" };

  if (data.status !== "success") {
    return { applied: false, reason: `not a success status: ${data.status}` };
  }

  const md = data.metadata ?? {};
  const userId         = md.userId         as string | undefined;
  const packId         = md.packId         as string | undefined;
  const creditsToGrant = parseInt(String(md.creditsToGrant ?? "0"), 10);
  const expectedAmount = parseInt(String(md.amountSubunit ?? "0"), 10);
  const priceLocal     = parseFloat(String(md.priceLocal ?? "0"));

  if (!userId || !packId || !creditsToGrant || creditsToGrant < 0) {
    return { applied: false, reason: "missing or invalid metadata" };
  }
  if (creditsToGrant > 10_000) {
    // Defence-in-depth: real packs cap at 300.
    return { applied: false, reason: "credits exceed safety cap" };
  }
  // Refuse if Paystack charged a different amount than we asked for. We
  // allow a small downward variance (rounding / minor partial captures
  // that shouldn't happen but are defensible) — but never more than 5%
  // off, and never zero.
  if (expectedAmount > 0 && typeof data.amount === "number") {
    if (data.amount < expectedAmount * 0.95) {
      return { applied: false, reason: `paid amount ${data.amount} < expected ${expectedAmount}` };
    }
  }

  const db = admin.firestore();
  const paymentRef = db.collection("paystackPayments").doc(reference);
  const walletRef  = db.collection("creditWallets").doc(userId);
  const txRef      = db.collection("creditTransactions").doc();
  const pendingRef = db.collection("pendingReferrals").doc(userId);
  const now        = admin.firestore.FieldValue.serverTimestamp();

  // Pre-tx peek at the pending referral so we can set up the referrer's
  // wallet ref before entering the transaction (Firestore txs require all
  // reads before writes, and we don't know the referrer's uid until we
  // read the pending doc — chicken-and-egg). We re-verify the status
  // inside the tx for atomicity.
  const pendingPeek = await pendingRef.get();
  const pendingReferrerUid = pendingPeek.exists && pendingPeek.data()?.status === "pending"
    ? (pendingPeek.data()?.referrerUid as string | undefined) ?? null
    : null;
  const referrerWalletRef = pendingReferrerUid
    ? db.collection("creditWallets").doc(pendingReferrerUid)
    : null;

  return await db.runTransaction(async (tx) => {
    const existing = await tx.get(paymentRef);
    if (existing.exists) {
      return { applied: false as const, duplicated: true, reason: "already processed" };
    }

    const walletSnap = await tx.get(walletRef);

    // Re-read the pending doc atomically to confirm it's still releasable.
    // If a parallel charge already paid it out, or an admin voided it
    // between our peek and the tx, we skip the referral payout cleanly.
    let releaseReferral = false;
    let referrerCurrentCredits = 0;
    let referralRewardAmount = 0;
    if (referrerWalletRef) {
      const [pendingSnap, referrerWalletSnap] = await Promise.all([
        tx.get(pendingRef),
        tx.get(referrerWalletRef),
      ]);
      const pendingData = pendingSnap.data() ?? {};
      if (pendingSnap.exists && pendingData.status === "pending") {
        releaseReferral = true;
        referrerCurrentCredits = referrerWalletSnap.exists
          ? (referrerWalletSnap.data()?.credits ?? 0)
          : 0;
        // Snapshot the reward amount from the pending doc (not the live
        // REFERRAL_REWARD constant). If we ever change the constant,
        // already-pending referrals still pay out at the promised rate.
        referralRewardAmount = typeof pendingData.rewardAmount === "number"
          ? pendingData.rewardAmount
          : 0;
      }
    }

    const currentCredits = walletSnap.exists ? (walletSnap.data()?.credits ?? 0) : 0;
    const nextCredits    = currentCredits + creditsToGrant;

    tx.set(walletRef, { credits: nextCredits, updatedAt: now }, { merge: true });
    tx.set(paymentRef, {
      reference,
      userId,
      packId,
      creditsGranted:  creditsToGrant,
      amountSubunit:   data.amount ?? expectedAmount,
      currency:        data.currency ?? PAYSTACK_CURRENCY,
      providerStatus:  data.status ?? "success",
      provider:        "paystack",
      createdAt:       now,
    });
    tx.set(txRef, {
      userId,
      amount:    creditsToGrant,
      type:      "purchase",
      reference,
      packId,
      priceLocal,
      currency:  data.currency ?? PAYSTACK_CURRENCY,
      provider:  "paystack",
      createdAt: now,
    });

    // Referral release — credits the referrer + flips the pending doc to
    // paid_out in the same transaction as the purchase, so an outside
    // observer never sees the purchase committed without the referral
    // payout having been at least scheduled.
    if (releaseReferral && referrerWalletRef && referralRewardAmount > 0) {
      const refTxRef = db.collection("creditTransactions").doc();
      tx.set(referrerWalletRef, {
        credits:   referrerCurrentCredits + referralRewardAmount,
        updatedAt: now,
      }, { merge: true });
      tx.set(pendingRef, {
        status:                "paid_out",
        paidOutAt:             now,
        triggeringPaymentRef:  reference,
        paidOutTxRef:          refTxRef.id,
        paidOutReason:         "first_paid_purchase",
      }, { merge: true });
      tx.set(refTxRef, {
        userId:                pendingReferrerUid,
        amount:                referralRewardAmount,
        type:                  "referral_reward",
        referredUserId:        userId,
        triggeringPaymentRef:  reference,
        createdAt:             now,
      });
    }

    return {
      applied:         true as const,
      newCredits:      nextCredits,
      customerEmail:   data.customer?.email ?? null,
      packId,
      creditsGranted:  creditsToGrant,
      priceLocal,
      currency:        data.currency ?? PAYSTACK_CURRENCY,
      reference,
    };
  });
}

/**
 * Reverse a credit grant on `refund.processed` (admin refund) or
 * `charge.dispute.create` (chargeback). Idempotent via the `refundedAt`
 * marker on the original paystackPayments record. Negative wallet
 * balances are allowed (intentional anti-fraud behaviour).
 */
export async function applyPaystackRefund(event: PaystackWebhookEvent): Promise<{
  applied: boolean;
  duplicated?: boolean;
  reason?: string;
}> {
  const data = event.data;
  if (!data) return { applied: false, reason: "missing data" };

  // Paystack refund events reference the original transaction either as
  // data.transaction.reference (refund.processed) or data.reference directly
  // (some chargeback events).
  const reference =
    (data.transaction && (data.transaction as any).reference) ??
    data.reference;
  if (!reference) return { applied: false, reason: "missing reference" };

  const db = admin.firestore();
  const paymentRef = db.collection("paystackPayments").doc(reference);
  const now        = admin.firestore.FieldValue.serverTimestamp();

  return await db.runTransaction(async (tx) => {
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) {
      return { applied: false, reason: "payment not found locally" };
    }
    const payment = paymentSnap.data() ?? {};
    if (payment.refundedAt) {
      return { applied: false, duplicated: true, reason: "already refunded" };
    }
    const userId  = payment.userId  as string | undefined;
    const credits = typeof payment.creditsGranted === "number" ? payment.creditsGranted : 0;
    if (!userId || credits <= 0) {
      return { applied: false, reason: "payment missing userId/credits" };
    }

    const walletRef = db.collection("creditWallets").doc(userId);
    const txRef     = db.collection("creditTransactions").doc();

    const walletSnap = await tx.get(walletRef);
    const currentCredits = walletSnap.exists ? (walletSnap.data()?.credits ?? 0) : 0;
    const nextCredits    = currentCredits - credits;  // may go negative on purpose

    tx.set(walletRef, { credits: nextCredits, updatedAt: now }, { merge: true });
    tx.set(paymentRef, { refundedAt: now, refundedCredits: credits }, { merge: true });
    tx.set(txRef, {
      userId,
      amount:    -credits,
      type:      "refund_purchase",
      reference,
      packId:    payment.packId ?? null,
      provider:  "paystack",
      createdAt: now,
    });
    return { applied: true };
  });
}
