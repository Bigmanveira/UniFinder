#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// roadmapMigration.cjs — operator-driven Firestore migration for studyRoadmaps.
//
// MANIFEST-BASED WORKFLOW (Blocker 4)
//   Three commands. Each consumes / produces a single immutable JSON
//   manifest file. One manifest = one runId = one migration.
//
//   1. PREFLIGHT (read-only, dry-run):
//        node scripts/roadmapMigration.cjs preflight \
//          --credentials ./sa.json --out manifest.json
//      Walks every studyRoadmaps doc, classifies via roadmapValidator,
//      writes the manifest:
//         { runId, generatedAt, projectId, migrationVersion,
//           templateHash, expectedCount, uids: [...sorted],
//           perDoc: { uid: { status, codes, repairs? } } }
//      Exits NON-ZERO when any doc is BLOCKED or unexpectedly SKIPPED.
//
//   2. APPLY (writes):
//        node scripts/roadmapMigration.cjs apply --manifest manifest.json \
//          --credentials ./sa.json \
//          --apply --i-understand-this-is-production
//      Consumes the manifest verbatim — no live re-enumeration. Refuses
//      to run if:
//        - projectId differs from the credentials' project
//        - templateHash differs from the current checklistTemplates.json
//        - any doc in the manifest is BLOCKED
//      Each per-doc apply: backup → update IN THE SAME TRANSACTION.
//      Idempotent: a doc that's already migrated is verified, not
//      blindly rewritten. Restartable: re-running with the same manifest
//      skips already-applied UIDs.
//
//   3. ROLLBACK (writes):
//        node scripts/roadmapMigration.cjs rollback --manifest manifest.json \
//          --credentials ./sa.json \
//          --apply --i-understand-this-is-production
//      Restores from the backup subcollection for every UID in the
//      manifest. Same idempotency + restartability rules as apply.
//
// SAFETY
//   - Dry-run preflight cannot apply.
//   - Apply / rollback require BOTH --apply and --i-understand-this-is-production.
//   - Project ID mismatch → refuse.
//   - Template hash mismatch → refuse with explicit "regenerate manifest".
//   - All writes are per-doc transactions; backup + update succeed or
//     fail together.
//   - The manifest file is the human-reviewed artifact between preflight
//     and apply.
//
// SELF-TESTS (no Firebase):
//     node scripts/roadmapMigration.cjs --self-test
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

const VALIDATOR_PATH  = path.resolve(__dirname, "lib", "roadmapValidator.cjs");
const TEMPLATES_PATH  = path.resolve(__dirname, "..", "src", "lib", "roadmap", "checklistTemplates.json");

const { classifyDoc, MAX_CHECKLIST_ITEMS, TARGET_VERSION, templateHashOf } = require(VALIDATOR_PATH);

const MIGRATION_VERSION = "v1-2026-06-09";        // bump only when migration logic changes structurally
const COLLECTION = "studyRoadmaps";
const BACKUP_COLLECTION = "studyRoadmaps_backups";
const STAGE_ORDER = [
  "discovery", "school_matching", "application",
  "admission_i20", "visa_preparation", "pre_departure",
];
const STATUS_WEIGHT = {
  not_started:      0,
  in_progress:      0.5,
  completed:        1.0,
  blocked:          0,
  needs_review:     0,
  assumed_complete: 0.85,
};

// ── Load canonical templates ──────────────────────────────────────────
let rawTemplatesText;
try {
  rawTemplatesText = fs.readFileSync(TEMPLATES_PATH, "utf-8");
} catch (err) {
  console.error("ERROR: could not read", TEMPLATES_PATH, "\n", (err && err.message) || err);
  process.exit(1);
}
const rawTemplates = JSON.parse(rawTemplatesText);
const TEMPLATE_HASH = templateHashOf(rawTemplatesText);

const TEMPLATES = {};
for (const stage of STAGE_ORDER) {
  const items = rawTemplates[stage];
  if (!Array.isArray(items)) {
    console.error(`ERROR: template JSON missing stage ${stage}`);
    process.exit(1);
  }
  TEMPLATES[stage] = items.map((it) => ({
    id: it.id, stage, title: it.title, description: it.description,
    required: it.required, toolRoute: it.toolRoute,
  }));
}

