import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Compass,
  FolderOpen,
  GraduationCap,
  Home,
  Map,
  Mic,
  UserRound,
  Wallet,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { Reveal } from "../components/Reveal";
import { useAuth } from "../hooks/useAuth";

// ─────────────────────────────────────────────────────────────────────────────
// LandingPage — marketing front door for the Sleek redesign.
//
// Concept: show the real product, say little. The hero holds real campus
// photography plus a CSS-built phone mock of the actual Home tab; below it,
// just three photo steps, the Officer Anna spotlight, and pricing. Dark ink
// is reserved for the spotlight and the token-pack card. Kept deliberately
// sparse after user feedback that the first draft carried too much copy.
//
// Deliberately framer-motion-free (first-paint budget): scroll reveals use the
// IntersectionObserver-based <Reveal>. All CTAs are auth-aware.
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared CTA pill recipes (kept local; this page owns its own buttons) ────
const PILL =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold leading-none transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2";
const PILL_PRIMARY = `${PILL} bg-primary-500 text-white hover:bg-primary-600 shadow-glow`;
const PILL_DARK = `${PILL} bg-ink text-white hover:bg-slate-800`;
const PILL_OUTLINE = `${PILL} bg-white border border-slate-200 text-slate-900 hover:border-slate-300 hover:bg-slate-50`;

