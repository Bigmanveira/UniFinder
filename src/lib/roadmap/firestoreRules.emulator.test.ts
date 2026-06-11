// ─────────────────────────────────────────────────────────────────────────────
// firestoreRules.emulator.test.ts — emulator-backed tests for the hardened
// studyRoadmaps rules (firestore.rules.draft) AND Firestore transactional
// concurrency.
//
// HOW TO RUN
//   1. Install the Firebase CLI: `npm i -g firebase-tools` (one-off, ops box)
//   2. Start the emulator with the DRAFT rules in a separate shell:
//        firebase emulators:start --only firestore --project demo-roadmap \
//          --import=./node_modules/.cache/empty || true \
//          --rules-file=firestore.rules.draft
//      (If the --rules-file flag is unsupported in your CLI version, the
//      test harness below points loadFirestore() at firestore.rules.draft
//      directly — the emulator picks it up at session-creation time.)
//   3. In the project root, run:
//        npx vitest run src/lib/roadmap/firestoreRules.emulator.test.ts
//
//   The test suite SKIPS itself when the FIRESTORE_EMULATOR_HOST env var
//   isn't set, so CI without the emulator running passes (with these tests
//   reported as skipped, not failed).
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction } from "firebase/firestore";

const PROJECT_ID = "demo-roadmap";
const HAS_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const EMULATOR_REQUIRED = process.env.FIRESTORE_EMULATOR_REQUIRED === "1";

// Default: skip when the emulator isn't running so a developer running
// `npm test` without firebase tools doesn't get a red CI.
// Release gate: set FIRESTORE_EMULATOR_REQUIRED=1 and the suite will run
// a sentinel test that HARD FAILS if the emulator is missing — used by
// the release-verification command.
const D = HAS_EMULATOR ? describe : describe.skip;

if (EMULATOR_REQUIRED) {
  describe("emulator must be running (release gate)", () => {
    it("FIRESTORE_EMULATOR_HOST is set", () => {
      // Throws if the emulator's not running. This makes the release
      // path refuse to silently skip the rules suite.
      expect(HAS_EMULATOR).toBe(true);
    });
  });
}

let testEnv: RulesTestEnvironment;

function validRoadmap(uid: string) {
  return {
    userId: uid,
    originCountry: "ghana",
    completedAcademicLevel: "bachelors",
    targetAcademicLevel: "masters",
    currentProcessStatus: ["just_starting"],
    primaryNeed: "finding_schools",
    preferredStartTerm: "fall_2026",
    currentStage: "discovery",
    progressPercentage: 0,
    recommendedTool: {
      label: "Find best-fit schools",
      route: "/intake",
      description: "Define what you want to study and how you'll fund it.",
    },
    checklist: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    completedOnboarding: true,
    version: 1,
  };
}

beforeAll(async () => {
  if (!HAS_EMULATOR) return;
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(resolve(__dirname, "../../../firestore.rules.draft"), "utf-8"),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  if (!HAS_EMULATOR) return;
  await testEnv.clearFirestore();
});