// ── CLI parse ─────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    cmd: null,
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || null,
    manifest: null,
    out: null,
    apply: false,
    confirmProd: false,
    showHelp: false,
    selfTest: false,
  };
  if (argv[2] && !argv[2].startsWith("--")) args.cmd = argv[2];
  for (let i = (args.cmd ? 3 : 2); i < argv.length; i++) {
    const a = argv[i];
    if (a === "--credentials") args.credentials = argv[++i];
    else if (a === "--manifest") args.manifest = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--apply") args.apply = true;
    else if (a === "--i-understand-this-is-production") args.confirmProd = true;
    else if (a === "--help" || a === "-h") args.showHelp = true;
    else if (a === "--self-test") args.selfTest = true;
    else die(`Unknown argument: ${a}`);
  }
  return args;
}
function die(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }

function printUsage() {
  const text = fs.readFileSync(__filename, "utf-8");
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (line.startsWith("#!")) continue;
    if (line.startsWith("// ──") && out.length > 0) { out.push(line); break; }
    if (line.startsWith("//") || line.trim() === "") out.push(line);
    else break;
  }
  console.log(out.join("\n"));
}

// ── Pure migration planning (mirrors studyAbroad.ts helpers) ──────────
function mergeChecklistWithTemplate(existing, currentStage, now) {
  const byId = new Map(existing.map((it) => [it.id, it]));
  const currentStageIndex = STAGE_ORDER.indexOf(currentStage);
  const addedIds = [];
  const seenIds = new Set();
  const fromTemplate = STAGE_ORDER.flatMap((stageId) =>
    TEMPLATES[stageId].map((tmpl) => {
      seenIds.add(tmpl.id);
      const ex = byId.get(tmpl.id);
      if (ex) {
        return { ...ex, title: tmpl.title, description: tmpl.description,
                 required: tmpl.required, toolRoute: tmpl.toolRoute, stage: tmpl.stage };
      }
      addedIds.push(tmpl.id);
      const itemStageIndex = STAGE_ORDER.indexOf(tmpl.stage);
      const isEarlier = itemStageIndex < currentStageIndex;
      const status = isEarlier && tmpl.required ? "assumed_complete" : "not_started";
      return {
        id: tmpl.id, stage: tmpl.stage, title: tmpl.title, description: tmpl.description,
        status, required: tmpl.required, toolRoute: tmpl.toolRoute,
        completedAt: status === "assumed_complete" ? now : null,
        createdAt: now, updatedAt: now,
      };
    }),
  );
  const orphans = existing.filter((it) => !seenIds.has(it.id));
  return { merged: [...fromTemplate, ...orphans], addedIds, orphanedIds: orphans.map((o) => o.id) };
}

function promoteEarlierStageRequiredItems(checklist, newStage, now) {
  const newStageIndex = STAGE_ORDER.indexOf(newStage);
  const promotedItemIds = [];
  const next = checklist.map((item) => {
    if (item.status !== "not_started") return item;
    if (!item.required) return item;
    const idx = STAGE_ORDER.indexOf(item.stage);
    if (idx < 0 || idx >= newStageIndex) return item;
    promotedItemIds.push(item.id);
    return { ...item, status: "assumed_complete", completedAt: now, updatedAt: now };
  });
  return { checklist: next, promotedItemIds };
}

function calculateProgress(checklist, currentStage) {
  const idx = STAGE_ORDER.indexOf(currentStage);
  if (idx < 0 || checklist.length === 0) return 0;
  const relevant = checklist.filter((it) => {
    const si = STAGE_ORDER.indexOf(it.stage);
    return si >= 0 && si <= idx;
  });
  if (relevant.length === 0) return 0;
  let total = 0, earned = 0;
  for (const it of relevant) {
    const w = it.required ? 1.0 : 0.5;
    const f = STATUS_WEIGHT[it.status] != null ? STATUS_WEIGHT[it.status] : 0;
    total += w; earned += w * f;
  }
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}

