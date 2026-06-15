import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, BadgeCheck, BarChart3, BrainCircuit, Target, ShieldCheck, Mic, Video, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import BrandLogo from "../components/BrandLogo";
import { Reveal } from "../components/Reveal";

// Performance notes for future-me:
//   - We deliberately do NOT use framer-motion here — first-paint entry
//     fades aren't worth the ~150 KB JS overhead on mobile. A simple
//     CSS keyframe (defined in index.css) handles the same effect.
//   - The big blurred decoration circles are gated on `md:block` so they
//     never render on phones. CSS blur of large surfaces is one of the
//     most expensive paint operations on mobile GPUs.
//   - backdrop-blur is expensive too; we use solid colors with opacity
//     fallbacks and only switch to backdrop-blur on `md+` breakpoints.

export default function LandingPage() {
  const { user } = useAuth();
  // /app/visa-interview is protected. Signed-in users go straight there.
  // Signed-out users land on /signup with `next` set so that ProtectedRoute
  // honours their original intent post-auth and drops them at the simulator
  // instead of the dashboard. Same `next` carries over if they click "Log in"
  // on the signup page.
  const simulatorHref = user
    ? "/app/visa-interview"
    : "/signup?next=/app/visa-interview";

  // "View All Packages" jumps signed-in users straight to the Billing tab on
  // the dashboard. Signed-out users sign up first; the same destination is
  // preserved via ProtectedRoute's `next` param so they land on Billing
  // after auth instead of the default Home tab.
  const billingHref = "/pricing";

  // When the user clicks an in-page anchor (Pricing / How It Works) the URL
  // gets a hash like #pricing. If they then scroll all the way back to the
  // top, the lingering hash leaves the page anchored — a refresh, a tab
  // switch, or a back/forward gesture would re-position the page at the
  // anchor instead of the actual top. We watch the scroll position and
  // strip the hash as soon as the user reaches the hero area, so the
  // top of the document is genuinely the top of the document again.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      // rAF coalesces multiple scroll events into a single check per frame.
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (window.scrollY < 50 && window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-500 selection:text-white relative overflow-hidden">

      {/* Abstract background blobs — desktop only. Mobile would burn CPU on the blur. */}
      <div className="hidden md:block absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary-200/50 rounded-full blur-[120px] pointer-events-none" />
      <div className="hidden md:block absolute top-[40%] left-[-10%] w-[500px] h-[500px] bg-accent-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="hidden md:block absolute -bottom-32 right-1/4 w-[800px] h-[400px] bg-primary-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 p-4 md:p-6 z-50">
        <div className="max-w-6xl mx-auto bg-white md:bg-white/80 md:backdrop-blur-xl border border-slate-100 md:border-white/50 shadow-sm rounded-full px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <BrandLogo size="lg" />
          <nav className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm font-bold text-slate-500 hover:text-primary-600 transition-colors">How it Works</a>
            <Link to="/pricing" className="text-sm font-bold text-slate-500 hover:text-primary-600 transition-colors">Pricing</Link>
            <Link to="/faq" className="text-sm font-bold text-slate-500 hover:text-primary-600 transition-colors">FAQ</Link>
          </nav>
          <div className="flex items-center gap-3 md:gap-4">
            {user ? (
              // Signed-in viewers shouldn't see "Log In" / "Start Free" — they're
              // already in. Drop them straight at the dashboard. Single CTA keeps
              // the pill's visual rhythm intact.
              <Link to="/app" className="bg-slate-900 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 transition-transform active:scale-95 shadow-md">
                Dashboard
              </Link>
            ) : (
              <>
                {/* Log In stays visible on every breakpoint — returning
                    users were getting forced through Start Free on phones
                    just to reach the login surface, which felt broken.
                    Compact text-xs on mobile so the pill doesn't squeeze. */}
                <Link to="/login" className="text-xs sm:text-sm font-bold text-slate-900 hover:text-primary-600 transition-colors px-1 py-1">Log In</Link>
                <Link to="/signup?next=/app/roadmap" className="bg-slate-900 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 transition-transform active:scale-95 shadow-md">
                  Start Free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero — `pt-40 md:pt-48` keeps the "AI-Powered College Match
          Engine" pill clearly below the fixed navbar even when the
          browser chrome (mobile URL bar, etc.) shifts viewport math
          a few pixels around. */}
      <section className="pt-40 md:pt-48 pb-16 md:pb-20 px-6 max-w-6xl mx-auto relative z-20 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
        <div className="flex-1 text-center lg:text-left animate-fade-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-bold tracking-widest uppercase mb-8 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></span>
            Your Personalised Study Abroad Platform
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight leading-[1.05] mb-6">
            Everything you need <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary-600 to-accent-500">to study abroad.</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-500 font-medium max-w-2xl mx-auto lg:mx-0 mb-10 leading-relaxed">
            From school matching to applications, visa preparation, and pre-departure guidance, CollegeReady helps international students know exactly what to do next.
          </p>

          {/* CTA row sits separate from the trust strip so the buttons
              keep a standard pill size on desktop. Wording shortened on
              all viewports to match the standard-pill convention — the
              full feature name is in the H1 above. */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-center lg:justify-start mb-7">
            <Link
              to={user ? "/app/roadmap" : "/signup?next=/app/roadmap/onboarding"}
              className="px-7 py-4 bg-primary-600 text-white rounded-full font-bold text-[15px] hover:bg-primary-700 transition-transform active:scale-95 inline-flex items-center justify-center gap-2 shadow-xl shadow-primary-500/25 whitespace-nowrap"
            >
              Start My Roadmap
              <ArrowRight size={18} />
            </Link>
            <Link
              to={user ? "/app/visa-interview" : "/signup?next=/app/visa-interview"}
              className="px-7 py-4 bg-white border border-slate-200 text-slate-900 rounded-full font-bold text-[15px] hover:bg-slate-50 transition-transform active:scale-95 inline-flex items-center justify-center gap-2 shadow-md whitespace-nowrap"
            >
              Practice F-1 Interview
              <ArrowRight size={18} />
            </Link>
          </div>

          {/* Trust strip lives on its own row — gives the avatar pile +
              rating room to breathe on every viewport and stops the CTAs
              from wrapping awkwardly on the desktop hero. */}
          <div className="flex items-center gap-3 justify-center lg:justify-start">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-3">
                <AvatarPhoto src="https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=facearea&facepad=2.5&w=160&h=160&q=80" />
                <AvatarPhoto src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=facearea&facepad=2.5&w=160&h=160&q=80" />
                <AvatarPhoto src="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=facearea&facepad=2.5&w=160&h=160&q=80" />
              </div>
              <div className="text-left">
                <div className="flex text-amber-400 text-xs">★★★★★</div>
                <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Trusted by 10k+</p>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Visual Mockup — example match preview.
            Header uses a real Stanford campus photo (the Memorial Arch /
            Main Quad area on Unsplash) so the card looks like an actual
            school match instead of a generic emoji placeholder. */}
        <div className="flex-1 w-full max-w-lg relative animate-fade-up-slow">
          <div className="bg-white md:bg-white/90 md:backdrop-blur-2xl border border-slate-100 md:border-white rounded-[40px] shadow-2xl shadow-slate-300/50 relative z-20 overflow-hidden">
            <div className="absolute top-4 right-4 z-10 bg-slate-900 text-white text-xs font-black tracking-widest uppercase px-4 py-2 rounded-full shadow-lg rotate-6 flex items-center gap-1">
              <BadgeCheck size={14} className="text-emerald-400" /> 98% Match
            </div>

            {/* Stock photo of Stanford's campus. The gradient overlay keeps
                the badge legible and gives the card a magazine-cover feel. */}
            <div className="relative h-44 md:h-52 -mb-8 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1607237138185-eedd9c632b0b?auto=format&fit=crop&w=1200&q=80"
                alt="Stanford University campus"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent pointer-events-none" />
            </div>

            <div className="relative px-6 md:px-8 pb-6 md:pb-8 pt-2">
              <h3 className="text-2xl font-black text-slate-900 mb-1">Stanford University</h3>
              <p className="text-slate-500 font-medium text-sm mb-6 pb-6 border-b border-slate-100">MS Computer Science</p>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                  <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">Tuition</span>
                  <span className="font-black text-slate-900">$57,000/yr</span>
                </div>
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                  <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">Funding</span>
                  <span className="font-black text-emerald-600">Available</span>
                </div>
              </div>

              <div className="bg-primary-50 rounded-2xl p-4 border border-primary-100">
                <p className="text-xs font-bold text-primary-900 leading-relaxed">
                  "Based on your 3.8 GPA and budget constraints, this program is highly viable..."
                </p>
              </div>
            </div>
          </div>

          {/* Decorative depth card — desktop only (mobile already feels mocky enough). */}
          <div className="hidden md:block absolute -bottom-8 -left-8 w-full h-full bg-white/40 backdrop-blur-md border border-white rounded-[40px] shadow-xl z-10 -rotate-3 transform scale-95 pointer-events-none" />
        </div>
      </section>

      {/* Feature Section */}
      <section id="how-it-works" className="scroll-mt-24 py-20 md:py-28 bg-slate-50 relative z-20 overflow-hidden">
        <div className="absolute inset-0 dot-grid-bg opacity-40 pointer-events-none" />
        <div className="hidden md:block absolute -top-24 left-[8%] w-72 h-72 rounded-full bg-primary-200/40 blur-[100px] pointer-events-none" />
        <div className="hidden md:block absolute -bottom-28 right-[5%] w-80 h-80 rounded-full bg-accent-500/15 blur-[110px] pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 relative">
          <Reveal className="text-center mb-12 md:mb-14">
            <p className="text-xs font-black tracking-[0.2em] uppercase text-primary-600 mb-4">How it works</p>
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">Your acceptance <br/><span className="text-primary-600">starts here.</span></h2>
            <p className="text-base md:text-lg text-slate-500 font-medium max-w-xl mx-auto">A verified shortlist, built around your profile and turned into clear next steps.</p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            <Reveal delay={0}>
              <FeatureCard
                index={1}
                icon={<Target className="text-accent-600" size={24} />}
                title="Built around you"
                desc="Your academics, budget, and goals shape every match."
                tone="cyan"
              />
            </Reveal>
            <Reveal delay={80}>
              <FeatureCard
                index={2}
                icon={<ShieldCheck className="text-emerald-600" size={24} />}
                title="Verified programs"
                desc="Only real schools with confirmed programs make the list."
                tone="emerald"
              />
            </Reveal>
            <Reveal delay={160}>
              <FeatureCard
                index={3}
                icon={<BrainCircuit className="text-primary-600" size={24} />}
                title="A plan you can act on"
                desc="See why each school fits and what to do next."
                tone="blue"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* F-1 Visa Interview — the differentiator. Tight copy, visual-led. */}
      <section className="py-20 md:py-24 bg-gradient-to-br from-slate-50 via-white to-slate-50 relative z-20 overflow-hidden">
        {/* Mobile: no decorative blurs (kept getting flagged for paint cost) */}
        <div className="hidden md:block absolute top-1/2 left-[-10%] -translate-y-1/2 w-[420px] h-[420px] bg-primary-200/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="hidden md:block absolute bottom-[-15%] right-[-5%] w-[420px] h-[420px] bg-accent-500/15 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          {/* Visual first on lg, second on mobile */}
          <Reveal className="flex-1 w-full max-w-md order-2 lg:order-1">
            <div className="bg-slate-950 text-white rounded-[36px] p-6 shadow-2xl shadow-slate-950/30 relative aspect-[4/5] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary-700/40 via-slate-900 to-slate-950" />
              {/* Live indicator chip */}
              <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-300 text-[10px] font-bold uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> Live
              </div>
              <div className="absolute top-4 right-4 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900/70 text-[10px] font-bold uppercase tracking-widest border border-white/10 text-white/70">
                <ShieldAlert size={10} className="text-amber-300" /> Simulation
              </div>
              {/* Avatar with breathing animation — pure CSS transform, GPU-cheap */}
              <div className="relative h-full flex flex-col items-center justify-center text-center px-4">
                <div className="relative mb-5">
                  <div className="absolute inset-0 rounded-full bg-primary-500/30 animate-ping" style={{ animationDuration: "2.5s" }} />
                  <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-primary-400 via-primary-500 to-accent-500 ring-4 ring-white/10 shadow-2xl overflow-hidden">
                    <img
                      src="/anna.webp"
                      alt="Anna, your AI consular officer"
                      loading="lazy"
                      decoding="async"
                      width={112}
                      height={112}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                </div>
                <p className="text-[10px] font-bold tracking-widest text-primary-300 uppercase mb-3">Anna · Consular Officer</p>
                <p className="text-[15px] font-semibold leading-snug text-white/95 mb-5 max-w-[16rem]">
                  "Why this program over the ones in your home country?"
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                  <Mic size={11} className="animate-pulse" /> Your turn
                </div>
              </div>
            </div>
          </Reveal>

          {/* Copy second on lg, first on mobile */}
          <Reveal delay={120} className="flex-1 order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-black tracking-widest uppercase mb-5">
              <ShieldAlert size={12} /> College Ready exclusive
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 mb-5 leading-[1.05]">
              Rehearse the interview <span className="text-primary-600">that decides everything.</span>
            </h2>
            <p className="text-lg text-slate-500 font-medium leading-relaxed mb-8 max-w-lg">
              The acceptance is only half the journey. A live AI consular officer reads your I-20, asks the questions a real officer would, and scores how you answer.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 max-w-lg">
              <InterviewFeatureCard
                icon={<Video size={17} />}
                label="Live avatar"
                eyebrow="Face-to-face"
                variant="avatar"
              />
              <InterviewFeatureCard
                icon={<Mic size={17} />}
                label="Voice answers"
                eyebrow="Speak naturally"
                variant="voice"
              />
              <InterviewFeatureCard
                icon={<BarChart3 size={17} />}
                label="Scored feedback"
                eyebrow="Know what to fix"
                variant="score"
              />
            </div>

            <Link to={simulatorHref} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-7 py-3.5 rounded-full transition-colors shadow-xl shadow-slate-900/20">
              Try the simulator <ArrowRight size={18} />
            </Link>
            <p className="text-[11px] text-slate-400 mt-3 font-semibold">Practice only. Not affiliated with any government or consular service.</p>
          </Reveal>
        </div>
      </section>

      {/* Pricing — solid background, no expensive blur on mobile */}
      <section id="pricing" className="scroll-mt-24 py-20 md:py-24 bg-slate-900 text-white relative z-20 overflow-hidden">
        <div className="hidden md:block absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          <Reveal className="flex-1">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Pay per match.<br/>No hidden subscriptions.</h2>
            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
              We operate on a transparent credit system — generate exactly what you need, when you need it. Every new account starts with free credits to try the engine before you ever pay.
            </p>
            <ul className="space-y-4 mb-10">
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> Full match report = 1 credit</li>
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> F-1 visa interview practice = 15 credits</li>
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> Personalized application roadmap = included</li>
            </ul>
            <Link to={user ? "/app/roadmap" : "/signup?next=/app/roadmap"} className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white font-bold px-8 py-4 rounded-full transition-colors">
              Claim Your Free Credits <ArrowRight size={18} />
            </Link>
          </Reveal>

          <Reveal delay={120} className="flex-1 w-full max-w-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-[40px] p-8 shadow-2xl relative">
              <div className="absolute -top-4 right-8 bg-accent-500 text-white text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-full">Most Popular</div>
              <h3 className="text-2xl font-black mb-2">Plus Pack</h3>
              <p className="text-slate-400 font-medium text-sm mb-6">Perfect for building your shortlist.</p>
              <div className="mb-6">
                <span className="text-5xl font-black">$15</span>
                <span className="text-slate-400 font-bold"> / 45 Credits</span>
              </div>
              <Link
                to={billingHref}
                className="w-full inline-flex items-center justify-center bg-white text-slate-900 font-bold py-4 rounded-full hover:bg-slate-100 transition-colors"
              >
                View All Packages
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-slate-100 relative z-20">
        <div className="max-w-6xl mx-auto px-6 flex flex-col gap-8">
          {/* Top row: brand on the left, link group on the right. Stacks
              vertically on mobile so neither side has to squeeze.
              `items-center` keeps the brand centered when stacked so it
              lines up with the centered nav + disclaimer underneath. */}
          <div className="flex flex-col items-center md:flex-row md:justify-between gap-6">
            <BrandLogo size="sm" />
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-bold text-slate-400">
              <Link to="/pricing" className="hover:text-primary-600 transition-colors">Pricing</Link>
              <Link to="/faq" className="hover:text-primary-600 transition-colors">FAQ</Link>
              <Link to="/privacy" className="hover:text-primary-600 transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-primary-600 transition-colors">Terms</Link>
              <Link to="/contact" className="hover:text-primary-600 transition-colors">Contact</Link>
            </nav>
          </div>
          {/* Bottom row: copyright + disclaimer on its own line so the
              long string never collides with the link group above. */}
          <p className="text-xs font-medium text-slate-400 text-center md:text-left border-t border-slate-100 pt-6">
            © 2026 College Ready. Practice tools only. Not affiliated with any government, embassy, or consular service.
          </p>
        </div>
      </footer>

    </div>
  );
}

