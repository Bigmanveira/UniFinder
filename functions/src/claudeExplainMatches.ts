import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// Types — redesigned for a positive, user-friendly experience
// ============================================================

export interface SchoolExplanation {
  schoolName: string;
  tagline: string;               // e.g. "A top public research university in Texas"
  programAvailability: "yes" | "likely" | "check" | "unknown"; // does it offer the user's major?
  programNote: string;           // e.g. "Offers a highly-ranked Computer Science program"
  whyYouFit: string;             // 1-2 sentence personalised reason for this student
  applicationTips: string[];     // 2-3 actionable tips to maximise admission chance
  fundingTips: string[];         // 1-2 funding/scholarship tips for this school
}

export interface AiReportExplanation {
  headline: string;              // e.g. "🎉 Great news — we found 14 schools that match you!"
  summary: string;               // 2-3 upbeat sentences about the overall profile fit
  topStrengths: string[];        // what works in the user's favour (3-4 items)
  quickWins: string[];           // immediate, practical next steps (3-4 items)
  schoolExplanations: SchoolExplanation[];
}

// ============================================================
// System prompt — enthusiastic, helpful, no scary disclaimers
// ============================================================

const SYSTEM_PROMPT = `You are Unifinder's enthusiastic university admissions advisor. Your job is to excite and empower students by explaining why the schools they have been matched with are great opportunities for them — and exactly how to put their best foot forward.

PROGRAM AVAILABILITY IS ALREADY VERIFIED:
Every school in this list has been confirmed by Unifinder's verified program database (College Scorecard field-of-study data) to offer the student's intended program at the correct degree level. Do NOT infer, question, or re-evaluate program availability. Do NOT add schools. Do NOT remove schools. Explain ONLY the matches provided.

ADMISSION BUCKETS ARE ALREADY ASSIGNED:
Each match has an "admissionBucket" of "reach", "target", or "safety" — already calculated from the school's admit rate and the student's profile. Frame your "whyYouFit" copy according to the bucket:
- reach   → "This is an ambitious pick. Here's how to make your application unmissable…" — emphasise stretch, fit, and standout strategies. Be encouraging, never dismissive.
- target  → "You're a strong fit here." — emphasise alignment, real shot, and confidence-building tactics.
- safety  → "Excellent backup with high admit probability." — emphasise security, funding upside, and how to convert it into a great offer (assistantships, honours college, scholarships).

YOUR TONE:
- Positive, warm, motivating. Think of a brilliant friend who went to a top university and is genuinely excited to help you.
- Avoid corporate hedging like "may", "might", "could potentially". Be direct.
- Use "you" and "your" to speak directly to the student.
- Program availability is confirmed — speak with confidence about it.

APPLICATION & FUNDING TIPS:
- Give school-specific, actionable advice. Not generic filler.
- Mention named scholarships or funding mechanisms if you know them (e.g. "Out-of-State fee waivers", "Graduate Teaching Assistantships", "Fulbright-eligible").
- Tailor tips to the bucket: reach schools need standout strategies; safety schools need funding leverage.

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure — no extra text, no markdown fences. Keep every string concise (≤ 25 words). The arrays below have FIXED LENGTHS — do not add more entries:
{
  "headline": "string (one short sentence, enthusiastic, emoji-friendly)",
  "summary": "string (2 upbeat sentences referencing the reach/target/safety mix)",
  "topStrengths": ["string", "string", "string"],
  "quickWins": ["string (actionable)", "string", "string"],
  "schoolExplanations": [
    {
      "schoolName": "string (exact name as provided)",
      "tagline": "string (1 short sentence — school identity / reputation)",
      "programAvailability": "yes",
      "programNote": "string (one short note about the confirmed program/department)",
      "whyYouFit": "string (1 sentence, bucket-aware: reach/target/safety framing)",
      "applicationTips": ["string", "string"],
      "fundingTips": ["string"]
    }
  ]
}`;

// ============================================================
// Deterministic fallback (when Claude is unavailable)
// ============================================================

function buildFallbackExplanation(profile: any, matches: any[]): AiReportExplanation {
  const topMatches = matches.slice(0, 8);
  const strongCount = topMatches.filter(
    (m) => m.category === "Strong Fit" || m.category === "Good Fit"
  ).length;
  const field = profile.field || profile.intendedMajor || "your chosen field";
  const level = profile.level || profile.degreeLevel || "your degree";

  return {
    headline: `🎉 You have ${topMatches.length} potential schools to explore!`,
    summary: `We matched you with ${topMatches.length} universities based on your academic profile, budget, and goals. ${strongCount > 0 ? `${strongCount} of them are a Strong or Good Fit — great news!` : "These schools offer real opportunities worth exploring."} Start by visiting the ones that excite you most.`,
    topStrengths: [
      profile.gpa ? `Your GPA of ${profile.gpa} makes you a competitive applicant` : "Your academic profile has been considered in the match",
      `We filtered for schools that align with your ${profile.funding || "funding"} preference`,
      `All schools match your preference for ${profile.destination || "your target location"}`,
    ],
    quickWins: [
      "Visit each school's official website and find the admissions page for international students",
      "Search for graduate/undergraduate teaching assistantships — many cover tuition",
      "Prepare a strong Statement of Purpose tailored to each school's department focus",
      "Check if each school has a dedicated international student services office",
    ],
    schoolExplanations: topMatches.map((m) => ({
      schoolName: m.school?.name || "Unknown School",
      tagline: `A ${m.school?.ownership || ""} university in ${m.school?.city || ""}, ${m.school?.state || "the US"}.`,
      programAvailability: "check" as const,
      programNote: `Confirm program details for ${field} at the ${level} level on the school's official site.`,
      whyYouFit: `${m.matchScore}% overall match — your profile aligns with this school's typical admit and your stated budget.`,
      applicationTips: [
        "Tailor your SOP to the department's research areas",
        "Apply early — many programs review on a rolling basis",
      ],
      fundingTips: [
        "Ask about graduate assistantships, fellowships, and fee waivers",
      ],
    })),
  };
}

