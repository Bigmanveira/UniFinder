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
    description:      "Get clear on what you want to study, where, and how it'll be funded — the foundation for everything that follows.",
    primaryCta:       "Find my best-fit schools",
    toolRoute:        "/intake",
    accentFrom:       "from-blue-500",
    accentTo:         "to-cyan-500",
    accentText:       "text-blue-700",
    accentRing:       "ring-blue-100",
    accentChipBg:     "bg-blue-50",
    accentChipBorder: "border-blue-200",
  },
  school_matching: {
    id:               "school_matching",
    title:            "School Matching",
    short:            "Matching",
    description:      "Compare real schools against your profile — admit rates, tuition, deadlines — and shortlist your reach, target, and safety picks.",
    primaryCta:       "Generate my match report",
    toolRoute:        "/intake",   // intake leads into preview → unlock match report
    accentFrom:       "from-violet-500",
    accentTo:         "to-purple-500",
    accentText:       "text-violet-700",
    accentRing:       "ring-violet-100",
    accentChipBg:     "bg-violet-50",
    accentChipBorder: "border-violet-200",
  },
  application: {
    id:               "application",
    title:            "Application Preparation",
    short:            "Applications",
    description:      "Get every document in order — transcripts, SOP, recommendations, CV — and submit clean applications on schedule.",
    primaryCta:       "Build my application checklist",
    toolRoute:        "/app/roadmap",   // no dedicated tool yet; CTA surfaces a coming-soon modal
    comingSoon:       true,
    accentFrom:       "from-fuchsia-500",
    accentTo:         "to-pink-500",
    accentText:       "text-fuchsia-700",
    accentRing:       "ring-fuchsia-100",
    accentChipBg:     "bg-fuchsia-50",
    accentChipBorder: "border-fuchsia-200",
  },
  admission_i20: {
    id:               "admission_i20",
    title:            "Admission & I-20",
    short:            "I-20",
    description:      "Confirm your admission, submit financial proof, and get your I-20 — the document that unlocks every later step.",
    primaryCta:       "Review my I-20 readiness",
    toolRoute:        "/app/roadmap",
    comingSoon:       true,
    accentFrom:       "from-amber-500",
    accentTo:         "to-orange-500",
    accentText:       "text-amber-700",
    accentRing:       "ring-amber-100",
    accentChipBg:     "bg-amber-50",
    accentChipBorder: "border-amber-200",
  },
  visa_preparation: {
    id:               "visa_preparation",
    title:            "Visa Preparation",
    short:            "Visa",
    description:      "Practice the F-1 interview, pay SEVIS, complete DS-160, and walk into your appointment knowing what to expect.",
    primaryCta:       "Start AI visa interview practice",
    toolRoute:        "/app/visa-interview",
    accentFrom:       "from-rose-500",
    accentTo:         "to-red-500",
    accentText:       "text-rose-700",
    accentRing:       "ring-rose-100",
    accentChipBg:     "bg-rose-50",
    accentChipBorder: "border-rose-200",
  },
  pre_departure: {
    id:               "pre_departure",
    title:            "Pre-Departure",
    short:            "Departure",
    description:      "Book your flight, sort housing, prep your port-of-entry documents, and arrive ready for orientation.",
    primaryCta:       "Prepare for arrival",
    toolRoute:        "/app/roadmap",
    comingSoon:       true,
    accentFrom:       "from-emerald-500",
    accentTo:         "to-teal-500",
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
  | "needs_review";

export interface ChecklistItemTemplate {
  id:           string;          // stable; never edit after release
  stage:        RoadmapStageId;
  title:        string;
  description:  string;
  required:     boolean;
  toolRoute:    string | null;   // optional deep link to a CR tool
}

export const CHECKLIST_TEMPLATES: Record<RoadmapStageId, ChecklistItemTemplate[]> = {
  discovery: [
    { id: "d_profile",       stage: "discovery", title: "Complete academic profile",     description: "Your level, field, GPA, test scores, and budget — the inputs every later tool needs.", required: true,  toolRoute: "/intake" },
    { id: "d_level",         stage: "discovery", title: "Confirm target degree level",   description: "Bachelor's, Master's, PhD, or pathway — drives which programs you'll match against.",     required: true,  toolRoute: "/intake" },
    { id: "d_field",         stage: "discovery", title: "Set your intended field",       description: "Be specific (e.g. 'Economics, public policy track' beats 'Social sciences').",            required: true,  toolRoute: "/intake" },
    { id: "d_budget",        stage: "discovery", title: "Set your funding situation",    description: "Full funding, partial scholarship, or self-funded — affects which schools surface.",     required: true,  toolRoute: "/intake" },
    { id: "d_intake_term",   stage: "discovery", title: "Pick a target start term",      description: "Fall 2026, Spring 2027, or later. Most US schools have a Fall main intake.",              required: false, toolRoute: null },
    { id: "d_first_match",   stage: "discovery", title: "Run your first match",          description: "Hit the matching engine and see your initial shortlist — free preview costs nothing.",  required: true,  toolRoute: "/intake" },
  ],
  school_matching: [
    { id: "sm_review",       stage: "school_matching", title: "Review recommended schools",       description: "Look through the Reach / Target / Safety buckets. Are any unrealistic? Any missing?", required: true,  toolRoute: "/app" },
    { id: "sm_save",         stage: "school_matching", title: "Save 5–10 preferred schools",      description: "Use the heart icon to bookmark schools you want to dig deeper on.",                  required: true,  toolRoute: "/app" },
    { id: "sm_compare",      stage: "school_matching", title: "Compare tuition + deadlines",      description: "Open each saved school and weigh cost, location, and admission deadlines side by side.", required: false, toolRoute: "/app" },
    { id: "sm_unlock",       stage: "school_matching", title: "Unlock at least one match report", description: "1 credit. Gets you a full AI-explained report — admission likelihood, fit, application tips.", required: true,  toolRoute: "/app" },
    { id: "sm_shortlist",    stage: "school_matching", title: "Finalise a 6–10 school shortlist", description: "Mix of Reach, Target, and Safety. This is what you'll actually apply to.",            required: true,  toolRoute: "/app" },
  ],
  application: [
    { id: "ap_passport",     stage: "application", title: "Make sure your passport is valid",      description: "Must be valid for at least 6 months past your intended US arrival.",                  required: true,  toolRoute: null },
    { id: "ap_transcripts",  stage: "application", title: "Order official transcripts",            description: "Most schools want them sent directly from your institution — start early; it can take weeks.", required: true,  toolRoute: null },
    { id: "ap_sop",          stage: "application", title: "Draft your statement of purpose",       description: "A clear, specific essay on why this program, why this school, why now.",              required: true,  toolRoute: null },
    { id: "ap_cv",           stage: "application", title: "Prepare your CV / résumé",              description: "Academic CVs differ from professional ones — research, publications, awards up front.",   required: true,  toolRoute: null },
    { id: "ap_recs",         stage: "application", title: "Line up 2–3 recommenders",              description: "Pick people who can speak to your academic / professional ability with specifics.",     required: true,  toolRoute: null },
    { id: "ap_tests",        stage: "application", title: "Check test score requirements",         description: "TOEFL / IELTS, GRE / GMAT, SAT — varies by program. Don't skip if a school requires it.", required: true,  toolRoute: null },
    { id: "ap_deadlines",    stage: "application", title: "Track every deadline",                  description: "Per-school deadlines plus financial-aid deadlines (often earlier than admission deadlines).", required: true, toolRoute: null },
    { id: "ap_submit",       stage: "application", title: "Submit applications",                   description: "Hit submit on each application portal. Save confirmation emails.",                       required: true,  toolRoute: null },
  ],
  admission_i20: [
    { id: "i_confirm",       stage: "admission_i20", title: "Confirm your admission offer",         description: "Decide between offers — programme strength, funding, location, fit.",                 required: true,  toolRoute: null },
    { id: "i_accept",        stage: "admission_i20", title: "Accept and pay the enrolment deposit", description: "Most schools require a non-refundable deposit to release the I-20.",                  required: true,  toolRoute: null },
    { id: "i_financial",     stage: "admission_i20", title: "Submit financial documents",           description: "Bank statements, sponsor letters, scholarship awards — whatever the school requests.", required: true,  toolRoute: null },
    { id: "i_i20",           stage: "admission_i20", title: "Receive your Form I-20",                description: "Sent by your DSO (Designated School Official) after they verify your financials.",   required: true,  toolRoute: null },
    { id: "i_verify",        stage: "admission_i20", title: "Verify I-20 details",                  description: "Name, date of birth, programme, start date, school address. Wrong info = delayed visa.", required: true,  toolRoute: null },
    { id: "i_costs",         stage: "admission_i20", title: "Review estimated cost of attendance",  description: "Make sure your funding plan still covers the figure printed on the I-20.",            required: true,  toolRoute: null },
    { id: "i_sponsor",       stage: "admission_i20", title: "Prepare sponsor / funding evidence",    description: "Keep originals and copies — you'll need them at the visa interview.",                required: false, toolRoute: null },
  ],
  visa_preparation: [
    { id: "v_sevis",         stage: "visa_preparation", title: "Pay the SEVIS I-901 fee",             description: "Pay online at fmjfee.com. Save the receipt — you'll need it at the interview.",      required: true,  toolRoute: null },
    { id: "v_ds160",         stage: "visa_preparation", title: "Complete the DS-160",                  description: "Online non-immigrant visa application at ceac.state.gov. Save the confirmation page.", required: true,  toolRoute: null },
    { id: "v_schedule",      stage: "visa_preparation", title: "Schedule your visa interview",          description: "Through the US embassy's appointment system. Slots fill fast — book as early as possible.", required: true, toolRoute: null },
    { id: "v_passport",      stage: "visa_preparation", title: "Re-check passport validity",            description: "Valid 6 months past intended arrival. Renew now if it's close.",                       required: true,  toolRoute: null },
    { id: "v_docs",          stage: "visa_preparation", title: "Assemble document folder",              description: "I-20, DS-160 confirmation, SEVIS receipt, admission letter, financials, photos.",     required: true,  toolRoute: null },
    { id: "v_admit_letter",  stage: "visa_preparation", title: "Print your admission letter",            description: "Original or printed PDF. Some officers ask for it.",                                  required: false, toolRoute: null },
    { id: "v_financials",    stage: "visa_preparation", title: "Prepare financial documents",            description: "Bank statements, sponsor letters, scholarship awards, employment letters if relevant.", required: true,  toolRoute: null },
    { id: "v_sponsor_story", stage: "visa_preparation", title: "Prepare sponsor explanation",            description: "Who is paying, how, and why they're willing. Practice saying it in one sentence.",    required: true,  toolRoute: null },
    { id: "v_practice",      stage: "visa_preparation", title: "Practice with the AI visa interview",   description: "15 credits. Run a live mock with Anna; get scored feedback across 9 dimensions.",    required: true,  toolRoute: "/app/visa-interview" },
    { id: "v_review",        stage: "visa_preparation", title: "Review your interview feedback",         description: "Re-read the scored report; rework whichever answer scored lowest.",                  required: false, toolRoute: "/app/visa-interview" },
  ],
  pre_departure: [
    { id: "pd_visa",         stage: "pre_departure", title: "Confirm visa approval",                description: "Make sure your passport is back with the F-1 visa stamped in it.",                       required: true,  toolRoute: null },
    { id: "pd_flight",       stage: "pre_departure", title: "Book your flight",                     description: "Can arrive up to 30 days before your I-20 start date — not earlier.",                    required: true,  toolRoute: null },
    { id: "pd_housing",      stage: "pre_departure", title: "Arrange housing",                      description: "On-campus, off-campus apartment, or short-term until you find permanent.",              required: true,  toolRoute: null },
    { id: "pd_travel_docs",  stage: "pre_departure", title: "Pack travel documents",                description: "Passport with visa, I-20, DS-160, SEVIS receipt, admission letter, school contact info.", required: true,  toolRoute: null },
    { id: "pd_poe_docs",     stage: "pre_departure", title: "Port-of-entry documents in carry-on",  description: "CBP will ask. Don't pack these in checked luggage — keep them on you.",                 required: true,  toolRoute: null },
    { id: "pd_orientation",  stage: "pre_departure", title: "Plan school orientation",              description: "Check your portal — orientation is usually mandatory and may be a few days before classes.", required: true,  toolRoute: null },
    { id: "pd_arrival_plan", stage: "pre_departure", title: "Plan arrival transportation",          description: "From the airport to housing — uni shuttle, rideshare, or pickup arranged in advance.",   required: false, toolRoute: null },
    { id: "pd_dso",          stage: "pre_departure", title: "Know your DSO check-in window",         description: "You must check in with your school's DSO within a few days of arrival.",                 required: true,  toolRoute: null },
    { id: "pd_f1_rules",     stage: "pre_departure", title: "Read up on basic F-1 rules",            description: "Full-time enrolment, work restrictions, travel rules. The DSO can clarify anything.",   required: false, toolRoute: null },
  ],
};

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
  currentProcessStatus:   CurrentProcessStatus;
  primaryNeed:            PrimaryNeed;
  originCountry:          OriginCountry;
  preferredStartTerm:     StartTerm;
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
 * Tiebreakers:
 *   - If currentProcessStatus is "received_i20" AND primaryNeed is
 *     visa-related, advance to visa_preparation. The spec calls this
 *     out explicitly.
 *   - If primaryNeed is "not_sure", trust currentProcessStatus alone.
 */
export function getStageFromOnboarding(answers: OnboardingAnswers): RoadmapStageId {
  const baseStage = PROCESS_TO_STAGE[answers.currentProcessStatus];

  if (answers.currentProcessStatus === "received_i20" && answers.primaryNeed === "visa_interview_preparation") {
    return "visa_preparation";
  }
  if (answers.currentProcessStatus === "have_admission" && answers.primaryNeed === "visa_interview_preparation") {
    return "visa_preparation";
  }
  return baseStage;
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
  currentProcessStatus:   CurrentProcessStatus;
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
 */
export function generateRoadmapForUser(args: {
  userId: string;
  answers: OnboardingAnswers;
  now?: number;
}): StudyRoadmap {
  const now = args.now ?? Date.now();
  const stage = getStageFromOnboarding(args.answers);

  // Build the full checklist (every stage). We surface "current stage
  // first" in the UI but persist the whole journey so a user advancing
  // to a later stage doesn't see an empty checklist.
  const checklist: ChecklistItem[] = ROADMAP_STAGE_ORDER.flatMap((stageId) =>
    CHECKLIST_TEMPLATES[stageId].map((template) => ({
      id:          template.id,
      stage:       template.stage,
      title:       template.title,
      description: template.description,
      status:      "not_started" as const,
      required:    template.required,
      toolRoute:   template.toolRoute,
      completedAt: null,
      createdAt:   now,
      updatedAt:   now,
    })),
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
 * We weight "current stage and earlier" because uncompleted items in
 * a future stage shouldn't pull the bar down — the user isn't there
 * yet. Stages BEFORE the user's current stage are treated as fully
 * complete (you don't undo progress by moving forward), unless any
 * required items in those earlier stages are explicitly marked
 * "blocked" or "needs_review".
 *
 * 100% = every required item in current-and-earlier stages is
 * completed. Optional items boost the bar slightly but can't be the
 * cause of a < 100% score on their own.
 */
export function calculateProgress(
  checklist: ChecklistItem[],
  currentStage: RoadmapStageId,
): number {
  const currentStageIndex = ROADMAP_STAGE_ORDER.indexOf(currentStage);
  if (currentStageIndex < 0 || checklist.length === 0) return 0;

  // Only score items at-or-before the user's current stage.
  const relevant = checklist.filter((item) => {
    const itemStageIndex = ROADMAP_STAGE_ORDER.indexOf(item.stage);
    return itemStageIndex >= 0 && itemStageIndex <= currentStageIndex;
  });
  if (relevant.length === 0) return 0;

  // Each required item is worth 1.0; each optional item 0.5.
  // Completed status earns the full weight; in_progress earns half;
  // blocked / needs_review / not_started earn nothing.
  let total = 0;
  let earned = 0;
  for (const item of relevant) {
    const weight = item.required ? 1.0 : 0.5;
    total += weight;
    if (item.status === "completed")   earned += weight;
    else if (item.status === "in_progress") earned += weight * 0.5;
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
