#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verifyEmulatorTests.cjs — release-gate wrapper around the emulator suite.
//
// Why this exists:
//   `npm test` excludes `*.emulator.test.ts` so dev CI doesn't go red
//   when the Firestore emulator isn't running locally. But before
//   promoting `firestore.rules`, the operator MUST run the emulator
//   tests for real — silently skipping them would let a broken rule
//   ship undetected. This wrapper makes that hard to bypass.
//
// What it does:
//   1. Confirms FIRESTORE_EMULATOR_HOST is set; refuses otherwise.
//   2. Runs `vitest run` against the emulator test file with the
//      EMULATOR_REQUIRED sentinel turned on.
//   3. Parses Vitest's JSON reporter output.
//   4. Refuses if the total test count is zero, OR if any test failed,
//      OR if any test was skipped (because the release gate's whole
//      point is that nothing skips).
//   5. Prints "Emulator suite passed: N tests, T ms" and exits 0
//      only when all of the above hold.
//
// Usage:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   node scripts/verifyEmulatorTests.cjs
//
// Exit codes:
//   0 — all tests passed and at least one test ran
//   1 — emulator host not set
//   2 — vitest exited non-zero
//   3 — zero tests executed
//   4 — at least one test was skipped (release-gate requires no skips)
//   5 — vitest report could not be parsed
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const { spawnSync } = require("node:child_process");
const fs   = require("node:fs");
const os   = require("node:os");
const path = require("node:path");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.");
  console.error("Start the emulator first, e.g.:");
  console.error("  firebase emulators:start --only firestore --project demo-roadmap");
  console.error("Then re-run with FIRESTORE_EMULATOR_HOST=127.0.0.1:8080");
  process.exit(1);
}

const target = "src/lib/roadmap/firestoreRules.emulator.test.ts";
const vitestEntry = path.resolve("node_modules", "vitest", "vitest.mjs");

// Run the suite once per rules file.
//
// The draft is the authoring surface for the marked region; firestore.rules
// is what actually ships. Certifying only one of them is how a rules bug
// reaches production unnoticed — the reminderSentAt deadlock (2026-07-22)
// sat in the deployed file while a green suite was reading the draft. If the
// two are in sync the second run is redundant and cheap; if they have drifted
// it is the only thing that catches it.
const RULES_FILES = ["firestore.rules.draft", "firestore.rules"];

console.log(`Emulator host: ${process.env.FIRESTORE_EMULATOR_HOST}`);

function runSuite(rulesFile) {
  const reportPath = path.join(
    os.tmpdir(),
    `vitest-emulator-report-${process.pid}-${rulesFile.replace(/[^a-z]/gi, "")}.json`,
  );

  console.log(`\n── Running emulator suite against ${rulesFile} ──`);

  const result = spawnSync(
    process.execPath,
    [vitestEntry, "run", target,
     "--reporter=default",
     "--reporter=json",
     `--outputFile=${reportPath}`],
    {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_REQUIRED: "1",
        RULES_FILE: rulesFile,
      },
    },
  );

  if (result.error) {
    console.error("ERROR: could not start vitest:", result.error.message);
    process.exit(5);
  }
  if (!fs.existsSync(reportPath)) {
    console.error("ERROR: vitest did not produce a JSON report.");
    process.exit(5);
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  } catch (err) {
    console.error("ERROR: could not parse vitest JSON report:", err && err.message);
    process.exit(5);
  } finally {
    // Best-effort cleanup; don't fail the verifier over a temp file.
    try { fs.unlinkSync(reportPath); } catch { /* ignore */ }
  }

  // Vitest JSON reporter v4 schema: { numTotalTests, numPassedTests,
  // numFailedTests, numPendingTests, startTime, ... }
  const total   = Number(report.numTotalTests   || 0);
  const passed  = Number(report.numPassedTests  || 0);
  const failed  = Number(report.numFailedTests  || 0);
  const pending = Number(report.numPendingTests || 0);
  const skipped = Number(report.numTodoTests    || 0); // some Vitest builds use numTodoTests
  const startTime = Number(report.startTime || 0);
  const endTime   = Number((report.testResults || []).reduce((acc, r) => Math.max(acc, Number(r.endTime || 0)), 0));
  const durationMs = endTime > startTime ? endTime - startTime : 0;

  console.log();
  console.log(`Report summary (${rulesFile}): total=${total} passed=${passed} failed=${failed} pending=${pending} skipped=${skipped}`);

  if (result.status !== 0) {
    console.error(`ERROR: vitest exited ${result.status} for ${rulesFile}. Suite did not pass.`);
    process.exit(2);
  }
  if (total === 0) {
    console.error(`ERROR: zero tests executed for ${rulesFile}. Refusing to certify the rules.`);
    process.exit(3);
  }
  if (pending > 0 || skipped > 0) {
    console.error(`ERROR: ${pending + skipped} test(s) skipped for ${rulesFile}. Release gate forbids skips.`);
    process.exit(4);
  }
  if (failed > 0) {
    console.error(`ERROR: ${failed} test(s) failed for ${rulesFile}.`);
    process.exit(2);
  }

  console.log(`OK · ${rulesFile}: ${passed}/${total} tests in ${durationMs} ms`);
  return { passed, total };
}

const results = RULES_FILES.map((f) => [f, runSuite(f)]);

console.log();
for (const [file, r] of results) console.log(`OK · ${file}: ${r.passed}/${r.total}`);
console.log(`OK · Emulator suite passed against ${results.length} rules file(s).`);
process.exit(0);
