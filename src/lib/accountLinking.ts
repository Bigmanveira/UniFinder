// ─────────────────────────────────────────────────────────────────────────────
// Account linking — bridges the cross-method sign-in gap.
//
// Without this, a user who signed up via Google and then tries the email-link
// flow (or vice versa) ends up with TWO separate Firebase Auth UIDs — and
// therefore two /users docs, two /creditWallets docs, two of everything. The
// linked-accounts panel in the ops portal makes that situation visible after
// the fact; this module prevents it.
//
// The flow looks like this:
//
//   1. User signs in via method B (e.g., Google) when an account already
//      exists via method A (e.g., email-link). Firebase Auth throws
//      `auth/account-exists-with-different-credential`. The error object
//      carries the method-B credential.
//   2. We stash the method-B credential in sessionStorage with the email
//      (so future page loads in the same tab can find it).
//   3. We route the user through method A's sign-in instead.
//   4. After method A succeeds, we read the stashed credential and call
//      `linkWithCredential(currentUser, stashedCred)` — Firebase attaches
//      the new sign-in method to the EXISTING UID. One human, one account.
//   5. Future sign-ins via either method land on the same UID.
//
// Limitations to know:
//   • Credentials carry short-lived tokens. We assume the user completes
//     the cross-method flow within minutes. A user who lets a link sit in
//     their inbox for hours will still get linking, but Firebase may reject
//     stale credentials in edge cases.
//   • sessionStorage scopes to one tab. If the user clicks the email link
//     in a different tab/device, we lose the pending credential. The fallback
//     is they end up signed-in but un-linked — same state as before this
//     module existed, no regression.
//   • Requires the Firebase Console setting "One account per email address"
//     to be enabled (Authentication → Settings → User account linking).
//     Without that setting Firebase silently creates duplicate accounts and
//     never throws the error we're catching here.
// ─────────────────────────────────────────────────────────────────────────────

import type { AuthCredential, User } from "firebase/auth";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
} from "firebase/auth";

// Stash format on sessionStorage. We don't serialize the credential
// object itself — Firebase v10's modular SDK doesn't export a stable
// AuthCredential.fromJSON across providers. Instead we record the
// MINIMUM material needed to rebuild a fresh credential via each
// provider's public constructor when we want to link.
//
// Shapes:
//   { kind: "google.com", idToken, accessToken?, email }
//   { kind: "emailLink", email, link }
//
// Rebuilding uses GoogleAuthProvider.credential() / EmailAuthProvider
// .credentialWithLink(), which are stable public surface.
type StashedGoogle = {
  kind:         "google.com";
  idToken:      string | null;
  accessToken:  string | null;
  email:        string;
};
type StashedEmailLink = {
  kind:  "emailLink";
  email: string;
  link:  string;
};
type Stashed = StashedGoogle | StashedEmailLink;

const STASH_KEY = "auth:pendingCredential";

function writeStash(s: Stashed): void {
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify(s));
  } catch (err) {
    // sessionStorage can fail in private modes / iframes. The user just
    // won't get the linking auto-magic; sign-in still works.
    console.warn("[account-linking] could not stash credential:", err);
  }
}

function readStash(): Stashed | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj?.kind !== "google.com" && obj?.kind !== "emailLink") return null;
    return obj as Stashed;
  } catch {
    return null;
  }
}

/** Stash a Google credential the user couldn't use because an
 *  email-link account already exists for this email. The credential is
 *  reconstructed from the idToken when we link. Survives one page
 *  navigation in the same tab. */
export function stashPendingCredential(cred: AuthCredential, email: string): void {
  const normalized = email.trim().toLowerCase();
  // The cred object's toJSON() exposes the underlying tokens. Field
  // names differ slightly between provider implementations; we read
  // defensively so we don't blow up on a future SDK rev.
  const json: any = cred.toJSON?.() ?? {};
  const providerId = String(json.providerId ?? json.signInMethod ?? "");
  if (providerId === "google.com" || providerId.startsWith("google")) {
    writeStash({
      kind:        "google.com",
      idToken:     typeof json.oauthIdToken === "string" ? json.oauthIdToken : null,
      accessToken: typeof json.oauthAccessToken === "string" ? json.oauthAccessToken : null,
      email:       normalized,
    });
    return;
  }
  // Email-link credentials don't carry useful material in toJSON for us
  // (the OOB code is in the "password" field but is single-use). The
  // caller should use stashPendingEmailLink() with the actual link URL.
  console.warn("[account-linking] stashPendingCredential called with unknown provider:", providerId);
}

/** Stash an email-link credential by storing the raw link URL. We
 *  rebuild the credential later via EmailAuthProvider.credentialWithLink
 *  at the moment we attempt linkWithCredential. */
export function stashPendingEmailLink(email: string, link: string): void {
  writeStash({
    kind:  "emailLink",
    email: email.trim().toLowerCase(),
    link,
  });
}

/** Clear the stashed credential. Called after successful linking, or
 *  when the user starts a totally fresh sign-in flow that shouldn't
 *  carry an old pending state. */
export function clearPendingCredential(): void {
  sessionStorage.removeItem(STASH_KEY);
}

/** Helper to materialize the stored stash into a live AuthCredential
 *  the SDK can use with linkWithCredential. Returns null if anything is
 *  missing — caller drops the stash and continues. */
function buildCredential(s: Stashed): AuthCredential | null {
  if (s.kind === "google.com") {
    if (!s.idToken && !s.accessToken) return null;
    return GoogleAuthProvider.credential(s.idToken, s.accessToken);
  }
  if (s.kind === "emailLink") {
    if (!s.email || !s.link) return null;
    try {
      return EmailAuthProvider.credentialWithLink(s.email, s.link);
    } catch (err) {
      console.warn("[account-linking] credentialWithLink rejected the URL:", err);
      return null;
    }
  }
  // Exhaustive — should never reach here.
  return null;
}

/**
 * Attempts to link a previously-stashed credential to the user who just
 * authenticated. Returns true if linking happened, false otherwise (no
 * stashed credential, email mismatch, or Firebase rejected the link).
 *
 * Call this right after every successful sign-in, regardless of method —
 * if there's nothing stashed it's a cheap no-op, and if there is, the
 * linking happens transparently.
 */
export async function tryLinkPendingCredential(user: User): Promise<boolean> {
  const stash = readStash();
  if (!stash) return false;

  // Safety: the email on the stashed credential MUST match the email of
  // the user who just signed in. Otherwise we'd be linking one human's
  // credential to another human's account — never. Different emails
  // means the user started a new flow and we should drop the stash.
  const userEmail = (user.email ?? "").toLowerCase();
  if (stash.email !== userEmail) {
    clearPendingCredential();
    return false;
  }

  const cred = buildCredential(stash);
  if (!cred) {
    clearPendingCredential();
    return false;
  }

  try {
    await linkWithCredential(user, cred);
    clearPendingCredential();
    return true;
  } catch (err: any) {
    // Common failure modes:
    //   • auth/credential-already-in-use — somebody already linked this
    //     credential to another account. Rare; means the pendingCred
    //     belongs to a different UID we don't control.
    //   • auth/provider-already-linked — the user already has this
    //     provider linked. No-op from the user's perspective.
    //   • auth/invalid-credential — token expired. User can re-do the
    //     cross-method flow.
    console.warn("[account-linking] linkWithCredential failed:", err?.code, err?.message);
    clearPendingCredential();
    return false;
  }
}

