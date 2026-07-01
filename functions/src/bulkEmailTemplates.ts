// ─────────────────────────────────────────────────────────────────────────────
// Bulk email templates — pre-filled subject / headline / body / CTA the
// operator picks from a dropdown on the Bulk Email page. Each template
// is a starting point: the UI lets the operator edit any field before
// hitting Send.
//
// Templates live in code (not Firestore) for two reasons:
//   • Versioned with the codebase — a copy change goes through review.
//   • No client-write surface — operators can't accidentally save a
//     malformed template that breaks future sends.
//
// Add new templates by extending the BULK_EMAIL_TEMPLATES array. The
// `id` is the stable key the UI uses to retrieve the template; don't
// rename existing ids without coordinating the UI change.
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkEmailTemplate {
  /** Stable key used by the UI dropdown. */
  id:          string;
  /** Display name in the template picker. */
  label:       string;
  /** One-line description for the picker. */
  description: string;
  /** Default subject line — operator can edit. */
  subject:     string;
  /** Default H1 in the dark hero strip — operator can edit. */
  headline:    string;
  /** Default body (plain text, paragraph-separated). Operator can edit. */
  body:        string;
  /** Default CTA button text. Empty = no button by default. */
  ctaText:     string;
  /** Default CTA button URL. */
  ctaUrl:      string;
}

export const BULK_EMAIL_TEMPLATES: BulkEmailTemplate[] = [
  {
    id:          "announcement",
    label:       "Announcement",
    description: "Generic product update or feature launch.",
    subject:     "An update from College Ready",
    headline:    "Something new.",
    body: [
      "Hey there,",
      "",
      "We wanted to share a quick update with you.",
      "",
      "[Replace this with what's new — a new feature, a milestone, a product change. Keep it short; one or two paragraphs is plenty.]",
      "",
      "Thanks for being part of the journey.",
      "",
      "— The College Ready team",
    ].join("\n"),
    ctaText:     "Open College Ready",
    ctaUrl:      "https://collegeready.io/app",
  },
  {
    id:          "re_engagement",
    label:       "Re-engagement",
    description: "For inactive users who haven't returned recently.",
    subject:     "Still applying to U.S. universities?",
    headline:    "Your matches are waiting.",
    body: [
      "Hey,",
      "",
      "We noticed it's been a while since you stopped by. The application season moves fast, and we know it's a lot.",
      "",
      "Your matches are still here, your tokens are still on your account, and we've shipped a few improvements since you last logged in.",
      "",
      "Whenever you're ready, we'll pick up exactly where you left off.",
      "",
      "— The College Ready team",
    ].join("\n"),
    ctaText:     "Pick up where I left off",
    ctaUrl:      "https://collegeready.io/app",
  },
  {
    id:          "promo",
    label:       "Promo / Offer",
    description: "Time-limited discount or token-pack promotion.",
    subject:     "A little something to help you finish strong",
    headline:    "Limited-time offer inside.",
    body: [
      "Hey,",
      "",
      "[Describe the offer — e.g., 20% off any token pack through Sunday, or a bonus 5,000 tokens on the Plus pack.]",
      "",
      "Use code [CODE] at checkout. Offer ends [date].",
      "",
      "If you've been on the fence about unlocking a few more matches or running another visa interview practice, this is a good moment.",
      "",
      "— The College Ready team",
    ].join("\n"),
    ctaText:     "Browse token packs",
    ctaUrl:      "https://collegeready.io/pricing",
  },
  {
    id:          "custom",
    label:       "Custom",
    description: "Start from scratch — write your own subject, headline, and body.",
    subject:     "",
    headline:    "",
    body:        "",
    ctaText:     "",
    ctaUrl:      "",
  },
];