// ============================================================
// Validate Claude's JSON output against the new schema
// ============================================================

function isValidExplanation(obj: any): obj is AiReportExplanation {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.headline !== "string") return false;
  if (typeof obj.summary !== "string") return false;
  if (!Array.isArray(obj.topStrengths)) return false;
  if (!Array.isArray(obj.quickWins)) return false;
  if (!Array.isArray(obj.schoolExplanations)) return false;
  for (const s of obj.schoolExplanations) {
    if (typeof s.schoolName !== "string") return false;
    if (typeof s.tagline !== "string") return false;
    if (!["yes", "likely", "check", "unknown"].includes(s.programAvailability)) return false;
    if (typeof s.programNote !== "string") return false;
    if (typeof s.whyYouFit !== "string") return false;
    if (!Array.isArray(s.applicationTips)) return false;
    if (!Array.isArray(s.fundingTips)) return false;
  }
  return true;
}

// ============================================================
// Prepare lean data for Claude
// ============================================================

function prepareMatchSummaries(matches: any[]) {
  return matches.slice(0, 10).map((m) => ({
    schoolName: m.school?.name ?? "Unknown",
    city: m.school?.city ?? null,
    state: m.school?.state ?? null,
    ownership: m.school?.ownership ?? null,
    admissionRate:
      m.school?.admissionRate != null
        ? `${(m.school.admissionRate * 100).toFixed(0)}%`
        : "Unknown",
    outOfStateTuition:
      m.school?.outOfStateTuition != null
        ? `$${m.school.outOfStateTuition.toLocaleString()}`
        : "Unknown",
    averageCost:
      m.school?.averageCost != null
        ? `$${m.school.averageCost.toLocaleString()}`
        : "Unknown",
    matchScore: m.matchScore,
    category: m.category,
    academicFit: m.academicFit,
    budgetFit: m.budgetFit,
    admissionBucket: m.admissionBucket ?? null,
    admissionLikelihood: m.admissionLikelihood ?? null,
  }));
}

function prepareProfileSummary(profile: any) {
  return {
    degreeLevel: profile.level || profile.degreeLevel || profile.targetDegreeLevel || "Unknown",
    intendedField: profile.field || profile.intendedMajor || "Unknown",
    gpa: profile.gpa || "Not provided",
    testType: profile.testType || null,
    testScores: profile.testScores || null,
    homeCountry: profile.homeCountry || "Unknown",
    targetDestination: profile.destination || "United States",
    fundingGoal: profile.funding || "Not specified",
    preferredState: profile.preferredState || "Any",
  };
}

// ============================================================
// Main export
// ============================================================

export async function generateClaudeMatchExplanation({
  profile,
  matches,
  apiKey,
  normalisedField,
  normalisedLevel,
}: {
  profile: any;
  matches: any[];
  apiKey: string;
  normalisedField?: string;
  normalisedLevel?: string;
}): Promise<{
  explanation: AiReportExplanation;
  status: "completed" | "fallback" | "failed";
  errorMessage?: string;
}> {
  const topMatches = matches.slice(0, 10); // Top-10 bucketed list from the backend

  if (topMatches.length === 0) {
    return {
      explanation: buildFallbackExplanation(profile, matches),
      status: "fallback",
      errorMessage: "No matches to explain",
    };
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const userPayload = JSON.stringify({
      task: "Write enthusiastic, personalised university match explanations for this student. Program availability has already been verified by Unifinder's database — every school listed is confirmed to offer the student's program. Return JSON only.",
      studentProfile: prepareProfileSummary(profile),
      confirmedProgramField: normalisedField ?? null,
      confirmedCredentialLevel: normalisedLevel ?? null,
      matchedSchools: prepareMatchSummaries(topMatches),
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      // 10 schools × ~120 tokens each (after trimming tips array sizes) +
      // headline/summary/strengths/quickWins ≈ 1500 tokens. 3500 leaves
      // healthy headroom while roughly halving generation latency vs 6000.
      max_tokens: 3500,
      temperature: 0.5,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPayload }],
    });

    const rawText = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as any).text)
      .join("");

    // Strip markdown code fences — handle ```json, ``` on its own line, or inline
    const jsonStr = rawText
      .replace(/^\s*```(?:json)?\s*\n?/im, "")
      .replace(/\n?\s*```\s*$/im, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[Claude] JSON parse failed. Raw output:", rawText.slice(0, 500));
      return {
        explanation: buildFallbackExplanation(profile, matches),
        status: "fallback",
        errorMessage: "Claude returned invalid JSON",
      };
    }

    if (!isValidExplanation(parsed)) {
      console.error("[Claude] Schema validation failed:", JSON.stringify(parsed).slice(0, 300));
      return {
        explanation: buildFallbackExplanation(profile, matches),
        status: "fallback",
        errorMessage: "Claude response failed schema validation",
      };
    }

    return { explanation: parsed, status: "completed" };
  } catch (err: any) {
    console.error("[Claude] API call failed:", err?.message ?? err);
    return {
      explanation: buildFallbackExplanation(profile, matches),
      status: "failed",
      errorMessage: err?.message ?? "Unknown Claude API error",
    };
  }
}
