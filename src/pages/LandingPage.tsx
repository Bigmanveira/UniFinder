import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  GraduationCap,
  Mic,
  PlaneTakeoff,
  Route,
  ShieldCheck,
  Video,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import BrandLogo from "../components/BrandLogo";
import { Reveal } from "../components/Reveal";

export default function LandingPage() {
  const { user } = useAuth();
  const roadmapHref = user ? "/app/roadmap" : "/signup?next=/app/roadmap/onboarding";
  const simulatorHref = user ? "/app/visa-interview" : "/signup?next=/app/visa-interview";

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (window.scrollY < 50 && window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="cr-landing min-h-screen overflow-x-clip bg-[#f6f8fc] text-[#111827] selection:bg-[#3b82f6] selection:text-white">
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between rounded-2xl border border-white/70 bg-white/92 px-3 py-2.5 shadow-[0_14px_45px_rgba(17,24,39,0.1)] backdrop-blur-xl sm:rounded-full sm:px-5 sm:py-3">
          <div className="sm:hidden">
            <span className="hidden min-[370px]:block"><BrandLogo size="sm" /></span>
            <span className="min-[370px]:hidden"><BrandLogo size="sm" iconOnly /></span>
          </div>
          <div className="hidden sm:block"><BrandLogo size="md" /></div>
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
            <a href="#how-it-works" className="landing-nav-link">How it works</a>
            <a href="#interview" className="landing-nav-link">Visa practice</a>
            <Link to="/pricing" className="landing-nav-link">Pricing</Link>
            <Link to="/faq" className="landing-nav-link">FAQ</Link>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-3">
            {user ? (
              <Link to="/app" className="landing-button landing-button-dark px-4 py-2.5 text-sm">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="whitespace-nowrap px-1 py-2 text-sm font-bold text-[#101827] transition-colors hover:text-[#3156d9] sm:px-2">
                  Log in
                </Link>
                <Link to={roadmapHref} className="landing-button landing-button-dark whitespace-nowrap py-2 pl-4 pr-4 text-sm sm:pr-2">
                  <span>Start free</span>
                  <span className="landing-button-icon landing-button-icon-light hidden sm:inline-flex"><ArrowRight size={14} /></span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="px-3 pb-4 pt-24 sm:px-5 sm:pb-7 sm:pt-28 lg:pt-32">
          <div className="landing-hero-stage relative mx-auto max-w-[1460px] overflow-hidden rounded-[1.6rem] bg-[#101827] text-white shadow-[0_32px_90px_rgba(17,24,39,0.18)] sm:rounded-[2.5rem]">
            <div className="landing-hero-glow absolute -left-24 -top-40 h-[440px] w-[440px] rounded-full bg-[#3156d9]/35 blur-[110px]" />
            <div className="landing-dark-grid absolute inset-0 hidden opacity-15 lg:block" />
            <div className="relative grid items-stretch lg:grid-cols-[0.92fr_1.08fr]">
              <div className="landing-hero-copy flex flex-col justify-center px-6 py-12 text-center sm:px-10 sm:py-16 lg:min-h-[650px] lg:px-16 lg:text-left xl:px-20">
                <div className="mx-auto mb-6 inline-flex items-center gap-2.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a9c8ff] lg:mx-0">
                  <span className="h-2 w-2 rounded-full bg-[#60a5fa] shadow-[0_0_0_5px_rgba(96,165,250,0.12)]" />
                  Your study abroad plan
                </div>
                <h1 className="font-display text-[clamp(3rem,6vw,6.5rem)] font-medium leading-[0.91] tracking-[-0.06em] text-white">
                  From shortlist
                  <span className="block text-[#8fa0ff]">to takeoff.</span>
                </h1>
                <p className="mx-auto mt-6 max-w-md text-[15px] font-medium leading-7 text-white/62 sm:text-lg lg:mx-0">
                  Match schools, organise applications, plan funding, and prepare for your visa in one place.
                </p>

                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                  <Link to={roadmapHref} className="landing-button landing-button-primary w-full py-2 pl-6 pr-2 text-[15px] sm:w-auto">
                    <span>Build my plan</span>
                    <span className="landing-button-icon"><ArrowRight size={16} /></span>
                  </Link>
                  <Link to={simulatorHref} className="landing-button landing-button-ghost hidden px-6 py-4 text-[15px] sm:inline-flex">
                    Practice the interview <Mic size={16} />
                  </Link>
                </div>

                <div className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-semibold text-white/48 sm:text-sm lg:justify-start">
                  <TrustItem text="200 free tokens" />
                  <TrustItem text="No subscription" />
                  <span className="hidden sm:inline-flex"><TrustItem text="Verified programmes" /></span>
                </div>
              </div>

              <div className="landing-hero-visual hidden lg:block">
                <HeroCampusVisual />
              </div>
            </div>
          </div>
        </section>

        <section className="px-3 py-5 text-[#111827] sm:px-6 sm:py-8">
          <div className="landing-proof-panel mx-auto max-w-7xl overflow-hidden rounded-[1.35rem] border border-[#111827]/8 bg-white shadow-[0_14px_40px_rgba(17,24,39,0.05)] sm:rounded-[1.75rem]">
            <div className="landing-proof-grid grid grid-cols-2 sm:grid-cols-4">
              <ProofPoint icon={<ShieldCheck size={17} />} label="Accredited data" />
              <ProofPoint icon={<CircleDollarSign size={17} />} label="Funding-aware" />
              <ProofPoint icon={<Route size={17} />} label="Roadmap included" />
              <ProofPoint icon={<Video size={17} />} label="Live visa practice" />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <Reveal className="mx-auto mb-10 max-w-4xl text-center sm:mb-14">
              <p className="font-utility text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5061d9]">
                One connected journey
              </p>
              <h2 className="mt-4 font-display text-[2.6rem] font-medium leading-[0.96] tracking-[-0.05em] text-[#111827] sm:text-6xl lg:text-7xl">
                Every next step,<br className="hidden sm:block" /> already in view.
              </h2>
            </Reveal>

            <div className="landing-card-stack grid gap-4 sm:gap-5 lg:grid-cols-12">
              <Reveal className="landing-stack-card landing-stack-card-1 lg:col-span-7">
                <ProductCard
                  label="Match"
                  title="Choose with evidence."
                  body="Verified schools that fit your academics, budget, and goals."
                  visual={<MatchEvidenceVisual />}
                  className="bg-white sm:min-h-[500px]"
                />
              </Reveal>
              <Reveal delay={80} className="landing-stack-card landing-stack-card-2 lg:col-span-5">
                <ProductCard
                  label="Plan"
                  title="Know what comes next."
                  body="Deadlines, funding, documents, and next steps in one practical view."
                  visual={<RoadmapVisual />}
                  className="bg-[#93c5fd] sm:min-h-[500px]"
                />
              </Reveal>
              <Reveal delay={120} className="landing-stack-card landing-stack-card-3 lg:col-span-12">
                <ProductCard
                  label="Rehearse"
                  title="Practice the pressure, not a script."
                  body="Answer out loud, get scored, and strengthen weak answers before the real interview."
                  visual={<InterviewPreviewVisual />}
                  className="bg-[#171819] text-white lg:grid lg:grid-cols-[0.74fr_1.26fr] lg:items-center"
                  horizontal
                />
              </Reveal>
            </div>
          </div>
        </section>

        <section id="interview" className="scroll-mt-24 px-3 pb-16 sm:px-5 sm:pb-24">
          <div className="relative mx-auto max-w-[1460px] overflow-hidden rounded-[1.6rem] bg-[#171819] text-white shadow-[0_30px_78px_rgba(16,24,39,0.2)] sm:rounded-[2.5rem]">
            <div className="landing-dark-grid absolute inset-0 opacity-20" />
            <div className="absolute -bottom-44 -left-24 h-[420px] w-[420px] rounded-full bg-[#5061d9]/45 blur-[110px]" />
            <div className="relative grid lg:grid-cols-[0.92fr_1.08fr]">
              <Reveal className="order-2 min-h-[360px] sm:min-h-[460px] lg:order-1">
                <VisaRoom />
              </Reveal>
              <Reveal delay={100} className="order-1 flex items-center px-6 py-12 sm:px-12 lg:order-2 lg:px-16 lg:py-20">
                <div className="max-w-xl">
                  <p className="mb-5 font-utility text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9db2ff]">
                    F-1 interview simulator
                  </p>
                  <h2 className="font-display text-4xl font-medium leading-[0.96] tracking-[-0.05em] sm:text-6xl">
                    Walk in ready.<br />Speak with clarity.
                  </h2>
                  <p className="mt-6 max-w-lg text-base font-medium leading-7 text-white/65 sm:text-lg">
                    A simulated officer listens, follows up, and shows you what weakens your case.
                  </p>
                  <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-3">
                    <VisaFeature icon={<Video size={16} />} text="Live conversation" />
                    <VisaFeature icon={<FileCheck2 size={16} />} text="Document-aware" />
                    <VisaFeature icon={<BarChart3 size={16} />} text="Scored feedback" />
                  </div>
                  <Link to={simulatorHref} className="landing-button landing-button-primary mt-9 py-2 pl-6 pr-2 text-[15px]">
                    <span>Try the simulator</span>
                    <span className="landing-button-icon"><ArrowRight size={16} /></span>
                  </Link>
                  <p className="mt-4 text-xs font-medium text-white/40">
                    Practice only. Not affiliated with any government or consular service.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:items-end">
            <Reveal>
              <p className="font-utility text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5061d9]">Simple pricing</p>
              <h2 className="mt-5 font-display text-4xl font-medium leading-[0.96] tracking-[-0.05em] sm:text-6xl">
                Start free.<br />Pay as you go.
              </h2>
              <p className="mt-5 max-w-md text-base font-medium leading-7 text-[#657082]">
                No recurring plan. Use tokens only when you need them.
              </p>
            </Reveal>

            <Reveal delay={100} className="grid gap-4 sm:grid-cols-2">
              <PricingCard
                eyebrow="Included"
                title="200 free tokens"
                body="Build your roadmap and generate your first match reports before paying."
                tone="light"
              />
              <PricingCard
                eyebrow="Pay as you go"
                title="From $2"
                body="600 tokens to start. Larger packs are available when you need them."
                tone="dark"
                href="/pricing"
              />
            </Reveal>
          </div>
        </section>

        <section className="px-3 pb-3 sm:px-5 sm:pb-5">
          <Reveal className="landing-closing relative mx-auto grid max-w-[1460px] overflow-hidden rounded-[2rem] bg-[#101827] text-white sm:rounded-[2.75rem] lg:grid-cols-[0.86fr_1.14fr]">
            <div className="flex min-h-[380px] flex-col justify-between px-6 py-10 sm:min-h-[430px] sm:px-12 sm:py-14 lg:px-16">
              <div className="flex items-center justify-between gap-4">
                <p className="font-utility text-[10px] font-semibold uppercase tracking-[0.2em] text-[#93c5fd]">Your next move</p>
                <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[9px] font-bold text-white/50 sm:inline-flex"><Route size={12} /> Personalised route</span>
              </div>
              <div>
                <h2 className="max-w-2xl font-display text-4xl font-medium leading-[0.96] tracking-[-0.05em] sm:text-6xl">
                  Turn your shortlist into a route.
                </h2>
                <p className="mt-5 max-w-md text-sm font-semibold leading-6 text-white/50 sm:text-base">One plan for applications, funding, documents, and visa preparation.</p>
                <Link to={roadmapHref} className="landing-button landing-button-primary mt-8 py-2 pl-6 pr-2 text-[15px]">
                  <span>Build my roadmap</span>
                  <span className="landing-button-icon"><ArrowRight size={16} /></span>
                </Link>
              </div>
            </div>
            <div className="relative hidden min-h-[430px] items-center justify-center overflow-hidden bg-gradient-to-br from-[#1d4ed8] via-[#3b82f6] to-[#7dd3fc] p-12 sm:flex">
              <div className="landing-path-grid absolute inset-0 opacity-35" />
              <RoadmapBoardingPass />
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="bg-[#f3f4ef] px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 md:flex-row md:items-center md:justify-between">
          <BrandLogo size="sm" />
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-[#657082]" aria-label="Footer navigation">
            <Link to="/pricing" className="hover:text-[#3156d9]">Pricing</Link>
            <Link to="/faq" className="hover:text-[#3156d9]">FAQ</Link>
            <Link to="/privacy" className="hover:text-[#3156d9]">Privacy</Link>
            <Link to="/terms" className="hover:text-[#3156d9]">Terms</Link>
            <Link to="/contact" className="hover:text-[#3156d9]">Contact</Link>
          </nav>
          <p className="text-xs font-medium text-[#7a8492]">© 2026 CollegeReady</p>
        </div>
      </footer>
    </div>
  );
}

function TrustItem({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Check size={14} className="text-[#7dd3fc]" strokeWidth={3} /> {text}
    </span>
  );
}

function ProofPoint({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="landing-proof-point group relative flex min-h-[68px] items-center gap-2.5 px-3 py-3 text-left sm:min-h-0 sm:justify-center sm:px-5 sm:py-5 sm:text-center">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb] transition-colors duration-300 group-hover:bg-[#2563eb] group-hover:text-white sm:h-10 sm:w-10">{icon}</span>
      <span className="text-[11px] font-extrabold leading-tight text-[#4f5c70] sm:text-sm">{label}</span>
      <span className="absolute bottom-0 left-4 right-4 h-px origin-left scale-x-0 bg-[#3b82f6] transition-transform duration-300 group-hover:scale-x-100 sm:left-8 sm:right-8" />
    </div>
  );
}

function HeroCampusVisual() {
  return (
    <figure className="relative h-full min-h-[650px] overflow-hidden" aria-label="A diverse group of students on a modern university campus">
      <img
        src="https://images.pexels.com/photos/7683694/pexels-photo-7683694.jpeg?auto=compress&cs=tinysrgb&w=1600"
        alt="A diverse group of students talking on a modern university campus"
        className="h-full w-full object-cover object-[58%_center]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#101827] via-[#101827]/16 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#101827]/72 via-transparent to-[#3156d9]/10" />
      <figcaption className="absolute bottom-8 left-8 right-8 flex items-end justify-between gap-6 border-t border-white/28 pt-5 text-white xl:bottom-10 xl:left-10 xl:right-10">
        <div>
          <p className="font-utility text-[9px] font-semibold uppercase tracking-[0.18em] text-[#bfdbfe]">One connected journey</p>
          <p className="mt-2 max-w-sm text-sm font-bold leading-6 text-white/88">Shortlist, funding, applications, and visa preparation—kept in one clear plan.</p>
        </div>
        <PlaneTakeoff size={22} className="mb-1 shrink-0 text-[#93c5fd]" />
      </figcaption>
    </figure>
  );
}
function RoadmapBoardingPass() {
  return (
    <div className="landing-boarding-pass relative z-10 w-full max-w-[540px]">
      <div className="grid overflow-hidden rounded-[1.8rem] border border-white/60 bg-white shadow-[0_36px_90px_rgba(15,23,42,0.3)] sm:grid-cols-[1fr_108px]">
        <div className="relative p-5 text-[#0f172a] sm:p-6">
          <div className="landing-ticket-shine absolute inset-0" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <BrandLogo size="sm" iconOnly asLink={false} />
                <div>
                  <p className="font-utility text-[8px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">CollegeReady route pass</p>
                  <p className="mt-1 text-xs font-extrabold">CR · FALL 2027</p>
                </div>
              </div>
              <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#1d4ed8]">Ready</span>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <div>
                <p className="font-utility text-[8px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">From</p>
                <p className="mt-1 font-display text-2xl font-medium tracking-[-0.04em]">Profile</p>
              </div>
              <div className="relative h-px flex-1 bg-[#bfdbfe]">
                <PlaneTakeoff size={16} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-1 text-[#2563eb]" />
              </div>
              <div className="text-right">
                <p className="font-utility text-[8px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">To</p>
                <p className="mt-1 font-display text-2xl font-medium tracking-[-0.04em]">Campus</p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3 border-t border-dashed border-[#cbd5e1] pt-5">
              <TicketField label="Plan" value="Personalised" />
              <TicketField label="Matches" value="Verified" />
              <TicketField label="Access" value="Any device" />
            </div>
          </div>
        </div>

        <div className="relative flex min-h-[118px] flex-col items-center justify-between border-t border-dashed border-[#93c5fd] bg-[#eff6ff] p-4 text-center sm:min-h-0 sm:border-l sm:border-t-0">
          <span className="absolute -left-3 -top-3 hidden h-6 w-6 rounded-full bg-[#3b82f6] sm:block" />
          <span className="absolute -bottom-3 -left-3 hidden h-6 w-6 rounded-full bg-[#3b82f6] sm:block" />
          <div>
            <p className="font-utility text-[7px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">Boarding</p>
            <p className="mt-2 font-display text-xl font-medium text-[#1d4ed8]">27</p>
          </div>
          <div className="landing-ticket-barcode h-9 w-full opacity-55" aria-hidden="true" />
          <p className="font-utility text-[7px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">Build route</p>
        </div>
      </div>
      <div className="landing-float-slow absolute -bottom-5 -right-2 hidden items-center gap-2 rounded-full border border-white/60 bg-[#0f172a] px-4 py-2.5 text-white shadow-[0_18px_44px_rgba(15,23,42,0.25)] sm:flex">
        <BadgeCheck size={14} className="text-[#7dd3fc]" />
        <span className="text-[10px] font-extrabold">Verified plan inputs</span>
      </div>
    </div>
  );
}

function TicketField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-utility text-[7px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">{label}</p>
      <p className="mt-1 text-[10px] font-extrabold text-[#334155]">{value}</p>
    </div>
  );
}

function ProductCard({
  label,
  title,
  body,
  visual,
  className,
  horizontal = false,
}: {
  label: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  className: string;
  horizontal?: boolean;
}) {
  const dark = className.includes("text-white");

  return (
    <article className={`landing-product-card group relative h-full overflow-hidden rounded-[1.4rem] border border-[#101827]/8 p-6 shadow-[0_18px_52px_rgba(16,24,39,0.07)] sm:rounded-[2.4rem] sm:p-8 ${className}`}>
      <span className={`landing-card-arrow absolute right-6 top-6 z-10 hidden h-11 w-11 items-center justify-center rounded-full sm:right-8 sm:top-8 sm:flex ${dark ? "bg-white text-[#111827]" : "bg-[#171819] text-white"}`}>
        <ArrowRight size={17} />
      </span>
      <div className={horizontal ? "lg:pr-12" : ""}>
        <p className={`font-utility text-[10px] font-semibold uppercase tracking-[0.2em] ${dark ? "text-[#8fa0ff]" : "text-[#5061d9]"}`}>{label}</p>
        <h3 className={`mt-4 max-w-xl font-display text-[2rem] font-medium leading-none tracking-[-0.04em] sm:pr-14 sm:text-4xl ${dark ? "text-white" : "text-[#111827]"}`}>{title}</h3>
        <p className={`mt-4 max-w-lg text-sm font-semibold leading-6 sm:text-base ${dark ? "text-white/55" : "text-[#596475]"}`}>{body}</p>
      </div>
      <div className={`${horizontal ? "mt-7 lg:mt-0" : "mt-7 sm:mt-9"}`}>{visual}</div>
    </article>
  );
}

function MatchEvidenceVisual() {
  const rows = [
    { school: "Northeastern", fit: "Strong", score: 92, funding: "Good" },
    { school: "Arizona State", fit: "Strong", score: 88, funding: "High" },
    { school: "Illinois Tech", fit: "Possible", score: 81, funding: "Good" },
  ];
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[#101827]/10 bg-white shadow-[0_20px_50px_rgba(49,86,217,0.12)]">
      <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr] border-b border-[#101827]/10 bg-[#f7f8fb] px-4 py-3 font-utility text-[9px] font-semibold uppercase tracking-[0.16em] text-[#7b8492] sm:px-5">
        <span>School</span><span>Profile fit</span><span>Funding</span>
      </div>
      {rows.map((row) => (
        <div key={row.school} className="grid grid-cols-[1.2fr_0.8fr_0.7fr] items-center border-b border-[#101827]/10 px-4 py-4 last:border-0 sm:px-5">
          <div className="min-w-0 pr-3">
            <p className="truncate text-sm font-extrabold text-[#101827]">{row.school}</p>
            <p className="mt-1 text-[11px] font-semibold text-[#8a93a0]">Computer Science</p>
          </div>
          <div className="pr-4">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-[#596475]"><span className="hidden sm:inline">{row.fit}</span><span>{row.score}%</span></div>
            <div className="h-1.5 bg-[#e5e9ef]"><div className="h-full bg-[#3156d9]" style={{ width: `${row.score}%` }} /></div>
          </div>
          <span className="w-fit rounded-full bg-[#dbeafe] px-2.5 py-1 text-[10px] font-extrabold text-[#1d4ed8]">{row.funding}</span>
        </div>
      ))}
    </div>
  );
}

function RoadmapVisual() {
  const tasks = [
    { icon: <GraduationCap size={15} />, label: "Confirm shortlist", meta: "Complete" },
    { icon: <CircleDollarSign size={15} />, label: "Funding plan", meta: "This week" },
    { icon: <CalendarDays size={15} />, label: "Application dates", meta: "4 deadlines" },
    { icon: <PlaneTakeoff size={15} />, label: "Visa preparation", meta: "Up next" },
  ];
  return (
    <div className="rounded-[1.5rem] border border-[#101827]/10 bg-[#171819] p-5 text-white shadow-[0_22px_55px_rgba(16,24,39,0.22)]">
      <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
        <span className="font-utility text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9db2ff]">Current stage</span>
        <span className="text-xs font-bold text-white/55">32% complete</span>
      </div>
      <div className="space-y-2.5">
        {tasks.map((task, index) => (
          <div key={task.label} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${index === 1 ? "border-[#60a5fa]/60 bg-[#60a5fa]/10" : "border-white/10 bg-white/[0.035]"}`}>
            <span className={index === 0 ? "text-[#7dd3fc]" : "text-white/60"}>{task.icon}</span>
            <span className="flex-1 text-xs font-bold sm:text-sm">{task.label}</span>
            <span className="text-[10px] font-semibold text-white/45">{task.meta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InterviewPreviewVisual() {
  return (
    <div className="grid overflow-hidden rounded-[1.6rem] border border-white/10 bg-white shadow-[0_22px_60px_rgba(0,0,0,0.22)] sm:grid-cols-[0.85fr_1.15fr]">
      <div className="relative min-h-40 overflow-hidden bg-[#101827] sm:min-h-56">
        <img src="/anna.webp" alt="Anna, simulated visa officer" className="absolute inset-0 h-full w-full object-cover object-top opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101827] via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <div className="inline-flex items-center gap-2 bg-[#e45656] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.16em]"><span className="h-1.5 w-1.5 rounded-full bg-white" /> Live</div>
          <p className="mt-3 text-sm font-extrabold">Anna · Simulated officer</p>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        <p className="font-utility text-[9px] font-semibold uppercase tracking-[0.16em] text-[#7b8492]">Question 04</p>
        <p className="mt-3 text-sm font-extrabold leading-5 text-[#101827] sm:text-base sm:leading-6">“Why is this programme the right next step for your career?”</p>
        <div className="mt-6 hidden grid-cols-3 gap-2 sm:grid">
          <InterviewMetric label="Clarity" value="8.8" />
          <InterviewMetric label="Evidence" value="7.4" />
          <InterviewMetric label="Confidence" value="8.1" />
        </div>
        <div className="mt-4 flex items-start gap-2 text-[11px] font-bold leading-4 text-[#1d4ed8] sm:mt-5 sm:text-xs"><CheckCircle2 size={14} className="mt-0.5 shrink-0" /> Strong answer. Add one specific career outcome.</div>
      </div>
    </div>
  );
}

function InterviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#f1f3f5] px-2 py-3 text-center">
      <p className="text-lg font-black text-[#101827]">{value}</p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#7b8492]">{label}</p>
    </div>
  );
}

function VisaRoom() {
  return (
    <div className="relative h-full min-h-[360px] overflow-hidden border-r border-white/10 bg-[#22233a] sm:min-h-[460px]">
      <div className="absolute inset-x-8 top-8 flex items-center justify-between text-white/55 sm:inset-x-10">
        <span className="font-utility text-[9px] font-semibold uppercase tracking-[0.18em]">Interview room</span>
        <span className="inline-flex items-center gap-2 text-[10px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-[#e45656]" /> Live simulation</span>
      </div>
      <div className="landing-visa-frame absolute inset-x-8 bottom-8 top-20 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0c1422] shadow-[0_28px_70px_rgba(0,0,0,0.3)] sm:inset-x-10">
        <img src="/anna.webp" alt="Anna, simulated visa officer" className="h-full w-full object-cover object-top opacity-95" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c1422] via-transparent to-[#0c1422]/10" />
        <div className="absolute inset-x-5 bottom-5 sm:inset-x-6">
          <div className="rounded-[1.2rem] bg-white p-4 text-[#101827] shadow-2xl sm:p-5">
            <p className="font-utility text-[9px] font-semibold uppercase tracking-[0.17em] text-[#3156d9]">Officer question</p>
            <p className="mt-2 text-sm font-extrabold leading-5 sm:text-base">How will this degree change the work you return home to do?</p>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-white/60">
            <span className="inline-flex items-center gap-2"><Mic size={13} className="text-[#7dd3fc]" /> Listening</span>
            <span>00:42</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisaFeature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex min-h-20 flex-col items-start justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-[11px] font-bold leading-tight text-white/75 sm:min-h-0 sm:flex-row sm:items-center sm:justify-start sm:rounded-full sm:text-xs">
      <span className="text-[#9db2ff]">{icon}</span>{text}
    </div>
  );
}

function PricingCard({
  eyebrow,
  title,
  body,
  tone,
  href,
}: {
  eyebrow: string;
  title: string;
  body: string;
  tone: "light" | "dark";
  href?: string;
}) {
  const dark = tone === "dark";
  return (
    <article className={`landing-price-card relative overflow-hidden rounded-[2rem] border p-6 sm:p-7 ${dark ? "border-[#171819] bg-[#171819] text-white" : "border-[#101827]/8 bg-white text-[#101827]"}`}>
      <p className={`font-utility text-[9px] font-semibold uppercase tracking-[0.18em] ${dark ? "text-[#9db2ff]" : "text-[#3156d9]"}`}>{eyebrow}</p>
      <h3 className="mt-5 font-display text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{title}</h3>
      <p className={`mt-4 text-sm font-semibold leading-6 ${dark ? "text-white/55" : "text-[#657082]"}`}>{body}</p>
      {href && (
        <Link to={href} className="landing-inline-link mt-7 inline-flex items-center gap-3 text-sm font-extrabold text-white">
          View packages <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#60a5fa] text-[#0f2a52]"><ArrowRight size={14} /></span>
        </Link>
      )}
    </article>
  );
}
