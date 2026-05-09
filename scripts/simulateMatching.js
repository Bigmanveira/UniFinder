/**
 * simulateMatching.js
 *
 * End-to-end diagnostic. Loads schools + program-eligibility from Firestore
 * and runs the same scoring + bucketing logic the frontend uses, for a
 * synthetic 4.0 / 1600 SAT undergraduate CS applicant. Reports the top 10
 * grouped by Reach / Target / Safety so we can verify Ivies surface.
 *
 * Mirrors src/lib/matching/matchSchools.ts exactly. Update both together.
 *
 * Usage: node scripts/simulateMatching.js
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

initializeApp({
  credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore();

// Test profile: 4.0 GPA, 1600 SAT, US, undergraduate Computer Science, Self-Funded
const profile = {
  level:          'Undergraduate',
  field:          'Computer Science',
  gpa:            '4.0',
  gradingSystem:  'GPA (4.0 scale)',
  testType:       'SAT',
  testScores:     '1600',
  funding:        'Self-Funded',
  destination:    'us United States (USA)',
};

// ── Mirror of src/lib/matching/matchSchools.ts ────────────────────────────────

function parseGpa(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  if (isNaN(n) || n < 0 || n > 4.0) return null;
  return n;
}
function parseSat(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 400 || n > 1600) return null;
  return n;
}

function getApplicantStrength(p) {
  const gpa = parseGpa(p.gpa);
  const sat = parseSat(p.testScores);
  let gpaPct = null, testPct = null;
  if (gpa !== null) {
    if (gpa >= 3.9)      gpaPct = 95;
    else if (gpa >= 3.7) gpaPct = 88;
    else if (gpa >= 3.4) gpaPct = 78;
    else if (gpa >= 3.0) gpaPct = 65;
    else if (gpa >= 2.5) gpaPct = 50;
    else                 gpaPct = 30;
  }
  if (sat !== null) {
    if (sat >= 1500)      testPct = 95;
    else if (sat >= 1400) testPct = 88;
    else if (sat >= 1300) testPct = 78;
    else if (sat >= 1200) testPct = 65;
    else if (sat >= 1100) testPct = 55;
    else                  testPct = 40;
  }
  const sigs = [gpaPct, testPct].filter(v => v !== null);
  if (sigs.length === 0) return 50;
  return sigs.reduce((a, b) => a + b, 0) / sigs.length;
}
function getAdmissionLikelihood(p, school) {
  const strength = getApplicantStrength(p);
  const admRate = school.admissionRate;
  // Treat both null and 0 as "unknown" — data anomaly
  if (admRate == null || admRate === 0) {
    return Math.max(0, Math.min(100, 50 + (strength - 50) * 0.5));
  }
  return Math.max(0, Math.min(100, admRate * 100 + (strength - 50) * 0.7));
}

// Community-college / 2-year detector (mirror of getSchools.ts)
const TWO_YEAR_PATTERNS = [
  /\bcommunity college\b/i,
  /\bjunior college\b/i,
  /\btechnical college\b/i,
  /\bvocational\b/i,
  /\bcc\b/i,
  /\bctc\b/i,
  /\b(county|city|area)\s+college\b/i,
  /\bmilitary institute\b/i,
  /\bpreparatory school\b/i,
];
function isCommunityCollege(school) {
  if (TWO_YEAR_PATTERNS.some(p => p.test(school.name))) return true;
  if (school.institutionLevel) {
    return school.institutionLevel === 'two-year' || school.institutionLevel === 'less-than-two-year';
  }
  return false;
}
function bucketFor(l) {
  if (l < 50) return 'reach';
  if (l < 75) return 'target';
  return 'safety';
}
function scoreUgAcademic(p, school) {
  const gpa = parseGpa(p.gpa);
  const sat = parseSat(p.testScores);
  const admRate = school.admissionRate;
  if (gpa === null && sat === null) return { score: 40, label: 'Limited Data' };

  let satScore = 0;
  if (sat !== null) {
    if (sat >= 1450) satScore = 95;
    else if (sat >= 1350) satScore = 88;
    else if (sat >= 1250) satScore = 78;
    else if (sat >= 1150) satScore = 68;
    else if (sat >= 1050) satScore = 58;
    else if (sat >= 950)  satScore = 45;
    else                  satScore = 30;
  }
  let gpaScore = 0;
  if (gpa !== null) {
    if (gpa >= 3.7) gpaScore = 95;
    else if (gpa >= 3.4) gpaScore = 88;
    else if (gpa >= 3.0) gpaScore = 75;
    else if (gpa >= 2.5) gpaScore = 58;
    else if (gpa >= 2.0) gpaScore = 35;
    else                 gpaScore = 20;
  }
  const sigs = [];
  if (sat !== null) sigs.push(satScore);
  if (gpa !== null) sigs.push(gpaScore);
  let raw = sigs.reduce((a, b) => a + b, 0) / sigs.length;
  let label = 'Unknown';
  if (admRate != null) {
    if (admRate < 0.25) {
      if (raw >= 90) label = 'Target';
      else if (raw >= 80) label = 'Reach';
      else label = 'High Reach';
      raw -= 10;
    } else if (admRate < 0.5) {
      if (raw >= 85) label = 'Likely';
      else if (raw >= 75) label = 'Target';
      else if (raw >= 60) label = 'Reach';
      else label = 'High Reach';
    } else if (admRate < 0.75) {
      if (raw >= 75) label = 'Likely';
      else if (raw >= 60) label = 'Target';
      else if (raw >= 45) label = 'Reach';
      else label = 'High Reach';
    } else {
      if (raw >= 55) label = 'Likely';
      else if (raw >= 40) label = 'Target';
      else label = 'Reach';
    }
  } else {
    if (raw >= 80) label = 'Competitive';
    else if (raw >= 60) label = 'Possible';
    else label = 'Reach';
  }
  return { score: Math.max(10, Math.min(100, raw)), label };
}

function getFieldFitScore(school, fieldStr) {
  const STEM = ['computer', 'computing', 'software', 'engineering', 'data', 'cyber',
    'information technology', 'information science', 'mathematics', 'physics',
    'chemistry', 'biology', 'biomedical', 'aerospace', 'electrical', 'mechanical'];
  const isStem = STEM.some(k => fieldStr.includes(k));
  if (isStem) {
    if (/tech|polytechnic|institute of technology/i.test(school.name)) return 90;
    if (/university/i.test(school.name)) return 70;
  }
  if (/university/i.test(school.name)) return 55;
  if (/college/i.test(school.name)) return 40;
  return 30;
}

function score(profile, school) {
  let raw = 0;
  let maxBudget = 60000; // Self-Funded
  const knownCost = school.averageCost ?? school.outOfStateTuition ?? school.inStateTuition;
  const cost = knownCost ?? 40000;
  let budgetFit, budgetWeight;
  if      (cost <= maxBudget * 0.8) { budgetFit = 'Excellent';    budgetWeight = 1.00; }
  else if (cost <= maxBudget)        { budgetFit = 'Good';         budgetWeight = 0.85; }
  else if (cost <= maxBudget * 1.2)  { budgetFit = 'Stretch';      budgetWeight = 0.55; }
  else                               { budgetFit = 'Out of Budget'; budgetWeight = 0.30; }
  raw += budgetWeight * 15;
  if (knownCost == null) raw -= 2;

  const academic = scoreUgAcademic(profile, school);
  raw += (academic.score / 100) * 40;

  const likelihood = getAdmissionLikelihood(profile, school);
  raw += (likelihood / 100) * 25;
  if (school.admissionRate == null || school.admissionRate === 0) raw -= 6;

  raw += 10; // location US
  raw += (getFieldFitScore(school, profile.field.toLowerCase()) / 100) * 7;

  let intFit = 40;
  if (school.ownership === 'Public')           intFit = 75;
  else if (school.ownership === 'Private nonprofit') intFit = 65;
  raw += (intFit / 100) * 3;

  return {
    school,
    matchScore: Math.max(0, Math.min(100, Math.round(raw))),
    budgetFit,
    academicLabel: academic.label,
    academicScore: academic.score,
    admissionLikelihood: Math.round(likelihood),
    admissionBucket: bucketFor(likelihood),
  };
}

async function main() {
  console.log('\nLoading schools and CS-undergrad eligibility...\n');
  const [schoolsSnap, progsSnap] = await Promise.all([
    db.collection('schools').where('status', '==', 'active').get(),
    db.collection('programs')
      .where('normalizedField', '==', 'computer_science')
      .where('credentialLevel', '==', 'undergraduate')
      .where('status', '==', 'active')
      .get(),
  ]);
  const schools = [];
  schoolsSnap.forEach(d => schools.push(d.data()));
  const eligible = new Set();
  progsSnap.forEach(d => { const u = d.data().unitId; if (u) eligible.add(String(u)); });

  console.log(`${schools.length} active schools loaded; ${eligible.size} unitIds in CS-undergrad gate.`);

  // Filter + score (mirror real matcher's hard-filters)
  const matches = [];
  let droppedCC = 0;
  for (const s of schools) {
    if (!eligible.has(String(s.unitId))) continue;
    // Undergraduate applicants don't want community / 2-year colleges
    if (isCommunityCollege(s)) { droppedCC++; continue; }
    matches.push(score(profile, s));
  }
  console.log(`Excluded ${droppedCC} community / 2-year colleges (real matcher does this too).`);
  matches.sort((a, b) => b.matchScore - a.matchScore);

  // Bucketize
  const reach = matches.filter(m => m.admissionBucket === 'reach');
  const target = matches.filter(m => m.admissionBucket === 'target');
  const safety = matches.filter(m => m.admissionBucket === 'safety');

  // Treat 0 and null admit rate as the same sentinel so they sort to the end
  const rateOrSentinel = (s, fallback) =>
    (s.admissionRate == null || s.admissionRate === 0) ? fallback : s.admissionRate;

  reach.sort((a, b) => {
    const aRate = rateOrSentinel(a.school, 1);
    const bRate = rateOrSentinel(b.school, 1);
    if (aRate !== bRate) return aRate - bRate;
    return b.matchScore - a.matchScore;
  });
  target.sort((a, b) => {
    const d = b.matchScore - a.matchScore;
    if (d !== 0) return d;
    return rateOrSentinel(a.school, 1) - rateOrSentinel(b.school, 1);
  });
  safety.sort((a, b) => {
    const d = b.matchScore - a.matchScore;
    if (d !== 0) return d;
    return rateOrSentinel(b.school, 0) - rateOrSentinel(a.school, 0);
  });

  const pickedReach  = reach.slice(0, 3);
  const pickedTarget = target.slice(0, 4);
  const pickedSafety = safety.slice(0, 3);

  console.log(`\n${reach.length} reach / ${target.length} target / ${safety.length} safety eligible.`);

  const printRow = (m, i) => {
    const admit = m.school.admissionRate != null ? `${(m.school.admissionRate * 100).toFixed(0)}%`.padStart(4) : '   —';
    const cost = m.school.outOfStateTuition ?? m.school.averageCost ?? '—';
    console.log(`  ${(i + 1).toString().padStart(2)}. ${m.school.name.padEnd(45)}  match=${String(m.matchScore).padStart(2)}  admit=${admit}  odds=${String(m.admissionLikelihood).padStart(3)}  ${m.budgetFit.padEnd(13)}  $${cost}`);
  };

  console.log('\n=== TOP 10 (3 reach / 4 target / 3 safety) ===');
  console.log('\nREACH');
  pickedReach.forEach(printRow);
  console.log('\nTARGET');
  pickedTarget.forEach(printRow);
  console.log('\nSAFETY');
  pickedSafety.forEach(printRow);

  console.log('\n=== Top 15 by matchScore (sanity) ===');
  matches.slice(0, 15).forEach(printRow);
}

main().then(() => process.exit(0)).catch(e => { console.error('❌', e); process.exit(1); });
