// ─────────────────────────────────────────────────────────────────────────────
// roadmapValidator.test.ts — unit tests for the shared pure validator.
//
// Imports the CJS module via Node's ESM interop. Covers every preflight
// requirement from the v3 brief:
//   - exact allowed top-level fields
//   - every required top-level field
//   - all field types + lengths + enums
//   - currentProcessStatus: string-to-array repair, array bounds, enum,
//     duplicate detection
//   - recommendedTool shape
//   - checklist item: required + allowed keys, ID, stage, status,
//     required-flag, toolRoute, timestamps, notes
//   - checklist size
//   - duplicate IDs
//   - unknown fields
// Plus a parity check: every canonical template item passes validation.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename_ = fileURLToPath(import.meta.url);
const __dirname_  = dirname(__filename_);
const require_    = createRequire(import.meta.url);

const validator = require_("./roadmapValidator.cjs") as {
  classifyDoc: (doc: unknown, opts?: { templateHash?: string; uid?: string }) => {
    status: "READY" | "REPAIRABLE" | "BLOCKED" | "SKIPPED";
    codes: string[];
    repairs?: string[];
    normalised?: Record<string, unknown>;
  };
  classifyProcessStatus: (value: unknown) => { codes: string[]; normalised?: string[]; repaired?: boolean };
  classifyPrimaryNeed: (value: unknown) => { codes: string[] };
  classifyRecommendedTool: (tool: unknown) => { codes: string[] };
  MAX_CHECKLIST_ITEMS: number;
};
const {
  classifyDoc,
  classifyProcessStatus,
  classifyPrimaryNeed,
  classifyRecommendedTool,
  MAX_CHECKLIST_ITEMS,
} = validator;

const TEMPLATES_PATH = resolve(__dirname_, "..", "..", "src", "lib", "roadmap", "checklistTemplates.json");
const templates = JSON.parse(readFileSync(TEMPLATES_PATH, "utf-8")) as Record<string, Array<Record<string, unknown>>>;

function emptyValidDoc(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    originCountry: "ghana",
    completedAcademicLevel: "bachelors",
    targetAcademicLevel: "masters",
    currentProcessStatus: ["just_starting"],
    primaryNeed: ["finding_schools"],
    preferredStartTerm: "fall_2026",
    currentStage: "discovery",
    progressPercentage: 0,
    recommendedTool: {
      label: "x", route: "/intake", description: "Define what you want to study.",
    },
    checklist: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    completedOnboarding: true,
    version: 1,
    ...overrides,
  };
}
function validItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, stage: "discovery", title: "x", description: "x",
    status: "not_started", required: true, toolRoute: null,
    completedAt: null, createdAt: 0, updatedAt: 0, ...overrides,
  };
}

describe("classifyDoc — top-level shape", () => {
  it("READY for a minimal valid roadmap", () => {
    expect(classifyDoc(emptyValidDoc()).status).toBe("READY");
  });
  it("BLOCKED for non-object", () => {
    expect(classifyDoc(null).status).toBe("BLOCKED");
    expect(classifyDoc(7).status).toBe("BLOCKED");
  });
  it("SKIPPED for wrong version", () => {
    expect(classifyDoc(emptyValidDoc({ version: 2 })).status).toBe("SKIPPED");
  });
  it("BLOCKED when required field missing", () => {
    const d = emptyValidDoc();
    delete (d as Record<string, unknown>).currentStage;
    const r = classifyDoc(d);
    expect(r.status).toBe("BLOCKED");
    expect(r.codes).toContain("MISSING_currentStage");
  });
  it("BLOCKED when unknown extra field present", () => {
    const r = classifyDoc(emptyValidDoc({ backdoor: "x" }));
    expect(r.status).toBe("BLOCKED");
    expect(r.codes).toContain("UNKNOWN_KEY_backdoor");
  });
  it("BLOCKED on invalid enums", () => {
    expect(classifyDoc(emptyValidDoc({ currentStage: "foo" })).codes).toContain("INVALID_STAGE");
    expect(classifyDoc(emptyValidDoc({ originCountry: "atlantis" })).codes).toContain("INVALID_ORIGIN_COUNTRY");
    expect(classifyDoc(emptyValidDoc({ primaryNeed: "x" })).codes).toContain("INVALID_PRIMARY_NEED");
    expect(classifyDoc(emptyValidDoc({ completedAcademicLevel: "x" })).codes).toContain("INVALID_COMPLETED_LEVEL");
    expect(classifyDoc(emptyValidDoc({ targetAcademicLevel: "x" })).codes).toContain("INVALID_TARGET_LEVEL");
    expect(classifyDoc(emptyValidDoc({ preferredStartTerm: "spring_3000" })).codes).toContain("INVALID_START_TERM");
  });
  it("accepts legacy and multi-select support needs", () => {
    expect(classifyDoc(emptyValidDoc({ primaryNeed: "finding_schools" })).status).toBe("READY");
    expect(classifyDoc(emptyValidDoc({
      primaryNeed: ["finding_schools", "scholarships_funding"],
    })).status).toBe("READY");
  });
  it("BLOCKED on progressPercentage out of range", () => {
    expect(classifyDoc(emptyValidDoc({ progressPercentage: -1 })).codes).toContain("INVALID_PROGRESS_PERCENTAGE");
    expect(classifyDoc(emptyValidDoc({ progressPercentage: 101 })).codes).toContain("INVALID_PROGRESS_PERCENTAGE");
    expect(classifyDoc(emptyValidDoc({ progressPercentage: 12.5 })).codes).toContain("INVALID_PROGRESS_PERCENTAGE");
  });
  it("BLOCKED when document userId differs from its path UID", () => {
    expect(classifyDoc(emptyValidDoc({ userId: "alice" }), { uid: "bob" }).codes)
      .toContain("USER_ID_PATH_MISMATCH");
  });
  it("BLOCKED for timestamp representations Firestore rules reject", () => {
    expect(classifyDoc(emptyValidDoc({ createdAt: "2026-06-09T00:00:00Z" })).codes)
      .toContain("INVALID_CREATED_AT");
    expect(classifyDoc(emptyValidDoc({ updatedAt: { seconds: 1, nanoseconds: 0 } })).codes)
      .toContain("INVALID_UPDATED_AT");
    expect(classifyDoc(emptyValidDoc({ createdAt: 1.5 })).codes)
      .toContain("INVALID_CREATED_AT");
  });
});

