import Anthropic from "@anthropic-ai/sdk";
import {
  type ExtractedDocument,
  type VisaDocumentType,
} from "./visaDocExtractor.js";
import {
  buildQuestionBankScoringContext,
  pickInitialVisaQuestion,
  retrieveVisaQuestions,
  selectVisaQuestion,
} from "./visaQuestionRetriever.js";
import { selectQuestionWithClaude } from "./visaOfficerSelector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Disclaimer attached to every Claude response. Must never be removed.
// ─────────────────────────────────────────────────────────────────────────────
export const VISA_DISCLAIMER =
  "This is a simulated F-1 visa interview for practice only. It is not legal advice, " +
  "not an official U.S. government service, and does not guarantee visa approval. " +
  "Final decisions are made by U.S. consular officers.";

// ─────────────────────────────────────────────────────────────────────────────
// Intro question bank — picked at random when the interview proper begins
// (i.e. after both DS-160 and I-20 have been uploaded). Avoids the previous
// always-the-same-greeting feel.
// ─────────────────────────────────────────────────────────────────────────────
export function pickIntroQuestion(): {
  text: string;
  stage: string;
  questionId: string;
  categoryId: string;
} {
  const selected = pickInitialVisaQuestion();
  return {
    text: selected.question,
    stage: "introduction",
    questionId: selected.id,
    categoryId: selected.categoryId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// "Visa officer" simulation
// ─────────────────────────────────────────────────────────────────────────────

export interface OfficerTurnResult {
  text: string;
  stage: string;
  requiresDocumentUpload: VisaDocumentType | null;
  isFinalQuestion: boolean;
  questionId?: string;
  categoryId?: string;
  status: "completed" | "fallback" | "failed";
  errorMessage?: string;
}

export interface TranscriptTurn {
  role: "officer" | "student" | "system";
  text: string;
  stage?: string;
  questionId?: string;
  categoryId?: string;
}

export async function generateOfficerTurn(args: {
  transcript: TranscriptTurn[];
  questionCount: number;
  /** Documents the student has already uploaded — Anna reads these at every
   *  turn so she doesn't ask for facts that are printed on them. */
  extractedDocuments?: ExtractedDocument[];
  /** Milliseconds since the first real interview question fired. Used to
   *  cap interview length (HeyGen has a max session duration so we want to
   *  wrap up before the avatar drops). 0 / undefined = not started yet. */
  elapsedMs?: number;
  /** Hard cap for this session. Default 300s (5 min) for paid sessions;
   *  preview sessions pass 180s (3 min). Anything ≥ this elapsed value
   *  short-circuits Claude and returns a wrap-up immediately. */
  maxDurationSec?: number;
  /** When true, Anna asks "What has changed since your last interview?"
   *  early in the flow. Set from session.isReturningApplicant. */
  isReturningApplicant?: boolean;
  /** Documents the student explicitly skipped. Retrieval treats these as
   *  resolved so Anna probes verbally instead of requesting them again. */
  unavailableDocumentTypes?: VisaDocumentType[];
  /** Pre-interview context only changes ranking inside the approved bank. */
  applicantContexts?: string[];
  /** Enables the Claude selector. Without it we fall back to the purely
   *  deterministic pick, so a missing key degrades quality but never breaks
   *  the interview. */
  apiKey?: string | null;
}): Promise<OfficerTurnResult> {
  const {
    transcript, questionCount, extractedDocuments,
    elapsedMs = 0, maxDurationSec = 180, isReturningApplicant = false,
    unavailableDocumentTypes = [], applicantContexts = [],
  } = args;
  const elapsedSec = elapsedMs / 1000;

  // HARD CAP: if elapsed >= maxDurationSec, force close without calling
  // Claude. This is the server-side enforcement that makes the preview
  // a "preview" — without it, a client that ignored the timer could
  // run the avatar indefinitely.
  if (elapsedSec >= maxDurationSec) {
    return {
      text: "Thank you. That's all I need from you today.",
      stage: "wrap_up",
      requiresDocumentUpload: null,
      isFinalQuestion: true,
      status: "completed",
    };
  }

  // Interview turns come from the approved bank. Claude now chooses WHICH
  // approved question comes next (see visaOfficerSelector) rather than
  // writing one — the heuristic ranking alone could not tell that a student
  // had already answered something, so the officer repeated itself and
  // changed subject at odd moments. The selector returns an id + an index
  // into approved wording, so out-of-bank text is unrepresentable, which was
  // the original reason for keeping the model out of this path. Any failure
  // falls through to the deterministic pick below.
  const studentTurnCount = transcript.filter((turn) => turn.role === "student").length;
  const remainingSec = maxDurationSec - elapsedSec;
  // Wrap-up gates, both set to real-interview shape: officers cover 3-8
  // questions and stop. The 25s reserve is enough for the closing line
  // without eating a quarter of a 3-minute session, which the old 45s did.
  if (remainingSec <= 25 || studentTurnCount >= 8) {
    return {
      text: "Thank you. That's all I need from you today.",
      stage: "wrap_up",
      requiresDocumentUpload: null,
      isFinalQuestion: true,
      status: "completed",
    };
  }

  const retrieval = retrieveVisaQuestions({
    transcript,
    extractedDocuments,
    resolvedDocumentTypes: unavailableDocumentTypes,
    questionCount,
    limit: 10,
    isReturningApplicant,
    applicantContexts,
  });
  const selected =
    (await selectQuestionWithClaude({
      apiKey: args.apiKey ?? null,
      retrieval,
      transcript,
      questionCount,
    })) ?? selectVisaQuestion(retrieval, transcript);

  if (!selected) {
    return {
      text: "Thank you. That's all I need from you today.",
      stage: "wrap_up",
      requiresDocumentUpload: null,
      isFinalQuestion: true,
      status: "completed",
    };
  }

  return {
    text: selected.text,
    stage: selected.stage,
    requiresDocumentUpload: null,
    isFinalQuestion: false,
    questionId: selected.questionId,
    categoryId: selected.categoryId,
    status: "completed",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring — runs once when the user ends the interview
// ─────────────────────────────────────────────────────────────────────────────

const SCORER_SYSTEM_PROMPT = `You are evaluating a student's PRACTICE F-1 visa interview transcript. This is a coaching simulation, not an official assessment. Your job is to give the student honest, actionable feedback.

CRITICAL RULES
- This is practice feedback. Never imply you can predict the real visa outcome.
- Never coach the student to lie, hide facts, invent sponsors, or fabricate documents.
- Encourage truthful, clear, consistent answers grounded in the student's actual situation.
- Score only evidence present in the student's spoken answers. Do not reward facts that appear only in the officer's question.
- Do not invent contradictions, missing documents, financial problems, or strong performance that the transcript does not show.
- If student-provided document facts are supplied, use them only to verify consistency with spoken answers. Uploading a document does not itself earn points, and an unreadable document does not itself lose points.
- If the student's transcript shows a red flag (immigrant intent, weak finances, vague career plan, inconsistencies), call it out plainly — don't soft-pedal.
- "Improved" sample answers should be more articulate and complete, but they must be hypothetical reformulations of the student's OWN claims, never invented facts.

- Every strength, weakness, red flag, and practice recommendation must refer to a topic or detail actually present in this transcript. Do not return generic completion praise.
- Sample improved answers must use questions that were actually asked and may only reorganize facts the student actually provided.

NEVER PENALISE THESE — 9 FAM 402.5-5 forbids consular officers from refusing on them, so marking them down teaches the student to fix something that is not a problem:
- Attending a lesser-known school, or planning to start at a community college and transfer.
- Missing or low standardised test scores, or a low GPA. Do not re-litigate the school's admission decision.
- A course of study that looks impractical in the home country, or one that is also offered there.
- Lacking property, payroll, or dependants. Students are expected to lack the ties an older applicant would have.
- Being unable to lay out a detailed long-range career plan. Young applicants are not expected to have one, and intent is assessed as of today — a plan that may later change is not a problem.

HOME TIES — CALIBRATE CAREFULLY. The bar is a credible, specific, PRESENT intention to leave the U.S. at the end of the course, not proof of permanent return and not a promise to return to their own country specifically. Score homeTiesScore low only when the student signals intent to remain or cannot name any concrete post-study step at all — never merely because they own nothing.

FINANCES CARRY THE MOST WEIGHT. Funds must be readily available for the first year and credible for later years. Treat as genuine red flags: an intention to obtain a loan that is not yet approved, a plan to fund the first year from CPT/OPT earnings, a sponsor whose stated income cannot plausibly produce the stated balance, and a large unexplained recent deposit.

CALIBRATION ANCHORS
- 90-100: specific, internally consistent, concise, and supported by concrete details across the answers.
- 75-89: credible and clear with only minor omissions or weak phrasing.
- 60-74: partially convincing but vague, generic, incomplete, or uneven.
- 40-59: major gaps, weak knowledge, repeated uncertainty, or unresolved inconsistencies.
- 0-39: evasive, materially contradictory, clearly unprepared, or unable to explain the study plan.
- Use the full range. Do not cluster every score around 70-85.
- Never use a fixed baseline or repeat a previous report's score. Every score and feedback item must be justified by this transcript's actual answers.
- If an area was not directly tested, infer conservatively from related answers and do not score it above 70.

SCORING CRITERIA (each 0-100)
- clarityScore: how clearly the student communicates
- consistencyScore: do their answers across turns line up?
- confidenceScore: confidence visible in wording and command of facts only; never infer from accent, grammar quirks, or voice characteristics absent from the transcript
- financialReadinessScore: how convincingly do they cover funding?
- schoolProgramExplanationScore: how well do they articulate school + programme choice?
- careerPlanScore: how concrete and credible are their post-grad plans?
- homeTiesScore: how clear are the reasons they'd return home?
- documentReadinessScore: how prepared do they sound on I-20, DS-160, SEVIS?
- overallScore: provide your estimate, but the application recalculates the final headline score from the calibrated sub-scores.

OUTPUT FORMAT
Return ONLY valid JSON, exactly this shape, no markdown fences:
{
  "overallScore": number,
  "clarityScore": number,
  "consistencyScore": number,
  "confidenceScore": number,
  "financialReadinessScore": number,
  "schoolProgramExplanationScore": number,
  "careerPlanScore": number,
  "homeTiesScore": number,
  "documentReadinessScore": number,
  "strengths": ["string", "string", "string"],
  "weaknesses": ["string", "string", "string"],
  "redFlagsToImprove": ["string", "string"],
  "recommendedPractice": ["string", "string", "string"],
  "sampleImprovedAnswers": [
    { "question": "string", "improvedAnswer": "string", "whyBetter": "string" }
  ],
  "disclaimer": "string"
}

Keep every string under 35 words. Provide 2-3 sample improved answers. Set the disclaimer field to a short reminder that this is practice feedback, not an official assessment.`;

const SCORING_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallScore: { type: "number" },
    clarityScore: { type: "number" },
    consistencyScore: { type: "number" },
    confidenceScore: { type: "number" },
    financialReadinessScore: { type: "number" },
    schoolProgramExplanationScore: { type: "number" },
    careerPlanScore: { type: "number" },
    homeTiesScore: { type: "number" },
    documentReadinessScore: { type: "number" },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    redFlagsToImprove: { type: "array", items: { type: "string" } },
    recommendedPractice: { type: "array", items: { type: "string" } },
    sampleImprovedAnswers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          improvedAnswer: { type: "string" },
          whyBetter: { type: "string" },
        },
        required: ["question", "improvedAnswer", "whyBetter"],
      },
    },
    disclaimer: { type: "string" },
  },
  required: [
    "overallScore", "clarityScore", "consistencyScore", "confidenceScore",
    "financialReadinessScore", "schoolProgramExplanationScore", "careerPlanScore",
    "homeTiesScore", "documentReadinessScore", "strengths", "weaknesses",
    "redFlagsToImprove", "recommendedPractice", "sampleImprovedAnswers", "disclaimer",
  ],
} as const;

