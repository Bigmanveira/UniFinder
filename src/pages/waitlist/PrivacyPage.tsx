import WaitlistDocLayout from "../../components/WaitlistDocLayout";

export default function WaitlistPrivacyPage() {
  return (
    <WaitlistDocLayout
      title="Privacy"
      subtitle="What we collect from the waitlist and what we do with it."
    >
      <section>
        <h2 className="text-lg font-bold text-white mb-2">What we collect</h2>
        <p>
          When you join the waitlist we collect your <strong className="text-white">email address</strong> and nothing else.
          Our servers also see standard request metadata — your browser, OS, and an approximate IP — for the duration of
          your visit. We don't link that metadata to your email or use it for advertising.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">What we do with your email</h2>
        <p>
          One welcome email goes out immediately so you know the signup worked. After that we'll only contact you with
          launch news and major updates — at most a handful of emails between now and public launch. No newsletters,
          no marketing partner blasts.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">Where the data lives</h2>
        <p>
          Email addresses are stored in Google Firebase Firestore (Google Cloud, US region) under our project's database.
          Outbound waitlist emails are sent via Resend. Both services receive your email solely to deliver the message;
          neither is permitted to use it for anything else.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">Sharing</h2>
        <p>
          We don't sell, rent, or share your email with third parties. The only people who ever see it are the
          founder and the small ops team using internal tools to support the launch.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">Removing yourself</h2>
        <p>
          Email <a href="mailto:support@collegeready.io" className="text-blue-400 hover:underline">support@collegeready.io</a>{" "}
          from the address you signed up with and we'll delete your record within 48 hours. No questions, no friction.
          When the full product launches you'll be able to manage this from inside the app.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">Changes to this notice</h2>
        <p>
          This page covers the waitlist period only. A fuller privacy policy will replace it when the product launches —
          you'll be told before that happens.
        </p>
      </section>
    </WaitlistDocLayout>
  );
}
