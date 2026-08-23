import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { Eyebrow } from "../components/ui/Eyebrow";

const LAST_UPDATED = "May 11, 2026";

// ─────────────────────────────────────────────────────────────────────────────
// Terms of Service — what the service is, what users may/may not do with it,
// disclaimers (especially around the visa-interview simulator), and limits
// on liability. Plain language. The visa-practice section is repeated here
// because it's the highest-risk feature on the platform.
// ─────────────────────────────────────────────────────────────────────────────
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface font-sans selection:bg-primary-500 selection:text-white">
      <header className="max-w-5xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Back home"
            className="w-9 h-9 shrink-0 rounded-full bg-white border border-slate-200/70 shadow-sm hover:border-slate-300 flex items-center justify-center text-slate-700 transition-colors"
          >
            <ArrowLeft size={15} />
          </Link>
          <BrandLogo size="md" />
        </div>
        <Link
          to="/login"
          className="rounded-full bg-ink text-white text-sm font-bold px-5 py-2.5 hover:bg-slate-800 shadow-lg shadow-slate-900/20 transition-all active:scale-95"
        >
          Log in
        </Link>
      </header>

      <section className="pt-10 sm:pt-16 pb-10 px-5 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow className="mb-3">The rules of the road</Eyebrow>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight mb-4">
            Terms of <span className="text-primary-600">Service</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium">Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      <section className="px-5 sm:px-6 pb-28">
        <article className="max-w-3xl mx-auto bg-white border border-slate-200/70 rounded-card shadow-card px-7 py-8 md:px-10 md:py-12 space-y-8 text-slate-700 leading-relaxed">

          <Block title="Welcome">
            <p>
              These Terms govern your use of College Ready ("we", "us", "the service"). By creating an account or using the site, you agree to them. If you don't agree, please don't use the service.
            </p>
          </Block>

          <Block title="What College Ready is">
            <p>
              College Ready is a practice and research tool that helps prospective students:
            </p>
            <ul className="list-disc ml-5 mt-3 space-y-1.5">
              <li>Match against a verified database of U.S. colleges based on their profile.</li>
              <li>Rehearse the U.S. F-1 student visa interview with an AI interviewer.</li>
              <li>Build an application roadmap and save schools they're interested in.</li>
            </ul>
            <p className="mt-3 font-bold text-slate-900">
              College Ready is NOT: an official U.S. government service, an embassy, a consular service, an admissions consulting firm, a law firm, or a guarantee of any admission or visa outcome.
            </p>
          </Block>

          <Block title="Your account">
            <ul className="list-disc ml-5 space-y-1.5">
              <li>You must be 13 or older to create an account.</li>
              <li>You're responsible for keeping your sign-in credentials secure.</li>
              <li>Don't share an account with another person — each user needs their own.</li>
              <li>One free token allowance per real human. We may revoke duplicate or fraudulent accounts.</li>
            </ul>
          </Block>

          <Block title="Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc ml-5 mt-3 space-y-1.5">
              <li>Use the service to commit fraud, harass others, or violate any law.</li>
              <li>Upload documents you don't have the right to upload, or that contain another person's data.</li>
              <li>Attempt to bypass usage limits, abuse referral tokens, or reverse-engineer the AI behaviour.</li>
              <li>Scrape, mass-download, or build a competing product from data we provide.</li>
              <li>Submit content that's illegal, hateful, sexually explicit, or deliberately misleading.</li>
            </ul>
            <p className="mt-3">
              We may suspend or terminate accounts that violate these rules. In serious cases (fraud, threats) we'll cooperate with the relevant authorities.
            </p>
          </Block>

          <Block title="Tokens and billing">
            <ul className="list-disc ml-5 space-y-1.5">
              <li>Some features cost tokens (unlocking a full match report, running an interview practice).</li>
              <li>New accounts receive 200 free tokens. Successful referrals earn 500 more.</li>
              <li>Purchased tokens are non-refundable except where required by law, and don't expire.</li>
              <li>Prices may change. If you've already bought a token pack, that purchase is honoured at the price you paid.</li>
            </ul>
          </Block>

          <Block title="F-1 visa interview practice — important">
            <p>
              The "Live AI consular officer" is a <strong>simulation</strong> built for practice. Read this carefully:
            </p>
            <ul className="list-disc ml-5 mt-3 space-y-1.5">
              <li>"Anna" is an AI interviewer. She is not, and never claims to be, a real consular officer.</li>
              <li>The score, feedback, and red flags she generates are <strong>practice feedback</strong> only — not a prediction of your real visa outcome.</li>
              <li>Real visa decisions are made by U.S. consular officers based on factors and policies we have no access to.</li>
              <li>Nothing in the simulator should be treated as legal advice. Consult a qualified immigration attorney for legal questions.</li>
              <li>We don't share the documents you upload with any government, embassy, or third party — but we also don't verify their authenticity. Practice with real documents at your own risk; never upload another person's documents.</li>
            </ul>
          </Block>

          <Block title="Match results — important">
            <p>
              Our matching engine uses your stated profile against verified institutional data. It produces a <strong>profile-based fit estimate</strong>, not an admissions decision. Admissions committees review subjective factors (essays, recommendations, interviews) we don't see. Use our shortlist as a starting point, not the final word.
            </p>
          </Block>

          <Block title="Your content">
            <p>
              Profiles, documents, transcripts, and reports you create remain yours. By using the service, you grant us a limited licence to process this content for the purposes described in our Privacy Policy — strictly to run the features you asked for.
            </p>
          </Block>

          <Block title="Service availability">
            <p>
              We aim for high uptime but don't guarantee uninterrupted service. AI models can fail or return imperfect results. If a paid action (e.g. unlock report) fails because of an outage on our side, we'll refund the tokens.
            </p>
          </Block>

          <Block title="Limitation of liability">
            <p>
              To the maximum extent permitted by law, College Ready is provided "as is" without warranties of any kind. We're not liable for any indirect, incidental, or consequential damages — including (without limit) lost admission opportunities, visa denials, or wasted application fees. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim arose.
            </p>
          </Block>

          <Block title="Changes to these terms">
            <p>
              We may update these Terms from time to time. Material changes will be announced by email and on this page (with an updated "Last updated" date). Continuing to use the service after an update means you accept the new Terms.
            </p>
          </Block>

          <Block title="Contact">
            <p>
              Questions about these Terms: <a href="mailto:support@collegeready.io" className="text-primary-600 font-bold hover:underline">support@collegeready.io</a>.
            </p>
          </Block>
        </article>
      </section>

      <footer className="bg-white py-10 border-t border-slate-200/70">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <BrandLogo size="sm" />
          <div className="flex gap-6 text-sm font-bold text-slate-400">
            <Link to="/faq" className="hover:text-primary-600 transition-colors">FAQ</Link>
            <Link to="/privacy" className="hover:text-primary-600 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-primary-600 transition-colors">Terms of Service</Link>
            <Link to="/contact" className="hover:text-primary-600 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl md:text-2xl font-black text-slate-900 mb-3 tracking-tight">{title}</h2>
      <div className="text-[15px] text-slate-600 font-medium leading-relaxed">{children}</div>
    </section>
  );
}
