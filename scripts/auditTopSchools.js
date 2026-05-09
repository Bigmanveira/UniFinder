/**
 * auditTopSchools.js
 *
 * Read-only diagnostic. Checks whether well-known top-tier U.S. universities
 * have a verified `computer_science` undergraduate program record in our
 * `programs` collection. Reveals whether the program-gate is excluding them.
 *
 * Usage: node scripts/auditTopSchools.js
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

// IPEDS UNITIDs for well-known top-tier U.S. universities
const TOP_SCHOOLS = [
  { name: 'Harvard',                 unitId: '166027' },
  { name: 'Yale',                    unitId: '130794' },
  { name: 'Princeton',               unitId: '186131' },
  { name: 'MIT',                     unitId: '166683' },
  { name: 'Stanford',                unitId: '243744' },
  { name: 'Caltech',                 unitId: '110404' },
  { name: 'UC Berkeley',             unitId: '110635' },
  { name: 'Carnegie Mellon',         unitId: '211440' },
  { name: 'UCLA',                    unitId: '110662' },
  { name: 'Columbia',                unitId: '190150' },
  { name: 'Cornell',                 unitId: '190415' },
  { name: 'Brown',                   unitId: '217156' },
  { name: 'Duke',                    unitId: '198419' },
  { name: 'UPenn',                   unitId: '215062' },
  { name: 'Dartmouth',               unitId: '182670' },
  { name: 'Northwestern',            unitId: '147767' },
  { name: 'University of Chicago',   unitId: '144050' },
  { name: 'Johns Hopkins',           unitId: '162928' },
  { name: 'Rice',                    unitId: '227757' },
  { name: 'Vanderbilt',              unitId: '221999' },
];

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Top-school program-gate audit (computer_science x undergrad)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // First: pull all programs for the user's likely CS query
  console.log('Querying programs where normalizedField=computer_science AND credentialLevel=undergraduate AND status=active...');
  const csUgrad = await db.collection('programs')
    .where('normalizedField', '==', 'computer_science')
    .where('credentialLevel',  '==', 'undergraduate')
    .where('status',           '==', 'active')
    .get();

  const eligibleSet = new Set();
  csUgrad.forEach(d => {
    const u = d.data().unitId;
    if (u) eligibleSet.add(String(u));
  });
  console.log(`   ${csUgrad.size} undergrad CS program records, ${eligibleSet.size} unique unitIds.\n`);

  // Per-school check
  console.log('school                          present?  schools_active?  cs-program records');
  console.log('-'.repeat(90));
  for (const s of TOP_SCHOOLS) {
    const inGate = eligibleSet.has(s.unitId);

    // Look up the school doc itself
    const schoolDoc = await db.collection('schools').doc(s.unitId).get();
    const schoolActive = schoolDoc.exists ? schoolDoc.data().status === 'active' : false;
    const schoolName = schoolDoc.exists ? schoolDoc.data().name : '(school doc missing)';

    // Find ALL program records for this school regardless of field/level
    const allProgs = await db.collection('programs')
      .where('unitId', '==', s.unitId)
      .get();
    const progDigest = [];
    allProgs.forEach(d => {
      const r = d.data();
      progDigest.push(`${r.normalizedField}/${r.credentialLevel} (cip ${r.cipCode})`);
    });

    const presentMark = inGate ? '✅ YES' : '❌ NO ';
    const activeMark  = schoolActive ? '✅' : '❌';
    console.log(
      `${s.name.padEnd(30)}  ${presentMark}    ${activeMark}                ${schoolName}`
    );
    if (progDigest.length === 0) {
      console.log(`                                                         (no program records at all)`);
    } else if (progDigest.length <= 6) {
      progDigest.forEach(p => console.log(`                                                         ${p}`));
    } else {
      progDigest.slice(0, 6).forEach(p => console.log(`                                                         ${p}`));
      console.log(`                                                         ... +${progDigest.length - 6} more`);
    }
  }
  console.log('');
}

main().then(() => process.exit(0)).catch(e => { console.error('❌', e); process.exit(1); });
