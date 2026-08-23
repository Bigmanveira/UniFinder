import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MessageCircleQuestion, Send, ShieldAlert, Wand2 } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { Eyebrow } from "../components/ui/Eyebrow";
import { IconChip } from "../components/ui/IconChip";
import { Input } from "../components/ui/Input";

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
  { value: "billing",        label: "Tokens or billing" },
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
    <div className="min-h-screen bg-surface font-sans selection:bg-primary-500 selection:text-white">
      {/* Top bar */}
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

      {/* Hero */}
      <section className="pt-10 sm:pt-16 pb-10 px-5 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow className="mb-3">Talk to us</Eyebrow>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight mb-4">
            Get in <span className="text-primary-600">touch</span>
          </h1>
          <p className="text-base text-slate-500 font-medium max-w-xl mx-auto">
            Bug report, feature idea, billing question, or just want to say hi — we read every message.
          </p>
        </div>
      </section>

      <section className="px-5 sm:px-6 pb-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Form card (spans 2 cols on desktop) */}
          <form
            onSubmit={(e) => { e.preventDefault(); window.location.href = mailtoHref; }}
            className="md:col-span-2 bg-white border border-slate-200/70 rounded-card shadow-card p-6 md:p-8 space-y-5"
          >
            <Input
              label="Your name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
            />

            <Input
              label="Reply-to email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            <div>
              <label htmlFor="contact-topic" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Topic</label>
              <select
                id="contact-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value as Topic)}
                className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 appearance-none cursor-pointer"
              >
                {TOPIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="contact-message" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Message</label>
              <textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's going on. The more detail, the faster we can help."
                rows={6}
                className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 resize-none leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={!canSend}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-bold py-4 shadow-glow transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={16} /> Open in my email app
            </button>

            <p className="text-[11px] font-medium text-slate-400 text-center leading-relaxed">
              We use your email client so the conversation lands in <em>your</em> inbox — no hidden tracking, no marketing list. If your device doesn't have an email app set up, just write to <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-600 font-semibold hover:underline">{SUPPORT_EMAIL}</a>.
            </p>
          </form>

          {/* Side info cards */}
          <aside className="space-y-4">
            <InfoCard
              icon={<IconChip icon={<MessageCircleQuestion size={18} />} tint="primary" size="md" />}
              title="Quick answers?"
              body="Most questions are covered in our FAQ — give it a scroll first."
              cta={{ label: "Browse FAQ", to: "/faq" }}
            />
            <InfoCard
              icon={<IconChip icon={<ShieldAlert size={18} />} tint="amber" size="md" />}
              title="Visa interview help"
              body="Anna's feedback is practice only — not legal advice. For visa law questions, contact a qualified immigration attorney."
            />
            <InfoCard
              icon={<IconChip icon={<Wand2 size={18} />} tint="primary" size="md" />}
              title="Press & partnerships"
              body="Building something complementary or writing about us? Pick the 'Press / partnerships' topic and we'll get back fast."
            />
          </aside>
        </div>
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

function InfoCard({
  icon, title, body, cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}) {
  return (
    <div className="bg-white border border-slate-200/70 rounded-card shadow-card p-5">
      <div className="flex items-center gap-3 mb-2.5">
        {icon}
        <h3 className="text-[15px] font-black tracking-tight text-slate-900">{title}</h3>
      </div>
      <p className="text-[13px] text-slate-500 font-medium leading-relaxed">{body}</p>
      {cta && (
        <Link to={cta.to} className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 mt-3">
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