function FeatureCard({
  index, icon, title, desc, tone,
}: {
  index: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone: "cyan" | "emerald" | "blue";
}) {
  const toneStyles = {
    cyan: {
      surface: "from-cyan-50 via-white to-blue-50",
      glow: "bg-cyan-400/20",
      badge: "bg-cyan-50 text-cyan-700 border-cyan-200",
      line: "from-cyan-400 to-blue-500",
    },
    emerald: {
      surface: "from-emerald-50 via-white to-teal-50",
      glow: "bg-emerald-400/20",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      line: "from-emerald-400 to-teal-500",
    },
    blue: {
      surface: "from-blue-50 via-white to-indigo-50",
      glow: "bg-primary-400/20",
      badge: "bg-primary-50 text-primary-700 border-primary-200",
      line: "from-primary-400 to-indigo-500",
    },
  }[tone];

  return (
    <article className="group relative h-full overflow-hidden rounded-[28px] border border-white bg-white shadow-lg shadow-slate-900/[0.05] transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-slate-900/10">
      <div className={`relative h-52 overflow-hidden bg-gradient-to-br ${toneStyles.surface} p-5`}>
        <div className={`absolute -right-10 -top-12 h-36 w-36 rounded-full ${toneStyles.glow} blur-2xl transition-transform duration-700 group-hover:scale-150`} />
        <div className="absolute inset-x-5 top-5 flex items-center justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/90 shadow-sm transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
            {icon}
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-[0.18em] ${toneStyles.badge}`}>
            {String(index).padStart(2, "0")}
          </span>
        </div>

        <div className="absolute inset-x-5 bottom-5">
          {index === 1 && <ProfileMatchVisual />}
          {index === 2 && <VerifiedProgramsVisual />}
          {index === 3 && <ActionPlanVisual />}
        </div>
      </div>

      <div className="relative p-6 md:p-7">
        <div className={`mb-5 h-1 w-12 rounded-full bg-gradient-to-r ${toneStyles.line} transition-all duration-500 group-hover:w-20`} />
        <h3 className="mb-2 text-xl md:text-2xl font-black tracking-tight text-slate-900">{title}</h3>
        <p className="text-sm font-medium leading-relaxed text-slate-500">{desc}</p>
      </div>
    </article>
  );
}

function ProfileMatchVisual() {
  return (
    <div className="animate-feature-float rounded-2xl border border-white/90 bg-white/90 p-3.5 shadow-lg shadow-cyan-900/5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-primary-600 text-[10px] font-black text-white">YOU</div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 h-2 w-20 rounded-full bg-slate-800" />
          <div className="h-1.5 w-14 rounded-full bg-slate-200" />
        </div>
        <span className="rounded-full bg-cyan-50 px-2 py-1 text-[9px] font-black text-cyan-700">PROFILE FIT</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="GPA" value="3.8" />
        <MiniMetric label="Budget" value="$30k" />
        <MiniMetric label="Goal" value="MS" />
      </div>
    </div>
  );
}

function VerifiedProgramsVisual() {
  const programs = ["Computer Science", "Data Science", "Cybersecurity"];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/90 bg-white/90 p-3 shadow-lg shadow-emerald-900/5">
      <div className="animate-feature-scan absolute inset-x-3 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80" />
      <div className="space-y-2">
        {programs.map((program, index) => (
          <div
            key={program}
            className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 transition-transform duration-500 group-hover:translate-x-1"
            style={{ transitionDelay: `${index * 45}ms` }}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={12} />
            </div>
            <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-slate-700">{program}</span>
            <span className="text-[8px] font-black uppercase tracking-wider text-emerald-600">Verified</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionPlanVisual() {
  const steps = [
    { label: "Shortlist", status: "Done", active: true },
    { label: "Funding", status: "Next", active: true },
    { label: "Applications", status: "Ready", active: false },
  ];
  return (
    <div className="rounded-2xl border border-white/90 bg-slate-950 p-3.5 text-white shadow-xl shadow-primary-900/15">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-primary-300">Your action plan</span>
        <span className="rounded-full bg-white/10 px-2 py-1 text-[8px] font-bold text-white/70">3 steps</span>
      </div>
      <div className="space-y-2.5">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center gap-2.5">
            <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-black ${step.active ? "bg-primary-500 text-white" : "bg-white/10 text-white/50"}`}>
              {index + 1}
            </div>
            <span className="flex-1 text-[10px] font-bold text-white/90">{step.label}</span>
            <span className={`text-[8px] font-black uppercase tracking-wider ${step.active ? "text-primary-300" : "text-white/40"}`}>{step.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2 text-center">
      <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-[11px] font-black text-slate-800">{value}</p>
    </div>
  );
}