// Plan a single migration. The validator-driven preflight has already
// decided READY / REPAIRABLE / BLOCKED — this function only computes
// the proposed diff for REPAIRABLE (or already-valid migrate-forward)
// cases.
function planMigration(doc, classification) {
  const now = Date.now();

  // Decide the source of currentProcessStatus to write back:
  // if REPAIRABLE applied the legacy normalisation, use the normalised
  // form; otherwise keep the existing array.
  let currentProcessStatus = doc.currentProcessStatus;
  let processStatusNormalised = false;
  if (classification.normalised && Array.isArray(classification.normalised.currentProcessStatus)) {
    currentProcessStatus = classification.normalised.currentProcessStatus;
    processStatusNormalised = currentProcessStatus !== doc.currentProcessStatus;
  }

  const { merged, addedIds, orphanedIds } = mergeChecklistWithTemplate(
    doc.checklist, doc.currentStage, now,
  );
  const { checklist: promoted, promotedItemIds } =
    promoteEarlierStageRequiredItems(merged, doc.currentStage, now);

  // Refuse if the post-migration checklist would exceed the cap.
  if (promoted.length > MAX_CHECKLIST_ITEMS) {
    return { skip: false, blocked: true,
      reason: `POST_MIGRATION_CHECKLIST_OVERSIZE_${promoted.length}` };
  }

  const oldProgress = doc.progressPercentage;
  const newProgress = calculateProgress(promoted, doc.currentStage);

  const itemCountChanged = promoted.length !== doc.checklist.length;
  const itemContentChanged = promoted.some((it) => {
    const prev = doc.checklist.find((p) => p.id === it.id);
    if (!prev) return true;
    return prev.title !== it.title || prev.description !== it.description;
  });
  const promotionsApplied = promotedItemIds.length > 0;
  const progressChanged   = newProgress !== oldProgress;
  const dirty = itemCountChanged || itemContentChanged || promotionsApplied || progressChanged || processStatusNormalised;

  if (!dirty) {
    return { skip: true, reason: "no changes needed", oldProgress, newProgress };
  }
  return {
    skip: false,
    addedIds, orphanedIds, promotedItemIds,
    processStatusNormalised, currentProcessStatus,
    oldProgress, newProgress,
    mergedChecklist: promoted,
  };
}

// ── Manifest helpers ──────────────────────────────────────────────────
function makeRunId() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
}
function canonicalise(value) {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalise(value[key])]),
    );
  }
  return value;
}
function manifestHashOf(manifest) {
  const unsigned = { ...manifest };
  delete unsigned.manifestHash;
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalise(unsigned)))
    .digest("hex");
}
function validateManifestObject(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return ["MANIFEST_NOT_OBJECT"];

  const requiredKeys = [
    "runId", "generatedAt", "projectId", "migrationVersion", "templateHash",
    "expectedCount", "uids", "perDoc", "counts", "manifestHash",
  ];
  const keys = Object.keys(obj);
  for (const key of requiredKeys) {
    if (!keys.includes(key)) errors.push(`MISSING_${key}`);
  }
  for (const key of keys) {
    if (!requiredKeys.includes(key)) errors.push(`UNKNOWN_${key}`);
  }

  if (typeof obj.runId !== "string" || obj.runId.length < 8) errors.push("INVALID_RUN_ID");
  if (typeof obj.generatedAt !== "string" || Number.isNaN(Date.parse(obj.generatedAt))) errors.push("INVALID_GENERATED_AT");
  if (typeof obj.projectId !== "string" || obj.projectId.length < 1) errors.push("INVALID_PROJECT_ID");
  if (obj.migrationVersion !== MIGRATION_VERSION) errors.push("MIGRATION_VERSION_MISMATCH");
  if (typeof obj.templateHash !== "string" || !/^[a-f0-9]{16}$/.test(obj.templateHash)) errors.push("INVALID_TEMPLATE_HASH");
  if (!Number.isInteger(obj.expectedCount) || obj.expectedCount < 0) errors.push("INVALID_EXPECTED_COUNT");
  if (!Array.isArray(obj.uids)) errors.push("UIDS_NOT_ARRAY");
  if (!obj.perDoc || typeof obj.perDoc !== "object" || Array.isArray(obj.perDoc)) errors.push("PER_DOC_NOT_OBJECT");
  if (!obj.counts || typeof obj.counts !== "object" || Array.isArray(obj.counts)) errors.push("COUNTS_NOT_OBJECT");

  if (Array.isArray(obj.uids)) {
    const sorted = [...obj.uids].sort();
    if (obj.expectedCount !== obj.uids.length) errors.push("EXPECTED_COUNT_MISMATCH");
    if (obj.uids.some((uid, index) => uid !== sorted[index])) errors.push("UIDS_NOT_SORTED");
    if (new Set(obj.uids).size !== obj.uids.length) errors.push("UIDS_NOT_UNIQUE");
    if (obj.uids.some((uid) => typeof uid !== "string" || uid.length < 1)) errors.push("INVALID_UID");

    if (obj.perDoc && typeof obj.perDoc === "object" && !Array.isArray(obj.perDoc)) {
      const perDocKeys = Object.keys(obj.perDoc).sort();
      if (perDocKeys.length !== sorted.length || perDocKeys.some((uid, index) => uid !== sorted[index])) {
        errors.push("PER_DOC_UID_MISMATCH");
      }
      const recomputed = { READY: 0, REPAIRABLE: 0, BLOCKED: 0, SKIPPED: 0 };
      for (const uid of obj.uids) {
        const entry = obj.perDoc[uid];
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          errors.push(`INVALID_PER_DOC_${uid}`);
          continue;
        }
        if (!Object.hasOwn(recomputed, entry.status)) {
          errors.push(`INVALID_STATUS_${uid}`);
          continue;
        }
        recomputed[entry.status]++;
        if (!Array.isArray(entry.codes) || entry.codes.some((code) => typeof code !== "string")) {
          errors.push(`INVALID_CODES_${uid}`);
        }
        if (entry.repairs && (!Array.isArray(entry.repairs) || entry.repairs.some((repair) => typeof repair !== "string"))) {
          errors.push(`INVALID_REPAIRS_${uid}`);
        }
      }
      if (obj.counts && typeof obj.counts === "object" && !Array.isArray(obj.counts)) {
        for (const status of Object.keys(recomputed)) {
          if (obj.counts[status] !== recomputed[status]) errors.push(`COUNT_MISMATCH_${status}`);
        }
      }
    }
  }

  if (typeof obj.manifestHash !== "string" || obj.manifestHash !== manifestHashOf(obj)) {
    errors.push("MANIFEST_HASH_MISMATCH");
  }
  return errors;
}
function manifestIsApplyable(manifest) {
  return Object.values(manifest.perDoc)
    .every((entry) => entry.status === "READY" || entry.status === "REPAIRABLE");
}
function readManifest(p) {
  if (!fs.existsSync(p)) die(`Manifest not found: ${p}`);
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (err) {
    die(`Manifest at ${p} is not valid JSON: ${(err && err.message) || err}`);
  }
  const errors = validateManifestObject(obj);
  if (errors.length > 0) {
    die(`Manifest at ${p} failed validation: ${errors.join(", ")}`);
  }
  return obj;
}
function writeManifest(p, obj) {
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}
function deriveProjectIdFromCredentials(credentialsPath) {
  try {
    const cred = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
    return cred.project_id || null;
  } catch {
    return null;
  }
}

