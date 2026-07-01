// ─────────────────────────────────────────────────────────────────────────────
// feedbackRequestEmail — sent shortly after a user COMPLETES a feature that
// produces a report (a match report unlock, or a scored visa interview).
//
// The email doesn't collect the rating itself — it deep-links the user back
// into the app, where the existing FeedbackSurveyModal (star rating + optional
// comment, saved to /surveyResponses via submitFeedbackSurvey) opens for the
// matching trigger. That keeps ONE feedback pipeline instead of two.
//
// Lifecycle email → carries a one-click unsubscribe (category "feedback").
// Styling mirrors the other Resend templates.
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";

const FROM_ADDRESS = "College Ready <noreply@collegeready.io>";
const APP_ORIGIN   = "https://collegeready.io";

// Mirrors the SurveyTrigger union in the client (FeedbackSurveyModal.tsx) and
// FEEDBACK_SURVEY_TRIGGERS in functions/src/index.ts.
export type FeedbackFeature = "match_report" | "visa_interview";

interface FeatureCopy {
  subject:  string;
  heading:  string;
  body:     string[];
  ctaLabel: string;
}

const FEATURE_COPY: Record<FeedbackFeature, FeatureCopy> = {
  match_report: {
    subject:  "How was your match report? (30 seconds)",
    heading:  "How did we do?",
    body: [
      "You just unlocked a personalised school match report — nice work.",
      "We're a young product and your honest take shapes what we build next. A quick star rating (and one line on what to improve) would mean a lot.",
    ],
    ctaLabel: "Rate my match report →",
  },
  visa_interview: {
    subject:  "How was your visa interview practice? (30 seconds)",
    heading:  "How did your practice go?",
    body: [
      "You just finished a scored F-1 visa interview practice session.",
      "Was the officer realistic? Was the feedback useful? A quick star rating (and one line on what to improve) helps us tune it for the next student.",
    ],
    ctaLabel: "Rate my practice →",
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

// Deep-link that opens the in-app feedback survey for this feature. The
// DashboardPage reads `survey` + `ref` and force-opens FeedbackSurveyModal.
function surveyUrl(feature: FeedbackFeature, ref?: string | null): string {
  const params = new URLSearchParams({ survey: feature });
  if (ref) params.set("ref", ref);
  return `${APP_ORIGIN}/app?${params.toString()}`;
}

const htmlBody = (opts: {
  displayName?: string | null;
  copy: FeatureCopy;
  ctaUrl: string;
  unsubscribeUrl: string;
}) => `
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
                  <a href="${opts.ctaUrl}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;font-size:14px;">${opts.copy.ctaLabel}</a>
                </p>
                <p style="margin:18px 0 0 0;color:#64748b;font-size:13px;">Thanks for helping us improve,<br/>The College Ready team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;line-height:1.6;">
                Questions? Reply to this email or write to <a href="mailto:support@collegeready.io" style="color:#1e3a8a;">support@collegeready.io</a>.
                <br/><br/>
                Don't want feedback requests? <a href="${opts.unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">Unsubscribe with one click</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();

const textBody = (opts: {
  displayName?: string | null;
  copy: FeatureCopy;
  ctaUrl: string;
  unsubscribeUrl: string;
}) =>
  [
    opts.copy.heading,
    ``,
    greeting(opts.displayName) + ",",
    ``,
    ...opts.copy.body,
    ``,
    `${opts.copy.ctaLabel} ${opts.ctaUrl}`,
    ``,
    `Thanks for helping us improve,`,
    `The College Ready team`,
    ``,
    `—`,
    `Questions? Email support@collegeready.io.`,
    `Don't want feedback requests? Unsubscribe: ${opts.unsubscribeUrl}`,
  ].join("\n");

/**
 * Send a feedback-request email for a completed feature. Returns the Resend
 * message id on success; throws on failure so the caller can log it.
 */
export async function sendFeedbackRequest(opts: {
  apiKey:         string;
  to:             string;
  feature:        FeedbackFeature;
  displayName?:   string | null;
  ref?:           string | null;
  unsubscribeUrl: string;
}): Promise<{ id: string }> {
  const copy = FEATURE_COPY[opts.feature];
  const ctaUrl = surveyUrl(opts.feature, opts.ref);
  const resend = new Resend(opts.apiKey);
  const result = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [opts.to],
    subject: copy.subject,
    html:    htmlBody({ displayName: opts.displayName, copy, ctaUrl, unsubscribeUrl: opts.unsubscribeUrl }),
    text:    textBody({ displayName: opts.displayName, copy, ctaUrl, unsubscribeUrl: opts.unsubscribeUrl }),
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Resend rejected the feedback-request send.");
  }
  if (!result.data?.id) {
    throw new Error("Resend returned no message id for the feedback request.");
  }
  return { id: result.data.id };
}
