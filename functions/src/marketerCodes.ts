// ─────────────────────────────────────────────────────────────────────────────
// marketerCodes — admin-issued referral codes for marketers / partners.
//
// Lives in the same /referralCodes collection as user-generated codes
// (the 6-char auto-hashed ones), distinguished by `type: "marketer"`.
// User codes don't have a `type` field today; we treat the absence of
// `type` as `type: "user"` so the existing collection keeps working
// without a backfill.
//
// Schema (in addition to the inherited code-as-doc-id key):
//   type:                   "marketer"
//   marketerName:           string                  — display label
//   bonusCreditsForNewUser: number                  — granted to the
//                                                     REFEREE on apply
//   enabled:                boolean                 — admin off-switch
//   maxRedemptions:         number | null           — usage cap
//   redemptionCount:        number                  — running total
//   expiresAt:              Timestamp | null        — past = unusable
//   createdAt / createdBy / lastRedeemedAt          — bookkeeping
//
// Semantics differ from user codes:
//   - User codes pay the REFERRER. Marketers usually get paid out-of-band
//     (cash / Stripe Connect / etc); the credits go to the NEW USER to
//     drive activation. `bonusCreditsForNewUser` is the lever the admin
//     uses to set the offer per campaign (e.g. "JANE2025 → 10 extra
//     credits on signup").
//   - Self-referral isn't a concept here; the marketer isn't a user.
//
// Every action below is admin-gated at the callable layer (see
// index.ts); this module assumes the caller is already authorised.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

// Code format: uppercase letters, digits, underscore, hyphen.
// 3 chars minimum so a typo on the URL can't collide as easily; 32
// max so it still fits in a tweet / email signature.
const CODE_REGEX = /^[A-Z0-9_-]{3,32}$/;
// Cap to prevent fat-finger free-money grants ("100,000 credits!").
// 100 is roughly $33 worth at the Try-pack rate — well above any
// realistic acquisition offer.
const MAX_BONUS_CREDITS = 100;
// Listing cap. 200 is plenty for any campaign volume the founder
// would manage manually; if we ever need more, paginate.
const LIST_CAP = 200;

export interface MarketerCodeRow {
  code:                   string;
  marketerName:           string;
  bonusCreditsForNewUser: number;
  enabled:                boolean;
  redemptionCount:        number;
  maxRedemptions:         number | null;
  expiresAtMs:            number | null;
  createdAtMs:            number | null;
  createdBy:              string | null;
  lastRedeemedAtMs:       number | null;
}

function tsToMs(value: any): number | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return null;
}

// ─── Create ─────────────────────────────────────────────────────────────

export interface CreateMarketerCodeArgs {
  code:                    string;
  marketerName:            string;
  bonusCreditsForNewUser?: number;
  expiresAtMs?:            number | null;
  maxRedemptions?:         number | null;
  actorUid:                string;
}

export async function createMarketerCode(args: CreateMarketerCodeArgs): Promise<{ code: string }> {
  const code = args.code.trim().toUpperCase();
  if (!CODE_REGEX.test(code)) {
    throw new HttpsError("invalid-argument", "Code must be 3–32 characters: A–Z, 0–9, _, -");
  }
  const marketerName = args.marketerName.trim().slice(0, 100);
  if (!marketerName) {
    throw new HttpsError("invalid-argument", "Marketer name is required.");
  }
  const bonus = Math.max(0, Math.min(MAX_BONUS_CREDITS, Math.floor(args.bonusCreditsForNewUser ?? 5)));
  const max   = typeof args.maxRedemptions === "number" && args.maxRedemptions > 0
    ? Math.floor(args.maxRedemptions)
    : null;
  const eta   = typeof args.expiresAtMs === "number" && args.expiresAtMs > Date.now()
    ? args.expiresAtMs
    : null;

  const db  = admin.firestore();
  const ref = db.collection("referralCodes").doc(code);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpsError("already-exists", `Code "${code}" is already in use.`);
  }

  await ref.set({
    type:                    "marketer",
    marketerName,
    bonusCreditsForNewUser:  bonus,
    enabled:                 true,
    redemptionCount:         0,
    maxRedemptions:          max,
    expiresAt:               eta ? admin.firestore.Timestamp.fromMillis(eta) : null,
    createdAt:               admin.firestore.FieldValue.serverTimestamp(),
    createdBy:               args.actorUid,
    lastRedeemedAt:          null,
  });

  return { code };
}

