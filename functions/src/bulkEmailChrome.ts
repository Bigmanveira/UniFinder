// ─────────────────────────────────────────────────────────────────────────────
// Bulk email HTML/text builder — wraps operator-authored body content in
// the standard College Ready chrome (dark-navy header, white card, footer
// disclaimer). Keeps every operator-sent email visually consistent with
// the transactional surface (welcome, receipt, launch announcement) so
// recipients never see a stylistic mismatch that screams "different
// sender."
//
// Operators provide:
//   • subject   — used as the email subject line
//   • headline  — short H1 inside the dark hero strip
//   • body      — multi-paragraph text. Single blank line separates
//                 paragraphs. No markdown, no HTML — operators write
//                 plain text and we render it. Keeps inputs safe from
//                 accidental HTML injection (we escape everything).
//   • ctaText / ctaUrl — optional rendered button under the body
//
// We always produce BOTH html and text so inboxes that strip HTML
// (Gmail preview, some accessibility tools) still render cleanly.
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkEmailContent {
  /** Email subject line. Required. */
  subject:  string;
  /** Headline shown inside the dark hero strip at the top. Required. */
  headline: string;
  /** Plain-text body. Single blank line = paragraph break. Required. */
  body:     string;
  /** Optional button text. Omit (both fields) to hide the CTA button. */
  ctaText?: string | null;
  /** Optional button URL. Must be present whenever ctaText is. */
  ctaUrl?:  string | null;
}

/** Escape user-authored text before dropping it into HTML. Operators write
 *  plain text into the body field; we never want a stray `<script>` (or
 *  even a broken `<` that closes mid-paragraph) to escape into the
 *  rendered email. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

/** Convert plain-text body (single-newline-separated lines, blank-line
 *  paragraph breaks) into a sequence of `<p>` blocks. */
function bodyToParagraphs(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter((para) => para.length > 0)
    .map((para) => {
      // Within a paragraph, single newlines become <br> so the operator
      // can soft-break a line without forcing a full paragraph gap.
      const inner = escapeHtml(para).replace(/\n/g, "<br/>");
      return `<p style="margin:0 0 14px 0;">${inner}</p>`;
    })
    .join("\n");
}

export function buildBulkEmailHtml(content: BulkEmailContent): string {
  const headlineHtml = escapeHtml(content.headline);
  const paragraphsHtml = bodyToParagraphs(content.body);
  const ctaHtml = content.ctaText && content.ctaUrl
    ? `
      <p style="margin:18px 0;">
        <a href="${escapeHtml(content.ctaUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:9999px;font-size:14px;">${escapeHtml(content.ctaText)}</a>
      </p>`
    : "";

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,#1e3a8a,#0f172a);padding:32px 32px 28px 32px;color:#fff;">
                <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#bfdbfe;font-weight:700;">College Ready</p>
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;">${headlineHtml}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1e293b;">
                ${paragraphsHtml}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;line-height:1.6;">
                You're getting this because you have a College Ready account or joined our waitlist at collegeready.io. Reply with "unsubscribe" to be removed.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
}

export function buildBulkEmailText(content: BulkEmailContent): string {
  const ctaLine = content.ctaText && content.ctaUrl
    ? `\n\n${content.ctaText}: ${content.ctaUrl}`
    : "";
  return [
    content.headline,
    "",
    content.body.trim(),
    ctaLine,
    "",
    "—",
    "You're getting this because you have a College Ready account or joined our waitlist at collegeready.io. Reply with 'unsubscribe' to be removed.",
  ].join("\n");
}
