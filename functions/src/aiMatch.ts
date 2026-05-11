// ─────────────────────────────────────────────────────────────────────────────
// AI-powered school matching.
//
// The deterministic algorithm in src/lib/matching/matchSchools.ts is a
// reasonable floor: it knows about admit rates, cost, location, and field
// fit by name pattern. But repeated user feedback shows it produces lists
// that feel similar across profiles, especially for undergrad and masters
// where the dimensions that distinguish schools (research strength,
// programme reputation, recent admissions trends, faculty fit) aren't in
// the raw IPEDS / Scorecard data we have.
//
// This module hands the candidate set + the student profile to Claude and
// asks it to rank, bucket, and score the matches. The output shape exactly
// mirrors the SchoolMatch type the UI already consumes, so the call site
// (LockedPreviewPage) can swap implementations with no rendering change.
//
// Failure handling: any error here is non-fatal. The caller MUST fall back
// to the deterministic matcher so users never see a broken report.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin candidate sent from the client. We only include fields Claude needs
 * to reason about fit — keeps the payload small and the prompt focused.
 */
export interface AiCandidate {
  unitId:        string;
  name:          string;
  state:         string | null;
  city:          string | null;
  admissionRate: number | null;
  averageCost:   number | null;
  ownership:     string;
}

export interface AiMatchProfileInput {
  level?:        string;
  field?:        string;
  intendedMajor?: string;
  gpa?:          string;
  gradingSystem?: string;
  testType?:     string;
  testScores?:   string | number;
  funding?:      string;
  destination?:  string;
}

export interface AiRankedMatch {
  unitId:               string;
  matchScore:           number;            // 0-100
  category:             "Strong Fit" | "Good Fit" | "Exploratory Fit";
  admissionBucket:      "reach" | "target" | "safety";
  admissionLikelihood:  number;            // 0-100
  budgetFit:            "Excellent" | "Good" | "Stretch" | "Out of Budget";
  academicFit:          "Likely" | "Target" | "Reach" | "High Reach" | "Limited Data";
  reasoning:            string;            // one-sentence "why" for tooltips / debugging
}

export interface AiMatchResult {
  matches:      AiRankedMatch[];
  status:       "completed" | "failed";
  errorMessage?: string;
}

// Hard cap on how many candidates we feed Claude in a single call. The
// deterministic pre-filter already trims to gate-eligible schools; this is
// the secondary cap so prompts don't blow past Claude's effective attention
// window for ranking tasks.
const MAX_CANDIDATES_TO_RANK = 80;
const TARGET_TOP_K = 12;

const SYSTEM_PROMPT = `You are an experienced U.S. college admissions advisor. You will be given a student profile and a verified list of colleges — each one is already confirmed to offer the student's intended program at the right degree level. Your job is to rank the BEST ${TARGET_TOP_K} of them, assign each to reach / target / safety, and score the fit.

EVALUATION CRITERIA (apply judgment, not a formula):
- Academic fit: how the student's stats (GPA, test scores) compare to the school's typical admit. Be calibrated — at 3.6 GPA, MIT is reach, not target.
- Programme strength for the student's stated field. Recognise programmes known for the field even if not "elite overall" (e.g. Iowa State for agriculture; Georgia Tech for engineering).
- Selectivity vs applicant strength. Schools with admit rate ≤ 15% are reach for almost everyone; ≥ 60% is safety for a competent applicant.
- Funding viability vs the student's funding situation (Full Scholarship / Partial / Self-Funded). For Self-Funded, weight cost more heavily.
- Geographic / institutional diversity in the picked set — avoid 10 schools that all look the same. Mix selectivity tiers within each bucket.
- For doctoral candidates, weight research colleges heavily over teaching-focused schools.
- For masters, weight programme depth and funding availability.
- For undergrad, weight institutional fit + cost + brand recognition.

BUCKETING:
- "reach"   → admission probability < 30% for this specific applicant
- "target"  → 30-70% probability
- "safety"  → > 70% probability
Target shape: 3 reach + 4 target + 3 safety. If the candidate pool genuinely doesn't support that mix (e.g. very strong applicant with all-Ivy candidate set), pick the best ${TARGET_TOP_K} and split as best fits — don't force schools into wrong buckets.

OUTPUT FORMAT (return ONLY valid JSON, no markdown fences):
{
  "matches": [
    {
      "unitId":              "<must be one of the input unitIds>",
      "matchScore":          85,
      "category":            "Strong Fit" | "Good Fit" | "Exploratory Fit",
      "admissionBucket":     "reach" | "target" | "safety",
      "admissionLikelihood": 65,
      "budgetFit":           "Excellent" | "Good" | "Stretch" | "Out of Budget",
      "academicFit":         "Likely" | "Target" | "Reach" | "High Reach" | "Limited Data",
      "reasoning":           "One-sentence reason this school for this student."
    }
  ]
}

Category guide:
- "Strong Fit"      → matchScore ≥ 80
- "Good Fit"        → 65–79
- "Exploratory Fit" → 50–64

Do NOT invent schools. Do NOT include schools whose unitId is not in the input list. Return exactly ${TARGET_TOP_K} matches unless the input list has fewer than that.`;

