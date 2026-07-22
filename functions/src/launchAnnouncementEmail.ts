// launchAnnouncementEmail — one-off Resend email blast announcing that
// College Ready is now live, sent to every address collected during the
// waitlist phase.
//
// Distinct from waitlistEmail.ts: that one fires on Firestore doc-create
// for each new signup ("you're on the list"); this one is a bulk send
// triggered by the `announceLaunch` callable when we flip from waitlist
// to live mode. Each waitlist doc carries a `launchEmailSentAt` field
// after a successful send so a retry of the bulk job is idempotent and
// won't double-mail anyone.
//
// Branding mirrors the rest of the transactional surface: dark navy
// hero with the brand wordmark, slate-50 page background, brand-blue
// CTA. Same Resend setup as waitlistEmail.ts.

import { Resend } from "resend";

const FROM_ADDRESS = "College Ready <noreply@collegeready.io>";
const SUBJECT      = "We're live — your College Ready account is ready 🎓";

// The signup URL we send users to. ?ref=waitlist tags the cohort so we
// can attribute conversions back to the waitlist audience in analytics.
const SIGNUP_URL = "https://collegeready.io/signup?ref=waitlist";

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
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;">We're live.</h1>
                <p style="margin:8px 0 0 0;font-size:14px;color:#cbd5e1;">Your spot's been waiting.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1e293b;">
                <p style="margin:0 0 14px 0;">Hey 👋</p>
                <p style="margin:0 0 14px 0;">Thanks for joining the College Ready waitlist. Today's the day — the platform is now open to you.</p>
                <p style="margin:0 0 14px 0;">Create your account and you'll get <strong>200 free tokens</strong> right away, enough to unlock two full AI-matched school reports before you ever pay a cent.</p>
                <p style="margin:18px 0;">
                  <a href="${SIGNUP_URL}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:9999px;font-size:14px;">Claim my free tokens →</a>
                </p>
                <p style="margin:0 0 8px 0;">Here's what's waiting:</p>
                <ul style="margin:0 0 14px 0;padding-left:20px;">
                  <li style="margin-bottom:6px;">AI-matched U.S. schools tailored to your profile</li>
                  <li style="margin-bottom:6px;">F-1 visa interview practice with a live AI consular officer</li>
                  <li style="margin-bottom:6px;">A personalised application roadmap, not a generic checklist</li>
                </ul>
                <p style="margin:0 0 14px 0;">We priced it deliberately for students — packs start at $2 USD and your tokens never expire.</p>
                <p style="margin:0 0 6px 0;">Talk soon,<br/>The College Ready team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;line-height:1.6;">
                You're getting this because you joined the College Ready waitlist at collegeready.io. If you'd rather not hear from us again, just reply with "unsubscribe" and we'll remove you.
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
    "College Ready is live — your account is ready.",
    "",
    "Thanks for joining the waitlist. The platform is now open to you.",
    "",
    "Sign up and get 200 free tokens right away (enough to unlock two AI-matched",
    "school reports before you pay):",
    "",
    `   ${SIGNUP_URL}`,
    "",
    "Here's what's waiting:",
    "  • AI-matched U.S. schools tailored to your profile",
    "  • F-1 visa interview practice with a live AI consular officer",
    "  • A personalised application roadmap, not a generic checklist",
    "",
    "Packs start at $2 USD and your tokens never expire.",
    "",
    "Talk soon,",
    "The College Ready team",
    "",
    "—",
    "You're getting this because you joined the College Ready waitlist at",
    "collegeready.io. Reply with 'unsubscribe' to be removed.",
  ].join("\n");

/**
 * Sends the launch announcement to a single waitlist email. Caller passes
 * the Resend API key (loaded from Firebase Secret in the callable).
 * Returns the Resend message id on success; throws on failure.
 */
export async function sendLaunchAnnouncement(opts: {
  apiKey: string;
  to:     string;
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
    const msg = result.error.message ?? "Resend rejected the send.";
    throw new Error(msg);
  }
  if (!result.data?.id) {
    throw new Error("Resend returned no message id.");
  }
  return { id: result.data.id };
}
