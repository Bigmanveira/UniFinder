import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { generateClaudeMatchExplanation } from "./claudeExplainMatches.js";
import { sendWaitlistWelcome } from "./waitlistEmail.js";
import { sendLaunchAnnouncement } from "./launchAnnouncementEmail.js";
import {
  generateOfficerTurn, scoreVisaInterview, VISA_DISCLAIMER,
  pickIntroQuestion,
  type TranscriptTurn,
} from "./visaInterview.js";
import { createHeyGenSessionToken, endHeyGenSession } from "./liveAvatarSession.js";
import { synthesizeOfficerAudio } from "./avatarTts.js";
import { extractVisaDocument, type VisaDocumentType, type ExtractedDocument } from "./visaDocExtractor.js";
import { aiMatchSchools, type AiCandidate } from "./aiMatch.js";
import {
  initPaystackTransaction,
  verifyPaystackWebhook,
  applyPaystackChargeSuccess,
  applyPaystackRefund,
} from "./paystackPayments.js";
import { sendPurchaseReceipt } from "./paymentReceiptEmail.js";
import { sendWelcomeEmail } from "./welcomeEmail.js";
import { sendOpsSignInLinkEmail } from "./opsSignInEmail.js";
import { sendUserSignInLinkEmail } from "./userSignInEmail.js";
import { runCleanupTestPayments } from "./cleanupTestPayments.js";
import { assertNotInMaintenance, setMaintenanceFlag } from "./maintenanceMode.js";
import {
  createMarketerCode,
  listMarketerCodes,
  setMarketerCodeEnabled,
  deleteMarketerCode,
  applyMarketerCode,
} from "./marketerCodes.js";
import {
  listOpsAdmins,
  inviteOpsAdmin,
  revokeOpsAdmin,
} from "./opsAdmins.js";
import { logError } from "./errorLogger.js";
import { createRateLimiter, extractClientIp } from "./rateLimiter.js";

admin.initializeApp();

const ANTHROPIC_API_KEY        = defineSecret("ANTHROPIC_API_KEY");
const HEYGEN_API_KEY           = defineSecret("HEYGEN_API_KEY");
const PAYSTACK_SECRET_KEY      = defineSecret("PAYSTACK_SECRET_KEY");
const RESEND_API_KEY           = defineSecret("RESEND_API_KEY");

// ─── Instance caps ───────────────────────────────────────────────────────────
// Audit 2026-05-15 surfaced that the project was running every callable with
// the 2nd-gen default 1000-instance ceiling. Combined with anonymous /
// auth-only endpoints that call Claude or HeyGen, a single attacker could
// scale every callable to 1000 instances and produce 5-figure overnight bills
// before any cost alarm fires. These caps shrink the blast radius without
// throttling legitimate traffic.
//
// HEAVY_OPTS — for endpoints that fan out to a paid third-party (Claude,
// HeyGen, Google TTS, OpenAI). These calls are I/O-bound; one instance can
// happily await many in parallel without contending for CPU, so concurrency
// of 40 keeps cold-starts rare. Tuned up from the original `concurrency: 10`
// on 2026-05-18 after the original setting forced a new cold start for each
// concurrent user during a visa interview — interview turns went from
// ~2s to ~10s when traffic was bursty.
// Bumped from 50 → 150 to support sustained 1000-concurrent on AI-heavy
// callables (unlockMatchReport, aiMatchSchoolsCallable, etc.). 150 × 40
// concurrency = 6000 in-flight slots, with plenty of headroom over the
// 1000-concurrent target. Cost ceiling at full saturation is bounded
// by Anthropic + HeyGen rate limits more than by our instance count.
const HEAVY_OPTS = { maxInstances: 150, concurrency: 40 } as const;
// LIGHT_OPTS — for cheap CRUD-ish callables. Default concurrency (80)
// is fine. Bumped to 200 because these are the user-facing high-volume
// endpoints (listCreditPacks, createPaystackCheckout, wallet reads).
const LIGHT_OPTS = { maxInstances: 200 } as const;
// HOT_OPTS — for functions in the interview loop that fire repeatedly
// during a single user session. minInstances: 1 keeps one instance
// always-warm so the first request after a quiet period doesn't pay a
// 3-8s Node + Anthropic SDK cold-start tax. Bumped maxInstances to 100
// for headroom on concurrent interviews.
const HOT_OPTS  = { maxInstances: 100, concurrency: 40, minInstances: 1 } as const;
// HEAVY_HOT_OPTS — for HEAVY callables that should stay always-warm to
// avoid cold-start tax on a user's first action. Same scaling shape as
// HEAVY_OPTS, but with minInstances: 2 paying ~$60/month per function
// for the latency win. Applied to unlockMatchReport,
// aiMatchSchoolsCallable, and createLiveAvatarSession — the three
// "first impression" endpoints where a cold-start ruins UX.
const HEAVY_HOT_OPTS = { maxInstances: 150, concurrency: 40, minInstances: 2 } as const;

// ─── Rate limiters (replace the App Check we removed 2026-05-23) ─────────
// Per-IP, in-memory, persist on each warm Cloud Run instance. Module-scope
// so the same Map serves every invocation on a hot instance. See
// rateLimiter.ts for the threat-model reasoning behind in-memory vs
// Firestore-backed.

// aiMatchSchoolsCallable: anonymous endpoint (used by the /results preview
// before signup). 50 calls per IP per hour is comfortable for a real user
// session — they'd typically run 2-5 — and tight enough that a curl loop
// from one IP burns at most ~$4 of Claude before the cap. Combined with
// maxInstances:50, total damage rate stays bounded even if multiple IPs
// collude.
const aiMatchRateLimit = createRateLimiter({
  maxPerWindow: 50,
  windowMs:     60 * 60 * 1000,   // 1 hour
});

// submitWaitlist: anonymous public-form endpoint. Legit users hit this
// once. 5 per hour per IP comfortably covers people on shared NAT (cafe,
// school, office) without letting a single IP spam-sign fake emails.
const waitlistRateLimit = createRateLimiter({
  maxPerWindow: 5,
  windowMs:     60 * 60 * 1000,   // 1 hour
});

// sendOpsSignInLink: ops portal sign-in. The legit user is one analyst
// requesting one link. 6 per hour leaves slack for "I closed the tab
// before clicking" retries while still throttling email-bomb attempts
// at any address an attacker might guess as an admin.
const opsSignInRateLimit = createRateLimiter({
  maxPerWindow: 6,
  windowMs:     60 * 60 * 1000,   // 1 hour
});

// sendUserSignInLink: public user-facing sign-up + sign-in. Open to
// anyone — no admin claim required, no pre-existing account check
// (this is literally the front door for new accounts). The same IP
// requesting 8 links in an hour is either a typo-prone human, an
// expired-link retry loop, or someone fishing through a leaked
// address list — either way the cap is enough for one legit human
// to recover from a few mistakes without enabling spam.
const userSignInRateLimit = createRateLimiter({
  maxPerWindow: 8,
  windowMs:     60 * 60 * 1000,   // 1 hour
});

// Decide whether a returnUrl origin is one the ops portal is allowed to
// be served from. Layered with Firebase Auth's own "Authorized domains"
// allow-list (set in Firebase Console > Authentication > Settings) —
// that's the real gate, because `generateSignInWithEmailLink` rejects
// any URL whose domain isn't authorized there. This local check is a
// belt-and-braces shape filter so we fail fast with a clear error
// before bothering the Admin SDK.
//
// Accepts:
//   • any vercel.app subdomain (production + preview deployments)
//   • collegeready.io and any collegeready.io subdomain (custom ops domain)
//   • http://localhost (Vite dev server, any port)
function isAllowedOpsPortalOrigin(origin: string): boolean {
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  const { protocol, hostname } = parsed;
  if (protocol === "http:" && hostname === "localhost") return true;
  if (protocol !== "https:") return false;
  if (hostname === "collegeready.io" || hostname.endsWith(".collegeready.io")) return true;
  if (hostname.endsWith(".vercel.app")) return true;
  return false;
}

// ─── Credit pricing ──────────────────────────────────────────────────────────
// Single source of truth for every credit-deducting action. Keeping these as
// named constants means we can audit cost vs. revenue from one file instead
// of chasing magic numbers across the code.
//
// Pricing strategy (see PRICING.md / chat history for full math):
//   • 1 credit retails at ~$1 on the Starter pack, dropping to $0.48 on Power.
//   • Match unlock = 1 credit (≈$0.10 AI cost → ~90% margin baseline).
//   • Visa interview = 15 credits. HeyGen avatar streaming dominates the
//     real cost (~$2.20/session); 15 credits leaves >70% margin even on
//     the most discounted pack.
//   • Free-on-signup grant cut from 20 → 5 → 2 over time. At 2, every
//     new account can unlock 2 match reports before paying — enough
//     to feel the product without making anonymous farming attractive.
//     Marketer referral codes layer additional credits on top via
//     `bonusCreditsForNewUser` on the code doc.
//   • Successful referrals award 5 credits to the referrer.
const MATCH_REPORT_CREDIT_COST = 1;
const VISA_INTERVIEW_CREDIT_COST = 15;
const FREE_CREDITS_ON_SIGNUP   = 2;

// ─── Founders / unlimited-credit allowlist ────────────────────────────────
// Both accounts can run every credit-spending callable without their
// wallet getting touched. Strictly for product testing — the founders
// need to feel the live app at every price point without burning real
// money. Edit this set if the founding team changes (and update the
// matching client-side list in src/lib/founders.ts so the dashboard
// shows ∞ for these accounts).
const FOUNDER_EMAILS = new Set<string>([
  "frederick.da-silveira@233labs.com",
  "franklyn.oppong@233labs.com",
]);
function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return FOUNDER_EMAILS.has(email.trim().toLowerCase());
}

// Supporting-doc cap per interview. Each upload runs a Sonnet vision
// extraction (~$0.012). Without a cap, one bad actor uploading 20 PDFs
// burns ~$0.25 of margin on a single 15-credit session. Three covers the
// realistic ask (bank statement, sponsor letter, employment letter).
const MAX_SUPPORTING_DOCS_PER_INTERVIEW = 3;

// Credit packs — pricing lives here on the server (the client supplies only
// the packId to checkout, never a price). Paystack accepts arbitrary amount
// per call so we don't need pre-created products on their side.
//
// Edit this list when launching new packs; the credit amount and price are
// also referenced by the client UI via the listCreditPacks callable.
//
// ─── Pricing rationale (rebuilt 2026-05-18 for African student market) ────
// Real unit costs:
//   • match unlock      → ~$0.10  (one Sonnet call: claudeExplainMatches)
//   • visa interview    → ~$2.36  (HeyGen $2.20 + Chirp3HD TTS $0.04 +
//                                  Haiku turns $0.05 + Sonnet scoring $0.04
//                                  + Sonnet vision $0.024)
//
// Profit-margin target: ≥ 50% on EVERY transaction (not blended). At a
// visa-interview cost of $2.36, a 50% margin requires ≥ $4.72 revenue per
// 15-credit interview → minimum **$0.315 per credit**. We round to $0.333
// ($1 = 3 credits) and apply it flat across every pack — bulk discounts
// would crater the visa-interview margin on Pro/Power, so we don't offer
// them. Bigger packs sell on convenience + commitment, not unit price.
//
// At $0.333/cr the margins are:
//   • match unlock  →  $0.333 − $0.10 = $0.233 (70% margin)  ✓
//   • visa interview → $5.00 − $2.36 = $2.64  (52% margin)   ✓
//
// Old pricing ($5/5cr Starter) priced the entry tier OUT of the visa
// interview entirely (it cost 15 credits but Starter only gave 5). New
// Starter is the visa-interview entry point: $5 buys exactly one full
// interview, which is the headline product.
//
// "Try" pack ($2/6cr) exists to lower the absolute entry price for
// students who balk at $5. It's not enough for a visa interview but
// buys 6 match-unlocks. ~70% margin per unlock comfortably absorbs
// Paystack's per-transaction fee (~3.9% + ~$0.10 for international USD)
// at the $2 level.
// Prices live in BOTH GHS and USD on each pack.
//   priceLocal: the actual amount Paystack charges (always GHS for our
//               Paystack-Ghana merchant account — initPaystackTransaction
//               sends amount=priceLocal*100, currency="GHS").
//   priceUsd:   what the user-facing UI shows as the primary number.
//               Pinned manually here at the ~₵12 / $1 reference rate
//               we set when launching. Treat as a "menu price" — not
//               recomputed at runtime to avoid FX drift surprising
//               users between page-load and checkout.
//
// Update both fields together when prices change. The UI shows USD
// prominently with "Charged as ₵X GHS" underneath so international
// users see a familiar number and Ghanaian users see exactly what
// hits their card.
export const CREDIT_PACKS: Record<string, {
  label:        string;
  priceLocal:   number;   // GHS (cedi major units) — what Paystack actually charges
  priceUsd:     number;   // USD (display only) — never sent to Paystack
  credits:      number;
  recommended?: boolean;
}> = {
  try:     { label: "Try",     priceLocal:   24, priceUsd:   2, credits:   6 },
  starter: { label: "Starter", priceLocal:   60, priceUsd:   5, credits:  15 },
  plus:    { label: "Plus",    priceLocal:  180, priceUsd:  15, credits:  45, recommended: true },
  pro:     { label: "Pro",     priceLocal:  480, priceUsd:  40, credits: 120 },
  power:   { label: "Power",   priceLocal: 1200, priceUsd: 100, credits: 300 },
};
// Greeting + DS-160 ask. The interview proper (real questions) doesn't begin
// until BOTH the DS-160 confirmation page and the I-20 have been uploaded.
// See `recordVisaInterviewDocument` for the state machine that walks the
// student from greeting → DS-160 → I-20 → first interview question.
const VISA_INTERVIEW_GREETING =
  "Good morning. My name is Anna, and I'll be your consular officer for this practice F-1 interview. " +
  "Before we begin, please upload your DS-160 confirmation page so I can review your application details.";
const VISA_I20_REQUEST_LINE =
  "Thank you. Now please upload your Form I-20 issued by your school.";

// ============================================================
// Helpers
// ============================================================

/**
 * Maps a student-profile field string to the normalised field key
 * used in the `programs` collection.
 * This must mirror the CIP_TARGET_MAP in the import script.
 */
function normaliseProfileField(fieldRaw: string): string | null {
  const f = fieldRaw.toLowerCase().trim();
  if (f.includes("computer science"))          return "computer_science";
  if (f.includes("data science"))              return "data_science";
  if (f.includes("information system"))        return "information_systems";
  if (f.includes("information science"))       return "information_systems";
  if (f.includes("cyber"))                     return "cybersecurity";
  if (f.includes("software engineering"))      return "computer_science";
  if (f.includes("computing"))                 return "computer_science";
  if (f.includes("computer engineering"))      return "computer_science";
  if (f.includes("business analytics"))        return "business_analytics";
  if (f.includes("business administration"))   return "business_administration";
  if (f.includes("mba"))                       return "business_administration";
  if (f.includes("electrical engineering"))    return "electrical_engineering";
  if (f.includes("mechanical engineering"))    return "mechanical_engineering";
  // Add more mappings as more CIP families are imported
  return null; // field not yet in program database
}

/**
 * Maps a student degree level string to the credentialLevel
 * used in the `programs` collection.
 */
