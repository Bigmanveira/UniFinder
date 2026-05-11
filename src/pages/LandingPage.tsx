import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, CheckCircle2, Sparkles, BrainCircuit, Target, ShieldCheck, Mic, Video, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

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
  const billingHref = user
    ? "/app?tab=billing"
    : `/signup?next=${encodeURIComponent("/app?tab=billing")}`;

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-500 selection:text-white relative overflow-hidden">

      {/* Abstract background blobs — desktop only. Mobile would burn CPU on the blur. */}
      <div className="hidden md:block absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary-200/50 rounded-full blur-[120px] pointer-events-none" />
      <div className="hidden md:block absolute top-[40%] left-[-10%] w-[500px] h-[500px] bg-accent-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="hidden md:block absolute -bottom-32 right-1/4 w-[800px] h-[400px] bg-primary-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 p-4 md:p-6 z-50">
        <div className="max-w-6xl mx-auto bg-white md:bg-white/80 md:backdrop-blur-xl border border-slate-100 md:border-white/50 shadow-sm rounded-full px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-[12px] bg-primary-600 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
              <GraduationCap size={20} />
            </div>
            <span className="text-xl md:text-2xl font-black tracking-tight text-slate-900">College Ready</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm font-bold text-slate-500 hover:text-primary-600 transition-colors">How it Works</a>
            <a href="#pricing" className="text-sm font-bold text-slate-500 hover:text-primary-600 transition-colors">Pricing</a>
            <Link to="/faq" className="text-sm font-bold text-slate-500 hover:text-primary-600 transition-colors">FAQ</Link>
          </nav>
          <div className="flex items-center gap-3 md:gap-4">
            <Link to="/login" className="text-sm font-bold text-slate-900 hover:text-primary-600 transition-colors">Log In</Link>
            <Link to="/intake" className="bg-slate-900 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 transition-transform active:scale-95 shadow-md">
              Start Free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 md:pt-40 pb-16 md:pb-20 px-6 max-w-6xl mx-auto relative z-20 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
        <div className="flex-1 text-center lg:text-left animate-fade-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-bold tracking-widest uppercase mb-8 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></span>
            AI-Powered College Match Engine
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight leading-[1.05] mb-6">
            Find the college <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary-600 to-accent-500">that actually fits you.</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-500 font-medium max-w-2xl mx-auto lg:mx-0 mb-10 leading-relaxed">
            AI-powered college matching, grounded in verified program data — plus a realistic F-1 visa interview simulator for the moment that actually decides whether you get there.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-5 justify-center lg:justify-start">
            <Link to="/intake" className="w-full sm:w-auto px-8 py-5 bg-primary-600 text-white rounded-full font-bold text-base hover:bg-primary-700 transition-transform active:scale-95 flex items-center justify-center gap-2 shadow-xl shadow-primary-500/25">
              Find My Matches
              <ArrowRight size={20} />
            </Link>
            <div className="flex items-center gap-3">
              {/* Inline SVG avatar pile — zero network requests, scales perfectly. */}
              <div className="flex -space-x-3">
                <AvatarPip color="#3b82f6" letter="A" />
                <AvatarPip color="#a855f7" letter="J" />
                <AvatarPip color="#10b981" letter="M" />
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
              <Sparkles size={14} className="text-amber-400" /> 98% Match
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
      <section id="how-it-works" className="py-20 md:py-24 bg-white relative z-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">Your acceptance <br/><span className="text-primary-600">starts here.</span></h2>
            <p className="text-lg text-slate-500 font-medium max-w-2xl mx-auto">Skip the guesswork. Get a personalised college shortlist built around your strengths, your budget, and your future — backed by verified data, not vibes.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Target className="text-accent-500" size={28} />}
              title="Matched to who you really are"
              desc="Your GPA, scores, budget, and goals shape every recommendation — so the colleges you see are ones where you can actually get in, afford to attend, and thrive."
            />
            <FeatureCard
              icon={<ShieldCheck className="text-emerald-500" size={28} />}
              title="Real schools. Real programs."
              desc="Every match is cross-checked against accredited program data. No invented schools, no dead listings, no application fees wasted chasing programs that don't exist."
            />
            <FeatureCard
              icon={<BrainCircuit className="text-primary-500" size={28} />}
              title="Clear reasons, real strategy"
              desc="Each match comes with a written explanation of why it fits, the funding paths worth chasing, and exactly what to strengthen — turning your shortlist into a plan."
            />
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
          <div className="flex-1 w-full max-w-md order-2 lg:order-1">
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
          </div>

          {/* Copy second on lg, first on mobile */}
          <div className="flex-1 order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-black tracking-widest uppercase mb-5">
              <ShieldAlert size={12} /> College Ready exclusive
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 mb-5 leading-[1.05]">
              Rehearse the interview <span className="text-primary-600">that decides everything.</span>
            </h2>
            <p className="text-lg text-slate-500 font-medium leading-relaxed mb-8 max-w-lg">
              The acceptance is only half the journey. A live AI consular officer reads your I-20, asks the questions a real officer would, and scores how you answer.
            </p>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-8 max-w-lg">
              <FeaturePill icon={<Video size={18} />}    label="Live avatar"    color="text-primary-600" />
              <FeaturePill icon={<Mic size={18} />}      label="Voice answers"  color="text-emerald-600" />
              <FeaturePill icon={<Sparkles size={18} />} label="Scored feedback" color="text-amber-500" />
            </div>

            <Link to={simulatorHref} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-7 py-3.5 rounded-full transition-colors shadow-xl shadow-slate-900/20">
              Try the simulator <ArrowRight size={18} />
            </Link>
            <p className="text-[11px] text-slate-400 mt-3 font-semibold">Practice only. Not affiliated with any government or consular service.</p>
          </div>
        </div>
      </section>

      {/* Pricing — solid background, no expensive blur on mobile */}
      <section id="pricing" className="py-20 md:py-24 bg-slate-900 text-white relative z-20 overflow-hidden">
        <div className="hidden md:block absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          <div className="flex-1">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Pay per match.<br/>No hidden subscriptions.</h2>
            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
              We operate on a transparent credit system — generate exactly what you need, when you need it. Every new account starts with free credits to try the engine before you ever pay.
            </p>
            <ul className="space-y-4 mb-10">
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> Full match report = 1 credit</li>
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> F-1 visa interview practice = 15 credits</li>
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> Personalized application roadmap = included</li>
            </ul>
            <Link to="/intake" className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white font-bold px-8 py-4 rounded-full transition-colors">
              Claim Your Free Credits <ArrowRight size={18} />
            </Link>
          </div>

          <div className="flex-1 w-full max-w-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-[40px] p-8 shadow-2xl relative">
              <div className="absolute -top-4 right-8 bg-accent-500 text-white text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-full">Most Popular</div>
              <h3 className="text-2xl font-black mb-2">Plus Pack</h3>
              <p className="text-slate-400 font-medium text-sm mb-6">Perfect for building your shortlist.</p>
              <div className="mb-6">
                <span className="text-5xl font-black">$20</span>
                <span className="text-slate-400 font-bold"> / 30 Credits</span>
              </div>
              <Link
                to={billingHref}
                className="w-full inline-flex items-center justify-center bg-white text-slate-900 font-bold py-4 rounded-full hover:bg-slate-100 transition-colors"
              >
                View All Packages
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-slate-100 relative z-20">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <GraduationCap size={16} />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900">College Ready</span>
          </div>
          <div className="flex gap-6 text-sm font-bold text-slate-400">
            <Link to="/faq" className="hover:text-primary-600 transition-colors">FAQ</Link>
            <Link to="/privacy" className="hover:text-primary-600 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-primary-600 transition-colors">Terms of Service</Link>
            <Link to="/contact" className="hover:text-primary-600 transition-colors">Contact</Link>
          </div>
          <p className="text-xs font-medium text-slate-400">
            © 2026 College Ready. Practice tools only. Not affiliated with any government, embassy, or consular service.
          </p>
        </div>
      </footer>

    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="bg-slate-50 rounded-[32px] p-8 border border-slate-100 hover:shadow-xl hover:shadow-slate-200/50 transition-all hover:-translate-y-1">
      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-black text-slate-900 mb-3">{title}</h3>
      <p className="text-slate-500 font-medium leading-relaxed">{desc}</p>
    </div>
  );
}

function FeaturePill({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-2 py-3 text-center hover:shadow-md transition-shadow">
      <div className={`flex items-center justify-center mb-1 ${color}`}>{icon}</div>
      <p className="text-[10px] sm:text-[11px] font-bold text-slate-700">{label}</p>
    </div>
  );
}

/**
 * Inline SVG avatar circle — replaces external pravatar.cc URLs, which were
 * blocking first-paint with three uncached HTTPS round trips.
 */
function AvatarPip({ color, letter }: { color: string; letter: string }) {
  return (
    <div
      className="w-10 h-10 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-white text-sm font-black"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {letter}
    </div>
  );
}
