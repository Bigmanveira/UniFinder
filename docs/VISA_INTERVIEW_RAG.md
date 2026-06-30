# Visa Interview Question Retrieval

Anna uses `CollegeReady_F1_Visa_Interview_Question_Bank_v2_2026` as a local, versioned retrieval source.

## Runtime flow

1. `visaQuestionRetriever.ts` ranks a small set of approved questions for the current transcript.
2. Brief or risky answers prioritize an approved follow-up from the previous question.
3. Strong answers advance through uncovered core categories: purpose, school, programme, funding, post-study plans, and documents.
4. The retriever returns the exact approved primary question or follow-up; interview turns are never freely generated or paraphrased.
5. Previously used question text is suppressed before the next turn is selected.
6. Pre-interview applicant context changes category ranking only. A previous refusal forces the approved refusal-reason and changed-circumstances follow-ups in order.

No embedding service or vector database is required. The bank is small enough for deterministic in-memory retrieval, which avoids extra latency and infrastructure.

## Document behavior

- Existing I-20, DS-160, and supporting-document extraction remains unchanged.
- Uploaded document facts are available to Anna for consistency checks.
- Uploaded or explicitly skipped I-20/DS-160 requests are treated as resolved and are not selected again.
- An unreadable upload causes verbal clarification, not another upload request.

## Sensitive questions

Harm, mistreatment, and fear-of-return questions are not mandatory. They are retrieved only when the student's recent answer introduces that topic. Safety instructions from the bank are passed with the candidate.

## Scoring

- Question-specific strong-answer signals and red flags are supplied only for questions actually asked.
- Documents are used only to check spoken consistency; uploads do not add points by themselves.
- The final headline score is a deterministic weighted calculation from calibrated sub-scores.
- Claude Haiku returns schema-validated feedback, then transcript evidence metrics calibrate every component so reports cannot collapse to a fixed score.
- Very short, repeated, or incomplete answer sets receive conservative caps.

## Updating the bank

Replace `functions/src/data/visaInterviewQuestionBank.ts`, preserve stable question IDs where possible, update the dataset version, then run:

```bash
cd functions
npm run build
```

Also rerun the retrieval smoke checks for progression, vague-answer follow-up, country localization, sensitive-topic gating, and resolved-document suppression.
