import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, MessageCircleQuestion, Send, ShieldAlert, Sparkles } from "lucide-react";
import BrandLogo from "../components/BrandLogo";

// ─────────────────────────────────────────────────────────────────────────────
// Contact — no server-side email service yet, so the form composes a mailto:
// link that opens the user's email client with subject + body pre-filled. The
// user can always still email us directly; the form is there mostly to
// structure the request so we get the context we need to help.
// ─────────────────────────────────────────────────────────────────────────────
const SUPPORT_EMAIL = "support@collegeready.io";

type Topic = "match-help" | "interview-help" | "billing" | "bug" | "feedback" | "press" | "other";

const TOPIC_OPTIONS: { value: Topic; label: string }[] = [
  { value: "match-help",     label: "Help with my match report" },
  { value: "interview-help", label: "Help with the interview simulator" },
  { value: "billing",        label: "Credits or billing" },
  { value: "bug",            label: "Bug or technical issue" },
  { value: "feedback",       label: "Product feedback or suggestion" },
  { value: "press",          label: "Press / partnerships" },
  { value: "other",          label: "Something else" },
];

export default function ContactPage() {
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [topic, setTopic]     = useState<Topic>("match-help");
  const [message, setMessage] = useState("");

  const subject = `[${TOPIC_OPTIONS.find(t => t.value === topic)?.label ?? "Contact"}] ${name || "College Ready user"}`;
  const body = [
    `Name: ${name || "(not provided)"}`,
    `Reply-to: ${email || "(not provided)"}`,
    `Topic: ${TOPIC_OPTIONS.find(t => t.value === topic)?.label ?? topic}`,
    "",
    "Message:",
    message || "(empty)",
  ].join("\n");

  const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const canSend = message.trim().length > 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-500 selection:text-white">
      <header className="absolute top-0 left-0 right-0 z-50 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <BrandLogo size="md" />
        <Link to="/login" className="text-sm font-bold text-primary-600 hover:text-primary-700 bg-primary-50 px-5 py-2.5 rounded-full transition-colors">
          Log in
        </Link>
      </header>

      <section className="pt-32 pb-12 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-primary-600 text-xs font-black tracking-widest uppercase mb-6">
            <Mail size={14} /> Talk to us
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight mb-4 tracking-tight">
            Get in <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-accent-500">touch</span>
          </h1>
          <p className="text-base text-slate-500 font-medium max-w-xl mx-auto">
            Bug report, feature idea, billing question, or just want to say hi — we read every message.
          </p>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Form card (spans 2 cols on desktop) */}
          <form
            onSubmit={(e) => { e.preventDefault(); window.location.href = mailtoHref; }}
            className="md:col-span-2 bg-white rounded-[24px] border border-slate-200 shadow-sm p-6 md:p-8 space-y-5"
          >
            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Your name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Reply-to email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Topic</label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value as Topic)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all appearance-none cursor-pointer"
              >
                {TOPIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's going on. The more detail, the faster we can help."
                rows={6}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-medium focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all resize-none leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={!canSend}
              className="w-full inline-flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-4 rounded-2xl hover:bg-primary-700 transition-colors active:scale-[0.99] shadow-lg shadow-primary-600/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Send size={16} /> Open in my email app
            </button>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              We use your email client so the conversation lands in <em>your</em> inbox — no hidden tracking, no marketing list. If your device doesn't have an email app set up, just write to <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-600 font-semibold hover:underline">{SUPPORT_EMAIL}</a>.
            </p>
          </form>

          {/* Side info cards */}
          <aside className="space-y-4">
            <InfoCard
              icon={<MessageCircleQuestion size={20} className="text-primary-600" />}
              title="Quick answers?"
              body="Most questions are covered in our FAQ — give it a scroll first."
              cta={{ label: "Browse FAQ", to: "/faq" }}
            />
            <InfoCard
              icon={<ShieldAlert size={20} className="text-amber-600" />}
              title="Visa interview help"
              body="Anna's feedback is practice only — not legal advice. For visa law questions, contact a qualified immigration attorney."
            />
            <InfoCard
              icon={<Sparkles size={20} className="text-emerald-600" />}
              title="Press & partnerships"
              body="Building something complementary or writing about us? Pick the 'Press / partnerships' topic and we'll get back fast."
            />
          </aside>
        </div>
      </section>

      <footer className="bg-white py-10 border-t border-slate-100">
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

function InfoCard({
  icon, title, body, cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}) {
  return (
    <div className="bg-white rounded-[20px] border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">{icon}</div>
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      </div>
      <p className="text-[13px] text-slate-500 leading-relaxed">{body}</p>
      {cta && (
        <Link to={cta.to} className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 mt-3">
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
