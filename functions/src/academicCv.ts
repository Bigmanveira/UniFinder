// ─────────────────────────────────────────────────────────────────────────────
// Academic CV Studio — three AI tools sharing one generation pipeline:
//
//   review:  user pastes / uploads an existing CV → AI produces a critique
//            + a revamped version that fixes the issues called out.
//   build:   user fills a structured intake (contact, education, research,
//            publications, teaching, skills) → AI produces a polished
//            academic CV from those facts.
//   convert: user pastes / uploads a professional CV → AI restructures it
//            into the academic format (research foregrounded, publications
//            given proper sectioning, teaching surfaced, etc.).
//
// All three return a single Markdown document. The shape is intentionally
// uniform so the frontend's preview / paywall / download surface can
// render any of the three identically — just with a different header.
//
// AI-DETECTION RESISTANCE
// The product promise is "the generated results pass AI check." That means
// the output should not trigger Originality.ai / GPTZero / Turnitin's AI
// detectors. We do not guarantee zero detection — no model can — but we
// engineer for it via:
//
//   1. Style guide baked into the system prompt: terse, factual, no
//      marketing prose, no flowery adjectives, no AI-tell phrases
//      ("delve into", "leverage", "robust", "comprehensive", "passionate
//      about", "I am thrilled to", etc.). Academic CVs in the real world
//      are written by busy researchers in a hurry — they're choppy, dense,
//      sometimes inconsistent between sections. We mimic that.
//   2. High generation temperature (0.9). Detectors look for low-perplexity
//      sequences; higher temp produces more variation. Quality stays high
//      because the document is mostly facts the user provided.
//   3. No "soft" filler sections. Detectors hammer summary blocks because
//      they're prose-heavy. Our CVs are structured around facts; the only
//      prose section is a brief research statement (and we vary its
//      structure deliberately).
//   4. Sonnet 4.5 over Haiku. Sonnet's longer-context structure is better
//      at sustaining a varied voice across the document.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-5";

// Shared anti-AI-detection style guide. Prepended to every mode-specific
// prompt below. Updating this once changes the voice across all three
// tools, which is what we want — the studio should feel like one product,
// not three.
const STYLE_GUIDE = `STYLE & VOICE — read this carefully, it is the most important part of the brief.

You are producing an ACADEMIC CV that must read as written by the candidate themselves — a working researcher in a hurry, not a marketing department. Academic CVs are TERSE, FACTUAL, and a little inconsistent. They are not polished marketing documents.

CONCRETE RULES
- Use varied sentence length. Some bullets are three words ("Taught Algebra II."). Some are a full clause with a date. Don't make every bullet the same length.
- No marketing adjectives. Banned: "passionate", "dedicated", "robust", "comprehensive", "leveraged", "innovative", "results-driven", "synergies", "spearheaded", "facilitated", "stakeholders", "ecosystem". If the word would appear on a corporate consultant's CV, do not use it on an academic one.
- No AI-tell verbs. Banned: "delve", "elevate", "navigate" (as a verb), "embark", "harness", "unlock", "empower", "tapestry", "vibrant", "landscape" (figurative), "realm", "in the world of", "it is important to note".
- No filler transitions. Banned in prose: "Moreover", "Furthermore", "In conclusion", "It should be noted that", "Notably". A real CV doesn't need transitions — bullets stand on their own.
- Use specific concrete facts. "Published 4 peer-reviewed papers in Nature Climate Change" beats "Strong publication record". Numbers and journal names are the soul of an academic CV.
- Vary bullet structure between sections. Education bullets list the program + dates + GPA. Publications use journal house style. Teaching bullets are short fragments. Don't force a uniform "Verb + object + outcome" template.
- Where a research statement is included, keep it ≤ 80 words, use the candidate's "I" voice (or third person if the rest of the CV is that way), and reference at least one specific project, paper, or method by name. Do NOT write generic "my research interests include…" prose.
- Match the candidate's career stage. An undergraduate's CV mentions coursework, undergraduate research, and conference posters. A postdoc's CV foregrounds publications and grants. Do not list "Excellent communication skills" on either.
- Preserve British / American spelling consistently to whichever the input uses. If unclear, default to American.
- Output the CV as plain Markdown — no code fences around the document. Use ## for section headers, **bold** sparingly for emphasis.

WHAT TO AVOID THAT WILL TRIGGER AI DETECTORS
- Perfectly balanced parallel structure across every bullet.
- Em-dashes used to add "polished" subordinate clauses ("She conducted research — driven by a passion for inquiry — that transformed her department").
- Tricolon ("dedicated, driven, and detail-oriented").
- Generic "demonstrated ability to…" / "proven track record of…" stems.
- The exact pattern: [strong verb] + [object] + [resulting in/leading to] + [abstract outcome].

What good academic CVs read like (study these patterns):
- "MIT, PhD Computer Science, 2020–2025. Advisor: Daniela Rus. GPA 4.0."
- "Reviewer for ICML 2024, NeurIPS 2024."
- "Awarded Hertz Fellowship, 2021. ($250k.)"
- "Teaching: 6.034 (Artificial Intelligence), Spring 2023. Average teaching evaluation 4.7/5."`;

