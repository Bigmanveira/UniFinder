// ─────────────────────────────────────────────────────────────────────────────
// roadmapValidator.cjs — PURE validator that mirrors the hardened Firestore
// rules for the studyRoadmaps collection.
//
// This is the single source of truth used by:
//   - scripts/roadmapMigration.cjs preflight (classifies READY / REPAIRABLE
//     / BLOCKED / SKIPPED before any write)
//   - scripts/lib/roadmapValidator.test.cjs unit tests (proves the mirror
//     is accurate)
//   - PRODUCTION_READINESS.md "rule-template parity" verification
//
// CONTRACT
//   classifyDoc(doc, { templateHash }) → {
//     status: "READY" | "REPAIRABLE" | "BLOCKED" | "SKIPPED",
//     codes:  string[],           // machine-readable reason codes
//     repairs?: string[],         // when REPAIRABLE: which auto-repairs apply
//     normalised?: object         // when REPAIRABLE: the post-repair doc
//   }
//
// SAFETY
//   - Pure: no Firestore I/O, no globals. Same input → same output.
//   - REPAIRABLE is reserved for explicitly defined repairs only (currently
//     just legacy `currentProcessStatus` string → array). No silent field
//     deletion. No guessed values.
//   - BLOCKED never auto-resolves. Operator must inspect and fix at source.
//
// Constants here MUST match the hardened firestore.rules.draft. The
// roadmapValidator.test.cjs file pins them; CI fails if they drift.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

// ── Constants (must mirror firestore.rules.draft + studyAbroad.ts) ────
const REQUIRED_ROADMAP_KEYS = [
  "userId", "originCountry", "completedAcademicLevel", "targetAcademicLevel",
  "currentProcessStatus", "primaryNeed", "preferredStartTerm", "currentStage",
  "progressPercentage", "recommendedTool", "checklist",
  "createdAt", "updatedAt", "completedOnboarding", "version",
];
const ALLOWED_ROADMAP_KEYS = REQUIRED_ROADMAP_KEYS;
const REQUIRED_ITEM_KEYS = [
  "id", "stage", "title", "description", "status", "required",
  "toolRoute", "completedAt", "createdAt", "updatedAt",
];
const ALLOWED_ITEM_KEYS = [...REQUIRED_ITEM_KEYS, "notes"];
const REQUIRED_TOOL_KEYS = ["label", "route", "description"];

const STAGE_ENUM = [
  "discovery", "school_matching", "application",
  "admission_i20", "visa_preparation", "pre_departure",
];
const PROCESS_STATUS_ENUM = [
  "just_starting", "know_what_to_study", "looking_for_schools",
  "shortlisted_schools", "preparing_applications", "submitted_applications",
  "have_admission", "received_i20", "paid_sevis", "completed_ds160",
  "booked_visa_interview", "received_visa", "preparing_to_travel",
];
const PRIMARY_NEED_ENUM = [
  "finding_schools", "choosing_program", "understanding_costs",
  "scholarships_funding", "application_documents",
  "visa_interview_preparation", "pre_departure_preparation", "not_sure",
];
const ORIGIN_COUNTRY_ENUM = ["ghana", "nigeria", "kenya", "india", "other"];
const COMPLETED_LEVEL_ENUM = [
  "shs_wassce", "diploma_hnd", "bachelors", "masters", "in_university", "other",
];
const TARGET_LEVEL_ENUM = [
  "bachelors", "masters", "phd", "certificate", "english_program", "not_sure",
];
const START_TERM_ENUM = ["fall_2026", "spring_2027", "fall_2027", "not_sure"];
const ITEM_STATUS_ENUM = [
  "not_started", "in_progress", "completed",
  "blocked", "needs_review", "assumed_complete",
];

const MAX_CHECKLIST_ITEMS = 50;            // Blocker 2: hard cap, mirror of rules.
const MAX_PROCESS_STATUSES = 13;           // == PROCESS_STATUS_ENUM.length
const MAX_PRIMARY_NEEDS = 8;               // == PRIMARY_NEED_ENUM.length
const MAX_SHORT_STRING = 200;
const MAX_LONG_STRING = 4_000;
const MAX_ID_LEN = 80;
const TARGET_VERSION = 1;

