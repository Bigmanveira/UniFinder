// ─────────────────────────────────────────────────────────────────────────────
// opsAdmins — invite / revoke / list helpers for the ops portal admin
// allowlist.
//
// Storage:
//   - The source of truth is the `admin: true` Firebase Auth custom
//     claim. The ops portal frontend reads this from the user's
//     ID token; the firestore.rules file's isAdmin() helper reads
//     the same field.
//   - We do NOT mirror the list into Firestore — duplicating it
//     would introduce a drift surface and the auth claim is already
//     authoritative everywhere it matters.
//
// Why custom claims, not a Firestore doc:
//   - Claims travel inside every ID token the client receives, so
//     server-side rule checks (Firestore, callables) are zero-cost.
//   - A Firestore-backed admin list would require an extra read on
//     every privileged operation.
//
// Listing cost:
//   - admin.auth().listUsers() pages up to 1000 users per call. For
//     an ops portal at this scale (a handful of admins, hundreds of
//     end-users), one call lists the entire user base; we then filter
//     to those carrying the admin claim. If we ever cross ~1k users,
//     we'll need to paginate — see the TODO in listOpsAdmins.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";
import { sendOpsSignInLinkEmail } from "./opsSignInEmail.js";

const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Three roles the ops portal recognises. `founder` matches the
 *  original boolean `admin: true` claim — sees and does everything,
 *  including managing roles + inviting/revoking admins. `analyst` and
 *  `developer` are scoped roles whose page access is configured by a
 *  founder via the Roles section of the Admins page; they always also
 *  carry admin:true so Firestore Rules' isAdmin() check passes for
 *  any read they're permitted to do via UI gating. */
export type OpsRole = "founder" | "analyst" | "developer";

export const OPS_ROLES: readonly OpsRole[] = ["founder", "analyst", "developer"];

export interface OpsAdminRow {
  uid:           string;
  email:         string | null;
  displayName:   string | null;
  photoURL:      string | null;
  role:          OpsRole;
  createdAtMs:   number | null;
  lastSignInMs:  number | null;
  emailVerified: boolean;
}

// Decide whether a user record carries the admin claim. Centralised so
// the check shape can evolve (e.g. role-based admins) without scanning
// every call site.
function hasAdminClaim(user: admin.auth.UserRecord): boolean {
  return user.customClaims?.admin === true;
}

/** Read the role custom claim, defaulting to founder for legacy
 *  admin-only accounts that haven't been migrated yet. Anyone with
 *  admin:true but no role gets treated as founder so day-one upgrade
 *  doesn't drop privileges. */
function readRole(user: admin.auth.UserRecord): OpsRole {
  const raw = user.customClaims?.role;
  if (raw === "analyst" || raw === "developer") return raw;
  return "founder";
}

function userToRow(user: admin.auth.UserRecord): OpsAdminRow {
  return {
    uid:           user.uid,
    email:         user.email ?? null,
    displayName:   user.displayName ?? null,
    photoURL:      user.photoURL ?? null,
    role:          readRole(user),
    createdAtMs:   user.metadata.creationTime ? new Date(user.metadata.creationTime).getTime() : null,
    lastSignInMs:  user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).getTime() : null,
    emailVerified: user.emailVerified,
  };
}

// ─── List ───────────────────────────────────────────────────────────────

export async function listOpsAdmins(): Promise<OpsAdminRow[]> {
  // TODO: paginate once the project's auth user count grows past ~1000.
  // For now one page is plenty.
  const list = await admin.auth().listUsers(1000);
  return list.users
    .filter(hasAdminClaim)
    .map(userToRow)
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
}

// ─── Invite ─────────────────────────────────────────────────────────────

export interface InviteAdminArgs {
  email:     string;
  /** Where the sign-in link should drop the new admin once they click
   *  through. Must be an authorised origin (the caller validates). */
  returnUrl: string;
  /** Resend API key — injected by the callable so this module
   *  doesn't have to know about the secret directly. */
  resendKey: string;
  /** Role to assign to the new admin. Defaults to founder for
   *  backwards compatibility with the original boolean-admin flow. */
  role?:     OpsRole;
}

export interface InviteAdminResult {
  /** True when we actually granted the claim. False when the target
   *  already had admin — the invite is a no-op in that case. */
  granted:    boolean;
  /** True when this call created a brand-new Firebase Auth user. */
  userCreated: boolean;
  uid:        string;
  email:      string;
  emailSent:  boolean;
}

