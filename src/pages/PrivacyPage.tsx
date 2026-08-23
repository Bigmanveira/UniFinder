import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { Eyebrow } from "../components/ui/Eyebrow";

const LAST_UPDATED = "May 11, 2026";

// ─────────────────────────────────────────────────────────────────────────────
// Privacy Policy — describes what data College Ready collects, why, who
// processes it, and how users can exercise their rights. Plain English, not
// legalese — but covers the substantive obligations (GDPR, CCPA-style
// notice). The user can update specifics (contact email, business address)
// when those are formalised.
// ─────────────────────────────────────────────────────────────────────────────
export default function PrivacyPage() {
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
          <Eyebrow className="mb-3">Your data, your rights</Eyebrow>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight mb-4">
            Privacy <span className="text-primary-600">Policy</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium">Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      <section className="px-5 sm:px-6 pb-28">
        <article className="max-w-3xl mx-auto bg-white border border-slate-200/70 rounded-card shadow-card px-7 py-8 md:px-10 md:py-12 space-y-8 text-slate-700 leading-relaxed">
          <Block title="The short version">
            <p>
              We collect the information you give us so we can match you with colleges, score your interview practice, and remember your preferences. We don't sell your data. You can request export or deletion at any time by emailing us.
            </p>
          </Block>

          <Block title="What we collect">
            <ul className="list-disc ml-5 space-y-1.5">
              <li><strong>Account basics:</strong> email, sign-in provider (Google, Apple, or password), and the display name and photo you add to your profile.</li>
              <li><strong>Match profile:</strong> the academic and funding information you enter in our wizard (GPA, test scores, intended field, level, budget, destination).</li>
              <li><strong>Practice interviews:</strong> the audio transcript of your F-1 visa practice sessions, the documents you upload (I-20, DS-160, supporting docs), and the AI score we generate.</li>
              <li><strong>Usage:</strong> reports you generate, schools you save, tokens you spend, and a minimal log of feature interactions to debug issues.</li>
            </ul>
          </Block>

          <Block title="What we don't collect">
            <p>We don't track you across other websites. We don't run third-party ad pixels. We don't sell your data to anyone, full stop.</p>
          </Block>

          <Block title="Why we collect it">
            <ul className="list-disc ml-5 space-y-1.5">
              <li>To match you with colleges and write personalised explanations.</li>
              <li>To simulate the F-1 visa interview using the documents you uploaded.</li>
              <li>To bill you accurately for tokens and prevent abuse of free tokens.</li>
              <li>To improve the product: aggregated, anonymised metrics on which features get used.</li>
            </ul>
          </Block>

          <Block title="Who processes your data">
            <p>
              We use a small, named set of processors that are bound by their own privacy commitments:
            </p>
            <ul className="list-disc ml-5 mt-3 space-y-1.5">
              <li><strong>Google Firebase</strong> — authentication, database (Firestore), file storage, and serverless functions.</li>
              <li><strong>Anthropic</strong> — runs Claude, the AI model that ranks your matches, writes explanations, and scores your interview practice. Anthropic does not train on your data.</li>
              <li><strong>HeyGen</strong> — provides the live interviewer video during F-1 interview practice. Audio and video are streamed only for the duration of the session.</li>
              <li><strong>Google Cloud Text-to-Speech</strong> — synthesises Anna's voice from the question text.</li>
              <li><strong>Vercel</strong> — hosts the web application.</li>
            </ul>
          </Block>

          <Block title="How long we keep your data">
            <ul className="list-disc ml-5 space-y-1.5">
              <li><strong>Account data and reports:</strong> kept while your account is active. Deleted within 30 days of an account deletion request.</li>
              <li><strong>Uploaded documents:</strong> retained on Firebase Storage so you can re-open past interview reports. Deleted on request, or automatically after 12 months of inactivity.</li>
              <li><strong>Audit logs:</strong> kept for up to 90 days for security and debugging.</li>
            </ul>
          </Block>

          <Block title="Your rights">
            <p>
              Regardless of where you live, you can:
            </p>
            <ul className="list-disc ml-5 mt-3 space-y-1.5">
              <li>Ask us what data we hold about you.</li>
              <li>Ask us to correct or update inaccurate data.</li>
              <li>Ask us to delete your account and associated data.</li>
              <li>Withdraw consent for any specific processing (e.g. stop using AI features).</li>
            </ul>
            <p className="mt-3">
              Email <a href="mailto:support@collegeready.io" className="text-primary-600 font-bold hover:underline">support@collegeready.io</a> and we'll respond within 30 days.
            </p>
          </Block>

          <Block title="Security">
            <p>
              We use Firebase security rules to scope every record to its owner. All traffic uses TLS. Document uploads (I-20, DS-160) are stored in your private folder and are only readable by you and our Cloud Functions.
            </p>
          </Block>

          <Block title="Changes to this policy">
            <p>
              If we make a material change to this policy we'll update the "Last updated" date and notify active users by email. Continuing to use College Ready after the update means you accept the new terms.
            </p>
          </Block>

          <Block title="Contact">
            <p>
              Questions, requests, or complaints: <a href="mailto:support@collegeready.io" className="text-primary-600 font-bold hover:underline">support@collegeready.io</a>.
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