describe("classifyPrimaryNeed", () => {
  it("accepts a legacy string and a valid array", () => {
    expect(classifyPrimaryNeed("finding_schools").codes).toEqual([]);
    expect(classifyPrimaryNeed(["finding_schools", "understanding_costs"]).codes).toEqual([]);
  });
  it("rejects empty, duplicate, and invalid arrays", () => {
    expect(classifyPrimaryNeed([]).codes).toContain("PRIMARY_NEED_LENGTH_0");
    expect(classifyPrimaryNeed(["finding_schools", "finding_schools"]).codes)
      .toContain("PRIMARY_NEED_DUPLICATE_MEMBER");
    expect(classifyPrimaryNeed(["unknown"]).codes)
      .toContain("PRIMARY_NEED_INVALID_MEMBER_unknown");
  });
});

describe("classifyDoc — currentProcessStatus", () => {
  it("REPAIRABLE for legacy valid string", () => {
    const r = classifyDoc(emptyValidDoc({ currentProcessStatus: "paid_sevis" }));
    expect(r.status).toBe("REPAIRABLE");
    expect(r.repairs).toContain("LEGACY_PROCESS_STATUS_STRING_TO_ARRAY");
    expect((r.normalised as Record<string, unknown>).currentProcessStatus).toEqual(["paid_sevis"]);
  });
  it("BLOCKED for legacy INVALID string", () => {
    const r = classifyDoc(emptyValidDoc({ currentProcessStatus: "rocket_launched" }));
    expect(r.status).toBe("BLOCKED");
    expect(r.codes).toContain("PROCESS_STATUS_INVALID_STRING");
  });
  it("READY for valid array", () => {
    expect(classifyDoc(emptyValidDoc({ currentProcessStatus: ["paid_sevis", "completed_ds160"] })).status).toBe("READY");
  });
  it("BLOCKED for empty array", () => {
    expect(classifyDoc(emptyValidDoc({ currentProcessStatus: [] })).codes).toContain("PROCESS_STATUS_LENGTH_0");
  });
  it("BLOCKED for over-long array (>13)", () => {
    const r = classifyProcessStatus(Array(14).fill("just_starting"));
    expect(r.codes[0]).toMatch(/^PROCESS_STATUS_LENGTH_/);
  });
  it("BLOCKED for non-enum array member", () => {
    expect(classifyDoc(emptyValidDoc({ currentProcessStatus: ["banana"] })).codes).toContain("PROCESS_STATUS_INVALID_MEMBER_banana");
  });
  it("BLOCKED for duplicate array member", () => {
    expect(classifyDoc(emptyValidDoc({ currentProcessStatus: ["paid_sevis", "paid_sevis"] })).codes).toContain("PROCESS_STATUS_DUPLICATE_MEMBER");
  });
  it("BLOCKED for non-array non-string (e.g. number)", () => {
    expect(classifyDoc(emptyValidDoc({ currentProcessStatus: 42 })).codes).toContain("PROCESS_STATUS_NOT_ARRAY");
  });
});

