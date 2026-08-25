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
  ArrowRight, FileText, Wrench, RefreshCw,
  Eye, ShieldCheck, History, Lock, Bot, PenLine,
  GraduationCap, Briefcase, Award, Languages,
} from "lucide-react";
import CvStudioFooter from "../components/cv/CvStudioFooter";
import { AppHeader } from "../components/AppHeader";
import { Card } from "../components/ui/Card";
import { Eyebrow } from "../components/ui/Eyebrow";
import { IconChip } from "../components/ui/IconChip";

const TRUST = [
  { icon: <Eye size={16} />,        title: "Preview free",          body: "See the first portion of every generated CV before you spend a token." },
  { icon: <ShieldCheck size={16} />, title: "Passes AI detection",   body: "Tuned to write in a real researcher's voice — terse, factual, varied. Not the patterns detectors flag." },
  { icon: <Lock size={16} />,        title: "Yours forever",         body: "Once unlocked, your CV is downloadable as Markdown and saved in your history." },
];

export default function CvStudioPage() {
  return (
    <div className="min-h-screen bg-surface text-slate-900 antialiased flex flex-col">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <AppHeader
        title="Academic CV Studio"
        subtitle="Three AI tools to polish, build, or convert your academic CV"
        backTo="/app"
        backLabel="Back to dashboard"
        maxWidth="max-w-6xl"
        action={
          <Link
            to="/app/cv-studio/history"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <History size={13} /> History
          </Link>
        }
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative max-w-5xl mx-auto px-5 pt-14 sm:pt-20 pb-10 sm:pb-14 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white border border-slate-200/70 shadow-sm mb-7">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary-500 opacity-75 animate-ping motion-reduce:animate-none" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-600" />
          </span>
          <Eyebrow className="text-slate-700">CV Studio · New</Eyebrow>
        </div>

        <h2 className="text-[44px] sm:text-6xl font-black tracking-tight text-slate-900 mb-5 leading-[0.95]">
          The CV gatekeepers
          <br />
          <span className="text-primary-600">actually respect.</span>
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
            chip="500 tokens"
            title="Review & revamp"
            blurb="Drop in your current academic CV. We point at what's weak, then rewrite it sharper."
            sample={[
              { icon: <Eye size={11} />,        label: "10-bullet critique" },
              { icon: <PenLine size={11} />,      label: "Full rewrite" },
              { icon: <ShieldCheck size={11} />, label: "AI-detector safe" },
            ]}
          />
          {/* Builder */}
          <ToolTile
            to="/app/cv-studio/build"
            icon={<Wrench size={20} />}
            chip="800 tokens"
            title="Build from scratch"
            blurb="A guided intake produces a polished CV in the standard template."
          />
          {/* Converter */}
          <ToolTile
            to="/app/cv-studio/convert"
            icon={<FileText size={20} />}
            chip="800 tokens"
            title="Pro → Academic"
            blurb="Industry CV in, academic format out — research up front, jargon out."
          />

          {/* Wide row spanning 3 columns — sample document strip */}
          <SampleDocumentStrip />
        </section>

        {/* ── Trust strip ─────────────────────────────────────────── */}
        <section className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TRUST.map((t) => (
            <Card key={t.title} pad="md">
              <div className="flex items-start gap-3">
                <IconChip icon={t.icon} tint="primary" size="md" />
                <div className="min-w-0">
                  <p className="text-[14px] font-black text-slate-900 mb-1">{t.title}</p>
                  <p className="text-[12px] text-slate-600 leading-relaxed">{t.body}</p>
                </div>
              </div>
            </Card>
          ))}
        </section>

        {/* ── How it works ───────────────────────────────────────── */}
        <Card tone="dark" decor pad="none" className="mt-8 p-7 sm:p-9">
          <Eyebrow tone="light" className="mb-3">How it works</Eyebrow>
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-5 max-w-xl leading-tight">Four steps from "blank page" to "ready to send".</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-3">
            <Step n="1" title="Submit"     body="Drag-drop a PDF or .docx, paste text, or fill the guided form." />
            <Step n="2" title="Generate"   body="The AI writes the full document in seconds." />
            <Step n="3" title="Preview"    body="Read the first portion. Decide if you want the rest." />
            <Step n="4" title="Unlock"     body="Spend tokens to read + download the complete CV." />
          </div>
        </Card>
      </main>

      <CvStudioFooter />
    </div>
  );
}

