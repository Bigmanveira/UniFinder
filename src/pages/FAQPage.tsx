import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Wand2, MessageCircleQuestion } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BrandLogo from "../components/BrandLogo";

const FAQS = [
  {
    question: "How does the AI Matching Engine work?",
    answer: "Our deterministic matching engine compares your specific academic profile (GPA, test scores, field of study) and funding requirements against our growing database of U.S. colleges. It provides a profile-based match estimate to guide your search."
  },
  {
    question: "What are Credits and how do I use them?",
    answer: "College Ready uses a simple pay-as-you-go credit system. 1 credit unlocks a full personalised match report â€” your Reach schools are visible right away. 5 credits reveal a Target or Safety category inside that report if you want the wider list (optional â€” Reach alone is enough for most users). 15 credits unlock a live F-1 visa interview practice session. You get 2 free credits just for signing up."
  },
  {
    question: "Does College Ready guarantee my admission?",
    answer: "No platform can guarantee college admission, as admissions committees consider subjective factors like essays and interviews. However, College Ready dramatically improves your odds by strictly filtering out programs where you do not meet the minimum objective thresholds, saving you thousands of dollars in wasted application fees."
  },
  {
    question: "Do credits expire?",
    answer: "Never! Once you purchase credits, they remain in your wallet indefinitely. You can use them for this application cycle, or save them if you decide to apply to graduate school a few years down the line."
  },
  {
    question: "Is my personal data secure?",
    answer: "Absolutely. We use enterprise-grade encryption for all user profiles. Your academic data, transcripts, and personal information are never sold to third-party marketing agencies. They are strictly used to power your personal matching engine."
  }
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-500 selection:text-white">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <BrandLogo size="md" />
        <Link to="/login" className="text-sm font-bold text-primary-600 hover:text-primary-700 bg-primary-50 px-5 py-2.5 rounded-full transition-colors">
          Log in
        </Link>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary-500/10 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-primary-600 text-xs font-black tracking-widest uppercase mb-6">
            <MessageCircleQuestion size={14} /> Help Center
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight mb-6 tracking-tight">
            Frequently Asked <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-accent-500">Questions</span>
          </h1>
          <p className="text-lg text-slate-500 font-medium max-w-xl mx-auto">
            Everything you need to know about the product and billing. Can't find the answer you're looking for? Please chat to our friendly team.
          </p>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="px-6 pb-32">
        <div className="max-w-3xl mx-auto">
          <div className="space-y-4">
            {FAQS.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <div 
                  key={index} 
                  className={`bg-white border rounded-[24px] overflow-hidden transition-colors duration-300 ${isOpen ? 'border-primary-200 shadow-lg shadow-primary-500/5' : 'border-slate-200 hover:border-slate-300 shadow-sm'}`}
                >
                  <button 
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="w-full px-6 py-6 flex items-center justify-between text-left focus:outline-none"
                  >
                    <span className={`text-lg font-black transition-colors ${isOpen ? 'text-primary-900' : 'text-slate-900'}`}>
                      {faq.question}
                    </span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300 ${isOpen ? 'bg-primary-50 text-primary-600 rotate-180' : 'bg-slate-50 text-slate-400'}`}>
                      <ChevronDown size={18} />
                    </div>
                  </button>
                  
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                      >
                        <div className="px-6 pb-6 text-slate-500 font-medium leading-relaxed">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 pb-32">
        <div className="max-w-4xl mx-auto bg-slate-900 rounded-[40px] p-10 md:p-16 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/30 blur-[80px] rounded-full pointer-events-none"></div>
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Still have questions?</h2>
            <p className="text-slate-400 font-medium mb-8 max-w-lg mx-auto">
              Our team is incredibly responsive. Start a free intake today to experience the platform, or reach out to us directly.
            </p>
            <Link to="/intake" className="inline-flex items-center gap-2 bg-primary-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-primary-500 transition-colors shadow-lg shadow-primary-600/25">
              <Wand2 size={18} /> Start Free Match Wizard
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-slate-100 relative z-20 mt-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <BrandLogo size="sm" />
          <div className="flex gap-6 text-sm font-bold text-slate-400">
            <Link to="/faq" className="hover:text-primary-600 transition-colors">FAQ</Link>
            <a href="#" className="hover:text-primary-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-primary-600 transition-colors">Contact</a>
          </div>
          <p className="text-xs font-medium text-slate-400">
            Â© 2026 College Ready. Not affiliated with the U.S. Government.
          </p>
        </div>
      </footer>

    </div>
  );
}
