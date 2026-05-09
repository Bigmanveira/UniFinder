import type { School, StudentProfile, SchoolMatch, ProfileAdvice } from "../../types";
import {
  isCommunityCollege,
  canOfferGraduateDegrees,
  isSchoolFieldCompatible,
  getFieldMatchScore,
} from "../schools/getSchools";

// ====================================================
// TASK 2: Applicant-level helper functions
// ====================================================
export function isUndergraduateApplicant(profile: StudentProfile): boolean {
  const level = (profile.level || profile.degreeLevel || profile.targetDegreeLevel || "").toLowerCase();
  return level.includes("undergraduate") || 
         level.includes("bachelors") || 
         level.includes("bachelor") || 
         level.includes("first degree") || 
         level.includes("associate");
}

export function isPostgraduateApplicant(profile: StudentProfile): boolean {
  const level = (profile.level || profile.degreeLevel || profile.targetDegreeLevel || "").toLowerCase();
  if (level.includes("undergrad")) return false;
  return level.includes("masters") || 
         level.includes("master's") || 
         level.includes("master") || 
         level.includes("mba") || 
         level.includes("graduate") || 
         level.includes("postgrad") || 
         level.includes("phd") || 
         level.includes("doctorate");
}

// ====================================================
// TASK 3: Parse academic inputs safely
// ====================================================

/**
 * Normalises a GPA value to the canonical 4.0 scale.
 * Accepts:
 *   "GPA (4.0 scale)"  -> identity (clamps to 0-4.0)
 *   "GPA (5.0 scale)"  -> linear scale, common in Nigerian / WAEC / many African systems
 *   "CWA (out of 100)" -> piecewise mapping by class band (US-style A/B/C/D)
 *
 * Returns null for invalid inputs so the caller can treat the GPA as unknown.
 */
export function parseGpa(gpaInput?: string | number, gradingSystem?: string): number | null {
  if (gpaInput === undefined || gpaInput === null || gpaInput === "") return null;
  const num = typeof gpaInput === "string" ? parseFloat(gpaInput) : gpaInput;
  if (isNaN(num) || num < 0) return null;

  const sys = (gradingSystem || "").toLowerCase();

  if (sys.includes("cwa") || sys.includes("100")) {
    if (num > 100) return null;
    if (num >= 90) return 4.0;
    if (num >= 80) return 3.7;
    if (num >= 70) return 3.3;
    if (num >= 60) return 2.7;
    if (num >= 50) return 2.0;
    return 1.5;
  }

  if (sys.includes("5")) {
    if (num > 5.0) return null;
    // Linear conversion. 5.0 -> 4.0, 4.5 -> 3.6, 4.0 -> 3.2, 3.5 -> 2.8, 3.0 -> 2.4
    return Math.min(4.0, Math.max(0, num * 0.8));
  }

  // Default: assume 4.0 scale
  if (num > 4.0) return null;
  return num;
}

export function parseSat(score?: string | number): number | null {
  if (score === undefined || score === null || score === "") return null;
  const num = typeof score === "string" ? parseInt(score, 10) : score;
  if (isNaN(num) || num < 400 || num > 1600) return null;
  return num;
}

export function parseAct(score?: string | number): number | null {
  if (score === undefined || score === null || score === "") return null;
  const num = typeof score === "string" ? parseInt(score, 10) : score;
  if (isNaN(num) || num < 1 || num > 36) return null;
  return num;
}

export function parseGre(score?: string | number): number | null {
  if (score === undefined || score === null || score === "") return null;
  const num = typeof score === "string" ? parseInt(score, 10) : score;
  if (isNaN(num) || num < 260 || num > 340) return null;
  return num;
}

export function parseGmat(score?: string | number): number | null {
  if (score === undefined || score === null || score === "") return null;
  const num = typeof score === "string" ? parseInt(score, 10) : score;
  if (isNaN(num) || num < 200 || num > 800) return null;
  return num;
}

// ====================================================
// Extract Test Scores Helper
// ====================================================
function extractTestScores(profile: StudentProfile) {
  let sat = parseSat(profile.satScore);
  let act = parseAct(profile.actScore);
  let gre = parseGre(profile.greScore);
  let gmat = parseGmat(profile.gmatScore);

  if (profile.testType && profile.testScores) {
    const ts = profile.testScores;
    if (profile.testType === "SAT" && sat === null) sat = parseSat(ts);
    if (profile.testType === "ACT" && act === null) act = parseAct(ts);
    if (profile.testType === "GRE" && gre === null) gre = parseGre(ts);
    if (profile.testType === "GMAT" && gmat === null) gmat = parseGmat(ts);
  }

  return { sat, act, gre, gmat };
}

