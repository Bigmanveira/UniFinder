import { onCall, onRequest, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { generateClaudeMatchExplanation } from "./claudeExplainMatches.js";
import { sendWaitlistWelcome } from "./waitlistEmail.js";
import { sendLaunchAnnouncement } from "./launchAnnouncementEmail.js";
import { buildBulkEmailHtml, buildBulkEmailText } from "./bulkEmailChrome.js";
import { BULK_EMAIL_TEMPLATES } from "./bulkEmailTemplates.js";
import { Resend } from "resend";
import {
  generateOfficerTurn, scoreVisaInterview, VISA_DISCLAIMER,
  pickIntroQuestion,
  type OfficerTurnResult,
  type TranscriptTurn,
} from "./visaInterview.js";
import { createHeyGenSessionToken, endHeyGenSession } from "./liveAvatarSession.js";
import { synthesizeOfficerAudio } from "./avatarTts.js";
import { extractVisaDocument, type VisaDocumentType, type ExtractedDocument } from "./visaDocExtractor.js";
import {
  isApprovedVisaQuestionText,
  isForbiddenVisaQuestionText,
  VISA_QUESTION_BANK_INFO,
} from "./visaQuestionRetriever.js";
import {
  generateAcademicCv,
  extractCvText,
  type AcademicCvMode,
} from "./academicCv.js";
import { aiMatchSchools, type AiCandidate } from "./aiMatch.js";
import {
  initPaystackTransaction,
  verifyPaystackWebhook,
  applyPaystackChargeSuccess,
  applyPaystackRefund,
} from "./paystackPayments.js";
import { logUserActivity } from "./userActivityLogger.js";
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
  setOpsAdminRole,
  migrateAdminsToFounders,
  OPS_ROLES,
  type OpsRole,
} from "./opsAdmins.js";
import { logError } from "./errorLogger.js";
import { createRateLimiter, extractClientIp } from "./rateLimiter.js";
import { answerSupportQuestion, type SupportChatHistoryItem } from "./supportChat.js";

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

type UserAccountStatus = "active" | "restricted" | "deactivated" | "deleted";

function readAccountStatus(data: admin.firestore.DocumentData | undefined): UserAccountStatus {
  const value = data?.accountStatus;
  return value === "restricted" || value === "deactivated" || value === "deleted"
    ? value
    : "active";
}

async function assertUserAppAccess(request: {
  auth?: { uid?: string; token?: Record<string, unknown> } | null;
}): Promise<void> {
  await assertNotInMaintenance(request);
  if (request.auth?.token?.admin === true) return;

  const uid = request.auth?.uid;
  if (!uid) return;

  const snap = await admin.firestore().collection("users").doc(uid).get();
  const status = readAccountStatus(snap.exists ? snap.data() : undefined);
  if (status === "active") return;

  const message = status === "restricted"
    ? "Your account is currently restricted. Contact support for assistance."
    : "Your account is currently unavailable. Contact support for assistance.";
  throw new HttpsError("permission-denied", message);
}

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

// supportChat: public so signed-out visitors can resolve login, pricing,
// and FAQ questions. Keep the window short enough for a real conversation
// while bounding anonymous Claude spend from one IP.
const supportChatRateLimit = createRateLimiter({
  maxPerWindow: 30,
  windowMs:     10 * 60 * 1000,   // 10 minutes
});

// logClientError: public observability endpoint. Legit users should only
// generate a handful of reports per session, but a broken browser path can
// fire repeatedly. This cap keeps visibility while bounding spam.
const clientErrorRateLimit = createRateLimiter({
  maxPerWindow: 60,
  windowMs:     10 * 60 * 1000,   // 10 minutes
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
//   • http://localhost — ONLY when running under the Functions emulator
//
// Why the emulator gate: a deployed (production) function should never
// generate magic-link / invite emails pointing at localhost. The
// returnUrl is baked into the email, so if a founder fires an invite
// from a local dev session, the live function would happily produce a
// link the invitee can't click. Caught one of these in the wild — a
// production-deployed sign-in email had continueUrl=http://localhost:5173.
// Now production refuses; emulator runs still allow localhost so the
// dev workflow keeps working.
const FUNCTIONS_EMULATOR_MODE = process.env.FUNCTIONS_EMULATOR === "true";

function isAllowedOpsPortalOrigin(origin: string): boolean {
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  const { protocol, hostname } = parsed;
  if (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return FUNCTIONS_EMULATOR_MODE;
  }
  if (protocol !== "https:") return false;
  if (hostname === "collegeready.io" || hostname.endsWith(".collegeready.io")) return true;
  if (hostname.endsWith(".vercel.app")) return true;
  return false;
}

/** Throws a specific HttpsError explaining WHY a returnUrl was rejected.
 *  Used after isAllowedOpsPortalOrigin returns false so the caller sees
 *  a useful message — "you're on localhost, fire from the live portal"
 *  instead of a generic "invalid-argument" they'd have to debug. */
function rejectReturnUrl(origin: string, source: "ops-signin" | "ops-admin-invite" | "user-signin"): never {
  let parsed: URL | null = null;
  try { parsed = new URL(origin); } catch { /* keep null */ }
  if (parsed && parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
    throw new HttpsError(
      "failed-precondition",
      "Localhost URLs aren't allowed from production functions. Sign-in emails fired from localhost embed the wrong URL into the magic link, so the invitee lands on a broken page. Open the live ops portal and try again from there.",
    );
  }
  console.warn(`[${source}] rejected returnUrl origin:`, origin);
  throw new HttpsError("invalid-argument", `Unauthorized returnUrl origin: ${origin}`);
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
// Reveal-bucket pricing — match reports now unlock the TARGET bucket
// by default (the most actionable cohort for an applicant). Reach +
// Safety stay locked behind a 5-credit per-bucket reveal so users
// who want the full picture have to top up. A user starting with the
// 2-credit signup grant spends 1 on unlock, has 1 left, then has to
// buy a pack to see the other two buckets — by design, this is the
// new revenue funnel.
const REVEAL_BUCKET_CREDIT_COST = 5;

// Visa interview preview: free 3-minute taste of the live avatar so
// users without 15 credits still experience the USP and convert
// because the credit ask now buys a known-good experience rather than
// a black-box "is it worth $5?" gamble. Guardrails:
//   - Hard 3-minute server-side cap (enforced in generateOfficerTurn
//     via maxDurationSec — client trust would let someone open devtools
//     and stretch the session).
//   - 7-day per-user cooldown so a single account can't burn HeyGen
//     minutes on repeated previews.
//   - No credits charged. No scored report. Paid 15-credit session is
//     the only path to the report.
//   - Founder accounts skip the preview path entirely (they always
//     get the full paid flow with no charge).
const VISA_PREVIEW_DURATION_SEC = 180;
const VISA_PAID_DURATION_SEC    = 300;
const VISA_PREVIEW_COOLDOWN_DAYS = 7;
const VISA_APPLICANT_CONTEXTS = new Set([
  "previous_refusal",
  "changed_school_or_program",
  "changed_funding_or_sponsor",
  "document_practice",
  "international_travel_history",
]);

// Academic CV Studio — three AI tools with a free-preview + paid-unlock
// model. Generation runs once on submit (Sonnet, ~$0.015 per doc on our
// side). The free preview is the first ~30% of the document; unlocking
// the rest costs credits. Cost tiers reflect compute weight + value:
//   - review:  5 credits — read user's CV + critique + rewrite (one Claude call)
//   - build:   8 credits — generate from a structured intake (longest output)
//   - convert: 8 credits — restructure a professional CV (Claude has to interpret)
// All three sit above the 2-credit signup grant, so a new user always
// hits the buy-credits paywall before unlocking.
//
// Abuse cap: each user can run a max of ACADEMIC_CV_FREE_GENERATIONS_PER_DAY
// free previews per tool per 24h. Without the cap, a single user could
// generate unlimited Sonnet calls without ever paying.
const ACADEMIC_CV_REVIEW_CREDIT_COST  = 5;
const ACADEMIC_CV_BUILD_CREDIT_COST   = 8;
const ACADEMIC_CV_CONVERT_CREDIT_COST = 8;
const ACADEMIC_CV_FREE_GENERATIONS_PER_DAY = 1;
function academicCvCreditCost(mode: AcademicCvMode): number {
  return mode === "review"  ? ACADEMIC_CV_REVIEW_CREDIT_COST
       : mode === "convert" ? ACADEMIC_CV_CONVERT_CREDIT_COST
       :                      ACADEMIC_CV_BUILD_CREDIT_COST;
}

// HeyGen plan-side concurrent-session cap. The base plan allows 3
// simultaneous LiveKit rooms; anything beyond that hits HTTP 429.
// We enforce the cap on our side BEFORE charging credits so a user
// who tries to start when rooms are full sees a friendly "rooms full,
// try again" message instead of getting charged then watching the
// avatar fail to load. Update this constant if the HeyGen plan
// upgrade lifts the cap.
const HEYGEN_CONCURRENT_SESSIONS_CAP = 3;

/**
 * Count visa interview sessions that currently hold a HeyGen room.
 * "Currently hold" = avatarStartedAt within the last 10 minutes AND
 * avatarStatus is anything OTHER than ended/failed/aborted_at_capacity.
 *
 * Why 10 minutes: visa interviews hard-cap at 5 min, HeyGen reaps
 * idle rooms server-side around 10. A session older than that is
 * guaranteed reaped regardless of what our local status field says —
 * skip it cheaply rather than scanning the whole collection.
 */
async function countActiveHeygenSessions(db: FirebaseFirestore.Firestore): Promise<number> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const snap = await db.collection("visaInterviewSessions")
    .where("avatarStartedAt", ">", admin.firestore.Timestamp.fromDate(tenMinAgo))
    .get();
  let active = 0;
  for (const d of snap.docs) {
    const status = d.data()?.avatarStatus;
    if (status !== "ended" && status !== "failed" && status !== "aborted_at_capacity") {
      active++;
    }
  }
  return active;
}

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readShortString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeClientSource(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160);
  return cleaned.startsWith("client.") ? cleaned : `client.${cleaned || "unknown"}`;
}

function readClientContext(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) return {};
  try {
    const json = JSON.stringify(value);
    if (json.length > 8_000) {
      return {
        truncated: true,
        originalBytes: json.length,
        keys: Object.keys(value).slice(0, 80),
      };
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {
      parseFailed: true,
      keys: Object.keys(value).slice(0, 80),
    };
  }
}

// ============================================================
// Test Function
// ============================================================

export const testFunction = onCall({ ...LIGHT_OPTS }, async () => {
  return { ok: true, message: "Firebase Functions is working for UniFinder" };
});

// ============================================================
// logClientError — browser-side error capture for ops visibility.
//
// Firestore Rules intentionally block direct client writes to /errorLogs.
// This callable is the narrow ingestion path: rate-limited, sanitized,
// auth-optional, and written through the existing Admin SDK logger so the
// ops Errors page can see user-facing failures, not just backend failures.
// ============================================================

export const logClientError = onCall(
  {
    ...LIGHT_OPTS,
    timeoutSeconds: 10,
    memory: "256MiB",
  },
  async (request) => {
    const ip = extractClientIp(request.rawRequest);
    const rateKey = request.auth?.uid ? `uid:${request.auth.uid}` : `ip:${ip}`;
    const limit = clientErrorRateLimit(rateKey);
    if (!limit.allowed) {
      return { ok: false as const, throttled: true as const };
    }

    const data = isPlainRecord(request.data) ? request.data : {};
    const source = normalizeClientSource(readShortString(data.source, 160) ?? "client.unknown");
    const severity = data.severity === "warning" ? "warning" : "error";
    const message = readShortString(data.message, 1_000) ?? "Unknown client error";
    const context = readClientContext(data.context);

    await logError({
      category: "client",
      source,
      severity,
      message,
      userId: request.auth?.uid ?? null,
      context: {
        ...context,
        name: readShortString(data.name, 120) ?? null,
        code: readShortString(data.code, 120) ?? null,
        stack: readShortString(data.stack, 4_000) ?? null,
        page: readShortString(data.page, 300) ?? null,
        serverUserAgent: readShortString(request.rawRequest?.headers?.["user-agent"], 240) ?? null,
        signedIn: Boolean(request.auth?.uid),
      },
    });

    return { ok: true as const };
  },
);

// ============================================================
// supportChat — public, retrieval-grounded product support.
//
// The browser sends only the current message, a short session transcript,
// and the current route. No chat text is persisted. The helper retrieves
// from a curated app-only knowledge base before Claude is called; questions
// with no matching verified facts return a deterministic escalation instead.
// ============================================================

export const supportChat = onCall(
  {
    ...HEAVY_OPTS,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    const ip = extractClientIp(request.rawRequest);
    const rateKey = request.auth?.uid ? `uid:${request.auth.uid}` : `ip:${ip}`;
    const limit = supportChatRateLimit(rateKey);
    if (!limit.allowed) {
      const retrySeconds = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));
      throw new HttpsError(
        "resource-exhausted",
        `Too many support messages. Try again in ${retrySeconds} seconds.`,
      );
    }

    const message = typeof request.data?.message === "string"
      ? request.data.message.trim()
      : "";
    if (!message || message.length > 1200) {
      throw new HttpsError(
        "invalid-argument",
        "Message must be between 1 and 1200 characters.",
      );
    }

    const route = typeof request.data?.route === "string"
      ? request.data.route.trim().slice(0, 160)
      : "/";
    const rawHistory = Array.isArray(request.data?.history)
      ? request.data.history.slice(-8)
      : [];
    const history: SupportChatHistoryItem[] = rawHistory
      .filter((item: any) =>
        (item?.role === "user" || item?.role === "assistant") &&
        typeof item?.content === "string"
      )
      .map((item: any) => ({
        role: item.role,
        content: item.content.trim().slice(0, 1000),
      }));

    const result = await answerSupportQuestion({
      message,
      history,
      route,
      signedIn: !!request.auth?.uid,
      apiKey: ANTHROPIC_API_KEY.value(),
    });

    if (result.status === "fallback" && result.errorMessage) {
      console.warn("[supportChat] Claude fallback:", result.errorMessage);
      void logError({
        category: "ai_call",
        source: "supportChat.claude_fallback",
        severity: "warning",
        message: result.errorMessage,
        userId: request.auth?.uid ?? null,
        context: {
          route,
          signedIn: !!request.auth?.uid,
        },
      });
    }

    return result.response;
  },
);

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
  await assertUserAppAccess(request);
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

  // Stamp the activity log if the apply landed (any non-error result
  // counts). Records the status so support can see "did this user
  // actually apply a code, and what happened with it?" at a glance.
  if (result && (result.ok === true || result.reason === "already_referred")) {
    void logUserActivity({
      userId:     uid,
      action:     "referral_code_applied",
      targetType: "referralCode",
      targetId:   code,
      metadata:   {
        referrerUid,
        status:        result.ok ? result.status : "already_referred",
        creditsAwarded: result.ok && result.status === "paid_out" ? result.creditsAwarded : 0,
      },
    });
  }

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
    await assertUserAppAccess(request);
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
    await assertUserAppAccess(request);
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
        // Per-bucket reveal gating. Reach opens by default after the
        // initial 1-credit unlock — it's the aspirational cohort users
        // are most curious about and the strongest hook to come back.
        // Target + Safety stay locked behind revealMatchReportBucket
        // (5 credits each). Older reports (pre-feature) lack this
        // field — frontend treats missing as "all unlocked" so legacy
        // unlocks aren't retroactively re-gated.
        unlockedBuckets:      { reach: true, target: false, safety: false },
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

    // Stamp the user's activity log so the unlock shows up on their
    // detail page next to the credit-transactions ledger.
    void logUserActivity({
      userId:     uid,
      action:     "match_report_unlocked",
      targetType: "matchReport",
      targetId:   reportRef.id,
      metadata:   {
        creditsUsed:         founder ? 0 : MATCH_REPORT_CREDIT_COST,
        founderBypass:       founder,
        aiModel:             AI_MODEL,
        aiStatus:            aiResult.status,
        eligibleSchoolCount: programEligibleMatches.length,
      },
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
 * Milliseconds since the interview proper started. Primary signal is
 * `session.interviewStartedAt` (set in the doc handler when the user
 * transitions out of the documents phase). Falls back to `session.startedAt`
 * (set on session creation) when interviewStartedAt is missing — that
 * happens whenever Claude's stage transition skips "introduction" and
 * jumps straight to e.g. "study_plan", which the previous narrow set
 * condition didn't catch. Without this fallback, elapsedSinceInterviewStart
 * could return 0 forever and the preview's 3-minute cap would never fire,
 * letting a 2-credit user run the full 5-minute Claude budget.
 */
function elapsedSinceInterviewStart(session: any): number {
  const ts = session?.interviewStartedAt ?? session?.startedAt ?? session?.createdAt;
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
      turns.push({
        role: data.role,
        text: String(data.text ?? ""),
        stage: typeof data.stage === "string" ? data.stage : undefined,
        questionId: typeof data.questionId === "string" ? data.questionId : undefined,
        categoryId: typeof data.categoryId === "string" ? data.categoryId : undefined,
      });
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
      userId: args.userId,
      sessionId: args.sessionId,
      type: args.type,
      status: args.status,
      ...(args.errorMessage ? { errorMessage: args.errorMessage } : {}),
      provider:  args.type === "visa_interview_next_question" ? "rag" : "anthropic",
      model:     args.type === "visa_interview_next_question" ? "deterministic-rag-v2" : "claude-haiku-4-5",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err: any) {
    console.warn("[visa] aiRuns log failed:", err?.message);
  }
}

// ── revealMatchReportBucket ──────────────────────────────────────────────────
// Pay-per-reveal: after the initial 1-credit unlock opens the Reach
// bucket, users spend REVEAL_BUCKET_CREDIT_COST (5) per additional
// bucket (Target or Safety). Atomic transaction so a parallel spend
// can't race the wallet out of order.
//
// Idempotency: if the requested bucket is already unlocked on this
// report (e.g. the user double-tapped the Reveal button before the
// UI updated), we short-circuit without re-charging. The frontend
// also disables the button after click, but defence-in-depth here.
//
// Founder bypass mirrors unlockMatchReport — founders flip the
// bucket flag without paying, and a creditTransactions row is still
// written (type:"founder_bucket_reveal", amount:0) so the audit
// trail captures the action.
function assertGroundedVisaOfficerTurn(officer: OfficerTurnResult, sessionId: string): void {
  if (officer.isFinalQuestion) return;
  if (officer.questionId && isApprovedVisaQuestionText(officer.questionId, officer.text)) return;

  console.error("[visa] blocked unapproved officer question", {
    sessionId,
    questionId: officer.questionId ?? null,
    text: officer.text,
  });
  throw new HttpsError(
    "internal",
    "The next interview question failed the approved question-bank check. Please try again.",
  );
}

export const revealMatchReportBucket = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    await assertUserAppAccess(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to reveal more schools.");

    const reportId = String(request.data?.reportId ?? "").trim();
    const bucket   = String(request.data?.bucket ?? "").trim() as "target" | "safety";
    if (!reportId) {
      throw new HttpsError("invalid-argument", "Missing reportId.");
    }
    if (bucket !== "target" && bucket !== "safety") {
      // Reach is free with the initial unlock; we don't accept it
      // as an explicit reveal target. Front-end won't surface a
      // "Reveal Reach" button — this is the backstop.
      throw new HttpsError("invalid-argument", "Bucket must be 'target' or 'safety'.");
    }

    const db        = admin.firestore();
    const reportRef = db.collection("matchReports").doc(reportId);
    const walletRef = db.collection("creditWallets").doc(uid);
    const txRef     = db.collection("creditTransactions").doc();
    const now       = admin.firestore.FieldValue.serverTimestamp();
    const founder   = isFounderEmail(request.auth?.token?.email as string | undefined);

    const result = await db.runTransaction(async (tx) => {
      const reportSnap = await tx.get(reportRef);
      if (!reportSnap.exists) {
        throw new HttpsError("not-found", "Report not found.");
      }
      const reportData = reportSnap.data() ?? {};
      if (reportData.userId !== uid) {
        // Refuse cross-user reveals — a user shouldn't be able to
        // pay to unlock someone else's report.
        throw new HttpsError("permission-denied", "Not your report.");
      }

      const currentUnlocks = (reportData.unlockedBuckets ?? {}) as Record<string, boolean | undefined>;
      if (currentUnlocks[bucket] === true) {
        // Already unlocked — no-op, no charge.
        return { ok: true as const, alreadyUnlocked: true as const, newBalance: null };
      }

      // Wallet check + deduction. Founder bypass skips the balance
      // gate but still writes the ledger row for audit.
      const walletSnap = await tx.get(walletRef);
      const credits = walletSnap.exists
        ? (walletSnap.data()?.credits ?? 0)
        : FREE_CREDITS_ON_SIGNUP;
      let newBalance: number | null = null;
      if (!founder) {
        if (credits < REVEAL_BUCKET_CREDIT_COST) {
          throw new HttpsError("resource-exhausted", "Insufficient credits to reveal this bucket.");
        }
        newBalance = credits - REVEAL_BUCKET_CREDIT_COST;
        if (walletSnap.exists) {
          tx.update(walletRef, { credits: newBalance, updatedAt: now });
        } else {
          tx.set(walletRef, { credits: newBalance, updatedAt: now });
        }
      }

      tx.update(reportRef, {
        [`unlockedBuckets.${bucket}`]: true,
        updatedAt: now,
      });

      tx.set(txRef, {
        userId:   uid,
        amount:   founder ? 0 : -REVEAL_BUCKET_CREDIT_COST,
        type:     founder ? "founder_bucket_reveal" : "match_report_bucket_reveal",
        reportId,
        bucket,
        createdAt: now,
      });

      return { ok: true as const, alreadyUnlocked: false as const, newBalance };
    });

    // Activity log (post-commit, side-effect, never blocks the
    // primary action). Skipped on idempotent no-op so the timeline
    // doesn't fill up with duplicate entries on double-clicks.
    if (!result.alreadyUnlocked) {
      void logUserActivity({
        userId:     uid,
        action:     "match_report_bucket_revealed",
        targetType: "matchReport",
        targetId:   reportId,
        metadata:   {
          bucket,
          creditsUsed:   founder ? 0 : REVEAL_BUCKET_CREDIT_COST,
          founderBypass: founder,
        },
      });
    }

    return result;
  },
);

