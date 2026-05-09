import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type { School } from "../../types";

// ─────────────────────────────────────────────────────────────
// Two-year / non-degree-granting institution patterns
// ─────────────────────────────────────────────────────────────
const TWO_YEAR_PATTERNS = [
  /\bcommunity college\b/i,
  /\bjunior college\b/i,
  /\btechnical college\b/i,
  /\bvocational\b/i,
  /\bcc\b/i,
  /\bctc\b/i,
  /\b(county|city|area)\s+college\b/i,
  /\bmilitary institute\b/i,   // e.g. Marion Military Institute (2-year junior college)
  /\bpreparatory school\b/i,
];

// ─────────────────────────────────────────────────────────────
// Specialised-institution patterns — schools whose entire
// academic identity is in ONE narrow field that excludes others.
// Used for field-compatibility checks.
// ─────────────────────────────────────────────────────────────

// Theology-first institutions: cannot offer STEM or mainstream business PhDs
const THEOLOGY_PATTERNS = [
  /\bseminary\b/i,
  /\btheological\b/i,
  /\bdivinity\b/i,
  /\bbible college\b/i,
  /\bbible university\b/i,
  /\bscripture\b/i,
];

// Art / music conservatories — not suitable for STEM graduate programs
const ARTS_CONSERVATORY_PATTERNS = [
  /\bconservatory\b/i,
  /\bschool of music\b/i,
  /\bschool of art\b/i,
  /\bschool of design\b/i,
  /\bcollege of art\b/i,
  /\bcollege of music\b/i,
];

// ─────────────────────────────────────────────────────────────
// Research-university indicators — schools likely to run
// doctoral programmes in many fields
// ─────────────────────────────────────────────────────────────
const RESEARCH_UNIVERSITY_PATTERNS = [
  /\buniversity\b/i,
  /\binstitute of technology\b/i,
  /\bpolytechnic\b/i,
];

// ─────────────────────────────────────────────────────────────
// Field keyword sets (used for compatibility checks)
// ─────────────────────────────────────────────────────────────
const STEM_KEYWORDS = [
  "computer", "computing", "software", "engineering", "data",
  "cyber", "information technology", "information science",
  "mathematics", "physics", "chemistry", "biology", "bioscience",
  "biomedical", "aerospace", "electrical", "mechanical", "civil",
  "environmental", "materials", "neuroscience", "statistics",
];

const BUSINESS_KEYWORDS = [
  "business", "mba", "finance", "accounting", "economics",
  "management", "marketing", "supply chain", "logistics",
  "entrepreneurship", "commerce",
];

const HEALTH_KEYWORDS = [
  "medicine", "nursing", "pharmacy", "public health", "dentistry",
  "veterinary", "physical therapy", "occupational therapy",
];

const ARTS_HUMANITIES_KEYWORDS = [
  "art", "music", "design", "film", "theater", "theatre",
  "english", "history", "philosophy", "linguistics",
  "communication", "journalism", "creative writing",
];

// ─────────────────────────────────────────────────────────────
// Public classification helpers
// ─────────────────────────────────────────────────────────────

export function isCommunityCollege(school: School): boolean {
  // Name patterns are checked FIRST as a backstop: IPEDS-imported records
  // sometimes mis-tag two-year/junior institutions as "four-year"
  // (e.g. Marion Military Institute), so we trust the explicit naming
  // signal even when the structured field disagrees.
  if (TWO_YEAR_PATTERNS.some((p) => p.test(school.name))) return true;
  if (school.institutionLevel) {
    return (
      school.institutionLevel === "two-year" ||
      school.institutionLevel === "less-than-two-year"
    );
  }
  return false;
}

export function canOfferGraduateDegrees(school: School): boolean {
  // Two-year/junior schools never offer graduate degrees, no matter
  // what institutionLevel says. Check by name first.
  if (isCommunityCollege(school)) return false;
  if (school.institutionLevel) {
    return school.institutionLevel === "four-year";
  }
  // No structured field — must look like a university-level institution
  return RESEARCH_UNIVERSITY_PATTERNS.some((p) => p.test(school.name));
}

/** Returns true if the school is primarily theology/religion focused */
export function isTheologyFocused(school: School): boolean {
  return THEOLOGY_PATTERNS.some((p) => p.test(school.name));
}

/** Returns true if the school is primarily an arts/music conservatory */
export function isArtsConservatory(school: School): boolean {
  return ARTS_CONSERVATORY_PATTERNS.some((p) => p.test(school.name));
}

