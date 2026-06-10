// ─────────────────────────────────────────────────────────────────────────────
// My Study Abroad Roadmap — types, stage definitions, checklist templates,
// and the deterministic stage-assignment helper.
//
// This module is the single source of truth for the new roadmap feature.
// Everything stage-related (UI tiles, progress math, recommended-tool
// routing, onboarding output) reads from here. To change copy or extend
// a checklist, edit only this file.
//
// Coexistence rules:
//   - The legacy /app/roadmap static content (UNDERGRAD_ROADMAP /
//     POSTGRAD_ROADMAP at src/lib/roadmap/content) is NOT touched here.
//     The legacy roadmapProgress/{uid} collection also stays as-is.
//     This module backs a new, separate studyRoadmaps/{uid} collection.
//   - The intake-form data (studentProfiles/{uid}) is read but NEVER
//     overwritten. Onboarding writes to studyRoadmaps only.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// Stage identifiers — keep these stable; they're persisted in Firestore.
// Adding a new stage requires a doc version bump + a migration plan.
// ─────────────────────────────────────────────────────────────────────
export type RoadmapStageId =
  | "discovery"
  | "school_matching"
  | "application"
  | "admission_i20"
  | "visa_preparation"
  | "pre_departure";

export const ROADMAP_STAGE_ORDER: RoadmapStageId[] = [
  "discovery",
  "school_matching",
  "application",
  "admission_i20",
  "visa_preparation",
  "pre_departure",
];

// Display-side metadata. Routes match what's already in App.tsx so we
// never link to a dead path. Keep tool routes additive — never overwrite
// a route already serving live traffic.
export interface RoadmapStageMeta {
  id:                RoadmapStageId;
  title:             string;
  short:             string;       // 1-2 word label for compact UI
  description:       string;
  primaryCta:        string;       // CTA text shown on the dashboard
  toolRoute:         string;       // where the CTA points
  /** When true, the CTA opens a "this tool is coming soon" modal
   *  instead of navigating. Three of the six stages currently have no
   *  dedicated tool — they live on the roadmap until we build them. */
  comingSoon?:       boolean;
  accentFrom:        string;       // tailwind gradient stop
  accentTo:          string;
  accentText:        string;       // text-{color}-700 for chip
  accentRing:        string;       // ring-{color}-100 for soft ring
  accentChipBg:      string;       // bg-{color}-50
  accentChipBorder:  string;
}

export const ROADMAP_STAGES: Record<RoadmapStageId, RoadmapStageMeta> = {
  discovery: {
    id:               "discovery",
    title:            "Discovery",
    short:            "Discovery",
    description:      "Define what you want to study and how you'll fund it.",
    primaryCta:       "Find best-fit schools",
    toolRoute:        "/intake",
    accentFrom:       "from-emerald-500",
    accentTo:         "to-emerald-600",
    accentText:       "text-emerald-700",
    accentRing:       "ring-emerald-100",
    accentChipBg:     "bg-emerald-50",
    accentChipBorder: "border-emerald-200",
  },
  school_matching: {
    id:               "school_matching",
    title:            "School Matching",
    short:            "Matching",
    description:      "Compare schools and shortlist your final picks.",
    primaryCta:       "Generate match report",
    toolRoute:        "/intake",
    accentFrom:       "from-emerald-500",
    accentTo:         "to-emerald-600",
    accentText:       "text-emerald-700",
    accentRing:       "ring-emerald-100",
    accentChipBg:     "bg-emerald-50",
    accentChipBorder: "border-emerald-200",
  },
  application: {
    id:               "application",
    title:            "Applications",
    short:            "Applications",
    description:      "Prepare and submit clean applications on schedule.",
    primaryCta:       "Build application checklist",
    toolRoute:        "/app/roadmap",
    comingSoon:       true,
    accentFrom:       "from-emerald-500",
    accentTo:         "to-emerald-600",
    accentText:       "text-emerald-700",
    accentRing:       "ring-emerald-100",
    accentChipBg:     "bg-emerald-50",
    accentChipBorder: "border-emerald-200",
  },
  admission_i20: {
    id:               "admission_i20",
    title:            "Admission & I-20",
    short:            "I-20",
    description:      "Accept your offer and secure your Form I-20.",
    primaryCta:       "Review I-20 readiness",
    toolRoute:        "/app/roadmap",
    comingSoon:       true,
    accentFrom:       "from-emerald-500",
    accentTo:         "to-emerald-600",
    accentText:       "text-emerald-700",
    accentRing:       "ring-emerald-100",
    accentChipBg:     "bg-emerald-50",
    accentChipBorder: "border-emerald-200",
  },
  visa_preparation: {
    id:               "visa_preparation",
    title:            "Visa Preparation",
    short:            "Visa",
    description:      "Prep for the F-1 interview with confidence.",
    primaryCta:       "Practice visa interview",
    toolRoute:        "/app/visa-interview",
    accentFrom:       "from-emerald-500",
    accentTo:         "to-emerald-600",
    accentText:       "text-emerald-700",
    accentRing:       "ring-emerald-100",
    accentChipBg:     "bg-emerald-50",
    accentChipBorder: "border-emerald-200",
  },
  pre_departure: {
    id:               "pre_departure",
    title:            "Pre-Departure",
    short:            "Departure",
    description:      "Finalise travel and arrive ready for orientation.",
    primaryCta:       "Prepare for arrival",
    toolRoute:        "/app/roadmap",
    comingSoon:       true,
    accentFrom:       "from-emerald-500",
    accentTo:         "to-emerald-600",
    accentText:       "text-emerald-700",
    accentRing:       "ring-emerald-100",
    accentChipBg:     "bg-emerald-50",
    accentChipBorder: "border-emerald-200",
  },
};