// ─────────────────────────────────────────────────────────────────────────────
// Reviewer + Revamper. Two-part output: a structured critique (so the user
// understands what was weak) + a fully rewritten CV (so they can copy
// the improved version straight out). Both in one Markdown document.
// ─────────────────────────────────────────────────────────────────────────────
const REVIEW_PROMPT = `${STYLE_GUIDE}

MODE: REVIEW & REVAMP
The user has pasted (or uploaded the text of) their current academic CV. Produce a single Markdown document with two clearly delimited parts:

## Part 1 — Critique
A short, focused critique of the CV as it stands. Use bullet points. Cover:
- Structure & ordering (what should move, what's missing, what's buried).
- Specificity (where vague language hides what the candidate actually did).
- Section gaps (e.g. no Funding section, no Reviewing service, no Teaching evaluations).
- Style / AI-tells (call out marketing-y phrases and clichés the candidate has used; an academic CV should not sound like a LinkedIn summary).
- Career-stage fit (does the emphasis match where the candidate actually is — junior researcher, postdoc, faculty applicant, etc.).
Aim for 6–12 critique bullets. Be direct, not cruel. Reference SPECIFIC LINES from the input where possible.

## Part 2 — Revamped CV
The same content, rewritten following the style guide above. Preserve every fact the candidate listed (do not invent papers, grants, jobs, or dates). Reorganize, retitle, tighten language, and fill in section headers that are missing. The revamped CV should be SHORTER than the original almost always — academic CVs are dense, not padded. If the input is missing critical sections an academic reviewer would expect (Education, Publications, Research Experience, Teaching, Presentations, Awards, Service), DO add empty headers with a one-line "— (none listed)" placeholder so the candidate sees where the gaps are.

Do not start with a "Dear candidate" greeting or any preamble. Open immediately with "## Part 1 — Critique".`;

// ─────────────────────────────────────────────────────────────────────────────
// Builder. Takes a structured intake (the frontend collects each field
// through a form) and produces a polished academic CV. The intake JSON
// is passed in raw — the prompt teaches the model how to interpret it.
// ─────────────────────────────────────────────────────────────────────────────
const BUILD_PROMPT = `${STYLE_GUIDE}

MODE: BUILDER
The user has answered a structured intake. The input you will receive is a JSON object with these fields (any may be empty or null):
{
  "fullName":        string,
  "email":           string,
  "phone":           string,
  "location":        string,           // City, State/Country
  "websiteOrOrcid":  string,           // URL or ORCID
  "researchInterests": string,         // free-text — used to seed Research Statement
  "education":         [ { degree, field, institution, startYear, endYear, gpa, advisor, thesis } ],
  "researchExperience":[ { role, lab, institution, startYear, endYear, description } ],
  "publications":      [ { type, citation } ],        // type: "journal" | "conference" | "workshop" | "preprint" | "book_chapter"
  "presentations":     [ { title, venue, year, type } ],  // type: "talk" | "poster" | "invited"
  "teaching":          [ { course, institution, role, term } ],   // role: "instructor" | "TA"
  "awards":            [ { name, year, amount } ],
  "service":           [ { role, organization, year } ],
  "skills":            string                            // free-text
}

Produce a complete academic CV in Markdown with these sections, in this order:

1. **Header** — Name as an H1 (# Name). Then a single line with email · phone · location · website (separators: " · "). No "Curriculum Vitae" title.
2. **## Research Statement** — A 60–80 word paragraph derived from researchInterests + the strongest items in researchExperience + publications. Use the candidate's voice, not third person. Reference at least one specific project / paper / method by name. Skip this section ENTIRELY if researchInterests is empty.
3. **## Education** — List in reverse chronological order. Format: "**Degree** in Field, Institution, Year–Year." Then a sub-bullet for GPA, advisor, thesis if any are present.
4. **## Research Experience** — Reverse chronological. Format: "**Role**, Lab name, Institution, Year–Year." Then 1–3 bullet points describing the work (use the description field as a base — TRIM filler, do NOT pad).
5. **## Publications** — Group by type (Journal, Conference, Workshop, Preprint, Book Chapter). Within a group, reverse chronological. Format the citation cleanly using the citation field as-is, but standardize: authors, year in parens, "Title", Journal, vol(issue), pages.
6. **## Presentations** — Mix invited talks, contributed talks, posters. Format: Title. Venue, Year. (poster|invited).
7. **## Teaching** — Reverse chronological. Format: "Course code/name, role, Institution, term." One line per entry.
8. **## Awards & Honors** — Reverse chronological. Format: "Award name, year. (amount, if any)."
9. **## Service** — Reverse chronological. Format: "Role, Organization, year."
10. **## Skills** — One line, comma-separated. Group programming / methods / languages / lab techniques as appropriate from the free-text skills field.

If a section's input array is empty, OMIT that section entirely (do not write "(none)"). Exception: Education must always render even if empty (write "— (please add)") because a CV without it makes no sense.

Open immediately with "# {fullName}". No preamble.`;

