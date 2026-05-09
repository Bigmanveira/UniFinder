/**
 * importCollegeScorecardPrograms.js
 *
 * Fetches field-of-study / program data from the College Scorecard API and
 * writes matching records into the Firestore `programs` collection.
 *
 * Usage:
 *   node scripts/importCollegeScorecardPrograms.js
 *
 * Environment variables required (add to .env):
 *   COLLEGE_SCORECARD_API_KEY   — from https://api.data.gov/signup
 *   FIREBASE_PROJECT_ID         — your Firebase project id
 *   FIREBASE_CLIENT_EMAIL       — service account client_email
 *   FIREBASE_PRIVATE_KEY        — service account private_key
 *
 * See README.md → "Importing Program Data" for full instructions.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ─────────────────────────────────────────────────────────────────────────────
// Environment setup
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const {
  COLLEGE_SCORECARD_API_KEY,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
} = process.env;

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !COLLEGE_SCORECARD_API_KEY) {
  console.error('❌  Missing required environment variables.');
  console.error('    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, COLLEGE_SCORECARD_API_KEY must all be set.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Admin init
// ─────────────────────────────────────────────────────────────────────────────

initializeApp({
  credential: cert({
    projectId:   FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

// ─────────────────────────────────────────────────────────────────────────────
// Import configuration — change these to expand coverage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalised field keys to import.
 * Add more keys here and supply matching CIP families/codes in CIP_TARGET_MAP.
 */
const TARGET_FIELDS = [
  'computer_science',
  'data_science',
  'information_systems',
  'cybersecurity',
  'business_analytics',
  'business_administration',
  'electrical_engineering',
  'mechanical_engineering',
];

/**
 * Credential levels to import.
 *
 * The actual codes returned by `latest.programs.cip_4_digit.credential.level`
 * (verified empirically against the Stanford record):
 *   1 → Undergraduate Cert
 *   2 → Associate's Degree
 *   3 → Bachelor's Degree
 *   4 → Post-baccalaureate Certificate
 *   5 → Master's Degree
 *   6 → Doctoral Degree           ← PhD
 *   7 → First Professional Degree (JD, MD, DDS, etc.)
 *   8 → Graduate/Professional Certificate
 *
 * "professional" is imported but kept distinct from "doctoral" so a PhD-CS
 * applicant is never matched to a JD program (and vice versa).
 */
const TARGET_CREDENTIAL_LEVELS = [
  'undergraduate',
  'masters',
  'doctoral',
];

/** Maximum records to write per run. Infinity = no cap. */
const IMPORT_LIMIT = Infinity;

/** Firestore batch-commit size (max 500 per Firestore rule). */
const BATCH_SIZE = 400;

// ─────────────────────────────────────────────────────────────────────────────
// CIP target map
// Maps a normalised field key → array of CIP 4-digit code prefixes to include.
// College Scorecard returns cip_4_digit codes like "1107", "1101", etc.
// ─────────────────────────────────────────────────────────────────────────────

const CIP_TARGET_MAP = {
  // Many top universities (Yale, JHU, Rice) file undergrad CS under CIP 11.01
  // (Computer & Information Sciences, General) instead of 11.07 (Computer
  // Science specific). 11.02 (Computer Programming) is also commonly used by
  // schools without a separate CS major. Including all three captures every
  // mainstream "I want a CS degree" pathway.
  computer_science:       ['1101', '1102', '1107'],
  data_science:           ['1108', '2711'],  // CIP 11.08xx, 27.11xx
  information_systems:    ['1104'],          // CIP 11.04xx — Information Science/Studies
  cybersecurity:          ['1110'],          // CIP 11.10xx — Cybersecurity
  business_analytics:     ['5201', '1108'],  // Business Analytics / Data Analytics
  business_administration:['5202'],          // CIP 52.02xx — Business Administration
  electrical_engineering: ['1410'],          // CIP 14.10xx
  mechanical_engineering: ['1419'],          // CIP 14.19xx
};

// ─────────────────────────────────────────────────────────────────────────────
// Credential level mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a College Scorecard credential level integer to Unifinder's
 * degreeLevel / credentialLevel schema.
 *
 * @param {number|null} level
 * @returns {{ degreeLevel: string, credentialLevel: string }}
 */
