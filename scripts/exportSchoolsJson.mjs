/**
 * exportSchoolsJson.mjs — dump the active schools collection to
 * public/schools-v1.json so the client fetches ONE static, CDN-cached,
 * brotli-compressed file instead of streaming ~6,200 Firestore documents
 * on every first visit (multi-MB over cellular + a big main-thread parse).
 *
 * Safe to re-run any time the schools collection changes; run it before
 * deploying so the bundled file stays fresh:
 *
 *   node scripts/exportSchoolsJson.mjs && npx vercel --prod --yes
 *
 * The client (src/lib/schools/getSchools.ts) still falls back to the live
 * Firestore query if this file is missing or unparseable, so a stale or
 * failed export can never take matching down.
 *
 * lastSyncedAt is dropped (an 80-byte timestamp object per doc — ~0.5 MB
 * across the collection — that no client code reads).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
if (projectId !== 'unifinder-dev-d61aa') {
  console.error(`Refusing to run against project "${projectId}"`);
  process.exit(1);
}
initializeApp({ credential: cert({
  projectId,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
}) });
const db = getFirestore();

const snap = await db.collection('schools').where('status', '==', 'active').get();
const schools = [];
snap.forEach((doc) => {
  const { lastSyncedAt, ...rest } = doc.data();
  schools.push(rest);
});
schools.sort((a, b) => a.name.localeCompare(b.name));

const outPath = path.resolve(__dirname, '../public/schools-v1.json');
writeFileSync(outPath, JSON.stringify(schools));
const kb = Math.round(JSON.stringify(schools).length / 1024);
console.log(`Wrote ${schools.length} active schools (${kb} KB raw) to public/schools-v1.json`);