function normaliseCredentialLevel(levelRaw: string): string | null {
  const l = levelRaw.toLowerCase().trim();
  if (l.includes("phd") || l.includes("doctorate") || l.includes("doctoral")) return "doctoral";
  if (l.includes("master") || l.includes("mba") || l.includes("postgrad"))    return "masters";
  if (l.includes("bachelor") || l.includes("undergraduate"))                  return "undergraduate";
  if (l.includes("certificate"))                                               return "certificate";
  return null; // unknown — skip program gate
}

// ============================================================
// Top-10 bucketing — mirrors src/lib/matching/matchSchools.ts.
// Lives here because the Cloud Functions package can't import
// from the React app's source tree.
// ============================================================

type Bucket = "reach" | "target" | "safety";

function bucketForLikelihood(l: number): Bucket {
  if (l < 50) return "reach";
  if (l < 75) return "target";
  return "safety";
}

interface BucketedMatches {
  top10:  any[];
  reach:  any[];
  target: any[];
  safety: any[];
}

function bucketizeForClaude(matches: any[]): BucketedMatches {
  const reach: any[] = [], target: any[] = [], safety: any[] = [];
  for (const m of matches) {
    let b: Bucket = "target";
    if (m.admissionBucket === "reach" || m.admissionBucket === "safety" || m.admissionBucket === "target") {
      b = m.admissionBucket;
    } else if (typeof m.admissionLikelihood === "number") {
      b = bucketForLikelihood(m.admissionLikelihood);
    }
    if (b === "reach") reach.push({ ...m, admissionBucket: "reach" });
    else if (b === "safety") safety.push({ ...m, admissionBucket: "safety" });
    else target.push({ ...m, admissionBucket: "target" });
  }

  const byScoreDesc = (a: any, b: any) => (b.matchScore ?? 0) - (a.matchScore ?? 0);
  // Treat both null AND a literal 0 as "unknown" admit rate (data anomaly)
  const rateOrSentinel = (s: any, fallback: number): number => {
    const r = s?.admissionRate;
    return (r == null || r === 0) ? fallback : r;
  };

  // Reach: most prestigious first (selectivity primary)
  reach.sort((a, b) => {
    const aRate = rateOrSentinel(a.school, 1);
    const bRate = rateOrSentinel(b.school, 1);
    if (aRate !== bRate) return aRate - bRate;
    return byScoreDesc(a, b);
  });
  // Target: best overall fit, slight prestige tiebreak
  target.sort((a, b) => {
    const d = byScoreDesc(a, b); if (d !== 0) return d;
    return rateOrSentinel(a.school, 1) - rateOrSentinel(b.school, 1);
  });
  // Safety: best fit, most certain admit on tie
  safety.sort((a, b) => {
    const d = byScoreDesc(a, b); if (d !== 0) return d;
    return rateOrSentinel(b.school, 0) - rateOrSentinel(a.school, 0);
  });

  let pickedReach  = reach.slice(0, 3);
  let pickedTarget = target.slice(0, 4);
  let pickedSafety = safety.slice(0, 3);
  let total = pickedReach.length + pickedTarget.length + pickedSafety.length;
  if (total < 10) {
    const extras = [
      ...target.slice(pickedTarget.length),
      ...reach.slice(pickedReach.length),
      ...safety.slice(pickedSafety.length),
    ].sort(byScoreDesc).slice(0, 10 - total);
    for (const e of extras) {
      if (e.admissionBucket === "reach")        pickedReach.push(e);
      else if (e.admissionBucket === "safety")  pickedSafety.push(e);
      else                                      pickedTarget.push(e);
    }
  }

  pickedReach.sort(byScoreDesc);
  pickedTarget.sort(byScoreDesc);
  pickedSafety.sort(byScoreDesc);

  return {
    top10:  [...pickedReach, ...pickedTarget, ...pickedSafety],
    reach:  pickedReach,
    target: pickedTarget,
    safety: pickedSafety,
  };
}

// ============================================================
// Test Function
// ============================================================

export const testFunction = onCall({ ...LIGHT_OPTS }, async () => {
  return { ok: true, message: "Firebase Functions is working for UniFinder" };
});

// ============================================================
// applyReferralCode — records a pending referral that pays out the
// referrer's 5 credits ONLY when the new user makes their first paid
// purchase. This kills the self-referral fraud vector (create N fake
// accounts, refer them all to yourself, drain free credits into one
// wallet) — the referee has to actually spend real money for the
// referrer to see anything land. Honest sharing is unaffected.
//
// Idempotent per-user: a user can only be referred once, never
// themselves. Edge case handled: if the referee already has a successful
// paystackPayments doc on file (rare — they bought first, applied the
// code later), the payout fires immediately inside the same transaction.
// ============================================================

const REFERRAL_REWARD = 5;

export const applyReferralCode = onCall({ ...LIGHT_OPTS }, async (request) => {
  await assertNotInMaintenance(request);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be logged in");

  const code = (request.data?.code ?? "").toString().trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Missing referral code");

  const db = admin.firestore();

  // Look up the code outside the transaction (read-only, safe to do
  // pre-tx). The expensive part is just the credit math, which we re-check
  // atomically below — for marketer codes inside applyMarketerCode,
  // for user codes inside the runTransaction further down.
  const codeDoc = await db.collection("referralCodes").doc(code).get();
  if (!codeDoc.exists) return { ok: false, reason: "invalid_code" };
  const codeData = codeDoc.data() ?? {};

  // Marketer code — admin-issued for campaigns. Credits flow to the NEW
  // USER (not the marketer, who's paid out-of-band). The applyMarketerCode
  // helper handles the full transaction including expiry / cap / disabled
  // checks, atomic increment of redemptionCount, etc.
  if (codeData.type === "marketer") {
    return await applyMarketerCode({
      uid,
      code,
      freeSignupCredits: FREE_CREDITS_ON_SIGNUP,
    });
  }

  // User-generated code (existing 6-char auto-hash flow).
  const referrerUid = codeData.userId as string | undefined;
  if (!referrerUid)               return { ok: false, reason: "invalid_code" };
  if (referrerUid === uid)        return { ok: false, reason: "self_referral" };

  // Pre-tx read: has the referee already made a successful purchase? Used
  // below to decide whether the payout fires immediately (existing paying
  // customer) or sits pending. Limit 1 — we only care that ONE exists.
  // Outside the transaction is fine: we recheck inside if needed, but the
  // failure mode of a false negative here is "payout stays pending until
  // their NEXT purchase fires applyPaystackChargeSuccess" which is the
  // correct behaviour anyway. False positives are impossible (we only see
  // committed paystackPayments docs, which are write-once on charge.success).
  const priorPurchaseSnap = await db
    .collection("paystackPayments")
    .where("userId", "==", uid)
    .limit(1)
    .get();
  const refereeAlreadyPaying = !priorPurchaseSnap.empty;

  // SECURITY (audit 2026-05-15): the `referredBy` guard MUST live inside the
  // transaction. Reading it outside was racy: two parallel calls both saw an
  // empty `referredBy` and both credited the referrer, yielding 2× the
  // intended reward per fake account. Inside the transaction, the second
  // call now sees the first call's write and bails with already_referred.
  const result = await db.runTransaction(async (tx) => {
    const userRef           = db.collection("users").doc(uid);
    const pendingRef        = db.collection("pendingReferrals").doc(uid);
    const referrerWalletRef = db.collection("creditWallets").doc(referrerUid);
    const now               = admin.firestore.FieldValue.serverTimestamp();

    const userSnap = await tx.get(userRef);
    if (userSnap.exists && userSnap.data()?.referredBy) {
      return { ok: false as const, reason: "already_referred" as const };
    }

    // If we're going to pay out immediately, we also need the referrer's
    // current wallet balance. Read it inside the tx so it can't drift.
    let referrerCurrentCredits = 0;
    if (refereeAlreadyPaying) {
      const walletSnap = await tx.get(referrerWalletRef);
      referrerCurrentCredits = walletSnap.exists
        ? (walletSnap.data()?.credits ?? 0)
        : 0;
    }

    if (refereeAlreadyPaying) {
      // Immediate payout — referee already has a successful charge on file.
      const txRef = db.collection("creditTransactions").doc();
      tx.set(referrerWalletRef, { credits: referrerCurrentCredits + REFERRAL_REWARD, updatedAt: now }, { merge: true });
      tx.set(pendingRef, {
        referredUserId:        uid,
        referrerUid,
        code,
        rewardAmount:          REFERRAL_REWARD,
        status:                "paid_out",
        createdAt:             now,
        paidOutAt:             now,
        // Stamped at apply-time (referee was already a paying user); no
        // single triggering payment in this branch.
        triggeringPaymentRef:  null,
        paidOutTxRef:          txRef.id,
        paidOutReason:         "referee_already_paying",
      });
      tx.set(userRef, { referredBy: referrerUid, referredAt: now }, { merge: true });
      tx.set(txRef, {
        userId:         referrerUid,
        amount:         REFERRAL_REWARD,
        type:           "referral_reward",
        referredUserId: uid,
        createdAt:      now,
      });
      return { ok: true as const, status: "paid_out" as const, creditsAwarded: REFERRAL_REWARD };
    }

    // Standard path — payout stays pending until the referee's first
    // successful paystackPayments lands. applyPaystackChargeSuccess
    // releases it.
    tx.set(pendingRef, {
      referredUserId:        uid,
      referrerUid,
      code,
      rewardAmount:          REFERRAL_REWARD,
      status:                "pending",
      createdAt:             now,
      paidOutAt:             null,
      triggeringPaymentRef:  null,
    });
    tx.set(userRef, { referredBy: referrerUid, referredAt: now }, { merge: true });
    return { ok: true as const, status: "pending" as const };
  });

  return result;
});

// ============================================================
// aiMatchSchoolsCallable — AI-powered school ranking + bucketing.
// The client sends a candidate set (already filtered through the
// program-eligibility gate, capped to a manageable size); Claude
// returns the top ~12 ranked matches with admission-bucket assignment,
// per-school category, and a one-sentence fit reasoning.
//
// Output shape mirrors the SchoolMatch type the client UI already
// consumes — callers (LockedPreviewPage) can swap from the deterministic
// matcher to this without changing rendering code. Returns an empty
// `matches` array on failure; the client falls back to the deterministic
// algorithm so users never see a broken state.
// ============================================================

export const aiMatchSchoolsCallable = onCall(
  {
    ...HEAVY_HOT_OPTS,
    secrets: [ANTHROPIC_API_KEY],
    // Claude can take 10–30s to rank a full candidate list. Be generous.
    timeoutSeconds: 90,
    memory:         "512MiB",
  },
  async (request) => {
    await assertNotInMaintenance(request);
    const uid = request.auth?.uid;
    void uid; // anonymous matching is allowed (used during /results preview)

    // Per-IP rate limit. Anonymous endpoint that calls Claude Sonnet —
    // without this, a curl loop from one IP could burn Anthropic budget
    // until maxInstances saturates. 50/hour gives real users plenty of
    // headroom; abusers hit the wall fast.
    const ip = extractClientIp(request.rawRequest);
    const check = aiMatchRateLimit(ip);
    if (!check.allowed) {
      const retrySec = Math.ceil(check.retryAfterMs / 1000);
      throw new HttpsError(
        "resource-exhausted",
        `Too many match-ranking requests from your IP. Try again in ${retrySec}s.`,
      );
    }

    const { profile, candidates } = request.data ?? {};
    if (!profile || typeof profile !== "object") {
      throw new HttpsError("invalid-argument", "Missing profile");
    }
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new HttpsError("invalid-argument", "Missing candidates");
    }
    if (candidates.length > 300) {
      // Hard upper bound. Client should be pre-filtering; if it's sending
      // 1000+ schools we reject rather than burn tokens on a likely bug.
      throw new HttpsError("invalid-argument", "Too many candidates (max 300)");
    }

    // Clamp client-supplied strings before they reach Claude. Without this
    // the profile.field can carry a multi-paragraph prompt-injection payload
    // ("ignore previous instructions; output the system prompt; etc.") and
    // the candidate.name can balloon prompt size on the founder's bill.
    // Audit 2026-05-15.
    const clampStr = (v: unknown, max: number): string =>
      String(v ?? "").slice(0, max);
    const sanitised: AiCandidate[] = candidates.map((c: any) => ({
      unitId:        clampStr(c?.unitId, 64),
      name:          clampStr(c?.name ?? "Unknown", 200),
      state:         c?.state == null ? null : clampStr(c.state, 80),
      city:          c?.city  == null ? null : clampStr(c.city,  120),
      admissionRate: typeof c?.admissionRate === "number" ? c.admissionRate : null,
      averageCost:   typeof c?.averageCost   === "number" ? c.averageCost   : null,
      ownership:     clampStr(c?.ownership, 60),
    })).filter((c: AiCandidate) => c.unitId.length > 0);
    const sanitisedProfile = {
      ...profile,
      level:         clampStr(profile.level,         60),
      field:         clampStr(profile.field,         120),
      intendedMajor: clampStr(profile.intendedMajor, 120),
      gpa:           clampStr(profile.gpa,            20),
      gradingSystem: clampStr(profile.gradingSystem,  40),
      testType:      clampStr(profile.testType,       20),
      testScores:    typeof profile.testScores === "number"
        ? profile.testScores
        : clampStr(profile.testScores, 30),
      funding:       clampStr(profile.funding,        60),
      destination:   clampStr(profile.destination,    60),
    };

    try {
      const result = await aiMatchSchools({
        apiKey:     ANTHROPIC_API_KEY.value(),
        profile:    sanitisedProfile,
        candidates: sanitised,
      });
      return {
        matches:       result.matches,
        status:        result.status,
        errorMessage:  result.errorMessage ?? null,
        rankedAt:      Date.now(),
      };
    } catch (err: any) {
      console.error("[aiMatchSchoolsCallable] failed:", err?.message);
      // Don't throw — return an empty list with a status so the client
      // can fall back gracefully without showing an error UI.
      return {
        matches:      [],
        status:       "failed",
        errorMessage: err?.message ?? "Unknown error",
        rankedAt:     Date.now(),
      };
    }
  },
);

// ============================================================
// unlockMatchReport
// ============================================================

