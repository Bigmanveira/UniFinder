// ─────────────────────────────────────────────────────────────────────────────
// studyAbroad.test.ts — unit tests for the pure domain logic.
//
// Covers the CIO's required acceptance journeys:
//   - getStageFromOnboarding deterministic stage assignment + visa override
//   - calculateProgress correct weighting incl. assumed_complete
//   - getNextStage boundary behaviour
//   - isStageRequiredComplete (drives the "Continue" CTA)
//   - generateRoadmapForUser advanced-stage seeding
//   - mergeChecklistWithTemplate preserves status, notes, timestamps;
//     appends new items; preserves orphans
//   - applyDiagnosticUpdate keeps checklist + createdAt + completion ts
//
// Run with: npx vitest run src/lib/roadmap/studyAbroad.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  applyDiagnosticUpdate,
  calculateProgress,
  CHECKLIST_TEMPLATES,
  coercePrimaryNeeds,
  coerceProcessStatuses,
  generateRoadmapForUser,
  getNextStage,
  getStageFromOnboarding,
  isStageRequiredComplete,
  mergeChecklistWithTemplate,
  promoteEarlierStageRequiredItems,
  ROADMAP_STAGE_ORDER,
  STATUS_PROGRESS_WEIGHT,
  STUDY_ROADMAP_VERSION,
  type ChecklistItem,
  type OnboardingAnswers,
  type StudyRoadmap,
} from "./studyAbroad";

const baseAnswers: OnboardingAnswers = {
  completedAcademicLevel: "bachelors",
  targetAcademicLevel:    "masters",
  currentProcessStatus:   ["just_starting"],
  primaryNeed:            ["finding_schools"],
  originCountry:          "ghana",
  preferredStartTerm:     "fall_2026",
};

const FIXED_NOW = 1_700_000_000_000;

// ── getStageFromOnboarding ─────────────────────────────────────────────
describe("getStageFromOnboarding", () => {
  it("assigns discovery for just_starting", () => {
    expect(getStageFromOnboarding(baseAnswers)).toBe("discovery");
  });

  it("assigns visa_preparation for paid_sevis", () => {
    expect(getStageFromOnboarding({
      ...baseAnswers,
      currentProcessStatus: ["paid_sevis"],
    })).toBe("visa_preparation");
  });

  it("picks the FURTHEST ALONG when multi-select", () => {
    expect(getStageFromOnboarding({
      ...baseAnswers,
      currentProcessStatus: ["have_admission", "paid_sevis", "completed_ds160"],
    })).toBe("visa_preparation");
  });

  it("applies the visa-prep override when user has I-20 + visa-need", () => {
    expect(getStageFromOnboarding({
      ...baseAnswers,
      currentProcessStatus: ["received_i20"],
      primaryNeed: ["understanding_costs", "visa_interview_preparation"],
    })).toBe("visa_preparation");
  });

  it("applies the override when user has admission + visa-need", () => {
    expect(getStageFromOnboarding({
      ...baseAnswers,
      currentProcessStatus: ["have_admission"],
      primaryNeed: ["visa_interview_preparation"],
    })).toBe("visa_preparation");
  });

  it("defaults to discovery on empty array (defensive)", () => {
    expect(getStageFromOnboarding({
      ...baseAnswers,
      currentProcessStatus: [],
    })).toBe("discovery");
  });

  it("handles legacy single-string format via coerceProcessStatuses", () => {
    // Legacy docs (created before multi-select shipped) have a single
    // string instead of an array. Cast through `unknown` because the
    // current type forbids strings — coerceProcessStatuses is the
    // documented boundary that accepts both.
    const legacy: OnboardingAnswers = {
      ...baseAnswers,
      currentProcessStatus: ("paid_sevis" as unknown) as OnboardingAnswers["currentProcessStatus"],
    };
    expect(getStageFromOnboarding(legacy)).toBe("visa_preparation");
  });
});

