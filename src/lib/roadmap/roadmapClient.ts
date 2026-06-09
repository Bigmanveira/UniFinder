// ─────────────────────────────────────────────────────────────────────────────
// roadmapClient — thin client-side Firestore wrapper for the new
// studyRoadmaps/{uid} collection.
//
// Why client-side + rules rather than callables:
//   - The data is owner-scoped; no cross-user access patterns.
//   - No credit deductions, no AI calls, no payments — nothing that
//     requires server-side gating beyond the rules layer.
//   - Faster UX: writes apply immediately + show optimistically.
//
// The Firestore Rules deny everything except (1) the owner reading +
// writing their own doc, and (2) admins reading any roadmap. The
// security gate is on the rules; this module is just typed sugar.
// ─────────────────────────────────────────────────────────────────────────────

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  STUDY_ROADMAP_VERSION,
  calculateProgress,
  generateRoadmapForUser,
  getRecommendedToolForStage,
  ROADMAP_STAGE_ORDER,
  type ChecklistItemStatus,
  type OnboardingAnswers,
  type RoadmapStageId,
  type StudyRoadmap,
} from "./studyAbroad";

const COLLECTION = "studyRoadmaps";

const roadmapRef = (uid: string) => doc(db, COLLECTION, uid);

// ─────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────

/**
 * One-shot read. Returns null when the user has never completed
 * onboarding (the doc simply doesn't exist).
 */
export async function getStudyRoadmap(uid: string): Promise<StudyRoadmap | null> {
  const snap = await getDoc(roadmapRef(uid));
  if (!snap.exists()) return null;
  return snap.data() as StudyRoadmap;
}

/**
 * Live subscription. Used by the dashboard so checklist toggles + stage
 * updates render instantly across tabs / devices.
 *
 * Caller is responsible for invoking the returned Unsubscribe in
 * useEffect cleanup.
 */
export function subscribeStudyRoadmap(
  uid: string,
  onUpdate: (roadmap: StudyRoadmap | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    roadmapRef(uid),
    (snap) => {
      if (!snap.exists()) onUpdate(null);
      else onUpdate(snap.data() as StudyRoadmap);
    },
    (err) => {
      console.error("[roadmap] subscribe error:", err);
      onError?.(err as Error);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────

/**
 * First-time create from onboarding. The doc is built deterministically
 * from the answers, then written with merge:false so partial pre-existing
 * docs (e.g. from a half-completed prior attempt) get cleanly replaced.
 *
 * This is the ONLY function in this file that creates the doc. Every
 * other write assumes the doc exists.
 */
export async function createRoadmapFromOnboarding(args: {
  uid: string;
  answers: OnboardingAnswers;
}): Promise<StudyRoadmap> {
  const roadmap = generateRoadmapForUser({ userId: args.uid, answers: args.answers });
  // Use Firestore server timestamps for createdAt / updatedAt — clients
  // can have skewed clocks, and ops queries (sort by recent users) need
  // server-truth. We keep the number-based fields on per-item entries
  // for portability.
  await setDoc(roadmapRef(args.uid), {
    ...roadmap,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return roadmap;
}

/**
 * Update a single checklist item's status (and optional notes). Pulls
 * the doc once, mutates the item in-place, recomputes the progress
 * percentage, and writes the whole array back.
 *
 * We pull-then-write rather than using arrayUnion/arrayRemove because
 * (a) we need to recompute progress, and (b) we need stable item order.
 * One round-trip cost is fine — checklist updates are infrequent
 * per-user actions.
 */
export async function updateChecklistItemStatus(args: {
  uid: string;
  itemId: string;
  status: ChecklistItemStatus;
  notes?: string;
}): Promise<void> {
  const { uid, itemId, status, notes } = args;
  const snap = await getDoc(roadmapRef(uid));
  if (!snap.exists()) {
    throw new Error("No roadmap to update. Complete onboarding first.");
  }
  const data = snap.data() as StudyRoadmap;
  const now = Date.now();
  const checklist = data.checklist.map((item) => {
    if (item.id !== itemId) return item;
    const completedAt = status === "completed" ? now : null;
    return {
      ...item,
      status,
      completedAt,
      updatedAt: now,
      ...(notes !== undefined ? { notes } : {}),
    };
  });
  const progressPercentage = calculateProgress(checklist, data.currentStage);
  await updateDoc(roadmapRef(uid), {
    checklist,
    progressPercentage,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Advance / change the user's stage without nuking their roadmap.
 *
 * The spec is firm: "Users should be able to update where they are in
 * the process without deleting previous progress." So we preserve every
 * checklist item — including completion state — and only update the
 * stage pointer + recommended-tool pointer + progress percentage.
 */
export async function updateRoadmapStage(args: {
  uid: string;
  newStage: RoadmapStageId;
  /** Optional: also persist the new currentProcessStatus that drove
   *  the change, for the dashboard "your status" line. */
  newProcessStatus?: StudyRoadmap["currentProcessStatus"];
}): Promise<void> {
  const { uid, newStage, newProcessStatus } = args;
  const snap = await getDoc(roadmapRef(uid));
  if (!snap.exists()) {
    throw new Error("No roadmap to update. Complete onboarding first.");
  }
  const data = snap.data() as StudyRoadmap;
  if (!ROADMAP_STAGE_ORDER.includes(newStage)) {
    throw new Error(`Invalid stage: ${newStage}`);
  }
  const progressPercentage = calculateProgress(data.checklist, newStage);
  const recommendedTool = getRecommendedToolForStage(newStage);
  await updateDoc(roadmapRef(uid), {
    currentStage:        newStage,
    progressPercentage,
    recommendedTool,
    ...(newProcessStatus ? { currentProcessStatus: newProcessStatus } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Idempotent helper: ensure a roadmap exists for the user. Used by the
 * dashboard banner that nudges existing users into onboarding — the
 * banner calls this with `redirectIfMissing` so we don't double-write
 * when the doc is already present.
 *
 * Returns `null` if the user has never onboarded.
 */
export async function getOrNullRoadmap(uid: string): Promise<StudyRoadmap | null> {
  return getStudyRoadmap(uid);
}

// Re-export the version constant so callers (e.g. the dashboard) can
// surface a "your roadmap is from an older template" notice later.
export { STUDY_ROADMAP_VERSION };