// ─── List ───────────────────────────────────────────────────────────────

export async function listMarketerCodes(): Promise<MarketerCodeRow[]> {
  const db = admin.firestore();

  // Fast path: composite (type, createdAt desc) index — declared in
  // firestore.indexes.json and used when ready.
  try {
    const snap = await db.collection("referralCodes")
      .where("type", "==", "marketer")
      .orderBy("createdAt", "desc")
      .limit(LIST_CAP)
      .get();
    return snap.docs.map(mapDocToRow);
  } catch (err: any) {
    // Firestore returns FAILED_PRECONDITION (gRPC code 9) when the
    // composite index is missing OR still building post-deploy. We
    // fall back to scanning the whole collection and filtering in
    // memory so the ops portal stays functional during the few
    // minutes Firestore needs to backfill an index. At this scale
    // (admin-managed campaign codes) the collection is bounded — a
    // few hundred docs max — so the fallback cost is negligible.
    const code = err?.code ?? err?.status;
    const message = String(err?.message ?? "");
    const looksLikeIndexIssue =
      code === 9 ||
      code === "failed-precondition" ||
      message.includes("requires an index") ||
      message.includes("index is currently building");
    if (!looksLikeIndexIssue) throw err;

    console.warn("[marketerCodes] composite index unavailable, using in-memory fallback");
    const allSnap = await db.collection("referralCodes").get();
    const rows = allSnap.docs
      .filter((d) => (d.data() as any)?.type === "marketer")
      .map(mapDocToRow)
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
      .slice(0, LIST_CAP);
    return rows;
  }
}

// Shared row mapping so both the fast-path and fallback queries produce
// the same shape. Defaults match the create-time defaults below.
function mapDocToRow(d: FirebaseFirestore.QueryDocumentSnapshot): MarketerCodeRow {
  const data: any = d.data();
  return {
    code:                   d.id,
    marketerName:           typeof data.marketerName === "string" ? data.marketerName : "",
    bonusCreditsForNewUser: typeof data.bonusCreditsForNewUser === "number" ? data.bonusCreditsForNewUser : 5,
    enabled:                data.enabled !== false,
    redemptionCount:        typeof data.redemptionCount === "number" ? data.redemptionCount : 0,
    maxRedemptions:         typeof data.maxRedemptions === "number" ? data.maxRedemptions : null,
    expiresAtMs:            tsToMs(data.expiresAt),
    createdAtMs:            tsToMs(data.createdAt),
    createdBy:              typeof data.createdBy === "string" ? data.createdBy : null,
    lastRedeemedAtMs:       tsToMs(data.lastRedeemedAt),
  };
}

// ─── Toggle enable/disable ─────────────────────────────────────────────

