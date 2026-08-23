/**
 * backfillUsersFromAuth.mjs — one-time repair, safe to re-run (idempotent).
 *
 * Mirrors what the extended reconcileUserAuthDirectory callable now does
 * (ops portal → Dashboard → "Firebase Auth directory sync" → Apply):
 *   1. Create /users docs for Auth accounts that never got one because the
 *      client bootstrap was rejected by security rules (it sent the
 *      protected `role` key). Ops-admin accounts (admin custom claim) are
 *      skipped. welcomeEmailSuppressed:true stops the deployed
 *      onUserCreated trigger from sending months-late welcome emails
 *      (the signup-credit wallet grant still runs).
 *   2. Realign createdAt with Firebase Auth's creationTime wherever the old
 *      sign-in stomping bug drifted it by >1h, or where it is missing.
 *
 * IMPORTANT: run only AFTER the updated onUserCreated function is deployed
 * (deployed 2026-08-23 — already true).
 *
 * Usage:  node scripts/backfillUsersFromAuth.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
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
const auth = getAuth();

const authUsers = new Map();
let token;
do {
  const page = await auth.listUsers(1000, token);
  for (const u of page.users) authUsers.set(u.uid, u);
  token = page.pageToken;
} while (token);

const usersSnap = await db.collection('users').get();
const existing = new Map(usersSnap.docs.map(d => [d.id, d.data()]));

// 1. Missing docs
let created = 0;
for (const [uid, u] of authUsers) {
  if (existing.has(uid)) continue;
  if (u.customClaims?.admin === true) { console.log(`skip admin: ${u.email}`); continue; }
  await db.collection('users').doc(uid).set({
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    photoURL: u.photoURL ?? null,
    createdAt: Timestamp.fromDate(new Date(u.metadata.creationTime)),
    welcomeEmailSuppressed: true,
    backfilledFromAuthAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  created++;
  console.log(`created /users/${uid.slice(0, 8)}… ${u.email} (signup ${u.metadata.creationTime})`);
}

// 2. createdAt repair
const HOUR = 3600 * 1000;
let repaired = 0;
for (const [uid, data] of existing) {
  const u = authUsers.get(uid);
  if (!u) continue; // orphan (auth deleted) — leave as-is
  const authMs = new Date(u.metadata.creationTime).getTime();
  const raw = data.createdAt;
  const curMs = raw?.toMillis ? raw.toMillis() : (typeof raw === 'number' ? raw : null);
  if (curMs === null || Math.abs(curMs - authMs) > HOUR) {
    await db.collection('users').doc(uid).set({ createdAt: Timestamp.fromDate(new Date(authMs)) }, { merge: true });
    repaired++;
    console.log(`repaired createdAt /users/${uid.slice(0, 8)}… ${data.email ?? '(no email)'} -> ${u.metadata.creationTime}`);
  }
}

console.log(`\nDONE. docsCreated=${created} createdAtRepaired=${repaired}`);
process.exit(0);
