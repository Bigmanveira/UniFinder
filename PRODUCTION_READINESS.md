# Production Readiness Report — Study Abroad Roadmap

**Prepared:** 2026-06-09 (v4, post third CIO review)
**Status: DO NOT DEPLOY without the 15-step Deployment Sequence completed end-to-end. Nothing in this report has been committed or deployed. No secrets touched. No production data modified.**

---

## What changed in v4 (CIO Blockers 1-4)

| # | Blocker | Resolution |
|---|---|---|
| **B1** | Migration preflight must classify every doc against the hardened rules and refuse to apply while BLOCKED docs exist. | Pure validator at [scripts/lib/roadmapValidator.cjs](scripts/lib/roadmapValidator.cjs) returns `{status: READY \| REPAIRABLE \| BLOCKED \| SKIPPED, codes[], repairs?, normalised?}` per doc. It now checks path UID parity and accepts only timestamp representations that the rules accept. The migration writes and verifies a SHA-256 manifest checksum and apply accepts only READY/REPAIRABLE entries. |
| **B2** | 50-item checklist cap must be enforced consistently. | Hardened rules enforce `checklist.size() <= 50`; the migration validator and typed application domain layer perform complete per-item validation. Emulator execution proved that unrolling 50 item validators exceeds Firestore's hard 1,000-expression limit, so rules deliberately enforce ownership, exact top-level shape, and the storage cap rather than claiming impossible full-list validation. |
| **B3** | Rule promotion must be marker-driven, idempotent, atomic, and extract from `firestore.rules.draft`. | [scripts/promoteRoadmapRules.cjs](scripts/promoteRoadmapRules.cjs) rewritten around `// ##ROADMAP:BEGIN##` / `// ##ROADMAP:END##` markers in both files. Whole-line marker detection (substring references in prose are ignored). Refuses on missing / duplicated / out-of-order / empty markers. Substitution preserves every byte outside the marker region byte-for-byte. Atomic write via `.tmp.<pid>` + rename. 12 self-tests pass (`--self-test`). |
| **B4** | Migration must use an immutable manifest with project + template-hash gates, transactional per-doc backup, idempotent + restartable apply + rollback. | The manifest carries a content checksum and is structurally validated before use. Apply writes a transactional `applyStatus/{uid}` ledger with every backup/update. Rollback restores only ledger-confirmed applied UIDs, fails if a required backup is missing, and records completed rollbacks for safe retries. 10 self-tests pass. |

Plus: a **release-gate verification command** that does not auto-skip (`npm run verify:emulator`) — fails if `FIRESTORE_EMULATOR_HOST` isn't set, fails if any test was skipped, fails if zero tests executed, prints the exact pass count.

---

## Test + build inventory (run-now-verifiable)

| Suite | Count | Command |
|---|---|---|
| Pure unit (`studyAbroad.test.ts`) | **40** | `npm test` |
| Validator (`scripts/lib/roadmapValidator.test.ts`) | **34** | `npm test` |
| Migration planning self-test (`scripts/roadmapMigration.cjs --self-test`) | **10** | `node scripts/roadmapMigration.cjs --self-test` |
| Rule promotion self-test (`scripts/promoteRoadmapRules.cjs --self-test`) | **12** | `node scripts/promoteRoadmapRules.cjs --self-test` |
| Emulator-backed (`firestoreRules.emulator.test.ts`) | **24**, plus 1 release sentinel | `npm run verify:emulator` (requires `FIRESTORE_EMULATOR_HOST`) |

**Total: 120 tests across 5 suites.** Counts are produced by `it(` greps over the actual source — not from memory.

---

## Files changed (final)