// ── coerceProcessStatuses ──────────────────────────────────────────────
describe("coerceProcessStatuses", () => {
  it("returns [] for null/undefined", () => {
    expect(coerceProcessStatuses(undefined)).toEqual([]);
    expect(coerceProcessStatuses(null)).toEqual([]);
  });
  it("wraps a single string into an array", () => {
    expect(coerceProcessStatuses("paid_sevis")).toEqual(["paid_sevis"]);
  });
  it("returns the array as-is when already array", () => {
    expect(coerceProcessStatuses(["paid_sevis", "completed_ds160"])).toEqual(["paid_sevis", "completed_ds160"]);
  });
});

describe("coercePrimaryNeeds", () => {
  it("returns [] for null/undefined", () => {
    expect(coercePrimaryNeeds(undefined)).toEqual([]);
    expect(coercePrimaryNeeds(null)).toEqual([]);
  });
  it("wraps a legacy single value into an array", () => {
    expect(coercePrimaryNeeds("finding_schools")).toEqual(["finding_schools"]);
  });
  it("preserves an existing array", () => {
    expect(coercePrimaryNeeds(["finding_schools", "understanding_costs"]))
      .toEqual(["finding_schools", "understanding_costs"]);
  });
});

// ── getNextStage ───────────────────────────────────────────────────────
describe("getNextStage", () => {
  it("returns the next in canonical order", () => {
    expect(getNextStage("discovery")).toBe("school_matching");
    expect(getNextStage("school_matching")).toBe("application");
  });
  it("returns null on the last stage", () => {
    expect(getNextStage("pre_departure")).toBeNull();
  });
});

// ── STATUS_PROGRESS_WEIGHT ─────────────────────────────────────────────
describe("STATUS_PROGRESS_WEIGHT", () => {
  it("matches the spec values agreed in P0", () => {
    expect(STATUS_PROGRESS_WEIGHT.completed).toBe(1.0);
    expect(STATUS_PROGRESS_WEIGHT.assumed_complete).toBe(0.85);
    expect(STATUS_PROGRESS_WEIGHT.in_progress).toBe(0.5);
    expect(STATUS_PROGRESS_WEIGHT.not_started).toBe(0);
    expect(STATUS_PROGRESS_WEIGHT.blocked).toBe(0);
    expect(STATUS_PROGRESS_WEIGHT.needs_review).toBe(0);
  });
});

// ── calculateProgress ──────────────────────────────────────────────────
describe("calculateProgress", () => {
  const itemAt = (stage: ChecklistItem["stage"], status: ChecklistItem["status"], required = true): ChecklistItem => ({
    id: `${stage}-${status}-${Math.random()}`,
    stage, status, required,
    title: "x", description: "x",
    toolRoute: null, completedAt: null, createdAt: 0, updatedAt: 0,
  });

  it("is 0 for an empty checklist", () => {
    expect(calculateProgress([], "discovery")).toBe(0);
  });

  it("is 0 when nothing is completed", () => {
    const checklist = [itemAt("discovery", "not_started")];
    expect(calculateProgress(checklist, "discovery")).toBe(0);
  });

  it("is 100 when every required item in current/earlier stages is completed", () => {
    const checklist = [
      itemAt("discovery", "completed"),
      itemAt("discovery", "completed"),
    ];
    expect(calculateProgress(checklist, "discovery")).toBe(100);
  });

  it("scores assumed_complete at 0.85 of weight", () => {
    const checklist = [itemAt("discovery", "assumed_complete")];
    expect(calculateProgress(checklist, "discovery")).toBe(85);
  });

  it("ignores future-stage items (they shouldn't pull the bar down)", () => {
    const checklist = [
      itemAt("discovery", "completed"),
      itemAt("visa_preparation", "not_started"),
    ];
    expect(calculateProgress(checklist, "discovery")).toBe(100);
  });

  it("weights optional items at half", () => {
    const required  = itemAt("discovery", "completed", true);   // weight 1.0 × 1.0 = 1.0
    const optional  = itemAt("discovery", "completed", false);  // weight 0.5 × 1.0 = 0.5
    // earned = 1.5; total = 1.5 → 100%
    expect(calculateProgress([required, optional], "discovery")).toBe(100);
  });

  it("returns non-zero progress for advanced-stage users with assumed earlier items", () => {
    // This is the P0 fix: a visa-prep user with their earlier required
    // items seeded as assumed_complete should NOT see 0%.
    const checklist: ChecklistItem[] = [
      itemAt("discovery", "assumed_complete"),
      itemAt("school_matching", "assumed_complete"),
      itemAt("application", "assumed_complete"),
      itemAt("admission_i20", "assumed_complete"),
      itemAt("visa_preparation", "not_started"),
    ];
    const result = calculateProgress(checklist, "visa_preparation");
    // 4 items at 0.85, 1 item at 0 → 3.4 / 5 = 68
    expect(result).toBe(68);
  });
});

