// ─────────────────────────────────────────────────────────────────────────────
// tokens — display-only credit→token presentation.
//
// The wallet, pricing packs, and everything in Firestore remain denominated in
// CREDITS. Users, however, see "tokens": we MULTIPLY credits by a fixed factor
// at the point of display only. Nothing here ever feeds wallet math, cost
// deduction, or a Firestore write — it's purely how numbers/words are rendered.
//
// So: 1 internal credit == 100 displayed tokens. A 15-credit visa interview
// shows as "1,500 tokens"; a 2-credit signup grant shows as "200 tokens".
//
// If this factor changes again, the hardcoded token figures in marketing and
// support copy have to move with it — grep for "tokens" across src/ and
// functions/src/. They are not derived from this constant.
// ─────────────────────────────────────────────────────────────────────────────

export const TOKENS_PER_CREDIT = 100;

/** Credits → raw token count (display only). Null/undefined → 0. */
export function toTokens(credits: number | null | undefined): number {
  return Math.round((credits ?? 0) * TOKENS_PER_CREDIT);
}

/** Credits → localized token string, e.g. 15 → "1,500". */
export function formatTokens(credits: number | null | undefined): string {
  return toTokens(credits).toLocaleString("en-US");
}