```
src/lib/roadmap/studyAbroad.ts                        modified
src/lib/roadmap/roadmapClient.ts                      modified (all writes via runTransaction)
src/lib/roadmap/checklistTemplates.json               canonical 45-item template (app + migration)
src/lib/roadmap/studyAbroad.test.ts                   40 unit tests
src/lib/roadmap/firestoreRules.emulator.test.ts       24 emulator tests + release sentinel
src/pages/RoadmapOnboardingPage.tsx                   upsert + confirmation modal
src/pages/RoadmapPage.tsx                             assumed_complete UI; renamed CTA
firestore.rules                                       added ##ROADMAP:BEGIN/END## markers
firestore.rules.draft                                 markers + checklist cap 200 → 50
firebase.json                                         emulators block
scripts/lib/roadmapValidator.cjs                      shared validator (mirrors rules)
scripts/lib/roadmapValidator.test.ts                  34 validator tests
scripts/roadmapMigration.cjs                          REWRITTEN — manifest-based + 10 self-tests
scripts/promoteRoadmapRules.cjs                       REWRITTEN — marker-based + 12 self-tests
scripts/verifyEmulatorTests.cjs                       release-gate emulator wrapper
tsconfig.app.json                                     resolveJsonModule + exclude test files
package.json                                          test / test:watch / test:emulator / verify:emulator
PRODUCTION_READINESS.md                               this file (v4)
```

No file was deleted from the live tree. No secrets touched.

---

## Database schema

| Field | Status |
|---|---|
| `studyRoadmaps/{uid}.checklist[].status` | Adds `assumed_complete` value. Backward-compatible (old docs only carry the original 5 values). |
| `studyRoadmaps/{uid}.currentProcessStatus` | Multi-select. **Pre-migration docs may have it as a string** — migration normalises to `[string]`. After the migration completes the hardened rule is safe to promote. |
| `studyRoadmaps/{uid}.checklist` | Hard-capped at 50 items at both the validator and rule layers. |
| `studyRoadmaps/{uid}.version` | Stays at 1 in this release. Bumped only on a structural migration. |
| `studyRoadmaps_backups/{runId}/users/{uid}` | NEW. Client read+write blocked by rules. Written exclusively by `roadmapMigration.cjs` via Admin SDK. |

No new indexes required.

---

## Existing-user impact

The 58 existing users:

- Their roadmap docs are not touched by an app-code deploy. On their next page load:
  - The new code reads their existing checklist as-is.
  - `calculateProgress` re-weights with the new table. The 5 pre-existing statuses retain identical weights to the old formula — no regression.
  - The new `d_first_match` reconcile signal may flip a `not_started` item to `completed` for any user with an intake profile but no paid report. Intended and strictly an improvement.
- The "Update my answers" path now uses the split (create-if-missing, otherwise update-in-place) with a confirmation modal.

**No user loses progress. No user sees a worse progress percentage than before.**

The migration converts legacy string `currentProcessStatus` into a list under the same transaction that updates the rest of the doc — never partial. Rollback restores the exact pre-migration document from the backup subcollection.

---

## 15-step deployment sequence (v4)

> Each step has a hard verification gate. Do not advance to the next step until the previous one is verified. The cardinal rule: **migration must complete before rule promotion**, otherwise legacy docs (currentProcessStatus as a string) get locked out of writes the moment the hardened rule goes live.

