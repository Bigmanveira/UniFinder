// Client-side mirror of the FOUNDER_EMAILS allowlist defined in
// functions/src/index.ts. The backend is the source of truth — these
// accounts skip credit deduction in the spending callables — but the
// client needs the same list to show "∞" in the wallet UI instead
// of the literal balance (which would stay at whatever it was before
// they did any unlocks).
//
// Keep the two lists in sync. If a founder is added / removed, update:
//   1. FOUNDER_EMAILS in functions/src/index.ts
//   2. FOUNDER_EMAILS in this file

const FOUNDER_EMAILS = new Set<string>([
  "frederick.da-silveira@233labs.com",
  "franklyn.oppong@233labs.com",
]);

export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return FOUNDER_EMAILS.has(email.trim().toLowerCase());
}
