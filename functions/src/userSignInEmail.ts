// ─────────────────────────────────────────────────────────────────────────────
// userSignInEmail — Resend-powered magic-link email for the public
// user-facing app (NOT the ops portal — that template lives in
// opsSignInEmail.ts and has a different tone + audience).
//
// Used by the sendUserSignInLink callable, which fires when a visitor
// signs up or signs back in using email (instead of Google). The link
// inside the email completes Firebase email-link authentication when
// clicked — creating the Auth user on first click, or signing them
// in if they already exist. One template handles both first-time
// signup and returning sign-in because the link semantics are the
// same and the welcome copy reads naturally for both paths.
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";

const FROM_ADDRESS = "College Ready <noreply@collegeready.io>";
const SUBJECT = "Your College Ready sign-in link 🎓";

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
                <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#bfdbfe;font-weight:700;">College Ready</p>
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;">Tap to sign in</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1e293b;">
                <p style="margin:0 0 14px 0;">Hey 👋</p>
                <p style="margin:0 0 18px 0;">You're one tap away. The button below will sign you straight into <strong>College Ready</strong> — no password to remember. The link is single-use and expires in about an hour.</p>

                <p style="margin:0 0 18px 0;">
                  <a href="${opts.link}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;font-size:14px;">Sign me in →</a>
                </p>

                <p style="margin:0 0 8px 0;color:#475569;font-size:13px;">If the button doesn't work, copy and paste this URL into the same browser you requested the link from:</p>
                <p style="margin:0 0 18px 0;font-size:12px;color:#475569;word-break:break-all;background:#f1f5f9;border-radius:8px;padding:10px 12px;border:1px solid #e2e8f0;">
                  ${opts.link}
                </p>

                <p style="margin:18px 0 0 0;color:#64748b;font-size:13px;">See you inside,<br/>The College Ready team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;line-height:1.6;">
                <strong style="color:#0f172a;">Didn't ask to sign in?</strong> You can safely ignore this email — the link does nothing until clicked. If you keep getting links you didn't request, write to <a href="mailto:support@collegeready.io" style="color:#1e3a8a;">support@collegeready.io</a>.
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
    `Your College Ready sign-in link`,
    ``,
    `Hey,`,
    ``,
    `You're one tap away. The link below will sign you straight into College Ready — no password to remember.`,
    `The link is single-use and expires in about an hour.`,
    ``,
    opts.link,
    ``,
    `Open the link in the same browser you requested it from.`,
    ``,
    `See you inside,`,
    `The College Ready team`,
    ``,
    `—`,
    `Didn't ask to sign in? Ignore the email — the link is harmless until clicked. Concerned? Write to support@collegeready.io.`,
  ].join("\n");

export async function sendUserSignInLinkEmail(opts: {
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
    throw new Error(result.error.message ?? "Resend rejected the user sign-in send.");
  }
  if (!result.data?.id) {
    throw new Error("Resend returned no message id for the user sign-in send.");
  }
  return { id: result.data.id };
}