// ─────────────────────────────────────────────────────────────────────────────
// Converter. Takes a "professional" CV (industry / corporate format) and
// restructures it into the academic format. The challenge: industry CVs
// foreground impact + metrics; academic CVs foreground publications +
// research. Many translations are not 1:1 — the model has to interpret.
// ─────────────────────────────────────────────────────────────────────────────
const CONVERT_PROMPT = `${STYLE_GUIDE}

MODE: PROFESSIONAL → ACADEMIC CONVERTER
The user has pasted (or uploaded the text of) their professional CV — formatted for industry roles. Restructure it into a proper academic CV.

What to do with each kind of input:

- **Education** — usually fine as-is; tighten formatting. Add advisor / thesis if mentioned in any role description.
- **Professional experience** — re-frame the technical / research portions as "Research Experience" or "Industry Research". Strip outcome-focused language ("drove $2M revenue") and keep what's actually intellectually substantive (what was built, what method, what dataset, what publication if any).
- **Skills** — keep but de-emphasize. Move below research output.
- **Achievements / Awards** — keep, format as the standard academic Awards section.
- **Side projects / OSS** — fold into Research Experience or a new Projects section if research-adjacent. Drop the rest.
- **Publications, patents, talks** — promote prominently. These are the highest-value items for an academic reader; surface them no matter how buried in the source CV.

What to discard:
- Sales pitches in the summary / objective.
- Marketing language ("results-driven, customer-obsessed").
- Quantified business outcomes that aren't relevant to research ("reduced churn 14%").
- Made-up "soft skills" sections.

Preserve every concrete fact (job titles, dates, companies, projects). DO NOT invent publications, advisors, or grants the candidate did not mention. If the input is genuinely missing research output (publications, presentations) leave those sections OUT — do not fabricate. After the CV, append a single italicised line at the very bottom: "*Note: The following academic sections were absent in your source CV: [list]. Consider adding them before applying to academic positions.*" Only include that line if there are real gaps.

Open immediately with the H1 header — no preamble.`;

export type AcademicCvMode = "review" | "build" | "convert";

const PROMPTS: Record<AcademicCvMode, string> = {
  review:  REVIEW_PROMPT,
  build:   BUILD_PROMPT,
  convert: CONVERT_PROMPT,
};

const USER_FRAMING: Record<AcademicCvMode, (input: string) => string> = {
  review:  (input) => `INPUT — the candidate's existing academic CV:\n\n${input}\n\nProduce the critique + revamped CV now.`,
  build:   (input) => `INPUT — structured intake JSON:\n\n${input}\n\nProduce the academic CV now.`,
  convert: (input) => `INPUT — the candidate's professional CV:\n\n${input}\n\nProduce the converted academic CV now.`,
};

export interface AcademicCvGenerationResult {
  /** The full generated CV in Markdown. Stored server-side; only the
   *  preview slice is returned to the client until payment unlocks the
   *  full document. */
  fullMarkdown: string;
  /** The first ~30% slice of the document — returned to the client for
   *  the free preview. Computed via headingPreviewSlice() so it always
   *  ends on a clean section boundary. */
  previewMarkdown: string;
  /** "completed" if Claude returned a non-empty document; "failed" otherwise. */
  status: "completed" | "failed";
  errorMessage?: string;
}

/**
 * Slice the generated document at the first section boundary past 30% of
 * the body. We don't want the preview to cut mid-bullet — it should end
 * on a header so the paywall card visually replaces what would have been
 * the next section.
 */
export function headingPreviewSlice(full: string): string {
  if (!full) return "";
  const target = Math.floor(full.length * 0.30);
  // Find the first H2 header (`\n## `) that starts AT OR AFTER the 30% mark.
  // If none exists, fall back to the 30% character offset on a newline.
  const headerRe = /\n## /g;
  let match: RegExpExecArray | null;
  let lastBefore = -1;
  while ((match = headerRe.exec(full)) !== null) {
    if (match.index >= target) {
      // Slice up to but NOT including this header — that's where the
      // paywall fades in.
      return full.slice(0, match.index).trimEnd();
    }
    lastBefore = match.index;
  }
  // No header after 30%. Fall back to header-just-before-30% so we never
  // return more than ~half the document as preview.
  if (lastBefore > 0) return full.slice(0, lastBefore).trimEnd();
  // No structure at all — fall back to a hard newline cut.
  const nlIdx = full.indexOf("\n", target);
  return (nlIdx === -1 ? full.slice(0, target) : full.slice(0, nlIdx)).trimEnd();
}

