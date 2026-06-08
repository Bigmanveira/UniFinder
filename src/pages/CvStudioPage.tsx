// ─────────────────────────────────────────────────────────────────────────────
// CvStudioPage — entry surface for the Academic CV Studio.
//
// Three tools share one preview→paywall pipeline:
//   /app/cv-studio/review   — review & revamp an existing CV  (5 credits)
//   /app/cv-studio/build    — build a new academic CV         (8 credits)
//   /app/cv-studio/convert  — professional → academic         (8 credits)
//
// Bento-style layout. The Reviewer tile is the hero (largest, full-width
// on mobile, 2/3 on desktop) — it's the most discoverable use-case + the
// cheapest entry point so we lead with it. Builder + Converter stack
// alongside as smaller cards.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, FileText, Wrench, RefreshCw,
  Eye, ShieldCheck, History, Lock, Bot, Wand2,
  GraduationCap, Briefcase, Award, Languages,
} from "lucide-react";
import CvStudioFooter from "../components/cv/CvStudioFooter";

const TRUST = [
  { icon: <Eye size={16} />,        title: "Preview free",          body: "See the first portion of every generated CV before you spend a credit." },
  { icon: <ShieldCheck size={16} />, title: "Passes AI detection",   body: "Tuned to write in a real researcher's voice — terse, factual, varied. Not the patterns detectors flag." },
  { icon: <Lock size={16} />,        title: "Yours forever",         body: "Once unlocked, your CV is downloadable as Markdown and saved in your history." },
];

