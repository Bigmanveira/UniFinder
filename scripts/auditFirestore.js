/**
 * auditFirestore.js
 *
 * Read-only diagnostic. Prints:
 *   • Total active schools
 *   • Total programs
 *   • Program counts grouped by normalizedField × credentialLevel
 *
 * Usage:  node scripts/auditFirestore.js
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

initializeApp({
  credential: cert({
    projectId:   FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Firestore audit — project: ${FIREBASE_PROJECT_ID}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // ── Schools ────────────────────────────────────────────────────────────────
  const schoolsAll    = await db.collection('schools').count().get();
  const schoolsActive = await db.collection('schools').where('status', '==', 'active').count().get();
  console.log(`Schools collection`);
  console.log(`  • Total docs:    ${schoolsAll.data().count}`);
  console.log(`  • status=active: ${schoolsActive.data().count}`);
  console.log('');

  // ── Programs ───────────────────────────────────────────────────────────────
  const programsAll = await db.collection('programs').count().get();
  console.log(`Programs collection`);
  console.log(`  • Total docs: ${programsAll.data().count}`);
  console.log('');

  // ── Program breakdown ──────────────────────────────────────────────────────
  const FIELDS = [
    'computer_science',
    'data_science',
    'information_systems',
    'cybersecurity',
    'business_analytics',
    'business_administration',
    'electrical_engineering',
    'mechanical_engineering',
  ];
  const LEVELS = ['undergraduate', 'masters', 'doctoral'];

  console.log('Program records by field × level (status=active):');
  console.log('');
  console.log('  field                       undergrad   masters   doctoral   uniqUnits');
  console.log('  ' + '─'.repeat(74));

  for (const field of FIELDS) {
    const counts = {};
    let unitIds  = new Set();

    for (const level of LEVELS) {
      const snap = await db
        .collection('programs')
        .where('normalizedField',  '==', field)
        .where('credentialLevel',  '==', level)
        .where('status',           '==', 'active')
        .get();
      counts[level] = snap.size;
      snap.forEach(d => {
        const u = d.data().unitId;
        if (u) unitIds.add(String(u));
      });
    }

    const row = field.padEnd(28) +
      String(counts.undergraduate || 0).padStart(8) + '   ' +
      String(counts.masters       || 0).padStart(7) + '   ' +
      String(counts.doctoral      || 0).padStart(8) + '   ' +
      String(unitIds.size).padStart(9);
    console.log('  ' + row);
  }
  console.log('');

  // ── Quick PhD-CS sample ────────────────────────────────────────────────────
  console.log('Sample of 5 PhD Computer Science schools:');
  const sample = await db
    .collection('programs')
    .where('normalizedField',  '==', 'computer_science')
    .where('credentialLevel',  '==', 'doctoral')
    .where('status',           '==', 'active')
    .limit(5)
    .get();
  sample.forEach(d => {
    const r = d.data();
    console.log(`  • ${r.schoolName}  (unitId ${r.unitId}, cip ${r.cipCode})`);
  });
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('❌', e); process.exit(1); });