// ====================================================
// TASK 6: Build undergraduate academic-fit scoring
// ====================================================
export function scoreUndergraduateAcademicFit(profile: StudentProfile, school: School) {
  const gpa = parseGpa(profile.gpa, profile.gradingSystem);
  const { sat, act } = extractTestScores(profile);
  const admRate = school.admissionRate;
  
  if (gpa === null && sat === null && act === null) {
    return { score: 40, label: "Limited Data" };
  }

  let satScore = 0;
  if (sat !== null) {
    if (sat >= 1450) satScore = 95;
    else if (sat >= 1350) satScore = 88;
    else if (sat >= 1250) satScore = 78;
    else if (sat >= 1150) satScore = 68;
    else if (sat >= 1050) satScore = 58;
    else if (sat >= 950) satScore = 45;
    else satScore = 30;
  }

  let actScoreNum = 0;
  if (act !== null) {
    if (act >= 33) actScoreNum = 95;
    else if (act >= 30) actScoreNum = 88;
    else if (act >= 27) actScoreNum = 78;
    else if (act >= 24) actScoreNum = 68;
    else if (act >= 21) actScoreNum = 58;
    else if (act >= 18) actScoreNum = 45;
    else actScoreNum = 30;
  }

  let gpaScore = 0;
  if (gpa !== null) {
    if (gpa >= 3.7) gpaScore = 95;
    else if (gpa >= 3.4) gpaScore = 88;
    else if (gpa >= 3.0) gpaScore = 75;
    else if (gpa >= 2.5) gpaScore = 58;
    else if (gpa >= 2.0) gpaScore = 35;
    else gpaScore = 20;
  }

  // Combine signals
  let signals = [];
  if (sat !== null) signals.push(satScore);
  if (act !== null) signals.push(actScoreNum);
  if (gpa !== null) signals.push(gpaScore);

  let rawAcScore = signals.reduce((a, b) => a + b, 0) / signals.length;

  let finalLabel = "Unknown";
  
  if (admRate === null || admRate === undefined) {
    finalLabel = "Unknown";
  } else {
    // Selectivity adjustment
    if (admRate < 0.25) { // Highly selective
      if (rawAcScore >= 90) finalLabel = "Target";
      else if (rawAcScore >= 80) finalLabel = "Reach";
      else finalLabel = "High Reach";
      rawAcScore -= 10; 
    } else if (admRate < 0.5) { // Selective
      if (rawAcScore >= 85) finalLabel = "Likely";
      else if (rawAcScore >= 75) finalLabel = "Target";
      else if (rawAcScore >= 60) finalLabel = "Reach";
      else finalLabel = "High Reach";
    } else if (admRate < 0.75) { // Moderate
      if (rawAcScore >= 75) finalLabel = "Likely";
      else if (rawAcScore >= 60) finalLabel = "Target";
      else if (rawAcScore >= 45) finalLabel = "Reach";
      else finalLabel = "High Reach";
    } else { // Broad access
      if (rawAcScore >= 55) finalLabel = "Likely";
      else if (rawAcScore >= 40) finalLabel = "Target";
      else finalLabel = "Reach";
    }
  }

  if (admRate === null || admRate === undefined) {
    if (rawAcScore >= 80) finalLabel = "Competitive";
    else if (rawAcScore >= 60) finalLabel = "Possible";
    else finalLabel = "Reach";
  }

  return { score: Math.max(10, Math.min(100, rawAcScore)), label: finalLabel };
}