export interface ScoringResult {
  overallScore: number;
  clarityScore: number;
  consistencyScore: number;
  confidenceScore: number;
  financialReadinessScore: number;
  schoolProgramExplanationScore: number;
  careerPlanScore: number;
  homeTiesScore: number;
  documentReadinessScore: number;
  strengths: string[];
  weaknesses: string[];
  redFlagsToImprove: string[];
  recommendedPractice: string[];
  sampleImprovedAnswers: { question: string; improvedAnswer: string; whyBetter: string }[];
  disclaimer: string;
  status: "completed" | "fallback" | "failed";
  errorMessage?: string;
}

function safeScoringFallback(): ScoringResult {
  return {
    overallScore: 60, clarityScore: 60, consistencyScore: 60, confidenceScore: 60,
    financialReadinessScore: 60, schoolProgramExplanationScore: 60, careerPlanScore: 60,
    homeTiesScore: 60, documentReadinessScore: 60,
    strengths: [
      "You completed a full practice run-through, which is a meaningful step on its own.",
      "Your engagement throughout the simulation was consistent.",
    ],
    weaknesses: [
      "Detailed feedback is unavailable for this session — please try again later.",
    ],
    redFlagsToImprove: [],
    recommendedPractice: [
      "Re-run the interview when scoring is back online for tailored feedback.",
      "Practice articulating your post-graduation plans in two crisp sentences.",
      "Rehearse explaining your funding sources from memory without notes.",
    ],
    sampleImprovedAnswers: [],
    disclaimer: VISA_DISCLAIMER,
    status: "fallback",
  };
}