D("studyRoadmaps Firestore rules — emulator", () => {

  it("owner can create a valid roadmap", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "studyRoadmaps/alice"), validRoadmap("alice")));
  });

  it("owner can read their own roadmap", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studyRoadmaps/alice"), validRoadmap("alice"));
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "studyRoadmaps/alice")));
  });

  it("another user CANNOT read someone else's roadmap", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studyRoadmaps/alice"), validRoadmap("alice"));
    });
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "studyRoadmaps/alice")));
  });

  it("another user CANNOT write to someone else's roadmap", async () => {
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(setDoc(doc(bob, "studyRoadmaps/alice"), validRoadmap("alice")));
  });

  it("admin (custom claim) CAN read another user's roadmap", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studyRoadmaps/alice"), validRoadmap("alice"));
    });
    const adminCtx = testEnv.authenticatedContext("ops", { admin: true });
    await assertSucceeds(getDoc(doc(adminCtx.firestore(), "studyRoadmaps/alice")));
  });

  it("rejects create with invalid stage id", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bad = { ...validRoadmap("alice"), currentStage: "no_such_stage" };
    await assertFails(setDoc(doc(alice, "studyRoadmaps/alice"), bad));
  });

  it("rejects create with invalid origin country", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bad = { ...validRoadmap("alice"), originCountry: "atlantis" };
    await assertFails(setDoc(doc(alice, "studyRoadmaps/alice"), bad));
  });

  it("rejects create with progress outside 0..100", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bad = { ...validRoadmap("alice"), progressPercentage: 150 };
    await assertFails(setDoc(doc(alice, "studyRoadmaps/alice"), bad));
  });

  it("rejects create when userId field does not match path", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bad = { ...validRoadmap("alice"), userId: "bob" };
    await assertFails(setDoc(doc(alice, "studyRoadmaps/alice"), bad));
  });

  it("rejects create with unknown extra field", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bad = { ...validRoadmap("alice"), backdoor: "stuff" } as Record<string, unknown>;
    await assertFails(setDoc(doc(alice, "studyRoadmaps/alice"), bad));
  });

  it("rejects create with invalid top-level timestamps", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bad = { ...validRoadmap("alice"), createdAt: "2026-06-09T00:00:00Z" };
    await assertFails(setDoc(doc(alice, "studyRoadmaps/alice"), bad));
  });

  // ─── 50-item checklist boundary (CIO Blocker 2) ──────────────────────
  // The hardened rule caps the checklist at 50 items, validates every
  // The rules enforce the storage boundary. Full per-item validation is
  // covered by roadmapValidator.test.ts because unrolling 50 item-shape
  // checks exceeds Firestore's hard 1,000-expression request limit.

  it("ACCEPTS a checklist with exactly 50 valid items", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `x_${i}`, stage: "discovery", title: "x", description: "x",
      status: "not_started", required: true, toolRoute: null,
      completedAt: null, createdAt: 0, updatedAt: 0,
    }));
    const good = { ...validRoadmap("alice"), checklist: items };
    await assertSucceeds(setDoc(doc(alice, "studyRoadmaps/alice"), good));
  });

  it("REJECTS a checklist with 51 items (one over the cap)", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const items = Array.from({ length: 51 }, (_, i) => ({
      id: `x_${i}`, stage: "discovery", title: "x", description: "x",
      status: "not_started", required: true, toolRoute: null,
      completedAt: null, createdAt: 0, updatedAt: 0,
    }));
    const bad = { ...validRoadmap("alice"), checklist: items };
    await assertFails(setDoc(doc(alice, "studyRoadmaps/alice"), bad));
  });

  it("rejects update that changes userId", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studyRoadmaps/alice"), validRoadmap("alice"));
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(updateDoc(doc(alice, "studyRoadmaps/alice"), { userId: "bob" }));
  });

  it("rejects update that removes a required field", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studyRoadmaps/alice"), validRoadmap("alice"));
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    // Firestore SDK update with a top-level `delete()`-style removal —
    // we emulate by writing a doc that lacks `checklist`. setDoc replaces.
    const stripped: Record<string, unknown> = { ...validRoadmap("alice") };
    delete stripped.checklist;
    await assertFails(setDoc(doc(alice, "studyRoadmaps/alice"), stripped));
  });

  it("rejects update that decreases version", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studyRoadmaps/alice"), { ...validRoadmap("alice"), version: 2 });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(updateDoc(doc(alice, "studyRoadmaps/alice"), { version: 1 }));
  });

  it("rejects DELETE from the client even as the owner", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studyRoadmaps/alice"), validRoadmap("alice"));
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(deleteDoc(doc(alice, "studyRoadmaps/alice")));
  });

  it("backup subcollection is forbidden from client reads + writes", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "studyRoadmaps_backups/run1/users/alice")));
    await assertFails(setDoc(doc(alice, "studyRoadmaps_backups/run1/users/alice"), { fake: true }));
  });

  it("migration apply-status ledger is forbidden from client reads + writes", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "studyRoadmaps_backups/run1/applyStatus/alice")));
    await assertFails(setDoc(doc(alice, "studyRoadmaps_backups/run1/applyStatus/alice"), { state: "applied" }));
  });

  it("accepts a valid checklist item with notes within bounds", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const good = {
      ...validRoadmap("alice"),
      checklist: [{
        id: "x", stage: "discovery", title: "x", description: "x",
        status: "in_progress", required: true, toolRoute: null,
        completedAt: null, createdAt: 0, updatedAt: 0,
        notes: "Pending transcripts from UCC",
      }],
    };
    await assertSucceeds(setDoc(doc(alice, "studyRoadmaps/alice"), good));
  });

  it("rejects assumed_complete is accepted as a valid status (CIO new enum value)", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const good = {
      ...validRoadmap("alice"),
      checklist: [{
        id: "x", stage: "discovery", title: "x", description: "x",
        status: "assumed_complete", required: true, toolRoute: null,
        completedAt: 12345, createdAt: 0, updatedAt: 0,
      }],
    };
    await assertSucceeds(setDoc(doc(alice, "studyRoadmaps/alice"), good));
  });

  // ─── Post-migration shape (CIO Blocker 2 + 4) ────────────────────────
  // A doc that looks exactly like the output of roadmapMigration.cjs
  // — every canonical template item, currentProcessStatus as an array,
  // recommendedTool present — must be acceptable to the hardened rule.
  // Anything less and the migration would write a doc the rule rejects
  // on the next client update.

  it("ACCEPTS a post-migration shaped doc (full canonical checklist)", async () => {
    type RawTemplateItem = { id: string; title: string; description: string; required: boolean; toolRoute: string | null };
    const tmpl = JSON.parse(
      readFileSync(resolve(__dirname, "checklistTemplates.json"), "utf-8"),
    ) as Record<string, RawTemplateItem[]>;
    const stages = ["discovery", "school_matching", "application",
                    "admission_i20", "visa_preparation", "pre_departure"] as const;
    const items = stages.flatMap((stage) =>
      tmpl[stage].map((it: RawTemplateItem) => ({
        id: it.id, stage, title: it.title, description: it.description,
        status: "not_started", required: it.required, toolRoute: it.toolRoute,
        completedAt: null, createdAt: 0, updatedAt: 0,
      })),
    );
    // Sanity-check we're below the 50-item cap before we even ask the rule.
    expect(items.length).toBeLessThanOrEqual(50);
    const alice = testEnv.authenticatedContext("alice").firestore();
    const good = { ...validRoadmap("alice"), checklist: items };
    await assertSucceeds(setDoc(doc(alice, "studyRoadmaps/alice"), good));
  });

  // ─── Legacy doc rejection ────────────────────────────────────────────
  // A doc that's still in the pre-migration shape (currentProcessStatus
  // as a STRING, not an array) must be rejected by the new rule. This
  // is the contract that justifies running the migration before
  // promoting the rule: any client write of a legacy-shaped doc fails
  // under the new rule, so the migration must complete first.

  it("REJECTS a legacy-shaped doc with currentProcessStatus as a string", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const legacy = { ...validRoadmap("alice"), currentProcessStatus: "just_starting" } as unknown as Record<string, unknown>;
    await assertFails(setDoc(doc(alice, "studyRoadmaps/alice"), legacy));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Concurrency — proves transactions actually defend against lost
// updates. Runs two parallel updateChecklistItemStatus-equivalent
// transactions and asserts both items end up in their target state.
// ─────────────────────────────────────────────────────────────────────
D("account lifecycle Firestore rules — emulator", () => {
  it("allows an active owner to use protected product data", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice"), { accountStatus: "active" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "studentProfiles/alice"), { country: "ghana" }));
  });

  it("lets a restricted user read only their lifecycle status document", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice"), {
        accountStatus: "restricted",
        accountStatusReason: "Manual review",
      });
      await setDoc(doc(ctx.firestore(), "studentProfiles/alice"), { country: "ghana" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "users/alice")));
    await assertFails(getDoc(doc(alice, "studentProfiles/alice")));
    await assertFails(setDoc(doc(alice, "studentProfiles/alice"), { country: "usa" }));
  });

  it("prevents a user from creating their own restricted lifecycle state", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(alice, "users/alice"), {
      email: "alice@example.com",
      accountStatus: "restricted",
    }));
  });

  it("prevents an active user from changing server-managed lifecycle fields", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice"), {
        email: "alice@example.com",
        accountStatus: "active",
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(updateDoc(doc(alice, "users/alice"), {
      accountStatus: "restricted",
      accountStatusReason: "self assigned",
    }));
  });

  it("keeps restricted user data readable to an ops admin", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice"), { accountStatus: "restricted" });
      await setDoc(doc(ctx.firestore(), "studentProfiles/alice"), { country: "ghana" });
    });
    const admin = testEnv.authenticatedContext("ops", { admin: true }).firestore();
    await assertSucceeds(getDoc(doc(admin, "studentProfiles/alice")));
  });
});

