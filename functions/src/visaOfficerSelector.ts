import Anthropic from "@anthropic-ai/sdk";
import * as logger from "firebase-functions/logger";
import type {
  RetrievalTranscriptTurn,
  SelectedVisaQuestion,
  VisaQuestionRetrieval,
} from "./visaQuestionRetriever";

// ─────────────────────────────────────────────────────────────────────────────
// visaOfficerSelector — puts a model in the loop WITHOUT letting it write
// questions.
//
// Interview turns used to be picked purely by the heuristic scorer in
// visaQuestionRetriever (token overlap + category sequence). Nothing in the
// loop actually *understood* the student's answer, which is why the officer
// asked things the student had already covered and changed subject at odd
// moments. The original comment in visaInterview.ts explains why Claude was
// kept out: free-form generation produced out-of-bank and repeated questions.
//
// This is the middle path. Claude is a SELECTOR, not an author:
//   - It receives the transcript plus the retriever's shortlist.
//   - It returns a question ID and an INDEX into that question's approved
//     wording. Both are constrained by a JSON-schema enum, so a hallucinated
//     question cannot be represented in the output, let alone spoken.
//   - Anything unexpected (bad id, out-of-range index, timeout, API error)
//     falls back to the deterministic selector, so the interview degrades to
//     the old behaviour instead of breaking.
//
// The officer brief below is grounded in 9 FAM 402.5-5, which is what real
// consular officers are actually instructed to assess. The "never penalise"
// list matters as much as the rest: the FAM explicitly forbids refusing on
// several grounds that mock-interview tools routinely punish.
// ─────────────────────────────────────────────────────────────────────────────

/** Hard ceiling on the selector call. The student is sitting in a live video
 *  session, so a slow model turn is worse than a merely adequate question —
 *  past this we use the deterministic pick. */
const SELECTOR_TIMEOUT_MS = 8_000;

/** Candidates handed to the model. Beyond this the prompt gets long enough to
 *  cost latency without improving the choice. */
const MAX_CANDIDATES = 6;

const OFFICER_BRIEF = `You are selecting the next question for a simulated U.S. F-1 student visa interview.

You do NOT write questions. You choose one from the approved list you are given.

WHAT A REAL OFFICER IS ASSESSING (9 FAM 402.5-5(C)). Every question exists to test one of:
1. Acceptance at a school (the I-20).
2. Intent to enter solely to pursue a full course of study.
3. PRESENT intent to leave the U.S. at the end of that study.
4. Sufficient funds — readily available for the first year, credible for later years.
5. Preparation for the course of study.

HOW REAL INTERVIEWS RUN. They are short — typically 90 seconds to 3 minutes, 3 to 8 questions total. The officer is terse and transactional, has already read the DS-160 and SEVIS record, and is cross-checking what the student says against that file. Coherent, specific answers make the officer stop asking. Weak answers draw a follow-up.

WHAT TRIGGERS A FOLLOW-UP RATHER THAN A NEW TOPIC:
- A financial figure that does not reconcile (sponsor income vs. balance, a large recent deposit).
- A contradiction with something the student already said.
- A vague, generic, or trailing-off answer.
- An unexplained change of field or school.
- Signs of intent to remain in the U.S.

FUNDING IS THE HEAVIEST AREA. It draws the most follow-ups and is the most common refusal ground. Note that intending to obtain a loan, or planning to fund the first year from CPT/OPT earnings, is explicitly insufficient.

NEVER STEER TOWARD PENALISING THESE — the FAM forbids refusing on them:
- A lesser-known school, or a community-college-then-transfer plan.
- Missing or low test scores, or a low GPA.
- A course of study that looks impractical at home, or one also available at home.
- Simply lacking the strong property/employment ties an older applicant would have. Students are expected to lack those. Assess PRESENT intent only, and do not demand a long-range plan — young applicants are not expected to have one.

SELECTION RULES:
- Pick the single question that a real officer would most plausibly ask next, given what the student just said.
- Never re-ask something the student has already answered. If they already named their school, do not ask which school.
- Judge the last answer yourself before choosing. An answer is THIN if it names no specifics — no figure, employer, role, place, or document — or hedges ("something like that", "business, contracts and things", "we'll see", "I'm not sure"). Length alone does not make an answer strong.
- When the last answer was thin, evasive, inconsistent, or raised one of the follow-up triggers above, and a follow_up candidate on that same topic is offered, PICK IT. Do not move to a new topic while the previous one is still unproven — that is the single most common way a mock interview fails to feel real.
- Only open a new topic when the previous answer actually settled the point.
- Prefer the wording that reads as the tersest, most natural spoken question for this moment.
- Early in the interview, cover purpose, school/programme and funding before secondary topics.

Return only the structured selection.`;

interface CandidateOption {
  questionId: string;
  categoryId: string;
  mode: "new_topic" | "follow_up";
  /** Approved wordings still unused this interview. Index into this array. */
  texts: string[];
  intent: string;
  stage: SelectedVisaQuestion["stage"];
}

