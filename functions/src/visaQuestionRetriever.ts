import { VISA_INTERVIEW_QUESTION_BANK } from "./data/visaInterviewQuestionBank.js";
import type { ExtractedDocument, VisaDocumentType } from "./visaDocExtractor.js";

export type VisaOfficerStage =
  | "introduction"
  | "study_plan"
  | "school_choice"
  | "finances"
  | "career_plan"
  | "home_ties"
  | "documents"
  | "wrap_up";

export interface QuestionBankQuestion {
  id: string;
  question: string;
  intent: string;
  follow_ups: readonly string[];
  good_answer_signals: readonly string[];
  red_flags: readonly string[];
  safety_instruction?: string;
}

interface QuestionBankCategory {
  category_id: string;
  category_label: string;
  description: string;
  usage_policy?: string;
  questions: readonly QuestionBankQuestion[];
}

export interface RetrievalTranscriptTurn {
  role: "officer" | "student" | "system";
  text: string;
  stage?: string;
  questionId?: string;
  categoryId?: string;
}

export interface RetrievedVisaQuestion extends QuestionBankQuestion {
  categoryId: string;
  categoryLabel: string;
  categoryDescription: string;
  usagePolicy?: string;
  stage: VisaOfficerStage;
  mode: "new_topic" | "follow_up";
  reason: string;
  score: number;
  matchedRedFlags: string[];
}

export interface VisaQuestionRetrieval {
  candidates: RetrievedVisaQuestion[];
  coveredCategoryIds: string[];
  lastAnswerWasVague: boolean;
  sensitiveTopicTriggered: boolean;
}

interface FlatQuestion extends QuestionBankQuestion {
  categoryId: string;
  categoryLabel: string;
  categoryDescription: string;
  usagePolicy?: string;
  stage: VisaOfficerStage;
  categoryOrder: number;
}

const CATEGORY_STAGE: Record<string, VisaOfficerStage> = {
  study_purpose: "study_plan",
  school_choice: "school_choice",
  program_fit: "study_plan",
  finances_and_sponsorship: "finances",
  documents_and_process: "documents",
  post_study_plans_and_home_ties: "home_ties",
  travel_history_and_refusals: "home_ties",
  ghana_specific_context: "home_ties",
  city_and_life_awareness: "school_choice",
  technical_or_field_specific_questions: "study_plan",
  asylum_related_screening: "home_ties",
  integrity_and_consistency: "home_ties",
};

const CATEGORY_SEQUENCE = [
  "study_purpose",
  "school_choice",
  "program_fit",
  "finances_and_sponsorship",
  "post_study_plans_and_home_ties",
  "documents_and_process",
  "integrity_and_consistency",
] as const;

const INITIAL_QUESTION_IDS = [
  "study_purpose_001",
  "school_choice_001",
  "program_fit_001",
] as const;

const STOP_WORDS = new Set([
  "a", "about", "after", "all", "also", "am", "an", "and", "are", "as", "at",
  "be", "because", "been", "before", "being", "but", "by", "can", "could", "did",
  "do", "does", "for", "from", "had", "has", "have", "how", "i", "if", "in",
  "is", "it", "its", "me", "my", "of", "on", "or", "our", "so", "that", "the",
  "their", "them", "there", "they", "this", "to", "us", "was", "we", "were",
  "what", "when", "where", "which", "who", "why", "will", "with", "would", "you",
  "your",
]);

const categories = VISA_INTERVIEW_QUESTION_BANK.categories as readonly QuestionBankCategory[];

export const VISA_QUESTION_BANK_INFO = {
  name: VISA_INTERVIEW_QUESTION_BANK.rag_dataset_name,
  version: VISA_INTERVIEW_QUESTION_BANK.version,
  lastUpdated: VISA_INTERVIEW_QUESTION_BANK.last_updated,
} as const;

const questions: FlatQuestion[] = categories.flatMap((category) =>
  category.questions.map((question, categoryOrder) => ({
    ...question,
    categoryId: category.category_id,
    categoryLabel: category.category_label,
    categoryDescription: category.description,
    usagePolicy: category.usage_policy,
    stage: CATEGORY_STAGE[category.category_id] ?? "study_plan",
    categoryOrder,
  })),
);

const questionsById = new Map(questions.map((question) => [question.id, question]));

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.replace(/^'+|'+$/g, ""))
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / Math.sqrt(leftTokens.size * rightTokens.size);
}

function sharedTokenCount(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared;
}

