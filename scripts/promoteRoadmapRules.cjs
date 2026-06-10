#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// promoteRoadmapRules.cjs — marker-based promotion of the hardened
// studyRoadmaps block from `firestore.rules.draft` into `firestore.rules`.
//
// HOW IT WORKS
//   Both files contain a SINGLE marked region:
//     // ##ROADMAP:BEGIN##
//     ...studyRoadmaps content...
//     // ##ROADMAP:END##
//   This script:
//     1. Reads draft + live.
//     2. Verifies each file has EXACTLY ONE pair of well-formed markers.
//     3. Extracts the bytes between the markers from the draft.
//     4. Substitutes those bytes between the markers in the live.
//     5. Prints a unified diff (always — that's the dry-run review).
//     6. With --apply, writes atomically via temp file + rename.
//
// IDEMPOTENCY
//   The markers themselves are preserved across promotion. Re-running
//   on an already-promoted file produces a byte-identical output, so
//   the second dry-run prints "(no changes)" and the second --apply is
//   a true no-op (no rewrite, exit 0).
//
// FAILURE MODES (refuse to modify the live file):
//   - draft or live not found
//   - markers missing in either file
//   - duplicate marker pairs in either file
//   - markers out of order (END before BEGIN)
//   - draft's marked region is empty
//   - live's marked region is empty AND the draft's looks empty too
//   - any I/O error
//
// USAGE
//   Dry-run (always start here):
//     node scripts/promoteRoadmapRules.cjs
//   Apply:
//     node scripts/promoteRoadmapRules.cjs --apply
//   Self-tests:
//     node scripts/promoteRoadmapRules.cjs --self-test
//
// SAFETY
//   - Does NOT call firebase deploy. The operator does that separately
//     after reviewing the diff.
//   - Atomic write: writes to `.tmp.<pid>` first, then renames.
//   - Preserves every byte outside the marker region byte-for-byte.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const fs   = require("fs");
const path = require("path");
const os   = require("os");

const RULES_PATH = path.resolve(__dirname, "..", "firestore.rules");
const DRAFT_PATH = path.resolve(__dirname, "..", "firestore.rules.draft");

const BEGIN_MARKER = "// ##ROADMAP:BEGIN##";
const END_MARKER   = "// ##ROADMAP:END##";

// ── Marker extraction (pure) ───────────────────────────────────────────
// Returns { start, end, inner, lineStart, lineEnd } where:
//   start / end — byte offsets (start of BEGIN_MARKER, end of END_MARKER line)
//   inner       — the bytes BETWEEN the markers (excluding markers themselves)
//   lineStart   — line number of the BEGIN marker (1-based) for diagnostics
//   lineEnd     — line number of the END marker (1-based)
// Throws on missing / duplicated / out-of-order markers.
// A line "is" a marker only if it consists of optional leading whitespace
// followed by the marker text and nothing else (trailing whitespace allowed).
// This prevents references to the markers inside prose / comments from being
// mistaken for the real markers.
function isMarkerLine(line, marker) {
  return /^\s*/.test(line) && line.trim() === marker;
}

