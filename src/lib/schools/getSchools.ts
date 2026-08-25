import type { School } from "../../types";

// Firebase is imported dynamically ONLY in the Firestore fallback path —
// the primary data source is the static /schools-v1.json bundle, so most
// sessions never need the Firestore SDK for school data at all.

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
//
// Audit 2026-05-15: this pulls ~6,000 docs (~3-5 MB) every call. At 1M DAU
// with 30% reaching results, that's ~63B reads/month ≈ $38k/month in
// Firestore reads, plus a slow mobile page-load. The proper fix is a
// CDN-served precompiled JSON bundle; until then, we cache the result in
// an SPA-lifetime in-memory promise. A user navigating around the app
// during one session now triggers exactly one fetch instead of N.
//
// The cache key separates undergraduate vs graduate because graduate
// callers get a server-side filtered subset; we'd otherwise mix the two.
// We cache the PROMISE (not the resolved value) so parallel callers in
// the same tick share a single in-flight request — no duplicate fetches
// while the first one is still loading.
// ─────────────────────────────────────────────────────────────
const _schoolsCache = new Map<string, Promise<School[]>>();

// Session-storage layer under the in-memory cache: the schools collection is
// ~6,200 docs (megabytes over the wire) and changes rarely, so a page reload
// or revisit within the same browser session must NOT re-download it — that
// full fetch was the biggest "slow load" on mobile. Stored with a version
// prefix so a schema change can invalidate old payloads.
const SS_PREFIX = "cr-schools-v1:";

function readSessionCache(cacheKey: string): School[] | null {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as School[]) : null;
  } catch {
    return null;
  }
}

function writeSessionCache(cacheKey: string, schools: School[]): void {
  try {
    sessionStorage.setItem(SS_PREFIX + cacheKey, JSON.stringify(schools));
  } catch {
    // Quota exceeded / private mode — the in-memory cache still applies.
  }
}

// Primary source: the static schools bundle exported at deploy time by
// scripts/exportSchoolsJson.mjs. One brotli-compressed CDN file (~250 KB
// over the wire) replaces streaming ~6,200 Firestore docs (multi-MB) on
// every first visit — the single biggest mobile "slow load" in the app.
// Falls back to the live Firestore query if the file is missing, corrupt,
// or the deploy predates the exporter, so matching can never break.
async function fetchSchools(): Promise<School[]> {
  try {
    const resp = await fetch("/schools-v1.json");
    if (resp.ok) {
      const data = (await resp.json()) as School[];
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {
    // Network/parse failure — fall through to Firestore.
  }

  const [{ collection, query, where, getDocs }, { db }] = await Promise.all([
    import("firebase/firestore"),
    import("../firebase"),
  ]);
  const snapshot = await getDocs(query(collection(db, "schools"), where("status", "==", "active")));
  const schools: School[] = [];
  snapshot.forEach((doc) => {
    schools.push(doc.data() as School);
  });
  return schools;
}

export async function getActiveSchools(
  degreeLevel?: "undergraduate" | "graduate"
): Promise<School[]> {
  const cacheKey = degreeLevel ?? "all";
  const cached = _schoolsCache.get(cacheKey);
  if (cached) return cached;

  const fromSession = readSessionCache(cacheKey);
  if (fromSession) {
    const resolved = Promise.resolve(fromSession);
    _schoolsCache.set(cacheKey, resolved);
    return resolved;
  }

  const promise = (async () => {
    try {
      const schools = await fetchSchools();

      let filtered = schools;

      if (degreeLevel === "graduate") {
        // Hard filter: only four-year universities for graduate applicants
        filtered = schools.filter((s) => canOfferGraduateDegrees(s));
      }

      filtered.sort((a, b) => a.name.localeCompare(b.name));
      writeSessionCache(cacheKey, filtered);
      return filtered;
    } catch (error) {
      // On failure, drop the cached promise so the next caller retries.
      // Without this, a transient error would poison the cache for the
      // lifetime of the page.
      _schoolsCache.delete(cacheKey);
      console.error("Error fetching schools:", error);
      throw error;
    }
  })();

  _schoolsCache.set(cacheKey, promise);
  return promise;
}