// ── isStageRequiredComplete ────────────────────────────────────────────
describe("isStageRequiredComplete", () => {
  it("returns false when there are no required items (defensive)", () => {
    expect(isStageRequiredComplete([], "discovery")).toBe(false);
  });

  it("returns true only when every required item is completed", () => {
    const checklist: ChecklistItem[] = [
      { id: "a", stage: "discovery", required: true, status: "completed", title: "", description: "", toolRoute: null, completedAt: 0, createdAt: 0, updatedAt: 0 },
      { id: "b", stage: "discovery", required: false, status: "not_started", title: "", description: "", toolRoute: null, completedAt: null, createdAt: 0, updatedAt: 0 },
    ];
    expect(isStageRequiredComplete(checklist, "discovery")).toBe(true);
  });

  it("returns false when assumed_complete (only `completed` qualifies)", () => {
    const checklist: ChecklistItem[] = [
      { id: "a", stage: "discovery", required: true, status: "assumed_complete", title: "", description: "", toolRoute: null, completedAt: 0, createdAt: 0, updatedAt: 0 },
    ];
    // Assumed-complete is NOT verified, so the next-stage CTA should
    // not fire on assumed alone. The user must explicitly confirm.
    expect(isStageRequiredComplete(checklist, "discovery")).toBe(false);
  });
});

// ── generateRoadmapForUser ────────────────────────────────────────────
describe("generateRoadmapForUser", () => {
  it("creates a roadmap at discovery for just-starting users with all items not_started", () => {
    const rm = generateRoadmapForUser({
      userId: "u1",
      answers: baseAnswers,
      now: FIXED_NOW,
    });
    expect(rm.currentStage).toBe("discovery");
    expect(rm.version).toBe(STUDY_ROADMAP_VERSION);
    expect(rm.completedOnboarding).toBe(true);
    expect(rm.userId).toBe("u1");
    expect(rm.checklist.every((it) => it.status === "not_started")).toBe(true);
  });

  it("seeds earlier-stage required items as assumed_complete for advanced-stage users", () => {
    const rm = generateRoadmapForUser({
      userId: "u2",
      answers: {
        ...baseAnswers,
        currentProcessStatus: ["paid_sevis"],
      },
      now: FIXED_NOW,
    });
    expect(rm.currentStage).toBe("visa_preparation");
    // Discovery required items should be assumed_complete
    const dRequired = rm.checklist.filter((it) => it.stage === "discovery" && it.required);
    expect(dRequired.length).toBeGreaterThan(0);
    expect(dRequired.every((it) => it.status === "assumed_complete")).toBe(true);
    // Discovery OPTIONAL items stay not_started
    const dOptional = rm.checklist.filter((it) => it.stage === "discovery" && !it.required);
    expect(dOptional.every((it) => it.status === "not_started")).toBe(true);
    // Current stage items are not_started
    const vItems = rm.checklist.filter((it) => it.stage === "visa_preparation");
    expect(vItems.every((it) => it.status === "not_started")).toBe(true);
  });

  it("produces non-zero progress for advanced-stage users", () => {
    const rm = generateRoadmapForUser({
      userId: "u3",
      answers: {
        ...baseAnswers,
        currentProcessStatus: ["paid_sevis"],
      },
      now: FIXED_NOW,
    });
    expect(rm.progressPercentage).toBeGreaterThan(0);
  });

  it("uses recommended-tool route from ROADMAP_STAGES", () => {
    const rm = generateRoadmapForUser({
      userId: "u4",
      answers: baseAnswers,
      now: FIXED_NOW,
    });
    expect(rm.recommendedTool.route).toBe("/intake");
  });
});