/**
 * Rank + bucket a candidate list of schools for one applicant using Claude.
 * Throws on hard failure (API down, malformed response) so the caller can
 * fall back to the deterministic algorithm.
 */
export async function aiMatchSchools(args: {
  apiKey:     string;
  profile:    AiMatchProfileInput;
  candidates: AiCandidate[];
}): Promise<AiMatchResult> {
  const { apiKey, profile, candidates } = args;
  if (!apiKey)                  throw new Error("aiMatchSchools: missing apiKey");
  if (candidates.length === 0)  return { matches: [], status: "completed" };

  // Cap the candidate set so the prompt stays focused. The client should
  // be sending the top-N by some pre-score; if it sends everything, we
  // truncate here to keep latency + cost predictable.
  const candidatesToRank = candidates.slice(0, MAX_CANDIDATES_TO_RANK);

  const profileSummary = [
    `level: ${profile.level ?? "unknown"}`,
    `field / intended major: ${profile.field ?? profile.intendedMajor ?? "unknown"}`,
    profile.gpa ? `GPA: ${profile.gpa} on ${profile.gradingSystem ?? "4.0 scale"}` : "GPA: not provided",
    profile.testType && profile.testType !== "None" && profile.testScores ? `${profile.testType}: ${profile.testScores}` : "standardized test: not provided",
    `funding situation: ${profile.funding ?? "unspecified"}`,
    `target country: ${profile.destination ?? "United States"}`,
  ].join("\n");

  // Compact one-line-per-school candidate listing. Claude doesn't need
  // formatting noise — admit rate as percent, cost as $K for brevity.
  const candidateListing = candidatesToRank.map((c) => {
    const admit = (c.admissionRate != null && c.admissionRate > 0)
      ? `${Math.round(c.admissionRate * 100)}% admit`
      : "admit rate unknown";
    const cost = c.averageCost != null ? `$${Math.round(c.averageCost / 1000)}K/yr` : "cost unknown";
    const loc  = [c.city, c.state].filter(Boolean).join(", ") || "—";
    return `[${c.unitId}] ${c.name} | ${loc} | ${admit} | ${cost} | ${c.ownership}`;
  }).join("\n");

  const userMessage = `STUDENT PROFILE:
${profileSummary}

CANDIDATE SCHOOLS (each one verified to offer this student's program at the requested level):
${candidateListing}

Rank the top ${TARGET_TOP_K} for this student and return the JSON described in the system prompt.`;

  const anthropic = new Anthropic({ apiKey });

  let raw: string;
  try {
    // Sonnet for the matching ranking — this is the headline product surface;
    // worth the extra ~10s vs Haiku for the quality bump.
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 4000,
      temperature: 0.3,
      system:     SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("")
      .trim()
      .replace(/^\s*```(?:json)?\s*\n?/im, "")
      .replace(/\n?\s*```\s*$/im, "")
      .trim();
  } catch (err: any) {
    return { matches: [], status: "failed", errorMessage: err?.message ?? "Anthropic call failed" };
  }

  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch (e: any) {
    return { matches: [], status: "failed", errorMessage: `JSON parse: ${e?.message}` };
  }

  if (!parsed || !Array.isArray(parsed.matches)) {
    return { matches: [], status: "failed", errorMessage: "Response missing matches array" };
  }

  // Validate + sanitize each match. We're strict about unknown unitIds so
  // a hallucinated school never reaches the user.
  const validUnitIds = new Set(candidatesToRank.map((c) => c.unitId));
  const seenUnitIds = new Set<string>();
  const matches: AiRankedMatch[] = [];

  for (const m of parsed.matches) {
    if (!m || typeof m !== "object") continue;
    const unitId = String(m.unitId ?? "");
    if (!validUnitIds.has(unitId)) continue;       // skip hallucinated schools
    if (seenUnitIds.has(unitId))   continue;       // skip duplicates
    seenUnitIds.add(unitId);

    const matchScore = clampInt(m.matchScore, 0, 100, 50);
    const admissionLikelihood = clampInt(m.admissionLikelihood, 0, 100, 50);
    const category = ["Strong Fit", "Good Fit", "Exploratory Fit"].includes(m.category)
      ? m.category : (matchScore >= 80 ? "Strong Fit" : matchScore >= 65 ? "Good Fit" : "Exploratory Fit");
    const budgetFit = ["Excellent", "Good", "Stretch", "Out of Budget"].includes(m.budgetFit)
      ? m.budgetFit : "Good";
    const academicFit = ["Likely", "Target", "Reach", "High Reach", "Limited Data"].includes(m.academicFit)
      ? m.academicFit : "Target";

    matches.push({
      unitId,
      matchScore,
      category,
      // Bucket assignment is RE-DERIVED below from sorted likelihoods so we
      // always produce a clean 3/4/3 split. Storing Claude's claim here is
      // pointless because we're about to overwrite it.
      admissionBucket: "target",
      admissionLikelihood,
      budgetFit,
      academicFit,
      reasoning: typeof m.reasoning === "string" ? m.reasoning.slice(0, 280) : "",
    });
  }

  // ── Enforce 3/4/3 reach/target/safety split ────────────────────────────
  // Claude's freeform bucket assignment was unreliable — sometimes 8 reach
  // and 0 target, sometimes all in one bucket, leaving tabs empty. Instead
  // of trusting it, we sort the AI-picked matches by admissionLikelihood
  // and slice into thirds. Lowest likelihood → reach (hardest), highest →
  // safety (easiest). This guarantees buckets always sieve and is the
  // canonical mathematical relationship anyway.
  const sortedByLikelihood = [...matches].sort((a, b) => a.admissionLikelihood - b.admissionLikelihood);
  const n = sortedByLikelihood.length;
  // For 10 we want 3+4+3. For fewer items, scale proportionally.
  const reachCount  = Math.min(3, Math.ceil(n * 0.3));
  const safetyCount = Math.min(3, Math.ceil(n * 0.3));
  const targetCount = Math.max(0, n - reachCount - safetyCount);
  for (let i = 0; i < n; i++) {
    let bucket: AiRankedMatch["admissionBucket"];
    if (i < reachCount)                            bucket = "reach";
    else if (i < reachCount + targetCount)         bucket = "target";
    else                                           bucket = "safety";
    sortedByLikelihood[i].admissionBucket = bucket;
  }

  // Return the matches in their ORIGINAL Claude order (best fit first
  // overall), but with corrected bucket labels. The client groups by
  // bucket; the order within each bucket then preserves Claude's
  // ranking of fit within similarly-bucketed schools.
  return { matches, status: "completed" };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v ?? ""), 10);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