export default function CvStudioPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      {/* ── Background gradient field ─────────────────────────────────── */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 left-1/4 w-[640px] h-[640px] bg-gradient-to-br from-blue-400/25 via-violet-400/15 to-transparent rounded-full blur-[160px] animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute top-1/3 -right-32 w-[520px] h-[520px] bg-gradient-to-br from-emerald-400/25 via-cyan-300/15 to-transparent rounded-full blur-[160px] animate-pulse" style={{ animationDuration: "10s", animationDelay: "2s" }} />
        <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[640px] h-[640px] bg-gradient-to-tr from-fuchsia-300/20 via-violet-300/10 to-transparent rounded-full blur-[160px] animate-pulse" style={{ animationDuration: "12s", animationDelay: "4s" }} />
      </div>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
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

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative max-w-5xl mx-auto px-5 pt-14 sm:pt-20 pb-10 sm:pb-14 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-md border border-slate-200 shadow-sm mb-7">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600" />
          </span>
          <span className="text-[11px] font-black tracking-widest uppercase text-slate-700">CV Studio · New</span>
        </div>

        <h2 className="text-[44px] sm:text-6xl font-black tracking-tight text-slate-900 mb-5 leading-[0.95]">
          The CV gatekeepers
          <br />
          <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-emerald-600 bg-clip-text text-transparent">actually respect.</span>
        </h2>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
          Three AI tools that produce a real document in a real academic voice — not the marketing-prose chatbot output detectors flag. Preview free; unlock when you're sure.
        </p>
      </section>

      {/* ── Bento grid ───────────────────────────────────────────────── */}
      <main className="relative max-w-6xl mx-auto px-5 w-full">
        <section className="grid grid-cols-1 md:grid-cols-3 md:auto-rows-[14rem] gap-5">
          {/* Reviewer — hero tile, takes 2 columns on desktop */}
          <ToolHeroTile
            to="/app/cv-studio/review"
            icon={<RefreshCw size={22} />}
            iconBg="from-blue-500 to-blue-700"
            chip={{ text: "5 credits", color: "bg-blue-50 text-blue-700 border-blue-200" }}
            title="Review & revamp"
            blurb="Drop in your current academic CV. We point at what's weak, then rewrite it sharper."
            sample={[
              { icon: <Eye size={11} />,        label: "10-bullet critique" },
              { icon: <Wand2 size={11} />,      label: "Full rewrite" },
              { icon: <ShieldCheck size={11} />, label: "AI-detector safe" },
            ]}
          />
          {/* Builder */}
          <ToolTile
            to="/app/cv-studio/build"
            icon={<Wrench size={20} />}
            iconBg="from-violet-500 to-fuchsia-600"
            chip={{ text: "8 credits", color: "bg-violet-50 text-violet-700 border-violet-200" }}
            title="Build from scratch"
            blurb="A guided intake produces a polished CV in the standard template."
          />
          {/* Converter */}
          <ToolTile
            to="/app/cv-studio/convert"
            icon={<FileText size={20} />}
            iconBg="from-emerald-500 to-teal-600"
            chip={{ text: "8 credits", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }}
            title="Pro → Academic"
            blurb="Industry CV in, academic format out — research up front, jargon out."
          />

          {/* Wide row spanning 3 columns — sample document strip */}
          <SampleDocumentStrip />
        </section>

        {/* ── Trust strip ─────────────────────────────────────────── */}
        <section className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TRUST.map((t) => (
            <div key={t.title} className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white flex items-center justify-center flex-shrink-0">
                  {t.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-black text-slate-900 mb-1">{t.title}</p>
                  <p className="text-[12px] text-slate-600 leading-relaxed">{t.body}</p>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* ── How it works ───────────────────────────────────────── */}
        <section className="mt-8 bg-slate-900 text-white rounded-3xl p-7 sm:p-9 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 pointer-events-none" aria-hidden />
          <div className="absolute -top-32 -right-32 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" aria-hidden />
          <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" aria-hidden />

          <div className="relative">
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-blue-300 mb-3">How it works</p>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-5 max-w-xl leading-tight">Four steps from "blank page" to "ready to send".</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-3">
              <Step n="1" title="Submit"     body="Drag-drop a PDF or .docx, paste text, or fill the guided form." />
              <Step n="2" title="Generate"   body="The AI writes the full document in seconds." />
              <Step n="3" title="Preview"    body="Read the first portion. Decide if you want the rest." />
              <Step n="4" title="Unlock"     body="Spend credits to read + download the complete CV." />
            </div>
          </div>
        </section>
      </main>

      <CvStudioFooter />
    </div>
  );
}

// ── Hero tile (spans 2 cols on desktop, ~28rem tall) ─────────────────
function ToolHeroTile({
  to, icon, iconBg, chip, title, blurb, sample,
}: {
  to:     string;
  icon:   React.ReactNode;
  iconBg: string;
  chip:   { text: string; color: string };
  title:  string;
  blurb:  string;
  sample: { icon: React.ReactNode; label: string }[];
}) {
  return (
    <Link
      to={to}
      className="group relative md:col-span-2 md:row-span-2 bg-white rounded-[28px] border border-slate-200 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all overflow-hidden p-8 flex flex-col"
    >
      {/* Decorative gradient corner glow */}
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl bg-gradient-to-br from-blue-300/35 to-transparent pointer-events-none" aria-hidden />
      <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full blur-3xl bg-gradient-to-br from-violet-200/30 to-transparent pointer-events-none" aria-hidden />

      <div className="relative flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <span className={`inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase ${chip.color} border rounded-full px-2 py-0.5`}>
            {chip.text}
          </span>
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${iconBg} text-white flex items-center justify-center shadow-lg shadow-slate-900/10`}>
            {icon}
          </div>
        </div>

        <h3 className="text-3xl sm:text-4xl font-black text-slate-900 mb-3 tracking-tight leading-[1.05]">{title}</h3>
        <p className="text-[15px] text-slate-600 leading-relaxed flex-1 max-w-md">{blurb}</p>

        {/* Sample chips — concrete deliverables. Reads as "here's what you actually get." */}
        <div className="flex flex-wrap gap-2 mt-6">
          {sample.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-[12px] font-bold">
              <span className="text-slate-500">{s.icon}</span>
              {s.label}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-[14px] font-bold text-slate-900 mt-7 group-hover:gap-2.5 transition-all">
          Start <ArrowRight size={14} />
        </div>
      </div>
    </Link>
  );
}

// ── Compact tile (right column on desktop) ───────────────────────────
function ToolTile({
  to, icon, iconBg, chip, title, blurb,
}: {
  to:     string;
  icon:   React.ReactNode;
  iconBg: string;
  chip:   { text: string; color: string };
  title:  string;
  blurb:  string;
}) {
  return (
    <Link
      to={to}
      className="group relative bg-white rounded-[28px] border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden p-6 flex flex-col"
    >
      <div className="flex items-center justify-between mb-5">
        <span className={`inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase ${chip.color} border rounded-full px-2 py-0.5`}>
          {chip.text}
        </span>
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconBg} text-white flex items-center justify-center shadow-md`}>
          {icon}
        </div>
      </div>
      <h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight leading-tight">{title}</h3>
      <p className="text-[13px] text-slate-600 leading-relaxed flex-1">{blurb}</p>
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900 mt-4 group-hover:gap-2 transition-all">
        Open <ArrowRight size={13} />
      </div>
    </Link>
  );
}

