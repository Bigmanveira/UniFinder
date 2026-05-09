import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, CheckCircle2, Sparkles, BrainCircuit, Target, ShieldCheck, Mic, Video, ShieldAlert } from "lucide-react";

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
            <span className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Unifinder</span>
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
            AI-Powered University Match Engine
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight leading-[1.05] mb-6">
            Find the university <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary-600 to-accent-500">that actually fits you.</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-500 font-medium max-w-2xl mx-auto lg:mx-0 mb-10 leading-relaxed">
            We match your academic profile, funding opportunities, and goals against verified university data — and rehearse the F-1 visa interview that decides whether you actually get there.
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

        {/* Hero Visual Mockup */}
        <div className="flex-1 w-full max-w-lg relative animate-fade-up-slow">
          <div className="bg-white md:bg-white/90 md:backdrop-blur-2xl border border-slate-100 md:border-white p-6 md:p-8 rounded-[40px] shadow-2xl shadow-slate-300/50 relative z-20">
            <div className="absolute -top-4 -right-4 bg-slate-900 text-white text-xs font-black tracking-widest uppercase px-4 py-2 rounded-full shadow-lg rotate-6 flex items-center gap-1">
              <Sparkles size={14} className="text-amber-400" /> 98% Match
            </div>

            <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mb-6 border border-primary-100">
              <span className="text-3xl">🏛️</span>
            </div>

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

          {/* Decorative depth card — desktop only (mobile already feels mocky enough). */}
          <div className="hidden md:block absolute -bottom-8 -left-8 w-full h-full bg-white/40 backdrop-blur-md border border-white rounded-[40px] shadow-xl z-10 -rotate-3 transform scale-95 pointer-events-none" />
        </div>
      </section>

      {/* Feature Section */}
      <section id="how-it-works" className="py-20 md:py-24 bg-white relative z-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">AI matching, <br/><span className="text-primary-600">grounded in real data.</span></h2>
            <p className="text-lg text-slate-500 font-medium max-w-2xl mx-auto">No hallucinated schools, no generic lists. Every match is filtered through verified institutional records before our AI ever sees it.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Target className="text-accent-500" size={28} />}
              title="Precision Profile Matching"
              desc="Your GPA, test scores, intended field, and funding opportunities are weighed against thousands of programs to surface the ones you can actually get into and afford."
            />
            <FeatureCard
              icon={<ShieldCheck className="text-emerald-500" size={28} />}
              title="Verified Programs Only"
              desc="Every recommended school is cross-checked against accredited program data — no AI invention, no out-of-date listings, no programs that don't exist."
            />
            <FeatureCard
              icon={<BrainCircuit className="text-primary-500" size={28} />}
              title="Personalized AI Reasoning"
              desc="For each match you get a written explanation of why this program fits your profile, what funding paths exist, and what to strengthen before applying."
            />
          </div>
        </div>
      </section>

      {/* F-1 Visa Interview — our differentiator */}
      <section className="py-20 md:py-24 bg-gradient-to-br from-blue-50 via-slate-50 to-white relative z-20 overflow-hidden">
        <div className="hidden md:block absolute top-1/2 left-0 -translate-y-1/2 w-[400px] h-[400px] bg-primary-200/40 rounded-full blur-[100px] pointer-events-none" />
        <div className="hidden md:block absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent-500/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-black tracking-widest uppercase mb-6">
              <ShieldAlert size={12} /> Unifinder exclusive
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 mb-6 leading-[1.05]">
              Practice your F-1 visa interview <span className="text-primary-600">with a live AI consular officer.</span>
            </h2>
            <p className="text-lg text-slate-500 font-medium leading-relaxed mb-8 max-w-xl">
              The university acceptance is only half the journey. Most rejections at the consulate happen in 90 seconds — for nerves, vague answers, or finance gaps the student didn't expect. Unifinder's interview simulator puts you in the chair: a live AI avatar reads your I-20 and DS-160, asks the questions a real officer would, listens to your spoken answers, and returns a written score on every dimension that matters.
            </p>

            <ul className="space-y-3 mb-10">
              <li className="flex items-start gap-3 text-slate-700 font-semibold">
                <CheckCircle2 className="text-emerald-500 flex-shrink-0 mt-0.5" size={20} />
                Live video avatar that asks realistic, profile-specific questions in real time
              </li>
              <li className="flex items-start gap-3 text-slate-700 font-semibold">
                <CheckCircle2 className="text-emerald-500 flex-shrink-0 mt-0.5" size={20} />
                Reads your real I-20 and DS-160 — no redundant questions, no generic interview script
              </li>
              <li className="flex items-start gap-3 text-slate-700 font-semibold">
                <CheckCircle2 className="text-emerald-500 flex-shrink-0 mt-0.5" size={20} />
                Speak your answers out loud, just like the real consulate
              </li>
              <li className="flex items-start gap-3 text-slate-700 font-semibold">
                <CheckCircle2 className="text-emerald-500 flex-shrink-0 mt-0.5" size={20} />
                Detailed written feedback across 9 dimensions, with sample improved answers
              </li>
            </ul>

            <Link to="/intake" className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-8 py-4 rounded-full transition-colors shadow-xl shadow-slate-900/20">
              Try the simulator <ArrowRight size={18} />
            </Link>
            <p className="text-xs text-slate-400 mt-3 font-semibold">Practice only. Not affiliated with any government or consular service.</p>
          </div>

          {/* Visual: stylized interview frame */}
          <div className="flex-1 w-full max-w-md">
            <div className="bg-slate-950 text-white rounded-[40px] p-6 sm:p-7 shadow-2xl shadow-slate-950/40 relative aspect-[3/4] sm:aspect-[4/5] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 via-slate-900 to-slate-950" />
              <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-900/70 text-[10px] font-bold uppercase tracking-widest border border-white/10">
                <ShieldAlert size={11} className="text-amber-300" /> Simulation
              </div>
              <div className="relative h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 mb-6 ring-4 ring-white/10 shadow-2xl flex items-center justify-center text-3xl font-black">A</div>
                <p className="text-xs font-bold tracking-widest text-blue-300 uppercase mb-2">Anna · Consular Officer</p>
                <p className="text-base font-semibold leading-snug text-white/90 mb-6">"Tell me — why have you chosen this particular program over the ones offered in your home country?"</p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                  <Mic size={12} className="animate-pulse" /> Listening
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
                <Video size={16} className="text-blue-600 mx-auto mb-1" />
                <p className="text-[10px] font-bold text-slate-600">Live avatar</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
                <Mic size={16} className="text-emerald-600 mx-auto mb-1" />
                <p className="text-[10px] font-bold text-slate-600">Voice answers</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
                <Sparkles size={16} className="text-amber-500 mx-auto mb-1" />
                <p className="text-[10px] font-bold text-slate-600">Scored feedback</p>
              </div>
            </div>
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
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> F-1 visa interview practice = 1 credit</li>
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> Personalized application roadmap = included</li>
            </ul>
            <Link to="/intake" className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white font-bold px-8 py-4 rounded-full transition-colors">
              Claim Your Free Credits <ArrowRight size={18} />
            </Link>
          </div>

          <div className="flex-1 w-full max-w-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-[40px] p-8 shadow-2xl relative">
              <div className="absolute -top-4 right-8 bg-accent-500 text-white text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-full">Most Popular</div>
              <h3 className="text-2xl font-black mb-2">Standard Pack</h3>
              <p className="text-slate-400 font-medium text-sm mb-6">Perfect for building your shortlist.</p>
              <div className="mb-6">
                <span className="text-5xl font-black">$15</span>
                <span className="text-slate-400 font-bold"> / 15 Credits</span>
              </div>
              <button className="w-full bg-white text-slate-900 font-bold py-4 rounded-full hover:bg-slate-100 transition-colors">
                View All Packages
              </button>
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
            <span className="text-xl font-black tracking-tight text-slate-900">Unifinder</span>
          </div>
          <div className="flex gap-6 text-sm font-bold text-slate-400">
            <Link to="/faq" className="hover:text-primary-600 transition-colors">FAQ</Link>
            <a href="#" className="hover:text-primary-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-primary-600 transition-colors">Contact</a>
          </div>
          <p className="text-xs font-medium text-slate-400">
            © 2026 Unifinder. Practice tools only. Not affiliated with any government, embassy, or consular service.
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