// ─────────────────────────────────────────────────────────────────────
// Checklist templates — what tasks live under each stage. Each user gets
// a personal copy of these items written into their studyRoadmaps doc
// at onboarding completion (so we can update the template later without
// retroactively changing what users have already started).
//
// Keep ids stable. Title/description can be edited safely — they're
// re-read from the user's doc, not from this template.
// ─────────────────────────────────────────────────────────────────────

export type ChecklistItemStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked"
  | "needs_review"
  /** Seeded by the onboarding diagnostic when the user enters at an
   *  advanced stage. Means "we believe the user has done this — they
   *  said they're past it — but we have no verifying evidence." The UI
   *  must render this distinctly from `completed`, and the user must
   *  be able to confirm or correct it. Progress weighting is 0.85 (vs
   *  1.0 for verified). Never set by automatic reconciliation or by
   *  the user's own click — only by the diagnostic. */
  | "assumed_complete";

/** Closed-set list — every status in code MUST appear here. Used by
 *  rule validation, migration tooling, and the UI rendering map. */
export const CHECKLIST_STATUS_VALUES: ChecklistItemStatus[] = [
  "not_started",
  "in_progress",
  "completed",
  "blocked",
  "needs_review",
  "assumed_complete",
];

/** Weight assigned to each status when computing progress. Adjust here,
 *  not at call sites, so the math is centralised + auditable. Product
 *  signed off on these values during the P0 fix (see
 *  PRODUCTION_READINESS.md). */
export const STATUS_PROGRESS_WEIGHT: Record<ChecklistItemStatus, number> = {
  not_started:       0,
  in_progress:       0.5,
  completed:         1.0,
  blocked:           0,
  needs_review:      0,
  assumed_complete:  0.85,
};

export interface ChecklistItemTemplate {
  id:           string;          // stable; never edit after release
  stage:        RoadmapStageId;
  title:        string;
  description:  string;
  required:     boolean;
  toolRoute:    string | null;   // optional deep link to a CR tool
}

// Templates live in checklistTemplates.json — single source of truth
// shared with the migration script. Don't maintain a divergent copy
// here. The JSON is statically imported, so any drift between this
// type and the JSON's actual shape surfaces at compile time.
import rawTemplates from "./checklistTemplates.json";

type RawTemplate = Omit<ChecklistItemTemplate, "stage"> & { stage: string };
type RawTemplates = Record<string, RawTemplate[]> & { _comment?: string };

