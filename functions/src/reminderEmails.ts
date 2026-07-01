// ─────────────────────────────────────────────────────────────────────────────
// reminderEmails — "pick up where you left off" nudges sent by the daily
// sendEngagementReminders scheduled function.
//
// Four variants, one per abandonment shape the scheduler detects:
//   roadmap    — started the study-abroad roadmap, went quiet mid-checklist
//   matching   — filled the intake profile but never unlocked a match report
//   visa       — left a visa practice interview session unfinished
//   onboarding — signed up, logged in, but never touched any feature
//
// These are LIFECYCLE emails, not transactional — every send carries a working
// one-click unsubscribe (category "reminders"). Styling mirrors welcomeEmail.ts
// / paymentReceiptEmail.ts so the whole lifecycle looks like one product.
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";

const FROM_ADDRESS = "College Ready <noreply@collegeready.io>";

export type ReminderKind = "roadmap" | "matching" | "visa" | "onboarding";

interface KindCopy {
  subject:  string;
  heading:  string;
  /** Body paragraphs (HTML-safe plain strings; no user input is interpolated). */
  body:     string[];
  ctaLabel: string;
  ctaUrl:   string;
}

const KIND_COPY: Record<ReminderKind, KindCopy> = {
  roadmap: {
    subject:  "Your study-abroad roadmap is waiting 🗺️",
    heading:  "Pick up where you left off",
    body: [
      "You started mapping out your journey to studying abroad — but it's been a few days since your last step.",
      "Your roadmap remembers exactly where you stopped. A few minutes now keeps your applications on track.",
    ],
    ctaLabel: "Continue my roadmap →",
    ctaUrl:   "https://collegeready.io/app/roadmap",
  },
  matching: {
    subject:  "You're one step from your school matches 🎓",
    heading:  "Your matches are ready to unlock",
    body: [
      "You told us about your grades, budget and goals — but you haven't unlocked your personalised school matches yet.",
      "Your profile is saved. Unlock your report to see which U.S. schools are realistic reaches, targets and safeties for you.",
    ],
    ctaLabel: "See my matches →",
    ctaUrl:   "https://collegeready.io/app?tab=matches",
  },
  visa: {
    subject:  "Finish your visa interview practice 🇺🇸",
    heading:  "Your practice interview is still open",
    body: [
      "You started a practice F-1 visa interview but didn't finish it.",
      "Getting through a full session is where the real confidence comes from — and you'll get scored feedback at the end. It only takes a few more minutes.",
    ],
    ctaLabel: "Resume my interview →",
    ctaUrl:   "https://collegeready.io/app/visa-interview",
  },
  onboarding: {
    subject:  "Ready to find your perfect U.S. school? 🎓",
    heading:  "Let's get you started",
    body: [
      "Welcome again to College Ready! You've got free credits in your wallet, but you haven't tried anything yet.",
      "The fastest win: run your school match. Tell us your profile and we'll show you which U.S. schools fit — reaches, targets and safeties, tailored to you.",
    ],
    ctaLabel: "Find my matches →",
    ctaUrl:   "https://collegeready.io/app",
  },
};

function firstName(displayName?: string | null): string | null {
  if (!displayName) return null;
  const first = displayName.trim().split(/\s+/)[0];
  return first || null;
}

function greeting(displayName?: string | null): string {
  const name = firstName(displayName);
  return name ? `Hey ${name} 👋` : "Hey 👋";
}

const htmlBody = (opts: { displayName?: string | null; copy: KindCopy; unsubscribeUrl: string }) => `
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
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;">${opts.copy.heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1e293b;">
                <p style="margin:0 0 14px 0;">${greeting(opts.displayName)}</p>
                ${opts.copy.body.map((p) => `<p style="margin:0 0 14px 0;">${p}</p>`).join("\n                ")}
                <p style="margin:18px 0 6px 0;">
                  <a href="${opts.copy.ctaUrl}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;font-size:14px;">${opts.copy.ctaLabel}</a>
                </p>
                <p style="margin:18px 0 0 0;color:#64748b;font-size:13px;">See you there,<br/>The College Ready team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;line-height:1.6;">
                Questions? Reply to this email or write to <a href="mailto:support@collegeready.io" style="color:#1e3a8a;">support@collegeready.io</a>.
                <br/><br/>
                Don't want these reminders? <a href="${opts.unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">Unsubscribe with one click</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();

const textBody = (opts: { displayName?: string | null; copy: KindCopy; unsubscribeUrl: string }) =>
  [
    opts.copy.heading,
    ``,
    greeting(opts.displayName) + ",",
    ``,
    ...opts.copy.body,
    ``,
    `${opts.copy.ctaLabel} ${opts.copy.ctaUrl}`,
    ``,
    `See you there,`,
    `The College Ready team`,
    ``,
    `—`,
    `Questions? Email support@collegeready.io.`,
    `Don't want these reminders? Unsubscribe: ${opts.unsubscribeUrl}`,
  ].join("\n");

/**
 * Send an engagement reminder. Returns the Resend message id on success;
 * throws on failure so the scheduler can log it (best-effort — a failed
 * reminder is never retried in a way that could spam the user).
 */
export async function sendEngagementReminder(opts: {
  apiKey:          string;
  to:              string;
  kind:            ReminderKind;
  displayName?:    string | null;
  unsubscribeUrl:  string;
}): Promise<{ id: string }> {
  const copy = KIND_COPY[opts.kind];
  const resend = new Resend(opts.apiKey);
  const result = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [opts.to],
    subject: copy.subject,
    html:    htmlBody({ displayName: opts.displayName, copy, unsubscribeUrl: opts.unsubscribeUrl }),
    text:    textBody({ displayName: opts.displayName, copy, unsubscribeUrl: opts.unsubscribeUrl }),
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Resend rejected the reminder send.");
  }
  if (!result.data?.id) {
    throw new Error("Resend returned no message id for the reminder.");
  }
  return { id: result.data.id };
}
