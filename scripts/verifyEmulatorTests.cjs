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

const reportPath = path.join(os.tmpdir(), `vitest-emulator-report-${process.pid}.json`);
const target = "src/lib/roadmap/firestoreRules.emulator.test.ts";
const vitestEntry = path.resolve("node_modules", "vitest", "vitest.mjs");

console.log(`Running emulator suite: ${target}`);
console.log(`Emulator host: ${process.env.FIRESTORE_EMULATOR_HOST}`);

const result = spawnSync(
  process.execPath,
  [vitestEntry, "run", target,
   "--reporter=default",
   "--reporter=json",
   `--outputFile=${reportPath}`],
  {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, FIRESTORE_EMULATOR_REQUIRED: "1" },
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
console.log(`Report summary: total=${total} passed=${passed} failed=${failed} pending=${pending} skipped=${skipped}`);

if (result.status !== 0) {
  console.error(`ERROR: vitest exited ${result.status}. Suite did not pass.`);
  process.exit(2);
}
if (total === 0) {
  console.error("ERROR: zero tests executed. Refusing to certify the rules.");
  process.exit(3);
}
if (pending > 0 || skipped > 0) {
  console.error(`ERROR: ${pending + skipped} test(s) were skipped. Release gate forbids skips.`);
  process.exit(4);
}
if (failed > 0) {
  console.error(`ERROR: ${failed} test(s) failed.`);
  process.exit(2);
}

console.log(`OK · Emulator suite passed: ${passed}/${total} tests in ${durationMs} ms`);
process.exit(0);