/**
 * Returns true if the school is plausibly compatible with the student's
 * intended field of study, using name-pattern heuristics.
 *
 * This is a hard-exclusion check — it only eliminates schools that are
 * clearly incompatible (e.g. a theology seminary for a CS PhD student).
 * It never positively guarantees a school offers the program.
 */
export function isSchoolFieldCompatible(school: School, fieldLower: string): boolean {
  if (!fieldLower.trim()) return true; // no field specified → no exclusion

  const isStem     = STEM_KEYWORDS.some((k) => fieldLower.includes(k));
  const isBusiness = BUSINESS_KEYWORDS.some((k) => fieldLower.includes(k));
  const isHealth   = HEALTH_KEYWORDS.some((k) => fieldLower.includes(k));
  const isArts     = ARTS_HUMANITIES_KEYWORDS.some((k) => fieldLower.includes(k));

  // Theology schools cannot offer STEM, business, or health graduate programmes
  if (isTheologyFocused(school) && (isStem || isBusiness || isHealth)) {
    return false;
  }

  // Arts conservatories cannot offer STEM, business, or health programmes
  if (isArtsConservatory(school) && (isStem || isBusiness || isHealth)) {
    return false;
  }

  // Pure arts conservatories for non-arts students
  if (isArtsConservatory(school) && !isArts) {
    return false;
  }

  return true;
}

/**
 * Returns a 0–100 score indicating how likely a school is to offer
 * the student's intended field at the graduate level.
 * Used to weight the majorFit component of the match score.
 */
export function getFieldMatchScore(school: School, fieldLower: string): { score: number; label: "Likely Available" | "Unknown" } {
  if (!fieldLower.trim()) {
    return { score: 40, label: "Unknown" };
  }

  const nameL = school.name.toLowerCase();

  const isStem     = STEM_KEYWORDS.some((k) => fieldLower.includes(k));
  const isBusiness = BUSINESS_KEYWORDS.some((k) => fieldLower.includes(k));
  const isHealth   = HEALTH_KEYWORDS.some((k) => fieldLower.includes(k));
  const isArts     = ARTS_HUMANITIES_KEYWORDS.some((k) => fieldLower.includes(k));

  // Explicit name match → strong signal
  if (isStem) {
    if (/tech|polytechnic|institute of technology/i.test(school.name)) return { score: 90, label: "Likely Available" };
    if (/university/i.test(school.name)) return { score: 70, label: "Likely Available" };
  }
  if (isBusiness) {
    if (/business|commerce|management|economics/i.test(school.name)) return { score: 90, label: "Likely Available" };
    if (/university/i.test(school.name)) return { score: 65, label: "Likely Available" };
  }
  if (isHealth) {
    if (/medical|medicine|health|pharmacy|nursing/i.test(school.name)) return { score: 90, label: "Likely Available" };
    if (/university/i.test(school.name)) return { score: 65, label: "Likely Available" };
  }
  if (isArts) {
    if (/art|music|design|liberal arts|humanities/i.test(nameL)) return { score: 85, label: "Likely Available" };
    if (/university/i.test(school.name)) return { score: 55, label: "Likely Available" };
  }

  // Generic university — conservative score
  if (/university/i.test(school.name)) return { score: 55, label: "Likely Available" };

  // College without university label — cautious
  if (/college/i.test(school.name)) return { score: 40, label: "Unknown" };

  return { score: 30, label: "Unknown" };
}

// ─────────────────────────────────────────────────────────────
// Fetch ALL active schools in a single Firestore query.
// Degree-level and field filtering happen in getDeterministicMatches,
// which has access to the full student profile.
// ─────────────────────────────────────────────────────────────
export async function getActiveSchools(
  degreeLevel?: "undergraduate" | "graduate"
): Promise<School[]> {
  try {
    const schoolsRef = collection(db, "schools");
    const q = query(schoolsRef, where("status", "==", "active"));
    const snapshot = await getDocs(q);

    const schools: School[] = [];
    snapshot.forEach((doc) => {
      schools.push(doc.data() as School);
    });

    let filtered = schools;

    if (degreeLevel === "graduate") {
      // Hard filter: only four-year universities for graduate applicants
      filtered = schools.filter((s) => canOfferGraduateDegrees(s));
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  } catch (error) {
    console.error("Error fetching schools:", error);
    throw error;
  }
}