// ── Wide row — visual sample of what the output looks like ───────────
function SampleDocumentStrip() {
  return (
    <div className="md:col-span-3 relative bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white rounded-[28px] border border-slate-800 shadow-xl shadow-slate-900/20 overflow-hidden p-7 sm:p-9">
      {/* Animated grid pattern */}
      <div className="absolute inset-0 opacity-[0.04]" aria-hidden style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }} />
      <div className="absolute -top-40 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" aria-hidden />
      <div className="absolute -bottom-40 left-1/4 w-96 h-96 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" aria-hidden />

      <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] font-black uppercase tracking-widest text-white/80 mb-4">
            <Bot size={11} /> What you'll get
          </span>
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight mb-3">
            A document that reads like <span className="text-blue-300">a real researcher</span> wrote it.
          </h3>
          <p className="text-[14px] text-white/70 leading-relaxed">
            Section headers, formatting, and bullet structure that academic readers expect. No marketing language. No "passionate about" filler. Built to pass GPTZero, Originality.ai, and Turnitin's AI checks.
          </p>
        </div>

        {/* Faux document preview */}
        <div className="relative">
          <div className="absolute inset-2 bg-white/5 rounded-2xl blur-xl" aria-hidden />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 text-slate-900 transform rotate-1 hover:rotate-0 transition-transform">
            <p className="text-center text-sm font-black tracking-[0.05em] uppercase text-slate-900 mb-1">SHAIBU YAHAYA</p>
            <p className="text-center text-[10px] text-slate-500 mb-4">Cape Coast, Ghana · pshaibu15@gmail.com</p>

            <p className="text-[9px] font-black tracking-[0.18em] text-center uppercase border-b border-slate-300 pb-1 mb-2 text-slate-900">EDUCATION</p>
            <div className="text-[10px] text-slate-700 mb-3">
              <p className="font-bold">University of Cape Coast</p>
              <p className="italic">Bachelor of Arts — Economics</p>
              <p className="text-slate-500">GPA: 3.8/4.0 · May 2015</p>
            </div>

            <p className="text-[9px] font-black tracking-[0.18em] text-center uppercase border-b border-slate-300 pb-1 mb-2 text-slate-900">WORK EXPERIENCE</p>
            <div className="text-[10px] text-slate-700">
              <p className="font-bold">University of Cape Coast</p>
              <p className="italic">Teaching Assistant — Sep 2015 to Jul 2016</p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-slate-600">
                <li>Taught undergraduate Economics</li>
                <li>Marked quizzes + final exam scripts</li>
              </ul>
            </div>
          </div>

          {/* Decorative floating section icons */}
          <FloatingIcon icon={<GraduationCap size={14} />} className="-top-3 -left-3 bg-blue-500" />
          <FloatingIcon icon={<Briefcase   size={14} />} className="top-1/3 -right-3 bg-emerald-500" delay="0.5s" />
          <FloatingIcon icon={<Award       size={14} />} className="bottom-4 -left-4 bg-amber-500" delay="1s" />
          <FloatingIcon icon={<Languages   size={14} />} className="-bottom-3 right-1/4 bg-violet-500" delay="1.5s" />
        </div>
      </div>
    </div>
  );
}

function FloatingIcon({ icon, className, delay }: { icon: React.ReactNode; className: string; delay?: string }) {
  return (
    <div
      className={`absolute w-9 h-9 rounded-2xl text-white shadow-lg flex items-center justify-center animate-pulse ${className}`}
      style={{ animationDuration: "3s", animationDelay: delay ?? "0s" }}
      aria-hidden
    >
      {icon}
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex sm:block items-start gap-3">
      <p className="text-3xl sm:text-4xl font-black bg-gradient-to-br from-blue-300 to-blue-500 bg-clip-text text-transparent mb-1 sm:mb-2 leading-none">{n}</p>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-black text-white mb-0.5">{title}</p>
        <p className="text-[12px] text-white/60 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

