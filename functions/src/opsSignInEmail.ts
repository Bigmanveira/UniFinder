// ─────────────────────────────────────────────────────────────────────────────
// opsSignInEmail — branded magic-link email for the College Ready Ops portal.
//
// Why this exists:
//   Firebase's built-in sendSignInLinkToEmail() sends from
//   noreply@<project>.firebaseapp.com — an unfamiliar sender domain that
//   Gmail/Outlook routinely dump straight into spam. The user app already
//   sends every other transactional email (welcome, receipt, waitlist)
//   from `College Ready <noreply@collegeready.io>` via Resend with the
//   domain properly SPF/DKIM-aligned, so deliverability is solid. This
//   module reuses that same Resend channel for the ops sign-in link.
//
// Flow:
//   1. Ops portal calls `sendOpsSignInLink({ email })`.
//   2. Cloud Function generates the actual sign-in URL via the Firebase
//      Admin SDK (`auth.generateSignInWithEmailLink`) — NOT via the client.
//   3. Cloud Function passes that URL into the template here and sends
//      via Resend with the College Ready brand.
//   4. User clicks the link → returns to the ops portal → ops portal
//      calls `signInWithEmailLink` to complete sign-in (same as before).
//
// Branding deliberately mirrors the dark-navy hero in waitlist/welcome/
// receipt emails so the ops sign-in looks like a peer of every other
// transactional email the user has seen.
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";

const FROM_ADDRESS = "College Ready <noreply@collegeready.io>";
const SUBJECT = "Sign in to College Ready Ops 🔐";

const htmlBody = (opts: { link: string }) => `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,#1e3a8a,#0f172a);padding:32px 32px 28px 32px;color:#fff;">
                <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#bfdbfe;font-weight:700;">College Ready · Ops</p>
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;">Your sign-in link</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1e293b;">
                <p style="margin:0 0 14px 0;">Hi 👋</p>
                <p style="margin:0 0 18px 0;">Tap the button below to sign in to the <strong>College Ready Ops Portal</strong>. The link is single-use and expires in about an hour.</p>

                <p style="margin:0 0 18px 0;">
                  <a href="${opts.link}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;font-size:14px;">Sign in to Ops →</a>
                </p>

                <p style="margin:0 0 18px 0;color:#475569;font-size:13px;">Open this email in the same browser where you requested the link.</p>

                <p style="margin:18px 0 0 0;color:#64748b;font-size:13px;">Thanks,<br/>The College Ready team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;line-height:1.6;">
                <strong style="color:#0f172a;">Didn't request this?</strong> You can ignore this email — the link won't do anything without being opened. If you keep getting requests you didn't make, reply to this email or write to <a href="mailto:support@collegeready.io" style="color:#1e3a8a;">support@collegeready.io</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();

const textBody = (opts: { link: string }) =>
  [
    `College Ready Ops — your sign-in link`,
    ``,
    `Hi,`,
    ``,
    `Tap the link below to sign in to the College Ready Ops Portal.`,
    `The link is single-use and expires in about an hour.`,
    ``,
    opts.link,
    ``,
    `Open the link in the same browser you requested it from.`,
    ``,
    `Thanks,`,
    `The College Ready team`,
    ``,
    `—`,
    `Didn't request this? Ignore the email — the link is harmless until clicked. Concerned? Write to support@collegeready.io.`,
  ].join("\n");

/**
 * Send the branded ops sign-in link via Resend. The `link` should be the
 * URL returned by `admin.auth().generateSignInWithEmailLink(email, ...)`.
 * Throws on Resend failure so the caller can log & report.
 */
export async function sendOpsSignInLinkEmail(opts: {
  apiKey: string;
  to:     string;
  link:   string;
}): Promise<{ id: string }> {
  const resend = new Resend(opts.apiKey);
  const result = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [opts.to],
    subject: SUBJECT,
    html:    htmlBody({ link: opts.link }),
    text:    textBody({ link: opts.link }),
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Resend rejected the ops sign-in send.");
  }
  if (!result.data?.id) {
    throw new Error("Resend returned no message id for the ops sign-in send.");
  }
  return { id: result.data.id };
}
