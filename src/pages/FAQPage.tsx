import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GraduationCap, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BrandLogo from "../components/BrandLogo";
import { Eyebrow } from "../components/ui/Eyebrow";

const FAQS = [
  {
    question: "How does the AI Matching Engine work?",
    answer: "Our deterministic matching engine compares your specific academic profile (GPA, test scores, field of study) and funding requirements against our growing database of U.S. colleges. It provides a profile-based match estimate to guide your search."
  },
  {
    question: "What are Tokens and how do I use them?",
    answer: "College Ready uses a simple pay-as-you-go token system. 100 tokens unlock a full personalised match report — your Reach schools are visible right away. 500 tokens reveal a Target or Safety category inside that report if you want the wider list (optional — Reach alone is enough for most users). 1,500 tokens unlock a live F-1 visa interview practice session. You get 200 free tokens just for signing up."
  },
  {
    question: "Does College Ready guarantee my admission?",
    answer: "No platform can guarantee college admission, as admissions committees consider subjective factors like essays and interviews. However, College Ready dramatically improves your odds by strictly filtering out programs where you do not meet the minimum objective thresholds, saving you thousands of dollars in wasted application fees."
  },
  {
    question: "Do tokens expire?",
    answer: "Never! Once you purchase tokens, they remain in your wallet indefinitely. You can use them for this application cycle, or save them if you decide to apply to graduate school a few years down the line."
  },
  {
    question: "Is my personal data secure?",
    answer: "Absolutely. We use enterprise-grade encryption for all user profiles. Your academic data, transcripts, and personal information are never sold to third-party marketing agencies. They are strictly used to power your personal matching engine."
  }
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-surface font-sans selection:bg-primary-500 selection:text-white">
      {/* Top bar */}
      <header className="max-w-5xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Back home"
            className="w-9 h-9 shrink-0 rounded-full bg-white border border-slate-200/70 shadow-sm hover:border-slate-300 flex items-center justify-center text-slate-700 transition-colors"
          >
            <ArrowLeft size={15} />
          </Link>
          <BrandLogo size="md" />
        </div>
        <Link
          to="/login"
          className="rounded-full bg-ink text-white text-sm font-bold px-5 py-2.5 hover:bg-slate-800 shadow-lg shadow-slate-900/20 transition-all active:scale-95"
        >
          Log in
        </Link>
      </header>

      {/* Hero */}
      <section className="pt-10 sm:pt-16 pb-10 px-5 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow className="mb-3">Help center</Eyebrow>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight mb-5">
            Frequently asked <span className="text-primary-600">questions</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-500 font-medium max-w-xl mx-auto">
            Everything you need to know about the product and billing. Can't find the answer you're looking for? Please chat to our friendly team.
          </p>
        </div>
      </section>

      {/* FAQ accordion */}
      <section className="px-5 sm:px-6 pb-20">
        <div className="max-w-3xl mx-auto space-y-4">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className={`bg-white border rounded-card overflow-hidden transition-shadow duration-300 ${isOpen ? "border-primary-200 shadow-card-hover" : "border-slate-200/70 shadow-card hover:border-slate-300"}`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full px-6 py-5 sm:py-6 flex items-center justify-between gap-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset"
                  aria-expanded={isOpen}
                >
                  <span className={`text-base sm:text-lg font-black tracking-tight transition-colors ${isOpen ? "text-primary-700" : "text-slate-900"}`}>
                    {faq.question}
                  </span>
                  <span
                    className={`w-9 h-9 shrink-0 rounded-full border flex items-center justify-center transition-all duration-300 ${isOpen ? "bg-ink border-ink text-white rotate-45" : "bg-white border-slate-200/70 text-slate-500"}`}
                    aria-hidden
                  >
                    <Plus size={16} />
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <div className="px-6 pb-6 text-sm sm:text-[15px] text-slate-500 font-medium leading-relaxed">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA — dark ink hero card */}
      <section className="px-5 sm:px-6 pb-24">
        <div className="relative max-w-4xl mx-auto bg-ink text-white rounded-card-lg overflow-hidden shadow-2xl p-10 md:p-16 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -right-8 -top-10 w-36 h-36 rounded-full border-[18px] border-primary-500/20" />
            <div className="absolute -right-6 top-8 w-48 h-48 rounded-full bg-primary-500/15 blur-3xl" />
            <div className="absolute -left-16 -bottom-20 w-56 h-56 rounded-full bg-primary-500/10 blur-3xl" />
          </div>
          <div className="relative">
            <Eyebrow tone="light" className="mb-3">We're here to help</Eyebrow>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">Still have questions?</h2>
            <p className="text-sm sm:text-base text-white/60 font-medium mb-8 max-w-lg mx-auto leading-relaxed">
              Our team is incredibly responsive. Start a free intake today to experience the platform, or reach out to us directly.
            </p>
            <Link
              to="/intake"
              className="inline-flex items-center gap-2 rounded-full bg-primary-500 hover:bg-primary-600 text-white font-bold px-7 py-3.5 text-sm shadow-glow transition-all active:scale-95"
            >
              <GraduationCap size={16} /> Start Free Match Wizard
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-slate-200/70">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <BrandLogo size="sm" />
          <div className="flex gap-6 text-sm font-bold text-slate-400">
            <Link to="/faq" className="hover:text-primary-600 transition-colors">FAQ</Link>
            <Link to="/privacy" className="hover:text-primary-600 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-primary-600 transition-colors">Terms of Service</Link>
            <Link to="/contact" className="hover:text-primary-600 transition-colors">Contact</Link>
          </div>
          <p className="text-xs font-medium text-slate-400">
            © 2026 College Ready. Not affiliated with the U.S. Government.
          </p>
        </div>
      </footer>
    </div>
  );
}