/** Normalised comparison so "Why this university?" and "Why this university"
 *  count as the same question having already been asked. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function buildOptions(
  retrieval: VisaQuestionRetrieval,
  transcript: RetrievalTranscriptTurn[],
): CandidateOption[] {
  const askedAlready = new Set(
    transcript.filter((t) => t.role === "officer").map((t) => normalise(t.text)),
  );

  const options: CandidateOption[] = [];
  for (const candidate of retrieval.candidates) {
    const approved = candidate.mode === "follow_up" ? candidate.follow_ups : [candidate.question];
    const texts = approved.filter((t) => t && !askedAlready.has(normalise(t)));
    if (texts.length === 0) continue;
    options.push({
      questionId:  candidate.id,
      categoryId:  candidate.categoryId,
      mode:        candidate.mode,
      texts,
      intent:      candidate.intent,
      stage:       candidate.stage,
    });
    if (options.length >= MAX_CANDIDATES) break;
  }
  return options;
}

function renderTranscript(transcript: RetrievalTranscriptTurn[]): string {
  // Only the tail matters for "what should I ask next", and keeping it short
  // keeps the call fast.
  return transcript
    .slice(-10)
    .map((turn) => `${turn.role === "officer" ? "Officer" : "Student"}: ${turn.text}`)
    .join("\n");
}

function renderOptions(options: CandidateOption[]): string {
  return options
    .map((o, i) =>
      [
        `${i + 1}. id=${o.questionId} | category=${o.categoryId} | mode=${o.mode}`,
        `   tests: ${o.intent}`,
        ...o.texts.map((t, ti) => `   text_index ${ti}: "${t}"`),
      ].join("\n"),
    )
    .join("\n\n");
}

/**
 * Ask Claude which approved question comes next.
 *
 * Returns null on any failure so the caller can fall back to the deterministic
 * selector — this function must never be the reason an interview stalls.
 */
export async function selectQuestionWithClaude(args: {
  apiKey: string | null;
  retrieval: VisaQuestionRetrieval;
  transcript: RetrievalTranscriptTurn[];
  questionCount: number;
}): Promise<SelectedVisaQuestion | null> {
  const { apiKey, retrieval, transcript, questionCount } = args;
  if (!apiKey) return null;

  const options = buildOptions(retrieval, transcript);
  if (options.length === 0) return null;
  // One live option means there is nothing to decide — skip the call and the
  // latency it would cost.
  if (options.length === 1 && options[0].texts.length === 1) {
    const only = options[0];
    return {
      text:       only.texts[0],
      questionId: only.questionId,
      categoryId: only.categoryId,
      stage:      only.stage,
      mode:       only.mode,
    };
  }

  const schema = {
    type: "object",
    properties: {
      question_id: {
        type: "string",
        description: "id of the chosen question, copied exactly from the list",
        enum: options.map((o) => o.questionId),
      },
      text_index: {
        type: "integer",
        description: "index of the chosen wording within that question's text_index list",
      },
      why: {
        type: "string",
        description: "one short sentence on why this follows from the student's last answer",
      },
    },
    required: ["question_id", "text_index", "why"],
    additionalProperties: false,
  } as const;

  // Red flags the retriever matched against the last answer, if any. Surfaced
  // so the model can press on a specific concern rather than guessing.
  const redFlagHint = [
    ...new Set(retrieval.candidates.flatMap((c) => c.matchedRedFlags ?? [])),
  ].slice(0, 4).join(" | ");

  try {
    const anthropic = new Anthropic({ apiKey, timeout: SELECTOR_TIMEOUT_MS });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: OFFICER_BRIEF,
      // Haiku 4.5 keeps the per-turn cost near a tenth of an Opus call, which
      // matters on a per-session margin this thin, and it is faster on a live
      // turn. Picking one id from a shortlist is a bounded task that does not
      // need a frontier model.
      //
      // NOTE: no `effort` here. Haiku 4.5 REJECTS output_config.effort with a
      // 400 (it is an Opus-4.5+/Sonnet-4.6+ parameter), and a 400 would send
      // every turn down the deterministic fallback — silently undoing this
      // whole path. Thinking is likewise omitted, so the model answers
      // directly.
      output_config: {
        format: { type: "json_schema", schema },
      },
      messages: [
        {
          role: "user",
          content:
            `Questions asked so far: ${questionCount}\n` +
            // The retriever's own read of the last answer. It is a crude
            // word-count-plus-hedge-phrase heuristic, so it is passed as a
            // hint rather than a verdict — it misses answers that are long
            // but empty. The model is told above to judge for itself.
            `Retriever flagged the last answer as thin: ${retrieval.lastAnswerWasVague ? "YES" : "no"}\n` +
            (redFlagHint ? `Possible red flags matched in the last answer: ${redFlagHint}\n` : "") +
            `\nTRANSCRIPT (most recent last):\n${renderTranscript(transcript) || "(nothing yet — this is the opening question)"}\n\n` +
            `APPROVED CANDIDATES:\n${renderOptions(options)}\n\n` +
            `Choose the next question.`,
        },
      ],
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;

    const parsed = JSON.parse(block.text) as {
      question_id?: unknown;
      text_index?: unknown;
      why?: unknown;
    };

    const chosen = options.find((o) => o.questionId === parsed.question_id);
    if (!chosen) {
      logger.warn("[visaSelector] model returned an unknown question id", parsed.question_id);
      return null;
    }
    // The schema cannot express a bound on text_index, so bound it here.
    const index = typeof parsed.text_index === "number" ? parsed.text_index : 0;
    const text = chosen.texts[index] ?? chosen.texts[0];

    return {
      text,
      questionId: chosen.questionId,
      categoryId: chosen.categoryId,
      stage:      chosen.stage,
      mode:       chosen.mode,
    };
  } catch (err: unknown) {
    // Timeouts, rate limits, malformed JSON — all handled the same way: let
    // the caller use the deterministic pick rather than stalling the avatar.
    logger.warn(
      "[visaSelector] falling back to deterministic selection:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