// ── mergeChecklistWithTemplate ────────────────────────────────────────
describe("mergeChecklistWithTemplate", () => {
  it("preserves user status + completion timestamp on items present in both", () => {
    const existing: ChecklistItem[] = [
      { id: "d_profile", stage: "discovery", required: true, status: "completed",
        title: "old title", description: "old desc",
        toolRoute: "/intake", completedAt: 12345, createdAt: 1000, updatedAt: 5000 },
    ];
    const { merged } = mergeChecklistWithTemplate({
      existing,
      currentStage: "discovery",
      now: FIXED_NOW,
    });
    const found = merged.find((it) => it.id === "d_profile");
    expect(found).toBeDefined();
    expect(found!.status).toBe("completed");
    expect(found!.completedAt).toBe(12345);
    expect(found!.createdAt).toBe(1000);
    // Title is refreshed from template:
    expect(found!.title).not.toBe("old title");
  });

  it("preserves user notes", () => {
    const existing: ChecklistItem[] = [
      { id: "d_profile", stage: "discovery", required: true, status: "in_progress",
        title: "", description: "", toolRoute: "/intake",
        completedAt: null, createdAt: 0, updatedAt: 0,
        notes: "Pending transcripts from UCC" },
    ];
    const { merged } = mergeChecklistWithTemplate({
      existing,
      currentStage: "discovery",
      now: FIXED_NOW,
    });
    const found = merged.find((it) => it.id === "d_profile");
    expect(found!.notes).toBe("Pending transcripts from UCC");
  });

  it("appends new template items not in existing", () => {
    const existing: ChecklistItem[] = []; // empty existing
    const { merged, addedIds } = mergeChecklistWithTemplate({
      existing,
      currentStage: "discovery",
      now: FIXED_NOW,
    });
    // Should add all template items
    const templateSize = ROADMAP_STAGE_ORDER.reduce(
      (n, s) => n + CHECKLIST_TEMPLATES[s].length, 0,
    );
    expect(merged.length).toBe(templateSize);
    expect(addedIds.length).toBe(templateSize);
  });

  it("preserves orphan items not in current template (no silent data loss)", () => {
    const existing: ChecklistItem[] = [
      { id: "ancient_item_v0", stage: "discovery", required: true, status: "completed",
        title: "Old", description: "Old desc",
        toolRoute: null, completedAt: 1000, createdAt: 1000, updatedAt: 1000 },
    ];
    const { merged, orphanedIds } = mergeChecklistWithTemplate({
      existing,
      currentStage: "discovery",
      now: FIXED_NOW,
    });
    const orphan = merged.find((it) => it.id === "ancient_item_v0");
    expect(orphan).toBeDefined();
    expect(orphan!.status).toBe("completed");
    expect(orphanedIds).toContain("ancient_item_v0");
  });

  it("is idempotent — running twice yields the same result", () => {
    const existing: ChecklistItem[] = [
      { id: "d_profile", stage: "discovery", required: true, status: "completed",
        title: "", description: "", toolRoute: "/intake",
        completedAt: 999, createdAt: 1000, updatedAt: 5000 },
    ];
    const once = mergeChecklistWithTemplate({ existing, currentStage: "discovery", now: FIXED_NOW });
    const twice = mergeChecklistWithTemplate({ existing: once.merged, currentStage: "discovery", now: FIXED_NOW });
    // The second run should not add anything new.
    expect(twice.addedIds).toEqual([]);
    expect(twice.merged.length).toBe(once.merged.length);
  });
});