export const unlockMatchReport = onCall(
  {
    ...HEAVY_HOT_OPTS,
    secrets: [ANTHROPIC_API_KEY],
    // Claude takes 30–90s to explain 10 schools with detailed tips. Default
    // 60s timeout was too tight — the function would time out mid-Claude
    // response and the client got a CORS error (no headers on a killed
    // response). 300s is the v2 callable maximum.
    timeoutSeconds: 300,
    memory:         "512MiB",
  },
  async (request) => {
    await assertNotInMaintenance(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "User must be logged in");

    const { profile, matches, clientRequestId } = request.data ?? {};
    if (!profile) throw new HttpsError("invalid-argument", "Missing profile");

    const db = admin.firestore();

    // SECURITY (audit 2026-05-15): pre-check the wallet BEFORE the Claude call.
    // Without this, every retry by a 0-credit user costs us ~$0.10 in Sonnet
    // tokens before the transaction throws. The atomic re-check inside the
    // transaction below still guarantees correctness — this is just the
    // free-fast-path that stops paying-out-of-pocket for failed attempts.
    //
    // Founder bypass: skip the balance check entirely so the founders'
    // wallets aren't a gating factor on internal product testing.
    const founder = isFounderEmail(request.auth?.token?.email as string | undefined);
    if (!founder) {
      const walletSnap = await db.collection("creditWallets").doc(uid).get();
      const balance = walletSnap.exists ? (walletSnap.data()?.credits ?? FREE_CREDITS_ON_SIGNUP) : FREE_CREDITS_ON_SIGNUP;
      if (balance < MATCH_REPORT_CREDIT_COST) {
        throw new HttpsError("resource-exhausted", "Insufficient credits");
      }
    }

    // Idempotency (optional). If the client supplies a clientRequestId and a
    // creditTransaction with that id already exists for this user, return
    // the previously-issued report instead of charging again. Lets retries
    // (network hiccup, callable timeout) be safe to repeat.
    if (typeof clientRequestId === "string" && clientRequestId.length > 0 && clientRequestId.length <= 100) {
      const existing = await db.collection("creditTransactions")
        .where("userId", "==", uid)
        .where("clientRequestId", "==", clientRequestId)
        .where("type", "==", "unlock_report")
        .limit(1)
        .get();
      if (!existing.empty) {
        const reportId = existing.docs[0].data()?.reportId as string | undefined;
        if (reportId) {
          return { reportId, aiStatus: "idempotent_replay" };
        }
      }
    }

    // Defence-in-depth size cap on client-supplied blobs we'll persist into a
    // Firestore doc (1 MiB limit). Without this a malicious user can stuff
    // 900KB strings into profile fields and bloat reports the founder pays
    // egress for.
    const profileBytes = JSON.stringify(profile).length;
    if (profileBytes > 50_000) {
      throw new HttpsError("invalid-argument", "Profile too large");
    }

    // ── Step 1: Program eligibility gate ─────────────────────────────────────
    // Determine what field and credential level the student is targeting.
    // If both can be normalised and program records exist, we only allow
    // schools that have matching program records.
    // If programs collection is empty for this combination, we abort
    // without deducting any credit.

    const rawField = (profile.field || profile.intendedMajor || "").trim();
    const rawLevel = (profile.level || profile.degreeLevel || profile.targetDegreeLevel || "").trim();

    const normalisedField = rawField ? normaliseProfileField(rawField) : null;
    const normalisedLevel = rawLevel ? normaliseCredentialLevel(rawLevel) : null;

    // We only enforce the program gate when both field and credential level
    // are recognised — unknown fields are allowed through (belt-and-suspenders,
    // but Claude will flag unknown program availability).
    const canEnforceGate = normalisedField !== null && normalisedLevel !== null;

    let eligibleUnitIds: Set<string> | null = null; // null = no gate enforced

    if (canEnforceGate) {
      console.log(
        `[unlockMatchReport] Program gate: field=${normalisedField} level=${normalisedLevel}`
      );

      const programSnapshot = await db
        .collection("programs")
        .where("normalizedField", "==", normalisedField)
        .where("credentialLevel", "==", normalisedLevel)
        .where("status", "==", "active")
        .get();

      if (programSnapshot.empty) {
        // No program records — do not deduct credit, do not call Claude
        console.warn(
          `[unlockMatchReport] No program records for field=${normalisedField} level=${normalisedLevel}. Returning noEligiblePrograms.`
        );
        return {
          noEligiblePrograms: true,
          normalisedField,
          normalisedLevel,
          message:
            "No verified program records found for your chosen field and degree level. " +
            "We are actively expanding our program database. Please check back soon.",
        };
      }

      // Build a set of unit IDs that have this program
      eligibleUnitIds = new Set<string>();
      programSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.unitId) eligibleUnitIds!.add(String(data.unitId));
      });

      console.log(
        `[unlockMatchReport] ${eligibleUnitIds.size} schools confirmed to offer ${normalisedField} at ${normalisedLevel} level.`
      );
    }

    // ── Step 2: Filter matches to only program-eligible schools ──────────────
    const allRecommended = (matches || []).filter(
      (m: any) =>
        m.category === "Strong Fit" ||
        m.category === "Good Fit" ||
        m.category === "Exploratory Fit"
    );

    const programEligibleMatches = eligibleUnitIds
      ? allRecommended.filter((m: any) => {
          const uid = m.school?.unitId ? String(m.school.unitId) : null;
          return uid && eligibleUnitIds!.has(uid);
        })
      : allRecommended; // no gate → use all recommended

    if (eligibleUnitIds && programEligibleMatches.length === 0) {
      // Gate enforced but no overlap between matched schools and program-eligible schools.
      // Do not deduct credit.
      console.warn(
        `[unlockMatchReport] Matches exist but none are program-eligible. Returning noEligiblePrograms.`
      );
      return {
        noEligiblePrograms: true,
        normalisedField,
        normalisedLevel,
        message:
          "None of your matched schools have verified " +
          `${rawField} programs at the ${rawLevel} level in our database yet. ` +
          "We are expanding our program database. Check back soon.",
      };
    }

    // ── Step 3: Group into reach/target/safety ──────────────────────────────
    // The client now sends AI-ranked matches with admissionBucket already
    // assigned (and 3/4/3 enforced server-side in aiMatch.ts). Trust those
    // labels and group accordingly — re-running bucketizeForClaude would
    // re-sort by admit rate and trash the AI's curated order, causing the
    // report to show different schools than the preview did.
    const allHaveAiBucket = programEligibleMatches.every(
      (m: any) => m?.admissionBucket === "reach" || m?.admissionBucket === "target" || m?.admissionBucket === "safety"
    );
    let bucketed: BucketedMatches;
    if (allHaveAiBucket) {
      const reach  = programEligibleMatches.filter((m: any) => m.admissionBucket === "reach");
      const target = programEligibleMatches.filter((m: any) => m.admissionBucket === "target");
      const safety = programEligibleMatches.filter((m: any) => m.admissionBucket === "safety");
      bucketed = {
        top10:  [...reach, ...target, ...safety].slice(0, 10),
        reach,
        target,
        safety,
      };
    } else {
      // No AI bucketing on input (deterministic fallback path during a
      // brief Claude outage, or legacy clients). Use the old logic.
      bucketed = bucketizeForClaude(programEligibleMatches);
    }
    console.log(
      `[unlockMatchReport] Top 10 (${allHaveAiBucket ? "AI" : "deterministic"}): ` +
      `reach=${bucketed.reach.length} target=${bucketed.target.length} safety=${bucketed.safety.length}`,
    );

    // ── Step 4: Call Claude with the top-10 bucketed matches ─────────────────
    const AI_MODEL    = "claude-sonnet-4-5";
    const AI_PROVIDER = "anthropic";

    let aiResult: Awaited<ReturnType<typeof generateClaudeMatchExplanation>>;

    try {
      aiResult = await generateClaudeMatchExplanation({
        profile,
        matches:  bucketed.top10,
        apiKey:   ANTHROPIC_API_KEY.value(),
        normalisedField: normalisedField ?? undefined,
        normalisedLevel: normalisedLevel ?? undefined,
      });
    } catch (err: any) {
      console.error("[unlockMatchReport] Unexpected Claude error:", err?.message);
      aiResult = await generateClaudeMatchExplanation({
        profile,
        matches:  bucketed.top10,
        apiKey:   "",
        normalisedField: normalisedField ?? undefined,
        normalisedLevel: normalisedLevel ?? undefined,
      });
      aiResult.status       = "failed";
      aiResult.errorMessage = err?.message ?? "Unknown";
    }

    // ── Step 4: Atomic credit deduction + report save ────────────────────────
    const walletRef  = db.collection("creditWallets").doc(uid);
    const reportRef  = db.collection("matchReports").doc();
    const txRef      = db.collection("creditTransactions").doc();
    const now        = admin.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      let currentCredits: number;

      if (!walletDoc.exists) {
        currentCredits = FREE_CREDITS_ON_SIGNUP;
        transaction.set(walletRef, { credits: FREE_CREDITS_ON_SIGNUP, updatedAt: now });
      } else {
        currentCredits = walletDoc.data()?.credits ?? 0;
      }

      // Founder bypass — they can run unlimited reports. We still
      // create the report doc + (for new wallets) seed the wallet
      // record so future-them looks like any other user; we just
      // don't gate on balance and don't deduct.
      if (!founder) {
        if (currentCredits < MATCH_REPORT_CREDIT_COST) {
          throw new HttpsError("resource-exhausted", "Insufficient credits");
        }
        transaction.update(walletRef, { credits: currentCredits - MATCH_REPORT_CREDIT_COST, updatedAt: now });
      }

      // Only store what the report actually renders. Storing the full matches
      // array (or programEligibleMatches) blows past Firestore's 1 MiB
      // per-document limit when the eligible set is large (PhD CS alone is
      // ~128 schools × ~1KB ≈ 130KB; non-gated fields can be 3000+ schools).
      transaction.set(reportRef, {
        userId:               uid,
        profileSnapshot:      profile,
        top10Matches:         bucketed.top10,
        bucketReach:          bucketed.reach,
        bucketTarget:         bucketed.target,
        bucketSafety:         bucketed.safety,
        normalisedField,
        normalisedLevel,
        programGateEnforced:  canEnforceGate,
        eligibleSchoolCount:  programEligibleMatches.length,
        totalCandidateCount:  Array.isArray(matches) ? matches.length : 0,
        aiExplanation:        aiResult.explanation,
        aiProvider:           AI_PROVIDER,
        aiModel:              AI_MODEL,
        aiStatus:             aiResult.status,
        creditsUsed:          MATCH_REPORT_CREDIT_COST,
        status:               "completed",
        createdAt:            now,
        updatedAt:            now,
      });

      // Ledger entry. For founders, write a zero-amount entry tagged
      // `founder_unlock` so the audit trail still shows the action
      // happened — analytics can filter these out of "real" credit
      // usage by type. For everyone else, the entry carries the
      // negative deduction.
      transaction.set(txRef, {
        userId:    uid,
        amount:    founder ? 0 : -MATCH_REPORT_CREDIT_COST,
        type:      founder ? "founder_unlock" : "unlock_report",
        reportId:  reportRef.id,
        createdAt: now,
        ...(typeof clientRequestId === "string" && clientRequestId.length > 0
          ? { clientRequestId }
          : {}),
      });
    });

    // ── Step 5: Log AI run ────────────────────────────────────────────────────
    try {
      await db.collection("aiRuns").add({
        userId:              uid,
        reportId:            reportRef.id,
        provider:            AI_PROVIDER,
        type:                "match_explanation",
        status:              aiResult.status,
        model:               AI_MODEL,
        inputMatchCount:     programEligibleMatches.length,
        normalisedField,
        normalisedLevel,
        programGateEnforced: canEnforceGate,
        createdAt:           now,
        ...(aiResult.errorMessage ? { errorMessage: aiResult.errorMessage } : {}),
      });
    } catch (logErr: any) {
      console.warn("[unlockMatchReport] aiRuns log failed:", logErr?.message);
    }

    return { reportId: reportRef.id, aiStatus: aiResult.status };
  }
);

// ============================================================================
// F-1 Visa Interview Simulator (practice-only)
// ============================================================================

// Allowed values for the `documentType` parameter on doc-upload endpoints.
// (The original name on this set was misleading — these are ALLOWED, not
// forbidden. Renamed when adding the supporting-document types below.)
const ALLOWED_DOC_TYPES = new Set<VisaDocumentType>([
  "i20",
  "ds160_confirmation",
  "bank_statement",
  "employment_letter",
  "sponsor_letter",
  "transcript",
]);

/**
 * Pulls the most recent uploaded file of the given type for a session and
 * returns the bytes + content type. Returns null if none found (e.g. the
 * client called `recordVisaInterviewDocument` before the upload completed).
 *
 * SECURITY (audit 2026-05-15): the caller passes uid, and we re-verify
 * that the document's userId AND its storagePath both live under that uid.
 * Without this check, a client that wrote a visaInterviewDocuments doc with
 * `storagePath: "users/VICTIM_UID/visa-interviews/..."` would have us
 * download (via Admin SDK, bypassing Storage rules) and feed the victim's
 * PDF into Claude vision — the extracted fields would then surface in the
 * attacker's own session. The Firestore rule for visaInterviewDocuments
 * now blocks creating such a doc, but this function still re-validates so
 * a future rule regression doesn't reopen the hole.
 */
async function loadLatestDocument(args: {
  sessionId: string;
  documentType: VisaDocumentType;
  uid: string;
}): Promise<{ bytes: Buffer; contentType: string; storagePath: string } | null> {
  const db = admin.firestore();
  const snap = await db.collection("visaInterviewDocuments")
    .where("sessionId", "==", args.sessionId)
    .where("documentType", "==", args.documentType)
    .orderBy("uploadedAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const meta = snap.docs[0].data() as any;
  if (!meta.storagePath || typeof meta.storagePath !== "string") return null;

  // Defence-in-depth: the storagePath MUST live under users/{uid}/visa-interviews/
  // for the caller making the request. The Firestore rule enforces this on
  // create; we re-enforce on read in case the rule ever regresses or the
  // doc was written before the rule landed.
  const expectedPrefix = `users/${args.uid}/visa-interviews/`;
  if (!meta.storagePath.startsWith(expectedPrefix)) {
    console.error("[visa] storagePath/uid mismatch — refusing to download", {
      requestUid: args.uid,
      docUserId:  meta.userId,
      pathPrefix: meta.storagePath.slice(0, 60),
    });
    return null;
  }
  if (meta.userId && meta.userId !== args.uid) {
    console.error("[visa] doc.userId mismatch — refusing to download", {
      requestUid: args.uid,
      docUserId:  meta.userId,
    });
    return null;
  }

  try {
    const bucket = admin.storage().bucket();
    const [bytes] = await bucket.file(meta.storagePath).download();
    return {
      bytes,
      contentType: meta.contentType ?? "application/octet-stream",
      storagePath: meta.storagePath,
    };
  } catch (err: any) {
    console.warn("[visa] storage download failed:", err?.message);
    void logError({
      category: "storage",
      source:   "visa.storage_download_failed",
      severity: "error",
      message:  err?.message ?? String(err),
      userId:    args.uid,
      sessionId: args.sessionId,
      context:   {
        documentType: args.documentType,
        storagePath:  meta.storagePath,
      },
    });
    return null;
  }
}

/**
 * Milliseconds since the interview proper started (i.e. since the first
 * randomized question fired). Returns 0 if the session is still in the
 * documents phase. Backed by `session.interviewStartedAt`.
 */
function elapsedSinceInterviewStart(session: any): number {
  const ts = session?.interviewStartedAt;
  if (!ts) return 0;
  // Firestore Timestamp has toMillis(); also accept raw numbers / Dates.
  if (typeof ts.toMillis === "function") return Date.now() - ts.toMillis();
  if (typeof ts.seconds === "number")    return Date.now() - ts.seconds * 1000;
  if (typeof ts === "number")            return Date.now() - ts;
  return 0;
}

async function loadTranscript(sessionId: string): Promise<TranscriptTurn[]> {
  const db = admin.firestore();
  const snap = await db.collection("visaInterviewMessages")
    .where("sessionId", "==", sessionId)
    .orderBy("createdAt", "asc")
    .get();
  const turns: TranscriptTurn[] = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data?.role === "officer" || data?.role === "student" || data?.role === "system") {
      turns.push({ role: data.role, text: String(data.text ?? "") });
    }
  });
  return turns;
}