// ── startVisaInterviewSession ─────────────────────────────────────────────────
export const startVisaInterviewSession = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    await assertUserAppAccess(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to start a practice interview");

    const { mode, disclaimerAccepted, clientRequestId, isReturningApplicant } = request.data ?? {};
    if (disclaimerAccepted !== true) {
      throw new HttpsError("failed-precondition", "Disclaimer must be accepted");
    }
    const interviewMode: "text" | "voice" | "avatar" =
      mode === "voice" || mode === "avatar" ? mode : "text";
    const applicantContexts = Array.isArray(request.data?.applicantContexts)
      ? [...new Set(
          request.data.applicantContexts
            .filter((value: unknown): value is string => typeof value === "string")
            .filter((value: string) => VISA_APPLICANT_CONTEXTS.has(value)),
        )].slice(0, VISA_APPLICANT_CONTEXTS.size)
      : [];
    const returningApplicant = isReturningApplicant === true || applicantContexts.includes("previous_refusal");

    const db = admin.firestore();
    const founder = isFounderEmail(request.auth?.token?.email as string | undefined);

    // Auto-detect preview vs paid mode based on wallet balance. Users
    // with ≥15 credits get the full paid 5-min interview + scored
    // report. Users with < 15 credits get a free 3-min preview gated
    // by a 7-day cooldown so they can experience the live avatar
    // before topping up. Founders always get paid mode (the cooldown
    // would block their internal QA otherwise; their bypass writes a
    // zero-amount ledger row).
    const walletPeek = await db.collection("creditWallets").doc(uid).get();
    const currentCredits = walletPeek.exists ? (walletPeek.data()?.credits ?? 0) : FREE_CREDITS_ON_SIGNUP;
    const wantsPreview = !founder && currentCredits < VISA_INTERVIEW_CREDIT_COST;

    // 7-day preview cooldown — protects HeyGen minutes from a single
    // account burning previews on loop. Founders bypass the cooldown
    // (they're on the paid path anyway). Failure to enforce here =
    // a user could refresh and start a new preview every 3 minutes,
    // running our HeyGen bill on someone who'll never convert.
    if (wantsPreview) {
      const cooldownMs = VISA_PREVIEW_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - cooldownMs);
      const recentPreview = await db.collection("visaInterviewSessions")
        .where("userId", "==", uid)
        .where("kind", "==", "preview")
        .where("createdAt", ">", cutoff)
        .limit(1)
        .get();
      if (!recentPreview.empty) {
        throw new HttpsError(
          "resource-exhausted",
          `You've already used your free preview interview in the last ${VISA_PREVIEW_COOLDOWN_DAYS} days. Top up 15 credits to start a full mock interview with a scored report.`,
          { reason: "preview_cooldown_active" },
        );
      }
    }
    const sessionKind: "preview" | "paid" = wantsPreview ? "preview" : "paid";
    const durationSec = wantsPreview ? VISA_PREVIEW_DURATION_SEC : VISA_PAID_DURATION_SEC;

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
          // Replay path covers paid sessions only (the type filter above
          // is "visa_interview_start"). Preview sessions don't pay so a
          // duplicate call just creates two free sessions — harmless.
          return {
            sessionId:              existingSessionId,
            firstMessage:           VISA_INTERVIEW_GREETING,
            requiresDocumentUpload: "ds160_confirmation" as const,
            mode:                   interviewMode,
            kind:                   "paid" as const,
            durationSec:            VISA_PAID_DURATION_SEC,
            disclaimer:             VISA_DISCLAIMER,
            creditsUsed:            VISA_INTERVIEW_CREDIT_COST,
            idempotentReplay:       true,
          };
        }
      }
    }

    // HeyGen concurrency pre-check. Only relevant for avatar mode —
    // text/voice interviews don't hold a HeyGen room. Done BEFORE the
    // credit-deduction transaction so a user who hits the cap sees a
    // friendly popup ("rooms full, try again") without losing 15
    // credits to a session they can never actually run.
    //
    // The check has a race window: between the count and the
    // createLiveAvatarSession call, another user could grab the
    // remaining slot. We catch that case in createLiveAvatarSession
    // (429 from HeyGen → refund the credits + mark the session
    // aborted_at_capacity) so the race never leaves a paying user
    // with no interview.
    if (interviewMode === "avatar") {
      const activeCount = await countActiveHeygenSessions(db);
      if (activeCount >= HEYGEN_CONCURRENT_SESSIONS_CAP) {
        throw new HttpsError(
          "resource-exhausted",
          "Interview rooms are full at the moment. Kindly check back shortly.",
          { reason: "heygen_at_capacity", activeCount, cap: HEYGEN_CONCURRENT_SESSIONS_CAP },
        );
      }
    }

    const walletRef  = db.collection("creditWallets").doc(uid);
    const sessionRef = db.collection("visaInterviewSessions").doc();
    const txRef      = db.collection("creditTransactions").doc();
    const firstMsgRef = db.collection("visaInterviewMessages").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Atomic: deduct credit (paid mode only) + create session + create first officer message + log usage
    await db.runTransaction(async (tx) => {
      const wallet = await tx.get(walletRef);
      let credits: number;
      if (!wallet.exists) {
        credits = FREE_CREDITS_ON_SIGNUP;
        tx.set(walletRef, { credits: FREE_CREDITS_ON_SIGNUP, updatedAt: now });
      } else {
        credits = wallet.data()?.credits ?? 0;
      }
      // Three branches for credit handling:
      //   1. Founder → bypass deduction, write zero-amount ledger row
      //   2. Preview → free, no wallet touch, no ledger row (or zero one
      //      for analytics — see below)
      //   3. Paid → standard 15-credit deduction
      // Preview already passed the cooldown check above, so we know
      // it's not abuse. The "Insufficient credits" hard error can no
      // longer fire — that case routes into preview mode instead.
      if (!founder && sessionKind === "paid") {
        if (credits < VISA_INTERVIEW_CREDIT_COST) {
          // Should never hit — auto-detect routes to preview when credits
          // are low. Belt-and-braces only.
          throw new HttpsError("resource-exhausted", "Insufficient credits");
        }
        tx.update(walletRef, { credits: credits - VISA_INTERVIEW_CREDIT_COST, updatedAt: now });
      }

      tx.set(sessionRef, {
        userId:               uid,
        visaType:             "F1",
        status:               "active",
        kind:                 sessionKind,         // "preview" | "paid"
        previewDurationSec:   durationSec,         // server-enforced cap consulted by generateOfficerTurn
        isReturningApplicant: returningApplicant,  // routes "what has changed?" prompt addition
        applicantContexts,
        mode:                 interviewMode,
        avatarProvider:       interviewMode === "avatar" ? "heygen_liveavatar" : "none",
        currentStage:         "documents",
        questionCount:        0, // the greeting is not a real interview question
        questionIdsAsked:     [],
        categoryIdsCovered:   [],
        questionBankName:     VISA_QUESTION_BANK_INFO.name,
        questionBankVersion:  VISA_QUESTION_BANK_INFO.version,
        disclaimerAccepted:   true,
        documentsRequested:   { i20: false, ds160: true },
        documentsUploaded:    { i20: false, ds160: false },
        creditsUsed:          sessionKind === "paid" ? VISA_INTERVIEW_CREDIT_COST : 0,
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

      // Ledger row. Preview sessions log a zero-amount row with
      // type:"visa_interview_preview" so analytics can attribute
      // HeyGen costs back to the preview funnel and measure preview→paid
      // conversion. Paid sessions write the standard negative-amount
      // deduction. Founders write a zero-amount founder_visa_interview
      // row regardless of which path they took.
      const ledgerType =
        founder              ? "founder_visa_interview" :
        sessionKind === "preview" ? "visa_interview_preview" :
        "visa_interview_start";
      const ledgerAmount =
        sessionKind === "paid" && !founder ? -VISA_INTERVIEW_CREDIT_COST : 0;
      tx.set(txRef, {
        userId:    uid,
        amount:    ledgerAmount,
        type:      ledgerType,
        sessionId: sessionRef.id,
        createdAt: now,
        ...(typeof clientRequestId === "string" && clientRequestId.length > 0
          ? { clientRequestId }
          : {}),
      });
    });

    // Stamp the user's activity log after the credit deduction commits.
    void logUserActivity({
      userId:     uid,
      action:     "visa_interview_started",
      targetType: "visaInterviewSession",
      targetId:   sessionRef.id,
      metadata:   {
        creditsUsed:        sessionKind === "paid" && !founder ? VISA_INTERVIEW_CREDIT_COST : 0,
        founderBypass:      founder,
        mode:               interviewMode,
        kind:               sessionKind,
        isReturningApplicant: returningApplicant,
        applicantContexts,
      },
    });

    return {
      sessionId:              sessionRef.id,
      firstMessage:           VISA_INTERVIEW_GREETING,
      // Tell the client that the very first thing it should do (after the
      // avatar speaks the greeting) is open the DS-160 upload modal.
      requiresDocumentUpload: "ds160_confirmation" as const,
      mode:                   interviewMode,
      kind:                   sessionKind,
      durationSec:            durationSec,
      disclaimer:             VISA_DISCLAIMER,
      creditsUsed:            sessionKind === "paid" && !founder ? VISA_INTERVIEW_CREDIT_COST : 0,
    };
  },
);