// ====================================================
// TASK 7: Build postgraduate academic-fit scoring
// ====================================================
export function scorePostgraduateAcademicFit(profile: StudentProfile, school: School) {
  const gpa = parseGpa(profile.gpa, profile.gradingSystem);
  const { gre, gmat } = extractTestScores(profile);
  const admRate = school.admissionRate;

  if (gpa === null && gre === null && gmat === null) {
    return { score: 40, label: "Limited Data" };
  }

  let greScore = 0;
  if (gre !== null) {
    if (gre >= 325) greScore = 90;
    else if (gre >= 315) greScore = 80;
    else if (gre >= 305) greScore = 68;
    else if (gre >= 295) greScore = 55;
    else greScore = 40;
  }

  let gmatScoreNum = 0;
  if (gmat !== null) {
    if (gmat >= 700) gmatScoreNum = 90;
    else if (gmat >= 650) gmatScoreNum = 80;
    else if (gmat >= 600) gmatScoreNum = 68;
    else if (gmat >= 550) gmatScoreNum = 55;
    else gmatScoreNum = 40;
  }

  let gpaScore = 0;
  if (gpa !== null) {
    if (gpa >= 3.7) gpaScore = 95;
    else if (gpa >= 3.4) gpaScore = 88;
    else if (gpa >= 3.0) gpaScore = 75;
    else if (gpa >= 2.5) gpaScore = 58;
    else if (gpa >= 2.0) gpaScore = 35;
    else gpaScore = 20;
  }

  let rawAcScore = 0;
  let signals = [];

  if (gpa !== null) signals.push(gpaScore);
  if (gre !== null) signals.push(greScore);
  if (gmat !== null) signals.push(gmatScoreNum);

  if (signals.length > 0) {
    rawAcScore = signals.reduce((a, b) => a + b, 0) / signals.length;
  }

  if (gpa !== null && gpa < 2.5) {
    const testScore = Math.max(greScore, gmatScoreNum);
    if (testScore >= 80) {
      rawAcScore = (rawAcScore + testScore) / 2;
    } else {
      rawAcScore = Math.min(rawAcScore, 50);
    }
  }

  let finalLabel = "Unknown";
  if (admRate === null || admRate === undefined) {
    if (rawAcScore >= 80) finalLabel = "Competitive";
    else if (rawAcScore >= 60) finalLabel = "Possible";
    else finalLabel = "Reach";
  } else {
    if (admRate < 0.3) {
      if (rawAcScore >= 85) finalLabel = "Target";
      else finalLabel = "Reach";
      rawAcScore -= 10;
    } else if (admRate < 0.6) {
      if (rawAcScore >= 75) finalLabel = "Likely";
      else if (rawAcScore >= 60) finalLabel = "Target";
      else finalLabel = "Reach";
    } else {
      if (rawAcScore >= 55) finalLabel = "Likely";
      else if (rawAcScore >= 40) finalLabel = "Target";
      else finalLabel = "Reach";
    }
  }

  return { score: Math.max(10, Math.min(100, rawAcScore)), label: finalLabel };
}

// ====================================================
// TASK 8: Replace GPA-only caps with academic-signal caps
// ====================================================
function getUndergradCap(profile: StudentProfile): number {
  const gpa = parseGpa(profile.gpa, profile.gradingSystem);
  const { sat, act } = extractTestScores(profile);

  if (gpa === null && sat === null && act === null) return 65;

  let testCap = 0;
  if (sat !== null || act !== null) {
    const s = sat || 0;
    const a = act || 0;
    if (s >= 1450 || a >= 33) testCap = 100;
    else if (s >= 1350 || a >= 30) testCap = 92;
    else if (s >= 1250 || a >= 27) testCap = 85;
    else if (s >= 1150 || a >= 24) testCap = 75;
    else if (s >= 1050 || a >= 21) testCap = 65;
    else if (s >= 950 || a >= 18) testCap = 55;
    else testCap = 45;
  }

  let gpaCap = 0;
  if (gpa !== null) {
    if (gpa >= 3.7) gpaCap = 100;
    else if (gpa >= 3.4) gpaCap = 92;
    else if (gpa >= 3.0) gpaCap = 82;
    else if (gpa >= 2.8) gpaCap = 72;
    else if (gpa >= 2.5) gpaCap = 65;
    else if (gpa >= 2.3) gpaCap = 55;
    else gpaCap = 45;
  }

  if (gpa !== null && (sat !== null || act !== null)) {
    return Math.round((gpaCap + testCap) / 2);
  } else if (gpa !== null) {
    return gpaCap;
  } else {
    return testCap;
  }
}

function getPostgradCap(profile: StudentProfile): number {
  const gpa = parseGpa(profile.gpa, profile.gradingSystem);
  const { gre, gmat } = extractTestScores(profile);

  if (gpa === null && gre === null && gmat === null) return 65;

  let testCap = 0;
  if (gre !== null || gmat !== null) {
    const gr = gre || 0;
    const gm = gmat || 0;
    if (gr >= 325 || gm >= 700) testCap = 100;
    else if (gr >= 315 || gm >= 650) testCap = 90;
    else if (gr >= 305 || gm >= 600) testCap = 80;
    else if (gr >= 295 || gm >= 550) testCap = 65;
    else testCap = 50;
  }

  if (gpa === null) return testCap;

  let gpaCap = 0;
  if (gpa >= 3.4) gpaCap = 100;
  else if (gpa >= 3.0) gpaCap = 82;
  else if (gpa >= 2.8) gpaCap = 72;
  else if (gpa >= 2.5) gpaCap = 65;
  else if (gpa >= 2.3) gpaCap = 55;
  else gpaCap = 45;

  if (gpa < 2.5 && (gre !== null || gmat !== null)) {
    if (testCap >= 80) return Math.min(65, Math.max(gpaCap, testCap - 20));
    return gpaCap;
  }

  return gpaCap;
}