function mapCredentialLevel(level) {
  // Codes verified against the live `latest.programs.cip_4_digit.credential`
  // payload (e.g. Stanford UNITID 243744 returns Bachelor's=3, Master's=5,
  // Doctoral=6, First Professional=7, Grad/Prof Cert=8).
  switch (level) {
    case 1:                                                           // Undergraduate Cert
      return { degreeLevel: 'Certificate',    credentialLevel: 'certificate'   };
    case 2:                                                           // Associate's
      return { degreeLevel: 'Undergraduate',  credentialLevel: 'undergraduate' };
    case 3:                                                           // Bachelor's
      return { degreeLevel: 'Undergraduate',  credentialLevel: 'undergraduate' };
    case 4:                                                           // Post-bacc Cert
      return { degreeLevel: 'Certificate',    credentialLevel: 'certificate'   };
    case 5:                                                           // Master's
      return { degreeLevel: 'Masters',        credentialLevel: 'masters'       };
    case 6:                                                           // Doctoral (PhD)
      return { degreeLevel: 'Doctorate',      credentialLevel: 'doctoral'      };
    case 7:                                                           // First Professional (JD/MD/DDS)
      return { degreeLevel: 'Doctorate',      credentialLevel: 'professional' };
    case 8:                                                           // Grad/Prof Cert
      return { degreeLevel: 'Certificate',    credentialLevel: 'certificate'   };
    default:
      return { degreeLevel: 'Unknown',        credentialLevel: 'unknown'       };
  }
}

/**
 * Normalises a CIP code string to a field key.
 * Returns null if the CIP code doesn't match any target field.
 *
 * @param {string} cipCode   — e.g. "1107"
 * @returns {string|null}
 */