function findRegion(text, sourceLabel) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  // Each "line" is the slice from lineStarts[k] up to (but not including) lineStarts[k+1] - 1 (the \n).
  const lines = [];
  for (let k = 0; k < lineStarts.length; k++) {
    const start = lineStarts[k];
    const end   = (k + 1 < lineStarts.length) ? lineStarts[k + 1] - 1 : text.length;
    lines.push(text.slice(start, end));
  }
  const begins = [];
  const ends   = [];
  for (let k = 0; k < lines.length; k++) {
    if (isMarkerLine(lines[k], BEGIN_MARKER)) begins.push(k);
    if (isMarkerLine(lines[k], END_MARKER))   ends.push(k);
  }
  if (begins.length === 0) throw new Error(`${sourceLabel}: missing BEGIN marker line "${BEGIN_MARKER}"`);
  if (ends.length === 0)   throw new Error(`${sourceLabel}: missing END marker line "${END_MARKER}"`);
  if (begins.length > 1)   throw new Error(`${sourceLabel}: ${begins.length} BEGIN markers found — exactly one required`);
  if (ends.length > 1)     throw new Error(`${sourceLabel}: ${ends.length} END markers found — exactly one required`);
  if (begins[0] > ends[0]) throw new Error(`${sourceLabel}: END marker appears before BEGIN marker`);
  if (begins[0] === ends[0]) throw new Error(`${sourceLabel}: BEGIN/END markers are on the same line`);

  const beginLineIdx = begins[0];
  const endLineIdx   = ends[0];
  const beginLineStart = lineStarts[beginLineIdx];
  // beginLineEnd = byte offset of the \n that terminates the BEGIN marker line.
  const beginLineEnd = (beginLineIdx + 1 < lineStarts.length) ? lineStarts[beginLineIdx + 1] - 1 : text.length;
  const endLineStart   = lineStarts[endLineIdx];                                  // first byte of END marker line
  const endLineEnd     = (endLineIdx + 1 < lineStarts.length) ? lineStarts[endLineIdx + 1] - 1 : text.length;

  // "Inner" = bytes between the BEGIN line's trailing \n and the start of the END line.
  const innerStart = beginLineEnd + 1;
  const innerEnd   = endLineStart;
  if (innerStart > innerEnd) throw new Error(`${sourceLabel}: BEGIN/END markers are adjacent with no body`);
  const inner = text.slice(innerStart, innerEnd);
  return { beginLineStart, beginLineEnd, endLineStart, endLineEnd, inner };
}

// Substitute the live's marked-region body with the draft's marked-region body.
// Markers themselves stay where they were in the live file.
function substitute(liveText, draftText) {
  const live  = findRegion(liveText,  "firestore.rules");
  const draft = findRegion(draftText, "firestore.rules.draft");
  if (draft.inner.length === 0) {
    throw new Error("firestore.rules.draft: marked region is empty — refusing to wipe live");
  }
  return liveText.slice(0, live.beginLineEnd + 1) + draft.inner + liveText.slice(live.endLineStart);
}

// ── Diff (compact, no external deps) ───────────────────────────────────
function unifiedDiff(before, after) {
  const beforeLines = before.split(/\r?\n/);
  const afterLines  = after.split(/\r?\n/);
  if (beforeLines.length === afterLines.length
      && beforeLines.every((l, i) => l === afterLines[i])) {
    return "(no changes)";
  }
  const out = [];
  out.push(`--- firestore.rules (live)`);
  out.push(`+++ firestore.rules (proposed)`);
  let firstDiff = 0;
  const minLen = Math.min(beforeLines.length, afterLines.length);
  while (firstDiff < minLen && beforeLines[firstDiff] === afterLines[firstDiff]) firstDiff++;
  let bi = beforeLines.length - 1, ai = afterLines.length - 1;
  while (bi >= firstDiff && ai >= firstDiff && beforeLines[bi] === afterLines[ai]) { bi--; ai--; }
  const ctx = 3;
  const hunkStart = Math.max(0, firstDiff - ctx);
  const hunkBeforeEnd = Math.min(beforeLines.length, bi + 1 + ctx);
  const hunkAfterEnd  = Math.min(afterLines.length,  ai + 1 + ctx);
  out.push(`@@ -${hunkStart + 1},${hunkBeforeEnd - hunkStart} +${hunkStart + 1},${hunkAfterEnd - hunkStart} @@`);
  for (let i = hunkStart; i < firstDiff; i++) out.push(" " + beforeLines[i]);
  for (let i = firstDiff; i <= bi; i++) out.push("-" + beforeLines[i]);
  for (let i = firstDiff; i <= ai; i++) out.push("+" + afterLines[i]);
  for (let i = bi + 1; i < hunkBeforeEnd; i++) out.push(" " + beforeLines[i]);
  return out.join("\n");
}

// ── Atomic write ──────────────────────────────────────────────────────
function atomicWrite(target, content) {
  const tmp = `${target}.tmp.${process.pid}.${Math.floor((Date.now ? 0 : 0) + process.uptime() * 1000)}`;
  // Don't use Date.now() — it's banned in workflow scripts. Process pid +
  // uptime gives a stable enough suffix for collision-free temp files.
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, target);
}