// ====================================================
// TASK 10: Improve final score logic (Risk Penalties)
// ====================================================
function getUndergradRiskPenalty(profile: StudentProfile): number {
  const gpa = parseGpa(profile.gpa, profile.gradingSystem);
  const { sat, act } = extractTestScores(profile);

  if (gpa === null && sat === null && act === null) return 10;
  
  let penalty = 0;
  if (gpa !== null && gpa < 2.3) penalty += 15;
  if (sat !== null && sat < 950) penalty += 10;
  if (act !== null && act < 18) penalty += 10;

  return penalty;
}

function getPostgradRiskPenalty(profile: StudentProfile): number {
  const gpa = parseGpa(profile.gpa, profile.gradingSystem);
  const { gre, gmat } = extractTestScores(profile);

  if (gpa === null && gre === null && gmat === null) return 10;
  
  let penalty = 0;
  if (gpa !== null) {
    if (gpa < 2.3) penalty = 25;
    else if (gpa < 2.5) penalty = 18;
    else if (gpa < 2.8) penalty = 10;
  }

  if (penalty > 0 && (gre !== null || gmat !== null)) {
    const gr = gre || 0;
    const gm = gmat || 0;
    if (gr >= 315 || gm >= 650) penalty = Math.max(0, penalty - 10);
  }

  return penalty;
}

// ====================================================
// TASK 15: Add profile improvement advice engine
// ====================================================
export function getProfileImprovementAdvice(profile: StudentProfile): ProfileAdvice[] {
  const advice: ProfileAdvice[] = [];
  const gpa = parseGpa(profile.gpa, profile.gradingSystem);
  const { sat, act, gre, gmat } = extractTestScores(profile);
  
  const isUndergrad = isUndergraduateApplicant(profile);
  const isPostGrad = isPostgraduateApplicant(profile);
  
  const destStr = (profile.destination || "").toLowerCase();
  const isTargetingAbroad = destStr.includes("us") || destStr.includes("united states") || destStr.includes("uk") || destStr.includes("canada") || destStr.includes("europe") || destStr.includes("australia");
  
  if (isUndergrad) {
    if (gpa === null && sat === null && act === null) {
      advice.push({
        title: "Missing Academic Data",
        body: "Add GPA, SAT, or ACT for a stronger academic-fit estimate.",
        actions: ["Update Profile"]
      });
    } else if ((sat !== null && sat < 1050) || (act !== null && act < 21)) {
      advice.push({
        title: "Strengthen your application",
        body: "Your standardized test scores may limit your options. Consider broader-access schools, stronger essays, and checking test-optional policies.",
        actions: ["Check test-optional policies", "Focus on essays"]
      });
    }

    if (sat === null && act === null) {
      advice.push({
        title: "Verify test score policies",
        body: "You have not provided test scores. We recommend checking whether your target programs require SAT/ACT or are test-optional.",
        actions: ["Check program test policies"]
      });
    }
  }

  if (isPostGrad) {
    if (gpa !== null && gpa < 2.5 && gre === null && gmat === null) {
      if (isTargetingAbroad) {
        advice.push({
          title: "Strengthen your graduate application profile",
          body: "Because your GPA is below 2.5 and you are considering postgraduate study abroad, your current academic profile may be risky for many programs. Consider taking the GRE where accepted or recommended, and consider a WES or course-by-course credential evaluation where required or helpful. Always verify requirements on each university's official admissions page.",
          actions: ["Check GRE requirements", "Check credential evaluation requirements", "Shortlist broader-access programs"]
        });
      } else {
        advice.push({
          title: "Consider test requirements",
          body: "Because your GPA is below 2.5, consider taking the GRE or GMAT if accepted to strengthen your academic profile.",
          actions: ["Check GRE requirements"]
        });
      }
    }

    if (gre === null && gmat === null) {
      advice.push({
        title: "Verify test score policies",
        body: "You have not provided test scores. We recommend checking whether your target programs require GRE/GMAT.",
        actions: ["Check program test policies"]
      });
    }
  }

  if (profile.funding && profile.funding.toLowerCase().includes("full")) {
    advice.push({
      title: "High financial need",
      body: "You indicated a need for a full scholarship. We recommend filtering for lower-cost public institutions and checking funding options directly with the universities.",
      actions: ["Check official funding options"]
    });
  }

  if (!destStr) {
    advice.push({
      title: "Flexible Location",
      body: "You have not provided a specific state or destination, so location matching is treated as flexible.",
      actions: ["Set preferred location"]
    });
  }

  return advice;
}