function normalizeProgramField(cipCode) {
  if (!cipCode) return null;
  const code = String(cipCode).trim();
  for (const [field, prefixes] of Object.entries(CIP_TARGET_MAP)) {
    if (prefixes.some(prefix => code.startsWith(prefix))) {
      return field;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = 'https://api.data.gov/ed/collegescorecard/v1/schools.json';
const PER_PAGE = 100; // College Scorecard max

/**
 * Fetches one page of schools from College Scorecard, requesting the
 * cip_4_digit program array along with basic school metadata.
 *
 * @param {number} page
 * @returns {Promise<{results: any[], total: number}>}
 */
async function fetchPage(page) {
  const url = new URL(API_BASE);
  url.searchParams.set('api_key',        COLLEGE_SCORECARD_API_KEY);
  url.searchParams.set('school.operating','1');
  url.searchParams.set('per_page',       String(PER_PAGE));
  url.searchParams.set('page',           String(page));
  url.searchParams.set('fields', [
    'id',
    'school.name',
    'latest.programs.cip_4_digit',
  ].join(','));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`College Scorecard API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    results: json.results || [],
    total:   json.metadata?.total ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main import function
// ─────────────────────────────────────────────────────────────────────────────

async function importPrograms() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Unifinder — College Scorecard Program Import');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Target fields:            ${TARGET_FIELDS.join(', ')}`);
  console.log(`  Target credential levels: ${TARGET_CREDENTIAL_LEVELS.join(', ')}`);
  console.log(`  Import limit:             ${IMPORT_LIMIT}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // ── Phase 1: Fetch all pages from College Scorecard ──────────────────────
  console.log('📡  Fetching schools from College Scorecard API...');
  const { total } = await fetchPage(0); // get total first
  const totalPages = Math.ceil(total / PER_PAGE);
  console.log(`    Total schools available: ${total} (${totalPages} pages)`);

  const programRecords = []; // { docId, data }
  let pagesProcessed = 0;
  let schoolsProcessed = 0;

  for (let page = 0; page < totalPages; page++) {
    if (programRecords.length >= IMPORT_LIMIT) break;

    let results;
    try {
      ({ results } = await fetchPage(page));
    } catch (err) {
      console.warn(`    ⚠️  Page ${page} failed: ${err.message}. Skipping.`);
      continue;
    }

    for (const school of results) {
      if (programRecords.length >= IMPORT_LIMIT) break;

      const unitId     = String(school['id'] || '').trim();
      const schoolName = (school['school.name'] || '').trim();
      if (!unitId || !schoolName) continue;

      const cipPrograms = school['latest.programs.cip_4_digit'] || [];
      schoolsProcessed++;

      for (const prog of cipPrograms) {
        if (programRecords.length >= IMPORT_LIMIT) break;

        const cipCode     = String(prog?.code || '').trim();
        const cipTitle    = String(prog?.title || '').trim();
        const rawCredLevel = prog?.credential?.level ?? null;
        const credTitle   = prog?.credential?.title  || '';

        if (!cipCode) continue;

        // Map credential level
        const { degreeLevel, credentialLevel } = mapCredentialLevel(rawCredLevel);

        // Filter: only import targeted credential levels
        if (!TARGET_CREDENTIAL_LEVELS.includes(credentialLevel)) continue;

        // Map normalised field; skip if not in our target list
        const normalizedField = normalizeProgramField(cipCode);
        if (!normalizedField || !TARGET_FIELDS.includes(normalizedField)) continue;

        // Deterministic document ID — prevents duplicates on re-run
        const docId = `${unitId}_${normalizedField}_${credentialLevel}`;

        // Build CIP family (first 4 chars of code, e.g. "1107")
        const cipFamily = cipCode.slice(0, 4);

        /** @type {import('../src/types/index').Program} */
        const programData = {
          unitId,
          schoolId:        unitId,        // same as unitId for College Scorecard schools
          schoolName,
          fieldName:       cipTitle || normalizedField,
          normalizedField,
          cipCode,
          cipFamily,
          degreeLevel,
          credentialLevel,
          source:          'college_scorecard_field_of_study',
          programUrl:      null,          // enriched manually or from IPEDS later
          status:          'active',
          lastSyncedAt:    FieldValue.serverTimestamp(),
          // Store raw for debugging
          _raw_credential_level: rawCredLevel,
          _raw_credential_title: credTitle,
        };

        programRecords.push({ docId, data: programData });
      }
    }

    pagesProcessed++;
    process.stdout.write(`\r    Pages fetched: ${pagesProcessed}/${totalPages}  Records queued: ${programRecords.length}`);

    // Small delay to stay within API rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('');
  console.log(`\n✅  Fetched ${programRecords.length} program records from ${schoolsProcessed} schools.`);

  if (programRecords.length === 0) {
    console.log('⚠️  No records matched your TARGET_FIELDS / TARGET_CREDENTIAL_LEVELS. Exiting.');
    return;
  }

  // ── Phase 2: Write to Firestore in batches ───────────────────────────────
  console.log(`\n📝  Writing to Firestore 'programs' collection in batches of ${BATCH_SIZE}...`);

  let written   = 0;
  let skipped   = 0;
  let batchNum  = 0;

  for (let i = 0; i < programRecords.length; i += BATCH_SIZE) {
    const chunk = programRecords.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    batchNum++;

    for (const { docId, data } of chunk) {
      const ref = db.collection('programs').doc(docId);

      // Task 8: Do not overwrite manually verified records
      const existing = await ref.get();
      if (existing.exists && existing.data()?.source === 'manual_verified') {
        skipped++;
        continue;
      }

      // merge: true preserves any manually added fields (programUrl, notes, etc.)
      batch.set(ref, data, { merge: true });
      written++;
    }

    await batch.commit();
    console.log(`    Batch ${batchNum} committed (${Math.min(i + BATCH_SIZE, programRecords.length)}/${programRecords.length})`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  ✅  Import complete!`);
  console.log(`  📊  Written:  ${written} program records`);
  console.log(`  ⏭️   Skipped:  ${skipped} manually-verified records (preserved)`);
  console.log(`  🗂️  Fields:   ${TARGET_FIELDS.join(', ')}`);
  console.log(`  🎓  Levels:   ${TARGET_CREDENTIAL_LEVELS.join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Check Firestore console → programs collection');
  console.log('  2. Filter by normalizedField == "computer_science" and credentialLevel == "doctoral"');
  console.log('  3. Run a PhD Computer Science test in the app');
  console.log('');
}

importPrograms()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌  Fatal error:', err);
    process.exit(1);
  });