// ── Small typed predicates ────────────────────────────────────────────
function isPlainObject(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function isInt(x) {
  return Number.isInteger(x);
}
function isShortString(s) {
  return typeof s === "string" && s.length <= MAX_SHORT_STRING;
}
function isLongString(s) {
  return typeof s === "string" && s.length <= MAX_LONG_STRING;
}
// Firestore rules accept only integer epoch values or Firestore Timestamp
// values. Admin SDK Timestamp instances expose toMillis(). Do not accept
// ISO strings or timestamp-shaped plain objects: the rules would reject
// those values after promotion.
function isValidTimestampLike(x) {
  if (x == null) return false;
  if (typeof x === "number") return Number.isInteger(x) && x >= 0;
  if (typeof x === "object" && typeof x.toMillis === "function") {
    try {
      const millis = x.toMillis();
      return Number.isFinite(millis);
    } catch {
      return false;
    }
  }
  return false;
}

// ── Item validator ────────────────────────────────────────────────────
function classifyItem(item, index, seenIds) {
  const codes = [];
  if (!isPlainObject(item)) {
    return { codes: [`ITEM_NOT_OBJECT_AT_${index}`] };
  }
  const keys = Object.keys(item);
  for (const k of REQUIRED_ITEM_KEYS) {
    if (!keys.includes(k)) codes.push(`ITEM_${index}_MISSING_KEY_${k}`);
  }
  for (const k of keys) {
    if (!ALLOWED_ITEM_KEYS.includes(k)) codes.push(`ITEM_${index}_UNKNOWN_KEY_${k}`);
  }
  // id
  if (typeof item.id !== "string" || item.id.length < 1 || item.id.length > MAX_ID_LEN) {
    codes.push(`ITEM_${index}_INVALID_ID`);
  } else if (seenIds.has(item.id)) {
    codes.push(`ITEM_${index}_DUPLICATE_ID_${item.id}`);
  } else {
    seenIds.add(item.id);
  }
  // stage
  if (!STAGE_ENUM.includes(item.stage)) codes.push(`ITEM_${index}_INVALID_STAGE`);
  // status
  if (!ITEM_STATUS_ENUM.includes(item.status)) codes.push(`ITEM_${index}_INVALID_STATUS`);
  // required
  if (typeof item.required !== "boolean") codes.push(`ITEM_${index}_REQUIRED_NOT_BOOL`);
  // toolRoute: null or bounded string
  if (!(item.toolRoute === null || (typeof item.toolRoute === "string" && item.toolRoute.length <= MAX_SHORT_STRING))) {
    codes.push(`ITEM_${index}_INVALID_TOOL_ROUTE`);
  }
  // title / description
  if (!isShortString(item.title))      codes.push(`ITEM_${index}_INVALID_TITLE`);
  if (!isLongString(item.description)) codes.push(`ITEM_${index}_INVALID_DESCRIPTION`);
  // timestamps
  if (!(item.completedAt === null || isValidTimestampLike(item.completedAt))) {
    codes.push(`ITEM_${index}_INVALID_COMPLETED_AT`);
  }
  if (!isValidTimestampLike(item.createdAt)) codes.push(`ITEM_${index}_INVALID_CREATED_AT`);
  if (!isValidTimestampLike(item.updatedAt)) codes.push(`ITEM_${index}_INVALID_UPDATED_AT`);
  // notes (optional)
  if ("notes" in item) {
    if (!(item.notes === null || isLongString(item.notes))) codes.push(`ITEM_${index}_INVALID_NOTES`);
  }
  return { codes };
}

// ── currentProcessStatus normalisation + validation ───────────────────
// Returns:
//   { codes: [], normalised: <array form>, repaired: <bool> }
// or codes describing why it's invalid.
function classifyProcessStatus(value) {
  let repaired = false;
  let arr = value;
  if (typeof value === "string") {
    if (!PROCESS_STATUS_ENUM.includes(value)) {
      return { codes: ["PROCESS_STATUS_INVALID_STRING"] };
    }
    arr = [value];
    repaired = true;          // legacy single-string → array (REPAIRABLE)
  } else if (!Array.isArray(value)) {
    return { codes: ["PROCESS_STATUS_NOT_ARRAY"] };
  }
  if (arr.length < 1 || arr.length > MAX_PROCESS_STATUSES) {
    return { codes: [`PROCESS_STATUS_LENGTH_${arr.length}`] };
  }
  const seen = new Set();
  for (const v of arr) {
    if (!PROCESS_STATUS_ENUM.includes(v)) {
      return { codes: [`PROCESS_STATUS_INVALID_MEMBER_${v}`] };
    }
    if (seen.has(v)) return { codes: ["PROCESS_STATUS_DUPLICATE_MEMBER"] };
    seen.add(v);
  }
  return { codes: [], normalised: arr, repaired };
}

function classifyPrimaryNeed(value) {
  const needs = typeof value === "string" ? [value] : value;
  if (!Array.isArray(needs)) {
    return { codes: ["PRIMARY_NEED_NOT_ARRAY_OR_STRING"] };
  }
  if (needs.length < 1 || needs.length > MAX_PRIMARY_NEEDS) {
    return { codes: [`PRIMARY_NEED_LENGTH_${needs.length}`] };
  }
  const seen = new Set();
  for (const need of needs) {
    if (!PRIMARY_NEED_ENUM.includes(need)) {
      return { codes: [`PRIMARY_NEED_INVALID_MEMBER_${need}`] };
    }
    if (seen.has(need)) return { codes: ["PRIMARY_NEED_DUPLICATE_MEMBER"] };
    seen.add(need);
  }
  return { codes: [] };
}

// ── recommendedTool ───────────────────────────────────────────────────
function classifyRecommendedTool(tool) {
  if (!isPlainObject(tool)) return { codes: ["RECOMMENDED_TOOL_NOT_OBJECT"] };
  const keys = Object.keys(tool);
  const codes = [];
  for (const k of REQUIRED_TOOL_KEYS) {
    if (!keys.includes(k)) codes.push(`RECOMMENDED_TOOL_MISSING_${k}`);
  }
  for (const k of keys) {
    if (!REQUIRED_TOOL_KEYS.includes(k)) codes.push(`RECOMMENDED_TOOL_UNKNOWN_${k}`);
  }
  if (!isShortString(tool.label))       codes.push("RECOMMENDED_TOOL_LABEL");
  if (!isShortString(tool.route))       codes.push("RECOMMENDED_TOOL_ROUTE");
  if (!isLongString(tool.description))  codes.push("RECOMMENDED_TOOL_DESCRIPTION");
  return { codes };
}

// ── Top-level classifier ──────────────────────────────────────────────
function classifyDoc(doc, opts = {}) {
  const codes = [];
  const repairs = [];
  let normalised = null;
  // Hard guard.
  if (!isPlainObject(doc)) {
    return { status: "BLOCKED", codes: ["DOC_NOT_OBJECT"] };
  }
  // Version gate — only the current target version is in scope.
  if (doc.version !== TARGET_VERSION) {
    return {
      status: "SKIPPED",
      codes: [`VERSION_${typeof doc.version}_${doc.version}_NEEDS_${TARGET_VERSION}`],
    };
  }

  // Allowed-key + required-key audit at the top level.
  const keys = Object.keys(doc);
  for (const k of REQUIRED_ROADMAP_KEYS) {
    if (!keys.includes(k)) codes.push(`MISSING_${k}`);
  }
  for (const k of keys) {
    if (!ALLOWED_ROADMAP_KEYS.includes(k)) codes.push(`UNKNOWN_KEY_${k}`);
  }

  // Field types + enum / range checks.
  if (typeof doc.userId !== "string" || doc.userId.length < 1 || doc.userId.length > MAX_ID_LEN) {
    codes.push("INVALID_USER_ID");
  }
  if (opts.uid && doc.userId !== opts.uid) {
    codes.push("USER_ID_PATH_MISMATCH");
  }
  if (!STAGE_ENUM.includes(doc.currentStage))                   codes.push("INVALID_STAGE");
  if (!ORIGIN_COUNTRY_ENUM.includes(doc.originCountry))         codes.push("INVALID_ORIGIN_COUNTRY");
  if (!COMPLETED_LEVEL_ENUM.includes(doc.completedAcademicLevel)) codes.push("INVALID_COMPLETED_LEVEL");
  if (!TARGET_LEVEL_ENUM.includes(doc.targetAcademicLevel))     codes.push("INVALID_TARGET_LEVEL");
  if (!START_TERM_ENUM.includes(doc.preferredStartTerm))        codes.push("INVALID_START_TERM");
  if (typeof doc.completedOnboarding !== "boolean")             codes.push("INVALID_COMPLETED_ONBOARDING");
  if (!isInt(doc.progressPercentage) || doc.progressPercentage < 0 || doc.progressPercentage > 100) {
    codes.push("INVALID_PROGRESS_PERCENTAGE");
  }
  if (!isInt(doc.version) || doc.version < 1 || doc.version > 1000) {
    codes.push("INVALID_VERSION");
  }
  if (!isValidTimestampLike(doc.createdAt)) codes.push("INVALID_CREATED_AT");
  if (!isValidTimestampLike(doc.updatedAt)) codes.push("INVALID_UPDATED_AT");

  // recommendedTool
  const toolReport = classifyRecommendedTool(doc.recommendedTool);
  codes.push(...toolReport.codes);

  // currentProcessStatus — handle the legacy string → array repair.
  const statusReport = classifyProcessStatus(doc.currentProcessStatus);
  codes.push(...statusReport.codes);
  if (statusReport.repaired) repairs.push("LEGACY_PROCESS_STATUS_STRING_TO_ARRAY");

  const primaryNeedReport = classifyPrimaryNeed(doc.primaryNeed);
  if (primaryNeedReport.codes.length > 0) codes.push("INVALID_PRIMARY_NEED");
  codes.push(...primaryNeedReport.codes);

  // checklist
  if (!Array.isArray(doc.checklist)) {
    codes.push("CHECKLIST_NOT_ARRAY");
  } else {
    if (doc.checklist.length > MAX_CHECKLIST_ITEMS) {
      codes.push(`CHECKLIST_OVERSIZE_${doc.checklist.length}`);
    }
    const seenIds = new Set();
    for (let i = 0; i < doc.checklist.length; i++) {
      const { codes: itemCodes } = classifyItem(doc.checklist[i], i, seenIds);
      codes.push(...itemCodes);
    }
  }

  // Optional template-hash check (P0 manifest gate). We only consume it
  // here for accounting — the manifest-level check happens in the
  // migration script itself.
  if (opts.templateHash && doc._templateHashAtCreation && doc._templateHashAtCreation !== opts.templateHash) {
    codes.push("TEMPLATE_HASH_MISMATCH");
  }

  if (codes.length === 0) {
    if (repairs.length > 0) {
      // No errors, but at least one explicit auto-repair needs to be
      // applied. The migration applies repairs unattended; rule promotion
      // must wait until this doc is migrated.
      normalised = { ...doc, currentProcessStatus: statusReport.normalised };
      return { status: "REPAIRABLE", codes: [], repairs, normalised };
    }
    return { status: "READY", codes: [] };
  }
  // Errors present → BLOCKED. No silent partial-repairs. Operator must
  // inspect at source. The reason codes above are machine-readable so
  // the preflight report can be aggregated cleanly.
  return { status: "BLOCKED", codes };
}

// ── Manifest helpers ──────────────────────────────────────────────────
const crypto = require("crypto");
function templateHashOf(templateJsonText) {
  return crypto.createHash("sha256").update(templateJsonText).digest("hex").slice(0, 16);
}

module.exports = {
  // Constants
  REQUIRED_ROADMAP_KEYS, ALLOWED_ROADMAP_KEYS,
  REQUIRED_ITEM_KEYS, ALLOWED_ITEM_KEYS, REQUIRED_TOOL_KEYS,
  STAGE_ENUM, PROCESS_STATUS_ENUM, PRIMARY_NEED_ENUM,
  ORIGIN_COUNTRY_ENUM, COMPLETED_LEVEL_ENUM, TARGET_LEVEL_ENUM,
  START_TERM_ENUM, ITEM_STATUS_ENUM,
  MAX_CHECKLIST_ITEMS, MAX_PROCESS_STATUSES, MAX_PRIMARY_NEEDS,
  MAX_SHORT_STRING, MAX_LONG_STRING, MAX_ID_LEN, TARGET_VERSION,
  // Predicates
  isPlainObject, isInt, isShortString, isLongString, isValidTimestampLike,
  // Classifiers
  classifyItem, classifyProcessStatus, classifyPrimaryNeed, classifyRecommendedTool, classifyDoc,
  // Manifest helpers
  templateHashOf,
};