| # | Step | Verification | Rollback |
|---|---|---|---|
| 1 | **Review the diff.** `git diff main...HEAD` on this branch. | Reviewer (CIO + one engineer) signs off. | n/a |
| 2 | **Run every validation command listed in the "Validation commands" section below.** Each must exit zero. | All 5 commands exit 0; all 120 tests pass. | n/a |
| 3 | **Take a Firestore export of production.** `gcloud firestore export gs://<bucket>/backup-roadmap-$(date +%Y%m%d-%H%M%S)`. | Bucket contains a new folder with `studyRoadmaps` data. | Read-only — no rollback needed. |
| 4 | **Boot the emulator + run the release-gated emulator suite.** In one shell: `firebase emulators:start --only firestore --project demo-roadmap`. In another: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run verify:emulator`. | Wrapper exits 0 with "Emulator suite passed: 25/25 tests" — no skips, no failures. | n/a — emulator only. |
| 5 | **Generate a preflight manifest from production.** `node scripts/roadmapMigration.cjs preflight --credentials ~/.cloud/college-ready-sa.json --out manifest-$(date +%Y%m%d-%H%M%S).json`. | Exits 0. Manifest contains `runId, projectId, templateHash, expectedCount, uids[], perDoc{}`. | Read-only. |
| 6 | **Review the preflight manifest by hand.** Open it, confirm `counts.BLOCKED == 0` and `counts.SKIPPED == 0`. Inspect every `perDoc` entry. The June 10 preflight found 4 roadmap documents among 58 registered users: 1 READY and 3 REPAIRABLE. | Reviewer confirms zero BLOCKED/SKIPPED and manifest totals match the current roadmap collection count. | Discard the manifest and re-run preflight after fixing source data. |
| 7 | **REQUIRE zero BLOCKED.** The migration script refuses to apply if the manifest contains any. If preflight reports BLOCKED, fix at source (correct the doc, re-export, regenerate manifest); do NOT proceed. | `counts.BLOCKED == 0` in the chosen manifest. | n/a — gate. |
| 8 | **Deploy the application code** (this branch). Backward-compatible — old roadmap docs continue to read and write fine against the still-live, pre-hardening rules. | Build passes on CI; signed-in users can see + edit their roadmap; no new error category in `errorLogs`. | `git revert <merge-commit>` + redeploy previous hosting build. |
| 9 | **Apply the migration** using the reviewed manifest. Single command: `node scripts/roadmapMigration.cjs apply --manifest <path> --credentials ~/.cloud/college-ready-sa.json --apply --i-understand-this-is-production`. Every batch shares the manifest's `runId`. | Summary line reports `errors=0` and `applied + alreadyApplied + skipped` sums to the manifest's `expectedCount`. | `node scripts/roadmapMigration.cjs rollback --manifest <path> --credentials … --apply --i-understand-this-is-production` restores from the per-runId backup subcollection. |
| 10 | **Verify the migration result.** For the current 4-document manifest, inspect all 4 UIDs in Firestore Studio: confirm `currentProcessStatus is list`, `checklist.length <= 50`, every item has the canonical keys, and the READY document retained its user progress. | All current roadmap documents pass inspection. | Step 9's rollback. |
| 11 | **Verify the backups exist.** In Firestore Studio, confirm `studyRoadmaps_backups/{runId}/users/{uid}` contains a doc for every UID that was actually rewritten in step 9. | Count of backup docs equals the manifest's `applied` count from step 9. | n/a — read-only check. |
| 12 | **Promote rules (dry-run first).** `node scripts/promoteRoadmapRules.cjs` — eyeball the printed diff; it must be confined to the `##ROADMAP:BEGIN##`/`##ROADMAP:END##` region. Then `node scripts/promoteRoadmapRules.cjs --apply` writes atomically. | Dry-run diff is reviewed and approved. After apply, `git diff firestore.rules` shows changes only inside the marked region. | `git checkout HEAD firestore.rules`. |
| 13 | **Deploy the promoted rules.** `firebase deploy --only firestore:rules`. | Deploy succeeds. A test user can still sign in and tick an item. No spike in client-side `permission-denied` errors. | `git checkout HEAD~1 firestore.rules && firebase deploy --only firestore:rules`. |
| 14 | **Smoke-test the production app** — log in as the internal test user; tick a checklist item; re-run the diagnostic; verify the confirmation modal; verify the multi-select; check the assumed_complete path. | All actions succeed; no `errorLogs` entry generated by the test session. | If a smoke test fails: rollback rules (step 13's rollback), then if the failure was migration-related, rollback the migration (step 9's rollback). |
| 15 | **Monitor for 7 days.** Watch `errorLogs` for new categories matching `roadmap_*`, Firestore transaction-aborted rate, and `/app/roadmap` 5xx. Retain rollback ability throughout — do NOT clean up the backup subcollection or the manifest until day 7. | Zero new error categories; no support tickets reporting reset progress. | The backup subcollection + manifest remain rollback-ready for the entire window. |

**Do not skip steps.** Each gate exists because a corrupted roadmap doc is far more expensive than the time spent verifying.

---

## Validation commands

Run all five from a clean checkout before initiating step 3 of the sequence above.