// ── sendVisaInterviewAnswer ──────────────────────────────────────────────────
// HOT_OPTS (not HEAVY): fires N times per interview (once per student turn).
// A cold-start here is the most painful UX failure mode — user finishes
// speaking, then stares at a "thinking" pill for 5+ seconds. Always-warm
// removes that.
export const sendVisaInterviewAnswer = onCall(
  { ...HOT_OPTS },
  async (request) => {
    await assertUserAppAccess(request);
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

    // Build a fresh transcript and select the next approved RAG question.
    const transcript = await loadTranscript(sessionId);
    const extractedDocs: ExtractedDocument[] = Object.values(session.extractedDocuments ?? {});
    const unavailableDocumentTypes: VisaDocumentType[] = [];
    if (session.documentsSkipped?.i20) unavailableDocumentTypes.push("i20");
    if (session.documentsSkipped?.ds160) unavailableDocumentTypes.push("ds160_confirmation");
    const officer = await generateOfficerTurn({
      transcript,
      questionCount: typeof session.questionCount === "number" ? session.questionCount : 1,
      extractedDocuments: extractedDocs,
      unavailableDocumentTypes,
      elapsedMs:     elapsedSinceInterviewStart(session),
      // Preview sessions: 180s; paid sessions: 300s. Fall back to 300s for
      // any legacy session that doesn't have previewDurationSec stamped
      // (those pre-date this feature so they're all paid).
      maxDurationSec: typeof session.previewDurationSec === "number" ? session.previewDurationSec : 300,
      isReturningApplicant: session.isReturningApplicant === true,
      applicantContexts: Array.isArray(session.applicantContexts) ? session.applicantContexts : [],
    });
    assertGroundedVisaOfficerTurn(officer, sessionId);

    // Persist officer reply
    const officerMsgRef = await db.collection("visaInterviewMessages").add({
      sessionId, userId: uid, role: "officer",
      text:  officer.text,
      stage: officer.stage,
      ...(officer.questionId ? { questionId: officer.questionId } : {}),
      ...(officer.categoryId ? { categoryId: officer.categoryId } : {}),
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
    if (officer.questionId) {
      updates.lastQuestionId = officer.questionId;
      updates.questionIdsAsked = admin.firestore.FieldValue.arrayUnion(officer.questionId);
    }
    if (officer.categoryId) {
      updates.lastCategoryId = officer.categoryId;
      updates.categoryIdsCovered = admin.firestore.FieldValue.arrayUnion(officer.categoryId);
    }
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
  await assertUserAppAccess(request);
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
    await assertUserAppAccess(request);
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
    let nextQuestionId: string | undefined;
    let nextCategoryId: string | undefined;

    if (isInitialDoc && isInIntroPhase && !ds160Resolved) {
      nextOfficerText = "Thank you. Now please upload your DS-160 confirmation page.";
      nextRequiresUpload = "ds160_confirmation";
      nextStage = "documents";
    } else if (isInitialDoc && isInIntroPhase && !i20Resolved) {
      nextOfficerText = VISA_I20_REQUEST_LINE;
      nextRequiresUpload = "i20";
      nextStage = "documents";
    } else if (isInitialDoc && isInIntroPhase) {
      // Both initial docs resolved (uploaded or skipped) — start with an
      // approved question-bank opener and preserve its source metadata.
      const opener = pickIntroQuestion();
      nextOfficerText = opener.text;
      nextStage = opener.stage;
      nextQuestionId = opener.questionId;
      nextCategoryId = opener.categoryId;
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
      const unavailableDocumentTypes: VisaDocumentType[] = [];
      if (session.documentsSkipped?.i20 || (isSkip && documentType === "i20")) {
        unavailableDocumentTypes.push("i20");
      }
      if (session.documentsSkipped?.ds160 || (isSkip && documentType === "ds160_confirmation")) {
        unavailableDocumentTypes.push("ds160_confirmation");
      }
      const officer = await generateOfficerTurn({
        transcript,
        questionCount: typeof session.questionCount === "number" ? session.questionCount : 1,
        extractedDocuments: Object.values(extractedDocsAfter),
        unavailableDocumentTypes,
        elapsedMs:     elapsedSinceInterviewStart(session),
        maxDurationSec: typeof session.previewDurationSec === "number" ? session.previewDurationSec : 300,
        isReturningApplicant: session.isReturningApplicant === true,
        applicantContexts: Array.isArray(session.applicantContexts) ? session.applicantContexts : [],
      });
      assertGroundedVisaOfficerTurn(officer, sessionId);
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
      nextQuestionId = officer.questionId;
      nextCategoryId = officer.categoryId;
    }

    const officerMsgRef = await db.collection("visaInterviewMessages").add({
      sessionId, userId: uid, role: "officer",
      text:  nextOfficerText,
      stage: nextStage,
      ...(nextQuestionId ? { questionId: nextQuestionId } : {}),
      ...(nextCategoryId ? { categoryId: nextCategoryId } : {}),
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
    if (nextQuestionId) {
      updates.lastQuestionId = nextQuestionId;
      updates.questionIdsAsked = admin.firestore.FieldValue.arrayUnion(nextQuestionId);
    }
    if (nextCategoryId) {
      updates.lastCategoryId = nextCategoryId;
      updates.categoryIdsCovered = admin.firestore.FieldValue.arrayUnion(nextCategoryId);
    }
    // Stamp the start time when transitioning out of the documents phase
    // into the interview proper. Used downstream to enforce the duration
    // cap. Previous condition required nextStage === "introduction" which
    // missed the case where Claude jumps straight to "study_plan" or
    // similar — leaving interviewStartedAt unset and the cap dormant.
    // Any non-documents stage marks the start of the interview proper.
    if (isInitialDoc && isInIntroPhase && nextStage !== "documents" && !session.interviewStartedAt) {
      updates.interviewStartedAt = now;
    }
    if (nextRequiresUpload === "i20")             updates["documentsRequested.i20"]   = true;
    if (nextRequiresUpload === "ds160_confirmation") updates["documentsRequested.ds160"] = true;

    await sessionRef.update(updates);

    // Stamp the activity log only for real uploads (not skip events).
    // Surfaces on the user's timeline so support can see "did Anna
    // actually receive their I-20?" without digging into the session.
    if (!isSkip) {
      void logUserActivity({
        userId:     uid,
        action:     "visa_document_uploaded",
        targetType: "visaInterviewSession",
        targetId:   sessionId,
        metadata:   {
          documentType,
          extractionStatus: extracted ? "ok" : "skipped",
        },
      });
    }

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
    await assertUserAppAccess(request);
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
    const sessionData = sessionSnap.data() as any;
    if (sessionData?.userId !== uid)          throw new HttpsError("permission-denied", "Not your session");

    // Preview sessions don't get a scored report — that's the paid
    // surface. Refuse explicitly with a kind-specific error code so the
    // client can swap in the paywall modal ("Top up 15 credits to get
    // your scored feedback") instead of showing a generic failure.
    // Legacy sessions without a `kind` field pre-date this feature so
    // they're treated as paid.
    if (sessionData?.kind === "preview") {
      throw new HttpsError(
        "permission-denied",
        "Scored reports are part of the full paid interview. Top up 15 credits to run a full mock and unlock your feedback.",
        { reason: "preview_session_no_report" },
      );
    }

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
      extractedDocuments: Object.values(sessionData?.extractedDocuments ?? {}),
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
      const refundTxRef = db.collection("creditTransactions").doc(`visa-scoring-refund_${sessionId}`);
      await db.runTransaction(async (tx) => {
        const [freshSession, wallet, existingRefund] = await Promise.all([
          tx.get(sessionRef),
          tx.get(walletRef),
          tx.get(refundTxRef),
        ]);
        const alreadyRefunded = freshSession.data()?.refundIssued === true || existingRefund.exists;
        if (alreadyRefunded) {
          if (freshSession.exists && freshSession.data()?.refundIssued !== true) {
            tx.update(sessionRef, { status: "completed", endedAt: now, updatedAt: now, refundIssued: true });
          }
          return;
        }

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
      questionBankName:              VISA_QUESTION_BANK_INFO.name,
      questionBankVersion:           VISA_QUESTION_BANK_INFO.version,
      scoringVersion:                "3.0-performance-grounded",
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

    // Stamp the activity log after the report commit. metadata captures
    // the headline score so support can spot a failed interview at a
    // glance on the user's timeline.
    void logUserActivity({
      userId:     uid,
      action:     "visa_interview_completed",
      targetType: "visaInterviewReport",
      targetId:   reportRef.id,
      metadata:   {
        sessionId,
        overallScore:  typeof reportData.overallScore === "number" ? reportData.overallScore : null,
        scoringStatus: score.status,
      },
    });

    return { reportId: reportRef.id, ...reportData };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Academic CV Studio — three AI tools (review / build / convert) sharing
// one generate-then-paywall pipeline.
//
// generateAcademicCvDocument: takes the user's input, generates the full
//   CV with Sonnet, stores it server-side, returns ONLY the preview slice
//   (~30%) + a documentId. No credits charged at this step.
// unlockAcademicCvDocument: deducts credits from the wallet, flips the
//   doc to unlocked: true, returns the full Markdown.
//
// Generation cost is borne by us up-front. To stop a single user farming
// previews, we cap free generations per user per tool per 24h. Founder
// accounts bypass both the cap AND the credit charge.
// ─────────────────────────────────────────────────────────────────────────────

const ACADEMIC_CV_MODES = new Set<string>(["review", "build", "convert"]);

export const generateAcademicCvDocument = onCall(
  { ...HEAVY_OPTS, secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    await assertUserAppAccess(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to use the CV Studio.");

    const mode = String(request.data?.mode ?? "").trim() as AcademicCvMode;
    if (!ACADEMIC_CV_MODES.has(mode)) {
      throw new HttpsError("invalid-argument", "Mode must be 'review', 'build', or 'convert'.");
    }

    // The input is either raw text (paste-text path) or a base64 file
    // (PDF / image upload path). For builder, it's a JSON string of the
    // structured intake. Cap input size at 200KB to keep Claude calls
    // bounded — a CV that won't fit in 200KB of text is malformed.
    const inputText: string | undefined = typeof request.data?.inputText === "string" ? request.data.inputText : undefined;
    const fileBase64: string | undefined = typeof request.data?.fileBase64 === "string" ? request.data.fileBase64 : undefined;
    const fileMediaType: string | undefined = typeof request.data?.fileMediaType === "string" ? request.data.fileMediaType : undefined;

    if (!inputText && !fileBase64) {
      throw new HttpsError("invalid-argument", "Provide inputText or a file (fileBase64 + fileMediaType).");
    }
    if (mode === "build" && !inputText) {
      // Builder is intake-form-driven only; PDF upload makes no sense for it.
      throw new HttpsError("invalid-argument", "Builder mode requires structured inputText (intake JSON).");
    }
    if (inputText && inputText.length > 200_000) {
      throw new HttpsError("invalid-argument", "Input is too large. Trim to under 200KB.");
    }
    if (fileBase64 && fileBase64.length > 14_000_000) {
      // 14MB base64 ≈ 10MB binary, well above any plausible single-page CV.
      throw new HttpsError("invalid-argument", "File is too large. Use a file under 10MB.");
    }

    const founder = isFounderEmail(request.auth?.token?.email as string | undefined);
    const db = admin.firestore();

    // Wallet read drives both the rate-limit-exemption decision below
    // AND the credit-cost UX on the response. We do it once here rather
    // than inside the rate-limit branch so paying users skip the cap
    // immediately on their first request.
    const walletSnap = await db.collection("creditWallets").doc(uid).get();
    const currentCredits: number = walletSnap.exists ? (walletSnap.data()?.credits ?? 0) : FREE_CREDITS_ON_SIGNUP;

    // Free-preview rate limit. The cap exists to stop a brand-new
    // free-tier user from farming Sonnet calls and never paying — NOT
    // to throttle paying users. Three exemptions:
    //
    //   1. Founder accounts (internal QA).
    //   2. Users who already own more credits than the signup grant —
    //      they've paid before, so they're trusted.
    //   3. Users with enough wallet balance right now to actually
    //      unlock this generation. If they can afford the unlock, the
    //      preview attempt is a buy-intent signal, not abuse. A user
    //      with 121 credits hitting the rate limit was the bug report
    //      that drove this change.
    //
    // If the composite index hasn't finished building yet
    // (FAILED_PRECONDITION, code 9) we LOG + SKIP rather than 500.
    // Losing the cap temporarily is far less bad than blocking every
    // legitimate user.
    const requiredCostForUnlock = academicCvCreditCost(mode);
    const isPayingUser   = currentCredits > FREE_CREDITS_ON_SIGNUP;
    const canAffordUnlock = currentCredits >= requiredCostForUnlock;
    const shouldRateLimit = !founder && !isPayingUser && !canAffordUnlock;
    if (shouldRateLimit) {
      const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
      try {
        const recent = await db.collection("academicCvDocuments")
          .where("userId", "==", uid)
          .where("mode",   "==", mode)
          .where("createdAt", ">", cutoff)
          .limit(ACADEMIC_CV_FREE_GENERATIONS_PER_DAY)
          .get();
        if (recent.size >= ACADEMIC_CV_FREE_GENERATIONS_PER_DAY) {
          throw new HttpsError(
            "resource-exhausted",
            "You've already used your free preview for this tool in the last 24 hours. Top up credits or come back tomorrow.",
            { reason: "academic_cv_rate_limited", mode },
          );
        }
      } catch (err: any) {
        if (err instanceof HttpsError) throw err;
        const code = err?.code;
        if (code === 9 || /requires an index|FAILED_PRECONDITION/i.test(String(err?.message ?? ""))) {
          console.warn("[academic-cv] rate-limit index missing — skipping cap until index builds", { mode, message: err?.message });
        } else {
          throw err;
        }
      }
    }

    // Build the input string that gets fed to Claude. PDF path runs
    // through extractCvText first; text path is used directly.
    let resolvedInput = inputText ?? "";
    if (!resolvedInput && fileBase64 && fileMediaType) {
      const extracted = await extractCvText({
        apiKey:     ANTHROPIC_API_KEY.value(),
        fileBase64,
        mediaType:  fileMediaType,
      });
      if (extracted.status !== "completed" || !extracted.text) {
        throw new HttpsError(
          "invalid-argument",
          "Could not read text from the uploaded file. Paste the CV text directly or try a clearer scan.",
          { reason: "academic_cv_extraction_failed", detail: extracted.errorMessage },
        );
      }
      resolvedInput = extracted.text;
    }

    const gen = await generateAcademicCv({
      apiKey: ANTHROPIC_API_KEY.value(),
      mode,
      input:  resolvedInput,
    });
    if (gen.status !== "completed" || !gen.fullMarkdown) {
      throw new HttpsError(
        "internal",
        "The CV generator hit a snag. Please try again in a moment.",
        { detail: gen.errorMessage },
      );
    }

    const now    = admin.firestore.FieldValue.serverTimestamp();
    const cost   = academicCvCreditCost(mode);
    const docRef = db.collection("academicCvDocuments").doc();
    const fullRef = docRef.collection("full").doc("payload");

    // Two-doc write. The public doc holds preview-safe fields and is
    // client-readable (subject to the userId-matches-auth rule). The
    // private "full" subdoc holds the fullMarkdown and is blocked from
    // client reads by Firestore Rules — the only way to fetch it is via
    // unlockAcademicCvDocument, which deducts credits first.
    const batch = db.batch();
    batch.set(docRef, {
      userId:          uid,
      mode,
      status:          "preview",
      creditCost:      cost,
      unlocked:        false,
      sourceInput:     resolvedInput.slice(0, 30_000),
      previewMarkdown: gen.previewMarkdown,
      createdAt:       now,
      updatedAt:       now,
    });
    batch.set(fullRef, {
      userId:       uid,
      fullMarkdown: gen.fullMarkdown,
      createdAt:    now,
    });
    await batch.commit();

    void logUserActivity({
      userId:     uid,
      action:     "academic_cv_generated",
      targetType: "academicCvDocument",
      targetId:   docRef.id,
      metadata:   { mode, creditCost: cost, founderBypass: founder },
    });

    return {
      documentId:      docRef.id,
      mode,
      previewMarkdown: gen.previewMarkdown,
      creditCost:      cost,
      unlocked:        false,
    };
  },
);

export const unlockAcademicCvDocument = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    await assertUserAppAccess(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to unlock your CV.");

    const documentId = String(request.data?.documentId ?? "").trim();
    if (!documentId) throw new HttpsError("invalid-argument", "Missing documentId.");

    const db        = admin.firestore();
    const docRef    = db.collection("academicCvDocuments").doc(documentId);
    const fullRef   = docRef.collection("full").doc("payload");
    const walletRef = db.collection("creditWallets").doc(uid);
    const txRef     = db.collection("creditTransactions").doc();
    const now       = admin.firestore.FieldValue.serverTimestamp();
    const founder   = isFounderEmail(request.auth?.token?.email as string | undefined);

    // Read both the public doc + the private full payload OUTSIDE the
    // transaction. The transaction only mutates the wallet + flips the
    // unlock flag.
    const [docSnap, fullSnap] = await Promise.all([docRef.get(), fullRef.get()]);
    if (!docSnap.exists) throw new HttpsError("not-found", "CV not found.");
    const docData = docSnap.data() as any;
    if (docData.userId !== uid) {
      throw new HttpsError("permission-denied", "Not your CV.");
    }
    const fullMarkdown = fullSnap.exists ? String(fullSnap.data()?.fullMarkdown ?? "") : "";
    if (!fullMarkdown) {
      throw new HttpsError("internal", "CV payload is missing on the server. Please regenerate.");
    }

    const cost: number = typeof docData.creditCost === "number" ? docData.creditCost : 5;
    const mode: AcademicCvMode = (docData.mode === "build" || docData.mode === "convert") ? docData.mode : "review";

    // Idempotency. If someone double-taps Unlock or the network retries
    // the callable, just return the full doc — no double-charge.
    if (docData.unlocked === true) {
      return {
        documentId,
        mode,
        fullMarkdown,
        unlocked:        true,
        alreadyUnlocked: true,
      };
    }

    let newBalance: number | null = null;
    await db.runTransaction(async (tx) => {
      const wallet = await tx.get(walletRef);
      const credits: number = wallet.exists ? (wallet.data()?.credits ?? 0) : FREE_CREDITS_ON_SIGNUP;
      if (!founder) {
        if (credits < cost) {
          throw new HttpsError(
            "resource-exhausted",
            "Not enough credits to unlock this CV. Top up your wallet to continue.",
            { reason: "insufficient_credits", required: cost, balance: credits },
          );
        }
        newBalance = credits - cost;
        if (wallet.exists) {
          tx.update(walletRef, { credits: newBalance, updatedAt: now });
        } else {
          tx.set(walletRef, { credits: newBalance, updatedAt: now });
        }
      }
      tx.update(docRef, {
        unlocked:  true,
        status:    "unlocked",
        unlockedAt: now,
        updatedAt:  now,
      });
      tx.set(txRef, {
        userId:    uid,
        amount:    founder ? 0 : -cost,
        type:      founder ? "founder_academic_cv_unlock" : "academic_cv_unlock",
        documentId,
        mode,
        createdAt: now,
      });
    });

    void logUserActivity({
      userId:     uid,
      action:     "academic_cv_unlocked",
      targetType: "academicCvDocument",
      targetId:   documentId,
      metadata:   { mode, creditCost: founder ? 0 : cost, founderBypass: founder },
    });

    return {
      documentId,
      mode,
      fullMarkdown,
      unlocked:        true,
      alreadyUnlocked: false,
      newBalance,
    };
  },
);

// ── createLiveAvatarSession ──────────────────────────────────────────────────
// Issues a short-lived HeyGen streaming token to the browser. Persists
// avatar lifecycle metadata on the visa session doc so we can audit usage
// and surface the avatar status in the UI.
export const createLiveAvatarSession = onCall(
  { ...HEAVY_HOT_OPTS, secrets: [HEYGEN_API_KEY] },
  async (request) => {
    await assertUserAppAccess(request);
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
      return result;
    }

    // HeyGen rejected the session. If it looks like an at-capacity
    // rejection (HTTP 429 → "rate-limited" reason text), this is the
    // race-window we expected: startVisaInterviewSession's pre-check
    // saw an open slot, but it got taken by another user before our
    // HeyGen call landed. The user has already been charged 15
    // credits but never got an interview — refund them.
    const reasonText = (result.reason ?? "").toLowerCase();
    const atCapacity = reasonText.includes("rate-limited") || reasonText.includes("rate limit") || reasonText.includes("capacity");

    if (atCapacity) {
      const founder = isFounderEmail(request.auth?.token?.email as string | undefined);
      // Mark the session aborted so the count-active-sessions helper
      // skips it (instead of counting it against the cap during its
      // 10-minute window).
      await sessionRef.update({
        avatarProvider:      "heygen_liveavatar",
        avatarStatus:        "aborted_at_capacity",
        avatarFailureReason: result.reason ?? "heygen_at_capacity",
        status:              "aborted",
        endedAt:             now,
        updatedAt:           now,
      });

      // Refund the credits the start-session callable charged. Founder
      // sessions never charged, so skip the refund there. Atomic
      // transaction so a parallel spend can't race the refund out of
      // order.
      if (!founder) {
        const userWalletRef = db.collection("creditWallets").doc(uid);
        const refundTxRef   = db.collection("creditTransactions").doc();
        await db.runTransaction(async (tx) => {
          const walletDoc = await tx.get(userWalletRef);
          const current   = walletDoc.exists ? (walletDoc.data()?.credits ?? 0) : 0;
          tx.set(userWalletRef, { credits: current + VISA_INTERVIEW_CREDIT_COST, updatedAt: now }, { merge: true });
          tx.set(refundTxRef, {
            userId:    uid,
            amount:    VISA_INTERVIEW_CREDIT_COST,
            type:      "visa_interview_refund_at_capacity",
            sessionId,
            reason:    "HeyGen at capacity — interview never started",
            createdAt: now,
          });
        });
        // Surface on the user's activity timeline so support can see
        // why the credits flickered up-and-down.
        void logUserActivity({
          userId:     uid,
          action:     "credits_granted_manual",   // refund variant — reuse the manual-grant chip
          targetType: "visaInterviewSession",
          targetId:   sessionId,
          metadata:   {
            amount:        VISA_INTERVIEW_CREDIT_COST,
            reason:        "Auto-refund: HeyGen at capacity",
            kind:          "auto_refund_at_capacity",
          },
        });
      }

      // Tell the client this was an at-capacity event so the UI can
      // show the friendly popup, not a generic failure.
      throw new HttpsError(
        "resource-exhausted",
        "Interview rooms are full at the moment. Kindly check back shortly. Your credits have been refunded.",
        { reason: "heygen_at_capacity", refunded: !founder, refundedAmount: founder ? 0 : VISA_INTERVIEW_CREDIT_COST },
      );
    }

    // Non-capacity failure (HeyGen 4xx config error, network blip,
    // etc.). Mark the session failed but DON'T refund here — these
    // failures typically reflect a real misconfiguration that needs
    // operator attention, and auto-refunding would mask the signal.
    // The frontend renders result.reason directly.
    await sessionRef.update({
      avatarProvider:      "heygen_liveavatar",
      avatarStatus:        "failed",
      avatarFailureReason: result.reason ?? "unknown",
      updatedAt:           now,
    });

    // Frontend gets only the safe fields (token + non-secret config). The
    // raw HEYGEN_API_KEY never crosses the wire.
    return result;
  },
);

// ── endLiveAvatarSession ─────────────────────────────────────────────────────
// Marks the avatar session as ended on our side. The frontend SDK has
// already called avatar.stopAvatar() — this is for bookkeeping.
export const endLiveAvatarSession = onCall({ ...LIGHT_OPTS }, async (request) => {
  await assertUserAppAccess(request);
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
    await assertUserAppAccess(request);
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
    if (isForbiddenVisaQuestionText(text)) {
      console.error("[visa] blocked forbidden family-travel TTS line", { sessionId, userId: uid });
      throw new HttpsError("failed-precondition", "This question is not in the approved interview bank.");
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
  await assertUserAppAccess(request);
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
    await assertUserAppAccess(request);
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
      // Stamp the activity log BEFORE returning so the row is in place
      // by the time the user redirects to Paystack. If the user gets
      // debited and the webhook never fires, support can still see the
      // intent here ("they at least made it to checkout for $5").
      void logUserActivity({
        userId:     uid,
        action:     "purchase_initiated",
        targetType: "paystackReference",
        targetId:   reference,
        metadata:   {
          packId,
          packLabel:  pack.label,
          credits:    pack.credits,
          priceUsd:   pack.priceUsd,
          priceLocal: pack.priceLocal,
          currency:   "GHS",
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
          // ALSO stamp the user's activity log so the failure shows up
          // on their detail page next to the purchase_initiated row.
          // Without this, a "paid but no credits" incident is invisible
          // to support until they go digging in errorLogs by hand.
          if (typeof evMd.userId === "string" && evMd.userId) {
            void logUserActivity({
              userId:     evMd.userId,
              action:     "purchase_failed",
              targetType: "paystackReference",
              targetId:   typeof evData.reference === "string" ? evData.reference : undefined,
              metadata:   {
                reason:    result.reason ?? "charge.success not applied",
                packId:    evMd.packId ?? null,
                amount:    evData.amount ?? null,
                currency:  evData.currency ?? null,
              },
            });
          }
        }
        // Receipt email — fire-and-forget. Credits already landed; if Resend
        // fails the customer keeps their credits and Paystack's own receipt
        // email covers the compliance side.
        if (result.applied) {
          const pack = CREDIT_PACKS[result.packId];
          const packLabel = pack?.label ?? result.packId;
          // Activity log: this is the row that confirms "the purchase
          // landed and the wallet was credited". Pairs with the earlier
          // purchase_initiated row so the timeline reads end-to-end.
          void logUserActivity({
            userId:     typeof event.data?.metadata?.userId === "string" ? event.data.metadata.userId : "",
            action:     "purchase_completed",
            targetType: "paystackReference",
            targetId:   result.reference,
            metadata:   {
              packId:         result.packId,
              packLabel,
              creditsGranted: result.creditsGranted,
              newBalance:     result.newCredits,
              priceLocal:     result.priceLocal,
              currency:       result.currency,
            },
          });
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
        if (result.applied) {
          // Stamp the user's activity log so a refund is visible on
          // the User detail page alongside the original purchase.
          void logUserActivity({
            userId:     result.userId,
            action:     "purchase_refunded",
            targetType: "paystackReference",
            targetId:   result.reference,
            metadata:   {
              packId:          result.packId,
              refundedCredits: result.refundedCredits,
              eventType:       event.event,
            },
          });
        } else if (!result.duplicated) {
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
        // `duplicated` only exists on the not-applied branch — narrow.
        const duplicated = result.applied ? false : !!result.duplicated;
        res.status(200).json({ ok: result.applied, duplicated });
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
    // Bulk mail to the entire waitlist — founder-only by policy. An
    // analyst with /admins access could not reach this anyway because
    // the front-end never surfaces it; this is the defence-in-depth
    // backstop.
    requireFounder(request);

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

    // ── Wallet materialization ─────────────────────────────────────────────
    // Eagerly create /creditWallets/{uid} with the FREE_CREDITS_ON_SIGNUP
    // grant so every surface that reads wallets (ops portal, analytics,
    // future migrations) sees the user's correct balance from the moment
    // of signup. Previously the wallet was lazily materialized on first
    // credit-spending action, which left newly-signed-up users showing
    // credits:0 in the ops portal until they touched the product.
    //
    // Transactional + existence check: a concurrent applyMarketerCode or
    // applyPaystackChargeSuccess could materialise the wallet first (rare
    // but possible if the client fires fast enough); we never overwrite
    // an existing wallet. Cloud Function retries are also safe — the
    // second pass sees the wallet and no-ops.
    //
    // Independent of the welcome-email path below: a failure here doesn't
    // skip the email, and a duplicate-trigger short-circuit on the email
    // doesn't skip wallet creation.
    try {
      const db = admin.firestore();
      const walletRef = db.collection("creditWallets").doc(uid);
      await db.runTransaction(async (tx) => {
        const walletSnap = await tx.get(walletRef);
        if (walletSnap.exists) {
          return;
        }
        tx.set(walletRef, {
          credits:   FREE_CREDITS_ON_SIGNUP,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source:    "signup_grant",
        });
      });
    } catch (err: any) {
      // Best-effort: log and continue. The spending callables retain
      // their lazy-init fallback as a backstop, so a failed eager
      // materialisation here doesn't break the user's ability to use
      // their free credits — it just leaves them displaying as 0 in the
      // ops portal until they spend, which is the same state as before
      // this fix landed.
      console.error("[users] wallet materialization failed", { uid, err: err?.message ?? err });
      void logError({
        category: "other",
        source:   "onUserCreated.wallet",
        severity: "warning",
        message:  err?.message ?? String(err),
        userId:   uid,
        context:  {},
      });
    }

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

// ============================================================
// backfillCreditWallets — admin-only one-shot
// ============================================================
/**
 * Walks every doc in /users and creates a /creditWallets/{uid} doc with the
 * FREE_CREDITS_ON_SIGNUP grant for any user who doesn't already have one.
 * Lets us clean up the long tail of users who signed up before the
 * eager-materialization fix in onUserCreated landed — without this they
 * keep displaying as 0 credits in the ops portal until they spend.
 *
 * Idempotent: only creates wallets that don't already exist; safe to
 * re-run any time. Returns counts so the operator can sanity-check.
 *
 * Dry-run by default so the operator can see the scope before mutating
 * anything. Pass `{ dryRun: false }` to actually create wallets.
 */
// Firebase Auth and Firestore are separate systems. Deleting a user from
// Firebase Authentication does not remove or update /users/{uid}, so the ops
// portal used to keep counting the deleted account forever. Preserve the
// Firestore record for audit/support history, but mark it deleted immediately.
export const onAuthUserDeleted = functionsV1
  .region("us-central1")
  .auth.user()
  .onDelete(async (user) => {
    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("users").doc(user.uid).set({
      email:                  user.email ?? null,
      displayName:            user.displayName ?? null,
      photoURL:               user.photoURL ?? null,
      accountStatus:          "deleted",
      accountStatusReason:    "Firebase Authentication user deleted.",
      accountStatusUpdatedAt: now,
      accountStatusUpdatedBy: "firebase-auth-trigger",
      authDeletedAt:          now,
      authDisabled:           true,
    }, { merge: true });

    await db.collection("auditLogs").add({
      actorUid:   "system",
      actorEmail: null,
      action:     "user_auth_deleted",
      targetType: "user",
      targetId:   user.uid,
      metadata:   { email: user.email ?? null },
      ip:         null,
      userAgent:  null,
      createdAt:  now,
    });
  });

export const backfillCreditWallets = onCall(
  { ...LIGHT_OPTS, timeoutSeconds: 540 },
  async (request) => {
    // Materialises wallets across all users — privileged maintenance,
    // founder-only.
    requireFounder(request);

    const dryRun = request.data?.dryRun !== false;  // default TRUE — explicit opt-out required

    const db = admin.firestore();
    // Snapshot all users. Collection is small (early-stage product); if it
    // ever grows past a few thousand, we'd switch to cursoring. Cheap for
    // now.
    const usersSnap = await db.collection("users").get();

    let totalUsers   = 0;
    let alreadyHas   = 0;
    let created      = 0;
    let failed       = 0;
    const failures: Array<{ uid: string; error: string }> = [];
    const wouldCreate: string[] = [];

    for (const userDoc of usersSnap.docs) {
      totalUsers++;
      const uid = userDoc.id;
      const walletRef = db.collection("creditWallets").doc(uid);

      try {
        // Read outside a transaction (we're not racing anything here —
        // backfill is a manual operator action, not a hot path).
        const walletSnap = await walletRef.get();
        if (walletSnap.exists) {
          alreadyHas++;
          continue;
        }

        if (dryRun) {
          wouldCreate.push(uid);
          continue;
        }

        await walletRef.set({
          credits:   FREE_CREDITS_ON_SIGNUP,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source:    "backfill_grant",
        });
        created++;
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        failed++;
        failures.push({ uid, error: msg });
      }
    }

    return {
      dryRun,
      totalUsers,
      alreadyHas,
      ...(dryRun
        ? { wouldCreate: wouldCreate.length, sampleUids: wouldCreate.slice(0, 10) }
        : { created, failed, sampleFailures: failures.slice(0, 5) }
      ),
    };
  },
);

// ============================================================
// restoreSignupCredits — admin-only restorative one-shot
// ============================================================
/**
 * Bumps every wallet that's currently below FREE_CREDITS_ON_SIGNUP back
 * up to the signup grant. Wallets at or above the grant are left alone.
 *
 * Built in response to a cleanupTestPayments run that zeroed live users
 * whose wallets had been eagerly materialized to credits:2 by
 * onUserCreated — the cleanup ran AFTER signup, so users who'd never
 * spent a credit ended up with 0. cleanupTestPayments has been fixed to
 * preserve the grant going forward; this callable is the one-shot
 * recovery for users who got caught by the bug.
 *
 * Safe to re-run any time: users above the grant are skipped, users
 * already at the grant are no-ops, only sub-grant wallets get touched.
 * Dry-run by default.
 */
export const restoreSignupCredits = onCall(
  { ...LIGHT_OPTS, timeoutSeconds: 540 },
  async (request) => {
    // Grants credits across the wallet base — founder-only.
    requireFounder(request);

    const dryRun = request.data?.dryRun !== false;  // default TRUE

    const db = admin.firestore();
    const walletsSnap = await db.collection("creditWallets").get();

    let totalWallets   = 0;
    let alreadyAtOrAbove = 0;
    let toRestore      = 0;
    let restored       = 0;
    let failed         = 0;
    const failures: Array<{ uid: string; error: string }> = [];
    const wouldRestore: Array<{ uid: string; was: number }> = [];

    for (const walletDoc of walletsSnap.docs) {
      totalWallets++;
      const uid     = walletDoc.id;
      const current = typeof walletDoc.data()?.credits === "number"
        ? walletDoc.data()!.credits as number
        : 0;

      if (current >= FREE_CREDITS_ON_SIGNUP) {
        alreadyAtOrAbove++;
        continue;
      }

      toRestore++;
      if (dryRun) {
        wouldRestore.push({ uid, was: current });
        continue;
      }

      try {
        await walletDoc.ref.set({
          credits:   FREE_CREDITS_ON_SIGNUP,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source:    "restore_signup_grant",
        }, { merge: true });
        restored++;
      } catch (err: any) {
        failed++;
        failures.push({ uid, error: err?.message ?? String(err) });
      }
    }

    return {
      dryRun,
      totalWallets,
      alreadyAtOrAbove,
      ...(dryRun
        ? { wouldRestore: toRestore, sample: wouldRestore.slice(0, 10) }
        : { restored, failed, sampleFailures: failures.slice(0, 5) }
      ),
    };
  },
);

// ============================================================
// grantManualCredits — founder-only recovery tool
// ============================================================
/**
 * Atomically credits a user's wallet with a manual grant. Built primarily
 * to recover users whose Paystack webhook silently failed — instead of
 * three Firestore console edits per incident, support runs this once.
 *
 * What it writes (all atomic):
 *   1. /creditWallets/{uid}  — wallet credits += amount
 *   2. /creditTransactions   — type:"manual_grant" with reason + actor
 *   3. /paystackPayments/{ref} (optional) — manuallyApplied marker, so if
 *      Paystack later re-delivers the original webhook, the dedup check
 *      sees the doc exists and short-circuits without double-crediting.
 *
 * Plus best-effort side writes (post-commit):
 *   • /userAuditLogs — credits_granted_manual entry on user timeline
 *   • /auditLogs     — admin_credit_grant entry for ops audit
 *
 * Founder-only. The audit-log trail is non-optional — every grant
 * needs an actor + reason on the record.
 */
export const grantManualCredits = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    requireFounder(request);

    const targetUid       = String(request.data?.uid ?? "").trim();
    const amount          = Number(request.data?.amount ?? 0);
    const reason          = String(request.data?.reason ?? "").trim();
    const paymentRefRaw   = String(request.data?.paymentReference ?? "").trim();
    const paymentReference: string | null = paymentRefRaw || null;
    const packIdRaw       = String(request.data?.packId ?? "").trim();
    const packId: string | null = packIdRaw || null;
    const actorUid        = request.auth!.uid;
    const actorEmail      = request.auth?.token?.email ?? null;

    if (!targetUid) {
      throw new HttpsError("invalid-argument", "Missing target uid.");
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000) {
      throw new HttpsError("invalid-argument", "Amount must be a positive integer between 1 and 10,000.");
    }
    if (!reason || reason.length < 4) {
      throw new HttpsError("invalid-argument", "Reason required (≥ 4 chars) for the audit trail.");
    }

    // When a paymentReference is provided, the grant is recovering a
    // real charge — it MUST count toward revenue + pack mix in the
    // Business Report. To attribute it correctly we need the pack the
    // user actually bought (so the /paystackPayments doc carries
    // amountSubunit + currency + packId, exactly what the webhook
    // would have written had it landed).
    let resolvedPack: { id: string; priceLocal: number; credits: number; label: string } | null = null;
    if (paymentReference) {
      if (!packId) {
        throw new HttpsError(
          "invalid-argument",
          "When supplying a Paystack reference, you must also specify the pack the user purchased so the report reflects the revenue.",
        );
      }
      const pack = CREDIT_PACKS[packId];
      if (!pack) {
        throw new HttpsError("invalid-argument", `Unknown pack id: ${packId}.`);
      }
      // Confirm the credits amount matches the pack the operator picked.
      // Mismatch usually means a typo — refuse rather than book the
      // wrong revenue against the wrong pack.
      if (pack.credits !== amount) {
        throw new HttpsError(
          "invalid-argument",
          `Pack ${packId} grants ${pack.credits} credits, but the form requests ${amount}. Pick a different pack or adjust the credits.`,
        );
      }
      resolvedPack = { id: packId, priceLocal: pack.priceLocal, credits: pack.credits, label: pack.label };
    }

    const db        = admin.firestore();
    const walletRef = db.collection("creditWallets").doc(targetUid);
    const txRef     = db.collection("creditTransactions").doc();
    const paystackRef = paymentReference
      ? db.collection("paystackPayments").doc(paymentReference)
      : null;
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Confirm the user exists. Without this an admin could grant
    // credits to a typo'd uid and we'd never know — the wallet write
    // succeeds because we use set+merge.
    const userSnap = await db.collection("users").doc(targetUid).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", `No /users doc for uid ${targetUid}. Refusing to grant credits to a non-existent user.`);
    }

    const result = await db.runTransaction(async (tx) => {
      // Dedup check: if the operator linked a Paystack reference and
      // a payment doc already exists, the wallet was already credited
      // by the webhook (or another manual grant for the same ref). Bail
      // before writing — otherwise we double-credit.
      if (paystackRef) {
        const existing = await tx.get(paystackRef);
        if (existing.exists) {
          return {
            ok:           false as const,
            reason:       "payment_already_processed" as const,
            message:      "A /paystackPayments doc already exists for this reference. Wallet was already credited.",
          };
        }
      }

      const walletSnap = await tx.get(walletRef);
      // Missing wallet (rare after eager materialisation) — fall back
      // to the implicit signup grant so we don't accidentally erase a
      // user's free 2 credits by overwriting with just the manual
      // amount.
      const currentCredits = walletSnap.exists
        ? (walletSnap.data()?.credits ?? 0)
        : FREE_CREDITS_ON_SIGNUP;
      const newBalance = currentCredits + amount;

      tx.set(walletRef, {
        credits:   newBalance,
        updatedAt: now,
      }, { merge: true });

      tx.set(txRef, {
        userId:           targetUid,
        amount:           amount,
        type:             "manual_grant",
        reason,
        paymentReference: paymentReference,
        actorUid,
        actorEmail,
        createdAt:        now,
      });

      // Optional: also write a /paystackPayments doc tagged as manually
      // applied. Future re-deliveries of the original webhook hit the
      // dedup check inside applyPaystackChargeSuccess and short-circuit.
      // We write the SAME fields the webhook would have written
      // (amountSubunit, currency, packId) so the Business Report's
      // revenue + pack-mix aggregations pick up this recovery exactly
      // as if the original webhook had landed normally. Without these,
      // a manual grant would credit the user but show up as $0 revenue.
      if (paystackRef) {
        // resolvedPack is guaranteed non-null here — paymentReference
        // implies packId implies a resolved pack (validated above).
        const amountSubunit = Math.round((resolvedPack?.priceLocal ?? 0) * 100);
        tx.set(paystackRef, {
          reference:        paymentReference,
          userId:           targetUid,
          packId:           resolvedPack?.id ?? null,
          creditsGranted:   amount,
          amountSubunit,
          currency:         "GHS",
          provider:         "paystack",
          providerStatus:   "manual_grant",
          manuallyApplied:  true,
          appliedBy:        actorUid,
          appliedReason:    reason,
          createdAt:        now,
        });
      }

      return {
        ok:              true as const,
        previousBalance: currentCredits,
        newBalance,
      };
    });

    if (!result.ok) {
      return result;
    }

    // Best-effort side writes — failures here don't undo the grant.
    void logUserActivity({
      userId:     targetUid,
      action:     "credits_granted_manual",
      targetType: paymentReference ? "paystackReference" : "creditTransaction",
      targetId:   paymentReference ?? txRef.id,
      metadata: {
        amount,
        reason,
        previousBalance: result.previousBalance,
        newBalance:      result.newBalance,
        actorEmail,
        ...(paymentReference ? { paymentReference } : {}),
      },
    });

    try {
      await admin.firestore().collection("auditLogs").add({
        actorUid,
        actorEmail,
        action:     "admin_credit_grant",
        targetType: "user",
        targetId:   targetUid,
        metadata:   {
          amount,
          reason,
          paymentReference,
          previousBalance: result.previousBalance,
          newBalance:      result.newBalance,
        },
        ip:        extractClientIp(request.rawRequest),
        userAgent: String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.warn("[manual-grant] audit write failed:", err);
    }

    return result;
  },
);

// ============================================================
// repairManualGrantPayments — one-shot backfill
// ============================================================
/**
 * Walks /paystackPayments looking for docs that were created by the
 * first version of grantManualCredits (manuallyApplied:true but
 * missing the financial fields needed by the Business Report —
 * amountSubunit, currency, packId, priceLocal). For each one, infers
 * the pack from creditsGranted (every pack has a distinct credit
 * count, so the lookup is unambiguous) and stamps the missing fields.
 *
 * Why this exists: the V1 of grantManualCredits wrote the dedup
 * marker without those fields. Users credited via that path got their
 * credits but the Business Report's revenue + pack-mix counts treated
 * them as $0 transactions. This callable fixes the historical record
 * without requiring a manual Firebase Console edit per affected doc.
 *
 * Idempotent. Dry-run by default. Safe to re-run any time — docs
 * that already carry amountSubunit are skipped.
 */
export const repairManualGrantPayments = onCall(
  { ...LIGHT_OPTS, timeoutSeconds: 300 },
  async (request) => {
    requireFounder(request);
    const dryRun = request.data?.dryRun !== false;  // default TRUE

    const db = admin.firestore();
    const snap = await db.collection("paystackPayments")
      .where("manuallyApplied", "==", true)
      .get();

    let scanned     = 0;
    let alreadyOk   = 0;
    let repaired    = 0;
    let unmatched   = 0;
    const wouldRepair: Array<{ ref: string; packId: string; amountSubunit: number; credits: number }> = [];
    const skipped:     Array<{ ref: string; reason: string }> = [];

    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data() ?? {};
      if (typeof data.amountSubunit === "number" && data.amountSubunit > 0) {
        alreadyOk++;
        continue;
      }

      const credits = typeof data.creditsGranted === "number" ? data.creditsGranted : 0;
      if (credits <= 0) {
        skipped.push({ ref: doc.id, reason: "no creditsGranted on doc" });
        unmatched++;
        continue;
      }

      // Find the pack whose credits match. Every pack has a distinct
      // credit count so the match is unambiguous; if the operator
      // granted a custom amount via the "Custom" pack option, there
      // won't be a match — leave the doc alone (it's intentionally
      // not revenue).
      const entry = Object.entries(CREDIT_PACKS).find(([_id, p]) => p.credits === credits);
      if (!entry) {
        skipped.push({ ref: doc.id, reason: `no pack matches ${credits} credits — looks like a custom grant, no revenue attribution intended` });
        unmatched++;
        continue;
      }
      const [packId, pack] = entry;
      const amountSubunit  = Math.round(pack.priceLocal * 100);

      if (dryRun) {
        wouldRepair.push({ ref: doc.id, packId, amountSubunit, credits });
        continue;
      }

      try {
        await doc.ref.set({
          packId,
          amountSubunit,
          currency: "GHS",
          // Tag the repair so it shows up in the audit trail.
          repairedAt:        admin.firestore.FieldValue.serverTimestamp(),
          repairedBy:        request.auth!.uid,
          repairedByEmail:   request.auth?.token?.email ?? null,
        }, { merge: true });
        repaired++;
      } catch (err: any) {
        skipped.push({ ref: doc.id, reason: err?.message ?? String(err) });
      }
    }

    // Audit-log the repair pass so anyone looking at /auditLogs later
    // can see what happened. Only on live runs — dry-runs aren't
    // mutations.
    if (!dryRun) {
      try {
        await db.collection("auditLogs").add({
          actorUid:    request.auth!.uid,
          actorEmail:  request.auth?.token?.email ?? null,
          action:      "manual_grants_repaired",
          targetType:  "paystackPayments",
          targetId:    "(batch)",
          metadata:    { scanned, alreadyOk, repaired, unmatched },
          ip:          extractClientIp(request.rawRequest),
          userAgent:   String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240),
          createdAt:   admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.warn("[repair-manual-grants] audit write failed:", err);
      }
    }

    return {
      dryRun,
      scanned,
      alreadyOk,
      unmatched,
      ...(dryRun
        ? { wouldRepair: wouldRepair.length, sample: wouldRepair.slice(0, 10) }
        : { repaired, skipped: skipped.slice(0, 10) }),
    };
  },
);

// ============================================================
// submitFeedbackSurvey — user-facing rating + optional comment
// ============================================================
/**
 * Writes a /surveyResponses doc capturing the user's rating + free-text
 * comment after they finish a match report unlock or a visa interview.
 *
 * Design constraints from the product side:
 *   • Survey shouldn't bore users — keep it to a star rating + one
 *     optional comment field. Both can be empty (skipped).
 *   • At most once per 14 days per user. The client gates this via
 *     useShouldShowSurvey; we ALSO check it here so a bug in the
 *     client (or a determined power-user mashing buttons) can't
 *     spam the responses collection.
 *   • Trigger is either "match_report" or "visa_interview" — closed
 *     allow-list to keep ops surface clean.
 *
 * Schema written to /surveyResponses:
 *   {
 *     userId, userEmail, trigger, triggerId?, rating?, comment?,
 *     status: "submitted" | "skipped", createdAt, userAgent?
 *   }
 *
 * Status "skipped" records that the user saw the prompt and dismissed
 * — important for measuring response rate AND for cooldown
 * enforcement (a skip starts the 14-day clock just like a submit).
 */
const FEEDBACK_SURVEY_COOLDOWN_DAYS = 14;
const FEEDBACK_SURVEY_TRIGGERS = new Set(["match_report", "visa_interview"]);

export const submitFeedbackSurvey = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    await assertUserAppAccess(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

    const userEmail = (request.auth?.token?.email as string | undefined) ?? null;

    const trigger   = String(request.data?.trigger ?? "").trim();
    const triggerId = String(request.data?.triggerId ?? "").trim() || null;
    const status    = String(request.data?.status ?? "").trim();
    const rawRating = request.data?.rating;
    const rawComment = request.data?.comment;

    if (!FEEDBACK_SURVEY_TRIGGERS.has(trigger)) {
      throw new HttpsError("invalid-argument", `Unknown trigger: ${trigger}`);
    }
    if (status !== "submitted" && status !== "skipped") {
      throw new HttpsError("invalid-argument", "Status must be 'submitted' or 'skipped'.");
    }

    // Rating: integer 1-5 when status === submitted, null/missing
    // otherwise. We accept ratings on skipped responses too in case
    // the client wants to record a partial; treat 0/missing as null.
    let rating: number | null = null;
    if (typeof rawRating === "number" && Number.isInteger(rawRating) && rawRating >= 1 && rawRating <= 5) {
      rating = rawRating;
    } else if (rawRating !== undefined && rawRating !== null && rawRating !== 0) {
      throw new HttpsError("invalid-argument", "Rating must be an integer 1-5 if provided.");
    }
    // A "submitted" response must have a rating — otherwise it's a
    // skip. Belt-and-braces: client-side button copy already enforces
    // this, this is the server-side guard.
    if (status === "submitted" && rating === null) {
      throw new HttpsError("invalid-argument", "Submitted responses must include a rating.");
    }

    // Comment: optional, capped at 1000 chars. Trim whitespace; empty
    // string becomes null.
    let comment: string | null = null;
    if (typeof rawComment === "string") {
      const trimmed = rawComment.trim().slice(0, 1000);
      if (trimmed) comment = trimmed;
    }

    // Cooldown enforcement. Look up the most recent response by this
    // user; refuse if it's within the cooldown window. Skipped
    // responses count — a skip is the user telling us "not now",
    // which we honour for the same 14 days.
    const db = admin.firestore();
    const cooldownMs = FEEDBACK_SURVEY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const recent = await db.collection("surveyResponses")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    if (!recent.empty) {
      const lastCreatedAt = recent.docs[0].data()?.createdAt;
      const lastMs = lastCreatedAt?.toMillis?.() ?? 0;
      if (Date.now() - lastMs < cooldownMs) {
        // Don't throw — the client UI would already have hidden the
        // prompt. This is a defensive duplicate-submit guard. Return
        // a benign result so a misbehaving client doesn't show an
        // error message.
        return { ok: false as const, reason: "cooldown_active" as const };
      }
    }

    const userAgent = String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240) || null;

    const ref = db.collection("surveyResponses").doc();
    await ref.set({
      userId:    uid,
      userEmail,
      trigger,
      triggerId,
      rating,
      comment,
      status,
      userAgent,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Surface on the user's activity timeline so support can see when
    // a user gave feedback (and how they rated). Useful for spotting
    // power-user testimonials and unhappy-user retention plays.
    void logUserActivity({
      userId:     uid,
      action:     "credits_granted_manual",   // reuse a generic chip — no dedicated survey action yet
      targetType: "surveyResponse",
      targetId:   ref.id,
      metadata: {
        kind:      "feedback_survey",
        trigger,
        triggerId,
        rating,
        status,
        commentLen: comment?.length ?? 0,
      },
    });

    return { ok: true as const, id: ref.id };
  },
);

// ============================================================
// Bulk email — templates, audience resolution, dry-run + live send
// ============================================================
/**
 * Returns the catalogue of pre-built bulk-email templates the operator
 * picks from. Templates live in code (bulkEmailTemplates.ts) for review
 * + version-control; clients never write to this surface.
 */
export const listBulkEmailTemplates = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const authToken = request.auth?.token;
    if (!authToken || authToken.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    return { templates: BULK_EMAIL_TEMPLATES };
  },
);

/** Doc-id-safe key for a recipient address. Firestore doc ids can't
 *  contain slashes, '#', '[', ']', or '*' — emails don't contain those
 *  anyway, but we lowercase + trim to dedupe and replace '@' with '_at_'
 *  so the key stays human-readable in the Firebase console. */
function recipientKey(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

type AudienceKind =
  | "all_users"
  | "paying_customers"
  | "free_users"
  | "waitlist"
  | "waitlist_emailed_not_signed_up"   // got the launch email, never created an account
  | "waitlist_signed_up_inactive"      // joined waitlist + signed up, but no product activity
  | "custom";

interface AudienceSpec {
  kind:    AudienceKind;
  /** Comma-separated or array of emails. Required when kind === "custom". */
  emails?: string[];
}

async function resolveAudience(spec: AudienceSpec): Promise<string[]> {
  const db = admin.firestore();
  const out = new Set<string>();

  switch (spec.kind) {
    case "all_users": {
      const snap = await db.collection("users").get();
      for (const d of snap.docs) {
        const email = (d.data()?.email ?? "").toString().trim().toLowerCase();
        if (email) out.add(email);
      }
      break;
    }
    case "paying_customers": {
      // Anyone with at least one successful paystackPayments doc. Read
      // payments first (smaller set than /users in most cohorts), pull
      // userIds, then look up the user docs for their emails.
      const paymentsSnap = await db.collection("paystackPayments").get();
      const payingUids = new Set<string>();
      for (const d of paymentsSnap.docs) {
        const uid = d.data()?.userId;
        if (typeof uid === "string" && uid) payingUids.add(uid);
      }
      // Batch user lookups so we don't fire N round-trips. Firestore
      // getAll caps at 500 refs per call — chunk if we ever cross that.
      const uids = Array.from(payingUids);
      for (let i = 0; i < uids.length; i += 100) {
        const chunk = uids.slice(i, i + 100);
        const refs = chunk.map((uid) => db.collection("users").doc(uid));
        const snaps = await db.getAll(...refs);
        for (const s of snaps) {
          const email = (s.data()?.email ?? "").toString().trim().toLowerCase();
          if (email) out.add(email);
        }
      }
      break;
    }
    case "free_users": {
      // All users MINUS paying users. Two reads then a set difference.
      const [usersSnap, paymentsSnap] = await Promise.all([
        db.collection("users").get(),
        db.collection("paystackPayments").get(),
      ]);
      const payingUids = new Set<string>();
      for (const d of paymentsSnap.docs) {
        const uid = d.data()?.userId;
        if (typeof uid === "string" && uid) payingUids.add(uid);
      }
      for (const d of usersSnap.docs) {
        if (payingUids.has(d.id)) continue;
        const email = (d.data()?.email ?? "").toString().trim().toLowerCase();
        if (email) out.add(email);
      }
      break;
    }
    case "waitlist": {
      const snap = await db.collection("waitlist").get();
      for (const d of snap.docs) {
        const email = (d.data()?.email ?? "").toString().trim().toLowerCase();
        if (email) out.add(email);
      }
      break;
    }
    case "waitlist_emailed_not_signed_up": {
      // Waitlist signups who received the "we're live" launch email
      // (launchEmailSentAt is set) but never created a /users account
      // afterwards. Built for re-engagement: these are people who
      // raised their hand pre-launch + got the announcement + chose
      // not to sign up. A nudge can convert some of them.
      const [waitlistSnap, usersSnap] = await Promise.all([
        db.collection("waitlist").get(),
        db.collection("users").get(),
      ]);
      const userEmails = new Set<string>();
      for (const d of usersSnap.docs) {
        const e = (d.data()?.email ?? "").toString().trim().toLowerCase();
        if (e) userEmails.add(e);
      }
      for (const d of waitlistSnap.docs) {
        const data = d.data() ?? {};
        // Only count waitlist rows that actually received the launch
        // blast — un-emailed rows might be too fresh or stuck in the
        // failures queue, neither of which is a re-engagement target.
        if (!data.launchEmailSentAt) continue;
        const email = (data.email ?? "").toString().trim().toLowerCase();
        if (email && !userEmails.has(email)) out.add(email);
      }
      break;
    }
    case "waitlist_signed_up_inactive": {
      // Joined the waitlist + signed up + never did anything meaningful
      // (no match report unlocks, no visa interview sessions, no
      // purchases). "Inactive but engaged enough to sign up" is the
      // highest-yield re-engagement segment — they already crossed
      // the signup hurdle, just need a reason to come back.
      //
      // Full-collection reads on five collections. Fine at current
      // scale; if any of these crosses 10k+ docs we'd switch to
      // cursored reads + an aggregated activity-summary collection.
      const [waitlistSnap, usersSnap, reportsSnap, sessionsSnap, paymentsSnap] = await Promise.all([
        db.collection("waitlist").get(),
        db.collection("users").get(),
        db.collection("matchReports").get(),
        db.collection("visaInterviewSessions").get(),
        db.collection("paystackPayments").get(),
      ]);

      const waitlistEmails = new Set<string>();
      for (const d of waitlistSnap.docs) {
        const e = (d.data()?.email ?? "").toString().trim().toLowerCase();
        if (e) waitlistEmails.add(e);
      }

      // Union of UIDs that have done ANY value-generating action.
      // Anyone in this set is considered "active" and excluded from
      // the re-engagement cohort.
      const activeUids = new Set<string>();
      const tagActive = (snap: FirebaseFirestore.QuerySnapshot) => {
        for (const d of snap.docs) {
          const uid = d.data()?.userId;
          if (typeof uid === "string" && uid) activeUids.add(uid);
        }
      };
      tagActive(reportsSnap);
      tagActive(sessionsSnap);
      tagActive(paymentsSnap);

      // The cohort: /users docs whose email is on the waitlist AND
      // whose uid is NOT in the active set.
      for (const d of usersSnap.docs) {
        if (activeUids.has(d.id)) continue;
        const email = (d.data()?.email ?? "").toString().trim().toLowerCase();
        if (email && waitlistEmails.has(email)) out.add(email);
      }
      break;
    }
    case "custom": {
      const raw = spec.emails ?? [];
      for (const e of raw) {
        const email = e.trim().toLowerCase();
        if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
          out.add(email);
        }
      }
      break;
    }
  }

  return Array.from(out);
}

/**
 * Operator-driven bulk email send. Admin-only. Dry-run by default.
 *
 * Idempotency: each call carries a `campaignId` (UUID generated by the
 * UI). The function creates /bulkCampaigns/{campaignId} on first call
 * and a per-recipient subdoc at
 * /bulkCampaigns/{campaignId}/recipients/{key} that flips to "sent"
 * after Resend succeeds. Re-running with the same campaignId picks up
 * where it left off — already-mailed recipients are skipped, only
 * failed/un-attempted ones get a fresh try. Safe to retry any time.
 *
 * Caps in place:
 *   • maxToSend: 5000 per invocation (operator picks; UI defaults to
 *     5000 for full audience or smaller for smoke tests)
 *   • 100ms throttle between sends to stay polite to Resend rate-limit
 *   • timeoutSeconds: 540 so a few thousand emails fit one invocation
 */
export const sendBulkEmail = onCall(
  { ...LIGHT_OPTS, timeoutSeconds: 540, secrets: [RESEND_API_KEY] },
  async (request) => {
    // Mass outbound communications — founder-only. The UI never
    // surfaces the Bulk Email page to other roles, but this is the
    // hard backstop.
    requireFounder(request);

    const dryRun     = request.data?.dryRun !== false;  // default TRUE
    const subject    = String(request.data?.subject  ?? "").trim();
    const headline   = String(request.data?.headline ?? "").trim();
    const body       = String(request.data?.body     ?? "").trim();
    const ctaTextRaw = request.data?.ctaText;
    const ctaUrlRaw  = request.data?.ctaUrl;
    const ctaText    = typeof ctaTextRaw === "string" ? ctaTextRaw.trim() : "";
    const ctaUrl     = typeof ctaUrlRaw  === "string" ? ctaUrlRaw.trim()  : "";
    const audience   = request.data?.audience as AudienceSpec | undefined;
    const maxToSend  = Math.max(0, Math.min(5000, Number(request.data?.maxToSend ?? 5000)));
    const campaignId = String(request.data?.campaignId ?? "").trim() || null;
    const operatorUid = request.auth?.uid ?? null;

    if (!subject)  throw new HttpsError("invalid-argument", "Subject required.");
    if (!headline) throw new HttpsError("invalid-argument", "Headline required.");
    if (!body)     throw new HttpsError("invalid-argument", "Body required.");
    if (!audience || !audience.kind) {
      throw new HttpsError("invalid-argument", "Audience required.");
    }
    if (Boolean(ctaText) !== Boolean(ctaUrl)) {
      throw new HttpsError("invalid-argument", "CTA text and URL must both be set or both omitted.");
    }

    const emails = await resolveAudience(audience);
    if (emails.length === 0) {
      return {
        dryRun, audienceKind: audience.kind,
        totalCandidates: 0, alreadySent: 0, wouldSend: 0,
        sent: 0, failed: 0, sampleEmails: [], sampleFailures: [],
      };
    }

    // Dry run — no writes, no sends.
    if (dryRun) {
      return {
        dryRun:           true,
        audienceKind:     audience.kind,
        totalCandidates:  emails.length,
        wouldSend:        Math.min(emails.length, maxToSend),
        sampleEmails:     emails.slice(0, 5),
      };
    }

    if (!campaignId) {
      throw new HttpsError("invalid-argument", "campaignId required for live send.");
    }

    const db = admin.firestore();
    const campaignRef = db.collection("bulkCampaigns").doc(campaignId);

    // Create the campaign doc on first call. Merge so re-runs with the
    // same id don't blow away the original metadata.
    await campaignRef.set({
      campaignId,
      subject,
      headline,
      bodyPreview: body.length > 500 ? body.slice(0, 500) + "…" : body,
      ctaText:     ctaText || null,
      ctaUrl:      ctaUrl  || null,
      audienceKind: audience.kind,
      audienceSize: emails.length,
      operatorUid,
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      lastRunAt:    admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Look up already-sent recipients for this campaign so we skip them
    // on retries. For a fresh campaign this is one empty read.
    const recipientsCol = campaignRef.collection("recipients");
    const recipientsSnap = await recipientsCol.where("status", "==", "sent").get();
    const alreadySentKeys = new Set<string>(recipientsSnap.docs.map((d) => d.id));

    const toAttempt: string[] = [];
    for (const email of emails) {
      const key = recipientKey(email);
      if (alreadySentKeys.has(key)) continue;
      toAttempt.push(email);
      if (toAttempt.length >= maxToSend) break;
    }

    const resend = new Resend(RESEND_API_KEY.value());
    const html = buildBulkEmailHtml({ subject, headline, body, ctaText, ctaUrl });
    const text = buildBulkEmailText({ subject, headline, body, ctaText, ctaUrl });

    let sent   = 0;
    let failed = 0;
    const failures: Array<{ email: string; error: string }> = [];

    for (const email of toAttempt) {
      const key = recipientKey(email);
      const recipientRef = recipientsCol.doc(key);
      const now = admin.firestore.FieldValue.serverTimestamp();
      try {
        const result = await resend.emails.send({
          from:    "College Ready <noreply@collegeready.io>",
          to:      [email],
          subject,
          html,
          text,
        });
        if (result.error) {
          throw new Error(result.error.message ?? "Resend rejected the send.");
        }
        if (!result.data?.id) {
          throw new Error("Resend returned no message id.");
        }
        await recipientRef.set({
          email,
          status:    "sent",
          messageId: result.data.id,
          sentAt:    now,
          // Clear any prior failure so retries surface as fresh-success.
          error:     admin.firestore.FieldValue.delete(),
          erroredAt: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        sent++;
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        failed++;
        failures.push({ email, error: msg });
        await recipientRef.set({
          email,
          status:    "failed",
          error:     msg,
          erroredAt: now,
        }, { merge: true });
        void logError({
          category: "email_send",
          source:   "bulk_email.resend_failed",
          severity: "warning",
          message:  msg,
          context:  { campaignId, email },
        });
      }
      // Polite gap between sends so Resend burst-limiter doesn't trip.
      await new Promise((r) => setTimeout(r, 100));
    }

    await campaignRef.set({
      lastRunAt:        admin.firestore.FieldValue.serverTimestamp(),
      // Counters are merged (latest values overwrite). Cumulative
      // totals across reruns live on the recipient subdocs.
      lastRunSent:      sent,
      lastRunFailed:    failed,
      lastRunAttempted: toAttempt.length,
    }, { merge: true });

    return {
      dryRun:          false,
      campaignId,
      audienceKind:    audience.kind,
      totalCandidates: emails.length,
      alreadySent:     alreadySentKeys.size,
      attempted:       toAttempt.length,
      sent,
      failed,
      sampleFailures:  failures.slice(0, 5),
    };
  },
);

// ============================================================
// Failed transactional emails — listing + retry
// ============================================================
/**
 * Lists transactional emails that failed to send across three doc-
 * stamped surfaces: user welcome, waitlist signup welcome, and waitlist
 * launch announcement. Each row carries the source identifier so the
 * retryEmail callable can route the retry to the right send function.
 *
 * Payment-receipt failures are tracked in /errorLogs (not stamped on
 * any doc), so they're handled via the existing Errors page rather
 * than included here — a separate v2 if the user wants them surfaced
 * alongside the others.
 */
export const listFailedEmails = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const authToken = request.auth?.token;
    if (!authToken || authToken.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const db = admin.firestore();
    const out: Array<{
      source:   "user_welcome" | "waitlist_welcome" | "waitlist_launch";
      docId:    string;
      to:       string | null;
      failedAt: number | null;
      error:    string;
    }> = [];

    // /users docs with welcomeEmailError set. We scan rather than use a
    // where-not-null query so we don't have to maintain a composite
    // index for this rarely-hit ops surface.
    const usersSnap = await db.collection("users").get();
    for (const d of usersSnap.docs) {
      const data = d.data() ?? {};
      if (!data.welcomeEmailError) continue;
      out.push({
        source:   "user_welcome",
        docId:    d.id,
        to:       (data.email ?? null) as string | null,
        failedAt: tsToMillis(data.welcomeEmailErrorAt),
        error:    String(data.welcomeEmailError),
      });
    }

    // /waitlist docs with emailError or launchEmailError set. One scan,
    // two emits per doc max.
    const waitlistSnap = await db.collection("waitlist").get();
    for (const d of waitlistSnap.docs) {
      const data = d.data() ?? {};
      if (data.emailError) {
        out.push({
          source:   "waitlist_welcome",
          docId:    d.id,
          to:       (data.email ?? null) as string | null,
          failedAt: tsToMillis(data.emailErrorAt),
          error:    String(data.emailError),
        });
      }
      if (data.launchEmailError) {
        out.push({
          source:   "waitlist_launch",
          docId:    d.id,
          to:       (data.email ?? null) as string | null,
          failedAt: tsToMillis(data.launchEmailErrorAt),
          error:    String(data.launchEmailError),
        });
      }
    }

    out.sort((a, b) => (b.failedAt ?? 0) - (a.failedAt ?? 0));
    return { failures: out };
  },
);

function tsToMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return null;
}

/**
 * Retry a failed transactional email. Admin-only. Routes to the right
 * Resend sender based on `source`, clears the error stamp on success,
 * updates the stamp on a fresh failure.
 */
export const retryEmail = onCall(
  { ...LIGHT_OPTS, secrets: [RESEND_API_KEY] },
  async (request) => {
    const authToken = request.auth?.token;
    if (!authToken || authToken.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const source = String(request.data?.source ?? "");
    const docId  = String(request.data?.docId  ?? "").trim();
    if (!docId) throw new HttpsError("invalid-argument", "docId required.");

    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const apiKey = RESEND_API_KEY.value();

    if (source === "user_welcome") {
      const userRef = db.collection("users").doc(docId);
      const snap = await userRef.get();
      if (!snap.exists) throw new HttpsError("not-found", "User doc not found.");
      // Read email from Auth (authoritative), not from the Firestore doc.
      let authUser: admin.auth.UserRecord;
      try {
        authUser = await admin.auth().getUser(docId);
      } catch {
        throw new HttpsError("not-found", "No Firebase Auth record for that user.");
      }
      const email = authUser.email;
      if (!email) throw new HttpsError("failed-precondition", "User has no email on file.");
      try {
        const { id } = await sendWelcomeEmail({ apiKey, to: email, displayName: authUser.displayName });
        await userRef.set({
          welcomeEmailSentAt:    now,
          welcomeEmailMessageId: id,
          welcomeEmailError:     admin.firestore.FieldValue.delete(),
          welcomeEmailErrorAt:   admin.firestore.FieldValue.delete(),
        }, { merge: true });
        return { ok: true as const, messageId: id, source, docId };
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        await userRef.set({
          welcomeEmailError:   msg,
          welcomeEmailErrorAt: now,
        }, { merge: true });
        return { ok: false as const, error: msg, source, docId };
      }
    }

    if (source === "waitlist_welcome") {
      const ref = db.collection("waitlist").doc(docId);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError("not-found", "Waitlist doc not found.");
      const email = (snap.data()?.email ?? "").toString().trim();
      if (!email) throw new HttpsError("failed-precondition", "Waitlist entry has no email.");
      try {
        const { id } = await sendWaitlistWelcome({ apiKey, to: email });
        await ref.set({
          emailSentAt:    now,
          emailMessageId: id,
          emailError:     admin.firestore.FieldValue.delete(),
          emailErrorAt:   admin.firestore.FieldValue.delete(),
        }, { merge: true });
        return { ok: true as const, messageId: id, source, docId };
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        await ref.set({
          emailError:   msg,
          emailErrorAt: now,
        }, { merge: true });
        return { ok: false as const, error: msg, source, docId };
      }
    }

    if (source === "waitlist_launch") {
      const ref = db.collection("waitlist").doc(docId);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError("not-found", "Waitlist doc not found.");
      const email = (snap.data()?.email ?? "").toString().trim();
      if (!email) throw new HttpsError("failed-precondition", "Waitlist entry has no email.");
      try {
        const { id } = await sendLaunchAnnouncement({ apiKey, to: email });
        await ref.set({
          launchEmailSentAt:    now,
          launchEmailMessageId: id,
          launchEmailError:     admin.firestore.FieldValue.delete(),
          launchEmailErrorAt:   admin.firestore.FieldValue.delete(),
        }, { merge: true });
        return { ok: true as const, messageId: id, source, docId };
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        await ref.set({
          launchEmailError:   msg,
          launchEmailErrorAt: now,
        }, { merge: true });
        return { ok: false as const, error: msg, source, docId };
      }
    }

    throw new HttpsError("invalid-argument", `Unknown source: ${source}`);
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
      rejectReturnUrl(returnOrigin, "ops-signin");
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
      // (collegeready.io / vercel.app / localhost-under-emulator only).
      // Reusing the same predicate keeps one source of truth.
      rejectReturnUrl(returnOrigin, "user-signin");
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
    // Destructive data wipe — founder-only.
    requireFounder(request);
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
      result = await runCleanupTestPayments({
        liveReference,
        freeSignupCredits: FREE_CREDITS_ON_SIGNUP,
      });
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
        actorEmail:  request.auth?.token?.email ?? null,
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

/** Centralised founder-role gate. Founder is the only role that can
 *  invite admins, revoke admins, change other admins' roles, or edit
 *  the role-permissions config. Frontend mirrors this — the Admins
 *  page is reachable only by founders — but defence in depth on the
 *  backend keeps an analyst who pokes around in DevTools from
 *  escalating their own privileges. */
async function writeUserAccountAudit(
  request: CallableRequest<Record<string, unknown>>,
  action: "user_account_status_changed" | "user_auth_directory_reconciled",
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.firestore().collection("auditLogs").add({
      actorUid:    request.auth!.uid,
      actorEmail:  request.auth?.token?.email ?? null,
      action,
      targetType:  "user",
      targetId,
      metadata,
      ip:          extractClientIp(request.rawRequest),
      userAgent:   String(request.rawRequest?.headers?.["user-agent"] ?? "").slice(0, 240),
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[user-account] audit write failed:", err);
  }
}

export const setUserAccountStatus = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    requireFounder(request);

    const targetUid = String(request.data?.uid ?? "").trim();
    const requestedStatus = String(request.data?.status ?? "").trim();
    const reason = String(request.data?.reason ?? "").trim().slice(0, 500);
    if (!targetUid) {
      throw new HttpsError("invalid-argument", "uid is required.");
    }
    if (!["active", "restricted", "deactivated"].includes(requestedStatus)) {
      throw new HttpsError("invalid-argument", "status must be active, restricted, or deactivated.");
    }
    if (requestedStatus !== "active" && reason.length < 4) {
      throw new HttpsError("invalid-argument", "A reason of at least 4 characters is required.");
    }
    if (targetUid === request.auth!.uid) {
      throw new HttpsError("failed-precondition", "You cannot change your own account status.");
    }

    let authUser: admin.auth.UserRecord;
    try {
      authUser = await admin.auth().getUser(targetUid);
    } catch {
      throw new HttpsError("not-found", "Firebase Auth user not found.");
    }
    if (authUser.customClaims?.admin === true) {
      throw new HttpsError("failed-precondition", "Ops administrator accounts cannot be managed here.");
    }

    const status = requestedStatus as Exclude<UserAccountStatus, "deleted">;
    const userRef = admin.firestore().collection("users").doc(targetUid);
    const beforeSnap = await userRef.get();
    const previousStatus = readAccountStatus(beforeSnap.exists ? beforeSnap.data() : undefined);
    const previousDisabled = authUser.disabled;
    const shouldDisable = status === "deactivated";

    try {
      if (previousDisabled !== shouldDisable) {
        await admin.auth().updateUser(targetUid, { disabled: shouldDisable });
      }

      await userRef.set({
        accountStatus:          status,
        accountStatusReason:    status === "active"
          ? admin.firestore.FieldValue.delete()
          : reason,
        accountStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        accountStatusUpdatedBy: request.auth!.uid,
        authDeletedAt:          admin.firestore.FieldValue.delete(),
        authDisabled:           shouldDisable,
      }, { merge: true });
    } catch (err: unknown) {
      if (previousDisabled !== shouldDisable) {
        try {
          await admin.auth().updateUser(targetUid, { disabled: previousDisabled });
        } catch (rollbackErr) {
          console.error("[user-account] auth rollback failed", { targetUid, rollbackErr });
        }
      }
      throw new HttpsError(
        "internal",
        err instanceof Error ? err.message : "Could not update account status.",
      );
    }

    try {
      await admin.auth().revokeRefreshTokens(targetUid);
    } catch (err) {
      console.warn("[user-account] refresh-token revocation failed:", err);
    }

    await writeUserAccountAudit(request, "user_account_status_changed", targetUid, {
      previousStatus,
      status,
      reason: status === "active" ? null : reason,
      authDisabled: shouldDisable,
    });

    return {
      ok: true as const,
      uid: targetUid,
      previousStatus,
      status,
      authDisabled: shouldDisable,
    };
  },
);

async function listAllAuthUsers(): Promise<Map<string, admin.auth.UserRecord>> {
  const users = new Map<string, admin.auth.UserRecord>();
  let pageToken: string | undefined;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const user of page.users) users.set(user.uid, user);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

export const reconcileUserAuthDirectory = onCall(
  { ...LIGHT_OPTS, timeoutSeconds: 540 },
  async (request) => {
    requireFounder(request);
    const apply = request.data?.apply === true;
    const db = admin.firestore();
    const [authUsers, usersSnap] = await Promise.all([
      listAllAuthUsers(),
      db.collection("users").get(),
    ]);

    const changes: Array<{
      uid: string;
      previousStatus: UserAccountStatus;
      status: UserAccountStatus;
      authDisabled: boolean;
    }> = [];

    for (const userDoc of usersSnap.docs) {
      const current = readAccountStatus(userDoc.data());
      const authUser = authUsers.get(userDoc.id);
      let desired: UserAccountStatus = current;
      let authDisabled = true;

      if (!authUser) {
        desired = "deleted";
      } else {
        authDisabled = authUser.disabled;
        if (authUser.disabled) {
          desired = "deactivated";
        } else if (current === "deleted" || current === "deactivated") {
          desired = "active";
        }
      }

      if (desired !== current || userDoc.data().authDisabled !== authDisabled) {
        changes.push({
          uid: userDoc.id,
          previousStatus: current,
          status: desired,
          authDisabled,
        });
      }
    }

    if (apply) {
      for (let offset = 0; offset < changes.length; offset += 400) {
        const batch = db.batch();
        for (const change of changes.slice(offset, offset + 400)) {
          const payload: Record<string, unknown> = {
            accountStatus:          change.status,
            accountStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            accountStatusUpdatedBy: request.auth!.uid,
            authDisabled:           change.authDisabled,
          };
          if (change.status === "deleted") {
            payload.accountStatusReason = "Firebase Authentication user not found during reconciliation.";
            payload.authDeletedAt = admin.firestore.FieldValue.serverTimestamp();
          } else if (change.status === "deactivated") {
            payload.accountStatusReason = "Firebase Authentication user is disabled.";
            payload.authDeletedAt = admin.firestore.FieldValue.delete();
          } else {
            payload.accountStatusReason = admin.firestore.FieldValue.delete();
            payload.authDeletedAt = admin.firestore.FieldValue.delete();
          }
          batch.set(db.collection("users").doc(change.uid), payload, { merge: true });
        }
        await batch.commit();
      }

      await writeUserAccountAudit(request, "user_auth_directory_reconciled", "users", {
        scannedFirestoreUsers: usersSnap.size,
        scannedAuthUsers: authUsers.size,
        changed: changes.length,
        deleted: changes.filter((change) => change.status === "deleted").length,
        deactivated: changes.filter((change) => change.status === "deactivated").length,
        reactivated: changes.filter((change) => change.status === "active").length,
      });
    }

    return {
      ok: true as const,
      dryRun: !apply,
      scannedFirestoreUsers: usersSnap.size,
      scannedAuthUsers: authUsers.size,
      changed: changes.length,
      deleted: changes.filter((change) => change.status === "deleted").length,
      deactivated: changes.filter((change) => change.status === "deactivated").length,
      reactivated: changes.filter((change) => change.status === "active").length,
      changes: changes.slice(0, 200),
    };
  },
);

function requireFounder(request: CallableRequest<Record<string, unknown>>): void {
  const token = request.auth?.token;
  if (!token || token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  // Legacy admins (admin:true with no role claim) are treated as
  // founders until the migration callable runs. That's by design —
  // it keeps existing admins working through the migration without
  // a flag day.
  const role = token.role;
  if (role && role !== "founder") {
    throw new HttpsError("permission-denied", "Founder role required.");
  }
}

async function writeOpsAdminAudit(
  request: CallableRequest<Record<string, unknown>>,
  action: "admin_invited" | "admin_revoked" | "admin_role_changed" | "role_permissions_updated",
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
    requireFounder(request);
    const rows = await listOpsAdmins();
    return { rows };
  },
);

export const inviteOpsAdminFn = onCall(
  { ...LIGHT_OPTS, secrets: [RESEND_API_KEY] },
  async (request) => {
    requireFounder(request);
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
      rejectReturnUrl(returnOrigin, "ops-admin-invite");
    }

    const requestedRole = String(request.data?.role ?? "founder") as OpsRole;
    if (!OPS_ROLES.includes(requestedRole)) {
      throw new HttpsError("invalid-argument", `Unknown role: ${requestedRole}`);
    }

    const result = await inviteOpsAdmin({
      email,
      returnUrl,
      resendKey: RESEND_API_KEY.value(),
      role:      requestedRole,
    });

    await writeOpsAdminAudit(request, "admin_invited", result.uid, {
      email:       result.email,
      granted:     result.granted,
      userCreated: result.userCreated,
      emailSent:   result.emailSent,
      role:        requestedRole,
    });

    return result;
  },
);

export const revokeOpsAdminFn = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    requireFounder(request);
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

// ─── Role management — founder-only ─────────────────────────────────────

/** Change another admin's role. Founder-only; the source helper also
 *  refuses self-demotion away from founder. */
export const setOpsAdminRoleFn = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    requireFounder(request);
    const targetUid = String(request.data?.uid ?? "");
    const role      = String(request.data?.role ?? "") as OpsRole;
    if (!targetUid) throw new HttpsError("invalid-argument", "Missing target uid.");
    if (!OPS_ROLES.includes(role)) {
      throw new HttpsError("invalid-argument", `Unknown role: ${role}`);
    }
    const result = await setOpsAdminRole({
      targetUid,
      actorUid: request.auth!.uid,
      role,
    });
    await writeOpsAdminAudit(request, "admin_role_changed", targetUid, { newRole: role });
    return result;
  },
);

/** Idempotent migration: any admin without a role claim becomes
 *  founder. Safe to re-run. Used once after the role-based UI rolls
 *  out so existing admins don't have to wait for a fresh sign-in
 *  before their permissions resolve. */
export const migrateAdminsToFoundersFn = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    requireFounder(request);
    const result = await migrateAdminsToFounders();
    return result;
  },
);

// ─── Role permissions — page allow-lists per role, stored as a Firestore
//     doc so the founder can edit them live and every ops portal session
//     picks the change up via onSnapshot. ────────────────────────────────

const DEFAULT_ROLE_PERMISSIONS: Record<"analyst" | "developer", string[]> = {
  // Sensible starting point — customer-support shaped role. Includes
  // /surveys so analysts can see post-completion feedback. The
  // founder can flip toggles to add Payments, Errors, etc. later.
  analyst:   ["/", "/users", "/audit", "/report", "/surveys", "/email/failures"],
  // Engineering-shaped role: ops, errors, health, audit. Maintenance
  // toggle is on the Dashboard so granting "/" gives the developer
  // the maintenance card too.
  developer: ["/", "/errors", "/health", "/audit"],
};

/** Read the current role permissions doc, returning defaults for any
 *  missing role. The founder doesn't appear in this map — founder
 *  always sees everything. */
export const getRolePermissions = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only.");
    }
    const snap = await admin.firestore().doc("appConfig/rolePermissions").get();
    const data = snap.exists ? (snap.data() ?? {}) : {};
    return {
      analyst:   Array.isArray(data.analyst)   ? data.analyst   : DEFAULT_ROLE_PERMISSIONS.analyst,
      developer: Array.isArray(data.developer) ? data.developer : DEFAULT_ROLE_PERMISSIONS.developer,
    };
  },
);

/** Founder-only: overwrite the allowed-pages list for one role. The
 *  doc is merged so editing analyst doesn't touch developer. */
export const setRolePermissions = onCall(
  { ...LIGHT_OPTS },
  async (request) => {
    requireFounder(request);
    const role = String(request.data?.role ?? "");
    if (role !== "analyst" && role !== "developer") {
      throw new HttpsError("invalid-argument", "Role must be analyst or developer.");
    }
    const rawPages = request.data?.allowedPages;
    if (!Array.isArray(rawPages)) {
      throw new HttpsError("invalid-argument", "allowedPages must be an array.");
    }
    // Sanitise + dedupe. Pages must be string paths beginning with /.
    const pages = Array.from(new Set(
      rawPages
        .filter((p: unknown) => typeof p === "string")
        .map((p: string) => p.trim())
        .filter((p: string) => p.startsWith("/"))
        .slice(0, 100),
    ));
    const ref = admin.firestore().doc("appConfig/rolePermissions");
    await ref.set({
      [role]:      pages,
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
      updatedBy:   request.auth!.uid,
    }, { merge: true });
    await writeOpsAdminAudit(request, "role_permissions_updated", role, { pages });
    return { ok: true, role, pages };
  },
);
