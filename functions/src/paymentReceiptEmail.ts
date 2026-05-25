// ─────────────────────────────────────────────────────────────────────────────
// paymentReceiptEmail — Resend-powered receipt sent after a successful
// payment lands credits in the user's wallet.
//
// Fired by the paystackWebhook handler AFTER `applyPaystackChargeSuccess` resolves —
// outside the Firestore transaction (transactions can retry, and we don't
// want to send the same email N times). Best-effort: if Resend errors, the
// credit grant still stands; the customer can always see their balance in
// the app even without the email.
//
// This is a brand confirmation, NOT a tax/compliance receipt — Paystack's own
// auto-receipt covers that side. Tone is warm and product-focused.
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";

const FROM_ADDRESS = "College Ready <noreply@collegeready.io>";

function subjectFor(credits: number): string {
  return `🎓 ${credits} credit${credits === 1 ? "" : "s"} added to your College Ready account`;
}

// Pick a currency glyph for the receipt copy. We only charge GHS today, but
// the email template should stay correct if we ever flip currencies.
function currencyGlyph(code: string): string {
  switch (code.toUpperCase()) {
    case "GHS": return "₵";
    case "NGN": return "₦";
    case "ZAR": return "R";
    case "KES": return "KSh ";
    case "USD": return "$";
    default:    return "";
  }
}

const htmlBody = (opts: {
  packLabel:  string;
  credits:    number;
  priceLocal: number;
  currency:   string;
  newBalance: number;
  paymentId:  string;
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
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;">Credits added to your wallet 🎉</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1e293b;">
                <p style="margin:0 0 18px 0;">Hey 👋 — your payment came through. Here's a quick summary:</p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;margin:0 0 18px 0;">
                  <tr>
                    <td style="padding:18px 22px;font-size:14px;color:#475569;">
                      <p style="margin:0 0 6px 0;"><strong style="color:#0f172a;">${opts.packLabel} pack</strong> &nbsp;·&nbsp; ${currencyGlyph(opts.currency)}${opts.priceLocal.toFixed(2)} ${opts.currency}</p>
                      <p style="margin:0 0 6px 0;">${opts.credits} credit${opts.credits === 1 ? "" : "s"} added</p>
                      <p style="margin:14px 0 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:13px;">
                        New balance: <strong style="font-size:18px;">${opts.newBalance}</strong> credit${opts.newBalance === 1 ? "" : "s"}
                      </p>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 10px 0;font-size:14px;color:#475569;"><strong style="color:#0f172a;">What credits unlock:</strong></p>
                <ul style="margin:0 0 18px 0;padding-left:20px;font-size:14px;color:#475569;">
                  <li style="margin-bottom:6px;"><strong style="color:#0f172a;">1 credit</strong> — unlock an AI-matched school report</li>
                  <li style="margin-bottom:6px;"><strong style="color:#0f172a;">15 credits</strong> — full F-1 visa interview practice with a live AI consular officer</li>
                </ul>

                <p style="margin:0 0 14px 0;">
                  <a href="https://collegeready.io/app" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;font-size:14px;">Open the dashboard →</a>
                </p>

                <p style="margin:0 0 6px 0;color:#64748b;font-size:13px;">Thanks for backing what we're building.<br/>The College Ready team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;line-height:1.6;">
                Reference: ${opts.paymentId}<br/>
                Questions or issues? Reply to this email or write to <a href="mailto:support@collegeready.io" style="color:#1e3a8a;">support@collegeready.io</a> with the reference above.
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
  packLabel:  string;
  credits:    number;
  priceLocal: number;
  currency:   string;
  newBalance: number;
  paymentId:  string;
}) =>
  [
    `Credits added to your College Ready wallet`,
    ``,
    `Hey — your payment came through. Quick summary:`,
    ``,
    `  ${opts.packLabel} pack · ${currencyGlyph(opts.currency)}${opts.priceLocal.toFixed(2)} ${opts.currency}`,
    `  ${opts.credits} credit${opts.credits === 1 ? "" : "s"} added`,
    `  New balance: ${opts.newBalance} credit${opts.newBalance === 1 ? "" : "s"}`,
    ``,
    `What credits unlock:`,
    `  • 1 credit  — unlock an AI-matched school report`,
    `  • 15 credits — full F-1 visa interview practice with a live AI consular officer`,
    ``,
    `Dashboard: https://collegeready.io/app`,
    ``,
    `Thanks for backing what we're building.`,
    `The College Ready team`,
    ``,
    `—`,
    `Reference: ${opts.paymentId}`,
    `Questions? Email support@collegeready.io with the reference above.`,
  ].join("\n");

/**
 * Fire off the receipt. Returns the Resend message id on success; throws on
 * failure so the caller (the webhook handler) can log it without crashing
 * the wallet credit. Fire-and-forget from the caller's perspective.
 */
export async function sendPurchaseReceipt(opts: {
  apiKey:     string;
  to:         string;
  packLabel:  string;
  credits:    number;
  priceLocal: number;
  currency:   string;
  newBalance: number;
  paymentId:  string;
}): Promise<{ id: string }> {
  const resend = new Resend(opts.apiKey);
  const result = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [opts.to],
    subject: subjectFor(opts.credits),
    html:    htmlBody(opts),
    text:    textBody(opts),
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Resend rejected the receipt send.");
  }
  if (!result.data?.id) {
    throw new Error("Resend returned no message id for the receipt.");
  }
  return { id: result.data.id };
}
