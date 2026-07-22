// ─────────────────────────────────────────────────────────────────────────────
// roadmapClient — client-side Firestore wrapper for studyRoadmaps/{uid}.
//
// Production-safety rewrite (2026-06-09):
//   - Split create from update. Onboarding creates a doc only when none
//     exists. Re-running the diagnostic NEVER overwrites the checklist;
//     it goes through updateRoadmapDiagnostic, which preserves every
//     status, completion timestamp, and note.
//   - Every write runs inside runTransaction(). Two tabs editing
//     different checklist items can no longer lose each other's
//     updates.
//   - Reconciliation never overwrites manual progress, and uses a
//     free-tier-aware signal for d_first_match (the studentProfiles
//     intake doc) rather than the paid match-report.
//   - Stage changes preserve every checklist item including its
//     status. Backward stage changes don't reset history.
//
// Security model: client-side Firestore writes scoped by rules
// (studyRoadmaps/{userId} requires request.auth.uid == userId). The
// roadmap involves no credits, no AI calls, no money — so server-side
// gating beyond the rules layer is unnecessary.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection, doc, getDoc, getDocs, query, where, limit,
  runTransaction, setDoc, onSnapshot, serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  STUDY_ROADMAP_VERSION,
  applyDiagnosticUpdate,
  calculateProgress,
  generateRoadmapForUser,
  getRecommendedToolForStage,
  mergeChecklistWithTemplate,
  ROADMAP_STAGE_ORDER,
  type ChecklistItemStatus,
  type OnboardingAnswers,
  type RoadmapStageId,
  type StudyRoadmap,
} from "./studyAbroad";

const COLLECTION = "studyRoadmaps";
const roadmapRef = (uid: string) => doc(db, COLLECTION, uid);

