// ─────────────────────────────────────────────────────────────────────────────
// waitlistEmail — Resend-powered welcome email for new waitlist signups.
//
// Triggered by `onWaitlistEntry` in index.ts (Firestore onDocumentCreated).
// Kept as a thin module so the Firestore trigger stays declarative and the
// HTML copy lives in one place we can iterate on without touching the trigger.
//
// Resend setup the user owns:
//   • Verify the collegeready.io domain in https://resend.com/domains
//   • Set the Firebase secret: `firebase functions:secrets:set RESEND_API_KEY`
//
// We send both HTML and plain-text so inboxes that strip HTML (and Gmail's
// preview) still render cleanly.
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";

const FROM_ADDRESS = "College Ready <noreply@collegeready.io>";
const SUBJECT = "You're on the College Ready waitlist 🎓";

const htmlBody = () => `
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
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;">You're on the list.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1e293b;">
                <p style="margin:0 0 14px 0;">Hey there 👋</p>
                <p style="margin:0 0 14px 0;">Thanks for joining the College Ready waitlist. You'll be among the first to know when we open access.</p>
                <p style="margin:0 0 14px 0;">Here's what's coming when you're in:</p>
                <ul style="margin:0 0 14px 0;padding-left:20px;">
                  <li style="margin-bottom:6px;">AI-matched U.S. schools tailored to your profile</li>
                  <li style="margin-bottom:6px;">Real-time F-1 visa interview practice with a live AI consular officer</li>
                  <li style="margin-bottom:6px;">Honest feedback on your application, not generic checklists</li>
                </ul>
                <p style="margin:0 0 14px 0;">Want to move up the list? Share College Ready with a friend who's applying to U.S. schools — every referral gets you closer to the front.</p>
                <p style="margin:0 0 6px 0;">Talk soon,<br/>The College Ready team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;line-height:1.6;">
                You're getting this because you signed up at collegeready.io. If that wasn't you, just ignore this email and we won't bother you again.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();

const textBody = () =>
  [
    "You're on the College Ready waitlist.",
    "",
    "Thanks for joining — you'll be among the first to know when we open access.",
    "",
    "Here's what's coming when you're in:",
    "  • AI-matched U.S. schools tailored to your profile",
    "  • Real-time F-1 visa interview practice with a live AI consular officer",
    "  • Honest feedback on your application, not generic checklists",
    "",
    "Want to move up the list? Share College Ready with a friend who's applying to U.S. schools.",
    "",
    "Talk soon,",
    "The College Ready team",
    "",
    "—",
    "You're getting this because you signed up at collegeready.io. If that wasn't you, just ignore this email.",
  ].join("\n");

/**
 * Sends the welcome email to a new waitlist signup. Caller passes the Resend
 * API key (loaded from Firebase Secret in the trigger). Returns the Resend
 * message id on success; throws on failure so the caller can record the error.
 */
export async function sendWaitlistWelcome(opts: {
  apiKey: string;
  to: string;
}): Promise<{ id: string }> {
  const resend = new Resend(opts.apiKey);
  const result = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [opts.to],
    subject: SUBJECT,
    html:    htmlBody(),
    text:    textBody(),
  });
  if (result.error) {
    // Resend returns { data, error } rather than throwing — surface the error
    // so the trigger function can record it on the waitlist doc.
    const msg = result.error.message ?? "Resend rejected the send.";
    throw new Error(msg);
  }
  if (!result.data?.id) {
    throw new Error("Resend returned no message id.");
  }
  return { id: result.data.id };
}
