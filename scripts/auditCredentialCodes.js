/**
 * auditCredentialCodes.js
 *
 * Read-only diagnostic. Prints distribution of `_raw_credential_level` across
 * all program docs to verify which credential-level scheme College Scorecard
 * actually returns.
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

async function main() {
  console.log('\nReading all program docs to audit raw credential codes...\n');
  const snap = await db.collection('programs').get();
  const dist = {};       // raw_level → count
  const titleByLevel = {}; // raw_level → first seen title
  snap.forEach(d => {
    const r = d.data();
    const lvl = r._raw_credential_level ?? 'null';
    dist[lvl] = (dist[lvl] || 0) + 1;
    if (!titleByLevel[lvl]) titleByLevel[lvl] = r._raw_credential_title || '';
  });

  console.log('raw_level   count    sample raw title');
  console.log('─'.repeat(70));
  Object.keys(dist).sort((a,b) => Number(a) - Number(b)).forEach(lvl => {
    console.log(
      String(lvl).padStart(9) + '   ' +
      String(dist[lvl]).padStart(5) + '    ' +
      titleByLevel[lvl]
    );
  });
  console.log('');
}

main().then(() => process.exit(0)).catch(e => { console.error('❌', e); process.exit(1); });
