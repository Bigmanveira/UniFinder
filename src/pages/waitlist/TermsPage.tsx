import WaitlistDocLayout from "../../components/WaitlistDocLayout";

export default function WaitlistTermsPage() {
  return (
    <WaitlistDocLayout
      title="Terms of use"
      subtitle="Ground rules for the waitlist. Full product terms publish at launch."
    >
      <section>
        <h2 className="text-lg font-bold text-white mb-2">What this is</h2>
        <p>
          College Ready is a pre-launch product. Joining the waitlist is a signal that you'd like access when it opens —
          it's not a purchase, a subscription, or a guarantee that you'll be admitted to any university.
          Nothing on this site is legal, immigration, or financial advice.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">No guarantees</h2>
        <p>
          We don't promise a launch date, a specific feature set, a particular price, or that any feature
          shown in the slideshow will exist in its current form when the product opens. We're building this in
          public and details will change.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">Visa interview practice — clarity</h2>
        <p>
          When the visa interview simulator launches, it will be a <strong className="text-white">practice tool only</strong>.
          It is not affiliated with any government, embassy, consular service, or the U.S. Department of State.
          A high score in our simulation predicts nothing about a real visa interview outcome. We will never
          coach you to misrepresent your circumstances.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">Using the waitlist responsibly</h2>
        <p>
          One signup per person, please. Don't sign up other people without their consent — we don't want to email
          someone who didn't ask to hear from us. If we notice waitlist abuse (fake addresses, mass signups, etc.)
          we'll remove the offending entries.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">Our right to change or remove your spot</h2>
        <p>
          We may at any time change how the waitlist works, change what the product will be at launch, delay launch,
          or remove your spot from the waitlist (for example, if your email bounces repeatedly, or if you misuse the
          signup form). If we remove you for a benign reason we'll email you first.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-2">Questions</h2>
        <p>
          For anything that isn't covered here, email{" "}
          <a href="mailto:support@collegeready.io" className="text-blue-400 hover:underline">support@collegeready.io</a>.
        </p>
      </section>
    </WaitlistDocLayout>
  );
}