function loadTemplates(raw: RawTemplates): Record<RoadmapStageId, ChecklistItemTemplate[]> {
  const out = {} as Record<RoadmapStageId, ChecklistItemTemplate[]>;
  for (const stageId of ROADMAP_STAGE_ORDER) {
    const items = raw[stageId];
    if (!Array.isArray(items)) {
      throw new Error(`Missing checklist template for stage ${stageId}`);
    }
    out[stageId] = items.map((it) => ({
      id:          it.id,
      stage:       stageId,    // overrides any stage value in JSON; canonical source is the key
      title:       it.title,
      description: it.description,
      required:    it.required,
      toolRoute:   it.toolRoute,
    }));
  }
  return out;
}

export const CHECKLIST_TEMPLATES: Record<RoadmapStageId, ChecklistItemTemplate[]> =
  // The JSON literal has a `_comment` field of type string alongside the
  // stage arrays — TS can't narrow it to RawTemplates directly. Cast
  // through `unknown` (TS prescribes this for genuinely heterogeneous
  // structures); loadTemplates() validates the shape at runtime.
  loadTemplates(rawTemplates as unknown as RawTemplates);

// Per-user copy of a checklist item — embedded in the studyRoadmaps doc.
export interface ChecklistItem {
  id:           string;
  stage:        RoadmapStageId;
  title:        string;
  description:  string;
  status:       ChecklistItemStatus;
  required:     boolean;
  toolRoute:    string | null;
  completedAt:  number | null;   // epoch ms (Firestore Timestamp converts; we use number for portability)
  createdAt:    number;
  updatedAt:    number;
  notes?:       string;          // optional user notes
}

// ─────────────────────────────────────────────────────────────────────
// Onboarding answers + stage-assignment helper.
//
// IMPORTANT: stage assignment is deterministic. The spec says "Use
// deterministic logic first. Do not rely only on AI for stage
// assignment." This mapping is pure data → mapping → stage; no API
// calls, no models.
// ─────────────────────────────────────────────────────────────────────

export type CompletedAcademicLevel =
  | "shs_wassce"
  | "diploma_hnd"
  | "bachelors"
  | "masters"
  | "in_university"
  | "other";

export type TargetAcademicLevel =
  | "bachelors"
  | "masters"
  | "phd"
  | "certificate"
  | "english_program"
  | "not_sure";

export type CurrentProcessStatus =
  | "just_starting"
  | "know_what_to_study"
  | "looking_for_schools"
  | "shortlisted_schools"
  | "preparing_applications"
  | "submitted_applications"
  | "have_admission"
  | "received_i20"
  | "paid_sevis"
  | "completed_ds160"
  | "booked_visa_interview"
  | "received_visa"
  | "preparing_to_travel";

export type PrimaryNeed =
  | "finding_schools"
  | "choosing_program"
  | "understanding_costs"
  | "scholarships_funding"
  | "application_documents"
  | "visa_interview_preparation"
  | "pre_departure_preparation"
  | "not_sure";

export type OriginCountry = "ghana" | "nigeria" | "kenya" | "india" | "other";

export type StartTerm = "fall_2026" | "spring_2027" | "fall_2027" | "not_sure";

export interface OnboardingAnswers {
  completedAcademicLevel: CompletedAcademicLevel;
  targetAcademicLevel:    TargetAcademicLevel;
  /** Where the user is in the process. The diagnostic now allows
   *  multiple selections (e.g. "have_admission" + "paid_sevis" +
   *  "completed_ds160" — common for users mid-visa-prep). The
   *  assigned stage is the FURTHEST ALONG of the selections.
   *
   *  Backward-compat note: existing roadmap docs were written before
   *  this change and carry a single CurrentProcessStatus string.
   *  coerceProcessStatuses() below normalises both shapes for read
   *  paths; getStageFromOnboarding() accepts the array form. */
  currentProcessStatus:   CurrentProcessStatus[];
  primaryNeed:            PrimaryNeed;
  originCountry:          OriginCountry;
  preferredStartTerm:     StartTerm;
}

/** Normalise legacy single-string docs into the new array shape so
 *  every downstream consumer can assume an array. New writes are
 *  always arrays; old docs may have a string. */
