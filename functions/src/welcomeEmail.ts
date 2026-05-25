// ─────────────────────────────────────────────────────────────────────────────
// welcomeEmail — Resend-powered welcome that fires once when a new user
// record lands in Firestore (`users/{uid}`).
//
// Distinct from waitlistEmail.ts: the waitlist email is for the public
// landing-page form (no auth required); this email is for users who have
// completed signup and have a Firebase Auth account + a /users doc.
//
// A user who joined the waitlist first AND then signed up will receive
// both emails — by design. They're different stages of the funnel:
//   waitlist → "you're on the list"
//   signup   → "you're in — here's how to start"
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";

const FROM_ADDRESS = "College Ready <noreply@collegeready.io>";
const SUBJECT = "Welcome to College Ready 🎓";

function firstName(displayName?: string | null): string | null {
  if (!displayName) return null;
  const first = displayName.trim().split(/\s+/)[0];
  return first || null;
}

function greeting(displayName?: string | null): string {
  const name = firstName(displayName);
  return name ? `Hey ${name} 👋` : "Hey 👋";
}

const htmlBody = (opts: { displayName?: string | null }) => `
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
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;">You're in.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1e293b;">
                <p style="margin:0 0 14px 0;">${greeting(opts.displayName)}</p>
                <p style="margin:0 0 14px 0;">Thanks for signing up. We've dropped <strong>2 free credits</strong> into your wallet so you can try the app before paying for anything.</p>

                <p style="margin:0 0 8px 0;"><strong>What credits unlock:</strong></p>
                <ul style="margin:0 0 18px 0;padding-left:20px;font-size:14px;color:#475569;">
                  <li style="margin-bottom:6px;"><strong style="color:#0f172a;">1 credit</strong> — unlock an AI-matched school report tailored to your profile</li>
                  <li style="margin-bottom:6px;"><strong style="color:#0f172a;">15 credits</strong> — full F-1 visa interview practice with a live AI consular officer (with scored feedback)</li>
                </ul>

                <p style="margin:0 0 14px 0;">Your 2 free credits cover two match-report unlocks — enough to get a real feel for which U.S. schools are realistic for you before you spend anything.</p>

                <p style="margin:0 0 18px 0;">
                  <a href="https://collegeready.io/app" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;font-size:14px;">Open the dashboard →</a>
                </p>

                <p style="margin:0 0 6px 0;color:#475569;font-size:14px;"><strong style="color:#0f172a;">Want more credits without paying?</strong> Share your referral link from the dashboard — you earn 5 free credits for every friend who signs up.</p>

                <p style="margin:18px 0 0 0;color:#64748b;font-size:13px;">Welcome aboard,<br/>The College Ready team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;line-height:1.6;">
                Questions or issues? Reply to this email or write to <a href="mailto:support@collegeready.io" style="color:#1e3a8a;">support@collegeready.io</a>.
                <br/><br/>
                If you didn't sign up for College Ready, just ignore this email — no further messages will come.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();

const textBody = (opts: { displayName?: string | null }) =>
  [
    `You're in — welcome to College Ready.`,
    ``,
    greeting(opts.displayName) + ",",
    ``,
    `Thanks for signing up. We've dropped 2 free credits into your wallet so you can try the app before paying for anything.`,
    ``,
    `What credits unlock:`,
    `  • 1 credit  — unlock an AI-matched school report tailored to your profile`,
    `  • 15 credits — full F-1 visa interview practice with a live AI consular officer`,
    ``,
    `Your 2 free credits cover two match-report unlocks — enough to get a real feel for which U.S. schools are realistic for you before you spend anything.`,
    ``,
    `Dashboard: https://collegeready.io/app`,
    ``,
    `Want more credits without paying? Share your referral link from the dashboard — you earn 5 free credits for every friend who signs up.`,
    ``,
    `Welcome aboard,`,
    `The College Ready team`,
    ``,
    `—`,
    `Questions? Email support@collegeready.io.`,
    `If you didn't sign up for College Ready, just ignore this email.`,
  ].join("\n");

/**
 * Send the welcome email to a newly-signed-up user. Returns the Resend
 * message id on success; throws on failure so the caller can record the
 * error on the user doc.
 */
export async function sendWelcomeEmail(opts: {
  apiKey:        string;
  to:            string;
  displayName?:  string | null;
}): Promise<{ id: string }> {
  const resend = new Resend(opts.apiKey);
  const result = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [opts.to],
    subject: SUBJECT,
    html:    htmlBody({ displayName: opts.displayName }),
    text:    textBody({ displayName: opts.displayName }),
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Resend rejected the welcome send.");
  }
  if (!result.data?.id) {
    throw new Error("Resend returned no message id for the welcome send.");
  }
  return { id: result.data.id };
}