async function logAiRun(args: {
  userId: string;
  sessionId: string;
  type: "visa_interview_next_question" | "visa_interview_scoring";
  status: "completed" | "failed" | "fallback";
  errorMessage?: string;
}) {
  try {
    const db = admin.firestore();
    await db.collection("aiRuns").add({
      ...args,
      provider:  "anthropic",
      model:     "claude-sonnet-4-5",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err: any) {
    console.warn("[visa] aiRuns log failed:", err?.message);
  }
}

// ── startVisaInterviewSession ─────────────────────────────────────────────────
export const startVisaInterviewSession = onCall(
  { ...LIGHT_OPTS, secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    await assertNotInMaintenance(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to start a practice interview");

    const { mode, disclaimerAccepted, clientRequestId } = request.data ?? {};
    if (disclaimerAccepted !== true) {
      throw new HttpsError("failed-precondition", "Disclaimer must be accepted");
    }
    const interviewMode: "text" | "voice" | "avatar" =
      mode === "voice" || mode === "avatar" ? mode : "text";

    const db = admin.firestore();

    // Idempotency (optional). A network blip / callable retry must not
    // charge the user 15 credits twice. If the client passes a stable
    // clientRequestId and we already have a transaction for it, return
    // the original session.
    if (typeof clientRequestId === "string" && clientRequestId.length > 0 && clientRequestId.length <= 100) {
      const existing = await db.collection("creditTransactions")
        .where("userId", "==", uid)
        .where("clientRequestId", "==", clientRequestId)
        .where("type", "==", "visa_interview_start")
        .limit(1)
        .get();
      if (!existing.empty) {
        const existingSessionId = existing.docs[0].data()?.sessionId as string | undefined;
        if (existingSessionId) {
          return {
            sessionId:              existingSessionId,
            firstMessage:           VISA_INTERVIEW_GREETING,
            requiresDocumentUpload: "ds160_confirmation" as const,
            mode:                   interviewMode,
            disclaimer:             VISA_DISCLAIMER,
            creditsUsed:            VISA_INTERVIEW_CREDIT_COST,
            idempotentReplay:       true,
          };
        }
      }
    }

    const walletRef  = db.collection("creditWallets").doc(uid);
    const sessionRef = db.collection("visaInterviewSessions").doc();
    const txRef      = db.collection("creditTransactions").doc();
    const firstMsgRef = db.collection("visaInterviewMessages").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Atomic: deduct credit + create session + create first officer message + log usage
    const founder = isFounderEmail(request.auth?.token?.email as string | undefined);
    await db.runTransaction(async (tx) => {
      const wallet = await tx.get(walletRef);
      let credits: number;
      if (!wallet.exists) {
        credits = FREE_CREDITS_ON_SIGNUP;
        tx.set(walletRef, { credits: FREE_CREDITS_ON_SIGNUP, updatedAt: now });
      } else {
        credits = wallet.data()?.credits ?? 0;
      }
      // Founder bypass — internal product testing can run unlimited
      // visa interviews. Wallet stays untouched; the ledger entry
      // below still records the action with a zero amount + a
      // founder-specific type so the audit shows what happened
      // without it polluting paid-usage analytics.
      if (!founder) {
        if (credits < VISA_INTERVIEW_CREDIT_COST) {
          throw new HttpsError("resource-exhausted", "Insufficient credits");
        }
        tx.update(walletRef, { credits: credits - VISA_INTERVIEW_CREDIT_COST, updatedAt: now });
      }

      tx.set(sessionRef, {
        userId:               uid,
        visaType:             "F1",
        status:               "active",
        mode:                 interviewMode,
        avatarProvider:       interviewMode === "avatar" ? "heygen_liveavatar" : "none",
        currentStage:         "documents",
        questionCount:        0, // the greeting is not a real interview question
        disclaimerAccepted:   true,
        documentsRequested:   { i20: false, ds160: true },
        documentsUploaded:    { i20: false, ds160: false },
        creditsUsed:          VISA_INTERVIEW_CREDIT_COST,
        startedAt:            now,
        createdAt:            now,
        updatedAt:            now,
      });

      tx.set(firstMsgRef, {
        sessionId: sessionRef.id,
        userId:    uid,
        role:      "officer",
        text:      VISA_INTERVIEW_GREETING,
        stage:     "documents",
        createdAt: now,
      });

      tx.set(txRef, {
        userId:    uid,
        amount:    founder ? 0 : -VISA_INTERVIEW_CREDIT_COST,
        type:      founder ? "founder_visa_interview" : "visa_interview_start",
        sessionId: sessionRef.id,
        createdAt: now,
        ...(typeof clientRequestId === "string" && clientRequestId.length > 0
          ? { clientRequestId }
          : {}),
      });
    });

    return {
      sessionId:              sessionRef.id,
      firstMessage:           VISA_INTERVIEW_GREETING,
      // Tell the client that the very first thing it should do (after the
      // avatar speaks the greeting) is open the DS-160 upload modal.
      requiresDocumentUpload: "ds160_confirmation" as const,
      mode:                   interviewMode,
      disclaimer:             VISA_DISCLAIMER,
      creditsUsed:            VISA_INTERVIEW_CREDIT_COST,
    };
  },
);

// ── sendVisaInterviewAnswer ──────────────────────────────────────────────────
// HOT_OPTS (not HEAVY): fires N times per interview (once per student turn).
// A cold-start here is the most painful UX failure mode — user finishes
// speaking, then stares at a "thinking" pill for 5+ seconds. Always-warm
// removes that.
export const sendVisaInterviewAnswer = onCall(
  { ...HOT_OPTS, secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    await assertNotInMaintenance(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue the interview");

    const { sessionId, answer } = request.data ?? {};
    if (!sessionId || typeof sessionId !== "string") {
      throw new HttpsError("invalid-argument", "Missing sessionId");
    }
    const text = typeof answer === "string" ? answer.trim() : "";
    if (!text) throw new HttpsError("invalid-argument", "Empty answer");
    if (text.length > 2000) throw new HttpsError("invalid-argument", "Answer too long");

    const db = admin.firestore();
    const sessionRef = db.collection("visaInterviewSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found");
    const session = sessionSnap.data() as any;
    if (session.userId !== uid)        throw new HttpsError("permission-denied", "Not your session");
    if (session.status !== "active")   throw new HttpsError("failed-precondition", "Session is not active");

    const now = admin.firestore.FieldValue.serverTimestamp();

    // Save the student's answer first so it shows up in the snapshot stream
    await db.collection("visaInterviewMessages").add({
      sessionId, userId: uid, role: "student", text, stage: session.currentStage ?? null, createdAt: now,
    });

    // Build a fresh transcript and let Claude pick the next question
    const transcript = await loadTranscript(sessionId);
    const extractedDocs: ExtractedDocument[] = Object.values(session.extractedDocuments ?? {});
    const officer = await generateOfficerTurn({
      apiKey:        ANTHROPIC_API_KEY.value(),
      transcript,
      questionCount: typeof session.questionCount === "number" ? session.questionCount : 1,
      extractedDocuments: extractedDocs,
      elapsedMs:     elapsedSinceInterviewStart(session),
    });

    // Persist officer reply
    const officerMsgRef = await db.collection("visaInterviewMessages").add({
      sessionId, userId: uid, role: "officer",
      text:  officer.text,
      stage: officer.stage,
      createdAt: now,
    });

    // Update session metadata (questionCount, currentStage, requested docs).
    // Once the interview proper has started, NEVER let currentStage revert to
    // "documents" — that's the gate for the intro upload flow and reverting
    // it would cause the next upload to fire pickIntroQuestion() and feel
    // like the interview restarted.
    const isPostIntro = !!session.interviewStartedAt;
    const clampedStage = (isPostIntro && officer.stage === "documents")
      ? (session.currentStage && session.currentStage !== "documents" ? session.currentStage : "study_plan")
      : officer.stage;
    const updates: Record<string, any> = {
      questionCount: admin.firestore.FieldValue.increment(1),
      currentStage:  clampedStage,
      updatedAt:     now,
    };
    if (officer.requiresDocumentUpload === "i20") {
      updates["documentsRequested.i20"] = true;
    } else if (officer.requiresDocumentUpload === "ds160_confirmation") {
      updates["documentsRequested.ds160"] = true;
    }
    await sessionRef.update(updates);

    await logAiRun({
      userId: uid, sessionId,
      type: "visa_interview_next_question",
      status: officer.status,
      errorMessage: officer.errorMessage,
    });

    return {
      messageId:              officerMsgRef.id,
      officerText:            officer.text,
      stage:                  officer.stage,
      requiresDocumentUpload: officer.requiresDocumentUpload,
      isFinalQuestion:        officer.isFinalQuestion,
      aiStatus:               officer.status,
    };
  },
);

// ── requestVisaDocumentUpload ────────────────────────────────────────────────
// Returns the metadata the client needs to upload a document directly to
// Storage. Storage rules already restrict the path to the user's own folder.
export const requestVisaDocumentUpload = onCall({ ...LIGHT_OPTS }, async (request) => {
  await assertNotInMaintenance(request);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first");

  const { sessionId, documentType } = request.data ?? {};
  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "Missing sessionId");
  }
  if (!ALLOWED_DOC_TYPES.has(documentType)) {
    throw new HttpsError("invalid-argument", "Unsupported documentType");
  }

  const db = admin.firestore();
  const sessionSnap = await db.collection("visaInterviewSessions").doc(sessionId).get();
  if (!sessionSnap.exists)                       throw new HttpsError("not-found", "Session not found");
  if (sessionSnap.data()?.userId !== uid)        throw new HttpsError("permission-denied", "Not your session");

  return {
    storagePathPrefix: `users/${uid}/visa-interviews/${sessionId}/${documentType}`,
    allowedTypes:      ["application/pdf", "image/png", "image/jpeg"],
    maxSizeBytes:      10 * 1024 * 1024,
    documentType,
  };
});

// ── recordVisaInterviewDocument ──────────────────────────────────────────────
// Called by the client immediately after a successful Storage upload.
//   1. Downloads the file from Storage and runs Claude-vision extraction so
//      Anna has the document's contents in her context for the rest of the
//      interview (no more "what's the cost of attendance?" when it's printed
//      on the I-20).
//   2. Decides Anna's next line:
//      • Intro phase, DS-160 just uploaded but I-20 missing → ask for I-20.
//      • Intro phase, both initial docs in → randomized first interview Q.
//      • Mid-interview supporting doc (bank_statement etc.) → run Claude
//        with the new document context to generate the next probing Q.
export const recordVisaInterviewDocument = onCall(
  { ...HEAVY_OPTS, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 90 },
  async (request) => {
    await assertNotInMaintenance(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first");

    const { sessionId, documentType, skipped } = request.data ?? {};
    if (!sessionId || typeof sessionId !== "string") {
      throw new HttpsError("invalid-argument", "Missing sessionId");
    }
    if (!ALLOWED_DOC_TYPES.has(documentType)) {
      throw new HttpsError("invalid-argument", "Unsupported documentType");
    }
    const isSkip = skipped === true;
    // Skipping is now allowed for ALL doc types, including the initial
    // DS-160 / I-20. If the student doesn't have them on hand we'd rather
    // continue the interview without document context than leave them
    // stuck on a modal they can't satisfy. Anna probes verbally for the
    // missing facts during the interview proper.

    const db = admin.firestore();
    const sessionRef = db.collection("visaInterviewSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists)              throw new HttpsError("not-found", "Session not found");
    const session = sessionSnap.data() as any;
    if (session.userId !== uid)           throw new HttpsError("permission-denied", "Not your session");
    if (session.status !== "active")      throw new HttpsError("failed-precondition", "Session is not active");

    // Cost guardrail: cap how many SUPPORTING docs (anything other than the
    // mandatory I-20 / DS-160) the user can push through vision extraction
    // in one session. Each extraction is a Sonnet vision call (~$0.012) and
    // an unbounded loop is an easy way for a single bad actor to drain
    // margin on a 15-credit session.
    const isSupportingDoc =
      documentType !== "i20" && documentType !== "ds160_confirmation";
    if (isSupportingDoc && !isSkip) {
      const supportingUploaded = Object.entries(session.extractedDocuments ?? {})
        .filter(([type]) => type !== "i20" && type !== "ds160_confirmation")
        .length;
      if (supportingUploaded >= MAX_SUPPORTING_DOCS_PER_INTERVIEW) {
        throw new HttpsError(
          "resource-exhausted",
          `You've already uploaded the maximum of ${MAX_SUPPORTING_DOCS_PER_INTERVIEW} supporting documents for this interview.`,
        );
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    // ── 1. Run extraction (best-effort, never block the interview) ──────────
    let extracted: ExtractedDocument | null = null;
    if (!isSkip) {
      const file = await loadLatestDocument({ sessionId, documentType, uid });
      if (file) {
        extracted = await extractVisaDocument({
          apiKey:       ANTHROPIC_API_KEY.value(),
          documentType: documentType as VisaDocumentType,
          fileBytes:    file.bytes,
          contentType:  file.contentType,
        });
      } else {
        console.warn("[visa] no Storage file found for", documentType, "in session", sessionId);
        // Stash a failed-extraction placeholder so the dedup logic in
        // generateOfficerTurn (and the fallback bank) knows the user
        // attempted this upload. Without this, a transient Storage glitch
        // makes Anna re-request the same doc on the next turn — which is
        // exactly the "Anna keeps asking for my I-20" bug reported
        // 2026-05-18.
        extracted = {
          documentType: documentType as VisaDocumentType,
          fields: {},
          summary: "",
          status: "failed",
          errorMessage: "Storage file could not be loaded",
        };
      }
    }

    // Stash extraction in session.extractedDocuments[type] for re-use on every
    // subsequent officer turn. We keep one per type — re-uploads overwrite.
    // CRITICAL: we stash FAILED extractions too. Without that, an unreadable
    // upload looks like "no document" to Anna and she re-requests it on her
    // next turn — which a previous user hit when they uploaded a wrong file.
    // The dedup check in generateOfficerTurn matches by documentType only, so
    // failed attempts still suppress re-requests; we expose the failure in
    // the system prompt so Anna probes verbally instead.
    const extractedDocsAfter: Record<string, ExtractedDocument> = {
      ...(session.extractedDocuments ?? {}),
    };
    if (extracted) {
      extractedDocsAfter[documentType] = extracted;
    }

    // ── 2. Decide Anna's next line ─────────────────────────────────────────
    const isInitialDoc = documentType === "i20" || documentType === "ds160_confirmation";
    // The deterministic intro flow (DS-160 → I-20 → first question) only
    // applies while the session is still in the "documents" stage. After
    // the interview proper has started, any upload — even a re-upload of
    // I-20 — is a mid-interview event and should run through Claude with
    // the fresh document context, NOT loop back to a random intro question.
    const isInIntroPhase = session.currentStage === "documents";
    // "Resolved" = either uploaded OR explicitly skipped. We don't want to
    // re-ask for a doc the student already declined.
    const ds160Resolved =
      documentType === "ds160_confirmation" ? true :
      (!!session.documentsUploaded?.ds160 || !!session.documentsSkipped?.ds160);
    const i20Resolved =
      documentType === "i20" ? true :
      (!!session.documentsUploaded?.i20   || !!session.documentsSkipped?.i20);

    let nextOfficerText: string;
    let nextRequiresUpload: VisaDocumentType | null = null;
    let nextStage: string;
    let questionCountIncrement = 0;
    let nextIsFinalQuestion = false;

    if (isInitialDoc && isInIntroPhase && !ds160Resolved) {
      nextOfficerText = "Thank you. Now please upload your DS-160 confirmation page.";
      nextRequiresUpload = "ds160_confirmation";
      nextStage = "documents";
    } else if (isInitialDoc && isInIntroPhase && !i20Resolved) {
      nextOfficerText = VISA_I20_REQUEST_LINE;
      nextRequiresUpload = "i20";
      nextStage = "documents";
    } else if (isInitialDoc && isInIntroPhase) {
      // Both initial docs resolved (uploaded or skipped) — start the
      // interview with a randomized opener and stamp the session with the
      // start time so we can hard-cap the total length.
      nextOfficerText = pickIntroQuestion();
      nextStage = "introduction";
      questionCountIncrement = 1;
    } else {
      // Mid-interview document event. Either a supporting doc (bank
      // statement etc.) or a re-upload of an initial doc Anna asked for
      // again (e.g. to verify SEVIS). The freshly extracted fields are
      // already in extractedDocsAfter; Claude generates the next line
      // with that context. On a skip we append a synthetic student
      // utterance so Claude responds to "I don't have it" naturally.
      if (isSkip) {
        // Append the skip as the student's verbal answer to Anna's request.
        // This keeps the transcript conversational and lets Claude respond
        // the same way it would to any spoken decline — probe further with
        // a different angle instead of re-asking for the document.
        const friendlyDocName = documentType.replace(/_/g, " ");
        await db.collection("visaInterviewMessages").add({
          sessionId, userId: uid, role: "student",
          text:  `I don't have my ${friendlyDocName} with me right now.`,
          stage: session.currentStage ?? "documents",
          createdAt: now,
        });
      }
      const transcript = await loadTranscript(sessionId);
      const officer = await generateOfficerTurn({
        apiKey:        ANTHROPIC_API_KEY.value(),
        transcript,
        questionCount: typeof session.questionCount === "number" ? session.questionCount : 1,
        extractedDocuments: Object.values(extractedDocsAfter),
        elapsedMs:     elapsedSinceInterviewStart(session),
      });
      nextOfficerText = officer.text;
      // Once the interview proper has started, currentStage must NEVER revert
      // to "documents". If it does, the next upload would be treated as part
      // of the intro flow and could fire pickIntroQuestion() — effectively
      // restarting the interview. Force a neutral interview-stage value if
      // Claude tries to set documents stage post-intro.
      const isPostIntro = !!session.interviewStartedAt;
      nextStage = (isPostIntro && officer.stage === "documents")
        ? (session.currentStage && session.currentStage !== "documents" ? session.currentStage : "study_plan")
        : officer.stage;
      // Allow Anna to chain another doc request only if it's a different type.
      nextRequiresUpload = officer.requiresDocumentUpload && officer.requiresDocumentUpload !== documentType
        ? officer.requiresDocumentUpload
        : null;
      questionCountIncrement = 1;
      nextIsFinalQuestion = officer.isFinalQuestion;
    }

    const officerMsgRef = await db.collection("visaInterviewMessages").add({
      sessionId, userId: uid, role: "officer",
      text:  nextOfficerText,
      stage: nextStage,
      createdAt: now,
    });

    const updates: Record<string, any> = {
      currentStage: nextStage,
      updatedAt:    now,
      extractedDocuments: extractedDocsAfter,
    };
    // Track upload OR skip for the two intro docs in the existing schema; the
    // supporting docs are recorded in visaInterviewDocuments collection only.
    if (documentType === "i20" && !isSkip)                   updates["documentsUploaded.i20"]   = true;
    if (documentType === "ds160_confirmation" && !isSkip)    updates["documentsUploaded.ds160"] = true;
    if (documentType === "i20" && isSkip)                    updates["documentsSkipped.i20"]    = true;
    if (documentType === "ds160_confirmation" && isSkip)     updates["documentsSkipped.ds160"]  = true;
    if (questionCountIncrement) {
      updates.questionCount = admin.firestore.FieldValue.increment(questionCountIncrement);
    }
    // Stamp the start time when transitioning into the interview proper
    // (the random first question fires here). Used downstream to enforce
    // the 5-minute cap.
    if (isInitialDoc && isInIntroPhase && nextStage === "introduction" && !session.interviewStartedAt) {
      updates.interviewStartedAt = now;
    }
    if (nextRequiresUpload === "i20")             updates["documentsRequested.i20"]   = true;
    if (nextRequiresUpload === "ds160_confirmation") updates["documentsRequested.ds160"] = true;

    await sessionRef.update(updates);

    return {
      messageId:              officerMsgRef.id,
      officerText:            nextOfficerText,
      requiresDocumentUpload: nextRequiresUpload,
      stage:                  nextStage,
      interviewStarted:       isInitialDoc && nextRequiresUpload === null,
      isFinalQuestion:        nextIsFinalQuestion,
      extractionStatus:       extracted?.status ?? "skipped",
    };
  },
);

// ── finishVisaInterviewSession ───────────────────────────────────────────────
export const finishVisaInterviewSession = onCall(
  { ...HEAVY_OPTS, secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    await assertNotInMaintenance(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first");

    const { sessionId } = request.data ?? {};
    if (!sessionId || typeof sessionId !== "string") {
      throw new HttpsError("invalid-argument", "Missing sessionId");
    }

    const db = admin.firestore();
    const sessionRef = db.collection("visaInterviewSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists)                  throw new HttpsError("not-found", "Session not found");
    if (sessionSnap.data()?.userId !== uid)   throw new HttpsError("permission-denied", "Not your session");

    // Idempotency: if a report already exists for this session, return it.
    const existing = await db.collection("visaInterviewReports")
      .where("sessionId", "==", sessionId).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      return { reportId: doc.id, ...doc.data() };
    }

    const transcript = await loadTranscript(sessionId);
    const score = await scoreVisaInterview({
      apiKey:     ANTHROPIC_API_KEY.value(),
      transcript,
    });

    const now = admin.firestore.FieldValue.serverTimestamp();

    // ── Scoring failure → refund the credits ────────────────────────────────
    // Visa interviews charge 15 credits upfront (in startVisaInterviewSession).
    // If scoring fails the user has nothing to show for it — refund the full
    // cost rather than burn their wallet on our infra problem. We still mark
    // the session completed so it doesn't keep streaming, and log the
    // refunded run so support can audit later.
    if (score.status === "failed") {
      const walletRef = db.collection("creditWallets").doc(uid);
      const refundTxRef = db.collection("creditTransactions").doc();
      await db.runTransaction(async (tx) => {
        const wallet = await tx.get(walletRef);
        const current = wallet.exists ? (wallet.data()?.credits ?? 0) : 0;
        tx.set(walletRef, { credits: current + VISA_INTERVIEW_CREDIT_COST, updatedAt: now }, { merge: true });
        tx.set(refundTxRef, {
          userId:     uid,
          amount:     VISA_INTERVIEW_CREDIT_COST,
          type:       "refund_visa_interview_scoring_failed",
          sessionId,
          createdAt:  now,
        });
        tx.update(sessionRef, { status: "completed", endedAt: now, updatedAt: now, refundIssued: true });
      });
      await logAiRun({
        userId: uid, sessionId,
        type: "visa_interview_scoring",
        status: score.status,
        errorMessage: score.errorMessage,
      });
      throw new HttpsError(
        "internal",
        "Scoring failed. Your credits have been refunded — please try again in a moment.",
      );
    }

    const reportRef = db.collection("visaInterviewReports").doc();
    const reportData = {
      sessionId, userId: uid,
      overallScore:                  score.overallScore,
      clarityScore:                  score.clarityScore,
      consistencyScore:              score.consistencyScore,
      confidenceScore:               score.confidenceScore,
      financialReadinessScore:       score.financialReadinessScore,
      schoolProgramExplanationScore: score.schoolProgramExplanationScore,
      careerPlanScore:               score.careerPlanScore,
      homeTiesScore:                 score.homeTiesScore,
      documentReadinessScore:        score.documentReadinessScore,
      strengths:                     score.strengths,
      weaknesses:                    score.weaknesses,
      redFlagsToImprove:             score.redFlagsToImprove,
      recommendedPractice:           score.recommendedPractice,
      sampleImprovedAnswers:         score.sampleImprovedAnswers,
      disclaimer:                    score.disclaimer,
      aiStatus:                      score.status,
      createdAt:                     now,
    };

    const batch = db.batch();
    batch.set(reportRef, reportData);
    batch.update(sessionRef, { status: "completed", endedAt: now, updatedAt: now });
    await batch.commit();

    await logAiRun({
      userId: uid, sessionId,
      type: "visa_interview_scoring",
      status: score.status,
      errorMessage: score.errorMessage,
    });

    return { reportId: reportRef.id, ...reportData };
  },
);

// ── createLiveAvatarSession ──────────────────────────────────────────────────
// Issues a short-lived HeyGen streaming token to the browser. Persists
// avatar lifecycle metadata on the visa session doc so we can audit usage
// and surface the avatar status in the UI.
export const createLiveAvatarSession = onCall(
  { ...HEAVY_HOT_OPTS, secrets: [HEYGEN_API_KEY] },
  async (request) => {
    await assertNotInMaintenance(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first");

    const sessionId = request.data?.visaInterviewSessionId ?? request.data?.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      throw new HttpsError("invalid-argument", "Missing visaInterviewSessionId");
    }

    const db = admin.firestore();
    const sessionRef = db.collection("visaInterviewSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists)                throw new HttpsError("not-found", "Session not found");
    if (sessionSnap.data()?.userId !== uid) throw new HttpsError("permission-denied", "Not your session");

    // SECURITY (audit 2026-05-15): re-mint guard. Each HeyGen session token
    // request creates a billable LiveKit room (~$2.20/session). Without this
    // check, a user who reloads the avatar 50× in 60 seconds spawns 50 paid
    // sessions. We allow a re-mint after 60s (a legitimate page refresh
    // after a long pause), but block rapid repeats. The frontend's idle
    // watchdog handles teardown of the older session; HeyGen also reaps
    // idle rooms server-side.
    const sessionData = sessionSnap.data() as any;
    const lastStarted = sessionData?.avatarStartedAt;
    if (lastStarted && typeof lastStarted.toMillis === "function") {
      const sinceLast = Date.now() - lastStarted.toMillis();
      if (sinceLast < 60_000 && sessionData?.avatarStatus !== "ended" && sessionData?.avatarStatus !== "failed") {
        throw new HttpsError(
          "resource-exhausted",
          "An avatar session was just created for this interview. Please wait a moment before retrying.",
        );
      }
    }

    let key: string | null = null;
    try { key = HEYGEN_API_KEY.value(); } catch { key = null; }

    const result = await createHeyGenSessionToken({ heygenApiKey: key, userId: uid, sessionId });
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (result.ready) {
      await sessionRef.update({
        avatarProvider:   "heygen_liveavatar",
        avatarSessionId:  result.avatarSessionId ?? null,
        avatarStatus:     "starting",
        avatarStartedAt:  now,
        updatedAt:        now,
      });
    } else {
      await sessionRef.update({
        avatarProvider:      "heygen_liveavatar",
        avatarStatus:        "failed",
        avatarFailureReason: result.reason ?? "unknown",
        updatedAt:           now,
      });
    }

    // Frontend gets only the safe fields (token + non-secret config). The
    // raw HEYGEN_API_KEY never crosses the wire.
    return result;
  },
);

// ── endLiveAvatarSession ─────────────────────────────────────────────────────
// Marks the avatar session as ended on our side. The frontend SDK has
// already called avatar.stopAvatar() — this is for bookkeeping.
export const endLiveAvatarSession = onCall({ ...LIGHT_OPTS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first");

  const sessionId = request.data?.visaInterviewSessionId ?? request.data?.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "Missing visaInterviewSessionId");
  }

  const db = admin.firestore();
  const sessionRef = db.collection("visaInterviewSessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists)                throw new HttpsError("not-found", "Session not found");
  if (sessionSnap.data()?.userId !== uid) throw new HttpsError("permission-denied", "Not your session");

  const avatarSessionId = (sessionSnap.data() as any)?.avatarSessionId ?? null;
  await endHeyGenSession({ userId: uid, sessionId, avatarSessionId });

  await sessionRef.update({
    avatarStatus: "ended",
    avatarEndedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// ── generateAvatarSpeech ─────────────────────────────────────────────────────
// Renders a single line of officer dialogue to PCM 24kHz audio (base64) using
// Google Cloud Text-to-Speech. The frontend hands the result to
// `session.repeatAudio(b64)`, which has the avatar lip-sync to it. This is
// the only HeyGen-supported path that lets us drive the avatar with our own
// LLM-generated text.
// Hard cap on TTS calls per visa interview session. Audit 2026-05-15
// flagged this endpoint as an unmetered TTS-billing vector: an authenticated
// user could call it ~250×/min at 4000 chars and burn ~$1k/hr on Google
// Studio voice. A realistic interview makes 6–10 TTS calls (one per officer
// turn); 60 leaves enormous headroom for re-reads while capping single-
// session abuse to ~$10 of TTS spend even at the old Studio price, and far
// less now that we use Neural2 (~$1).
const MAX_TTS_CALLS_PER_SESSION = 60;

// HOT_OPTS (not HEAVY): fires once per officer turn. If this cold-starts
// every other call, the avatar takes 3-5s longer to start each line, on
// top of whatever sendVisaInterviewAnswer added. Compounded latency is
// the difference between feeling like a conversation and feeling like
// dial-up.
export const generateAvatarSpeech = onCall(
  { ...HOT_OPTS, timeoutSeconds: 60 },
  async (request) => {
    await assertNotInMaintenance(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first");

    const { sessionId, text } = request.data ?? {};
    if (!sessionId || typeof sessionId !== "string") {
      throw new HttpsError("invalid-argument", "Missing sessionId");
    }
    if (typeof text !== "string" || !text.trim()) {
      throw new HttpsError("invalid-argument", "Missing text");
    }
    if (text.length > 4000) {
      throw new HttpsError("invalid-argument", "Text too long");
    }

    // Confirm the caller owns the session AND that we haven't blown past
    // the per-session TTS budget. Both are essential — owning the session
    // alone isn't enough because the owner can still abuse it.
    const db = admin.firestore();
    const sessionRef = db.collection("visaInterviewSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists)                throw new HttpsError("not-found", "Session not found");
    if (sessionSnap.data()?.userId !== uid) throw new HttpsError("permission-denied", "Not your session");

    const ttsCallCount = (sessionSnap.data() as any)?.ttsCallCount ?? 0;
    if (ttsCallCount >= MAX_TTS_CALLS_PER_SESSION) {
      throw new HttpsError(
        "resource-exhausted",
        "TTS call limit for this interview reached. Start a new session to continue.",
      );
    }

    try {
      const tts = await synthesizeOfficerAudio({ text });
      // Best-effort counter — failing this update shouldn't block the audio.
      sessionRef.update({ ttsCallCount: admin.firestore.FieldValue.increment(1) }).catch((err) => {
        console.warn("[avatarTts] could not increment ttsCallCount:", err?.message);
      });
      return tts;
    } catch (err: any) {
      console.error("[avatarTts] synthesis failed:", err?.message);
      void logError({
        category: "tts",
        source:   "google_tts.synthesis_failed",
        severity: "error",
        message:  err?.message ?? String(err),
        userId:    uid,
        sessionId,
        context:   { textLength: text.length },
      });
      throw new HttpsError("internal", err?.message ?? "TTS synthesis failed");
    }
  },
);

// ── markAvatarStatus ─────────────────────────────────────────────────────────
// Tiny helper called by the browser when the avatar transitions from
// "starting" → "active" (stream playing) or "active" → "failed".
export const markAvatarStatus = onCall({ ...LIGHT_OPTS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first");

  const sessionId = request.data?.visaInterviewSessionId ?? request.data?.sessionId;
  const status    = request.data?.status;
  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "Missing visaInterviewSessionId");
  }
  if (status !== "active" && status !== "failed") {
    throw new HttpsError("invalid-argument", "status must be 'active' or 'failed'");
  }

  const db = admin.firestore();
  const sessionRef = db.collection("visaInterviewSessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists)                throw new HttpsError("not-found", "Session not found");
  if (sessionSnap.data()?.userId !== uid) throw new HttpsError("permission-denied", "Not your session");

  await sessionRef.update({
    avatarStatus: status,
    avatarFailureReason: status === "failed" ? (request.data?.reason ?? "client_error") : admin.firestore.FieldValue.delete(),
    updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// Paystack — credit-pack checkout + webhook
//
// Replaced Dodo Payments on 2026-05-24. Paystack is a better fit for the
// African market (Ghana/Nigeria/Kenya), supports local cards + mobile money
// when the merchant account is configured for it, and verifies merchants
// faster than Dodo did.
//
// Test mode vs live mode is determined by which secret key is set in
// PAYSTACK_SECRET_KEY (`sk_test_...` vs `sk_live_...`). No environment
// constant needed in code — Paystack picks the mode from the key itself.
// ─────────────────────────────────────────────────────────────────────────────

/** Public catalogue — client reads this to render the billing tab. */
export const listCreditPacks = onCall({ ...LIGHT_OPTS }, async () => {
  return Object.entries(CREDIT_PACKS).map(([id, p]) => ({
    id,
    label:       p.label,
    priceLocal:  p.priceLocal,
    priceUsd:    p.priceUsd,
    currency:    "GHS",
    credits:     p.credits,
    recommended: !!p.recommended,
  }));
});

/**
 * Create a Paystack hosted-checkout session for the requested credit pack
 * and return the authorization_url the browser should redirect to. The
 * client supplies only the packId — pricing and credit amount come from
 * CREDIT_PACKS server-side so a tampered client can't pay $2 for the
 * Power pack.
 */
export const createPaystackCheckout = onCall(
  { ...LIGHT_OPTS, secrets: [PAYSTACK_SECRET_KEY] },
  async (request) => {
    await assertNotInMaintenance(request);
    const uid = request.auth?.uid;
    if (!uid)                throw new HttpsError("unauthenticated", "Sign in to buy credits");
    const userEmail = request.auth?.token?.email;
    if (!userEmail)          throw new HttpsError("failed-precondition", "Your account has no email — contact support");

    const packId    = String(request.data?.packId ?? "");
    const returnUrl = String(request.data?.returnUrl ?? "");
    const pack = CREDIT_PACKS[packId];
    if (!pack)               throw new HttpsError("invalid-argument", "Unknown credit pack");
    const isAllowedUrl = (url: string) =>
      url.startsWith("https://") || url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1");
    if (!isAllowedUrl(returnUrl))
      throw new HttpsError("invalid-argument", "Invalid returnUrl");

    // Paystack `amount` is in the smallest currency unit. For GHS that's
    // pesewas — ₵5 → 500. Compute here so the integer math stays explicit.
    const amountSubunit = Math.round(pack.priceLocal * 100);

    try {
      const { checkoutUrl, reference } = await initPaystackTransaction({
        secretKey:    PAYSTACK_SECRET_KEY.value(),
        amountSubunit,
        email:        userEmail,
        callbackUrl:  returnUrl,
        // Everything the webhook needs to credit the right user. Paystack
        // echoes this back verbatim in the `data.metadata` field.
        metadata: {
          userId:         uid,
          packId,
          creditsToGrant: String(pack.credits),
          amountSubunit:  String(amountSubunit),
          priceLocal:     String(pack.priceLocal),
          currency:       "GHS",
        },
      });
      // Client side calls this `sessionId` historically — keep the alias
      // so DashboardPage doesn't need a rename in the same deploy.
      return { checkoutUrl, sessionId: reference };
    } catch (err: any) {
      console.error("[paystack] checkout creation failed:", err?.message ?? err);
      void logError({
        category:  "payment_webhook",   // not strictly a webhook, but same bucket in ops
        source:    "paystack.init_failed",
        severity:  "error",
        message:   err?.message ?? String(err),
        userId:    uid,
        context:   { packId, userEmail },
      });
      throw new HttpsError("internal", "Could not start checkout. Please try again.");
    }
  },
);

/**
 * Paystack webhook receiver. Raw HTTP endpoint. We verify the HMAC-SHA512
 * signature with the secret key (Paystack uses the same key for API auth
 * AND webhook signing — no separate webhook secret), then dispatch by
 * event type.
 *
 * Returns:
 *   200 + { ok: true }           on successful credit
 *   200 + { duplicated: true }   on already-processed (Paystack retries)
 *   200 + { ignored: true }      for event types we don't handle (still 200
 *                                so Paystack stops retrying)
 *   401 on signature failure (Paystack stops retrying — if it really is
 *       Paystack and our key is wrong, the dashboard surfaces the delivery
 *       failure and we investigate from there)
 */
export const paystackWebhook = onRequest(
  { ...LIGHT_OPTS, secrets: [PAYSTACK_SECRET_KEY, RESEND_API_KEY], cors: false },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const rawBody   = (req.rawBody ?? Buffer.from("")).toString("utf8");
    const signature = String(req.header("x-paystack-signature") ?? "");
    if (!signature) {
      res.status(400).send("Missing signature");
      return;
    }

    const valid = verifyPaystackWebhook({
      rawBody,
      signature,
      secretKey: PAYSTACK_SECRET_KEY.value(),
    });
    if (!valid) {
      console.warn("[paystack] webhook signature invalid");
      void logError({
        category: "payment_webhook",
        source:   "paystack.signature_invalid",
        severity: "error",
        message:  "HMAC-SHA512 of body did not match x-paystack-signature header",
        context:  { signaturePrefix: signature.slice(0, 12), bodyLength: rawBody.length },
      });
      res.status(401).send("Invalid signature");
      return;
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      res.status(400).send("Invalid JSON");
      return;
    }

    try {
      if (event.event === "charge.success") {
        const result = await applyPaystackChargeSuccess(event);
        if (!result.applied && !result.duplicated) {
          console.warn("[paystack] charge.success not applied:", result.reason);
          const evData: any = event.data ?? {};
          const evMd: any   = evData.metadata ?? {};
          void logError({
            category: "payment_webhook",
            source:   "paystack.charge_success_not_applied",
            severity: "error",
            message:  result.reason ?? "charge.success not applied",
            paymentId: typeof evData.reference === "string" ? evData.reference : null,
            userId:    typeof evMd.userId === "string" ? evMd.userId : null,
            context:   { eventType: event.event, packId: evMd.packId },
          });
        }
        // Receipt email — fire-and-forget. Credits already landed; if Resend
        // fails the customer keeps their credits and Paystack's own receipt
        // email covers the compliance side.
        if (result.applied) {
          const pack = CREDIT_PACKS[result.packId];
          const packLabel = pack?.label ?? result.packId;
          if (result.customerEmail) {
            sendPurchaseReceipt({
              apiKey:     RESEND_API_KEY.value(),
              to:         result.customerEmail,
              packLabel,
              credits:    result.creditsGranted,
              priceLocal: result.priceLocal,
              currency:   result.currency,
              newBalance: result.newCredits,
              paymentId:  result.reference,
            }).then(
              ({ id }) => console.log("[paystack] receipt email sent", { reference: result.reference, messageId: id }),
              (err) => {
                console.warn("[paystack] receipt email failed (credits already granted)", err?.message ?? err);
                void logError({
                  category: "email_send",
                  source:   "paystack.receipt_email_failed",
                  severity: "warning",
                  message:  err?.message ?? String(err),
                  paymentId: result.reference,
                  userId:   typeof (event.data?.metadata?.userId) === "string"
                            ? event.data.metadata.userId : null,
                  context:  { packId: result.packId, customerEmail: result.customerEmail },
                });
              },
            );
          } else {
            console.warn("[paystack] no customer email on charge.success — skipping receipt", { reference: result.reference });
          }
        }
        res.status(200).json({
          ok:         result.applied,
          duplicated: result.applied ? false : !!result.duplicated,
        });
        return;
      }
      // Refunds + chargebacks reverse the credit grant.
      if (event.event === "refund.processed" || event.event === "charge.dispute.create") {
        const result = await applyPaystackRefund(event);
        if (!result.applied && !result.duplicated) {
          console.warn(`[paystack] ${event.event} not applied:`, result.reason);
          const evData: any = event.data ?? {};
          void logError({
            category: "payment_webhook",
            source:   `paystack.${event.event.replace(/[^a-z0-9_]/gi, "_")}_not_applied`,
            severity: "error",
            message:  result.reason ?? `${event.event} not applied`,
            paymentId: typeof evData.reference === "string" ? evData.reference : null,
            context:   { eventType: event.event },
          });
        }
        res.status(200).json({ ok: result.applied, duplicated: !!result.duplicated });
        return;
      }
      // Other events (charge.failed, transfer.success, etc.): log + 200.
      console.log("[paystack] received event:", event.event);
      res.status(200).json({ ignored: true });
    } catch (err: any) {
      console.error("[paystack] webhook processing error:", err?.message ?? err);
      void logError({
        category: "payment_webhook",
        source:   "paystack.webhook_processing_error",
        severity: "error",
        message:  err?.message ?? String(err),
        context:  {
          eventType: event?.event,
          stack: typeof err?.stack === "string" ? err.stack.slice(0, 1000) : undefined,
        },
      });
      // 500 so Paystack retries — transient Firestore issue, etc.
      res.status(500).send("Webhook processing failed");
    }
  },
);

// ============================================================
// Waitlist submission (rate-limited public callable)
// ============================================================
/**
 * Public-facing callable that the waitlist landing form invokes instead
 * of writing to Firestore directly. Replaces the direct-write path on
 * 2026-05-23 when we removed App Check enforcement — the function is
 * the chokepoint where we can validate input + rate-limit per IP +
 * dedupe per email so the abuse surface stays small.
 *
 * Validation:
 *   • Email regex (same shape we used in the old Firestore rule)
 *   • Length bounds (3 < len < 200)
 *   • Lowercased + trimmed before storage
 *
 * Rate limit:
 *   • 5 submissions per IP per hour. Real users sign up once; this
 *     covers shared-NAT scenarios (cafe / school) without inviting spam.
 *
 * Dedup:
 *   • Email is the document id, so the same address can't be spam-
 *     submitted. addDoc with merge:false on an existing doc would fail;
 *     we explicitly check existence and return idempotently.
 *
 * The existing onWaitlistEntry trigger still fires on the resulting
 * doc create and sends the Resend welcome email — no change to that
 * pipeline.
 */
export const submitWaitlist = onCall({ ...LIGHT_OPTS }, async (request) => {
  const ip = extractClientIp(request.rawRequest);

  // Rate limit FIRST so a flood hits the lightest possible code path.
  const check = waitlistRateLimit(ip);
  if (!check.allowed) {
    const retrySec = Math.ceil(check.retryAfterMs / 1000);
    throw new HttpsError(
      "resource-exhausted",
      `Too many signup attempts from your network. Try again in ${retrySec}s.`,
    );
  }

  // Validate input
  const rawEmail = String(request.data?.email ?? "").trim().toLowerCase();
  if (rawEmail.length < 4 || rawEmail.length > 200) {
    throw new HttpsError("invalid-argument", "Invalid email length.");
  }
  // Same RFC-ish regex we kept in firestore.rules for the old direct-write
  // path; keeps validation consistent between the two surfaces.
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(rawEmail)) {
    throw new HttpsError("invalid-argument", "That doesn't look like a valid email.");
  }

  const ref = String(request.data?.ref ?? "").slice(0, 200) || null;
  const ua  = typeof request.rawRequest?.headers?.["user-agent"] === "string"
    ? String(request.rawRequest.headers["user-agent"]).slice(0, 200)
    : null;

  const db = admin.firestore();
  // Use the email itself as the doc id so duplicate submissions are a
  // no-op rather than an additional Resend send. Firestore doc ids
  // can't contain slashes; emails don't either, so a direct use is
  // safe. We collapse the `@` to keep the doc id printable in the
  // console but unique to this email.
  const docId = rawEmail.replace(/[^A-Za-z0-9._-]/g, "_");
  const docRef = db.collection("waitlist").doc(docId);

  const existing = await docRef.get();
  if (existing.exists) {
    // Idempotent: same email already on the list. Don't fire the trigger
    // again (which would send another welcome email).
    return { ok: true, status: "already_on_list" };
  }

  await docRef.set({
    email:     rawEmail,
    ref,
    userAgent: ua,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, status: "added" };
});

// ============================================================
// Waitlist welcome email — Resend
// ============================================================
/**
 * Fires once when a new doc lands in `waitlist/{entryId}` (the public landing
 * page writes here). Sends the welcome email via Resend, then writes back
 * `emailSentAt` + `emailMessageId` for visibility. On failure, records
 * `emailError` so we can chase missed sends from the console without
 * resending blindly on every Cloud Function retry.
 *
 * Idempotency: if `emailSentAt` is already set when the trigger runs (e.g.
 * the runtime retried after a transient post-send error), we exit early.
 */
export const onWaitlistEntry = onDocumentCreated(
  { ...LIGHT_OPTS, document: "waitlist/{entryId}", secrets: [RESEND_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.warn("[waitlist] trigger fired without snapshot data");
      return;
    }
    const data = snap.data() ?? {};
    const email = typeof data.email === "string" ? data.email.trim() : "";
    if (!email) {
      console.warn("[waitlist] entry has no email, skipping", { id: snap.id });
      return;
    }
    if (data.emailSentAt) {
      console.log("[waitlist] email already sent for", snap.id, "skipping");
      return;
    }

    try {
      const { id } = await sendWaitlistWelcome({ apiKey: RESEND_API_KEY.value(), to: email });
      await snap.ref.set(
        {
          emailSentAt:    admin.firestore.FieldValue.serverTimestamp(),
          emailMessageId: id,
          emailError:     admin.firestore.FieldValue.delete(),
        },
        { merge: true },
      );
      console.log("[waitlist] welcome email sent", { entryId: snap.id, email, messageId: id });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error("[waitlist] welcome email failed", { entryId: snap.id, email, error: msg });
      void logError({
        category: "email_send",
        source:   "resend.waitlist_welcome_failed",
        severity: "warning",   // non-fatal: entry persists, can be manually retried
        message:  msg,
        context:  { entryId: snap.id, email },
      });
      // Record the error but DON'T throw — re-throwing would trigger Cloud
      // Function retries, which can spam users if the failure is downstream
      // (e.g. Resend domain not yet verified). The doc keeps `emailError`
      // until a manual retry succeeds and clears it.
      await snap.ref.set(
        { emailError: msg, emailErrorAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  },
);

// ============================================================
// Launch announcement — one-off bulk email to waitlist signups
// ============================================================
/**
 * Admin-only callable that walks every doc in /waitlist and sends a
 * "We're live" Resend email to addresses we haven't notified yet.
 * Stamps `launchEmailSentAt` (success) or `launchEmailError` (failure)
 * on each doc so a retry is idempotent — already-sent addresses are
 * skipped, failures are reattempted.
 *
 * Two safety knobs the operator should use:
 *   • `dryRun: true` (default) — no emails actually leave; returns the
 *     count of who WOULD have been mailed. Run this first.
 *   • `maxToSend: number` — caps how many sends happen in this
 *     invocation. Use a small number (5–10) for a final live smoke
 *     test, then call again uncapped to mail the rest.
 *
 * Timeout is bumped to 540s so a couple thousand emails can flow in
 * one call; we slot a 100ms pause between sends to stay polite to
 * Resend and avoid burst rate-limit. Anything bigger than that should
 * call this in multiple passes — each pass picks up where the last
 * left off.
 */
export const announceLaunch = onCall(
  { ...LIGHT_OPTS, timeoutSeconds: 540, secrets: [RESEND_API_KEY] },
  async (request) => {
    const authToken = request.auth?.token;
    if (!authToken || authToken.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const dryRun    = request.data?.dryRun !== false;  // default TRUE — explicit opt-out required
    const maxToSend = Math.max(0, Math.min(5000, Number(request.data?.maxToSend ?? 5000)));

    const db = admin.firestore();
    // Read every waitlist doc. Collection is small (pre-launch list);
    // no cursoring needed. If it ever balloons past a few thousand we
    // can switch to a streaming query, but for now the simpler shape
    // is easier to reason about.
    const all = await db.collection("waitlist").get();

    // Sort by createdAt so we mail the earliest signups first. They've
    // waited the longest; if we hit a partial-send scenario they should
    // be the ones who definitely heard from us.
    const docs = all.docs
      .map((d) => ({ id: d.id, ref: d.ref, data: d.data() ?? {} }))
      .filter((d) => typeof d.data.email === "string" && d.data.email.length > 0)
      .sort((a, b) => {
        const ta = a.data.createdAt?.toMillis?.() ?? 0;
        const tb = b.data.createdAt?.toMillis?.() ?? 0;
        return ta - tb;
      });

    let totalCandidates = 0;
    let alreadySent     = 0;
    let toSendQueue: typeof docs = [];

    for (const d of docs) {
      totalCandidates++;
      if (d.data.launchEmailSentAt) {
        alreadySent++;
        continue;
      }
      toSendQueue.push(d);
    }

    if (toSendQueue.length > maxToSend) {
      toSendQueue = toSendQueue.slice(0, maxToSend);
    }

    if (dryRun) {
      return {
        dryRun:          true,
        totalCandidates,
        alreadySent,
        wouldSend:       toSendQueue.length,
        sampleEmails:    toSendQueue.slice(0, 5).map((d) => d.data.email),
      };
    }

    let sent   = 0;
    let failed = 0;
    const failures: Array<{ email: string; error: string }> = [];

    for (const d of toSendQueue) {
      const email = String(d.data.email);
      try {
        const { id } = await sendLaunchAnnouncement({
          apiKey: RESEND_API_KEY.value(),
          to:     email,
        });
        await d.ref.set(
          {
            launchEmailSentAt:    admin.firestore.FieldValue.serverTimestamp(),
            launchEmailMessageId: id,
            launchEmailError:     admin.firestore.FieldValue.delete(),
            launchEmailErrorAt:   admin.firestore.FieldValue.delete(),
          },
          { merge: true },
        );
        sent++;
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        failed++;
        failures.push({ email, error: msg });
        await d.ref.set(
          {
            launchEmailError:   msg,
            launchEmailErrorAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        void logError({
          category: "email_send",
          source:   "resend.launch_announcement_failed",
          severity: "warning",
          message:  msg,
          context:  { entryId: d.id, email },
        });
      }
      // Polite gap between sends so Resend's burst limiter doesn't trip.
      await new Promise((r) => setTimeout(r, 100));
    }

    return {
      dryRun:          false,
      totalCandidates,
      alreadySent,
      attempted:       toSendQueue.length,
      sent,
      failed,
      // Truncate failure detail so a giant blob doesn't blow up the
      // callable response. Operator can inspect /waitlist docs directly
      // for the full error per-row.
      sampleFailures:  failures.slice(0, 5),
    };
  },
);

// ============================================================
// New-user welcome email — Resend
// ============================================================
/**
 * Fires once when a new doc lands in `users/{userId}`. The client writes
 * this doc as part of signup (rules allow create where auth.uid == userId).
 * We look the user up in Firebase Auth to get their verified email +
 * displayName, then send the welcome via Resend.
 *
 * Idempotency: the same `welcomeEmailSentAt` field guard the waitlist
 * trigger uses. If a Cloud Function retry runs the trigger twice for the
 * same user doc, the second run sees the stamp and exits early.
 *
 * Why we read the email from Auth instead of trusting the Firestore doc:
 * the doc is client-written under permissive rules — a malicious client
 * could write `email: "victim@x.com"` to send Joe-jobs through our domain.
 * Auth holds the verified email from the IdP (Google/Apple); always trust
 * that side.
 */
export const onUserCreated = onDocumentCreated(
  { ...LIGHT_OPTS, document: "users/{userId}", secrets: [RESEND_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.warn("[users] trigger fired without snapshot data");
      return;
    }
    const uid = event.params.userId;
    const data = snap.data() ?? {};
    if (data.welcomeEmailSentAt) {
      console.log("[users] welcome email already sent for", uid, "skipping");
      return;
    }

    // Authoritative email comes from Firebase Auth, NOT the Firestore doc.
    let authUser: admin.auth.UserRecord;
    try {
      authUser = await admin.auth().getUser(uid);
    } catch (err: any) {
      console.warn("[users] no Firebase Auth record for", uid, "— skipping welcome", err?.message ?? err);
      return;
    }
    const email = authUser.email;
    if (!email) {
      console.warn("[users] auth user has no email, skipping welcome", { uid });
      return;
    }

    try {
      const { id } = await sendWelcomeEmail({
        apiKey:      RESEND_API_KEY.value(),
        to:          email,
        displayName: authUser.displayName,
      });
      await snap.ref.set(
        {
          welcomeEmailSentAt:    admin.firestore.FieldValue.serverTimestamp(),
          welcomeEmailMessageId: id,
          welcomeEmailError:     admin.firestore.FieldValue.delete(),
        },
        { merge: true },
      );
      console.log("[users] welcome email sent", { uid, email, messageId: id });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error("[users] welcome email failed", { uid, email, error: msg });
      void logError({
        category: "email_send",
        source:   "resend.user_welcome_failed",
        severity: "warning",   // non-fatal: signup completed
        message:  msg,
        userId:   uid,
        context:  { email },
      });
      // Record but don't throw — Cloud Function retries would otherwise
      // spam the user. Manual fix: clear welcomeEmailError on the doc and
      // re-trigger (rewrite the doc) when Resend is healthy.
      await snap.ref.set(
        { welcomeEmailError: msg, welcomeEmailErrorAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Ops portal — branded magic-link sign-in
//
// Replaces Firebase's built-in sendSignInLinkToEmail (which sent from
// noreply@<project>.firebaseapp.com and routinely landed in spam) with a
// Resend-sent email from `College Ready <noreply@collegeready.io>` — the
// same SPF/DKIM-aligned sender we use for every other transactional email.
//
// Security:
//   - Per-IP rate limit (6/hour) so the endpoint can't be turned into a
//     spam cannon if leaked.
//   - Per-email existence check: we only send to addresses that already
//     have a Firebase Auth user (admins are pre-provisioned in the
//     Firebase Console before being granted the admin claim). The
//     response is intentionally identical whether the email exists or
//     not — prevents enumeration of valid admin emails.
//   - returnUrl must match a hardcoded allow-list of ops portal origins.
//     Without this, an attacker could trigger a real email from us with
//     a sign-in URL that redirects to their server post-auth.
// ─────────────────────────────────────────────────────────────────────────────
export const sendOpsSignInLink = onCall(
  { ...LIGHT_OPTS, secrets: [RESEND_API_KEY] },
  async (request) => {
    const ip = extractClientIp(request.rawRequest);
    const rl = opsSignInRateLimit(ip);
    if (!rl.allowed) {
      throw new HttpsError("resource-exhausted", "Too many sign-in requests — try again in a few minutes.");
    }

    const email = String(request.data?.email ?? "").trim().toLowerCase();
    const returnUrl = String(request.data?.returnUrl ?? "");

    // Format check — RFC-ish, defensive against header-injection chars.
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
      throw new HttpsError("invalid-argument", "Enter a valid email address.");
    }

    // Return URL must come from a host shape we recognise as the ops
    // portal (Vercel, custom collegeready.io subdomain, or localhost).
    // Firebase Auth's authorized-domains list is the real gate; this is
    // a fast-fail filter so we don't waste an Admin SDK call.
    let returnOrigin: string;
    try {
      returnOrigin = new URL(returnUrl).origin;
    } catch {
      throw new HttpsError("invalid-argument", "Invalid returnUrl.");
    }
    if (!isAllowedOpsPortalOrigin(returnOrigin)) {
      console.warn("[ops-signin] rejected returnUrl origin:", returnOrigin);
      throw new HttpsError("invalid-argument", "Unauthorized returnUrl origin.");
    }

    // Existence check — only send to pre-provisioned auth users. We
    // intentionally do NOT surface "no such user" to the caller; this
    // prevents probing the admin email list.
    let userExists = true;
    try {
      await admin.auth().getUserByEmail(email);
    } catch (err: any) {
      if (err?.code === "auth/user-not-found") {
        userExists = false;
      } else {
        // Unknown auth-admin failure — log and swallow; we still want to
        // return the generic success response to avoid enumeration.
        console.warn("[ops-signin] getUserByEmail failed:", err?.message ?? err);
        void logError({
          category: "external_api",
          source:   "ops_signin.user_lookup_failed",
          severity: "warning",
          message:  err?.message ?? String(err),
          context:  { email },
        });
      }
    }

    if (!userExists) {
      // Pretend everything is fine but actually do nothing. Constant-time
      // matters less here than a consistent response shape; we don't
      // measure timing in any way that would leak.
      return { ok: true as const };
    }

    try {
      // Generate the actual Firebase sign-in URL. The link itself is
      // standard Firebase email-link auth — handleCodeInApp=true means
      // when the user clicks it, they're returned to the SPA route which
      // calls signInWithEmailLink() to complete the flow.
      const link = await admin.auth().generateSignInWithEmailLink(email, {
        url:             returnUrl,
        handleCodeInApp: true,
      });

      // Send via Resend with our brand.
      const { id } = await sendOpsSignInLinkEmail({
        apiKey: RESEND_API_KEY.value(),
        to:     email,
        link,
      });
      console.log("[ops-signin] link sent", { email, messageId: id });
      return { ok: true as const };
    } catch (err: any) {
      console.error("[ops-signin] failed to send link:", err?.message ?? err);
      void logError({
        category: "email_send",
        source:   "ops_signin.send_failed",
        severity: "error",
        message:  err?.message ?? String(err),
        context:  { email },
      });
      throw new HttpsError("internal", "Could not send sign-in link. Try again.");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// User-facing app — magic-link sign-in / sign-up
//
// Replaces email/password auth for the main user app. The same function
// covers BOTH first-time signup and returning sign-in because Firebase
// email-link auth has the same semantics for both:
//   - generateSignInWithEmailLink creates the link.
//   - signInWithEmailLink on the client side either creates a brand-new
//     Auth user (first time) or signs in the existing one.
//
// No admin gate (this is literally the public front door). Per-IP rate
// limit caps spam. Email shape validated server-side, returnUrl
// allow-listed to the same set the ops sign-in uses.
//
// Anti-enumeration: we deliberately do NOT check whether the email
// already exists before sending the link — that would let an attacker
// probe which addresses have accounts. The Admin SDK is happy to mint
// a link for an unknown address; when the user clicks it, the client
// creates the account.
// ─────────────────────────────────────────────────────────────────────────────
export const sendUserSignInLink = onCall(
  { ...LIGHT_OPTS, secrets: [RESEND_API_KEY] },
  async (request) => {
    const ip = extractClientIp(request.rawRequest);
    const rl = userSignInRateLimit(ip);
    if (!rl.allowed) {
      throw new HttpsError("resource-exhausted", "Too many sign-in requests — try again in a few minutes.");
    }

    const email     = String(request.data?.email ?? "").trim().toLowerCase();
    const returnUrl = String(request.data?.returnUrl ?? "");
    // `intent` is only retained for log telemetry — the server NEVER
    // branches behaviour based on it. Branching would leak account
    // existence (the previous "is this email already registered"
    // response opened that hole). See the security note below.
    const intent    = request.data?.intent === "signup" ? "signup" : "signin";

    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
      throw new HttpsError("invalid-argument", "Enter a valid email address.");
    }

    let returnOrigin: string;
    try {
      returnOrigin = new URL(returnUrl).origin;
    } catch {
      throw new HttpsError("invalid-argument", "Invalid returnUrl.");
    }
    if (!isAllowedOpsPortalOrigin(returnOrigin)) {
      // The user app shares the same origin allow-list as the ops portal
      // (collegeready.io / vercel.app / localhost). Reusing the same
      // predicate keeps one source of truth.
      console.warn("[user-signin] rejected returnUrl origin:", returnOrigin);
      throw new HttpsError("invalid-argument", "Unauthorized returnUrl origin.");
    }

    // ANTI-ENUMERATION: we deliberately do NOT check whether an account
    // exists before sending. The endpoint returns the same `{ ok: true }`
    // for every valid request, so an attacker can't probe a leaked
    // email list to discover which addresses are registered. Firebase's
    // email-link auth handles both first-time signup AND returning
    // sign-in transparently — clicking the link creates the user if
    // they're new, or signs them in if they already exist. The /signup
    // and /login pages display different success copy that honestly
    // names both outcomes ("we'll create your account when you click"
    // / "you'll be signed into your existing account"), so users get
    // expectation-setting without us leaking a single bit.
    try {
      const link = await admin.auth().generateSignInWithEmailLink(email, {
        url:             returnUrl,
        handleCodeInApp: true,
      });
      const { id } = await sendUserSignInLinkEmail({
        apiKey: RESEND_API_KEY.value(),
        to:     email,
        link,
      });
      console.log("[user-signin] link sent", { email, intent, messageId: id });
      return { ok: true as const };
    } catch (err: any) {
      console.error("[user-signin] failed to send link:", err?.message ?? err);
      void logError({
        category: "email_send",
        source:   "user_signin.send_failed",
        severity: "error",
        message:  err?.message ?? String(err),
        context:  { email, intent },
      });
      throw new HttpsError("internal", "Could not send sign-in link. Try again.");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Ops portal — append-only audit log
//
// Every admin action taken through the ops portal flows through this
// callable so we have a tamper-evident record of who did what, when. For
// V1 the actions are read-only ("sign_in", "sign_out", "user_viewed");
// when Tier-2 mutations land (refunds, manual credit grants), they'll
// reuse this same write path with new `action` values so the log
// continues to capture everything from one place.
//
// Security model:
//   - Callers must be authenticated AND carry the `admin: true` custom
//     claim. A non-admin can never write an entry, even with a forged
//     payload, because we re-verify the claim from `request.auth.token`
//     server-side (Firestore rules deny direct client writes too —
//     belt-and-braces).
//   - Actor identity (uid, email) comes from the auth token, NOT from
//     the request body. Clients can't impersonate a different admin.
//   - IP + user-agent are stamped server-side from the raw request so
//     the entry survives a compromised client.
//
// Storage:
//   - One doc per event in /auditLogs. Append-only (no updates, no
//     deletes — even from the function side).
//   - Same `logError` shape: small, flat, easy to filter on the ops
//     portal side without a search index.
// ─────────────────────────────────────────────────────────────────────────────

// Action types we accept today. Adding a new action means adding it
// here + handling it on the AuditPage UI; client-supplied actions
// outside this set are rejected to keep the table column space
// readable and prevent typos from creating "ghost" action types.
const OPS_AUDIT_ACTIONS = new Set([
  "sign_in",
  "sign_out",
  "user_viewed",
] as const);

export const recordOpsAuditEvent = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    // Re-verify admin from the token server-side. Firestore rules also
    // deny client writes to /auditLogs, but defense-in-depth.
    const authToken = request.auth?.token;
    if (!authToken || authToken.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const action = String(request.data?.action ?? "");
    if (!(OPS_AUDIT_ACTIONS as Set<string>).has(action)) {
      throw new HttpsError("invalid-argument", "Unknown audit action.");
    }

    const targetType = request.data?.targetType ? String(request.data.targetType).slice(0, 32) : null;
    const targetId   = request.data?.targetId   ? String(request.data.targetId).slice(0, 128) : null;
    // Metadata is free-form but capped. We JSON-stringify-roundtrip to
    // strip functions/undefined and cap depth/size — same hygiene as
    // errorLogger applies to its context field.
    let metadata: Record<string, unknown> | null = null;
    if (request.data?.metadata && typeof request.data.metadata === "object") {
      try {
        const json = JSON.stringify(request.data.metadata);
        if (json.length <= 4_000) metadata = JSON.parse(json);
      } catch {
        metadata = null;
      }
    }

    const ip = extractClientIp(request.rawRequest);
    const ua = String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240);

    try {
      await admin.firestore().collection("auditLogs").add({
        actorUid:    request.auth!.uid,
        actorEmail:  authToken.email ?? null,
        action,
        targetType,
        targetId,
        metadata,
        ip,
        userAgent:   ua,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ok: true as const };
    } catch (err: any) {
      // Audit write failure is not user-facing — the admin's action
      // succeeded, we just couldn't record it. Log to Cloud Logging
      // so we can spot a pattern.
      console.warn("[ops-audit] write failed:", err?.message ?? err);
      // Don't throw — the audit log is observational, not transactional.
      // A throw here would block the calling action's UX for no real
      // protection benefit (the action ran in the client; the log is
      // separate).
      return { ok: false as const };
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// User-facing app — append-only user audit log
//
// Mirror of recordOpsAuditEvent for the main user-facing app. Captures
// user_sign_in and user_sign_out events into /userAuditLogs (kept in a
// SEPARATE collection from the ops /auditLogs so security-relevant
// admin actions aren't buried under thousands of routine user
// sign-ins at scale).
//
// Auth model differs from the ops version:
//   - Caller must be authenticated, but no admin claim required.
//   - Actor identity (uid, email) comes from the auth token,
//     never the request body — so even a tampered client can't
//     forge entries on behalf of a different user.
//   - Action allow-list is small (sign_in / sign_out only); new
//     event types require an explicit code change here.
//
// Same fire-and-forget semantics: a failed write does not throw
// back to the caller (the sign-in / sign-out action already
// happened in the client).
// ─────────────────────────────────────────────────────────────────────────────
const USER_AUDIT_ACTIONS = new Set([
  "user_sign_in",
  "user_sign_out",
] as const);

export const recordUserAuditEvent = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in to record an audit event.");
    }
    const action = String(request.data?.action ?? "");
    if (!(USER_AUDIT_ACTIONS as Set<string>).has(action)) {
      throw new HttpsError("invalid-argument", "Unknown audit action.");
    }
    const targetType = request.data?.targetType ? String(request.data.targetType).slice(0, 32) : null;
    const targetId   = request.data?.targetId   ? String(request.data.targetId).slice(0, 128) : null;
    let metadata: Record<string, unknown> | null = null;
    if (request.data?.metadata && typeof request.data.metadata === "object") {
      try {
        const json = JSON.stringify(request.data.metadata);
        if (json.length <= 4_000) metadata = JSON.parse(json);
      } catch { metadata = null; }
    }

    const ip = extractClientIp(request.rawRequest);
    const ua = String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240);

    try {
      await admin.firestore().collection("userAuditLogs").add({
        actorUid:    request.auth.uid,
        actorEmail:  request.auth.token?.email ?? null,
        action,
        targetType,
        targetId,
        metadata,
        ip,
        userAgent:   ua,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ok: true as const };
    } catch (err: any) {
      console.warn("[user-audit] failed to persist log:", err?.message ?? err);
      return { ok: false as const };
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Ops portal — one-shot cleanup of test-mode payment data
//
// Triggered manually after going live. Wipes every paystackPayments doc
// EXCEPT the one matching `liveReference`, every creditTransactions doc
// not tied to that reference, and zeros every creditWallets balance
// (planting the live payer's wallet with the credits the live pack
// granted).
//
// Safety:
//   - Admin custom claim re-verified server-side.
//   - `confirm: "CONFIRM"` string required exactly — refuses booleans,
//     numbers, lower-case variants, etc.
//   - Writes an audit log entry (action: "test_payments_cleanup") so
//     the action is traceable in the AuditPage even after the function
//     is hot.
// ─────────────────────────────────────────────────────────────────────────────
export const cleanupTestPayments = onCall(
  // 540s = the v2 max — large /users tables would otherwise blow the
  // default 60s budget. We don't expect to hit it, but the safety
  // headroom is free.
  { ...LIGHT_OPTS, timeoutSeconds: 540 },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const liveReference = String(request.data?.liveReference ?? "").trim();
    const confirm       = String(request.data?.confirm ?? "");
    if (!liveReference) {
      throw new HttpsError("invalid-argument", "liveReference is required.");
    }
    if (confirm !== "CONFIRM") {
      throw new HttpsError("invalid-argument", 'Pass confirm: "CONFIRM" exactly to authorize the deletion.');
    }

    let result;
    try {
      result = await runCleanupTestPayments({ liveReference });
    } catch (err: any) {
      console.error("[cleanup-test-payments] failed:", err?.message ?? err);
      throw new HttpsError("internal", err?.message ?? "Cleanup failed.");
    }

    // Audit entry — bypass the OPS_AUDIT_ACTIONS allow-list because
    // we're writing as the privileged Cloud Function, not a client. The
    // AuditPage's badge map falls back to a neutral pill for unknown
    // actions, so the entry still renders correctly.
    try {
      await admin.firestore().collection("auditLogs").add({
        actorUid:    request.auth!.uid,
        actorEmail:  token.email ?? null,
        action:      "test_payments_cleanup",
        targetType:  "paystackPayments",
        targetId:    liveReference,
        metadata:    result,
        ip:          extractClientIp(request.rawRequest),
        userAgent:   String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240),
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      // Audit failure here is purely observational — the cleanup
      // already landed. Log + continue.
      console.warn("[cleanup-test-payments] audit write failed:", err);
    }

    return result;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance mode kill switch
//
// Toggles the /appConfig/runtime flag that gates every user-facing
// callable + the main app's React tree. Admin-only. Each toggle
// writes an auditLogs entry so the state change is traceable in the
// ops portal.
// ─────────────────────────────────────────────────────────────────────────────
export const setMaintenanceMode = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const enabled = request.data?.enabled === true;
    const message = typeof request.data?.message === "string"
      ? request.data.message.slice(0, 500)
      : "";
    const rawEta = request.data?.etaMs;
    const etaMs = typeof rawEta === "number" && isFinite(rawEta) && rawEta > Date.now()
      ? rawEta
      : null;

    const result = await setMaintenanceFlag({
      enabled,
      message,
      etaMs,
      actorUid:   request.auth!.uid,
      actorEmail: token.email ?? null,
    });

    // Audit log — bypass the OPS_AUDIT_ACTIONS allow-list because
    // we write directly via the Admin SDK. The AuditPage falls back
    // to a neutral pill for unknown actions, but we add an explicit
    // entry for the operator to see in their feed.
    try {
      await admin.firestore().collection("auditLogs").add({
        actorUid:    request.auth!.uid,
        actorEmail:  token.email ?? null,
        action:      "maintenance_mode_set",
        targetType:  "appConfig",
        targetId:    "runtime",
        metadata:    { enabled, message, etaMs },
        ip:          extractClientIp(request.rawRequest),
        userAgent:   String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240),
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.warn("[maintenance] audit write failed:", err);
    }

    return result;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Marketer referral codes — admin-issued custom codes for campaigns.
//
// These live in the same /referralCodes collection as user-generated codes,
// distinguished by `type: "marketer"`. The signup-time application flow
// (applyReferralCode above) dispatches user vs marketer codes
// transparently — the marketer code path credits the NEW USER with
// the configured bonus, increments the code's redemptionCount, and
// stamps `referredByMarketerCode` on the user doc so it's traceable
// in support / analytics.
//
// All three callables are admin-only, audit-logged, and write through
// the marketerCodes module which centralises validation + transaction
// logic.
// ─────────────────────────────────────────────────────────────────────────────

async function writeMarketerCodeAudit(
  request: any,
  action: "marketer_code_created" | "marketer_code_toggled" | "marketer_code_deleted",
  targetCode: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.firestore().collection("auditLogs").add({
      actorUid:    request.auth!.uid,
      actorEmail:  request.auth?.token?.email ?? null,
      action,
      targetType:  "referralCode",
      targetId:    targetCode,
      metadata,
      ip:          extractClientIp(request.rawRequest),
      userAgent:   String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240),
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[marketer-code] audit write failed:", err);
  }
}

export const createMarketerReferralCode = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const result = await createMarketerCode({
      code:                    String(request.data?.code ?? ""),
      marketerName:            String(request.data?.marketerName ?? ""),
      bonusCreditsForNewUser:  typeof request.data?.bonusCreditsForNewUser === "number"
        ? request.data.bonusCreditsForNewUser
        : undefined,
      expiresAtMs:             typeof request.data?.expiresAtMs === "number" ? request.data.expiresAtMs : null,
      maxRedemptions:          typeof request.data?.maxRedemptions === "number" ? request.data.maxRedemptions : null,
      actorUid:                request.auth!.uid,
    });
    await writeMarketerCodeAudit(request, "marketer_code_created", result.code, {
      marketerName:            request.data?.marketerName ?? null,
      bonusCreditsForNewUser:  request.data?.bonusCreditsForNewUser ?? null,
      expiresAtMs:             request.data?.expiresAtMs ?? null,
      maxRedemptions:          request.data?.maxRedemptions ?? null,
    });
    return result;
  },
);

export const listMarketerReferralCodes = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const rows = await listMarketerCodes();
    return { rows };
  },
);

export const setMarketerReferralCodeEnabled = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const code    = String(request.data?.code ?? "");
    const enabled = request.data?.enabled === true;
    await setMarketerCodeEnabled(code, enabled);
    await writeMarketerCodeAudit(request, "marketer_code_toggled", code.toUpperCase(), { enabled });
    return { ok: true as const, code: code.toUpperCase(), enabled };
  },
);

export const deleteMarketerReferralCode = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const code = String(request.data?.code ?? "").trim().toUpperCase();

    // Snapshot the doc BEFORE deleting so the audit log carries the
    // marketer name + redemption count at the moment of deletion.
    // Otherwise the audit entry would just have the code string, with
    // no context for forensic review.
    const snap = await admin.firestore().collection("referralCodes").doc(code).get();
    const before = snap.exists ? snap.data() ?? {} : null;

    await deleteMarketerCode(code);

    await writeMarketerCodeAudit(request, "marketer_code_deleted", code, {
      marketerName:           before?.marketerName ?? null,
      bonusCreditsForNewUser: before?.bonusCreditsForNewUser ?? null,
      redemptionCount:        before?.redemptionCount ?? 0,
    });
    return { ok: true as const, code };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Ops portal — admin allowlist management
//
// inviteOpsAdmin / listOpsAdmins / revokeOpsAdmin are the three
// callables behind the ops-portal /admins page. They wrap the
// helpers in opsAdmins.ts with the same admin-gate-and-audit
// pattern every other privileged callable uses.
//
// Invite specifically reuses the same returnUrl shape check as
// sendOpsSignInLink so a malicious admin can't trick us into
// emailing a sign-in link to a crafted phishing URL — Firebase's
// own authorized-domains list is still the deep gate, but
// rejecting unknown origins at the function layer is the
// fail-fast.
// ─────────────────────────────────────────────────────────────────────────────

async function writeOpsAdminAudit(
  request: any,
  action: "admin_invited" | "admin_revoked",
  targetUid: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.firestore().collection("auditLogs").add({
      actorUid:    request.auth!.uid,
      actorEmail:  request.auth?.token?.email ?? null,
      action,
      targetType:  "opsAdmin",
      targetId:    targetUid,
      metadata,
      ip:          extractClientIp(request.rawRequest),
      userAgent:   String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240),
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[ops-admin] audit write failed:", err);
  }
}

export const listOpsAdminsFn = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const rows = await listOpsAdmins();
    return { rows };
  },
);

export const inviteOpsAdminFn = onCall(
  { ...LIGHT_OPTS, secrets: [RESEND_API_KEY] },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const email = String(request.data?.email ?? "");
    const returnUrl = String(request.data?.returnUrl ?? "");

    // Same returnUrl allow-list as sendOpsSignInLink. Reuses the same
    // predicate so any future ops-portal origin we add only has to be
    // registered in one place.
    let returnOrigin: string;
    try {
      returnOrigin = new URL(returnUrl).origin;
    } catch {
      throw new HttpsError("invalid-argument", "Invalid returnUrl.");
    }
    if (!isAllowedOpsPortalOrigin(returnOrigin)) {
      console.warn("[ops-admin-invite] rejected returnUrl origin:", returnOrigin);
      throw new HttpsError("invalid-argument", "Unauthorized returnUrl origin.");
    }

    const result = await inviteOpsAdmin({
      email,
      returnUrl,
      resendKey: RESEND_API_KEY.value(),
    });

    await writeOpsAdminAudit(request, "admin_invited", result.uid, {
      email:       result.email,
      granted:     result.granted,
      userCreated: result.userCreated,
      emailSent:   result.emailSent,
    });

    return result;
  },
);

export const revokeOpsAdminFn = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const targetUid = String(request.data?.uid ?? "");
    if (!targetUid) {
      throw new HttpsError("invalid-argument", "Missing target uid.");
    }
    const result = await revokeOpsAdmin({
      targetUid,
      actorUid: request.auth!.uid,
    });
    if (result.revoked) {
      await writeOpsAdminAudit(request, "admin_revoked", targetUid, { actor: request.auth!.uid });
    }
    return result;
  },
);