export async function setMarketerCodeEnabled(code: string, enabled: boolean): Promise<void> {
  const normalisedCode = code.trim().toUpperCase();
  if (!CODE_REGEX.test(normalisedCode)) {
    throw new HttpsError("invalid-argument", "Invalid code format.");
  }
  const db  = admin.firestore();
  const ref = db.collection("referralCodes").doc(normalisedCode);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Code "${normalisedCode}" does not exist.`);
  }
  if (snap.data()?.type !== "marketer") {
    // Auto-generated user codes don't live in the admin's surface; we
    // refuse to flip them on / off via this path so the ops portal
    // can't accidentally interfere with a real user's referral link.
    throw new HttpsError("permission-denied", "This code is a user-generated code and can't be toggled from the marketing surface.");
  }
  await ref.update({
    enabled,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── Apply (called from applyReferralCode) ──────────────────────────────

export type ApplyMarketerCodeResult =
  | { ok: true;  creditsAwarded: number; marketerName: string | null }
  | { ok: false; reason: "code_disabled" | "code_expired" | "code_exhausted" | "already_referred" | "invalid_code" };

export async function applyMarketerCode(args: {
  uid:                  string;
  code:                 string;
  /** The implicit starting balance a new user is entitled to before
   *  any redemption. Passed in by the caller (applyReferralCode) so
   *  this module doesn't have to import the FREE_CREDITS_ON_SIGNUP
   *  constant from the main app. Used as the default when the
   *  wallet doc doesn't exist yet — without this, applying a
   *  marketer code on a fresh account would wipe the free signup
   *  grant by writing `0 + bonus` to a previously-non-existent
   *  wallet. */
  freeSignupCredits:    number;
}): Promise<ApplyMarketerCodeResult> {
  const db      = admin.firestore();
  const codeRef = db.collection("referralCodes").doc(args.code);

  return await db.runTransaction(async (tx) => {
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists) return { ok: false as const, reason: "invalid_code" as const };
    const codeData: any = codeSnap.data() ?? {};
    if (codeData.type !== "marketer") {
      // Defensive — dispatcher upstream should already have routed
      // user codes to the user-code path. Treat as invalid here
      // rather than silently swallowing it.
      return { ok: false as const, reason: "invalid_code" as const };
    }
    if (codeData.enabled === false) return { ok: false as const, reason: "code_disabled" as const };
    const expMs = tsToMs(codeData.expiresAt);
    if (expMs && Date.now() > expMs)        return { ok: false as const, reason: "code_expired" as const };
    if (typeof codeData.maxRedemptions === "number"
        && (codeData.redemptionCount ?? 0) >= codeData.maxRedemptions) {
      return { ok: false as const, reason: "code_exhausted" as const };
    }

    const userRef    = db.collection("users").doc(args.uid);
    const walletRef  = db.collection("creditWallets").doc(args.uid);
    const txEntryRef = db.collection("creditTransactions").doc();
    const now        = admin.firestore.FieldValue.serverTimestamp();

    const userSnap = await tx.get(userRef);
    if (userSnap.exists && (userSnap.data()?.referredBy || userSnap.data()?.referredByMarketerCode)) {
      // A user can only consume one referral incentive per account.
      // Caps the free-money exposure even if a leaked code is paired
      // with a leaked user code.
      return { ok: false as const, reason: "already_referred" as const };
    }

    const bonus = typeof codeData.bonusCreditsForNewUser === "number"
      ? codeData.bonusCreditsForNewUser
      : 5;

    // When a wallet doc doesn't exist yet, the implicit balance is
    // the free-signup grant — every spending callable (unlockMatchReport,
    // startVisaInterviewSession, etc.) treats a missing wallet as
    // "user has FREE_CREDITS_ON_SIGNUP available". We need to materialise
    // that same grant here, otherwise this is the first wallet write and
    // we'd overwrite the implicit grant with `0 + bonus`.
    const walletSnap = await tx.get(walletRef);
    const currentCredits = walletSnap.exists
      ? (walletSnap.data()?.credits ?? args.freeSignupCredits)
      : args.freeSignupCredits;

    tx.set(walletRef, {
      credits:   currentCredits + bonus,
      updatedAt: now,
    }, { merge: true });

    tx.set(userRef, {
      referredByMarketerCode: args.code,
      referredAt:             now,
    }, { merge: true });

    tx.set(txEntryRef, {
      userId:       args.uid,
      amount:       bonus,
      type:         "marketer_referral_bonus",
      referralCode: args.code,
      marketerName: codeData.marketerName ?? null,
      createdAt:    now,
    });

    tx.update(codeRef, {
      redemptionCount: admin.firestore.FieldValue.increment(1),
      lastRedeemedAt:  now,
    });

    return {
      ok:             true as const,
      creditsAwarded: bonus,
      marketerName:   codeData.marketerName ?? null,
    };
  });
}