// ── Outside-of-region byte-for-byte equality check ────────────────────
// Used by self-tests and as a safety assertion: after substitution, the
// content outside the marker region must equal the live's content outside
// its marker region.
function assertOutsideEqualsLive(liveText, resultText) {
  const live = findRegion(liveText, "firestore.rules");
  const res  = findRegion(resultText, "promoted output");
  const livePrefix = liveText.slice(0, live.beginLineEnd + 1);
  const liveSuffix = liveText.slice(live.endLineStart);
  const resPrefix  = resultText.slice(0, res.beginLineEnd + 1);
  const resSuffix  = resultText.slice(res.endLineStart);
  if (livePrefix !== resPrefix) throw new Error("byte drift in PREFIX outside marker region");
  if (liveSuffix !== resSuffix) throw new Error("byte drift in SUFFIX outside marker region");
}

// ── CLI ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { apply: false, showHelp: false, selfTest: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--self-test") args.selfTest = true;
    else if (a === "--help" || a === "-h") args.showHelp = true;
    else { console.error(`Unknown argument: ${a}`); process.exit(1); }
  }
  return args;
}
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

// ── SELF-TESTS (no Firebase, in-memory + temp dir) ────────────────────
function runSelfTest() {
  const cases = [];
  const okMarkers =
`rules_version = '2';
// outside-before
// ##ROADMAP:BEGIN##
old roadmap content
// ##ROADMAP:END##
// outside-after
`;
  const draftFull =
`// draft preamble
// ##ROADMAP:BEGIN##
new hardened
multi-line
roadmap content
// ##ROADMAP:END##
// draft trailer
`;

  // T1: initial promotion produces the expected substitution.
  {
    const result = substitute(okMarkers, draftFull);
    const expected =
`rules_version = '2';
// outside-before
// ##ROADMAP:BEGIN##
new hardened
multi-line
roadmap content
// ##ROADMAP:END##
// outside-after
`;
    cases.push({ name: "initial promotion swaps inner content",
      ok: result === expected, got: result, want: expected });
  }

  // T2: rerun is a true no-op (already-promoted live).
  {
    const promoted = substitute(okMarkers, draftFull);
    const reRun    = substitute(promoted, draftFull);
    cases.push({ name: "rerun on promoted file is a byte-identical no-op",
      ok: reRun === promoted, got: reRun, want: promoted });
  }

  // T3: missing BEGIN marker in live → throws.
  {
    let threw = false;
    try { substitute(okMarkers.replace(BEGIN_MARKER, "// ##other##"), draftFull); }
    catch (e) { threw = /missing BEGIN/.test(e.message); }
    cases.push({ name: "missing BEGIN in live → error", ok: threw });
  }

  // T4: missing END marker in draft → throws.
  {
    let threw = false;
    try { substitute(okMarkers, draftFull.replace(END_MARKER, "// ##other##")); }
    catch (e) { threw = /missing END/.test(e.message); }
    cases.push({ name: "missing END in draft → error", ok: threw });
  }

  // T5: duplicate BEGIN markers in live → throws.
  {
    const dup = okMarkers + `\n${BEGIN_MARKER}\nx\n${END_MARKER}\n`;
    let threw = false;
    try { substitute(dup, draftFull); }
    catch (e) { threw = /BEGIN markers found/.test(e.message); }
    cases.push({ name: "duplicate BEGIN in live → error", ok: threw });
  }

  // T6: malformed draft (markers smushed into a non-marker line) → throws.
  // With whole-line marker detection, "// ##ROADMAP:BEGIN## // ##ROADMAP:END##"
  // is no marker at all, so neither BEGIN nor END is found — that's still
  // a hard error, just reported as a missing marker.
  {
    const bad = `head\n${BEGIN_MARKER} ${END_MARKER}\ntail\n`;
    let threw = false;
    try { substitute(okMarkers, bad); }
    catch (e) { threw = /missing (BEGIN|END)/i.test(e.message); }
    cases.push({ name: "malformed draft (markers smushed onto one line) → error", ok: threw });
  }

  // T7: outside-of-region bytes are preserved across promotion.
  {
    const result = substitute(okMarkers, draftFull);
    let ok = true;
    try { assertOutsideEqualsLive(okMarkers, result); }
    catch (e) { ok = false; }
    cases.push({ name: "diff scope is confined to the marker region", ok });
  }

  // T8: empty draft inner → refused.
  {
    const emptyDraft = `head\n${BEGIN_MARKER}\n${END_MARKER}\ntail\n`;
    let threw = false;
    try { substitute(okMarkers, emptyDraft); }
    catch (e) { threw = /empty/i.test(e.message); }
    cases.push({ name: "empty draft region → refused", ok: threw });
  }

  // T9: END before BEGIN → throws.
  {
    const reversed = `head\n${END_MARKER}\nmid\n${BEGIN_MARKER}\ntail\n`;
    let threw = false;
    try { substitute(reversed, draftFull); }
    catch (e) { threw = /before BEGIN/i.test(e.message); }
    cases.push({ name: "END before BEGIN → error", ok: threw });
  }

  // T10: real files end-to-end (uses checked-in firestore.rules + .draft).
  {
    if (fs.existsSync(RULES_PATH) && fs.existsSync(DRAFT_PATH)) {
      const live  = fs.readFileSync(RULES_PATH, "utf-8");
      const draft = fs.readFileSync(DRAFT_PATH, "utf-8");
      const result = substitute(live, draft);
      assertOutsideEqualsLive(live, result);
      // After substitution, the live's marked inner equals the draft's inner.
      const r1 = findRegion(result, "result");
      const d  = findRegion(draft, "draft");
      cases.push({ name: "real files: outside preserved + inner matches draft",
        ok: r1.inner === d.inner });
      // T11: second run is byte-identical (idempotent).
      const result2 = substitute(result, draft);
      cases.push({ name: "real files: second run is byte-identical",
        ok: result === result2 });
    } else {
      cases.push({ name: "real files: skipped (rules or draft missing)", ok: true });
    }
  }

  // T12: atomic write actually replaces the file.
  {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "promote-rules-test-"));
    const target = path.join(tmpdir, "x.txt");
    fs.writeFileSync(target, "before");
    atomicWrite(target, "after");
    const got = fs.readFileSync(target, "utf-8");
    cases.push({ name: "atomic write replaces target", ok: got === "after" });
    fs.unlinkSync(target);
    fs.rmdirSync(tmpdir);
  }

  let passed = 0, failed = 0;
  console.log("\nSelf-test results:");
  for (const c of cases) {
    const tag = c.ok ? "PASS" : "FAIL";
    console.log(`  [${tag}] ${c.name}`);
    if (c.ok) passed++;
    else {
      failed++;
      if (c.got) console.log("        got:  " + JSON.stringify(c.got).slice(0, 240));
      if (c.want) console.log("        want: " + JSON.stringify(c.want).slice(0, 240));
    }
  }
  console.log(`\n${passed}/${cases.length} passed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// ── Main ──────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);
  if (args.showHelp) { printUsage(); process.exit(0); }
  if (args.selfTest) { runSelfTest(); return; }

  if (!fs.existsSync(RULES_PATH)) { console.error(`ERROR: ${RULES_PATH} not found.`); process.exit(1); }
  if (!fs.existsSync(DRAFT_PATH)) { console.error(`ERROR: ${DRAFT_PATH} not found.`); process.exit(1); }
  const live  = fs.readFileSync(RULES_PATH, "utf-8");
  const draft = fs.readFileSync(DRAFT_PATH, "utf-8");

  let result;
  try { result = substitute(live, draft); }
  catch (err) { console.error(`ERROR: ${err.message}`); process.exit(2); }

  // Belt-and-braces: confirm we didn't move bytes outside the marker.
  try { assertOutsideEqualsLive(live, result); }
  catch (err) { console.error(`INTERNAL: ${err.message}`); process.exit(3); }

  const diff = unifiedDiff(live, result);
  console.log("Proposed change to firestore.rules:\n");
  console.log(diff);
  console.log();

  if (live === result) {
    console.log("firestore.rules already matches firestore.rules.draft's marked region. No action needed.");
    process.exit(0);
  }
  if (!args.apply) {
    console.log("Dry-run complete. Re-run with --apply to write firestore.rules.");
    process.exit(0);
  }
  atomicWrite(RULES_PATH, result);
  console.log(`Patched ${RULES_PATH}.`);
  console.log("Next steps:");
  console.log("  1. Review the diff above + run `git diff firestore.rules`.");
  console.log("  2. Run the emulator suite (require, not skip):");
  console.log("       FIRESTORE_EMULATOR_REQUIRED=1 npm run test:emulator");
  console.log("  3. Deploy: firebase deploy --only firestore:rules");
}

try { main(); } catch (err) { console.error("Fatal error:", err); process.exit(4); }
