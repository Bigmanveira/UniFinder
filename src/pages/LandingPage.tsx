import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, CheckCircle2, Sparkles, BrainCircuit, Target, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-500 selection:text-white relative overflow-hidden">
      
      {/* Abstract Background Elements */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary-200/50 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] left-[-10%] w-[500px] h-[500px] bg-accent-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-32 right-1/4 w-[800px] h-[400px] bg-primary-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 p-6 z-50">
        <div className="max-w-6xl mx-auto bg-white/80 backdrop-blur-xl border border-white/50 shadow-sm rounded-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-primary-600 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
              <GraduationCap size={22} />
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-900">Unifinder</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm font-bold text-slate-500 hover:text-primary-600 transition-colors">How it Works</a>
            <a href="#pricing" className="text-sm font-bold text-slate-500 hover:text-primary-600 transition-colors">Pricing</a>
            <Link to="/faq" className="text-sm font-bold text-slate-500 hover:text-primary-600 transition-colors">FAQ</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm font-bold text-slate-900 hover:text-primary-600 transition-colors">Log In</Link>
            <Link to="/intake" className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 transition-transform active:scale-95 shadow-md">
              Start Free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 max-w-6xl mx-auto relative z-20 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
        <div className="flex-1 text-center lg:text-left">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-bold tracking-widest uppercase mb-8 shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></span>
            Profile-Based Match Estimate
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight leading-[1.05] mb-6"
          >
            Find your potential <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary-600 to-accent-500">U.S. University</span> fit.
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-slate-500 font-medium max-w-2xl mx-auto lg:mx-0 mb-10 leading-relaxed"
          >
            We analyze your GPA, budget, and major against our growing database of U.S. schools to give you guidance, not a guarantee.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-5 justify-center lg:justify-start"
          >
            <Link to="/intake" className="w-full sm:w-auto px-8 py-5 bg-primary-600 text-white rounded-full font-bold text-base hover:bg-primary-700 transition-transform active:scale-95 flex items-center justify-center gap-2 shadow-xl shadow-primary-500/25">
              Find My Matches
              <ArrowRight size={20} />
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-3">
                <img src="https://i.pravatar.cc/100?img=3" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="User" />
                <img src="https://i.pravatar.cc/100?img=12" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="User" />
                <img src="https://i.pravatar.cc/100?img=47" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="User" />
              </div>
              <div className="text-left">
                <div className="flex text-amber-400 text-xs">★★★★★</div>
                <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Trusted by 10k+</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Hero Visual Mockup */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, rotateY: 10 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="flex-1 w-full max-w-lg relative perspective-1000"
        >
          {/* Main App Card Mockup */}
          <div className="bg-white/90 backdrop-blur-2xl border border-white p-6 md:p-8 rounded-[40px] shadow-2xl shadow-slate-300/50 relative z-20">
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
          
          {/* Decorative Depth Cards */}
          <div className="absolute -bottom-8 -left-8 w-full h-full bg-white/40 backdrop-blur-md border border-white rounded-[40px] shadow-xl z-10 -rotate-3 transform scale-95 pointer-events-none"></div>
        </motion.div>
      </section>

      {/* Feature Section */}
      <section id="how-it-works" className="py-24 bg-white relative z-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">Not just AI. <br/><span className="text-primary-600">Data-driven certainty.</span></h2>
            <p className="text-lg text-slate-500 font-medium max-w-2xl mx-auto">We don't let AI hallucinate schools. Our deterministic engine maps your profile against verified IPEDS and SEVP databases first.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard 
              icon={<Target className="text-accent-500" size={28} />}
              title="Profile Mapping"
              desc="Input your GPA, budget, major, and funding needs. We treat this as the ultimate filter."
            />
            <FeatureCard 
              icon={<ShieldCheck className="text-emerald-500" size={28} />}
              title="Verified Data"
              desc="Matches are pulled strictly from our growing database of U.S. accredited universities."
            />
            <FeatureCard 
              icon={<BrainCircuit className="text-primary-500" size={28} />}
              title="AI Reasoning"
              desc="Our AI acts as an advisor, reading your transcript to explain exactly *why* a school is a fit."
            />
          </div>
        </div>
      </section>

      {/* Pricing / Credit Model */}
      <section id="pricing" className="py-24 bg-slate-900 text-white relative z-20 overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-6xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Pay per match.<br/>No hidden subscriptions.</h2>
            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
              We operate on a transparent credit system. Generate exactly what you need, when you need it. Every new account starts with 2 free credits.
            </p>
            <ul className="space-y-4 mb-10">
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> Full Match Report = 1 Credit</li>
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> Transcript AI Analysis = 2 Credits</li>
              <li className="flex items-center gap-3 font-bold text-slate-300"><CheckCircle2 className="text-primary-500"/> Deep School Dive = 1 Credit</li>
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
            © 2026 Unifinder. Not affiliated with the U.S. Government.
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