function questionSearchText(question: QuestionBankQuestion): string {
  return [
    question.question,
    question.intent,
    ...question.follow_ups,
    ...question.good_answer_signals,
    ...question.red_flags,
  ].join(" ");
}

function findQuestionForTurn(turn: RetrievalTranscriptTurn): FlatQuestion | undefined {
  if (turn.questionId) {
    const exact = questionsById.get(turn.questionId);
    if (exact) return exact;
  }
  if (turn.role !== "officer" || !turn.text.trim()) return undefined;

  let bestQuestion: FlatQuestion | undefined;
  let bestScore = 0;
  for (const question of questions) {
    const score = Math.max(
      tokenOverlap(turn.text, question.question),
      ...question.follow_ups.map((followUp) => tokenOverlap(turn.text, followUp)),
    );
    if (score > bestScore) {
      bestQuestion = question;
      bestScore = score;
    }
  }
  return bestScore >= 0.42 ? bestQuestion : undefined;
}

function matchedLines(
  answer: string,
  lines: readonly string[],
  threshold: number,
  minimumSharedTokens = 2,
): string[] {
  return lines
    .map((line) => ({
      line,
      score: tokenOverlap(answer, line),
      shared: sharedTokenCount(answer, line),
    }))
    .filter(({ score, shared }) => score >= threshold && shared >= minimumSharedTokens)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ line }) => line);
}

function hasGhanaContext(transcript: RetrievalTranscriptTurn[], documents: ExtractedDocument[]): boolean {
  const documentText = documents
    .map((document) => `${document.summary} ${Object.values(document.fields).join(" ")}`)
    .join(" ");
  const transcriptText = transcript.map((turn) => turn.text).join(" ");
  return /\b(ghana|ghanaian|accra|kumasi|tema|takoradi|tamale|cedi|ghs)\b/i.test(
    `${transcriptText} ${documentText}`,
  );
}

function hasSensitiveTopicTrigger(transcript: RetrievalTranscriptTurn[]): boolean {
  const recentStudentText = transcript
    .filter((turn) => turn.role === "student")
    .slice(-3)
    .map((turn) => turn.text)
    .join(" ");
  return /\b(asylum|persecut|mistreat|fear(?:ful)?|unsafe|harm(?:ed)?|cannot return|can't return|unable to return|refugee)\b/i.test(
    recentStudentText,
  );
}

function documentCategoryBoost(question: FlatQuestion, documents: ExtractedDocument[]): number {
  const documentTypes = new Set(documents.map((document) => document.documentType));
  if (question.categoryId === "documents_and_process" && documentTypes.size > 0) return 16;
  if (
    question.categoryId === "finances_and_sponsorship" &&
    ["bank_statement", "sponsor_letter", "employment_letter"].some((type) => documentTypes.has(type as ExtractedDocument["documentType"]))
  ) return 18;
  if (
    ["school_choice", "program_fit", "study_purpose"].includes(question.categoryId) &&
    documentTypes.has("i20")
  ) return 12;
  return 0;
}

function toRetrievedQuestion(
  question: FlatQuestion,
  mode: RetrievedVisaQuestion["mode"],
  reason: string,
  score: number,
  matchedRedFlags: string[] = [],
  useGenericHomeCountry = false,
): RetrievedVisaQuestion {
  if (!useGenericHomeCountry) {
    return { ...question, mode, reason, score, matchedRedFlags };
  }
  const localize = (value: string) => value
    .replace(/\bGhanaian\b/gi, "home-country")
    .replace(/\bGhana\b/gi, "your home country");
  return {
    ...question,
    question: localize(question.question),
    intent: localize(question.intent),
    follow_ups: question.follow_ups.map(localize),
    good_answer_signals: question.good_answer_signals.map(localize),
    red_flags: question.red_flags.map(localize),
    safety_instruction: question.safety_instruction
      ? localize(question.safety_instruction)
      : undefined,
    mode,
    reason,
    score,
    matchedRedFlags: matchedRedFlags.map(localize),
  };
}

export function pickInitialVisaQuestion(): RetrievedVisaQuestion {
  const selectedId = INITIAL_QUESTION_IDS[Math.floor(Math.random() * INITIAL_QUESTION_IDS.length)];
  const question = questionsById.get(selectedId) ?? questions[0];
  return toRetrievedQuestion(question, "new_topic", "approved opening question", 100, [], true);
}