export function coerceProcessStatuses(
  value: CurrentProcessStatus | CurrentProcessStatus[] | undefined | null,
): CurrentProcessStatus[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// Stage assignment map. Lifted straight from the spec.
const PROCESS_TO_STAGE: Record<CurrentProcessStatus, RoadmapStageId> = {
  just_starting:           "discovery",
  know_what_to_study:      "discovery",
  looking_for_schools:     "school_matching",
  shortlisted_schools:     "school_matching",
  preparing_applications:  "application",
  submitted_applications:  "application",
  have_admission:          "admission_i20",
  received_i20:            "admission_i20",
  paid_sevis:              "visa_preparation",
  completed_ds160:         "visa_preparation",
  booked_visa_interview:   "visa_preparation",
  received_visa:           "pre_departure",
  preparing_to_travel:     "pre_departure",
};

/**
 * Determine which stage a user belongs in based on their onboarding
 * answers. Pure function; deterministic; no side effects.
 *
 * Multi-select handling: each selected currentProcessStatus value
 * maps to a roadmap stage. We assign the user to the FURTHEST ALONG
 * of those stages — that's where they actually need to focus.
 *
 * Tiebreakers (apply if ANY selected status matches):
 *   - "received_i20"  + primaryNeed = visa-related → visa_preparation
 *   - "have_admission" + primaryNeed = visa-related → visa_preparation
 *   - primaryNeed = "not_sure" → trust the statuses alone.
 */
export function getStageFromOnboarding(answers: OnboardingAnswers): RoadmapStageId {
  const statuses = coerceProcessStatuses(answers.currentProcessStatus);
  if (statuses.length === 0) return "discovery"; // defensive

  // Find the most advanced stage across all selections.
  let bestIndex = -1;
  let bestStage: RoadmapStageId = "discovery";
  for (const status of statuses) {
    const stage = PROCESS_TO_STAGE[status];
    const idx = ROADMAP_STAGE_ORDER.indexOf(stage);
    if (idx > bestIndex) {
      bestIndex = idx;
      bestStage = stage;
    }
  }

  // Visa-interest override — if the user has an I-20 or admission AND
  // they say visa interview prep is what they need most, jump straight
  // to Visa Preparation regardless of the natural mapping.
  const needsVisaPrep = answers.primaryNeed === "visa_interview_preparation";
  if (needsVisaPrep && (statuses.includes("received_i20") || statuses.includes("have_admission"))) {
    return "visa_preparation";
  }
  return bestStage;
}

// ─────────────────────────────────────────────────────────────────────
// Roadmap document shape — written to studyRoadmaps/{uid}.
// version field lets us migrate safely later without rewriting old docs.
// ─────────────────────────────────────────────────────────────────────

export const STUDY_ROADMAP_VERSION = 1;

export interface StudyRoadmap {
  userId:                 string;
  originCountry:          OriginCountry;
  completedAcademicLevel: CompletedAcademicLevel;
  targetAcademicLevel:    TargetAcademicLevel;
  /** Always an array on new writes; may be a legacy single-string on
   *  pre-multi-select docs. Use coerceProcessStatuses() to normalise
   *  before display. */
  currentProcessStatus:   CurrentProcessStatus | CurrentProcessStatus[];
  primaryNeed:            PrimaryNeed;
  preferredStartTerm:     StartTerm;
  currentStage:           RoadmapStageId;
  progressPercentage:     number;          // 0-100, computed at write time
  recommendedTool: {
    label:       string;
    route:       string;
    description: string;
  };
  checklist:              ChecklistItem[];
  createdAt:              number;
  updatedAt:              number;
  completedOnboarding:    boolean;
  version:                number;
}

/**
 * Build a fresh roadmap document from onboarding answers. Idempotent +
 * pure — call any number of times with the same input, get the same
 * output (except for timestamps and per-item createdAt).
 *
 * Advanced-stage seeding (P0 fix, 2026-06-09):
 *   - When the assigned stage is past Discovery, REQUIRED items in
 *     earlier stages are seeded as `assumed_complete` rather than
 *     `not_started`. The user told us they're past those stages; we
 *     trust the diagnostic but mark the items distinctly so the user
 *     can correct anything that didn't actually happen.
 *   - Optional items in earlier stages stay `not_started` (they're
 *     opt-in nice-to-haves, not "you must have done this to be at
 *     stage X" prerequisites).
 *   - Items in the current stage and beyond always start fresh as
 *     `not_started`.
 */
export function generateRoadmapForUser(args: {
  userId: string;
  answers: OnboardingAnswers;
  now?: number;
}): StudyRoadmap {
  const now = args.now ?? Date.now();
  const stage = getStageFromOnboarding(args.answers);
  const currentStageIndex = ROADMAP_STAGE_ORDER.indexOf(stage);

  const checklist: ChecklistItem[] = ROADMAP_STAGE_ORDER.flatMap((stageId) =>
    CHECKLIST_TEMPLATES[stageId].map((template) => {
      const itemStageIndex = ROADMAP_STAGE_ORDER.indexOf(template.stage);
      const isEarlierStage = itemStageIndex < currentStageIndex;
      // Required items in earlier stages → assumed_complete.
      // Optional items in earlier stages, and ALL items in current /
      // later stages → not_started.
      const status: ChecklistItemStatus =
        isEarlierStage && template.required ? "assumed_complete" : "not_started";
      const completedAt = status === "assumed_complete" ? now : null;
      return {
        id:          template.id,
        stage:       template.stage,
        title:       template.title,
        description: template.description,
        status,
        required:    template.required,
        toolRoute:   template.toolRoute,
        completedAt,
        createdAt:   now,
        updatedAt:   now,
      };
    }),
  );

  const meta = ROADMAP_STAGES[stage];
  return {
    userId:                 args.userId,
    originCountry:          args.answers.originCountry,
    completedAcademicLevel: args.answers.completedAcademicLevel,
    targetAcademicLevel:    args.answers.targetAcademicLevel,
    currentProcessStatus:   args.answers.currentProcessStatus,
    primaryNeed:            args.answers.primaryNeed,
    preferredStartTerm:     args.answers.preferredStartTerm,
    currentStage:           stage,
    progressPercentage:     calculateProgress(checklist, stage),
    recommendedTool: {
      label:       meta.primaryCta,
      route:       meta.toolRoute,
      description: meta.description,
    },
    checklist,
    createdAt:              now,
    updatedAt:              now,
    completedOnboarding:    true,
    version:                STUDY_ROADMAP_VERSION,
  };
}

/**
 * Merge the current CHECKLIST_TEMPLATES with an existing checklist,
 * preserving every status, note, and timestamp on items that survive.
 *
 * Rules (P0 #1):
 *   - Items present in both: KEEP existing status, completedAt,
 *     updatedAt, notes. Update title/description/required/toolRoute
 *     from the template (copy refinements ship to existing users).
 *   - Items in template but NOT existing: APPEND with not_started
 *     (or assumed_complete if user is past that stage AND item is
 *     required) and fresh timestamps.
 *   - Items in existing but NOT in template: PRESERVE them so we
 *     never silently destroy historical progress on a template
 *     change. The migration script can surface these for review.
 *
 * Pure + deterministic. Run inside a Firestore transaction by the
 * caller to avoid lost updates.
 */
export function mergeChecklistWithTemplate(args: {
  existing: ChecklistItem[];
  currentStage: RoadmapStageId;
  now?: number;
}): { merged: ChecklistItem[]; addedIds: string[]; orphanedIds: string[] } {
  const { existing, currentStage } = args;
  const now = args.now ?? Date.now();
  const currentStageIndex = ROADMAP_STAGE_ORDER.indexOf(currentStage);

  // Index existing items by id for O(1) lookup.
  const byId = new Map(existing.map((it) => [it.id, it]));
  const addedIds: string[] = [];
  const seenIds = new Set<string>();

  // Walk the template in canonical order. For each template item,
  // either reuse the existing one (with refreshed copy) or create.
  const fromTemplate: ChecklistItem[] = ROADMAP_STAGE_ORDER.flatMap((stageId) =>
    CHECKLIST_TEMPLATES[stageId].map((template) => {
      seenIds.add(template.id);
      const existingItem = byId.get(template.id);
      if (existingItem) {
        // Existing item — preserve all user-mutable state, refresh copy.
        return {
          ...existingItem,
          title:       template.title,
          description: template.description,
          required:    template.required,
          toolRoute:   template.toolRoute,
          // Stage is structural — if a template moved an item between
          // stages, honour the new stage (this only happens with intentional
          // template changes that the migration script logs).
          stage:       template.stage,
          // updatedAt only refreshed if the copy actually changed; keep
          // user's last-updated otherwise.
          updatedAt:   existingItem.updatedAt,
        };
      }
      // New template item — append.
      addedIds.push(template.id);
      const itemStageIndex = ROADMAP_STAGE_ORDER.indexOf(template.stage);
      const isEarlierStage = itemStageIndex < currentStageIndex;
      const status: ChecklistItemStatus =
        isEarlierStage && template.required ? "assumed_complete" : "not_started";
      return {
        id:          template.id,
        stage:       template.stage,
        title:       template.title,
        description: template.description,
        status,
        required:    template.required,
        toolRoute:   template.toolRoute,
        completedAt: status === "assumed_complete" ? now : null,
        createdAt:   now,
        updatedAt:   now,
      };
    }),
  );

  // Orphans: items the user has that the template no longer defines.
  // Preserve them; surface ids for ops audit.
  const orphans = existing.filter((it) => !seenIds.has(it.id));
  const orphanedIds = orphans.map((it) => it.id);

  return {
    merged: [...fromTemplate, ...orphans],
    addedIds,
    orphanedIds,
  };
}

/**
 * Promote `not_started` REQUIRED items in earlier stages to
 * `assumed_complete` when the user advances. Pure + deterministic.
 *
 * Why this matters (P1 finding from CIO review): without this step,
 * an existing user who created their roadmap at Discovery (all items
 * not_started) and then updates their diagnostic to say they're at
 * visa_preparation continues to show 0% — every prerequisite item
 * stays not_started. With this step they get the same advanced-stage
 * seeding that brand-new users get.
 *
 * Safety rules:
 *   - ONLY items currently `not_started` are promoted. Manual states
 *     (in_progress, blocked, needs_review, completed, assumed_complete)
 *     are NEVER overwritten.
 *   - ONLY required items in earlier stages. Optional items stay as-is
 *     because they're opt-in nice-to-haves, not prerequisites.
 *   - Items in the current stage or later are never touched.
 *   - When the user moves BACKWARD (e.g. corrects themselves from
 *     visa_preparation to school_matching), we do NOT downgrade any
 *     existing `assumed_complete`/`completed` items. Stepping back
 *     doesn't undo progress; the user just sees they have more to
 *     manually verify than they used to.
 */
export function promoteEarlierStageRequiredItems(args: {
  checklist: ChecklistItem[];
  newStage: RoadmapStageId;
  now?: number;
}): { checklist: ChecklistItem[]; promotedItemIds: string[] } {
  const { checklist, newStage } = args;
  const now = args.now ?? Date.now();
  const newStageIndex = ROADMAP_STAGE_ORDER.indexOf(newStage);
  const promotedItemIds: string[] = [];
  const next = checklist.map((item) => {
    if (item.status !== "not_started") return item;
    if (!item.required)               return item;
    const itemStageIndex = ROADMAP_STAGE_ORDER.indexOf(item.stage);
    if (itemStageIndex < 0 || itemStageIndex >= newStageIndex) return item;
    promotedItemIds.push(item.id);
    return {
      ...item,
      status:      "assumed_complete" as const,
      completedAt: now,
      updatedAt:   now,
    };
  });
  return { checklist: next, promotedItemIds };
}

/**
 * Update only the diagnostic-derived fields on an existing roadmap.
 * Preserves the checklist + timestamps. Used by the "Update my
 * answers" flow. The actual Firestore write happens in the client
 * library inside a transaction.
 *
 * Promotion semantics (CIO P1 fixes, 2026-06-09):
 *   - The earlier-stage required-item promotion ONLY fires when the
 *     user's stage is strictly advancing. Same-stage and backward
 *     diagnostic updates DO NOT touch the checklist's existing
 *     statuses. This prevents the silent-re-assume bug where a user
 *     who manually demoted an `assumed_complete` item to `not_started`
 *     would have it re-promoted on any unrelated diagnostic change
 *     (country, start term, primary need).
 *   - Backward stage updates never downgrade existing progress (that
 *     was already the rule — every status flip is preserved).
 *   - The template merge ALWAYS runs (template additions are not
 *     stage-conditional; new template items always appear).
 */
export function applyDiagnosticUpdate(args: {
  existing: StudyRoadmap;
  answers: OnboardingAnswers;
  now?: number;
}): StudyRoadmap {
  const now = args.now ?? Date.now();
  const newStage = getStageFromOnboarding(args.answers);
  const oldStage = args.existing.currentStage;
  const newStageIndex = ROADMAP_STAGE_ORDER.indexOf(newStage);
  const oldStageIndex = ROADMAP_STAGE_ORDER.indexOf(oldStage);
  const meta = ROADMAP_STAGES[newStage];

  // Step 1: merge with the latest template (picks up new items added
  // since the user's original onboarding; preserves orphans). Runs
  // unconditionally — template additions are independent of stage moves.
  const { merged } = mergeChecklistWithTemplate({
    existing: args.existing.checklist,
    currentStage: newStage,
    now,
  });
  // Step 2: promote eligible earlier-stage required items ONLY when
  // the stage strictly advances. Same-stage and backward updates leave
  // the checklist alone.
  const advancing = newStageIndex > oldStageIndex;
  const { checklist: maybePromoted } = advancing
    ? promoteEarlierStageRequiredItems({ checklist: merged, newStage, now })
    : { checklist: merged };

  return {
    ...args.existing,
    originCountry:          args.answers.originCountry,
    completedAcademicLevel: args.answers.completedAcademicLevel,
    targetAcademicLevel:    args.answers.targetAcademicLevel,
    currentProcessStatus:   args.answers.currentProcessStatus,
    primaryNeed:            args.answers.primaryNeed,
    preferredStartTerm:     args.answers.preferredStartTerm,
    currentStage:           newStage,
    recommendedTool: {
      label:       meta.primaryCta,
      route:       meta.toolRoute,
      description: meta.description,
    },
    checklist:              maybePromoted,
    progressPercentage:     calculateProgress(maybePromoted, newStage),
    updatedAt:              now,
    // createdAt, completedOnboarding, version preserved from existing.
  };
}

/**
 * Recommended-tool helper. Indexed by stage id so the dashboard's
 * "what should I do next" card can re-derive the CTA without
 * re-reading the whole stage table.
 */
export function getRecommendedToolForStage(stage: RoadmapStageId): {
  label: string;
  route: string;
  description: string;
} {
  const meta = ROADMAP_STAGES[stage];
  return {
    label:       meta.primaryCta,
    route:       meta.toolRoute,
    description: meta.description,
  };
}

/**
 * Compute the progress percentage for a checklist.
 *
 * Scoring rules (centralised in STATUS_PROGRESS_WEIGHT above):
 *   - completed         → 1.00 of the item's weight
 *   - assumed_complete  → 0.85 (advanced-stage seeded; not verified)
 *   - in_progress       → 0.50
 *   - not_started       → 0.00
 *   - blocked           → 0.00
 *   - needs_review      → 0.00
 *
 * Item weight: required items are worth 1.0; optional items are worth
 * 0.5. So an optional item that's `assumed_complete` contributes
 * 0.5 * 0.85 = 0.425 of a "point" to the user's total possible.
 *
 * Only items at-or-before the current stage are scored — future-stage
 * items don't pull the bar down because the user isn't there yet.
 *
 * The previous implementation treated `assumed_complete` as 0 because
 * the status didn't exist. Advanced-stage users with seeded earlier
 * items now correctly land at a non-zero starting progress.
 */
export function calculateProgress(
  checklist: ChecklistItem[],
  currentStage: RoadmapStageId,
): number {
  const currentStageIndex = ROADMAP_STAGE_ORDER.indexOf(currentStage);
  if (currentStageIndex < 0 || checklist.length === 0) return 0;

  const relevant = checklist.filter((item) => {
    const itemStageIndex = ROADMAP_STAGE_ORDER.indexOf(item.stage);
    return itemStageIndex >= 0 && itemStageIndex <= currentStageIndex;
  });
  if (relevant.length === 0) return 0;

  let total = 0;
  let earned = 0;
  for (const item of relevant) {
    const itemWeight = item.required ? 1.0 : 0.5;
    const statusFactor = STATUS_PROGRESS_WEIGHT[item.status] ?? 0;
    total  += itemWeight;
    earned += itemWeight * statusFactor;
  }
  if (total === 0) return 0;
  return Math.round((earned / total) * 100);
}

/**
 * Returns the next stage in the canonical order, or null if the user
 * is already on the last stage. Used by the "Continue to <next>" CTA
 * that surfaces once the current stage's required items are done.
 */
export function getNextStage(stage: RoadmapStageId): RoadmapStageId | null {
  const idx = ROADMAP_STAGE_ORDER.indexOf(stage);
  if (idx < 0 || idx >= ROADMAP_STAGE_ORDER.length - 1) return null;
  return ROADMAP_STAGE_ORDER[idx + 1];
}

/**
 * Are ALL required items in the user's current stage marked completed?
 * Drives the "Continue to next stage" CTA — we only surface it when
 * the user has materially finished the work, not just clicked a few
 * boxes.
 */
export function isStageRequiredComplete(
  checklist: ChecklistItem[],
  stage: RoadmapStageId,
): boolean {
  const required = checklist.filter((it) => it.stage === stage && it.required);
  if (required.length === 0) return false;        // nothing to complete = never auto-advance
  return required.every((it) => it.status === "completed");
}

// ─────────────────────────────────────────────────────────────────────
// Display labels for onboarding answers — used by the dashboard summary
// so we don't render raw enum slugs. Adding a new option requires both
// the enum entry above and a label here.
// ─────────────────────────────────────────────────────────────────────
export const LABELS = {
  completedAcademicLevel: {
    shs_wassce:    "SHS / WASSCE",
    diploma_hnd:   "Diploma / HND",
    bachelors:     "Bachelor's degree",
    masters:       "Master's degree",
    in_university: "Currently in university",
    other:         "Other",
  } as Record<CompletedAcademicLevel, string>,
  targetAcademicLevel: {
    bachelors:        "Bachelor's",
    masters:          "Master's",
    phd:              "PhD",
    certificate:      "Certificate / pathway program",
    english_program:  "English language program",
    not_sure:         "Not sure yet",
  } as Record<TargetAcademicLevel, string>,
  currentProcessStatus: {
    just_starting:          "I am just starting",
    know_what_to_study:     "I know what I want to study",
    looking_for_schools:    "I am looking for schools",
    shortlisted_schools:    "I have shortlisted schools",
    preparing_applications: "I am preparing applications",
    submitted_applications: "I have submitted applications",
    have_admission:         "I have admission",
    received_i20:           "I have received my I-20",
    paid_sevis:             "I have paid SEVIS",
    completed_ds160:        "I have completed DS-160",
    booked_visa_interview:  "I have booked my visa interview",
    received_visa:          "I have received my visa",
    preparing_to_travel:    "I am preparing to travel",
  } as Record<CurrentProcessStatus, string>,
  primaryNeed: {
    finding_schools:             "Finding schools",
    choosing_program:            "Choosing a program",
    understanding_costs:         "Understanding costs",
    scholarships_funding:        "Scholarships / funding",
    application_documents:       "Application documents",
    visa_interview_preparation:  "Visa interview preparation",
    pre_departure_preparation:   "Pre-departure preparation",
    not_sure:                    "I am not sure",
  } as Record<PrimaryNeed, string>,
  originCountry: {
    ghana:   "Ghana",
    nigeria: "Nigeria",
    kenya:   "Kenya",
    india:   "India",
    other:   "Other",
  } as Record<OriginCountry, string>,
  preferredStartTerm: {
    fall_2026:   "Fall 2026",
    spring_2027: "Spring 2027",
    fall_2027:   "Fall 2027",
    not_sure:    "Not sure yet",
  } as Record<StartTerm, string>,
};
