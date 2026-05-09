/**
 * wipeImportedPrograms.js
 *
 * Deletes every doc in `programs` whose source is "college_scorecard_field_of_study".
 * Preserves any future "manual_verified" records.
 *
 * Use when re-importing after a mapping fix.
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
const BATCH_SIZE = 400;

async function main() {
  console.log('Querying programs where source = "college_scorecard_field_of_study"...');
  const snap = await db
    .collection('programs')
    .where('source', '==', 'college_scorecard_field_of_study')
    .get();

  console.log(`Found ${snap.size} docs to delete.`);
  if (snap.empty) return;

  let deleted = 0;
  let chunk = [];
  for (const doc of snap.docs) {
    chunk.push(doc.ref);
    if (chunk.length >= BATCH_SIZE) {
      const batch = db.batch();
      chunk.forEach(ref => batch.delete(ref));
      await batch.commit();
      deleted += chunk.length;
      console.log(`  Deleted ${deleted}/${snap.size}`);
      chunk = [];
    }
  }
  if (chunk.length) {
    const batch = db.batch();
    chunk.forEach(ref => batch.delete(ref));
    await batch.commit();
    deleted += chunk.length;
  }
  console.log(`✅  Deleted ${deleted} program docs.`);
}

main().then(() => process.exit(0)).catch(e => { console.error('❌', e); process.exit(1); });