export function retrieveVisaQuestions(args: {
  transcript: RetrievalTranscriptTurn[];
  extractedDocuments?: ExtractedDocument[];
  resolvedDocumentTypes?: readonly VisaDocumentType[];
  questionCount: number;
  limit?: number;
}): VisaQuestionRetrieval {
  const { transcript, questionCount, limit = 4 } = args;
  const extractedDocuments = args.extractedDocuments ?? [];
  const resolvedDocumentTypes = new Set<VisaDocumentType>([
    ...extractedDocuments.map((document) => document.documentType),
    ...(args.resolvedDocumentTypes ?? []),
  ]);
  const completedDocumentTypes = new Set(
    extractedDocuments
      .filter((document) => document.status === "completed")
      .map((document) => document.documentType),
  );
  const askedQuestionIds = new Set<string>();
  const coveredCategoryIds = new Set<string>();

  for (const turn of transcript) {
    const matchedQuestion = findQuestionForTurn(turn);
    if (matchedQuestion) {
      askedQuestionIds.add(matchedQuestion.id);
      coveredCategoryIds.add(matchedQuestion.categoryId);
    } else if (turn.categoryId) {
      coveredCategoryIds.add(turn.categoryId);
    }
  }

  const lastStudentIndex = transcript.map((turn) => turn.role).lastIndexOf("student");
  const lastStudentTurn = lastStudentIndex >= 0 ? transcript[lastStudentIndex] : undefined;
  const previousOfficerTurn = lastStudentIndex > 0
    ? [...transcript.slice(0, lastStudentIndex)].reverse().find((turn) => turn.role === "officer")
    : undefined;
  const previousQuestion = previousOfficerTurn ? findQuestionForTurn(previousOfficerTurn) : undefined;
  const lastAnswer = lastStudentTurn?.text.trim() ?? "";
  const lastAnswerWords = normalizeText(lastAnswer).split(" ").filter(Boolean);
  const lastAnswerWasVague = lastAnswerWords.length > 0 && (
    lastAnswerWords.length < 8 ||
    /\b(i don't know|i do not know|not sure|maybe|i guess|nothing much|yes|no)\b/i.test(lastAnswer)
  );
  const sensitiveTopicTriggered = hasSensitiveTopicTrigger(transcript);
  const ghanaContext = hasGhanaContext(transcript, extractedDocuments);

  const candidates: RetrievedVisaQuestion[] = [];
  if (previousQuestion && lastAnswer) {
    const explicitRiskLanguage = /\b((main|primary) reason.{0,24}(work|live|stay)|(?:stay|remain|live).{0,24}(permanent|forever)|(?:do not|don't|cannot|can't|won't).{0,18}(return|go back)|borrowed.{0,18}(funds|money|bank statement))\b/i.test(lastAnswer);
    const redFlags = matchedLines(
      lastAnswer,
      previousQuestion.red_flags,
      explicitRiskLanguage ? 0.08 : 0.14,
      explicitRiskLanguage ? 1 : 2,
    );
    if (lastAnswerWasVague || redFlags.length > 0) {
      candidates.push(toRetrievedQuestion(
        previousQuestion,
        "follow_up",
        lastAnswerWasVague
          ? "clarify the student's brief or vague answer"
          : "probe a possible inconsistency or risk in the student's answer",
        180 + redFlags.length * 20,
        redFlags,
        !ghanaContext,
      ));
    }
  }

  const nextUncoveredCategory = CATEGORY_SEQUENCE.find((categoryId) => !coveredCategoryIds.has(categoryId));
  const recentContext = transcript.slice(-4).map((turn) => turn.text).join(" ");

  const rankedNewQuestions = questions
    .filter((question) => !askedQuestionIds.has(question.id))
    .filter((question) => {
      if (question.id === "documents_001" && resolvedDocumentTypes.has("i20")) return false;
      if (question.id === "documents_004" && resolvedDocumentTypes.has("ds160_confirmation")) return false;
      if (question.id === "documents_003" && completedDocumentTypes.has("i20")) return false;
      if (question.id === "school_choice_001" && completedDocumentTypes.has("i20")) return false;
      if (question.id === "program_fit_001" && completedDocumentTypes.has("i20")) return false;
      return true;
    })
    .filter((question) => question.categoryId !== "ghana_specific_context" || ghanaContext)
    .filter((question) => question.categoryId !== "asylum_related_screening" || sensitiveTopicTriggered)
    .map((question) => {
      let score = 10;
      if (question.categoryId === nextUncoveredCategory) score += 90;
      score += Math.max(0, 14 - question.categoryOrder * 3);
      const sequenceIndex = CATEGORY_SEQUENCE.indexOf(question.categoryId as typeof CATEGORY_SEQUENCE[number]);
      if (sequenceIndex >= 0) score += Math.max(0, 28 - sequenceIndex * 3);
      score += tokenOverlap(recentContext, questionSearchText(question)) * 34;
      score += documentCategoryBoost(question, extractedDocuments);
      if (question.categoryId === "integrity_and_consistency" && questionCount >= 4) score += 18;
      if (question.categoryId === "travel_history_and_refusals" && questionCount >= 4) score += 10;
      if (question.categoryId === "technical_or_field_specific_questions" && questionCount >= 2) score += 8;
      if (question.categoryId === "city_and_life_awareness" && questionCount >= 2) score += 6;
      return toRetrievedQuestion(
        question,
        "new_topic",
        question.categoryId === nextUncoveredCategory
          ? "advance to the next important area not yet covered"
          : "relevant approved question for the current interview context",
        score,
        [],
        !ghanaContext,
      );
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  for (const question of rankedNewQuestions) {
    if (candidates.length >= limit) break;
    if (candidates.some((candidate) => candidate.id === question.id)) continue;
    candidates.push(question);
  }

  if (candidates.length === 0) {
    const fallback = questionsById.get("integrity_003") ?? questions[0];
    candidates.push(toRetrievedQuestion(fallback, "new_topic", "safe closing-area fallback", 1, [], !ghanaContext));
  }

  return {
    candidates,
    coveredCategoryIds: [...coveredCategoryIds],
    lastAnswerWasVague,
    sensitiveTopicTriggered,
  };
}

export function formatRetrievedQuestionsForOfficer(retrieval: VisaQuestionRetrieval): string {
  const lines = [
    "",
    "APPROVED QUESTION-BANK RETRIEVAL (ground the next turn in exactly one candidate below):",
    `Covered categories: ${retrieval.coveredCategoryIds.join(", ") || "none yet"}.`,
    retrieval.lastAnswerWasVague
      ? "The last answer was brief or vague. Prefer the follow-up candidate if one is present."
      : "Use the highest-ranked candidate that naturally follows the student's answer.",
  ];

  retrieval.candidates.forEach((candidate, index) => {
    lines.push(
      `\n${index + 1}. [${candidate.id}] category=${candidate.categoryId}; stage=${candidate.stage}; mode=${candidate.mode}`,
      `   Primary: ${candidate.question}`,
      `   Intent: ${candidate.intent}`,
      `   Approved follow-ups: ${candidate.follow_ups.join(" | ")}`,
      `   Good-answer evidence: ${candidate.good_answer_signals.join(" | ")}`,
      `   Red flags: ${candidate.red_flags.join(" | ")}`,
      `   Selection reason: ${candidate.reason}`,
    );
    if (candidate.matchedRedFlags.length > 0) {
      lines.push(`   Possible matched red flags: ${candidate.matchedRedFlags.join(" | ")}`);
    }
    if (candidate.safety_instruction) {
      lines.push(`   Safety instruction: ${candidate.safety_instruction}`);
    }
  });

  lines.push(
    "\nQUESTION-BANK RULES:",
    "- Ask one concise question only.",
    "- For mode=follow_up, use one approved follow-up or a close paraphrase tied to what the student actually said.",
    "- For mode=new_topic, use the primary question or a close paraphrase; do not invent a factual premise.",
    "- Return sourceQuestionId exactly as one candidate ID. Document cross-checks may use document_cross_check; the prior-refusal change question may use returning_applicant_change.",
    "- If closing the interview, sourceQuestionId may be null.",
  );
  return lines.join("\n");
}

export function buildQuestionBankScoringContext(transcript: RetrievalTranscriptTurn[]): string {
  const selected = new Map<string, FlatQuestion>();
  for (const turn of transcript) {
    if (turn.role !== "officer") continue;
    const question = findQuestionForTurn(turn);
    if (question) selected.set(question.id, question);
  }
  if (selected.size === 0) return "";

  const lines = [
    "QUESTION-SPECIFIC SCORING EVIDENCE FROM THE APPROVED BANK:",
    "Use these criteria only for the corresponding questions that were actually asked.",
  ];
  for (const question of selected.values()) {
    lines.push(
      `- [${question.id}] ${question.question}`,
      `  Intent: ${question.intent}`,
      `  Strong-answer signals: ${question.good_answer_signals.join(" | ")}`,
      `  Red flags: ${question.red_flags.join(" | ")}`,
    );
  }
  return lines.join("\n");
}