function InterviewFeatureCard({
  icon,
  label,
  eyebrow,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  eyebrow: string;
  variant: "avatar" | "voice" | "score";
}) {
  const badgeStyles = {
    avatar: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/70",
    voice:  "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70",
    score:  "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/70",
  } as const;
  const badgeText = {
    avatar: "Live",
    voice:  "Listening",
    score:  "8.6 / 10",
  } as const;
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-500 hover:-translate-y-1 hover:border-primary-200 hover:shadow-xl hover:shadow-primary-900/[0.08]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700 transition-transform duration-500 group-hover:scale-[1.06]">
            {icon}
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-tight ${badgeStyles[variant]}`}>
            {variant === "avatar" && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            )}
            {badgeText[variant]}
          </span>
        </div>

        <div className="mb-4 flex h-14 items-center justify-center rounded-xl bg-slate-50/80 ring-1 ring-inset ring-slate-100">
          {variant === "avatar" && (
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary-300/40" style={{ animationDuration: "2.4s" }} />
              <div className="relative h-9 w-9 overflow-hidden rounded-full bg-gradient-to-br from-primary-400 to-accent-500 ring-2 ring-white">
                <img src="/anna.webp" alt="" aria-hidden className="h-full w-full object-cover object-top" />
              </div>
            </div>
          )}
          {variant === "voice" && (
            <div className="flex h-9 items-center gap-1">
              {[0, 1, 2, 3, 4].map((bar) => (
                <span
                  key={bar}
                  className="animate-audio-bar w-1 rounded-full bg-emerald-500"
                  style={{ height: `${14 + (bar % 3) * 6}px`, animationDelay: `${bar * -0.12}s` }}
                />
              ))}
            </div>
          )}
          {variant === "score" && (
            <div className="w-full space-y-1.5 px-4">
              <ScoreLine width="88%" color="bg-primary-500" />
              <ScoreLine width="76%" color="bg-amber-400" />
              <ScoreLine width="92%" color="bg-emerald-500" />
            </div>
          )}
        </div>

        <p className="text-sm font-semibold leading-tight text-slate-900">{label}</p>
        <p className="mt-1 text-xs font-medium leading-snug text-slate-500">{eyebrow}</p>
      </div>
  );
}

function ScoreLine({ width, color }: { width: string; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full rounded-full ${color} transition-all duration-700 group-hover:brightness-110`}
        style={{ width }}
      />
    </div>
  );
}

/**
 * Real-photo avatar circle for the "trusted by 10k+" pile. Images are
 * lazy-loaded (loading="lazy", decoding="async") so they don't compete
 * with the hero text and CTA for first-paint bandwidth. The 120-px
 * source is downscaled by the 40-px wrapper, giving us crisp retina
 * rendering without paying for larger sources.
 */
function AvatarPhoto({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      width={40}
      height={40}
      className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover bg-slate-200"
    />
  );
}