// ── Self-test (no Firebase) ───────────────────────────────────────────
function runSelfTest() {
  const cases = [];

  // Preflight classifier covered exhaustively by roadmapValidator.test.ts;
  // here we only assert migration planning behaviour.

  // Case 1: legacy string → array repair drives a write.
  {
    const doc = {
      version: TARGET_VERSION,
      currentStage: "discovery",
      checklist: STAGE_ORDER.flatMap((s) =>
        TEMPLATES[s].map((t) => ({
          ...t, status: "not_started", completedAt: null, createdAt: 0, updatedAt: 0,
        })),
      ),
      progressPercentage: 0,
      currentProcessStatus: "just_starting",   // ← legacy string
      // (other top-level fields omitted — preflight would have flagged
      // this as BLOCKED, so we wouldn't get here in real flow; the
      // planner only runs on REPAIRABLE / READY-with-dirty cases.)
    };
    const classification = { status: "REPAIRABLE", repairs: ["LEGACY_PROCESS_STATUS_STRING_TO_ARRAY"],
      normalised: { ...doc, currentProcessStatus: ["just_starting"] } };
    const plan = planMigration(doc, classification);
    cases.push({
      name: "legacy string normalisation drives a write",
      ok: !plan.skip && plan.processStatusNormalised === true
          && Array.isArray(plan.currentProcessStatus)
          && plan.currentProcessStatus[0] === "just_starting",
      plan,
    });
  }

  // Case 2: no-op for already-aligned doc.
  {
    const checklist = STAGE_ORDER.flatMap((s) =>
      TEMPLATES[s].map((t) => ({
        ...t, status: "not_started", completedAt: null, createdAt: 0, updatedAt: 0,
      })),
    );
    const doc = {
      version: TARGET_VERSION,
      currentStage: "discovery",
      checklist,
      progressPercentage: 0,
      currentProcessStatus: ["just_starting"],
    };
    const classification = { status: "READY" };
    const plan = planMigration(doc, classification);
    cases.push({ name: "already-aligned doc is a no-op", ok: plan.skip === true, plan });
  }

  // Case 3: promotion for advanced-stage doc.
  {
    const checklist = STAGE_ORDER.flatMap((s) =>
      TEMPLATES[s].map((t) => ({
        ...t, status: "not_started", completedAt: null, createdAt: 0, updatedAt: 0,
      })),
    );
    const doc = {
      version: TARGET_VERSION,
      currentStage: "visa_preparation",
      checklist,
      progressPercentage: 0,
      currentProcessStatus: ["paid_sevis"],
    };
    const plan = planMigration(doc, { status: "READY" });
    cases.push({
      name: "advanced-stage doc promotes earlier required items",
      ok: !plan.skip && plan.promotedItemIds.length > 0,
      plan,
    });
  }

  // Case 4: preserves completed + completedAt across migrate.
  {
    const checklist = [
      { id: "d_profile", stage: "discovery",
        title: "Complete academic profile",
        description: "Your level, field, GPA, test scores, and budget — the inputs every later tool needs.",
        status: "completed", required: true, toolRoute: "/intake",
        completedAt: 12345, createdAt: 100, updatedAt: 200 },
    ];
    const doc = {
      version: TARGET_VERSION,
      currentStage: "visa_preparation",
      checklist,
      progressPercentage: 0,
      currentProcessStatus: ["paid_sevis"],
    };
    const plan = planMigration(doc, { status: "READY" });
    const dp = plan.skip ? null : plan.mergedChecklist.find((it) => it.id === "d_profile");
    cases.push({ name: "completed item preserved across migrate",
      ok: dp && dp.status === "completed" && dp.completedAt === 12345, plan });
  }

  // Case 5: refuses to write oversize.
  {
    const tooManyItems = Array.from({ length: MAX_CHECKLIST_ITEMS + 1 }, (_, i) => ({
      id: `x_${i}`, stage: "discovery", title: "x", description: "x",
      status: "not_started", required: true, toolRoute: null,
      completedAt: null, createdAt: 0, updatedAt: 0,
    }));
    const doc = {
      version: TARGET_VERSION,
      currentStage: "discovery",
      checklist: tooManyItems,
      progressPercentage: 0,
      currentProcessStatus: ["just_starting"],
    };
    const plan = planMigration(doc, { status: "READY" });
    cases.push({ name: "oversize post-migration → BLOCKED",
      ok: plan.blocked === true, plan });
  }

  // Case 6: template hash determinism.
  {
    const h1 = templateHashOf(rawTemplatesText);
    const h2 = templateHashOf(rawTemplatesText);
    cases.push({ name: "templateHashOf is deterministic", ok: h1 === h2 && h1.length > 0, plan: null });
  }

  // Case 7: classifyDoc + planMigration agree on the legacy-string flow.
  {
    const doc = {
      userId: "u1",
      originCountry: "ghana",
      completedAcademicLevel: "bachelors",
      targetAcademicLevel: "masters",
      currentProcessStatus: "paid_sevis",            // legacy
      primaryNeed: "finding_schools",
      preferredStartTerm: "fall_2026",
      currentStage: "discovery",
      progressPercentage: 0,
      recommendedTool: { label: "x", route: "/x", description: "y" },
      checklist: [],
      createdAt: 1, updatedAt: 1,
      completedOnboarding: true,
      version: TARGET_VERSION,
    };
    const cls = classifyDoc(doc);
    const plan = planMigration(doc, cls);
    cases.push({
      name: "classifyDoc + planMigration handle legacy string end-to-end",
      ok: cls.status === "REPAIRABLE" && !plan.skip && plan.processStatusNormalised === true,
      plan: { classification: cls, plan },
    });
  }

  // Case 8: a complete checksummed manifest validates.
  {
    const manifest = {
      runId: "test-run-123",
      generatedAt: "2026-06-09T00:00:00.000Z",
      projectId: "demo-roadmap",
      migrationVersion: MIGRATION_VERSION,
      templateHash: TEMPLATE_HASH,
      expectedCount: 1,
      uids: ["u1"],
      perDoc: { u1: { status: "READY", codes: [] } },
      counts: { READY: 1, REPAIRABLE: 0, BLOCKED: 0, SKIPPED: 0 },
    };
    manifest.manifestHash = manifestHashOf(manifest);
    cases.push({
      name: "checksummed manifest validates",
      ok: validateManifestObject(manifest).length === 0 && manifestIsApplyable(manifest),
      plan: null,
    });
  }

  // Case 9: tampering with reviewed manifest content is detected.
  {
    const manifest = {
      runId: "test-run-123",
      generatedAt: "2026-06-09T00:00:00.000Z",
      projectId: "demo-roadmap",
      migrationVersion: MIGRATION_VERSION,
      templateHash: TEMPLATE_HASH,
      expectedCount: 1,
      uids: ["u1"],
      perDoc: { u1: { status: "READY", codes: [] } },
      counts: { READY: 1, REPAIRABLE: 0, BLOCKED: 0, SKIPPED: 0 },
    };
    manifest.manifestHash = manifestHashOf(manifest);
    manifest.projectId = "different-project";
    cases.push({
      name: "manifest tampering invalidates checksum",
      ok: validateManifestObject(manifest).includes("MANIFEST_HASH_MISMATCH"),
      plan: null,
    });
  }

  // Case 10: SKIPPED entries can never reach apply.
  {
    const manifest = {
      perDoc: { u1: { status: "SKIPPED", codes: ["VERSION_number_2_NEEDS_1"] } },
    };
    cases.push({
      name: "SKIPPED manifest is not applyable",
      ok: manifestIsApplyable(manifest) === false,
      plan: null,
    });
  }

  let passed = 0, failed = 0;
  console.log("\nSelf-test results:");
  for (const c of cases) {
    const tag = c.ok ? "PASS" : "FAIL";
    console.log(`  [${tag}] ${c.name}`);
    if (c.ok) passed++;
    else { failed++; console.log("        plan:", JSON.stringify(c.plan).slice(0, 240)); }
  }
  console.log(`\n${passed}/${cases.length} passed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// ── Firebase loader (lazy so --help / --self-test don't need deps) ────
function loadFirebaseAdmin() {
  try {
    return require(path.resolve(__dirname, "..", "functions", "node_modules", "firebase-admin"));
  } catch {
    try { return require("firebase-admin"); }
    catch { die("firebase-admin not installed. Run from a checkout with functions/ deps installed."); }
  }
}

// ── PREFLIGHT ─────────────────────────────────────────────────────────
async function cmdPreflight(args) {
  if (!args.credentials) die("preflight requires --credentials <path>");
  if (!fs.existsSync(args.credentials)) die(`Credentials file not found: ${args.credentials}`);
  if (!args.out) die("preflight requires --out <path-to-manifest.json>");

  const admin = loadFirebaseAdmin();
  const projectIdFromCreds = deriveProjectIdFromCredentials(args.credentials);
  if (!projectIdFromCreds) die("Could not determine project_id from credentials JSON.");

  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(args.credentials))) });
  const db = admin.firestore();

  const runId = makeRunId();
  console.log(`\n${"=".repeat(64)}\n  Preflight · projectId=${projectIdFromCreds} · templateHash=${TEMPLATE_HASH}\n  runId=${runId}\n${"=".repeat(64)}\n`);

  const snap = await db.collection(COLLECTION).get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  // Stable sort by uid so manifest order is deterministic across runs.
  docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const perDoc = {};
  const counts = { READY: 0, REPAIRABLE: 0, BLOCKED: 0, SKIPPED: 0 };
  for (const { id, data } of docs) {
    const c = classifyDoc(data, { templateHash: TEMPLATE_HASH, uid: id });
    counts[c.status]++;
    perDoc[id] = {
      status: c.status,
      codes: c.codes || [],
      ...(c.repairs ? { repairs: c.repairs } : {}),
    };
    const tag = c.status.padEnd(11);
    const code = c.codes && c.codes.length ? ` [${c.codes.slice(0, 3).join(",")}${c.codes.length > 3 ? `+${c.codes.length - 3}` : ""}]` : "";
    console.log(`${tag} ${id.slice(0, 12)}…${code}`);
  }

  const manifest = {
    runId,
    generatedAt: new Date().toISOString(),
    projectId: projectIdFromCreds,
    migrationVersion: MIGRATION_VERSION,
    templateHash: TEMPLATE_HASH,
    expectedCount: docs.length,
    uids: docs.map((d) => d.id),
    perDoc,
    counts,
  };
  manifest.manifestHash = manifestHashOf(manifest);
  writeManifest(args.out, manifest);
  console.log(`\nWrote manifest: ${args.out}`);
  console.log(`  counts: ${JSON.stringify(counts)}`);
  console.log(`  expected: ${docs.length}`);
  if (counts.BLOCKED > 0) {
    console.error(`\nABORT: ${counts.BLOCKED} BLOCKED document(s). Apply is refused until these are fixed at source.`);
    process.exit(2);
  }
  if (counts.SKIPPED > 0) {
    console.error(`\nABORT: ${counts.SKIPPED} SKIPPED document(s) at unexpected version. Inspect before re-running.`);
    process.exit(2);
  }
  process.exit(0);
}

// ── APPLY ─────────────────────────────────────────────────────────────
async function cmdApply(args) {
  if (!args.credentials) die("apply requires --credentials <path>");
  if (!args.manifest)    die("apply requires --manifest <path>");
  if (!args.apply || !args.confirmProd) {
    die("apply requires BOTH --apply AND --i-understand-this-is-production.");
  }
  const m = readManifest(args.manifest);
  const projectIdFromCreds = deriveProjectIdFromCredentials(args.credentials);
  if (m.projectId !== projectIdFromCreds) {
    die(`Project mismatch: manifest projectId=${m.projectId} vs credentials projectId=${projectIdFromCreds}. Refusing.`);
  }
  if (m.templateHash !== TEMPLATE_HASH) {
    die(`Template hash mismatch: manifest=${m.templateHash} vs current=${TEMPLATE_HASH}. Regenerate the manifest via preflight.`);
  }
  if (!manifestIsApplyable(m)) {
    die("Manifest contains entries other than READY or REPAIRABLE. Regenerate after resolving all BLOCKED/SKIPPED documents.");
  }

  const admin = loadFirebaseAdmin();
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(args.credentials))) });
  const db = admin.firestore();

  console.log(`\n${"=".repeat(64)}\n  Apply · runId=${m.runId} · projectId=${m.projectId}\n  templateHash=${m.templateHash} · ${m.uids.length} UID(s)\n${"=".repeat(64)}\n`);

  let processed = 0, changed = 0, alreadyApplied = 0, skipped = 0, errors = 0;
  for (const uid of m.uids) {
    processed++;
    const classification = m.perDoc[uid];
    if (!classification) { console.log(`SKIP    ${uid.slice(0,12)}… — not in perDoc`); skipped++; continue; }
    if (classification.status === "SKIPPED" || classification.status === "BLOCKED") {
      skipped++;
      console.log(`SKIP    ${uid.slice(0,12)}… — ${classification.status}`);
      continue;
    }
    try {
      const result = await db.runTransaction(async (tx) => {
        const ref = db.collection(COLLECTION).doc(uid);
        const statusRef = db.collection(BACKUP_COLLECTION).doc(m.runId).collection("applyStatus").doc(uid);
        const backupRef = db.collection(BACKUP_COLLECTION).doc(m.runId).collection("users").doc(uid);
        const snap = await tx.get(ref);
        const statusSnap = await tx.get(statusRef);
        const backupSnap = await tx.get(backupRef);
        if (!snap.exists) throw new Error("roadmap document disappeared after preflight");
        const doc = snap.data();
        const liveClassification = classifyDoc(doc, { templateHash: TEMPLATE_HASH, uid });
        if (liveClassification.status !== "READY" && liveClassification.status !== "REPAIRABLE") {
          throw new Error(`live re-check classified ${liveClassification.status}: ${(liveClassification.codes || []).join(",")}`);
        }
        const plan = planMigration(doc, liveClassification);
        if (plan.blocked) {
          throw new Error(`live re-check rejected: ${plan.reason}`);
        }

        if (statusSnap.exists) {
          const state = statusSnap.data().state;
          if ((state === "applied" || state === "no_change") && plan.skip) {
            return { alreadyApplied: true };
          }
          if (state === "rolled_back") {
            throw new Error("run was already rolled back; generate a new manifest before applying again");
          }
          throw new Error(`apply ledger/live document mismatch: state=${state}, plan=${plan.skip ? "skip" : "write"}`);
        }
        if (backupSnap.exists) {
          throw new Error("backup exists without an apply ledger entry");
        }
        if (plan.skip) {
          tx.set(statusRef, {
            state: "no_change",
            recordedAt: admin.firestore.FieldValue.serverTimestamp(),
            runId: m.runId,
            migrationVersion: MIGRATION_VERSION,
          });
          return { alreadyApplied: true };
        }

        tx.set(backupRef, {
          ...doc,
          _backupMeta: {
            backedUpAt: admin.firestore.FieldValue.serverTimestamp(),
            backupRunId: m.runId,
            backupReason: "roadmap-migration-pre-apply",
          },
        });
        tx.set(statusRef, {
          state: "applied",
          recordedAt: admin.firestore.FieldValue.serverTimestamp(),
          runId: m.runId,
          migrationVersion: MIGRATION_VERSION,
        });
        const updates = {
          checklist: plan.mergedChecklist,
          progressPercentage: plan.newProgress,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (plan.processStatusNormalised) updates.currentProcessStatus = plan.currentProcessStatus;
        tx.update(ref, updates);
        return { applied: true, addedIds: plan.addedIds, promoted: plan.promotedItemIds, normalised: plan.processStatusNormalised };
      });
      if (result && result.alreadyApplied) {
        alreadyApplied++;
        console.log(`OK      ${uid.slice(0,12)}… — already up to date`);
      } else if (result && result.applied) {
        changed++;
        const tail = [];
        if (result.addedIds.length)  tail.push(`+${result.addedIds.length} new`);
        if (result.promoted.length)  tail.push(`promoted ${result.promoted.length}`);
        if (result.normalised)       tail.push(`normalised process-status`);
        console.log(`APPLY   ${uid.slice(0,12)}… — ${tail.join(" · ") || "content refresh"}`);
      } else {
        skipped++;
        console.log(`SKIP    ${uid.slice(0,12)}… — ${(result && result.reason) || "no result"}`);
      }
    } catch (err) {
      errors++;
      console.error(`ERROR   ${uid.slice(0,12)}… — ${(err && err.message) || err}`);
    }
  }

  console.log(`\nSummary: processed=${processed} applied=${changed} alreadyApplied=${alreadyApplied} skipped=${skipped} errors=${errors}`);
  console.log(`Backups in: ${BACKUP_COLLECTION}/${m.runId}/users/{uid}`);
  process.exit(errors > 0 ? 2 : 0);
}

// ── ROLLBACK ──────────────────────────────────────────────────────────
async function cmdRollback(args) {
  if (!args.credentials) die("rollback requires --credentials <path>");
  if (!args.manifest)    die("rollback requires --manifest <path>");
  if (!args.apply || !args.confirmProd) {
    die("rollback requires BOTH --apply AND --i-understand-this-is-production.");
  }
  const m = readManifest(args.manifest);
  const projectIdFromCreds = deriveProjectIdFromCredentials(args.credentials);
  if (m.projectId !== projectIdFromCreds) {
    die(`Project mismatch: manifest projectId=${m.projectId} vs credentials projectId=${projectIdFromCreds}.`);
  }
  const admin = loadFirebaseAdmin();
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(args.credentials))) });
  const db = admin.firestore();

  console.log(`\n${"=".repeat(64)}\n  Rollback · runId=${m.runId} · projectId=${m.projectId}\n  ${m.uids.length} UID(s)\n${"=".repeat(64)}\n`);

  let processed = 0, restored = 0, alreadyRolledBack = 0, notApplied = 0, noChange = 0, errors = 0;
  for (const uid of m.uids) {
    processed++;
    try {
      const result = await db.runTransaction(async (tx) => {
        const statusRef = db.collection(BACKUP_COLLECTION).doc(m.runId).collection("applyStatus").doc(uid);
        const backupRef = db.collection(BACKUP_COLLECTION).doc(m.runId).collection("users").doc(uid);
        const statusSnap = await tx.get(statusRef);
        const backupSnap = await tx.get(backupRef);

        if (!statusSnap.exists) return { state: "not_applied" };
        const status = statusSnap.data();
        if (status.state === "rolled_back") return { state: "already_rolled_back" };
        if (status.state === "no_change") return { state: "no_change" };
        if (status.state !== "applied") throw new Error(`unknown apply ledger state: ${status.state}`);
        if (!backupSnap.exists) throw new Error("apply ledger says applied but backup is missing");

        const data = backupSnap.data();
        delete data._backupMeta;
        tx.set(db.collection(COLLECTION).doc(uid), data);
        tx.update(statusRef, {
          state: "rolled_back",
          rolledBackAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { state: "restored" };
      });
      if (result.state === "restored") {
        restored++;
        console.log(`ROLLBACK ${uid.slice(0,12)}… — restored`);
      } else if (result.state === "already_rolled_back") {
        alreadyRolledBack++;
        console.log(`OK       ${uid.slice(0,12)}… — already rolled back`);
      } else if (result.state === "no_change") {
        noChange++;
        console.log(`OK       ${uid.slice(0,12)}… — apply made no data change`);
      } else {
        notApplied++;
        console.log(`OK       ${uid.slice(0,12)}… — apply never processed this UID`);
      }
    } catch (err) {
      errors++;
      console.error(`ERROR    ${uid.slice(0,12)}… — ${(err && err.message) || err}`);
    }
  }
  console.log(`\nSummary: processed=${processed} restored=${restored} alreadyRolledBack=${alreadyRolledBack} noChange=${noChange} notApplied=${notApplied} errors=${errors}`);
  process.exit(errors > 0 ? 2 : 0);
}

// ── Main ──────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);
  if (args.showHelp || (args.cmd == null && !args.selfTest)) { printUsage(); process.exit(0); }
  if (args.selfTest)            { runSelfTest(); return; }
  if (args.cmd === "preflight") { cmdPreflight(args); return; }
  if (args.cmd === "apply")     { cmdApply(args);     return; }
  if (args.cmd === "rollback")  { cmdRollback(args);  return; }
  die(`Unknown command: ${args.cmd}. Use preflight | apply | rollback. See --help.`);
}

try { main(); } catch (err) { console.error("Fatal error:", err); process.exit(3); }