// ── Hero tile (spans 2 cols on desktop, ~28rem tall) ─────────────────
function ToolHeroTile({
  to, icon, chip, title, blurb, sample,
}: {
  to:     string;
  icon:   React.ReactNode;
  chip:   string;
  title:  string;
  blurb:  string;
  sample: { icon: React.ReactNode; label: string }[];
}) {
  return (
    <Link
      to={to}
      className="group relative md:col-span-2 md:row-span-2 bg-ink text-white rounded-card-lg overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all p-8 flex flex-col"
    >
      {/* Signature ring + orb decor */}
      <div aria-hidden className="absolute -right-8 -top-10 w-36 h-36 rounded-full border-[18px] border-primary-500/20" />
      <div aria-hidden className="absolute -right-6 top-8 w-48 h-48 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.15),transparent_70%)]" />

      <div className="relative flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-eyebrow text-white bg-white/10 border border-white/15 rounded-full px-2.5 py-1">
            {chip}
          </span>
          <IconChip icon={icon} tint="white" size="lg" />
        </div>

        <h3 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight leading-[1.05]">{title}</h3>
        <p className="text-[15px] text-white/70 leading-relaxed flex-1 max-w-md">{blurb}</p>

        {/* Sample chips — concrete deliverables. Reads as "here's what you actually get." */}
        <div className="flex flex-wrap gap-2 mt-6">
          {sample.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white text-[12px] font-bold">
              <span className="text-white/60">{s.icon}</span>
              {s.label}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-[14px] font-bold text-white mt-7 group-hover:gap-2.5 transition-all">
          Start <ArrowRight size={14} />
        </div>
      </div>
    </Link>
  );
}

// ── Compact tile (right column on desktop) ───────────────────────────
function ToolTile({
  to, icon, chip, title, blurb,
}: {
  to:     string;
  icon:   React.ReactNode;
  chip:   string;
  title:  string;
  blurb:  string;
}) {
  return (
    <Link
      to={to}
      className="group relative bg-white rounded-card border border-slate-200/70 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all overflow-hidden p-6 flex flex-col"
    >
      <div className="flex items-center justify-between mb-5">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-eyebrow text-primary-700 bg-primary-50 border border-primary-200 rounded-full px-2.5 py-1">
          {chip}
        </span>
        <IconChip icon={icon} tint="primary" size="lg" />
      </div>
      <h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight leading-tight">{title}</h3>
      <p className="text-[13px] text-slate-600 leading-relaxed flex-1">{blurb}</p>
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-primary-600 mt-4 group-hover:gap-2 transition-all">
        Open <ArrowRight size={13} />
      </div>
    </Link>
  );
}

// ── Wide row — visual sample of what the output looks like ───────────
function SampleDocumentStrip() {
  return (
    <Card tone="dark" decor pad="none" className="md:col-span-3 p-7 sm:p-9">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-semibold uppercase tracking-eyebrow text-white/80 mb-4">
            <Bot size={11} /> What you'll get
          </span>
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight mb-3">
            A document that reads like <span className="text-primary-300">a real researcher</span> wrote it.
          </h3>
          <p className="text-[14px] text-white/70 leading-relaxed">
            Section headers, formatting, and bullet structure that academic readers expect. No marketing language. No "passionate about" filler. Built to pass GPTZero, Originality.ai, and Turnitin's AI checks.
          </p>
        </div>

        {/* Faux document preview */}
        <div className="relative">
          <div className="absolute inset-2 bg-primary-500/10 rounded-card blur-xl" aria-hidden />
          <div className="relative bg-white rounded-card shadow-card-hover p-5 text-slate-900 transform rotate-1 hover:rotate-0 transition-transform">
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
          <FloatingIcon icon={<GraduationCap size={14} />} className="-top-3 -left-3" />
          <FloatingIcon icon={<Briefcase   size={14} />} className="top-1/3 -right-3" />
          <FloatingIcon icon={<Award       size={14} />} className="bottom-4 -left-4" />
          <FloatingIcon icon={<Languages   size={14} />} className="-bottom-3 right-1/4" />
        </div>
      </div>
    </Card>
  );
}

function FloatingIcon({ icon, className }: { icon: React.ReactNode; className: string }) {
  return (
    <div
      className={`absolute w-9 h-9 rounded-full bg-primary-600 text-white shadow-glow flex items-center justify-center ${className}`}
      aria-hidden
    >
      {icon}
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex sm:block items-start gap-3">
      <p className="text-3xl sm:text-4xl font-black text-primary-400 mb-1 sm:mb-2 leading-none">{n}</p>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-black text-white mb-0.5">{title}</p>
        <p className="text-[12px] text-white/60 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