describe("classifyDoc — recommendedTool", () => {
  it("BLOCKED for missing key", () => {
    const r = classifyRecommendedTool({ label: "x", route: "/x" });
    expect(r.codes).toContain("RECOMMENDED_TOOL_MISSING_description");
  });
  it("BLOCKED for unknown extra key", () => {
    expect(classifyRecommendedTool({ label: "x", route: "/x", description: "y", extra: 1 }).codes)
      .toContain("RECOMMENDED_TOOL_UNKNOWN_extra");
  });
  it("BLOCKED for non-object", () => {
    expect(classifyRecommendedTool("nope").codes).toEqual(["RECOMMENDED_TOOL_NOT_OBJECT"]);
  });
});

describe("classifyDoc — checklist items", () => {
  it("READY with a single valid item", () => {
    expect(classifyDoc(emptyValidDoc({ checklist: [validItem("a")] })).status).toBe("READY");
  });
  it("BLOCKED on duplicate item ids", () => {
    const r = classifyDoc(emptyValidDoc({ checklist: [validItem("a"), validItem("a")] }));
    expect(r.codes.some((c: string) => c.startsWith("ITEM_1_DUPLICATE_ID_"))).toBe(true);
  });
  it("BLOCKED on unknown item key", () => {
    expect(classifyDoc(emptyValidDoc({ checklist: [validItem("a", { backdoor: 1 })] })).codes)
      .toContain("ITEM_0_UNKNOWN_KEY_backdoor");
  });
  it("BLOCKED on missing required item key", () => {
    const it = validItem("a");
    delete (it as Record<string, unknown>).completedAt;
    expect(classifyDoc(emptyValidDoc({ checklist: [it] })).codes)
      .toContain("ITEM_0_MISSING_KEY_completedAt");
  });
  it("BLOCKED on invalid item status", () => {
    expect(classifyDoc(emptyValidDoc({ checklist: [validItem("a", { status: "xxx" })] })).codes)
      .toContain("ITEM_0_INVALID_STATUS");
  });
  it("BLOCKED on invalid item stage", () => {
    expect(classifyDoc(emptyValidDoc({ checklist: [validItem("a", { stage: "moon" })] })).codes)
      .toContain("ITEM_0_INVALID_STAGE");
  });
  it("BLOCKED on non-bool required", () => {
    expect(classifyDoc(emptyValidDoc({ checklist: [validItem("a", { required: "yes" })] })).codes)
      .toContain("ITEM_0_REQUIRED_NOT_BOOL");
  });
  it("BLOCKED on oversized id", () => {
    expect(classifyDoc(emptyValidDoc({ checklist: [validItem("x".repeat(81))] })).codes)
      .toContain("ITEM_0_INVALID_ID");
  });
  it("BLOCKED on oversized notes", () => {
    expect(classifyDoc(emptyValidDoc({ checklist: [validItem("a", { notes: "x".repeat(4001) })] })).codes)
      .toContain("ITEM_0_INVALID_NOTES");
  });
  it("READY with valid notes", () => {
    expect(classifyDoc(emptyValidDoc({ checklist: [validItem("a", { notes: "ok" })] })).status).toBe("READY");
  });
  it("READY with assumed_complete", () => {
    expect(classifyDoc(emptyValidDoc({ checklist: [validItem("a", { status: "assumed_complete", completedAt: 1 })] })).status).toBe("READY");
  });
});

describe("classifyDoc — checklist size", () => {
  it(`READY at exactly ${MAX_CHECKLIST_ITEMS} items`, () => {
    const items = Array.from({ length: MAX_CHECKLIST_ITEMS }, (_, i) => validItem(`a_${i}`));
    expect(classifyDoc(emptyValidDoc({ checklist: items })).status).toBe("READY");
  });
  it(`BLOCKED at ${MAX_CHECKLIST_ITEMS + 1} items`, () => {
    const items = Array.from({ length: MAX_CHECKLIST_ITEMS + 1 }, (_, i) => validItem(`a_${i}`));
    expect(classifyDoc(emptyValidDoc({ checklist: items })).codes).toContain(`CHECKLIST_OVERSIZE_${MAX_CHECKLIST_ITEMS + 1}`);
  });
});

describe("template parity — every canonical template item is valid", () => {
  it("the full canonical checklist passes validation and stays within the cap", () => {
    const stageOrder = ["discovery", "school_matching", "application", "admission_i20", "visa_preparation", "pre_departure"];
    const items: Array<Record<string, unknown>> = [];
    for (const stage of stageOrder) {
      for (const tmpl of templates[stage]) {
        items.push({
          ...tmpl,
          status: "not_started",
          completedAt: null,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        });
      }
    }
    expect(items.length).toBeLessThanOrEqual(MAX_CHECKLIST_ITEMS);
    const result = classifyDoc(emptyValidDoc({ checklist: items }));
    if (result.status !== "READY") {
      throw new Error(`Canonical templates produced status=${result.status} codes=${JSON.stringify(result.codes.slice(0, 10))}`);
    }
    expect(result.status).toBe("READY");
  });
});
