import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const REFERRAL_CODE_LS_KEY = "unifinder_referral_code";

// FNV-1a → 6-char alphanumeric. Deterministic for the same input.
function hashToCode(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(6, "0").slice(0, 6).toUpperCase();
}

/**
 * Returns the user's referral code, creating it on the fly if missing.
 * Stored on `users/{uid}.referralCode` and reverse-indexed at
 * `referralCodes/{code} = { userId }`.
 *
 * Collisions are extremely unlikely (36^6 ≈ 2.1B combinations) but the loop
 * tries successive salted hashes to ensure uniqueness.
 */
export async function getOrCreateReferralCode(uid: string): Promise<string> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? (userSnap.data() as any).referralCode : undefined;
  if (existing) return existing;

  for (let attempt = 0; attempt < 8; attempt++) {
    const seed = attempt === 0 ? uid : `${uid}:${attempt}`;
    const code = hashToCode(seed);
    const codeRef = doc(db, "referralCodes", code);
    const codeSnap = await getDoc(codeRef);

    if (!codeSnap.exists()) {
      // Claim the code (rules block overwrites of existing codes)
      await setDoc(codeRef, { userId: uid, createdAt: serverTimestamp() });
      await setDoc(userRef, { referralCode: code }, { merge: true });
      return code;
    }
    if ((codeSnap.data() as any).userId === uid) {
      // Already ours — sync the user doc and return
      await setDoc(userRef, { referralCode: code }, { merge: true });
      return code;
    }
  }
  // Fallback: prefix of UID (very unlikely path)
  const fallback = uid.slice(0, 6).toUpperCase();
  await setDoc(userRef, { referralCode: fallback }, { merge: true });
  return fallback;
}

export function buildReferralUrl(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://unifinder.app";
  return `${origin}/signup?ref=${code}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-signup capture: store the code in localStorage so it survives oauth round trips
// ─────────────────────────────────────────────────────────────────────────────
export function captureReferralCodeFromUrl(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("ref");
  if (code) {
    try { localStorage.setItem(REFERRAL_CODE_LS_KEY, code.trim().toUpperCase()); } catch { /* ignore */ }
  }
}

export function readPendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(REFERRAL_CODE_LS_KEY); } catch { return null; }
}

export function clearPendingReferralCode(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(REFERRAL_CODE_LS_KEY); } catch { /* ignore */ }
}