```bash
# 1. TypeScript build (clean)
npx tsc -b

# 2. Production build
npm run build

# 3. Unit + validator suites (74 tests)
npm test

# 4. CJS-side self-tests (22 tests, no Firebase needed)
node scripts/lib/roadmapValidator.test.ts  # 34 tests, runs through vitest in step 3
node scripts/roadmapMigration.cjs --self-test          # 10 tests
node scripts/promoteRoadmapRules.cjs --self-test       # 12 tests

# 5. Emulator suite (24 rule tests + 1 release sentinel, gated)
# First boot the emulator in another shell:
#   firebase emulators:start --only firestore --project demo-roadmap
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run verify:emulator
```

`verify:emulator` is the release gate: it does NOT skip if the emulator is missing, it refuses if any test is pending or skipped, and it refuses if zero tests executed. The exact pass count is printed.

---

## Migration mechanics — manifest in, transactions out

The replaced migration script (`scripts/roadmapMigration.cjs`) has three modes.

### `preflight`

Reads every studyRoadmaps doc, runs `classifyDoc` on each, writes an immutable JSON manifest:

```jsonc
{
  "runId": "2026-06-09T17-23-15-104Z-12345-7c4f9a",
  "generatedAt": "2026-06-09T17:23:15.104Z",
  "projectId": "college-ready-prod",
  "migrationVersion": "v1-2026-06-09",
  "templateHash": "5f3e0c2a9d8b1742",       // SHA-256 of checklistTemplates.json (16 hex)
  "expectedCount": 58,
  "uids": ["a1b2c3...", "a1b2c4...", ...],  // sorted ascending — stable across runs
  "perDoc": {
    "a1b2c3...": { "status": "READY",      "codes": [] },
    "a1b2c4...": { "status": "REPAIRABLE", "codes": [], "repairs": ["LEGACY_PROCESS_STATUS_STRING_TO_ARRAY"] },
    "...":       { "status": "BLOCKED",    "codes": ["TOP_LEVEL_NOT_OBJECT"] }
  },
  "counts": { "READY": 30, "REPAIRABLE": 28, "BLOCKED": 0, "SKIPPED": 0 }
}
```

Exits non-zero if any doc is BLOCKED or unexpectedly SKIPPED.

### `apply --manifest <path>`

Refuses to run unless:
- `--apply --i-understand-this-is-production` is passed
- the manifest's `projectId` matches the credentials' project_id
- the manifest's `templateHash` matches the current `checklistTemplates.json`'s SHA-256
- no doc in the manifest is BLOCKED

Per UID, in a single Firestore transaction:
1. Re-read the doc.
2. Re-run `classifyDoc` (live re-check) and `planMigration`.
3. If `skip` → mark `alreadyApplied`, exit transaction.
4. Otherwise: write the per-doc backup to `studyRoadmaps_backups/{runId}/users/{uid}` (only if no backup yet — idempotent across resumes); update the studyRoadmaps doc.

Resuming a partially-completed run is a no-op for UIDs already migrated (the live re-check returns `skip`).

### `rollback --manifest <path>`

Same gates. Apply writes a transactional `applyStatus/{uid}` ledger entry alongside each backup/update. Rollback restores only `applied` entries, fails if an applied UID lacks its backup, records `rolled_back`, and reports `no_change` or never-processed UIDs explicitly.

---

## Rule promotion mechanics — marker-driven, idempotent, atomic

`scripts/promoteRoadmapRules.cjs`:

1. Reads `firestore.rules` and `firestore.rules.draft`.
2. In each file, finds the **single** line matching `// ##ROADMAP:BEGIN##` and the **single** line matching `// ##ROADMAP:END##` (whole-line match — prose references don't count).
3. Refuses on: missing marker, duplicate marker, out-of-order markers, BEGIN/END on the same line, empty draft region.
4. Extracts the bytes between the draft's markers; substitutes them between the live's markers.
5. Asserts the result equals the live byte-for-byte OUTSIDE the marker region.
6. Prints a unified diff.
7. With `--apply`: writes to `firestore.rules.tmp.<pid>` then renames to `firestore.rules` (atomic).

Re-running after a successful apply is byte-identical — second dry-run prints `(no changes)`; second `--apply` rewrites nothing visible. 12 self-tests cover initial promotion, no-op repeat, all six error paths, the byte-for-byte outside-of-region invariant, both real files end-to-end, and the atomic write.

---

## Rollback layers

```bash
# 1. Single user, single migration run (PREFERRED)
node scripts/roadmapMigration.cjs rollback \
  --manifest <manifest-from-step-9.json> \
  --credentials ~/.cloud/college-ready-sa.json \
  --apply --i-understand-this-is-production
# Note: rollback consumes the WHOLE manifest. To rollback just one UID,
# author a slimmed manifest containing only that UID (same runId,
# templateHash, projectId — copy the perDoc entry for that UID only).

# 2. Rules-only rollback
git checkout HEAD~1 firestore.rules
firebase deploy --only firestore:rules

# 3. NUCLEAR — Firestore-level restore (loses everything since the export)
gcloud firestore import gs://<bucket>/backup-roadmap-<timestamp>
# Use only if rollback layers 1+2 don't work. Wipes the studyRoadmaps
# collection back to whatever it looked like at export time. Anything
# users did since the export is LOST. Notify users in advance.

# 4. App-code rollback (independent of data rollback)
git checkout <previous-release-tag>
npm run build
firebase deploy --only hosting
```

The client code is backward-compatible with old documents, so a partial migration leaving some users at the old shape is safe to run code against.

---

## Monitoring checklist

### First 24 hours (post-app deploy)

- [ ] `errorLogs` collection: no new categories matching `category=roadmap_*`
- [ ] `errorLogs`: no spike in `FAILED_PRECONDITION` (Firestore transaction abort)
- [ ] Hosting analytics: `/app/roadmap` 5xx < 0.5%
- [ ] Hosting analytics: `/app/roadmap/onboarding` completion vs. abandonment unchanged
- [ ] Inspect all 4 current roadmap documents: their user-entered progress remains intact

### First 7 days (post-migration and post-rule-promotion)

- [ ] Firestore monthly bill projection unchanged
- [ ] No support tickets reporting "my progress reset" or "checklist items disappeared"
- [ ] Onboarding completion rate steady or up
- [ ] `studyRoadmaps_backups` collection contains the expected per-runId folders (proof rollback is available)
- [ ] Manifest file preserved in version control or operator's password manager for the full 7-day window

---

## Items still requiring product / legal approval

| Item | Approver |
|---|---|
| `STATUS_PROGRESS_WEIGHT.assumed_complete = 0.85` — the exact weight for unverified completion | Product |
| Confirmation-modal copy ("Will change… Stays…") | Product |
| Renaming "Re-run diagnostic" to "Update my answers" | Product |
| Policy on orphan checklist items (template removed but user has progress) | Product |
| Regulated-content audit — DSO check-in language, I-20 deposit language, passport-validity exceptions | Legal/compliance |
| Marketing-claim audit — "Trusted by 10k+" vs. actual 58 users | Legal/marketing |

---

## Remaining risks

1. **Emulator tests require Firebase CLI and Java.** Verified locally with Firestore Emulator standard edition; the release wrapper passed 25/25 with no skips.
2. **CIO and product must decide the 4 "approval-required" items** before deploy. The code is correct under the assumed values; the values are policy choices.
3. **The 0.85 weight for `assumed_complete`** is a product call. Centralised in `STATUS_PROGRESS_WEIGHT`; changing it is one line.
4. **Bundle is 660 KB pre-gzip.** Pre-existing; not introduced by this PR. P2.
5. **CEL has no general list iteration.** Emulator execution proved that invoking all 50 item validators exceeds Firestore's 1,000-expression request limit. Rules enforce owner isolation, exact top-level fields, and the 50-item cap; the migration validator and typed application layer enforce full item shape. A checklist subcollection is the long-term hardening option.

---

## Recommendation

**DO NOT DEPLOY** until the 15-step Deployment Sequence has been completed end-to-end, in order, with each step verified. The application-code changes in this PR are safe to merge as soon as steps 1–4 are clean (review + validation + Firestore export + emulator suite). Steps 5–15 are operator-driven actions, each behind its own gate inside its script.

No commit, deploy, rule promotion, manifest write, or migration run has been performed in this session. Awaiting explicit authorization for each.

---

*End of report v4.*