/**
 * Single entry-point. The caller (Cloud Function) passes the mode + the
 * raw input string (paste-text, OCR'd PDF text, or builder JSON). We
 * return the full + preview Markdown.
 */
export async function generateAcademicCv(args: {
  apiKey: string;
  mode:   AcademicCvMode;
  input:  string;
}): Promise<AcademicCvGenerationResult> {
  const { apiKey, mode, input } = args;
  if (!apiKey) {
    return { fullMarkdown: "", previewMarkdown: "", status: "failed", errorMessage: "Missing API key." };
  }
  if (!input || !input.trim()) {
    return { fullMarkdown: "", previewMarkdown: "", status: "failed", errorMessage: "Empty input." };
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    // Temperature is deliberately HIGH (0.9). Standard CV generation tasks
    // use 0.3-0.5, which produces clean but detectably uniform output.
    // Detectors specifically flag low-perplexity sequences — bumping temp
    // restores burstiness. Quality stays acceptable because the facts
    // are user-supplied (the model is formatting + paraphrasing, not
    // inventing).
    const response = await anthropic.messages.create({
      model:       MODEL,
      max_tokens:  4096,
      temperature: 0.9,
      system: [
        { type: "text", text: PROMPTS[mode], cache_control: { type: "ephemeral" } },
      ],
      messages: [
        { role: "user", content: USER_FRAMING[mode](input.slice(0, 30_000)) },
      ],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("")
      .trim();

    if (!raw) {
      return { fullMarkdown: "", previewMarkdown: "", status: "failed", errorMessage: "Empty model response." };
    }

    // Strip any stray Markdown code fence around the whole document. The
    // prompt tells the model not to wrap it in fences but it occasionally
    // does anyway.
    const cleaned = raw
      .replace(/^\s*```(?:markdown|md)?\s*\n/i, "")
      .replace(/\n\s*```\s*$/i, "")
      .trim();

    return {
      fullMarkdown:    cleaned,
      previewMarkdown: headingPreviewSlice(cleaned),
      status:          "completed",
    };
  } catch (err: any) {
    console.error("[academicCv] Claude generation error:", err?.message);
    return {
      fullMarkdown:    "",
      previewMarkdown: "",
      status:          "failed",
      errorMessage:    err?.message ?? "Unknown",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF text extraction. Reviewer + Converter both accept PDF uploads; we
// run them through Claude vision and pull out the raw text. Builder uses
// a structured form so it doesn't need this path.
// ─────────────────────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM_PROMPT = `You are an OCR assistant. The user will show you a PDF or image of a CV / resume. Extract ALL of the text from the document, preserving section structure as best you can. Output plain text only — no commentary, no JSON, no markdown fences. Use line breaks to separate sections. Do not invent content. Do not summarize. Do not skip anything. If a part is illegible, write "[illegible]" in place.`;

export interface CvExtractionResult {
  text:     string;
  status:   "completed" | "failed";
  errorMessage?: string;
}

export async function extractCvText(args: {
  apiKey:    string;
  /** Base64-encoded file data, no `data:` prefix. */
  fileBase64: string;
  /** MIME type — application/pdf, image/jpeg, image/png, image/webp. */
  mediaType:  string;
}): Promise<CvExtractionResult> {
  const { apiKey, fileBase64, mediaType } = args;
  if (!apiKey) {
    return { text: "", status: "failed", errorMessage: "Missing API key." };
  }
  // Claude vision accepts image/* and application/pdf (the PDF beta).
  // Anything else we refuse here rather than burning a tool call.
  const SUPPORTED = new Set([
    "application/pdf",
    "image/jpeg", "image/png", "image/webp", "image/gif",
  ]);
  if (!SUPPORTED.has(mediaType)) {
    return { text: "", status: "failed", errorMessage: `Unsupported file type: ${mediaType}` };
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const sourceBlock = mediaType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: fileBase64 } }
      : { type: "image"    as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: fileBase64 } };
    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      // Lower temp for OCR — we want fidelity, not creativity.
      temperature: 0.1,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            sourceBlock as any,
            { type: "text", text: "Extract the text from this CV." },
          ],
        },
      ],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("")
      .trim();
    if (!text) {
      return { text: "", status: "failed", errorMessage: "No text extracted from file." };
    }
    return { text, status: "completed" };
  } catch (err: any) {
    console.error("[academicCv] extraction error:", err?.message);
    return { text: "", status: "failed", errorMessage: err?.message ?? "Unknown" };
  }
}
