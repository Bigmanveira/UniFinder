// ─────────────────────────────────────────────────────────────────────────────
// maintenanceMode — global kill-switch helper for the user-facing app.
//
// The runtime config lives at /appConfig/runtime as a single Firestore
// doc. When `maintenanceMode === true`:
//   - User-facing Cloud Functions reject with HttpsError("unavailable",
//     <message>) before doing any work. See `assertNotInMaintenance`.
//   - The main app's React tree replaces every authenticated route
//     with a branded MaintenancePage. The marketing pages
//     (Landing / Pricing / Waitlist / FAQ) are deliberately NOT
//     gated so visitors can still sign up for the waitlist + read
//     about the product during a maintenance window.
//
// Admin bypass:
//   `assertNotInMaintenance` returns early when the caller carries the
//   `admin: true` custom claim. Admins continue to operate through the
//   user app + Cloud Functions during maintenance, which is what you
//   want for smoke-testing major releases before flipping it off.
//
// Caching:
//   The doc is read on every gated call. We keep a tiny in-process
//   cache (5 second TTL) so a burst of legit traffic doesn't hammer
//   Firestore for the same flag. 5s is short enough that the "we're
//   live again!" recovery time stays operator-acceptable.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

const CACHE_TTL_MS = 5_000;
const RUNTIME_DOC_PATH = "appConfig/runtime";

interface CachedConfig {
  fetchedAt:        number;
  maintenanceMode:  boolean;
  message:          string;
}
let cache: CachedConfig | null = null;

async function loadRuntimeConfig(): Promise<CachedConfig> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }
  try {
    const snap = await admin.firestore().doc(RUNTIME_DOC_PATH).get();
    const data = snap.exists ? snap.data() ?? {} : {};
    cache = {
      fetchedAt:       now,
      maintenanceMode: data.maintenanceMode === true,
      message:         typeof data.maintenanceMessage === "string" ? data.maintenanceMessage : "",
    };
    return cache;
  } catch (err) {
    // If we can't read the config we fail OPEN — better to keep the
    // app available on a transient Firestore hiccup than to lock
    // every user out because the kill switch is unreadable.
    console.warn("[maintenance] could not load runtime config:", err);
    cache = { fetchedAt: now, maintenanceMode: false, message: "" };
    return cache;
  }
}

/**
 * Throw HttpsError("unavailable", ...) if maintenance mode is on AND the
 * caller is NOT carrying the admin custom claim. Call this at the top
 * of every user-facing callable; skip it on marketing-tier callables
 * (submitWaitlist, listCreditPacks) and on ops-portal callables
 * (sendOpsSignInLink, recordOpsAuditEvent, etc).
 */
export async function assertNotInMaintenance(request: { auth?: { token?: any } | null }): Promise<void> {
  // Admin bypass — read directly from the token so we don't even hit
  // Firestore for admin-authenticated calls.
  if (request.auth?.token?.admin === true) return;

  const cfg = await loadRuntimeConfig();
  if (cfg.maintenanceMode) {
    const fallbackMsg = "The app is temporarily down for maintenance. Please try again shortly.";
    throw new HttpsError(
      "unavailable",
      cfg.message && cfg.message.trim().length > 0 ? cfg.message : fallbackMsg,
    );
  }
}

/**
 * Atomically flip the maintenance flag + log who did it. Returns the
 * new state so the caller (the setMaintenanceMode callable) can echo
 * it back to the operator. Invalidates the in-process cache so a
 * subsequent gated call sees the new value immediately.
 *
 * `etaMs` is optional. When provided + enabled, the user-facing
 * MaintenancePage shows a live countdown to that timestamp. When
 * absent or null, the maintenance page just shows the static message.
 */
export async function setMaintenanceFlag(args: {
  enabled:    boolean;
  message?:   string;
  etaMs?:     number | null;
  actorUid:   string;
  actorEmail: string | null;
}): Promise<{ maintenanceMode: boolean; message: string; etaMs: number | null; updatedAt: any }> {
  const db  = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const etaMs = typeof args.etaMs === "number" && isFinite(args.etaMs) && args.etaMs > 0
    ? Math.floor(args.etaMs)
    : null;
  const payload: Record<string, unknown> = {
    maintenanceMode:      args.enabled,
    maintenanceMessage:   typeof args.message === "string" ? args.message : "",
    maintenanceEta:       etaMs !== null
      ? admin.firestore.Timestamp.fromMillis(etaMs)
      : admin.firestore.FieldValue.delete(),
    maintenanceUpdatedAt: now,
    maintenanceUpdatedBy: args.actorUid,
    maintenanceUpdatedByEmail: args.actorEmail,
  };
  // Only stamp the "started at" timestamp when turning maintenance ON,
  // so post-incident analysis can see when the window opened versus
  // every individual toggle.
  if (args.enabled) {
    payload.maintenanceStartedAt = now;
  }
  await db.doc(RUNTIME_DOC_PATH).set(payload, { merge: true });
  // Invalidate the in-process cache so the next assertNotInMaintenance
  // sees the new state without waiting for the 5s TTL.
  cache = null;
  return {
    maintenanceMode: args.enabled,
    message:         payload.maintenanceMessage as string,
    etaMs,
    updatedAt:       now,
  };
}
