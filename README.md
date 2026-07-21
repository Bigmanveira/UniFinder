# UniFinder React + Vite App

## Firebase Setup Instructions
To run this application properly, you must configure your Firebase project.

### 1. Enable Firebase Authentication
1. Go to your Firebase Console.
2. Navigate to **Authentication** > **Sign-in method**.
3. Enable **Email/Password**.
4. Enable **Google** (you will need to provide a support email).

### 2. Enable Firestore Database
1. Go to **Firestore Database** in the Firebase Console.
2. Click **Create database** (choose your preferred region, e.g., `us-central1`).
3. Start in **Production mode** (all reads/writes denied by default).
4. Go to the **Rules** tab and paste the contents of `firestore.rules` from this repository.
5. Click **Publish**.

### 3. Setup Environment Variables
1. Rename the `.env` file or ensure it contains your Firebase configuration.
2. **Never** commit your production keys to public version control.

*(Development Sample Data Note: If you are seeding mock universities later, ensure you are only seeding to a dev environment and not writing to a live production database.)*

## Importing School Data (Developer Only)
The application relies on a curated database of U.S. University programs. To bootstrap your Firestore database with real data, we have provided an automated import script that pulls from the official U.S. Department of Education College Scorecard API.

**WARNING: This script is for developer use only. It interacts directly with production Firebase environments and external APIs.**

