import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { generateClaudeMatchExplanation } from "./claudeExplainMatches.js";
import { sendWaitlistWelcome } from "./waitlistEmail.js";
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
  createDodoCheckoutSession,
  verifyDodoWebhook,
  applyPaymentSucceeded,
  applyPaymentRefunded,
} from "./dodoPayments.js";

admin.initializeApp();

const ANTHROPIC_API_KEY        = defineSecret("ANTHROPIC_API_KEY");
const HEYGEN_API_KEY           = defineSecret("HEYGEN_API_KEY");
const DODO_PAYMENTS_API_KEY    = defineSecret("DODO_PAYMENTS_API_KEY");
const DODO_PAYMENTS_WEBHOOK_KEY = defineSecret("DODO_PAYMENTS_WEBHOOK_KEY");
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
const HEAVY_OPTS = { maxInstances: 50, concurrency: 40 } as const;
// LIGHT_OPTS — for cheap CRUD-ish callables. Default concurrency (80) is fine.
const LIGHT_OPTS = { maxInstances: 50 } as const;
// HOT_OPTS — for functions in the interview loop that fire repeatedly during
// a single user session. minInstances: 1 keeps one instance always-warm so
// the first request after a quiet period doesn't pay a 3-8s Node + Anthropic
// SDK cold-start tax. Cost: one always-warm 512MiB instance is ~$3-5/month
// per function — fine for the latency win on the most-impactful UX path.
// At higher scale (>10k DAU) raise minInstances proportionally.
const HOT_OPTS  = { maxInstances: 50, concurrency: 40, minInstances: 1 } as const;

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
//   • Free-on-signup grant was 20; cut to 5 so anonymous farming isn't a
//     loss-leader. A new user can run 5 match reports before paying.
//   • Successful referrals award 5 credits to the referrer.
const MATCH_REPORT_CREDIT_COST = 1;
const VISA_INTERVIEW_CREDIT_COST = 15;
const FREE_CREDITS_ON_SIGNUP   = 5;

// Supporting-doc cap per interview. Each upload runs a Sonnet vision
// extraction (~$0.012). Without a cap, one bad actor uploading 20 PDFs
// burns ~$0.25 of margin on a single 15-credit session. Three covers the
// realistic ask (bank statement, sponsor letter, employment letter).
const MAX_SUPPORTING_DOCS_PER_INTERVIEW = 3;

