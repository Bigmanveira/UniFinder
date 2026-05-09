import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Configuration Check
const {
  VITE_FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  COLLEGE_SCORECARD_API_KEY
} = process.env;

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || VITE_FIREBASE_PROJECT_ID;

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !COLLEGE_SCORECARD_API_KEY) {
  console.error("❌ ERROR: Missing required environment variables. Please check your .env file.");
  console.error("Make sure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and COLLEGE_SCORECARD_API_KEY are set.");
  process.exit(1);
}

// Initialize Firebase Admin
const serviceAccount = {
  projectId: FIREBASE_PROJECT_ID,
  clientEmail: FIREBASE_CLIENT_EMAIL,
  privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle newlines in .env
};

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Helper to map ownership integer to string
const getOwnershipString = (code) => {
  switch (code) {
    case 1: return "Public";
    case 2: return "Private nonprofit";
    case 3: return "Private for-profit";
    default: return "Unknown";
  }
};

const PER_PAGE   = 100;  // College Scorecard maximum
const BATCH_SIZE = 400;  // Firestore batch limit (max 500)

const FIELDS = [
  "id",
  "school.name",
  "school.city",
  "school.state",
  "school.school_url",
  "school.ownership",
  "latest.admissions.admission_rate.overall",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.cost.attendance.academic_year",
].join(",");

async function fetchPage(page) {
  const url = new URL("https://api.data.gov/ed/collegescorecard/v1/schools.json");
  url.searchParams.set("api_key",         COLLEGE_SCORECARD_API_KEY);
  url.searchParams.set("school.operating","1");
  url.searchParams.set("per_page",        String(PER_PAGE));
  url.searchParams.set("page",            String(page));
  url.searchParams.set("fields",          FIELDS);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return { results: json.results || [], total: json.metadata?.total ?? 0 };
}

function buildSchoolDoc(school) {
  const unitId = String(school["id"]).trim();
  if (!unitId) return null;
  const rawUrl = school["school.school_url"];
  return {
    unitId,
    name:              school["school.name"] || "Unknown",
    city:              school["school.city"]  || null,
    state:             school["school.state"] || null,
    schoolUrl:         rawUrl ? "https://" + rawUrl.replace(/^https?:\/\//, "") : null,
    ownership:         getOwnershipString(school["school.ownership"]),
    admissionRate:     school["latest.admissions.admission_rate.overall"] ?? null,
    inStateTuition:    school["latest.cost.tuition.in_state"]              ?? null,
    outOfStateTuition: school["latest.cost.tuition.out_of_state"]          ?? null,
    averageCost:       school["latest.cost.attendance.academic_year"]      ?? null,
    source:            "College Scorecard",
    lastSyncedAt:      FieldValue.serverTimestamp(),
    status:            "active",
  };
}

async function importSchools() {
  console.log("🚀 Starting College Scorecard School Import (full pagination)...");

  const { total } = await fetchPage(0);
  const totalPages = Math.ceil(total / PER_PAGE);
  console.log(`    Total active schools: ${total} (${totalPages} pages)`);

  const docs = []; // { unitId, data }

  for (let page = 0; page < totalPages; page++) {
    let results;
    try {
      ({ results } = await fetchPage(page));
    } catch (err) {
      console.warn(`\n    ⚠️  Page ${page} failed: ${err.message}. Skipping.`);
      continue;
    }

    for (const school of results) {
      const data = buildSchoolDoc(school);
      if (data) docs.push({ unitId: data.unitId, data });
    }

    process.stdout.write(`\r    Pages fetched: ${page + 1}/${totalPages}  Records queued: ${docs.length}`);
    await new Promise(r => setTimeout(r, 200)); // gentle throttle
  }

  console.log(`\n✅  Fetched ${docs.length} school records.`);

  if (docs.length === 0) {
    console.log("No schools to write. Exiting.");
    return;
  }

  console.log(`\n📝  Writing to Firestore 'schools' collection in batches of ${BATCH_SIZE}...`);

  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { unitId, data } of chunk) {
      // merge: true preserves any manually-enriched fields on existing docs
      batch.set(db.collection("schools").doc(unitId), data, { merge: true });
      written++;
    }
    await batch.commit();
    console.log(`    Batch committed (${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length})`);
  }

  console.log(`\n🎉 Successfully imported/updated ${written} schools in Firestore.`);
}

importSchools()
  .then(() => process.exit(0))
  .catch(err => { console.error("❌ Fatal error:", err); process.exit(1); });