### 1. Get an API Key
1. Go to [College Scorecard API documentation](https://collegescorecard.ed.gov/data/api-documentation/).
2. Request an API key.
3. Add `COLLEGE_SCORECARD_API_KEY=your_key_here` to your `.env` file.

### 2. Get Firebase Admin Credentials
Because this is a server-side script, it requires a Service Account key (not just the public client keys).
1. Go to your Firebase Console > **Project Settings** > **Service accounts**.
2. Click **Generate new private key**.
3. Open the downloaded JSON file and extract the `client_email` and `private_key`.
4. Add them to your `.env` file:
   ```env
   FIREBASE_CLIENT_EMAIL=your-service-account-email@gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n"
   ```

### 3. Run the Script
To run the safe, rate-limited import pipeline (50 schools max):
```bash
node scripts/importCollegeScorecardSchools.js
```

---

## Importing Program Data (Developer Only)

The `programs` Firestore collection is the **single source of truth** for "does
school X actually offer field Y at level Z?". Without it, the matcher would have to
guess from the school's name — which produced bad results like recommending Amridge
or Selma for a PhD in Computer Science.

### Product rule

> No verified program fit = no recommendation.

This rule is enforced in **two places**:

1. **Frontend preview** — `getDeterministicMatches` in
   [src/lib/matching/matchSchools.ts](src/lib/matching/matchSchools.ts) hard-filters
   schools by the eligible-`unitId` set returned by
   [src/lib/programs/getPrograms.ts](src/lib/programs/getPrograms.ts).
2. **Backend unlock** — `unlockMatchReport` in
   [functions/src/index.ts](functions/src/index.ts) re-runs the same gate against
   Firestore. If no eligible records exist:
   - **No credit is deducted**.
   - **Claude is not called**.
   - The function returns `{ noEligiblePrograms: true }`.

The Claude prompt in
[functions/src/claudeExplainMatches.ts](functions/src/claudeExplainMatches.ts)
explicitly states *"Program availability has already been verified… Do NOT infer,
question, or re-evaluate program availability. Do NOT add schools."* Claude never
decides program availability — it only describes the verified matches passed to it.

### 1. Get the College Scorecard API key

Same key as the schools importer (api.data.gov free key). If you already have
`COLLEGE_SCORECARD_API_KEY` in your `.env`, skip ahead.

### 2. Set environment variables

The program importer reads the same four variables as the schools importer:

```env
COLLEGE_SCORECARD_API_KEY=...
FIREBASE_PROJECT_ID=your-project-id              # or VITE_FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL=service-account@...gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 3. Run a narrow first import — PhD Computer Science only

The default config is intentionally narrow so your first run is small and easy to
verify:

```bash
node scripts/importCollegeScorecardPrograms.js
```

This writes to the `programs` collection with:

- **Doc ID format**: `${unitId}_${normalizedField}_${credentialLevel}`
  e.g. `123456_computer_science_doctoral` — deterministic, so re-runs upsert
  cleanly.
- **Filter**: `normalizedField == "computer_science"`,
  `credentialLevel == "doctoral"`, capped at `IMPORT_LIMIT = 500` records.
- **Source**: `"college_scorecard_field_of_study"`.

Expected output ends with:

```
✅  Import complete!
📊  Written:  N program records
⏭️   Skipped:  0 manually-verified records (preserved)
```

In the Firestore console, open `programs` and filter:

```
normalizedField == "computer_science"
credentialLevel == "doctoral"
status == "active"
```

Every doc returned is now a school the matcher is *allowed* to recommend for a PhD
CS applicant.

### 4. Deploy the composite index

The gate query uses three equality filters
(`normalizedField`, `credentialLevel`, `status`), which Firestore requires a
composite index for. The index is checked into
[firestore.indexes.json](firestore.indexes.json). Deploy it once:

```bash
firebase deploy --only firestore:indexes
```

If you skip this, the frontend gate throws a `failed-precondition` error in the
browser console.

### 5. Expand to more fields and levels

Edit the two arrays near the top of
[scripts/importCollegeScorecardPrograms.js](scripts/importCollegeScorecardPrograms.js):

```js
const TARGET_FIELDS = [
  "computer_science",
  "data_science",
  "information_systems",
  "cybersecurity",
  "business_analytics",
  "business_administration",
  "electrical_engineering",
  "mechanical_engineering",
];

const TARGET_CREDENTIAL_LEVELS = [
  "undergraduate",
  "masters",
  "doctoral",
];
```

Re-run the script. Existing records are upserted via deterministic doc IDs, so
re-running is idempotent.

To add a brand-new normalised field, add **three** things:

1. A new key in `TARGET_FIELDS`.
2. The CIP-code 4-digit prefixes for that field in `CIP_TARGET_MAP`. Look these
   up in the official
   [CIP code listing](https://nces.ed.gov/ipeds/cipcode/Default.aspx?y=56).
3. A matching `if (f.includes("…")) return "…"` clause in **both**
   `normaliseProfileField()` functions:
   - [src/lib/programs/getPrograms.ts](src/lib/programs/getPrograms.ts) (frontend)
   - [functions/src/index.ts](functions/src/index.ts) (backend)

If you skip step 3, the gate silently fails to enforce for that field because the
profile text won't normalise to the new key.

### 6. What field-of-study data does and doesn't prove

| Field-of-study confirms | You must still verify on the official program page |
| --- | --- |
| Recent credentials awarded in this CIP code at this level | Exact program title and concentration |
| At least one enrolled student in this program | Application deadlines, term start dates |
| The credential level (Bachelor's / Master's / Doctoral) | Test requirements (GRE waivers, etc.) |
|  | Funding (assistantships, fellowships, fee waivers) |
|  | Whether the program is currently accepting applications |

### 7. Manual-enrichment safety

Records with `source == "manual_verified"` are detected and **never overwritten**.
Manually curated `programUrl`, notes, and any other enrichment fields stay intact
on re-import.

---

## Manual test cases for the program gate

Run these three end-to-end tests through the live app after each
significant change to the gate logic.

### Test 1 — PhD Computer Science *with* imported records

**Steps**
1. Start the wizard at `/wizard`.
2. Set Degree Level = `PhD`, Intended Major = `Computer Science`.
3. Fill in any GPA / GRE / funding values.
4. Submit and reach the locked preview at `/results`.

**Expected**
- Every preview card corresponds to a school whose `unitId` is in `programs` with
  `normalizedField == "computer_science"` AND `credentialLevel == "doctoral"`.
- **Amridge University**, **Selma University**, and **Marion Military Institute**
  must NOT appear, even if they pass budget / GPA / GRE filters.
- Click "Unlock". A credit is deducted, the match report is created, and Claude
  explains the same set of schools.

### Test 2 — PhD Computer Science *when `programs` is empty*

**Steps**
1. In a dev environment, delete every doc in the `programs` collection (or run
   the test before seeding).
2. Repeat the wizard flow with PhD + Computer Science.

**Expected**
- Preview shows the empty-state card: *"No verified programs for Computer Science
  (PhD)…"*.
- If the user clicks Unlock anyway, `unlockMatchReport` returns
  `{ noEligiblePrograms: true }` and:
  - **No credit is deducted** — verify by checking `creditWallets/{uid}` before
    and after.
  - **No Claude call is made** — verify by checking that no new doc appears in
    `aiRuns` for this user.
  - **No `matchReports` doc is created**.
  - The preview shows the friendly "no eligible programs" error.

### Test 3 — Master's Computer Science

**Steps**
1. Expand `TARGET_CREDENTIAL_LEVELS` to include `"masters"` and re-run the
   importer.
2. Run the wizard with Degree Level = `Master's`, Intended Major =
   `Computer Science`.

**Expected**
- Only schools with `programs` docs at `normalizedField == "computer_science"`
  AND `credentialLevel == "masters"` appear. PhD-only schools are excluded.
- A school that offers both Master's and Doctoral CS appears (because two `programs`
  docs exist for it — one per credential level).

### Common failure modes

- **Firestore `failed-precondition`**: composite index not deployed
  (`firebase deploy --only firestore:indexes`).
- **Gate quietly disabled**: the frontend and backend `normaliseProfileField`
  mappings have drifted out of sync — both must produce the same key for the
  same input.
- **Gate matches nothing for a real field**: `programs` documents are missing
  the `unitId` field, so the unit-id intersection is empty.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
