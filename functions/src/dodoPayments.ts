// ─────────────────────────────────────────────────────────────────────────────
// Dodo Payments integration — hosted checkout + signed webhook.
//
// Architecture:
//   1. Client calls `createDodoCheckout({ packId })` → we ask Dodo for a
//      checkout session, return the URL, client redirects there.
//   2. User pays on Dodo's hosted page.
//   3. Dodo POSTs `payment.succeeded` to our `/dodoWebhook` endpoint.
//   4. We verify the signature, look up the pack by metadata.packId, and
//      atomically increment the user's wallet inside a Firestore transaction.
//
// Why this shape:
//   - Never trust the client about price or credits. The pack catalogue
//     lives server-side in CREDIT_PACKS and is read from the function on
//     every checkout. The client just picks a packId.
//   - Idempotency: webhooks can fire multiple times. We dedupe on payment_id
//     by storing every fulfilled payment in `dodoPayments/{paymentId}` and
//     short-circuiting if it already exists.
//   - Refunds: not yet wired through; add `payment.refunded` handler when
//     refund operations open up in the Dodo dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import { Webhook } from "standardwebhooks";
import * as admin from "firebase-admin";

export interface CreditPack {
  productId:    string;
  label:        string;
  priceUsd:     number;
  credits:      number;
  recommended?: boolean;
}

export async function createDodoCheckoutSession(args: {
  apiKey:      string;
  environment: "live_mode" | "test_mode";
  pack:        CreditPack;
  packId:      string;
  userId:      string;
  userEmail:   string;
  returnUrl:   string;
  cancelUrl?:  string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const { apiKey, environment, pack, packId, userId, userEmail, returnUrl, cancelUrl } = args;

  // SDK construction is dynamic so we don't pay the Anthropic-style cold
  // import cost when this function isn't being used.
  const { default: DodoPayments } = await import("dodopayments");
  const client = new DodoPayments({ bearerToken: apiKey, environment });

  const session = await client.checkoutSessions.create({
    product_cart: [{ product_id: pack.productId, quantity: 1 }],
    customer:     { email: userEmail },
    return_url:   returnUrl,
    ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
    metadata: {
      // The webhook MUST be able to map back to "which Firebase user gets
      // how many credits". We stash both pieces in metadata so the webhook
      // never has to trust client-supplied values.
      userId,
      packId,
      creditsToGrant: String(pack.credits),
      priceUsd:       String(pack.priceUsd),
    },
  });

  // The SDK alias `session.url` covers the response field — checkout_url
  // is the canonical name in the API but the SDK exposes it as `.url` in
  // the TS types.
  const checkoutUrl = (session as any).checkout_url ?? (session as any).url ?? null;
  if (!checkoutUrl) {
    throw new Error("Dodo did not return a checkout URL");
  }
  return { checkoutUrl, sessionId: (session as any).session_id ?? "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook handling
// ─────────────────────────────────────────────────────────────────────────────

export interface DodoWebhookEvent {
  type:         string;
  timestamp:    string;
  business_id?: string;
  data?: {
    payload_type?: string;
    payment_id?:   string;
    status?:       string;
    amount?:       number;
    currency?:     string;
    customer?:     { email?: string };
    metadata?:     Record<string, string>;
    [k: string]:   any;
  };
}

/**
 * Verify a Dodo webhook signature using Standard Webhooks (Svix-compatible).
 * Throws if the signature is invalid. Returns the parsed event payload on
 * success.
 *
 * Dodo sends three headers: webhook-id, webhook-signature, webhook-timestamp.
 * The signing secret is the *webhook key* from the dashboard, NOT the API key.
 */
export function verifyDodoWebhook(args: {
  rawBody:           string;
  webhookKey:        string;
  webhookId:         string;
  webhookSignature:  string;
  webhookTimestamp:  string;
}): DodoWebhookEvent {
  const { rawBody, webhookKey, webhookId, webhookSignature, webhookTimestamp } = args;
  const wh = new Webhook(webhookKey);
  // `verify` throws WebhookVerificationError on bad sig — we don't swallow,
  // the caller catches and returns 400 to Dodo so they retry on real issues.
  const verified = wh.verify(rawBody, {
    "webhook-id":        webhookId,
    "webhook-signature": webhookSignature,
    "webhook-timestamp": webhookTimestamp,
  }) as DodoWebhookEvent;
  return verified;
}

/**
 * Apply a `payment.succeeded` webhook to the user's wallet. Idempotent —
 * if the same payment_id has already been processed, no-ops and returns
 * `{ duplicated: true }`.
 *
 * The actual user lookup comes from metadata.userId, which we set when
 * creating the checkout session. We never trust webhook-supplied email
 * for crediting (it's only used for support audit).
 */
export async function applyPaymentSucceeded(event: DodoWebhookEvent): Promise<
  | { applied: false; duplicated?: boolean; reason?: string }
  | {
      applied:        true;
      newCredits:     number;
      customerEmail:  string | null;
      packId:         string;
      creditsGranted: number;
      priceUsd:       number;
      paymentId:      string;
    }
> {
  const data = event.data;
  if (!data) return { applied: false, reason: "missing data" };

  const paymentId = data.payment_id;
  if (!paymentId) return { applied: false, reason: "missing payment_id" };

  const md = data.metadata ?? {};
  const userId        = md.userId;
  const packId        = md.packId;
  const creditsToGrant = parseInt(md.creditsToGrant ?? "0", 10);
  const priceUsd       = parseFloat(md.priceUsd ?? "0");

  if (!userId || !packId || !creditsToGrant || creditsToGrant < 0) {
    return { applied: false, reason: "missing or invalid metadata" };
  }
  if (creditsToGrant > 10_000) {
    // Defence-in-depth: if metadata is somehow tampered with, never grant
    // more than a sane ceiling. Real packs cap at 250 today.
    return { applied: false, reason: "credits exceed safety cap" };
  }

  const db = admin.firestore();
  const paymentRef = db.collection("dodoPayments").doc(paymentId);
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
      paymentId,
      userId,
      packId,
      creditsGranted: creditsToGrant,
      priceUsd,
      currency:       data.currency ?? "USD",
      providerStatus: data.status ?? "succeeded",
      provider:       "dodo",
      createdAt:      now,
    });
    tx.set(txRef, {
      userId,
      amount:    creditsToGrant,
      type:      "purchase",
      paymentId,
      packId,
      priceUsd,
      provider:  "dodo",
      createdAt: now,
    });
    // Return the data the caller needs to fire a custom receipt email
    // AFTER the transaction commits — sending email is a side effect that
    // doesn't belong inside the transaction (which can retry).
    return {
      applied:         true as const,
      newCredits:      nextCredits,
      customerEmail:   data.customer?.email ?? null,
      packId,
      creditsGranted:  creditsToGrant,
      priceUsd,
      paymentId,
    };
  });
}

