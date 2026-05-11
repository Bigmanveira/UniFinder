import { Link } from "react-router-dom";
import { GraduationCap, FileText } from "lucide-react";

const LAST_UPDATED = "May 11, 2026";

// ─────────────────────────────────────────────────────────────────────────────
// Terms of Service — what the service is, what users may/may not do with it,
// disclaimers (especially around the visa-interview simulator), and limits
// on liability. Plain language. The visa-practice section is repeated here
// because it's the highest-risk feature on the platform.
// ─────────────────────────────────────────────────────────────────────────────
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-500 selection:text-white">
      <header className="absolute top-0 left-0 right-0 z-50 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <Link to="/" className="flex items-center gap-2 text-slate-900 group">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center text-white shadow-lg shadow-primary-600/20 group-hover:scale-105 transition-transform">
            <GraduationCap size={22} />
          </div>
          <span className="text-xl font-black tracking-tight">College Ready</span>
        </Link>
        <Link to="/login" className="text-sm font-bold text-primary-600 hover:text-primary-700 bg-primary-50 px-5 py-2.5 rounded-full transition-colors">
          Log in
        </Link>
      </header>

      <section className="pt-32 pb-12 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-primary-600 text-xs font-black tracking-widest uppercase mb-6">
            <FileText size={14} /> The rules of the road
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight mb-4 tracking-tight">
            Terms of <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-accent-500">Service</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium">Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      <section className="px-6 pb-32">
        <article className="max-w-3xl mx-auto bg-white rounded-[24px] border border-slate-200 shadow-sm px-7 py-8 md:px-10 md:py-12 space-y-8 text-slate-700 leading-relaxed">

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
              <li>Rehearse the U.S. F-1 student visa interview with an AI avatar.</li>
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
              <li>One free credit allowance per real human. We may revoke duplicate or fraudulent accounts.</li>
            </ul>
          </Block>

          <Block title="Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc ml-5 mt-3 space-y-1.5">
              <li>Use the service to commit fraud, harass others, or violate any law.</li>
              <li>Upload documents you don't have the right to upload, or that contain another person's data.</li>
              <li>Attempt to bypass usage limits, abuse referral credits, or reverse-engineer the AI behaviour.</li>
              <li>Scrape, mass-download, or build a competing product from data we provide.</li>
              <li>Submit content that's illegal, hateful, sexually explicit, or deliberately misleading.</li>
            </ul>
            <p className="mt-3">
              We may suspend or terminate accounts that violate these rules. In serious cases (fraud, threats) we'll cooperate with the relevant authorities.
            </p>
          </Block>

          <Block title="Credits and billing">
            <ul className="list-disc ml-5 space-y-1.5">
              <li>Some features cost credits (unlocking a full match report, running an interview practice).</li>
              <li>New accounts receive 20 free credits. Successful referrals earn 5 more.</li>
              <li>Purchased credits are non-refundable except where required by law, and don't expire.</li>
              <li>Prices may change. If you've already bought a credit pack, that purchase is honoured at the price you paid.</li>
            </ul>
          </Block>

          <Block title="F-1 visa interview practice — important">
            <p>
              The "Live AI consular officer" is a <strong>simulation</strong> built for practice. Read this carefully:
            </p>
            <ul className="list-disc ml-5 mt-3 space-y-1.5">
              <li>"Anna" is an AI avatar. She is not, and never claims to be, a real consular officer.</li>
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
              We aim for high uptime but don't guarantee uninterrupted service. AI models can fail or return imperfect results. If a paid action (e.g. unlock report) fails because of an outage on our side, we'll refund the credit.
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

      <footer className="bg-white py-10 border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <GraduationCap size={16} />
            </div>
            <span className="text-base font-black tracking-tight text-slate-900">College Ready</span>
          </div>
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
