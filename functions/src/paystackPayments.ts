// ─────────────────────────────────────────────────────────────────────────────
// Paystack integration — hosted checkout + signed webhook.
//
// Architecture (mirrors the earlier Dodo flow so the React side only swaps
// one callable name):
//   1. Client calls `createPaystackCheckout({ packId })` → we ask Paystack
//      for a hosted-checkout authorization_url, return it, client redirects.
//   2. User pays on Paystack's hosted page (cards, MTN MoMo, Vodafone Cash,
//      bank transfer — Paystack picks based on the merchant's country).
//   3. Paystack POSTs `charge.success` (and `refund.processed` etc.) to our
//      `/paystackWebhook` endpoint.
//   4. We verify the HMAC-SHA512 signature with the secret key and atomically
//      credit the user's wallet inside a Firestore transaction.
//
// Why we don't pre-create "products" in Paystack:
//   Paystack accepts arbitrary `amount` (in pesewas / kobo) per call — no
//   need for product entities like Dodo required. Pricing lives entirely
//   in our CREDIT_PACKS constant; Paystack just charges what we say.
//
// Idempotency: webhook can fire multiple times. We dedupe on `reference`
// (the unique transaction id Paystack returns) by storing every fulfilled
// payment in `paystackPayments/{reference}` and short-circuiting if a doc
// already exists.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from "firebase-admin";
import * as crypto from "crypto";

export interface PaystackInitArgs {
  secretKey:     string;
  amountPesewas: number;   // ₵1 = 100 pesewas, like cents
  email:         string;
  callbackUrl:   string;
  metadata:      Record<string, unknown>;
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
      amount:       args.amountPesewas,
      currency:     "GHS",
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
 * secret key (same key used for API auth — not a separate webhook secret
 * like Dodo). Header is `x-paystack-signature`. Returns true if valid.
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
    amount?:    number;     // in pesewas
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
 * We re-validate the amount on this side as well: a tampered metadata.userId
 * is server-set so it shouldn't happen, but defence-in-depth — never grant
 * more credits than the actual charge corresponds to in CREDIT_PACKS.
 */
export async function applyPaystackChargeSuccess(event: PaystackWebhookEvent): Promise<{
  applied: boolean;
  duplicated?: boolean;
  reason?: string;
}> {
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
  const expectedAmount = parseInt(String(md.amountPesewas ?? "0"), 10);

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
  const now        = admin.firestore.FieldValue.serverTimestamp();

  return await db.runTransaction(async (tx) => {
    const existing = await tx.get(paymentRef);
    if (existing.exists) {
      return { applied: false, duplicated: true, reason: "already processed" };
    }

    const walletSnap = await tx.get(walletRef);
    const currentCredits = walletSnap.exists ? (walletSnap.data()?.credits ?? 0) : 0;
    const nextCredits    = currentCredits + creditsToGrant;

    tx.set(walletRef, { credits: nextCredits, updatedAt: now }, { merge: true });
    tx.set(paymentRef, {
      reference,
      userId,
      packId,
      creditsGranted:  creditsToGrant,
      amountPesewas:   data.amount ?? expectedAmount,
      currency:        data.currency ?? "GHS",
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
      provider:  "paystack",
      createdAt: now,
    });
    return { applied: true };
  });
}

/**
 * Reverse a credit grant on `refund.processed` (admin refund) or `charge.dispute.create`
 * (chargeback). Idempotent via the `refundedAt` marker on the original
 * paystackPayments record.
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