export async function inviteOpsAdmin(args: InviteAdminArgs): Promise<InviteAdminResult> {
  const email = args.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }

  // 1. Find-or-create the Firebase Auth user. createUser throws when
  //    the address already exists with email/password auth disabled,
  //    so we look up first and create only if missing.
  let userRecord: admin.auth.UserRecord;
  let userCreated = false;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (err: any) {
    if (err?.code !== "auth/user-not-found") {
      throw new HttpsError("internal", `Could not look up user: ${err?.message ?? err}`);
    }
    // No auth user yet — provision one. We don't set a password;
    // they'll sign in via the email-link flow.
    try {
      userRecord = await admin.auth().createUser({ email, emailVerified: false });
      userCreated = true;
    } catch (createErr: any) {
      throw new HttpsError("internal", `Could not create user: ${createErr?.message ?? createErr}`);
    }
  }

  // 2. Set the admin custom claim AND the role claim. If they already
  //    carry both, we short-circuit so the audit log doesn't record a
  //    no-op as a grant. We write claims merged with the existing set
  //    so other unrelated claims (if any are added later) survive.
  const targetRole: OpsRole = args.role ?? "founder";
  const currentClaims = userRecord.customClaims ?? {};
  const alreadyAdmin  = currentClaims.admin === true;
  const sameRole      = currentClaims.role === targetRole;
  if (!alreadyAdmin || !sameRole) {
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      ...currentClaims,
      admin: true,
      role:  targetRole,
    });
  }

  // 3. Send the sign-in link. We do this even when the user was
  //    already an admin so the invite UI always lands an email (the
  //    operator might be re-inviting after the original link
  //    expired). Failures here aren't fatal — the claim is already
  //    set, the new admin can sign in via the regular flow.
  let emailSent = false;
  try {
    const link = await admin.auth().generateSignInWithEmailLink(email, {
      url:             args.returnUrl,
      handleCodeInApp: true,
    });
    await sendOpsSignInLinkEmail({
      apiKey: args.resendKey,
      to:     email,
      link,
    });
    emailSent = true;
  } catch (err: any) {
    console.warn("[ops-admin-invite] could not send sign-in email:", err?.message ?? err);
  }

  return {
    granted:     !alreadyAdmin,
    userCreated,
    uid:         userRecord.uid,
    email,
    emailSent,
  };
}

// ─── Revoke ─────────────────────────────────────────────────────────────

export interface RevokeAdminArgs {
  /** UID of the admin to demote. */
  targetUid: string;
  /** UID of the caller doing the revoking. We refuse self-revoke
   *  so the ops portal can't lock the last admin out of their own
   *  account by accident. The local grant-admin script can always
   *  restore the claim if it really comes to that. */
  actorUid:  string;
}

export async function revokeOpsAdmin(args: RevokeAdminArgs): Promise<{ revoked: boolean; uid: string }> {
  if (args.targetUid === args.actorUid) {
    throw new HttpsError(
      "failed-precondition",
      "You can't revoke your own admin access from the ops portal. Use the local grant-admin script to recover if you really mean to.",
    );
  }
  let user: admin.auth.UserRecord;
  try {
    user = await admin.auth().getUser(args.targetUid);
  } catch (err: any) {
    throw new HttpsError("not-found", `No user with UID ${args.targetUid}`);
  }
  if (!hasAdminClaim(user)) {
    return { revoked: false, uid: args.targetUid };
  }
  // Setting claims to {} (instead of { admin: false }) is the canonical
  // Firebase pattern for "remove all custom claims". `admin: false`
  // would still be a present claim — harmless today but confusing if
  // we ever add other claims that should default to absent.
  await admin.auth().setCustomUserClaims(args.targetUid, {});
  return { revoked: true, uid: args.targetUid };
}

// ─── Role change ────────────────────────────────────────────────────────

export interface SetRoleArgs {
  /** UID of the admin whose role is being changed. */
  targetUid: string;
  /** UID of the caller doing the change. Refuse a founder demoting
   *  themselves to prevent locking the org out of founder access. */
  actorUid:  string;
  /** Role to assign. */
  role:      OpsRole;
}

export async function setOpsAdminRole(args: SetRoleArgs): Promise<{ uid: string; role: OpsRole }> {
  if (!OPS_ROLES.includes(args.role)) {
    throw new HttpsError("invalid-argument", `Unknown role: ${args.role}`);
  }
  let user: admin.auth.UserRecord;
  try {
    user = await admin.auth().getUser(args.targetUid);
  } catch {
    throw new HttpsError("not-found", `No user with UID ${args.targetUid}`);
  }
  if (!hasAdminClaim(user)) {
    throw new HttpsError("failed-precondition", "Target user is not an admin.");
  }
  // Self-demote guard. The actor may freely change other people's
  // roles, but downgrading themselves out of `founder` could leave
  // the org with no founder. Frontend should also count founders
  // before showing this option, but defence-in-depth here.
  const currentRole = readRole(user);
  if (args.targetUid === args.actorUid && currentRole === "founder" && args.role !== "founder") {
    throw new HttpsError(
      "failed-precondition",
      "You can't demote yourself out of the Founder role from the ops portal.",
    );
  }
  const currentClaims = user.customClaims ?? {};
  await admin.auth().setCustomUserClaims(args.targetUid, {
    ...currentClaims,
    admin: true,
    role:  args.role,
  });
  return { uid: args.targetUid, role: args.role };
}

// ─── One-shot migration: any admin without a role becomes founder ───────

export interface MigrationResult {
  scanned:  number;
  migrated: number;
  alreadyRoled: number;
}

/** Idempotent backfill: every Firebase Auth user carrying admin:true
 *  without a `role` claim gets `role: "founder"` added. Used once after
 *  the role-based UI ships to ensure no current admin is left without a
 *  role. Safe to re-run. */
export async function migrateAdminsToFounders(): Promise<MigrationResult> {
  // Single-page listUsers is enough at current scale (see TODO at top
  // of this file). When we cross 1k users this will need pagination.
  const page = await admin.auth().listUsers(1000);
  let migrated     = 0;
  let alreadyRoled = 0;
  let scanned      = 0;
  for (const user of page.users) {
    if (!hasAdminClaim(user)) continue;
    scanned++;
    const role = user.customClaims?.role;
    if (role === "founder" || role === "analyst" || role === "developer") {
      alreadyRoled++;
      continue;
    }
    const currentClaims = user.customClaims ?? {};
    await admin.auth().setCustomUserClaims(user.uid, {
      ...currentClaims,
      admin: true,
      role:  "founder",
    });
    migrated++;
  }
  return { scanned, migrated, alreadyRoled };
}