// Eyebrow label with the signature primary dot.
function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p
      className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-eyebrow ${
        light ? "text-white/60" : "text-slate-500"
      }`}
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-primary-500" />
      {children}
    </p>
  );
}

// The navy card's signature ring decoration.
function RingDecor({ className = "-right-8 -top-10" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`absolute h-36 w-36 rounded-full border-[18px] border-primary-500/20 ${className}`}
    />
  );
}

// ── Photography (every URL below was visually verified in the browser before
//    shipping — Unsplash captions lie, so never swap these without re-checking).
const PHOTOS = {
  campus: {
    src: "https://images.unsplash.com/photo-1607237138185-eedd9c632b0b?auto=format&fit=crop&w=1600&q=80",
    alt: "Red-brick university hall overlooking a wide campus lawn on a sunny day",
  },
  studying: {
    src: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80",
    alt: "Three students laughing together while working on laptops at a shared table",
  },
  graduation: {
    src: "https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=900&q=80",
    alt: "Graduate in cap and gown facing the crowd at a graduation ceremony",
  },
  takeoff: {
    src: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80",
    alt: "Airplane wing above the clouds at sunset, seen from a window seat",
  },
} as const;

export default function LandingPage() {
  const { user } = useAuth();
  const roadmapHref = user ? "/app/roadmap" : "/signup?next=/app/roadmap/onboarding";
  const simulatorHref = user ? "/app/visa-interview" : "/signup?next=/app/visa-interview";
  const year = new Date().getFullYear();

  return (
    <div className="cr-landing min-h-screen bg-surface text-slate-900 antialiased selection:bg-primary-500 selection:text-white">
      {/* Listening-bar equalizer keyframes for the simulator mock. */}
      <style>{`
        @keyframes crEq { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
        .cr-eq-bar { transform-origin: center; animation: crEq 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cr-eq-bar { animation: none; transform: scaleY(0.6); }
        }
      `}</style>

      {/* ── Floating glass pill navbar ─────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full border border-slate-200/70 bg-white/85 px-4 shadow-card backdrop-blur-xl sm:px-5">
          <BrandLogo size="sm" />
          <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
            <a href="#how-it-works" className="text-sm font-bold text-slate-500 transition-colors hover:text-slate-900">How it works</a>
            <a href="#interview" className="text-sm font-bold text-slate-500 transition-colors hover:text-slate-900">Visa practice</a>
            <a href="#pricing" className="text-sm font-bold text-slate-500 transition-colors hover:text-slate-900">Pricing</a>
            <Link to="/faq" className="text-sm font-bold text-slate-500 transition-colors hover:text-slate-900">FAQ</Link>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {user ? (
              <Link to="/app" className={`${PILL_DARK} px-5 py-2.5 text-sm`}>Dashboard</Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="whitespace-nowrap px-1.5 py-2 text-sm font-bold text-slate-600 transition-colors hover:text-slate-900 sm:px-2.5"
                >
                  Log in
                </Link>
                <Link to={roadmapHref} className={`${PILL_PRIMARY} whitespace-nowrap px-5 py-2.5 text-sm`}>
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero: type left, live product mock right ─────────────────── */}
        <section className="relative overflow-hidden px-5 pb-16 pt-28 sm:pt-36 lg:pb-24">
          {/* Soft primary-tinted background field */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-32 top-10 h-[420px] w-[420px] rounded-full bg-primary-200/40 blur-[120px]" />
            <div className="absolute -right-40 top-64 h-[460px] w-[460px] rounded-full bg-sky-200/50 blur-[130px]" />
            <div className="absolute right-[10%] top-20 hidden h-40 w-40 rounded-full border-[16px] border-primary-500/10 lg:block" />
          </div>

          <div className="relative mx-auto grid max-w-5xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
            {/* Copy column */}
            <div className="text-center lg:text-left">
              <Reveal>
                <p className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-slate-200/70 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 shadow-sm">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-primary-500 shadow-[0_0_0_4px_rgba(59,130,246,0.15)]" />
                  Study abroad, end to end
                </p>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="text-[clamp(2.9rem,7.2vw,5.2rem)] font-black leading-[0.98] tracking-tight text-slate-950">
                  Find your school.
                  <br />
                  <span className="relative inline-block text-primary-600">
                    Ace your visa.
                    <svg aria-hidden viewBox="0 0 120 12" preserveAspectRatio="none" className="absolute -bottom-2.5 left-0 h-3 w-full text-primary-300" fill="none">
                      <path d="M3 9c30-6 84-6 114-3" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                    </svg>
                  </span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mx-auto mt-7 max-w-md text-[15px] font-medium leading-7 text-slate-500 sm:text-lg lg:mx-0">
                  AI matching for 6,000+ US schools, a personal roadmap, and live
                  visa practice — one app.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                  <Link to={roadmapHref} className={`${PILL_PRIMARY} w-full px-7 py-3.5 text-[15px] sm:w-auto`}>
                    Build my plan <ArrowRight size={16} aria-hidden />
                  </Link>
                  <Link to={simulatorHref} className={`${PILL_OUTLINE} w-full px-7 py-3.5 text-[15px] sm:w-auto`}>
                    <Mic size={15} aria-hidden /> Practice the interview
                  </Link>
                </div>
                <div className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-400 sm:text-sm lg:justify-start">
                  <span className="inline-flex items-center gap-1.5"><Check size={14} aria-hidden className="text-primary-500" /> 200 free tokens</span>
                  <span className="inline-flex items-center gap-1.5"><Check size={14} aria-hidden className="text-primary-500" /> No subscription</span>
                  <span className="inline-flex items-center gap-1.5"><Check size={14} aria-hidden className="text-primary-500" /> Verified schools</span>
                </div>
              </Reveal>
            </div>

            {/* Hero visual — real campus photography with the Home tab mock
                overlapping it. Photo sits right; phone hangs bottom-left. */}
            <Reveal delay={200} className="relative mx-auto w-full max-w-[440px] pb-8 lg:max-w-none">
              {/* Campus photo card with ink scrim */}
              <div className="relative ml-auto h-[420px] w-[86%] overflow-hidden rounded-card-lg shadow-card-hover sm:h-[500px] sm:w-[82%]">
                <img
                  src={PHOTOS.campus.src}
                  srcSet={`${PHOTOS.campus.src.replace("w=1600", "w=640")} 640w, ${PHOTOS.campus.src.replace("w=1600", "w=1024")} 1024w, ${PHOTOS.campus.src} 1600w`}
                  sizes="(max-width: 640px) 90vw, (max-width: 1024px) 60vw, 640px"
                  alt={PHOTOS.campus.alt}
                  className="absolute inset-0 h-full w-full object-cover"
                  decoding="async"
                  fetchPriority="high"
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
                {/* Floating chip: directory proof */}
                <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-eyebrow text-white backdrop-blur-md">
                  <BadgeCheck size={12} aria-hidden />
                  6,000+ schools
                </span>
                {/* Floating card: match result */}
                <div className="absolute right-4 top-14 w-40 rounded-card bg-white p-3.5 shadow-card-hover sm:w-44">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-eyebrow text-primary-700">Target</span>
                    <span className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-black text-white">94%</span>
                  </div>
                  <p className="mt-2 text-xs font-black leading-snug text-slate-950">Arizona State University</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Strong fit · CS · aid likely</p>
                </div>
                {/* Floating card: visa readiness — sits on the scrim */}
                <div className="absolute bottom-4 right-4 w-40 rounded-card bg-white p-3.5 shadow-card-hover sm:w-44">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                      <Mic size={13} />
                    </span>
                    <p className="text-[11px] font-black leading-tight text-slate-950">F-1 readiness</p>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-[80%] rounded-full bg-primary-500" />
                    </div>
                    <span className="text-[11px] font-black text-slate-950">80%</span>
                  </div>
                </div>
              </div>

              {/* Phone frame — iPhone 16 Pro-style: titanium edge, Dynamic
                  Island, status bar — showing the actual Home tab rebuilt in
                  CSS, overlapping the photo's bottom-left corner */}
              <div className="absolute -bottom-4 left-0 w-[200px] rounded-[2.7rem] bg-ink p-[5px] shadow-pillnav ring-1 ring-slate-600/60 sm:w-[228px]">
                {/* Side buttons (decorative): action + volume left, power right */}
                <span aria-hidden className="absolute -left-[2px] top-[76px] h-5 w-[2px] rounded-l-full bg-slate-600" />
                <span aria-hidden className="absolute -left-[2px] top-[104px] h-9 w-[2px] rounded-l-full bg-slate-600" />
                <span aria-hidden className="absolute -right-[2px] top-[116px] h-14 w-[2px] rounded-r-full bg-slate-600" />
                {/* True iPhone proportions: ~19.5:9 screen, content fills top-down,
                    pill nav pinned to the bottom like the real app */}
                <div className="relative aspect-[9/19.2] overflow-hidden rounded-[2.4rem] bg-surface px-3 pb-14 pt-2">
                  {/* Status bar: time · Dynamic Island · battery */}
                  <div className="mb-2 flex items-center justify-between px-1" aria-hidden>
                    <span className="w-8 text-[8px] font-bold tabular-nums text-slate-900">9:41</span>
                    <span className="h-[18px] w-16 rounded-full bg-black" />
                    <span className="flex w-8 justify-end">
                      <span className="flex h-[8px] w-[16px] items-center rounded-[3px] border border-slate-400 px-[1.5px]">
                        <span className="h-[4px] w-[9px] rounded-[1px] bg-slate-700" />
                      </span>
                    </span>
                  </div>
                  {/* Home tab header */}
                  <p className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-eyebrow text-slate-500">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                    Your study journey
                  </p>
                  <p className="mt-1 text-base font-black tracking-tight text-slate-950">Hi, Amara 👋</p>

                  {/* Navy progress card */}
                  <div className="relative mt-2.5 overflow-hidden rounded-2xl bg-ink p-3">
                    <div aria-hidden className="absolute -right-5 -top-7 h-20 w-20 rounded-full border-[10px] border-primary-500/20" />
                    <p className="text-[8px] font-semibold uppercase tracking-eyebrow text-white/60">Current stage</p>
                    <div className="mt-1 flex items-end justify-between gap-2">
                      <p className="text-[11px] font-black leading-tight text-white">Shortlisting schools</p>
                      <p className="text-sm font-black leading-none text-white">45%</p>
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-[45%] rounded-full bg-primary-500" />
                    </div>
                    <span className={`${PILL_PRIMARY} mt-2.5 px-3 py-1.5 text-[9px]`}>
                      Continue prep <ArrowRight size={9} aria-hidden />
                    </span>
                  </div>

                  {/* Quick stat tiles */}
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-white p-2.5 shadow-card">
                      <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                        <GraduationCap size={11} />
                      </span>
                      <p className="mt-1.5 text-sm font-black leading-none text-slate-950">12</p>
                      <p className="mt-0.5 text-[8px] font-semibold text-slate-500">AI matches</p>
                    </div>
                    <div className="rounded-2xl bg-white p-2.5 shadow-card">
                      <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                        <Wallet size={11} />
                      </span>
                      <p className="mt-1.5 text-sm font-black leading-none text-slate-950">200</p>
                      <p className="mt-0.5 text-[8px] font-semibold text-slate-500">Tokens</p>
                    </div>
                  </div>

                  {/* Practice-interview row — fills the true-scale screen */}
                  <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-primary-500 p-2.5 text-white shadow-glow">
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                      <Mic size={11} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black leading-tight">Practice visa interview</p>
                      <p className="text-[7px] font-semibold text-white/75">Live with Officer Anna</p>
                    </div>
                    <ArrowRight size={11} aria-hidden className="shrink-0" />
                  </div>

                  {/* Saved-school teaser row */}
                  <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white p-2.5 shadow-card">
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-[8px] font-black text-primary-600">
                      AS
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[9px] font-black text-slate-950">Arizona State University</p>
                      <p className="text-[7px] font-semibold text-slate-500">Saved · Target · 94% match</p>
                    </div>
                  </div>

                  {/* Floating navy pill bottom nav — Home active */}
                  <div className="absolute bottom-3 left-1/2 flex w-[84%] -translate-x-1/2 items-center justify-between rounded-full bg-ink px-4 py-2.5 shadow-pillnav">
                    <span aria-hidden className="flex flex-col items-center gap-0.5 text-white">
                      <Home size={13} />
                      <span className="h-1 w-1 rounded-full bg-primary-500" />
                    </span>
                    <span aria-hidden className="text-white/40"><Compass size={13} /></span>
                    <span aria-hidden className="text-white/40"><FolderOpen size={13} /></span>
                    <span aria-hidden className="text-white/40"><UserRound size={13} /></span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section id="how-it-works" className="scroll-mt-24 px-5 pt-6 sm:pt-12">
          <div className="mx-auto max-w-5xl">
            <Reveal className="max-w-xl">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Three steps. One journey.
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                {
                  num: "01",
                  icon: GraduationCap,
                  title: "Get matched",
                  body: "AI sorts 6,000+ US schools into reach, target, and safety for you.",
                  photo: PHOTOS.studying,
                  chip: "94% match found",
                },
                {
                  num: "02",
                  icon: Map,
                  title: "Follow your roadmap",
                  body: "One six-stage plan tracks every deadline and document.",
                  photo: PHOTOS.graduation,
                  chip: "Stage 4 · Admissions",
                },
                {
                  num: "03",
                  icon: Mic,
                  title: "Rehearse the visa",
                  body: "Sit a live mock F-1 interview and get a scored report.",
                  photo: PHOTOS.takeoff,
                  chip: "F-1 readiness 80%",
                },
              ].map((step, i) => (
                <Reveal key={step.num} delay={i * 90}>
                  <div className="h-full rounded-card bg-white p-3 pb-6 shadow-card transition-shadow hover:shadow-card-hover">
                    {/* Photo header with product chip */}
                    <div className="relative h-36 overflow-hidden rounded-2xl">
                      <img
                        src={step.photo.src}
                        alt={step.photo.alt}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black text-slate-900 shadow-card">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                        {step.chip}
                      </span>
                    </div>
                    <div className="px-3">
                      <div className="mt-4 flex items-center justify-between">
                        <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                          <step.icon size={19} />
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-slate-400">Step {step.num}</span>
                      </div>
                      <h3 className="mt-4 text-lg font-black tracking-tight text-slate-950">{step.title}</h3>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{step.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Officer Anna spotlight ───────────────────────────────────── */}
        <section id="interview" className="scroll-mt-24 px-5 pt-20 sm:pt-28">
          <Reveal className="mx-auto max-w-5xl">
            <div className="relative overflow-hidden rounded-card-lg bg-ink px-6 py-10 sm:px-10 sm:py-14">
              <RingDecor />
              <RingDecor className="-bottom-16 -left-12" />
              <div className="relative grid items-center gap-10 md:grid-cols-2">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-eyebrow text-rose-300">
                    <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                    Live simulation
                  </span>
                  <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Meet Officer Anna, your AI visa officer.
                  </h2>
                  <ul className="mt-6 space-y-3">
                    {[
                      "Live questions that adapt to your answers",
                      "Scored report out of 100 with fixes",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm font-semibold text-white/85">
                        <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
                          <Check size={11} strokeWidth={3.5} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link to={simulatorHref} className={`${PILL_PRIMARY} mt-8 w-full px-7 py-3.5 text-[15px] sm:w-auto`}>
                    Start a practice interview <ArrowRight size={16} aria-hidden />
                  </Link>
                </div>

                {/* Simulator mock — real photo of the AI officer */}
                <div className="rounded-card border border-white/10 bg-white/5 p-4 sm:p-5">
                  <div className="relative h-44 overflow-hidden rounded-2xl sm:h-52">
                    <img
                      src="/anna.webp"
                      alt="Officer Anna, the AI visa interview officer"
                      className="absolute inset-0 h-full w-full object-cover object-top"
                      loading="lazy"
                      decoding="async"
                    />
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-black text-rose-200 backdrop-blur-md">
                      <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                      REC
                    </span>
                    <div className="absolute bottom-3 left-3">
                      <p className="text-sm font-black text-white">Officer Anna</p>
                      <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-white/70">F-1 interview · live</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-ink/60 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-white/45">Example question</p>
                    <p className="mt-2 text-sm font-bold leading-6 text-white">
                      "Your sponsor's income seems modest for these tuition fees. How
                      exactly will your family fund all four years?"
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-3">
                    <div aria-hidden className="flex h-8 items-center gap-1">
                      {[0.9, 0.55, 1, 0.4, 0.75].map((h, i) => (
                        <span
                          key={i}
                          className="cr-eq-bar w-1 rounded-full bg-primary-400"
                          style={{ height: `${h * 100}%`, animationDelay: `${i * 0.14}s` }}
                        />
                      ))}
                    </div>
                    <p className="text-xs font-bold text-white/60">Listening to your answer…</p>
                  </div>
                </div>
              </div>
              <p className="relative mt-8 text-center text-[11px] font-medium text-white/40">
                Practice simulation only — not legal advice or an official government service.
              </p>
            </div>
          </Reveal>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────────── */}
        <section id="pricing" className="scroll-mt-24 px-5 pb-20 pt-20 sm:pb-28 sm:pt-28">
          <div className="mx-auto max-w-5xl">
            <Reveal className="max-w-xl">
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Start free. Pay as you go.
              </h2>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-500 sm:text-base">
                No subscription — tokens only, spent when you use them.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <Reveal>
                <div className="flex h-full flex-col rounded-card bg-white p-7 shadow-card">
                  <Eyebrow>Free to begin</Eyebrow>
                  <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">₵0 to start</p>
                  <ul className="mt-5 flex-1 space-y-3">
                    {[
                      "200 tokens the moment you sign up",
                      "Roadmap and school directory, free forever",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm font-semibold text-slate-700">
                        <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                          <Check size={11} strokeWidth={3.5} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link to={roadmapHref} className={`${PILL_OUTLINE} mt-7 w-full px-7 py-3.5 text-sm`}>
                    Create a free account
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <div className="relative flex h-full flex-col overflow-hidden rounded-card bg-ink p-7">
                  <RingDecor />
                  <div className="relative flex h-full flex-col">
                    <Eyebrow light>Token packs</Eyebrow>
                    <p className="mt-3 text-2xl font-black tracking-tight text-white">Top up when you need more</p>
                    <ul className="mt-5 flex-1 space-y-3">
                      {[
                        "Full match reports and live interviews",
                        "Tokens never expire — no monthly fee",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-sm font-semibold text-white/85">
                          <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
                            <Check size={11} strokeWidth={3.5} />
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link to="/pricing" className={`${PILL_PRIMARY} mt-7 w-full px-7 py-3.5 text-sm`}>
                      See token pricing <ArrowRight size={15} aria-hidden />
                    </Link>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200/70 bg-white px-5 pb-10 pt-14">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div className="max-w-xs">
              <BrandLogo size="md" />
              <p className="mt-4 text-sm font-medium leading-6 text-slate-500">
                Matching, roadmap, CV, and visa practice — in one app.
              </p>
            </div>
            <nav className="grid grid-cols-2 gap-10 sm:gap-16" aria-label="Footer">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-slate-400">Product</p>
                <ul className="mt-4 space-y-2.5 text-sm font-bold text-slate-600">
                  <li><a href="#how-it-works" className="transition-colors hover:text-slate-900">How it works</a></li>
                  <li><a href="#interview" className="transition-colors hover:text-slate-900">Visa practice</a></li>
                  <li><Link to="/schools" className="transition-colors hover:text-slate-900">School directory</Link></li>
                  <li><Link to="/pricing" className="transition-colors hover:text-slate-900">Pricing</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-slate-400">Company</p>
                <ul className="mt-4 space-y-2.5 text-sm font-bold text-slate-600">
                  <li><Link to="/faq" className="transition-colors hover:text-slate-900">FAQ</Link></li>
                  <li><Link to="/contact" className="transition-colors hover:text-slate-900">Contact</Link></li>
                  <li><Link to="/privacy" className="transition-colors hover:text-slate-900">Privacy</Link></li>
                  <li><Link to="/terms" className="transition-colors hover:text-slate-900">Terms</Link></li>
                </ul>
              </div>
            </nav>
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-slate-100 pt-6 text-xs font-medium text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <p>© {year} CollegeReady. All rights reserved.</p>
            <p>Interview practice is a simulation only — not legal advice or an official government service.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
