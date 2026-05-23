// RecaptchaAttribution — small line of attribution text required by
// Google's reCAPTCHA Terms of Service when the floating badge is hidden.
//
// Render this near any form input that's protected by reCAPTCHA — in our
// case the email/password fields on SignupPage and LoginPage. The waitlist
// form ALSO uses App Check tokens (Firestore writes), but the user
// explicitly only wants the attribution to "pop" on signup / signin, so
// we don't add it to the waitlist; the badge is hidden globally instead.
//
// Tone: low-contrast slate so it doesn't compete with the actual CTA.
// Links open in a new tab.

export default function RecaptchaAttribution() {
  return (
    <p className="text-[10px] text-slate-400 leading-relaxed text-center">
      This site is protected by reCAPTCHA and the Google{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-slate-600"
      >
        Privacy Policy
      </a>{" "}
      and{" "}
      <a
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-slate-600"
      >
        Terms of Service
      </a>{" "}
      apply.
    </p>
  );
}