const COMPONENT_SCORE_WEIGHTS = {
  clarityScore: 0.12,
  consistencyScore: 0.15,
  confidenceScore: 0.08,
  financialReadinessScore: 0.15,
  schoolProgramExplanationScore: 0.15,
  careerPlanScore: 0.12,
  homeTiesScore: 0.15,
  documentReadinessScore: 0.08,
} as const;

type ComponentScoreKey = keyof typeof COMPONENT_SCORE_WEIGHTS;

function clampScore(v: any): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (isNaN(n)) return 60;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function requiredScore(value: unknown, key: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Scoring response is missing a valid ${key}`);
  }
  return clampScore(numeric);
}

interface TranscriptPerformance {
  generalScore: number;
  clarityScore: number;
  consistencyScore: number;
  confidenceScore: number;
  categoryScores: Map<string, number>;
  summary: string;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function answerEvidenceScore(answer: string): number {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const lower = answer.toLowerCase();
  const vague = /\b(i don't know|i do not know|not sure|maybe|i guess|nothing much)\b/.test(lower);
  const hasSpecifics = /\b\d[\d,.%$]*\b|\b(usd|dollars?|cedis?|semester|year|years|months?|sponsor|scholarship|loan|salary|company|university|college|program|programme)\b/i.test(answer);
  const explainsReason = /\b(because|so that|which will|this allows|my plan|after graduation|when i return)\b/i.test(answer);
  const depth = Math.min(88, 24 + words.length * 2.2);
  return clampScore(depth + (hasSpecifics ? 9 : 0) + (explainsReason ? 8 : 0) - (vague ? 24 : 0));
}

function buildTranscriptPerformance(transcript: TranscriptTurn[]): TranscriptPerformance {
  const answerScores: number[] = [];
  const categoryAnswerScores = new Map<string, number[]>();
  const answers: string[] = [];
  let currentOfficer: TranscriptTurn | undefined;

  for (const turn of transcript) {
    if (turn.role === "officer") {
      currentOfficer = turn;
      continue;
    }
    if (turn.role !== "student" || !turn.text.trim()) continue;
    const score = answerEvidenceScore(turn.text);
    answers.push(turn.text.trim());
    answerScores.push(score);
    if (currentOfficer?.categoryId) {
      const existing = categoryAnswerScores.get(currentOfficer.categoryId) ?? [];
      existing.push(score);
      categoryAnswerScores.set(currentOfficer.categoryId, existing);
    }
  }

  const normalizedAnswers = answers.map((answer) => answer.toLowerCase().replace(/\s+/g, " "));
  const uniqueRatio = answers.length > 0 ? new Set(normalizedAnswers).size / answers.length : 0;
  const substantiveRatio = answers.length > 0
    ? answers.filter((answer) => answer.split(/\s+/).filter(Boolean).length >= 8).length / answers.length
    : 0;
  const vagueRatio = answers.length > 0
    ? answers.filter((answer) => /\b(i don't know|i do not know|not sure|maybe|i guess|nothing much)\b/i.test(answer)).length / answers.length
    : 0;
  const generalScore = clampScore(average(answerScores) ?? 0);
  const categoryScores = new Map<string, number>();
  for (const [categoryId, scores] of categoryAnswerScores) {
    categoryScores.set(categoryId, clampScore(average(scores) ?? 0));
  }

  return {
    generalScore,
    clarityScore: clampScore(generalScore * 0.75 + substantiveRatio * 25),
    consistencyScore: clampScore(35 + uniqueRatio * 35 + substantiveRatio * 20 - vagueRatio * 20),
    confidenceScore: clampScore(generalScore + substantiveRatio * 10 - vagueRatio * 22),
    categoryScores,
    summary: [
      `${answers.length} answers`,
      `average evidence quality ${generalScore}/100`,
      `${Math.round(substantiveRatio * 100)}% substantive`,
      `${Math.round(vagueRatio * 100)}% vague`,
      `${Math.round(uniqueRatio * 100)}% unique`,
    ].join("; "),
  };
}

function categoryEvidence(
  performance: TranscriptPerformance,
  categoryIds: readonly string[],
): number | null {
  return average(
    categoryIds
      .map((categoryId) => performance.categoryScores.get(categoryId))
      .filter((score): score is number => typeof score === "number"),
  );
}

function blendScore(modelScore: number, evidenceScore: number | null, evidenceWeight: number): number {
  if (evidenceScore === null) return Math.min(modelScore, 65);
  return clampScore(modelScore * (1 - evidenceWeight) + evidenceScore * evidenceWeight);
}

export function calibrateVisaInterviewComponentScores(
  scores: Record<ComponentScoreKey, number>,
  transcript: TranscriptTurn[],
): Record<ComponentScoreKey, number> {
  const studentAnswers = transcript
    .filter((turn) => turn.role === "student")
    .map((turn) => turn.text.trim())
    .filter(Boolean);
  if (studentAnswers.length === 0) {
    return Object.fromEntries(
      Object.keys(scores).map((key) => [key, 0]),
    ) as Record<ComponentScoreKey, number>;
  }

  const wordCounts = studentAnswers.map((answer) => answer.split(/\s+/).filter(Boolean).length);
  const substantiveRatio = wordCounts.filter((count) => count >= 8).length / studentAnswers.length;
  const averageWords = wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length;
  const normalizedAnswers = studentAnswers.map((answer) => answer.toLowerCase().replace(/\s+/g, " "));
  const uniqueAnswerRatio = new Set(normalizedAnswers).size / normalizedAnswers.length;
  const performance = buildTranscriptPerformance(transcript);
  const calibrated = {
    ...scores,
    clarityScore: blendScore(scores.clarityScore, performance.clarityScore, 0.35),
    consistencyScore: blendScore(scores.consistencyScore, performance.consistencyScore, 0.3),
    confidenceScore: blendScore(scores.confidenceScore, performance.confidenceScore, 0.3),
    financialReadinessScore: blendScore(
      scores.financialReadinessScore,
      categoryEvidence(performance, ["finances_and_sponsorship"]),
      0.35,
    ),
    schoolProgramExplanationScore: blendScore(
      scores.schoolProgramExplanationScore,
      categoryEvidence(performance, [
        "study_purpose", "school_choice", "program_fit",
        "city_and_life_awareness", "technical_or_field_specific_questions",
      ]),
      0.35,
    ),
    careerPlanScore: blendScore(
      scores.careerPlanScore,
      categoryEvidence(performance, ["post_study_plans_and_home_ties"]),
      0.3,
    ),
    homeTiesScore: blendScore(
      scores.homeTiesScore,
      categoryEvidence(performance, [
        "post_study_plans_and_home_ties", "ghana_specific_context", "asylum_related_screening",
      ]),
      0.3,
    ),
    documentReadinessScore: blendScore(
      scores.documentReadinessScore,
      categoryEvidence(performance, ["documents_and_process", "integrity_and_consistency"]),
      0.35,
    ),
  };

  const globalCap = studentAnswers.length < 2 ? 45 : studentAnswers.length < 3 ? 58 : 100;
  for (const key of Object.keys(calibrated) as ComponentScoreKey[]) {
    calibrated[key] = Math.min(calibrated[key], globalCap);
  }

  if (substantiveRatio < 0.5 || averageWords < 6) {
    calibrated.clarityScore = Math.min(calibrated.clarityScore, 52);
    calibrated.confidenceScore = Math.min(calibrated.confidenceScore, 50);
  }
  if (uniqueAnswerRatio < 0.7) {
    calibrated.consistencyScore = Math.min(calibrated.consistencyScore, 55);
    calibrated.clarityScore = Math.min(calibrated.clarityScore, 55);
  }
  return calibrated;
}

export function calculateVisaInterviewOverallScore(scores: Record<ComponentScoreKey, number>): number {
  const weighted = (Object.entries(COMPONENT_SCORE_WEIGHTS) as Array<[ComponentScoreKey, number]>)
    .reduce((sum, [key, weight]) => sum + scores[key] * weight, 0);
  return clampScore(weighted);
}

export async function scoreVisaInterview(args: {
  apiKey: string;
  transcript: TranscriptTurn[];
  extractedDocuments?: ExtractedDocument[];
}): Promise<ScoringResult> {
  if (!args.apiKey || args.transcript.length === 0) return safeScoringFallback();

  // Compose a transcript Claude can read
  const transcriptText = args.transcript
    .map((turn) => {
      const metadata = turn.questionId
        ? ` [questionId=${turn.questionId}; category=${turn.categoryId ?? "unknown"}]`
        : "";
      return `${turn.role.toUpperCase()}${metadata}: ${turn.text}`;
    })
    .join("\n");
  const scoringContext = buildQuestionBankScoringContext(args.transcript);
  const scoringDocumentContext = (args.extractedDocuments ?? [])
    .filter((document) => document.status === "completed" && document.summary)
    .map((document) => {
      const fields = Object.entries(document.fields)
        .filter(([, value]) => value !== null && value !== "")
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
      return `- ${document.documentType}: ${document.summary}${fields ? `; ${fields}` : ""}`;
    });
  const studentAnswers = args.transcript.filter((turn) => turn.role === "student");
  const performance = buildTranscriptPerformance(args.transcript);
  const scoringInput = [
    `Transcript metrics: ${studentAnswers.length} student answers.`,
    `Deterministic evidence metrics: ${performance.summary}. Use these as calibration evidence, not as a substitute for reading each answer.`,
    scoringContext,
    scoringDocumentContext.length > 0
      ? `STUDENT-PROVIDED DOCUMENT FACTS FOR CONSISTENCY CHECKING ONLY:\n${scoringDocumentContext.join("\n")}`
      : "",
    "PRACTICE INTERVIEW TRANSCRIPT:",
    transcriptText,
  ].filter(Boolean).join("\n\n");

  try {
    const anthropic = new Anthropic({ apiKey: args.apiKey });
    // Prompt caching (audit 2026-05-15): scoring rubric is static across all
    // interviews — caching the system prompt drops re-process cost to 1/10×
    // for back-to-back scorings within the 5-min TTL. Sonnet's 1024-token
    // minimum is comfortably met.
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1800,
      temperature: 0,
      output_config: {
        format: {
          type: "json_schema",
          schema: SCORING_OUTPUT_SCHEMA,
        },
      },
      system: [
        { type: "text", text: SCORER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: scoringInput }],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("")
      .replace(/^\s*```(?:json)?\s*\n?/im, "")
      .replace(/\n?\s*```\s*$/im, "")
      .trim();
    const parsed = JSON.parse(raw);

    const componentScores = calibrateVisaInterviewComponentScores({
      clarityScore:                  requiredScore(parsed.clarityScore, "clarityScore"),
      consistencyScore:              requiredScore(parsed.consistencyScore, "consistencyScore"),
      confidenceScore:               requiredScore(parsed.confidenceScore, "confidenceScore"),
      financialReadinessScore:       requiredScore(parsed.financialReadinessScore, "financialReadinessScore"),
      schoolProgramExplanationScore: requiredScore(parsed.schoolProgramExplanationScore, "schoolProgramExplanationScore"),
      careerPlanScore:               requiredScore(parsed.careerPlanScore, "careerPlanScore"),
      homeTiesScore:                 requiredScore(parsed.homeTiesScore, "homeTiesScore"),
      documentReadinessScore:        requiredScore(parsed.documentReadinessScore, "documentReadinessScore"),
    }, args.transcript);

    const result: ScoringResult = {
      overallScore:                  calculateVisaInterviewOverallScore(componentScores),
      clarityScore:                  componentScores.clarityScore,
      consistencyScore:              componentScores.consistencyScore,
      confidenceScore:               componentScores.confidenceScore,
      financialReadinessScore:       componentScores.financialReadinessScore,
      schoolProgramExplanationScore: componentScores.schoolProgramExplanationScore,
      careerPlanScore:               componentScores.careerPlanScore,
      homeTiesScore:                 componentScores.homeTiesScore,
      documentReadinessScore:        componentScores.documentReadinessScore,
      strengths:                     Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5).map(String) : [],
      weaknesses:                    Array.isArray(parsed.weaknesses) ? parsed.weaknesses.slice(0, 5).map(String) : [],
      redFlagsToImprove:             Array.isArray(parsed.redFlagsToImprove) ? parsed.redFlagsToImprove.slice(0, 5).map(String) : [],
      recommendedPractice:           Array.isArray(parsed.recommendedPractice) ? parsed.recommendedPractice.slice(0, 5).map(String) : [],
      sampleImprovedAnswers:         Array.isArray(parsed.sampleImprovedAnswers)
        ? parsed.sampleImprovedAnswers.slice(0, 4).map((s: any) => ({
            question:        String(s?.question ?? ""),
            improvedAnswer:  String(s?.improvedAnswer ?? ""),
            whyBetter:       String(s?.whyBetter ?? ""),
          }))
        : [],
      disclaimer: VISA_DISCLAIMER,
      status: "completed",
    };
    return result;
  } catch (err: any) {
    console.error("[visaInterview] Claude scoring error:", err?.message);
    return { ...safeScoringFallback(), status: "failed", errorMessage: err?.message ?? "Unknown" };
  }
}
