// ─────────────────────────────────────────────────────────────────────────────
// CvStudioPage — entry tile page for the Academic CV Studio.
//
// Three tools, each its own route + flow:
//   /app/cv-studio/review   — review & revamp an existing CV (5 credits)
//   /app/cv-studio/build    — build a new academic CV from scratch (8 credits)
//   /app/cv-studio/convert  — convert a professional CV to academic (8 credits)
//
// All three share the same free-preview + paid-unlock pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Wrench, RefreshCw, GraduationCap, Sparkles } from "lucide-react";

const TOOLS = [
  {
    to:    "/app/cv-studio/review",
    icon:  <RefreshCw size={22} />,
    title: "Review & revamp",
    blurb: "Upload your current academic CV. Get an honest critique plus a rewritten version that fixes the issues.",
    chip:  "5 credits",
    accent: "from-blue-500 to-blue-700",
    ring:   "ring-blue-100",
    chipClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    to:    "/app/cv-studio/build",
    icon:  <Wrench size={22} />,
    title: "Build from scratch",
    blurb: "Answer a short intake about your education, research, publications, and teaching. Get a polished academic CV back.",
    chip:  "8 credits",
    accent: "from-violet-500 to-violet-700",
    ring:   "ring-violet-100",
    chipClass: "bg-violet-50 text-violet-700 border-violet-200",
  },
  {
    to:    "/app/cv-studio/convert",
    icon:  <FileText size={22} />,
    title: "Professional → Academic",
    blurb: "Got a corporate / industry CV? Convert it into the academic format with research and publications foregrounded.",
    chip:  "8 credits",
    accent: "from-emerald-500 to-emerald-700",
    ring:   "ring-emerald-100",
    chipClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
];

export default function CvStudioPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-blue-50/30 to-white text-slate-900 antialiased pb-20 relative overflow-hidden">
      <div className="pointer-events-none absolute top-[-100px] right-[-100px] w-[440px] h-[440px] bg-blue-200/40 rounded-full blur-[120px]" aria-hidden />

      <header className="border-b border-slate-200 sticky top-0 z-40 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/app" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to dashboard">
            <ArrowLeft size={15} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">Academic CV Studio</h1>
            <p className="text-xs text-slate-500 truncate">Three AI tools to polish, build, or convert your academic CV</p>
          </div>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-5 py-8">
        <section className="mb-9">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold uppercase tracking-widest mb-4">
            <Sparkles size={11} /> New
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mb-3 leading-tight">
            Build an academic CV the gatekeepers respect.
          </h2>
          <p className="text-base text-slate-600 max-w-2xl leading-relaxed">
            Each tool generates a real document you can preview free. Pay only when you want the full version — written in a voice that reads like a working researcher, not a chatbot.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TOOLS.map((tool) => (
            <Link
              key={tool.to}
              to={tool.to}
              className={`group relative bg-white rounded-3xl border border-slate-200 ring-1 ${tool.ring} shadow-sm hover:shadow-md transition-all p-6 flex flex-col`}
            >
              <span className={`inline-flex self-start items-center gap-1 text-[10px] font-black tracking-widest uppercase ${tool.chipClass} border rounded-full px-2 py-0.5 mb-4`}>
                {tool.chip}
              </span>
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tool.accent} text-white flex items-center justify-center mb-4 shadow-md`}>
                {tool.icon}
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2 leading-tight">{tool.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed flex-1">{tool.blurb}</p>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-900 mt-5 group-hover:gap-2 transition-all">
                Open <ArrowRight size={13} />
              </span>
            </Link>
          ))}
        </section>

        <section className="mt-10 bg-slate-50/60 border border-slate-200 rounded-3xl p-6 sm:p-7">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 flex-shrink-0">
              <GraduationCap size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-black text-slate-900 mb-1.5">How it works</p>
              <ul className="text-[13px] text-slate-700 leading-relaxed space-y-1">
                <li>· You submit your input (PDF, paste-text, or guided form).</li>
                <li>· The AI generates the full document and shows you the first portion free.</li>
                <li>· To unlock the rest, you spend credits. If you don't have enough, you'll be sent to the pricing page to top up.</li>
                <li>· Outputs are written in a real academic voice and avoid the phrasings AI detectors flag.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
