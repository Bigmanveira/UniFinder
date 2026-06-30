// ─────────────────────────────────────────────────────────────────────────────
// Visa-document field extraction.
//
// When a student uploads their I-20, DS-160 page, or any supporting doc
// during the interview, we run it through Claude vision and pull out the
// key facts (school name, sponsor, cost of attendance, account balance,
// employment dates, etc.). Those facts get stored on the session and
// injected into Anna's system prompt on every subsequent turn so she
// stops asking the student to recite numbers that are already on the
// document in front of her.
//
// The scoring pass uses extracted fields only to cross-check consistency
// with spoken answers. Uploading a document never adds points by itself,
// and an unreadable document never subtracts points by itself.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

export type VisaDocumentType =
  | "i20"
  | "ds160_confirmation"
  | "bank_statement"
  | "employment_letter"
  | "sponsor_letter"
  | "transcript";

const DOC_PROMPTS: Record<VisaDocumentType, string> = {
  i20:
    "This is a U.S. Form I-20 (student visa eligibility certificate). " +
    "Extract the student's full name, SEVIS ID, school name, school program/major, " +
    "program start and end dates, total cost of attendance per year (tuition + living), " +
    "primary funding source(s) listed in the financials section, and the student's " +
    "country of citizenship.",
  ds160_confirmation:
    "This is a DS-160 confirmation page. Extract the application ID/barcode, " +
    "the student's full name, the U.S. embassy/consulate where they will interview, " +
    "and the visa class (should be F-1).",
  bank_statement:
    "This is a bank statement. Extract the account holder name, bank name, account " +
    "type, statement period, average balance, and ending balance. Note the currency.",
  employment_letter:
    "This is an employment letter or contract for the student or a sponsor. Extract " +
    "the employee/sponsor name, employer name, position/title, employment start date, " +
    "and stated annual salary if present.",
  sponsor_letter:
    "This is a sponsor letter or financial affidavit. Extract the sponsor's full name, " +
    "their relationship to the student, their stated occupation/income, and the amount " +
    "they have committed to support.",
  transcript:
    "This is an academic transcript. Extract the student's name, the institution, " +
    "the degree/programme, the GPA or class rank if stated, and the graduation date.",
};

export interface ExtractedDocument {
  documentType: VisaDocumentType;
  /** Free-form key→value JSON of fields Claude pulled out of the document. */
  fields: Record<string, string | number | null>;
  /**
   * One-paragraph summary Claude wrote for itself. Going into Anna's prompt
   * so she has a quick "what does the file say" context without us having
   * to format every field.
   */
  summary: string;
  /** "completed" if Claude returned valid JSON; "failed" otherwise. */
  status: "completed" | "failed";
  errorMessage?: string;
}

const SYSTEM_PROMPT = `You are an OCR/extraction assistant. You will be shown a U.S. visa-related document and asked to pull specific fields out of it. Output ONLY valid JSON with this exact shape, no markdown fences, no extra prose:

{
  "fields": { "<fieldName>": "<value or null>" },
  "summary": "One paragraph (≤ 80 words) summarizing what the document says about the student. Plain prose."
}

If a requested field isn't present in the document, set its value to null. Do not guess. Numbers can be returned as numbers or strings as they appear; preserve currency symbols if shown.`;

const SUPPORTED_IMAGE_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export async function extractVisaDocument(args: {
  apiKey:        string;
  documentType:  VisaDocumentType;
  fileBytes:     Buffer;
  contentType:   string;
}): Promise<ExtractedDocument> {
  const { apiKey, documentType, fileBytes, contentType } = args;
  if (!apiKey) {
    return { documentType, fields: {}, summary: "", status: "failed", errorMessage: "ANTHROPIC_API_KEY missing" };
  }

  const base64 = fileBytes.toString("base64");
  const isPdf  = contentType === "application/pdf";
  const isImg  = SUPPORTED_IMAGE_MEDIA.has(contentType);
  if (!isPdf && !isImg) {
    return {
      documentType, fields: {}, summary: "",
      status: "failed",
      errorMessage: `Unsupported content-type ${contentType} for vision extraction`,
    };
  }

  const docBlock: any = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image",    source: { type: "base64", media_type: contentType,         data: base64 } };

  try {
    const anthropic = new Anthropic({ apiKey });
    // Prompt caching (audit 2026-05-15): system prompt is fully static.
    // SYSTEM_PROMPT alone is below Sonnet's 1024-token minimum so the
    // cache_control is a no-op today, but it's the right pattern as the
    // prompt grows. The document bytes themselves are dynamic and can't be
    // cached anyway.
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 700,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            docBlock,
            { type: "text", text: DOC_PROMPTS[documentType] },
          ],
        },
      ],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("")
      .trim()
      .replace(/^\s*```(?:json)?\s*\n?/im, "")
      .replace(/\n?\s*```\s*$/im, "")
      .trim();

    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch (e: any) {
      return {
        documentType, fields: {}, summary: "",
        status: "failed",
        errorMessage: `JSON parse error: ${e?.message}`,
      };
    }

    const fields: Record<string, string | number | null> = {};
    if (parsed.fields && typeof parsed.fields === "object") {
      for (const [k, v] of Object.entries(parsed.fields)) {
        if (v === null) fields[k] = null;
        else if (typeof v === "number" || typeof v === "string") fields[k] = v;
        else fields[k] = String(v);
      }
    }
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

    return { documentType, fields, summary, status: "completed" };
  } catch (err: any) {
    console.error("[visaDocExtractor] Claude error:", err?.message);
    return {
      documentType, fields: {}, summary: "",
      status: "failed",
      errorMessage: err?.message ?? "Unknown extraction error",
    };
  }
}

/**
 * Format extracted documents as a system-prompt addendum so Anna can read
 * them at every turn. Compact — Claude doesn't need the field labels we use
 * to be human-pretty.
 */
export function formatDocumentsForOfficer(docs: ExtractedDocument[]): string {
  if (docs.length === 0) return "";
  const lines: string[] = [
    "",
    "STUDENT-PROVIDED DOCUMENTS (the student has already uploaded these — do NOT ask them to upload any of these document types again, even if extraction was imperfect):",
  ];
  for (const d of docs) {
    if (d.status === "completed" && d.summary) {
      lines.push(`- ${d.documentType}: ${d.summary}`);
      const fieldEntries = Object.entries(d.fields).filter(([, v]) => v !== null && v !== "");
      if (fieldEntries.length > 0) {
        const compact = fieldEntries.map(([k, v]) => `${k}=${v}`).join("; ");
        lines.push(`  fields: ${compact}`);
      }
    } else {
      // Failed extraction: the student DID try to upload this, but the file
      // wasn't readable (wrong document, blurry photo, etc.). We tell Anna
      // explicitly so she doesn't re-request the upload — she probes verbally
      // instead, e.g. "What's the SEVIS ID on your I-20?" rather than
      // "Could you upload your I-20?"
      lines.push(`- ${d.documentType}: (Student attempted to upload this, but the file was not readable. Do NOT request another upload — probe verbally for the specific facts you'd want from this document.)`);
    }
  }
  return lines.join("\n");
}
