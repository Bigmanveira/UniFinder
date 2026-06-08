// ─────────────────────────────────────────────────────────────────────────────
// CvStudioPage — entry surface for the Academic CV Studio.
//
// Three tools share one preview→paywall pipeline:
//   /app/cv-studio/review   — review & revamp an existing CV  (5 credits)
//   /app/cv-studio/build    — build a new academic CV         (8 credits)
//   /app/cv-studio/convert  — professional → academic         (8 credits)
//
// History lives at /app/cv-studio/history.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, FileText, Wrench, RefreshCw, GraduationCap,
  Sparkles, Lock, Eye, ShieldCheck, History,
} from "lucide-react";
import CvStudioFooter from "../components/cv/CvStudioFooter";

const TOOLS = [
  {
    to:    "/app/cv-studio/review",
    icon:  <RefreshCw size={22} />,
    title: "Review & revamp",
    blurb: "Upload or paste your current academic CV. Get an honest critique plus a rewritten version that fixes the issues.",
    badge: "5 credits",
    accent:    "from-blue-500 to-blue-700",
    ring:      "ring-blue-100",
    chipClass: "bg-blue-50 text-blue-700 border-blue-200",
    glow:      "from-blue-300/20 to-transparent",
  },
  {
    to:    "/app/cv-studio/build",
    icon:  <Wrench size={22} />,
    title: "Build from scratch",
    blurb: "Answer a short guided intake — education, research, publications, teaching — and get a polished academic CV back.",
    badge: "8 credits",
    accent:    "from-violet-500 to-violet-700",
    ring:      "ring-violet-100",
    chipClass: "bg-violet-50 text-violet-700 border-violet-200",
    glow:      "from-violet-300/20 to-transparent",
  },
  {
    to:    "/app/cv-studio/convert",
    icon:  <FileText size={22} />,
    title: "Professional → Academic",
    blurb: "Got an industry CV? Convert it into the academic format with research and publications properly foregrounded.",
    badge: "8 credits",
    accent:    "from-emerald-500 to-emerald-700",
    ring:      "ring-emerald-100",
    chipClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    glow:      "from-emerald-300/20 to-transparent",
  },
];

const TRUST = [
  { icon: <Eye size={18} />,        title: "Preview free",     body: "See the first portion of every generated CV before you spend a credit." },
  { icon: <ShieldCheck size={18} />, title: "Passes AI detection", body: "Tuned to write in a real researcher's voice — terse, factual, varied. Detectors look for AI patterns; we don't produce them." },
  { icon: <Lock size={18} />,        title: "Yours forever",      body: "Once unlocked, your CV is downloadable as Markdown and saved in your history." },
];

export default function CvStudioPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      {/* Decorative gradient background — sits behind the hero only */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute top-[-180px] right-[-120px] w-[520px] h-[520px] bg-gradient-to-br from-blue-300/40 via-violet-200/30 to-transparent rounded-full blur-[140px]" aria-hidden />
        <div className="pointer-events-none absolute top-[-120px] left-[-180px] w-[520px] h-[520px] bg-gradient-to-br from-emerald-200/30 via-cyan-200/20 to-transparent rounded-full blur-[140px]" aria-hidden />

        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
            <Link to="/app" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to dashboard">
              <ArrowLeft size={15} />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-bold leading-tight truncate">Academic CV Studio</h1>
              <p className="text-xs text-slate-500 truncate">Three AI tools to polish, build, or convert your academic CV</p>
            </div>
            <Link
              to="/app/cv-studio/history"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <History size={13} /> History
            </Link>
          </div>
        </header>

        <main className="relative max-w-6xl mx-auto px-5 pt-12 sm:pt-16 pb-10 sm:pb-14">
          <section className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-black uppercase tracking-widest mb-5">
              <Sparkles size={11} /> New · CV Studio
            </span>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4 leading-[1.05]">
              Build an academic CV the gatekeepers respect.
            </h2>
            <p className="text-base sm:text-[17px] text-slate-600 leading-relaxed max-w-2xl mx-auto">
              Three AI tools that produce a real document in a real academic voice — not the marketing-prose chatbot output detectors flag. Preview free; unlock to download.
            </p>
          </section>
        </main>
      </div>

      {/* Tool tiles */}
      <main className="relative max-w-6xl mx-auto px-5 w-full">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TOOLS.map((tool) => (
            <Link
              key={tool.to}
              to={tool.to}
              className="group relative bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all p-7 flex flex-col overflow-hidden"
            >
              {/* Per-tile glow accent in the corner */}
              <div className={`absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl bg-gradient-to-br ${tool.glow} pointer-events-none`} aria-hidden />

              <div className="relative flex-1 flex flex-col">
                <span className={`inline-flex self-start items-center gap-1 text-[10px] font-black tracking-widest uppercase ${tool.chipClass} border rounded-full px-2 py-0.5 mb-5`}>
                  {tool.badge}
                </span>
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${tool.accent} text-white flex items-center justify-center mb-5 shadow-md shadow-slate-900/10`}>
                  {tool.icon}
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2 leading-tight tracking-tight">{tool.title}</h3>
                <p className="text-[14px] text-slate-600 leading-relaxed flex-1">{tool.blurb}</p>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-900 mt-6 group-hover:gap-2 transition-all">
                  Open <ArrowRight size={13} />
                </span>
              </div>
            </Link>
          ))}
        </section>

        {/* Trust strip — the three reassurance pillars */}
        <section className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-px bg-slate-200 rounded-3xl overflow-hidden border border-slate-200">
          {TRUST.map((t) => (
            <div key={t.title} className="bg-white p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
                {t.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 mb-1">{t.title}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{t.body}</p>
              </div>
            </div>
          ))}
        </section>

        {/* How it works — kept understated; we already told the user the pitch in the hero */}
        <section className="mt-10 bg-white rounded-3xl border border-slate-200 shadow-sm p-7 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
              <GraduationCap size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-black text-slate-900 mb-2">How it works</p>
              <ol className="text-[14px] text-slate-700 leading-relaxed space-y-1.5">
                <li><span className="font-bold text-slate-900">1.</span> Submit your input — drag-drop a PDF / Word doc, paste text, or fill the guided form.</li>
                <li><span className="font-bold text-slate-900">2.</span> The AI generates the full document; you see the first portion free.</li>
                <li><span className="font-bold text-slate-900">3.</span> Unlock with credits to read + download the complete CV. Out of credits? You'll be sent to /pricing.</li>
                <li><span className="font-bold text-slate-900">4.</span> Every unlocked CV stays in your <Link to="/app/cv-studio/history" className="underline hover:text-slate-900 transition-colors">history</Link>.</li>
              </ol>
            </div>
          </div>
        </section>
      </main>

      <CvStudioFooter />
    </div>
  );
}