// ── applyDiagnosticUpdate ─────────────────────────────────────────────
describe("applyDiagnosticUpdate", () => {
  const existing: StudyRoadmap = {
    userId: "u1",
    originCountry: "ghana",
    completedAcademicLevel: "bachelors",
    targetAcademicLevel: "masters",
    currentProcessStatus: ["just_starting"],
    primaryNeed: ["finding_schools"],
    preferredStartTerm: "fall_2026",
    currentStage: "discovery",
    progressPercentage: 50,
    recommendedTool: { label: "x", route: "/intake", description: "x" },
    checklist: [
      { id: "d_profile", stage: "discovery", required: true, status: "completed",
        title: "", description: "", toolRoute: "/intake",
        completedAt: 12345, createdAt: 1000, updatedAt: 5000 },
    ],
    createdAt: 100,
    updatedAt: 200,
    completedOnboarding: true,
    version: 1,
  };

  it("changes diagnostic answers + stage", () => {
    const next = applyDiagnosticUpdate({
      existing,
      answers: {
        ...baseAnswers,
        currentProcessStatus: ["paid_sevis"],
      },
      now: FIXED_NOW,
    });
    expect(next.currentStage).toBe("visa_preparation");
    expect(next.currentProcessStatus).toEqual(["paid_sevis"]);
  });

  it("preserves createdAt", () => {
    const next = applyDiagnosticUpdate({
      existing,
      answers: { ...baseAnswers, currentProcessStatus: ["paid_sevis"] },
      now: FIXED_NOW,
    });
    expect(next.createdAt).toBe(100);
  });

  it("preserves completed item's status + completedAt", () => {
    const next = applyDiagnosticUpdate({
      existing,
      answers: { ...baseAnswers, currentProcessStatus: ["paid_sevis"] },
      now: FIXED_NOW,
    });
    const found = next.checklist.find((it) => it.id === "d_profile");
    expect(found!.status).toBe("completed");
    expect(found!.completedAt).toBe(12345);
  });

  // ─── CIO blocking finding: P1 #5 ─────────────────────────────────
  // Existing advanced-stage users used to remain at 0% because their
  // `not_started` items in earlier stages weren't promoted. These two
  // tests prove the fix.
  it("promotes existing not_started earlier-stage required items when stage advances", () => {
    // An existing user with everything not_started, currentStage discovery.
    const fullChecklist: ChecklistItem[] = ROADMAP_STAGE_ORDER.flatMap((stage) =>
      CHECKLIST_TEMPLATES[stage].map((t) => ({
        id: t.id, stage: t.stage, title: t.title, description: t.description,
        status: "not_started" as const, required: t.required, toolRoute: t.toolRoute,
        completedAt: null, createdAt: 100, updatedAt: 100,
      })),
    );
    const oldUser: StudyRoadmap = {
      ...existing,
      checklist: fullChecklist,
      progressPercentage: 0,
    };

    const next = applyDiagnosticUpdate({
      existing: oldUser,
      answers: { ...baseAnswers, currentProcessStatus: ["paid_sevis"] },
      now: FIXED_NOW,
    });

    expect(next.currentStage).toBe("visa_preparation");
    // Discovery REQUIRED items must now be assumed_complete
    const dRequired = next.checklist.filter((it) => it.stage === "discovery" && it.required);
    expect(dRequired.every((it) => it.status === "assumed_complete")).toBe(true);
    // Discovery OPTIONAL items must remain not_started
    const dOptional = next.checklist.filter((it) => it.stage === "discovery" && !it.required);
    expect(dOptional.every((it) => it.status === "not_started")).toBe(true);
    // Current-stage items must stay not_started
    const vItems = next.checklist.filter((it) => it.stage === "visa_preparation");
    expect(vItems.every((it) => it.status === "not_started")).toBe(true);
    // Progress now greater than 0
    expect(next.progressPercentage).toBeGreaterThan(0);
  });

  // ─── CIO P1 finding (2026-06-09): same-stage updates must not
  // re-promote items the user has manually demoted. ───────────────────
  it("does NOT re-promote a manually-demoted item when the stage is unchanged", () => {
    // User is at visa_preparation. They DEMOTED an assumed earlier-stage
    // item back to not_started (e.g. realised they hadn't actually run
    // their first match). Then they change an unrelated answer like
    // their country. The same-stage update must leave d_first_match
    // alone.
    const checklist: ChecklistItem[] = [
      { id: "d_first_match", stage: "discovery", required: true, status: "not_started",
        title: "x", description: "x", toolRoute: "/intake",
        completedAt: null, createdAt: 100, updatedAt: 500 },
      { id: "v_practice", stage: "visa_preparation", required: true, status: "completed",
        title: "x", description: "x", toolRoute: "/app/visa-interview",
        completedAt: 600, createdAt: 100, updatedAt: 600 },
    ];
    const visaUser: StudyRoadmap = {
      ...existing,
      currentStage: "visa_preparation",
      checklist,
      currentProcessStatus: ["paid_sevis"],
    };
    // Unrelated answer change — country flipped from ghana → nigeria.
    // currentProcessStatus stays the same so newStage = visa_preparation.
    const next = applyDiagnosticUpdate({
      existing: visaUser,
      answers: {
        ...baseAnswers,
        currentProcessStatus: ["paid_sevis"],
        originCountry: "nigeria",
      },
      now: FIXED_NOW,
    });
    expect(next.currentStage).toBe("visa_preparation");
    expect(next.originCountry).toBe("nigeria");
    // The demoted item must STAY not_started.
    const demoted = next.checklist.find((it) => it.id === "d_first_match");
    expect(demoted!.status).toBe("not_started");
    // The completed item must stay completed.
    const completed = next.checklist.find((it) => it.id === "v_practice");
    expect(completed!.status).toBe("completed");
  });

  it("does NOT downgrade existing completed items when moving backward to an earlier stage", () => {
    // Visa-prep user with the v_practice item completed.
    const checklist: ChecklistItem[] = [
      { id: "d_profile", stage: "discovery", required: true, status: "assumed_complete",
        title: "x", description: "x", toolRoute: "/intake",
        completedAt: 200, createdAt: 100, updatedAt: 200 },
      { id: "v_practice", stage: "visa_preparation", required: true, status: "completed",
        title: "x", description: "x", toolRoute: "/app/visa-interview",
        completedAt: 500, createdAt: 100, updatedAt: 500 },
    ];
    const visaUser: StudyRoadmap = {
      ...existing,
      currentStage: "visa_preparation",
      checklist,
      currentProcessStatus: ["paid_sevis"],
    };
    // User changes their mind and says they're actually still at school_matching.
    const next = applyDiagnosticUpdate({
      existing: visaUser,
      answers: { ...baseAnswers, currentProcessStatus: ["looking_for_schools"] },
      now: FIXED_NOW,
    });
    expect(next.currentStage).toBe("school_matching");
    // The v_practice completed status must NOT be reset.
    const vp = next.checklist.find((it) => it.id === "v_practice");
    expect(vp!.status).toBe("completed");
    expect(vp!.completedAt).toBe(500);
  });
});