// ====================================================
// Admission likelihood + bucketing (Reach / Target / Safety)
// ====================================================

/**
 * 0-100 score representing how strong this applicant's profile looks
 * relative to a typical applicant pool. Used as the bonus/penalty side
 * of the admission-likelihood calculation.
 */
function getApplicantStrength(profile: StudentProfile): number {
  const gpa = parseGpa(profile.gpa, profile.gradingSystem);
  const { sat, act, gre, gmat } = extractTestScores(profile);

  let gpaPct: number | null = null;
  if (gpa !== null) {
    if (gpa >= 3.9)      gpaPct = 95;
    else if (gpa >= 3.7) gpaPct = 88;
    else if (gpa >= 3.4) gpaPct = 78;
    else if (gpa >= 3.0) gpaPct = 65;
    else if (gpa >= 2.5) gpaPct = 50;
    else                 gpaPct = 30;
  }

  let testPct: number | null = null;
  if (sat !== null) {
    if (sat >= 1500)       testPct = 95;
    else if (sat >= 1400)  testPct = 88;
    else if (sat >= 1300)  testPct = 78;
    else if (sat >= 1200)  testPct = 65;
    else if (sat >= 1100)  testPct = 55;
    else                   testPct = 40;
  }
  if (act !== null) {
    let p;
    if (act >= 34)        p = 95;
    else if (act >= 31)   p = 88;
    else if (act >= 28)   p = 78;
    else if (act >= 25)   p = 65;
    else if (act >= 22)   p = 55;
    else                  p = 40;
    testPct = testPct === null ? p : Math.max(testPct, p);
  }
  if (gre !== null) {
    let p;
    if (gre >= 325)      p = 95;
    else if (gre >= 315) p = 85;
    else if (gre >= 305) p = 70;
    else if (gre >= 295) p = 55;
    else                 p = 40;
    testPct = testPct === null ? p : Math.max(testPct, p);
  }
  if (gmat !== null) {
    let p;
    if (gmat >= 720)      p = 95;
    else if (gmat >= 680) p = 85;
    else if (gmat >= 640) p = 75;
    else if (gmat >= 600) p = 60;
    else                  p = 45;
    testPct = testPct === null ? p : Math.max(testPct, p);
  }

  const signals = [gpaPct, testPct].filter((v): v is number => v !== null);
  if (signals.length === 0) return 50; // unknown -> middle
  return signals.reduce((a, b) => a + b, 0) / signals.length;
}

/**
 * 0-100 estimate of admission likelihood at this specific school.
 * Combines the school's admit rate with the applicant's profile strength.
 *
 * Returns 50 (middle) when admissionRate is unknown - better to push the
 * school into the "Target" bucket than to over- or under-promise.
 *
 * NOTE: this uses the school's *overall* admit rate. Doctoral programs are
 * typically more selective than the institutional average; communicate this
 * uncertainty in copy that surfaces this number.
 */
export function getAdmissionLikelihood(profile: StudentProfile, school: School): number {
  const applicantStrength = getApplicantStrength(profile);
  const admRate = school.admissionRate;
  // Treat both null AND a literal 0 as "unknown" — College Scorecard reports
  // 0% for many small schools that simply didn't submit admissions data.
  if (admRate === null || admRate === undefined || admRate === 0) {
    // Anchor on applicant strength alone, dampened toward the middle
    return Math.max(0, Math.min(100, 50 + (applicantStrength - 50) * 0.5));
  }
  // Base = institutional admit rate * 100 (e.g. 25% admit -> 25 base)
  // Then ± half the applicant's deviation from average
  const base = admRate * 100;
  const bonus = (applicantStrength - 50) * 0.7;
  return Math.max(0, Math.min(100, base + bonus));
}

export type AdmissionBucket = "reach" | "target" | "safety";

/**
 * Classifies a school by the student's admission likelihood at it.
 * Thresholds tuned so that:
 *  - A 4.0 / 1600 student sees Ivies (admit ~5%) in Reach.
 *  - A 3.0 / 1100 student sees state R1s (admit ~30%) in Reach,
 *    less-selective state schools in Target, broad-access in Safety.
 */