D("studyRoadmaps concurrency — emulator", () => {
  it("two parallel transactions on different items both succeed", async () => {
    const initial = {
      ...validRoadmap("alice"),
      checklist: [
        { id: "a", stage: "discovery", status: "not_started", required: true, title: "x", description: "x", toolRoute: null, completedAt: null, createdAt: 0, updatedAt: 0 },
        { id: "b", stage: "discovery", status: "not_started", required: true, title: "x", description: "x", toolRoute: null, completedAt: null, createdAt: 0, updatedAt: 0 },
      ],
    };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studyRoadmaps/alice"), initial);
    });
    const alice = testEnv.authenticatedContext("alice").firestore();

    // Two concurrent tx — one flips item a → completed, the other flips
    // b → in_progress. If transactions are working, both flips persist.
    const flip = (id: string, status: string) =>
      runTransaction(alice, async (tx) => {
        const ref = doc(alice, "studyRoadmaps/alice");
        const snap = await tx.get(ref);
        const data = snap.data() as { checklist: Array<Record<string, unknown>> };
        const next = data.checklist.map((it) => it.id === id ? { ...it, status } : it);
        tx.update(ref, { checklist: next });
      });

    await Promise.all([flip("a", "completed"), flip("b", "in_progress")]);

    let finalData: { checklist: Array<{ id: string; status: string }> } | undefined;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), "studyRoadmaps/alice"));
      finalData = snap.data() as { checklist: Array<{ id: string; status: string }> };
    });
    const data = finalData!;
    expect(data.checklist.find((i) => i.id === "a")!.status).toBe("completed");
    expect(data.checklist.find((i) => i.id === "b")!.status).toBe("in_progress");
  });
});

// Module marker so vitest doesn't treat an emulator-less run as a fail
export const __emulatorTestsLoaded = true;