// ── promoteEarlierStageRequiredItems ──────────────────────────────────
describe("promoteEarlierStageRequiredItems", () => {
  const mk = (
    stage: ChecklistItem["stage"],
    status: ChecklistItem["status"],
    required: boolean,
    id = `${stage}-${status}-${required}`,
  ): ChecklistItem => ({
    id, stage, status, required,
    title: "x", description: "x", toolRoute: null,
    completedAt: null, createdAt: 0, updatedAt: 0,
  });

  it("only promotes not_started + required + earlier-stage items", () => {
    const checklist = [
      mk("discovery", "not_started", true),               // promote
      mk("discovery", "not_started", false),              // optional → no
      mk("discovery", "in_progress", true),               // manual state → no
      mk("discovery", "completed", true),                 // already done → no
      mk("school_matching", "not_started", true),         // earlier than visa_prep → promote
      mk("visa_preparation", "not_started", true),        // current stage → no
      mk("pre_departure", "not_started", true),           // future stage → no
    ];
    const { checklist: next, promotedItemIds } = promoteEarlierStageRequiredItems({
      checklist,
      newStage: "visa_preparation",
      now: FIXED_NOW,
    });
    expect(promotedItemIds.length).toBe(2);
    expect(next.find((it) => it.id === checklist[0].id)!.status).toBe("assumed_complete");
    expect(next.find((it) => it.id === checklist[1].id)!.status).toBe("not_started"); // optional
    expect(next.find((it) => it.id === checklist[2].id)!.status).toBe("in_progress"); // manual
    expect(next.find((it) => it.id === checklist[3].id)!.status).toBe("completed");   // already done
    expect(next.find((it) => it.id === checklist[5].id)!.status).toBe("not_started"); // current stage
    expect(next.find((it) => it.id === checklist[6].id)!.status).toBe("not_started"); // future
  });

  it("is a no-op when the new stage is discovery (nothing earlier)", () => {
    const checklist = [mk("discovery", "not_started", true)];
    const { promotedItemIds } = promoteEarlierStageRequiredItems({
      checklist, newStage: "discovery", now: FIXED_NOW,
    });
    expect(promotedItemIds).toEqual([]);
  });
});
