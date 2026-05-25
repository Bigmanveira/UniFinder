import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import WaitlistDocLayout from "../../components/WaitlistDocLayout";

// FAQ items live in a single array so reordering / adding entries is a
// one-line change. Keep answers tight — anything that needs more than
// 3 sentences belongs in its own page (Privacy / Terms / Support).
const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What is College Ready?",
    a: (
      <>
        Two products, one platform. <strong className="text-white">AI school matching</strong> tailored to international
        applicants (especially African students applying to U.S. universities), and a{" "}
        <strong className="text-white">live AI consular officer</strong> that simulates F-1 visa interviews and scores
        how you answer. Both are designed for the realities of applying from outside the U.S. — funding constraints,
        visa scrutiny, programme availability, and limited counsellor access.
      </>
    ),
  },
  {
    q: "When does it launch?",
    a: (
      <>
        We're soft-launching to a small invited cohort first, then opening publicly shortly after. We aren't committing
        to a public date yet — when you joined the waitlist you locked in your spot. Everyone on the list gets the
        launch email at the same time.
      </>
    ),
  },
  {
    q: "Who is it for?",
    a: (
      <>
        Primarily international undergraduate and graduate applicants to U.S. universities, with first-class support
        for students from Ghana, Nigeria, Kenya, and the wider African market — local card and mobile-money payment
        options included. Anyone can sign up; the matching engine works for any profile.
      </>
    ),
  },
  {
    q: "Will it cost money?",
    a: (
      <>
        Yes, but the entry is low. New accounts start with{" "}
        <strong className="text-white">2 free credits</strong> (good for 2 match-report unlocks). Beyond that you
        top up in small packs starting at ₵24. The full visa interview practice runs ₵60 at the entry tier.
      </>
    ),
  },
  {
    q: "How does the visa interview practice work?",
    a: (
      <>
        You upload your I-20 and DS-160. A live AI consular officer (named Anna) speaks to you on camera, asks the
        questions a real officer would, cross-checks what you say against your documents, and gives you a scored
        breakdown across nine dimensions afterward. It's a coaching tool — not affiliated with the U.S. State
        Department, and your score predicts nothing about a real interview outcome.
      </>
    ),
  },
  {
    q: "How does school matching work?",
    a: (
      <>
        You enter your academic profile (level, field, GPA, test scores, funding situation, target country). An AI
        ranks schools against your specific situation, buckets them into reach / target / safety, and explains
        in plain English why each one fits — including programme availability, funding paths, and what to strengthen
        in your application. Every match is cross-checked against verified programme data so you don't waste
        application fees on programmes that don't exist.
      </>
    ),
  },
  {
    q: "Did I pay anything to join the waitlist?",
    a: (
      <>
        No. The waitlist is free. We only collect your email address; there's no card on file, no subscription, no
        charge.
      </>
    ),
  },
  {
    q: "Will I be notified when it launches?",
    a: (
      <>
        Yes — that's the entire point of the waitlist. Make sure <em>noreply@collegeready.io</em> isn't in your spam
        filter so the launch email actually reaches you.
      </>
    ),
  },
  {
    q: "How do I unsubscribe / get off the waitlist?",
    a: (
      <>
        Email <a href="mailto:support@collegeready.io" className="text-blue-400 hover:underline">support@collegeready.io</a>{" "}
        from the same address you signed up with. We delete your record within 48 hours, no questions asked.
      </>
    ),
  },
  {
    q: "Is this affiliated with any government or embassy?",
    a: (
      <>
        No. College Ready is independent. Nothing here is official government guidance, legal advice, or an immigration
        service. We're a coaching tool that helps you prepare — the official decisions stay with the universities and
        the consular officers.
      </>
    ),
  },
];

export default function WaitlistFAQPage() {
  // Single-open accordion. We track the open index instead of a Set so the
  // common "read one thing, move to the next" flow doesn't pile up open
  // panels and force the user to scroll.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <WaitlistDocLayout
      title="Frequently asked questions"
      subtitle="The questions we get most. Anything else? Email support."
    >
      <div className="space-y-3">
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="border border-white/10 rounded-xl bg-white/[0.02] overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="font-bold text-white text-[15px]">{item.q}</span>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 text-slate-300 leading-relaxed text-[14.5px]">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="mt-12 border-t border-white/10 pt-8">
        <h2 className="text-lg font-bold text-white mb-2">Didn't see your question?</h2>
        <p className="text-slate-400 mb-4">
          Email <a href="mailto:support@collegeready.io" className="text-blue-400 hover:underline">support@collegeready.io</a>{" "}
          or open the support page for other ways to reach us.
        </p>
        <Link
          to="/waitlist/support"
          className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          Go to support
        </Link>
      </section>
    </WaitlistDocLayout>
  );
}