export function bucketForLikelihood(likelihood: number): AdmissionBucket {
  if (likelihood < 50) return "reach";
  if (likelihood < 75) return "target";
  return "safety";
}

interface BucketizedMatches {
  top10: SchoolMatch[];
  reach: SchoolMatch[];
  target: SchoolMatch[];
  safety: SchoolMatch[];
}

/**
 * Picks the best ~10 matches and groups them into reach/target/safety.
 * Quotas: 3 reach, 4 target, 3 safety. If a bucket is short, fill from
 * adjacent buckets so the user always sees up to 10 cards.
 */
export function bucketizeMatches(matches: SchoolMatch[]): BucketizedMatches {
  // First pass: classify every match into a bucket
  const reach:  SchoolMatch[] = [];
  const target: SchoolMatch[] = [];
  const safety: SchoolMatch[] = [];

  for (const m of matches) {
    const b = m.admissionBucket || "target";
    if (b === "reach")        reach.push(m);
    else if (b === "safety")  safety.push(m);
    else                      target.push(m);
  }

  // Per-bucket sort priorities (refined for what students actually expect):
  //   Reach  — primary: lowest admit rate (most prestigious aspirational picks)
  //            tie-break: highest matchScore
  //   Target — primary: highest matchScore (best overall fit among realistic options)
  //            tie-break: lower admit rate first (slight prestige preference)
  //   Safety — primary: highest matchScore (still want quality)
  //            tie-break: highest admit rate (most certain admission)
  //
  // IMPORTANT: a literal `0` admit rate is a data anomaly (College Scorecard
  // reports 0% for schools that didn't submit admissions data). Coerce both
  // null and 0 to a sentinel so those schools don't get promoted as "most
  // selective" when sorting Reach.
  const rateOrSentinel = (s: School, fallback: number) =>
    (s.admissionRate == null || s.admissionRate === 0) ? fallback : s.admissionRate;
  const byScoreDesc = (a: SchoolMatch, b: SchoolMatch) => b.matchScore - a.matchScore;

  reach.sort((a, b) => {
    const aRate = rateOrSentinel(a.school, 1);
    const bRate = rateOrSentinel(b.school, 1);
    if (aRate !== bRate) return aRate - bRate; // most selective first
    return byScoreDesc(a, b);
  });
  target.sort((a, b) => {
    const d = byScoreDesc(a, b);
    if (d !== 0) return d;
    return rateOrSentinel(a.school, 1) - rateOrSentinel(b.school, 1);
  });
  safety.sort((a, b) => {
    const d = byScoreDesc(a, b);
    if (d !== 0) return d;
    // Most certain admit on tie -> highest known admit rate first;
    // unknowns (0/null) treated as 0 so they go last.
    return rateOrSentinel(b.school, 0) - rateOrSentinel(a.school, 0);
  });

  // Take quotas, then top up if any bucket is short
  let pickedReach  = reach.slice(0, 3);
  let pickedTarget = target.slice(0, 4);
  let pickedSafety = safety.slice(0, 3);

  let total = pickedReach.length + pickedTarget.length + pickedSafety.length;
  if (total < 10) {
    const remainingReach  = reach.slice(pickedReach.length);
    const remainingTarget = target.slice(pickedTarget.length);
    const remainingSafety = safety.slice(pickedSafety.length);
    const extras = [...remainingTarget, ...remainingReach, ...remainingSafety]
      .sort(byScoreDesc)
      .slice(0, 10 - total);
    for (const e of extras) {
      if (e.admissionBucket === "reach")        pickedReach.push(e);
      else if (e.admissionBucket === "safety")  pickedSafety.push(e);
      else                                      pickedTarget.push(e);
    }
  }

  // Re-sort each picked bucket so the displayed order is stable
  pickedReach.sort(byScoreDesc);
  pickedTarget.sort(byScoreDesc);
  pickedSafety.sort(byScoreDesc);

  return {
    top10: [...pickedReach, ...pickedTarget, ...pickedSafety],
    reach: pickedReach,
    target: pickedTarget,
    safety: pickedSafety,
  };
}

