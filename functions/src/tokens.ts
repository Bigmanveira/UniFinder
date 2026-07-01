// ─────────────────────────────────────────────────────────────────────────────
// tokens — display-only credit→token presentation for user-facing emails.
//
// Mirrors src/lib/tokens.ts in the main app. Wallet balances, pack sizes, and
// everything in Firestore stay in CREDITS; we only multiply by the fixed factor
// when rendering a number a USER will read (e.g. receipt / announcement email).
// Never use these values for wallet math or Firestore writes.
// ─────────────────────────────────────────────────────────────────────────────

export const TOKENS_PER_CREDIT = 1000;

/** Credits → raw token count (display only). Null/undefined → 0. */
export function toTokens(credits: number | null | undefined): number {
  return Math.round((credits ?? 0) * TOKENS_PER_CREDIT);
}

/** Credits → localized token string, e.g. 15 → "15,000". */
export function formatTokens(credits: number | null | undefined): string {
  return toTokens(credits).toLocaleString("en-US");
}