// Dodo Payments — one-time credit-pack products. The product_id values must
// match what's configured in the Dodo dashboard. Pricing lives in Dodo (we
// don't trust the client) but we mirror it here for the in-app billing UI.
//
// Edit this list when launching new packs; the credit amount and price are
// also referenced by the client UI via the listCreditPacks callable.
export const CREDIT_PACKS: Record<string, {
  productId: string;     // Dodo product id — set after creating products in dashboard
  label: string;
  priceUsd: number;      // What we charge
  credits: number;       // What the user receives
  recommended?: boolean;
}> = {
  starter: { productId: "REPLACE_WITH_DODO_PRODUCT_ID_STARTER", label: "Starter", priceUsd:   5, credits:   5 },
  plus:    { productId: "REPLACE_WITH_DODO_PRODUCT_ID_PLUS",    label: "Plus",    priceUsd:  20, credits:  30, recommended: true },
  pro:     { productId: "REPLACE_WITH_DODO_PRODUCT_ID_PRO",     label: "Pro",     priceUsd:  50, credits: 100 },
  power:   { productId: "REPLACE_WITH_DODO_PRODUCT_ID_POWER",   label: "Power",   priceUsd: 120, credits: 250 },
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
// applyReferralCode — credits the referrer with 5 credits when a
// new user signs up via their referral link. Idempotent per-user:
// a user can only be referred once, never themselves.
// ============================================================

const REFERRAL_REWARD = 5;

export const applyReferralCode = onCall({ ...LIGHT_OPTS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be logged in");

  const code = (request.data?.code ?? "").toString().trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Missing referral code");

  const db = admin.firestore();

  // Look up the referrer outside the transaction (read-only, safe to do
  // pre-tx). The expensive part is just the credit math, which we re-check
  // atomically below.
  const codeDoc = await db.collection("referralCodes").doc(code).get();
  if (!codeDoc.exists) return { ok: false, reason: "invalid_code" };
  const referrerUid = codeDoc.data()?.userId as string | undefined;
  if (!referrerUid)               return { ok: false, reason: "invalid_code" };
  if (referrerUid === uid)        return { ok: false, reason: "self_referral" };

  // SECURITY (audit 2026-05-15): the `referredBy` guard MUST live inside the
  // transaction. Reading it outside was racy: two parallel calls both saw an
  // empty `referredBy` and both credited the referrer, yielding 2× the
  // intended reward per fake account. Inside the transaction, the second
  // call now sees the first call's write and bails with already_referred.
  const result = await db.runTransaction(async (tx) => {
    const userRef           = db.collection("users").doc(uid);
    const referrerWalletRef = db.collection("creditWallets").doc(referrerUid);
    const txRef             = db.collection("creditTransactions").doc();
    const now               = admin.firestore.FieldValue.serverTimestamp();

    const userSnap = await tx.get(userRef);
    if (userSnap.exists && userSnap.data()?.referredBy) {
      return { ok: false as const, reason: "already_referred" as const };
    }

    const walletSnap = await tx.get(referrerWalletRef);
    const currentCredits = walletSnap.exists
      ? (walletSnap.data()?.credits ?? FREE_CREDITS_ON_SIGNUP)
      : FREE_CREDITS_ON_SIGNUP;

    tx.set(referrerWalletRef, { credits: currentCredits + REFERRAL_REWARD, updatedAt: now }, { merge: true });
    tx.set(userRef,           { referredBy: referrerUid, referredAt: now }, { merge: true });
    tx.set(txRef, {
      userId:          referrerUid,
      amount:          REFERRAL_REWARD,
      type:            "referral_reward",
      referredUserId:  uid,
      createdAt:       now,
    });
    return { ok: true as const, creditsAwarded: REFERRAL_REWARD };
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
    ...HEAVY_OPTS,
    secrets: [ANTHROPIC_API_KEY],
    // Claude can take 10–30s to rank a full candidate list. Be generous.
    timeoutSeconds: 90,
    memory:         "512MiB",
  },
  async (request) => {
    const uid = request.auth?.uid;
    void uid; // anonymous matching is allowed (used during /results preview)

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
    ...HEAVY_OPTS,
    secrets: [ANTHROPIC_API_KEY],
    // Claude takes 30–90s to explain 10 schools with detailed tips. Default
    // 60s timeout was too tight — the function would time out mid-Claude
    // response and the client got a CORS error (no headers on a killed
    // response). 300s is the v2 callable maximum.
    timeoutSeconds: 300,
    memory:         "512MiB",
  },
  async (request) => {
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
    {
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

      if (currentCredits < MATCH_REPORT_CREDIT_COST) {
        throw new HttpsError("resource-exhausted", "Insufficient credits");
      }

      transaction.update(walletRef, { credits: currentCredits - MATCH_REPORT_CREDIT_COST, updatedAt: now });

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

      transaction.set(txRef, {
        userId:    uid,
        amount:    -MATCH_REPORT_CREDIT_COST,
        type:      "unlock_report",
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
    await db.runTransaction(async (tx) => {
      const wallet = await tx.get(walletRef);
      let credits: number;
      if (!wallet.exists) {
        credits = FREE_CREDITS_ON_SIGNUP;
        tx.set(walletRef, { credits: FREE_CREDITS_ON_SIGNUP, updatedAt: now });
      } else {
        credits = wallet.data()?.credits ?? 0;
      }
      if (credits < VISA_INTERVIEW_CREDIT_COST) {
        throw new HttpsError("resource-exhausted", "Insufficient credits");
      }
      tx.update(walletRef, { credits: credits - VISA_INTERVIEW_CREDIT_COST, updatedAt: now });

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
        amount:    -VISA_INTERVIEW_CREDIT_COST,
        type:      "visa_interview_start",
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
  { ...HEAVY_OPTS, secrets: [HEYGEN_API_KEY] },
  async (request) => {
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
// Dodo Payments — credit-pack checkout + webhook
// ─────────────────────────────────────────────────────────────────────────────

// Toggle live vs. test by env. We default to live so production isn't an
// opt-in; set DODO_ENV=test_mode in the function config when developing.
const DODO_ENV: "live_mode" | "test_mode" =
  (process.env.DODO_ENV === "test_mode") ? "test_mode" : "live_mode";

/** Public catalogue — client reads this to render the billing tab. */
export const listCreditPacks = onCall({ ...LIGHT_OPTS }, async () => {
  return Object.entries(CREDIT_PACKS).map(([id, p]) => ({
    id,
    label:       p.label,
    priceUsd:    p.priceUsd,
    credits:     p.credits,
    recommended: !!p.recommended,
  }));
});

/**
 * Create a Dodo checkout session for the requested credit pack and return
 * the URL the browser should redirect to. The client supplies only the
 * packId — pricing and credit amount come from CREDIT_PACKS server-side so
 * a tampered client can't pay $5 for the Power pack.
 */
export const createDodoCheckout = onCall(
  { ...LIGHT_OPTS, secrets: [DODO_PAYMENTS_API_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid)                throw new HttpsError("unauthenticated", "Sign in to buy credits");
    const userEmail = request.auth?.token?.email;
    if (!userEmail)          throw new HttpsError("failed-precondition", "Your account has no email — contact support");

    const packId    = String(request.data?.packId ?? "");
    const returnUrl = String(request.data?.returnUrl ?? "");
    const pack = CREDIT_PACKS[packId];
    if (!pack)               throw new HttpsError("invalid-argument", "Unknown credit pack");
    if (!returnUrl.startsWith("https://") && !returnUrl.startsWith("http://localhost"))
      throw new HttpsError("invalid-argument", "Invalid returnUrl");
    if (pack.productId.startsWith("REPLACE_WITH"))
      throw new HttpsError("failed-precondition", "Credit pack not configured — admin must set Dodo product IDs.");

    try {
      const { checkoutUrl, sessionId } = await createDodoCheckoutSession({
        apiKey:      DODO_PAYMENTS_API_KEY.value(),
        environment: DODO_ENV,
        pack,
        packId,
        userId:      uid,
        userEmail,
        returnUrl,
      });
      return { checkoutUrl, sessionId };
    } catch (err: any) {
      console.error("[dodo] checkout creation failed:", err?.message ?? err);
      throw new HttpsError("internal", "Could not start checkout. Please try again.");
    }
  },
);

/**
 * Dodo webhook receiver. Raw HTTP endpoint (not callable) because Dodo posts
 * from the outside world. We verify the signature with the webhook secret,
 * then atomically credit the user's wallet on payment.succeeded.
 *
 * Returns:
 *   200 + { ok: true }           on successful credit
 *   200 + { duplicated: true }   on already-processed (Dodo retries)
 *   200 + { ignored: true }      for event types we don't handle (still 200
 *                                so Dodo doesn't retry forever)
 *   400 on signature failure (causes Dodo to retry — correct behavior)
 *
 * IMPORTANT: returning anything other than 200 will cause Dodo to retry,
 * so 200 is the right answer for "we got it, even if it was a duplicate
 * or an event we don't care about."
 */
export const dodoWebhook = onRequest(
  { ...LIGHT_OPTS, secrets: [DODO_PAYMENTS_WEBHOOK_KEY], cors: false },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // We need the raw body for signature verification. Firebase v2 onRequest
    // gives us req.rawBody as a Buffer when content-type is application/json.
    const rawBody = (req.rawBody ?? Buffer.from("")).toString("utf8");
    const webhookId        = String(req.header("webhook-id") ?? "");
    const webhookSignature = String(req.header("webhook-signature") ?? "");
    const webhookTimestamp = String(req.header("webhook-timestamp") ?? "");

    if (!webhookId || !webhookSignature || !webhookTimestamp) {
      res.status(400).send("Missing webhook headers");
      return;
    }

    let event;
    try {
      event = verifyDodoWebhook({
        rawBody,
        webhookKey:       DODO_PAYMENTS_WEBHOOK_KEY.value(),
        webhookId,
        webhookSignature,
        webhookTimestamp,
      });
    } catch (err: any) {
      console.warn("[dodo] webhook signature invalid:", err?.message ?? err);
      // 400 so Dodo retries — could be a transient timestamp drift.
      res.status(400).send("Invalid signature");
      return;
    }

    try {
      if (event.type === "payment.succeeded") {
        const result = await applyPaymentSucceeded(event);
        if (!result.applied && !result.duplicated) {
          console.warn("[dodo] payment.succeeded not applied:", result.reason);
        }
        res.status(200).json({ ok: result.applied, duplicated: !!result.duplicated });
        return;
      }
      // Audit 2026-05-15: handle refunds/chargebacks by reversing the credit
      // grant. Dodo emits `payment.refunded` for admin refunds; chargebacks
      // arrive as `dispute.created` (treated the same — credits come back).
      if (event.type === "payment.refunded" || event.type === "dispute.created") {
        const result = await applyPaymentRefunded(event);
        if (!result.applied && !result.duplicated) {
          console.warn(`[dodo] ${event.type} not applied:`, result.reason);
        }
        res.status(200).json({ ok: result.applied, duplicated: !!result.duplicated });
        return;
      }
      // payment.failed and any other events: log and 200 so Dodo stops retrying.
      console.log("[dodo] received event:", event.type);
      res.status(200).json({ ignored: true });
    } catch (err: any) {
      console.error("[dodo] webhook processing error:", err?.message ?? err);
      // 500 so Dodo retries — transient Firestore issue, etc.
      res.status(500).send("Webhook processing failed");
    }
  },
);

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