// ====================================================
// TASK 10: Final Score Logic & Match Engine
// ====================================================
export function getDeterministicMatches(
  schools: School[],
  profile: StudentProfile,
  // When provided, a school's unitId MUST be in this set to be considered.
  // null = gate not enforceable (field or level not recognised) - fall back to
  // name heuristics. The same gate runs again on the backend at unlock time.
  eligibleUnitIds: Set<string> | null = null,
): SchoolMatch[] {
  // Comments for reference (TASK 18):
  // - This is school-level matching only.
  // - It is not exact admission prediction.
  // - Missing data must remain unknown, not assumed.
  // - SAT/ACT are used as undergraduate academic signals.
  // - GRE/GMAT are used as postgraduate supporting academic signals.
  // - SAT/ACT are not converted into GPA.

  let maxBudget = 50000;
  if (profile?.funding === "Self-Funded") maxBudget = 60000;
  if (profile?.funding === "Partial Scholarship") maxBudget = 25000;
  if (profile?.funding === "Full Scholarship") maxBudget = 15000;

  const targetCountry = (profile?.destination || "us").toLowerCase();
  const isUndergrad = isUndergraduateApplicant(profile);
  const isPostgrad = isPostgraduateApplicant(profile);

  const matches: SchoolMatch[] = [];

  const fieldStr = (profile.field || profile.intendedMajor || "").toLowerCase();
  const levelStr  = (profile.level || profile.degreeLevel || profile.targetDegreeLevel || "").toLowerCase();
  const isPhd = levelStr.includes("phd") || levelStr.includes("doctorate");

  // Seed for the personalization tiebreaker. Two applicants with the SAME
  // exact profile see the same ordering; applicants with different profiles
  // see slightly different ones. This prevents the "everyone keeps seeing
  // Stanford / MIT / Berkeley at the top" repetition without violating the
  // determinism contract (same input -> same output).
  const profileSeed = [
    profile?.field, profile?.intendedMajor, profile?.gpa, profile?.gradingSystem,
    profile?.funding, profile?.destination,
    profile?.level, profile?.degreeLevel, profile?.targetDegreeLevel,
    (profile as any)?.satScore, (profile as any)?.actScore,
    (profile as any)?.greScore, (profile as any)?.gmatScore,
  ].map((v) => String(v ?? "")).join("|");

  for (const school of schools) {
    // -- Hard eligibility check 0: verified-program gate -----
    // When the caller passes a non-null set, the school's unitId MUST
    // appear in it. This is how we exclude e.g. Amridge or Selma from
    // a Computer-Science PhD search even though their names contain
    // "University". The set is built from the `programs` collection,
    // which is populated from College Scorecard / IPEDS data.
    if (eligibleUnitIds !== null) {
      const sid = school.unitId !== undefined && school.unitId !== null
        ? String(school.unitId)
        : null;
      if (!sid || !eligibleUnitIds.has(sid)) continue;
    }

    // -- Hard eligibility check 1: degree-level --------------
    // Community / 2-year colleges never offer Master's or PhD.
    if (isPostgrad && !canOfferGraduateDegrees(school)) continue;

    // Undergrads seeking a Bachelor's don't want community colleges either
    if (isUndergrad) {
      const wantsBachelors = levelStr.includes("bachelor") || levelStr.includes("undergraduate");
      if (wantsBachelors && isCommunityCollege(school)) continue;
    }

    // -- Hard eligibility check 2: field compatibility -------
    // Theology seminaries, arts conservatories, etc. are hard-excluded
    // for students whose field is clearly incompatible (e.g. CS PhD at a seminary).
    if (!isSchoolFieldCompatible(school, fieldStr)) continue;

    let rawScore = 0;

    // ── Score weights (must sum to 100) ───────────────────────────────────
    // Rebalanced from the original PhD-CS-tuned config so masters and
    // undergrad reports differentiate properly between fields:
    //   - Major Fit went 7 -> 15: a CS applicant and a Biology applicant
    //     should not see nearly identical school lists. Field signal now
    //     carries real weight.
    //   - Academic Fit 40 -> 42: profile stats matter slightly more.
    //   - Admission Likelihood 25 -> 22: a touch less, since field+academic
    //     already encode prestige indirectly.
    //   - Budget 15 -> 10: cost-of-attendance varies less between top
    //     schools than the old weight implied; "Out of budget" was
    //     dragging strong fits below threshold for non-CS fields.
    //   - Location 10 -> 8, International 3 -> 3.

    // 1. Budget Fit (10%)
    const knownCost = school.averageCost ?? school.outOfStateTuition ?? school.inStateTuition;
    const cost = knownCost ?? 40000;
    let budgetFit: SchoolMatch["budgetFit"] = "Good";
    let budgetWeight = 0;
    if      (cost <= maxBudget * 0.8) { budgetFit = "Excellent";    budgetWeight = 1.00; }
    else if (cost <= maxBudget)        { budgetFit = "Good";         budgetWeight = 0.85; }
    else if (cost <= maxBudget * 1.2)  { budgetFit = "Stretch";      budgetWeight = 0.55; }
    else                               { budgetFit = "Out of Budget"; budgetWeight = 0.30; }
    rawScore += budgetWeight * 10;
    if (knownCost === null || knownCost === undefined) rawScore -= 1.5;

    // 2. Academic Fit (42%) — your stats vs the school's selectivity.
    let academic;
    if (isUndergrad) {
      academic = scoreUndergraduateAcademicFit(profile, school);
    } else if (isPostgrad) {
      academic = scorePostgraduateAcademicFit(profile, school);
    } else {
      academic = scoreUndergraduateAcademicFit(profile, school);
    }
    rawScore += (academic.score / 100) * 42;

    // 3. Admission Likelihood (22%) — your chance given the school's admit
    // rate and your profile strength. Differentiates Reach/Target/Safety.
    const admissionLikelihood = getAdmissionLikelihood(profile, school);
    rawScore += (admissionLikelihood / 100) * 22;
    const admissionBucket = bucketForLikelihood(admissionLikelihood);

    // Data-confidence penalty: schools without an admissions-rate record
    // shouldn't outrank schools with verified Target/Safety admit rates.
    if (school.admissionRate == null || school.admissionRate === 0) {
      rawScore -= 6;
    }

    // 4. Location Fit (8%)
    let locationFit: SchoolMatch["locationFit"] = "No";
    if (targetCountry.includes("us") || targetCountry.includes("united states")) {
      locationFit = "Yes";
      rawScore += 8;
    }

    // 5. Major Fit (15%) — the BIG rebalance. Field/program alignment is
    // now a primary driver, not a tiebreaker. Two applicants with the same
    // GPA but different majors will see materially different school lists.
    const fieldFit = getFieldMatchScore(school, fieldStr);
    rawScore += (fieldFit.score / 100) * 15;
    const majorFitLabel = fieldFit.label;

    // 6. International Fit (3%)
    let intFitScore = 40;
    let intFitLabel: SchoolMatch["internationalFit"] = "Unknown";
    if (school.ownership === "Public") {
      intFitScore = 75; intFitLabel = "Likely Yes";
    } else if (school.ownership === "Private nonprofit") {
      intFitScore = 65; intFitLabel = "Likely Yes";
    } else if (school.ownership === "Private for-profit") {
      intFitScore = 40; intFitLabel = "Unknown";
    }
    rawScore += (intFitScore / 100) * 3;

    // 6. Apply Penalties + PhD research-university requirement
    let penalty = 0;
    let cap = 100;

    if (isUndergrad) {
      penalty = getUndergradRiskPenalty(profile);
      cap = getUndergradCap(profile);
    } else {
      penalty = getPostgradRiskPenalty(profile);
      cap = getPostgradCap(profile);
    }

    // PhD-specific: apply a heavy penalty to schools that are not
    // recognisable research universities.  A school that has passed
    // field-compat checks but has no "university" signal is unlikely
    // to run a doctoral programme - push it below the Exploratory threshold.
    if (isPhd && !/university|institute of technology|polytechnic/i.test(school.name)) {
      penalty += 25;
    }

    // Personalization tiebreaker: small deterministic jitter (-1.5 to +1.5)
    // seeded by (profile, school). Tied schools shuffle slightly between
    // different profiles without changing the broader ranking.
    const seed = profileSeed + "::" + String(school.unitId ?? school.name ?? "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const personalization = ((h % 30) - 15) / 10;

    let finalScore = rawScore - penalty + personalization;
    finalScore = Math.min(finalScore, cap);

    // Clamp and round
    finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

    // TASK 11: Categories mapping
    let category: SchoolMatch["category"] = "Not Recommended";
    if (finalScore >= 80) category = "Strong Fit";
    else if (finalScore >= 65) category = "Good Fit";
    else if (finalScore >= 50) category = "Exploratory Fit";

    matches.push({
      school,
      matchScore: finalScore,
      category,
      budgetFit,
      academicFit: academic.label as any,
      locationFit,
      majorFit: majorFitLabel,
      internationalFit: intFitLabel,
      admissionLikelihood: Math.round(admissionLikelihood),
      admissionBucket,
    });
  }

  return matches.sort((a, b) => b.matchScore - a.matchScore);
}