/**
 * Apply a `payment.refunded` (or `dispute.created` → chargeback) webhook by
 * reversing the credit grant. Idempotent: each refund row in `dodoPayments`
 * gets a sub-doc tag (`refundedAt`) so re-firings of the same refund don't
 * double-deduct.
 *
 * Audit 2026-05-15 surfaced that we previously had no refund handler — a
 * chargeback or admin-initiated refund left the credited credits in the
 * attacker's wallet. This closes the loop.
 *
 * Negative-balance behaviour: if the user has already SPENT the credits we
 * issued, the reversal drives their wallet negative. We allow that — it's
 * better than letting fraud net out for free, and the next purchase brings
 * them back into positive territory. Honest users hitting this case can
 * contact support.
 */
export async function applyPaymentRefunded(event: DodoWebhookEvent): Promise<{
  applied: boolean;
  duplicated?: boolean;
  reason?: string;
}> {
  const data = event.data;
  if (!data) return { applied: false, reason: "missing data" };

  const paymentId = data.payment_id;
  if (!paymentId) return { applied: false, reason: "missing payment_id" };

  const db = admin.firestore();
  const paymentRef = db.collection("dodoPayments").doc(paymentId);
  const now        = admin.firestore.FieldValue.serverTimestamp();

  return await db.runTransaction(async (tx) => {
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) {
      // Refund webhook arrived for a payment we never credited — could be a
      // test event, a payment created via Dodo dashboard outside our flow,
      // or a webhook out of order. Log and ignore.
      return { applied: false, reason: "payment not found locally" };
    }
    const payment = paymentSnap.data() ?? {};
    if (payment.refundedAt) {
      return { applied: false, duplicated: true, reason: "already refunded" };
    }
    const userId = payment.userId as string | undefined;
    const credits = typeof payment.creditsGranted === "number" ? payment.creditsGranted : 0;
    if (!userId || credits <= 0) {
      return { applied: false, reason: "payment missing userId/credits" };
    }

    const walletRef = db.collection("creditWallets").doc(userId);
    const txRef     = db.collection("creditTransactions").doc();

    const walletSnap = await tx.get(walletRef);
    const currentCredits = walletSnap.exists ? (walletSnap.data()?.credits ?? 0) : 0;
    const nextCredits    = currentCredits - credits; // may go negative — intentional

    tx.set(walletRef, { credits: nextCredits, updatedAt: now }, { merge: true });
    tx.set(paymentRef, { refundedAt: now, refundedCredits: credits }, { merge: true });
    tx.set(txRef, {
      userId,
      amount:    -credits,
      type:      "refund_purchase",
      paymentId,
      packId:    payment.packId ?? null,
      priceUsd:  payment.priceUsd ?? null,
      provider:  "dodo",
      createdAt: now,
    });
    return { applied: true };
  });
}
