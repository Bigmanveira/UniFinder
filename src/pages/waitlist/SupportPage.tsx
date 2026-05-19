import { Link } from "react-router-dom";
import { Mail, MessageCircleQuestion } from "lucide-react";
import WaitlistDocLayout from "../../components/WaitlistDocLayout";

// Brand icon glyphs duplicated from WaitlistPage.tsx so this page renders
// the same socials without a fresh dependency. lucide-react v1.x in this
// repo doesn't ship the brand marks, so inline SVG is the path.
function InstagramGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" />
    </svg>
  );
}
function FacebookGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06C2 17.07 5.66 21.21 10.44 22v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47H15.2c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.34V22C18.34 21.21 22 17.07 22 12.06z" />
    </svg>
  );
}
function LinkedInGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.98 3.5C4.98 4.881 3.87 6 2.5 6S0 4.881 0 3.5C0 2.12 1.12 1 2.5 1S4.98 2.12 4.98 3.5zM.22 8h4.56v14H.22V8zm7.4 0h4.37v1.91h.06c.61-1.16 2.1-2.39 4.32-2.39 4.62 0 5.47 3.04 5.47 7v7.48h-4.56v-6.63c0-1.58-.03-3.61-2.2-3.61-2.2 0-2.54 1.72-2.54 3.5V22H7.62V8z" />
    </svg>
  );
}

export default function WaitlistSupportPage() {
  return (
    <WaitlistDocLayout
      title="Support"
      subtitle="One person reads every message. Response usually within 48 hours."
    >
      <section>
        <h2 className="text-lg font-bold text-white mb-3">Best way to reach us</h2>
        <a
          href="mailto:support@collegeready.io"
          className="inline-flex items-center gap-3 bg-white text-slate-900 hover:bg-slate-100 font-bold px-5 py-3 rounded-xl transition-colors"
        >
          <Mail size={16} /> support@collegeready.io
        </a>
        <p className="mt-4 text-sm text-slate-400 leading-relaxed">
          Email is the only support channel during the waitlist period. You'll get a real human reply, not a templated
          ticket response. We're a small team so the queue might run a day or two long on weekends.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-3">What's worth emailing about</h2>
        <ul className="space-y-2 list-disc list-inside text-slate-300">
          <li>You signed up but didn't receive the welcome email (check spam first, then ping us).</li>
          <li>You want to be removed from the waitlist.</li>
          <li>You have a question about what College Ready will do at launch.</li>
          <li>You're a school counsellor or partner organisation interested in bulk access.</li>
          <li>You spotted a bug on the waitlist page.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-3">Common questions first</h2>
        <p className="text-slate-400 mb-3">
          Most pre-launch questions are answered in the FAQ — worth a glance before emailing.
        </p>
        <Link
          to="/waitlist/faq"
          className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          <MessageCircleQuestion size={14} /> Read the FAQ
        </Link>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-3">Find us elsewhere</h2>
        <div className="flex items-center gap-3">
          <a
            href="https://instagram.com/233labs"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <InstagramGlyph />
          </a>
          <a
            href="https://facebook.com/233labs"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <FacebookGlyph />
          </a>
          <a
            href="https://linkedin.com/company/233labs"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <LinkedInGlyph />
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-500">Social channels are for updates only — please don't DM support requests. Email is faster.</p>
      </section>
    </WaitlistDocLayout>
  );
}