// ── Custom errors so callers can branch cleanly ─────────────────────
export class RoadmapAlreadyExistsError extends Error {
  constructor(uid: string) {
    super(`Roadmap already exists for ${uid}. Use updateRoadmapDiagnostic instead of createRoadmap.`);
    this.name = "RoadmapAlreadyExistsError";
  }
}
export class RoadmapMissingError extends Error {
  constructor(uid: string) {
    super(`No roadmap exists for ${uid}. Call createRoadmap first.`);
    this.name = "RoadmapMissingError";
  }
}
export class ChecklistItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Checklist item ${itemId} no longer exists. The template may have changed; refresh the page.`);
    this.name = "ChecklistItemNotFoundError";
  }
}

// ─────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────
export async function getStudyRoadmap(uid: string): Promise<StudyRoadmap | null> {
  const snap = await getDoc(roadmapRef(uid));
  if (!snap.exists()) return null;
  return snap.data() as StudyRoadmap;
}

export function subscribeStudyRoadmap(
  uid: string,
  onUpdate: (roadmap: StudyRoadmap | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    roadmapRef(uid),
    (snap) => onUpdate(snap.exists() ? (snap.data() as StudyRoadmap) : null),
    (err) => {
      console.error("[roadmap] subscribe error:", err);
      onError?.(err as Error);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────
// CREATE — first-time onboarding only
//
// Refuses if a doc already exists. Re-runs of the diagnostic must use
// updateRoadmapDiagnostic instead. This split makes accidental
// destructive overwrites impossible.
// ─────────────────────────────────────────────────────────────────────
export async function createRoadmap(args: {
  uid: string;
  answers: OnboardingAnswers;
}): Promise<StudyRoadmap> {
  const { uid, answers } = args;
  // Read-then-write isn't strictly atomic without a transaction, but
  // createRoadmap is only ever called from a single-user single-tab
  // onboarding submit, so the race window is hours wide and
  // user-controlled. We still use runTransaction so we never overwrite
  // a doc someone else just created.
  return await runTransaction(db, async (tx) => {
    const ref = roadmapRef(uid);
    const snap = await tx.get(ref);
    if (snap.exists()) {
      throw new RoadmapAlreadyExistsError(uid);
    }
    const roadmap = generateRoadmapForUser({ userId: uid, answers });
    tx.set(ref, {
      ...roadmap,
      // Firestore server timestamps for doc-level audit fields. Item-
      // level timestamps stay as epoch ms numbers (set inside
      // generateRoadmapForUser) for portability + emulator-testability.
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return roadmap;
  });
}

// ─────────────────────────────────────────────────────────────────────
// UPDATE DIAGNOSTIC — re-run of the 6-question wizard
//
// Replaces only the diagnostic-derived fields. Preserves every
// checklist item's status, completedAt, notes. Picks up any new
// template items via mergeChecklistWithTemplate.
// ─────────────────────────────────────────────────────────────────────
export async function updateRoadmapDiagnostic(args: {
  uid: string;
  answers: OnboardingAnswers;
}): Promise<StudyRoadmap> {
  const { uid, answers } = args;
  return await runTransaction(db, async (tx) => {
    const ref = roadmapRef(uid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new RoadmapMissingError(uid);
    const existing = snap.data() as StudyRoadmap;
    const next = applyDiagnosticUpdate({ existing, answers });
    // merge:true is defensive. `next` spreads `...existing`, so today it
    // already carries server-owned fields (e.g. `reminderSentAt`, stamped by
    // the engagement-reminder sweep through the Admin SDK) back into the
    // write — which is what the update rule's hasAll(resource.data.keys())
    // demands. Merging keeps that true even if `existing` is ever narrowed to
    // the typed StudyRoadmap shape and silently drops unknown server fields,
    // which would otherwise resurface as permission-denied.
    //
    // The rules side of this pairing matters just as much: any such field
    // must also be listed in roadmapKeysHaveOnly, or hasOnly rejects it.
    tx.set(ref, {
      ...next,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return next;
  });
}

/**
 * Convenience: create-or-update. Used by the onboarding submit to
 * pick the right path without the caller having to read the doc
 * first. Internally still uses the two split functions; just dispatches.
 */
export async function upsertRoadmapFromOnboarding(args: {
  uid: string;
  answers: OnboardingAnswers;
}): Promise<{ roadmap: StudyRoadmap; mode: "created" | "updated" }> {
  try {
    const roadmap = await createRoadmap(args);
    return { roadmap, mode: "created" };
  } catch (err) {
    if (err instanceof RoadmapAlreadyExistsError) {
      const roadmap = await updateRoadmapDiagnostic(args);
      return { roadmap, mode: "updated" };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Checklist item updates — TRANSACTIONAL
//
// Re-reads inside the transaction, mutates the single targeted item,
// recomputes progress, writes back. Two tabs writing different items
// concurrently cannot lose each other's updates: the second tab's
// transaction sees the first tab's write and re-runs against the
// fresh state.
// ─────────────────────────────────────────────────────────────────────
export async function updateChecklistItemStatus(args: {
  uid: string;
  itemId: string;
  status: ChecklistItemStatus;
  notes?: string;
}): Promise<void> {
  const { uid, itemId, status, notes } = args;
  await runTransaction(db, async (tx) => {
    const ref = roadmapRef(uid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new RoadmapMissingError(uid);
    const data = snap.data() as StudyRoadmap;

    let found = false;
    const now = Date.now();
    const checklist = data.checklist.map((item) => {
      if (item.id !== itemId) return item;
      found = true;
      const completedAt =
        status === "completed" || status === "assumed_complete" ? now : null;
      return {
        ...item,
        status,
        completedAt,
        updatedAt: now,
        ...(notes !== undefined ? { notes } : {}),
      };
    });
    if (!found) throw new ChecklistItemNotFoundError(itemId);

    tx.set(ref, {
      ...data,
      checklist,
      progressPercentage: calculateProgress(checklist, data.currentStage),
      updatedAt: serverTimestamp(),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Stage change — preserves checklist
//
// "Users should be able to update where they are in the process without
// deleting previous progress." Stage pointer + recommended-tool update.
// Backward stage changes are allowed — the user knows where they are
// better than we do.
// ─────────────────────────────────────────────────────────────────────
export async function updateRoadmapStage(args: {
  uid: string;
  newStage: RoadmapStageId;
  newProcessStatus?: StudyRoadmap["currentProcessStatus"];
}): Promise<void> {
  const { uid, newStage, newProcessStatus } = args;
  if (!ROADMAP_STAGE_ORDER.includes(newStage)) {
    throw new Error(`Invalid stage: ${newStage}`);
  }
  await runTransaction(db, async (tx) => {
    const ref = roadmapRef(uid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new RoadmapMissingError(uid);
    const data = snap.data() as StudyRoadmap;
    const recommendedTool = getRecommendedToolForStage(newStage);
    tx.set(ref, {
      ...data,
      currentStage:        newStage,
      progressPercentage:  calculateProgress(data.checklist, newStage),
      recommendedTool,
      ...(newProcessStatus ? { currentProcessStatus: newProcessStatus } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Template merge — used by the migration script + lazy version bumps
//
// Picks up template additions without disturbing existing progress.
// Run inside a transaction so an in-flight checklist update can't
// race the merge.
// ─────────────────────────────────────────────────────────────────────
export async function mergeRoadmapWithCurrentTemplate(uid: string): Promise<{
  addedIds: string[];
  orphanedIds: string[];
}> {
  return await runTransaction(db, async (tx) => {
    const ref = roadmapRef(uid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new RoadmapMissingError(uid);
    const data = snap.data() as StudyRoadmap;
    const { merged, addedIds, orphanedIds } = mergeChecklistWithTemplate({
      existing: data.checklist,
      currentStage: data.currentStage,
    });
    tx.set(ref, {
      ...data,
      checklist: merged,
      progressPercentage: calculateProgress(merged, data.currentStage),
      updatedAt: serverTimestamp(),
    });
    return { addedIds, orphanedIds };
  });
}

// ─────────────────────────────────────────────────────────────────────
// External activity reconcile
//
// Marks items completed when the user has done the equivalent action
// elsewhere in the app. Privacy + integrity rules:
//   - Only flips items currently "not_started".
//   - NEVER overwrites manual state (in_progress, completed, blocked,
//     needs_review, assumed_complete).
//   - Runs inside a transaction so a concurrent checklist edit isn't
//     clobbered.
//   - Logs reconcile source on each flipped item for auditability.
//
// P0 fix (2026-06-09): d_first_match now triggers on the free-tier
// intake signal (a studentProfiles/{uid} doc with a non-empty `field`
// field — the wizard's required input). Previously it was wired to
// the paid matchReports collection, the same signal as sm_unlock,
// which meant the free-match task could never complete unless the
// user also paid for a full unlock.
// ─────────────────────────────────────────────────────────────────────
interface ReconcileResult {
  updatedItemIds: string[];
}

export async function reconcileFromExternalActivity(uid: string): Promise<ReconcileResult> {
  // Probe queries OUTSIDE the transaction — they're not part of the
  // critical-section state. Inside the txn we use the results to
  // decide which items to flip; the actual flip happens against the
  // freshest checklist state.
  const [hasFreeMatch, hasPaidReport, hasVisaReport] = await Promise.all([
    hasFreeIntakeProfile(uid),
    hasAtLeastOne("matchReports", uid),
    hasAtLeastOne("visaInterviewReports", uid),
  ]);

  // Map of itemId → eligibility predicate. New mappings go here only.
  const eligibility: Record<string, boolean> = {
    d_first_match: hasFreeMatch,   // free intake submitted
    sm_unlock:     hasPaidReport,  // paid match report unlocked
    v_practice:    hasVisaReport,  // visa interview practice completed
  };
  if (!Object.values(eligibility).some(Boolean)) {
    return { updatedItemIds: [] };
  }

  try {
    return await runTransaction(db, async (tx) => {
      const ref = roadmapRef(uid);
      const snap = await tx.get(ref);
      if (!snap.exists()) return { updatedItemIds: [] };
      const data = snap.data() as StudyRoadmap;

      const now = Date.now();
      let dirty = false;
      const updatedItemIds: string[] = [];
      const nextChecklist = data.checklist.map((item) => {
        if (item.status !== "not_started") return item;        // honour manual state
        if (!eligibility[item.id])           return item;        // not eligible
        dirty = true;
        updatedItemIds.push(item.id);
        return {
          ...item,
          status:      "completed" as const,
          completedAt: now,
          updatedAt:   now,
        };
      });
      if (!dirty) return { updatedItemIds: [] };

      tx.set(ref, {
        ...data,
        checklist:           nextChecklist,
        progressPercentage:  calculateProgress(nextChecklist, data.currentStage),
        updatedAt:           serverTimestamp(),
      });
      return { updatedItemIds };
    });
  } catch (err) {
    // Reconcile is best-effort. Don't crash the page if it fails.
    console.warn("[roadmap] reconcile transaction failed:", err);
    return { updatedItemIds: [] };
  }
}

/**
 * Free-tier intake signal — does the user have a studentProfiles
 * document with a non-empty field of study?
 *
 * The intake wizard writes studentProfiles/{uid} on submission via
 * setDoc(...{ merge: true }). The presence of a profile with a `field`
 * value is the durable record of "the user has run the matching
 * engine at least once" — no extra collection needed.
 */
async function hasFreeIntakeProfile(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, "studentProfiles", uid));
    if (!snap.exists()) return false;
    const data = snap.data();
    return typeof data?.field === "string" && data.field.trim().length > 0;
  } catch (err) {
    console.warn("[roadmap] studentProfiles probe failed:", err);
    return false;
  }
}

async function hasAtLeastOne(collectionName: string, uid: string): Promise<boolean> {
  try {
    const q = query(collection(db, collectionName), where("userId", "==", uid), limit(1));
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (err) {
    console.warn(`[roadmap] reconcile probe failed for ${collectionName}:`, err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Legacy bridge — kept for any caller that still references the old name.
// Wraps the safe split. Logs a deprecation warning in dev.
// ─────────────────────────────────────────────────────────────────────
export async function createRoadmapFromOnboarding(args: {
  uid: string;
  answers: OnboardingAnswers;
}): Promise<StudyRoadmap> {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    console.warn("[roadmap] createRoadmapFromOnboarding is deprecated. Use upsertRoadmapFromOnboarding for the create-or-update flow, or createRoadmap / updateRoadmapDiagnostic explicitly.");
  }
  const { roadmap } = await upsertRoadmapFromOnboarding(args);
  return roadmap;
}

// Suppress unused — kept exported for tests + future ops surfaces
void setDoc;

export { STUDY_ROADMAP_VERSION };
