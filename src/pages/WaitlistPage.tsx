import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, AlertTriangle } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import webLogo from "../assets/weblogo.png";

// ─────────────────────────────────────────────────────────────────────────────
// Waitlist landing — dark, slideshow-led, modelled on the Padicash hero
// pattern. The page lives at "/" while we're in soft-launch mode; signed-in
// users still see the real landing page (HomeGate handles that).
//
// Design intent:
//   - Whole-page dark backdrop with a slow image rotation behind the content.
//     The slideshow features Anna (visa interview) and the Stanford campus
//     so the value proposition is visible without reading a word.
//   - Strong leftward dark gradient keeps the email form readable. On mobile
//     the gradient tilts to bottom-up so the form (which moves below the
//     slideshow) stays legible.
//   - Brand colours: primary blue (#2563eb) → accent cyan (#06b6d4) for the
//     headline accent and the glow ring on the CTA. Match the rest of the
//     marketing surface.
//
// Email storage:
//   - addDoc into `waitlist` Firestore collection. Public-create-only rules
//     (see firestore.rules). Anything we read from the doc (other than the
//     email value the user just typed) is for our own attribution.
// ─────────────────────────────────────────────────────────────────────────────

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "submitted" }
  | { kind: "error"; message: string };

// Featured slides. Anna sits first (and longest) because the F-1 visa
// simulator is the differentiator we want to lead with — the matching
// engine table-stakes for any college search tool. Each slide has its own
// duration in ms so we can give the hero shot more screen-time.
const SLIDES: Array<{
  image:          string;
  alt:            string;
  badge:          string;
  /** Top line of the rotating H1 — plain weight, in the wordmark colour. */
  headlineTop:    string;
  /** Bottom line of the rotating H1 — rendered in the brand gradient. */
  headlineAccent: string;
  /** Short feature description that rotates under the H1. */
  subtitle:       string;
  /** Optional CSS object-position. Anna's face sits high in her source, so we
   *  bias the crop upward to keep her in frame on portrait-mobile screens. */
  objectPosition?: string;
  duration:       number;
}> = [
  {
    image:          "/anna.webp",
    alt:            "Anna, the AI consular officer practising an F-1 interview",
    badge:          "Live AI Consular Officer",
    headlineTop:    "Match your college.",
    headlineAccent: "Ace the visa interview.",
    subtitle:       "A live AI consular officer reads your I-20, asks the questions a real officer would, and scores how you answer.",
    objectPosition: "50% 22%",
    duration:       7500,
  },
  {
    image:          "https://images.unsplash.com/photo-1607237138185-eedd9c632b0b?auto=format&fit=crop&w=1600&q=80",
    alt:            "Stanford University campus archway",
    badge:          "Verified College Matches",
    headlineTop:    "Real colleges.",
    headlineAccent: "Real programs.",
    subtitle:       "Every match is cross-checked against accredited program data, so no application fees get wasted on programs that don't exist.",
    duration:       6500,
  },
  {
    image:          "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1600&q=80",
    alt:            "Students walking through a sunlit campus",
    badge:          "Personalised AI Reasoning",
    headlineTop:    "Clear reasons.",
    headlineAccent: "Real strategy.",
    subtitle:       "Every shortlist comes with a written explanation of why it fits, the funding paths worth chasing, and what to sharpen before applying.",
    duration:       6500,
  },
];

// Social handles. Update the URLs here once the accounts are live; the
// component reads them lazily so you can swap one without redeploying any
// other page.
const SOCIALS = {
  instagram: "https://instagram.com/233labs",
  facebook:  "https://facebook.com/233labs",
  linkedin:  "https://linkedin.com/company/233labs",
};

export default function WaitlistPage() {
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [slideIdx, setSlideIdx] = useState(0);

  // Cycle through the slides on each slide's own duration. We use a chained
  // setTimeout instead of a single interval so we can pace each slide
  // individually (Anna gets more screen-time, others rotate faster).
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSlideIdx((i) => (i + 1) % SLIDES.length);
    }, SLIDES[slideIdx].duration);
    return () => window.clearTimeout(id);
  }, [slideIdx]);

  // Preload non-active slide images so the crossfade doesn't flash a blank
  // frame on slow networks. Only fires once on mount.
  useEffect(() => {
    SLIDES.forEach((s) => {
      const img = new Image();
      img.src = s.image;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatus({ kind: "error", message: "That doesn't look like a valid email." });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      await addDoc(collection(db, "waitlist"), {
        email:     trimmedEmail,
        ref:       new URLSearchParams(window.location.search).get("ref") ?? null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
        createdAt: serverTimestamp(),
      });
      setStatus({ kind: "submitted" });
    } catch (err: any) {
      console.error("Waitlist submit failed:", err);
      setStatus({ kind: "error", message: "Couldn't save your spot — please try again in a moment." });
    }
  };

  const slide = SLIDES[slideIdx];

  return (
    // h-[100dvh] uses the dynamic viewport height where supported (modern
    // mobile browsers) so the page actually fills the visible area even
    // when the browser chrome shows/hides. Falls back to h-screen on
    // older browsers. flex-col + overflow-hidden = no scroll anywhere.
    <div
      className="h-screen flex flex-col relative overflow-hidden bg-slate-950 text-white font-sans selection:bg-primary-500 selection:text-white"
      style={{ height: "100dvh" }}
    >

      {/* ── Slideshow backdrop ───────────────────────────────────────────── */}
      {/* Real <img> elements (not background-image divs) so the browser's
          native object-cover handles responsive cropping on every viewport.
          Each slide stacks at inset-0 and we crossfade with opacity. */}
      <div className="absolute inset-0 z-0" aria-hidden>
        {SLIDES.map((s, i) => (
          <img
            key={s.image}
            src={s.image}
            alt=""
            decoding="async"
            loading={i === 0 ? "eager" : "lazy"}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity:        i === slideIdx ? 1 : 0,
              transition:     "opacity 1400ms cubic-bezier(0.4, 0, 0.2, 1)",
              willChange:     "opacity",
              objectPosition: s.objectPosition ?? "center",
            }}
          />
        ))}
      </div>

      {/* ── Gradient overlays ────────────────────────────────────────────── */}
      {/* Desktop: dark on the left where the text lives, fades to a wash on
          the right where the image shines through. Mobile: dark on the
          bottom where the form lives, lighter at the top so the image is
          still visible behind the headline. */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(to right, rgba(2, 6, 23, 0.96) 0%, rgba(2, 6, 23, 0.85) 35%, rgba(2, 6, 23, 0.55) 65%, rgba(2, 6, 23, 0.35) 100%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 z-[1] pointer-events-none md:hidden"
        style={{
          background:
            "linear-gradient(to bottom, rgba(2, 6, 23, 0.45) 0%, rgba(2, 6, 23, 0.85) 60%, rgba(2, 6, 23, 0.97) 100%)",
        }}
        aria-hidden
      />

      {/* Cyan glow blobs to echo the brand gradient. Desktop only — soft
          blurs on mobile are paint-expensive on low-end GPUs. */}
      <div className="hidden md:block absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-primary-600/25 blur-[140px] z-[1] pointer-events-none" aria-hidden />
      <div className="hidden md:block absolute -bottom-40 left-1/4 w-[520px] h-[520px] rounded-full bg-accent-500/20 blur-[160px] z-[1] pointer-events-none" aria-hidden />

      {/* ── Top bar: logo + socials ──────────────────────────────────────── */}
      <header className="relative z-10 shrink-0 px-5 sm:px-8 lg:px-12 pt-5 sm:pt-6 flex items-center justify-between">
        {/* Logo — strips the wordmark on phones to keep the bar uncluttered.
            Renders inline to avoid pulling BrandLogo's full machinery for a
            page that has its own tone. */}
        <Link to="/" className="flex items-center gap-2.5" aria-label="CollegeReady home">
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden flex-shrink-0 shadow-lg shadow-primary-500/40 flex items-center justify-center p-1.5 ring-1 ring-white/20"
            style={{ background: "radial-gradient(circle at 30% 30%, #7dd3fc 0%, #60a5fa 50%, #3b82f6 100%)" }}
          >
            <img
              src={webLogo}
              alt=""
              aria-hidden
              className="w-full h-full object-contain scale-[1.55] translate-y-[2px] select-none"
              style={{ filter: "brightness(0) invert(1)" }}
              draggable={false}
            />
          </div>
          <span className="text-lg sm:text-xl tracking-tight">
            <span className="font-black">College</span><span className="font-medium">Ready</span>
          </span>
        </Link>

        {/* Social pill — the gradient-ring matches Padicash's WhatsApp button.
            Single visual element, three icons inside. */}
        <div className="relative inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-slate-900/70 backdrop-blur-md ring-1 ring-white/10 shadow-[0_0_18px_rgba(56,189,248,0.18)]">
          <SocialIcon href={SOCIALS.instagram} label="Instagram"><InstagramGlyph /></SocialIcon>
          <SocialIcon href={SOCIALS.facebook}  label="Facebook"><FacebookGlyph /></SocialIcon>
          <SocialIcon href={SOCIALS.linkedin}  label="LinkedIn"><LinkedInGlyph /></SocialIcon>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {/* flex-1 + min-h-0 lets this region shrink as needed without
          forcing the page to scroll. Content is vertically centred. */}
      <main className="relative z-10 flex-1 min-h-0 flex items-center px-5 sm:px-8 lg:px-12 py-4 sm:py-6">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">

          {/* Left: hero copy + form */}
          <div className="lg:col-span-7">
            {/* Live slide badge — quietly mirrors the active slide so the
                eye registers the value prop being shown behind. Animates
                only via opacity for cheap mobile compositing. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.badge}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 ring-1 ring-white/15 backdrop-blur-sm text-[10px] sm:text-[11px] font-black tracking-widest uppercase text-cyan-200 mb-4 sm:mb-5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                {slide.badge}
              </motion.div>
            </AnimatePresence>

            {/* Rotating headline. Reserved min-height stops the form from
                jumping as the two-line copy swaps in/out. The accent line
                takes the brand gradient; the top line stays plain white. */}
            <div className="mb-4 sm:mb-5 min-h-[5.5rem] sm:min-h-[7rem] lg:min-h-[8.5rem]">
              <AnimatePresence mode="wait">
                <motion.h1
                  key={slide.headlineTop + slide.headlineAccent}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="text-[2.25rem] sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight leading-[1.02]"
                >
                  {slide.headlineTop}
                  <br />
                  <span className="bg-gradient-to-br from-primary-400 via-cyan-300 to-accent-500 bg-clip-text text-transparent">
                    {slide.headlineAccent}
                  </span>
                </motion.h1>
              </AnimatePresence>
            </div>

            {/* Rotating feature subtitle. Reserved min-height keeps the form
                from jumping when lines swap. */}
            <div className="max-w-lg mb-5 sm:mb-6 min-h-[4rem] sm:min-h-[4.5rem]">
              <AnimatePresence mode="wait">
                <motion.p
                  key={slide.subtitle}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="text-sm sm:text-base text-slate-300 font-medium leading-relaxed"
                >
                  {slide.subtitle}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Form / success swap */}
            {status.kind === "submitted" ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-lg bg-emerald-500/10 ring-1 ring-emerald-400/30 backdrop-blur-md rounded-2xl p-5 sm:p-6"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center justify-center flex-shrink-0">
                    <Check size={20} />
                  </div>
                  <div>
                    <p className="text-base sm:text-lg font-bold mb-0.5">You're on the list.</p>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      We'll email <span className="font-bold text-white">{email}</span> the moment access opens. No spam in between.
                    </p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="max-w-lg space-y-3"
              >
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="mail@johndoe.com"
                      className="w-full bg-slate-900/60 backdrop-blur-sm ring-1 ring-white/10 hover:ring-white/20 focus:ring-cyan-400/60 rounded-2xl px-5 py-4 text-white placeholder:text-slate-500 font-medium focus:outline-none focus:bg-slate-900/80 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={status.kind === "submitting"}
                    className="relative inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold text-white bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_0_28px_rgba(56,189,248,0.4)] ring-1 ring-cyan-300/50"
                  >
                    {status.kind === "submitting" ? "Saving…" : (
                      <>Join waitlist <ArrowRight size={16} /></>
                    )}
                  </button>
                </div>

                {status.kind === "error" && (
                  <div className="flex items-start gap-2 text-xs font-semibold text-rose-300 leading-relaxed">
                    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                    <span>{status.message}</span>
                  </div>
                )}

                <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                  We'll email you once. Unsubscribe with one click. No marketing list resale.
                </p>
              </form>
            )}
          </div>

          {/* Right column reserved for visual breathing room on lg+ so the
              slideshow image isn't completely overlaid by the dark gradient.
              No content here — the imagery itself does the talking. */}
          <div className="hidden lg:block lg:col-span-5" aria-hidden />
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative z-10 shrink-0 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 text-xs sm:text-sm">
          <p className="text-slate-400 font-medium text-center">
            © 2026 CollegeReady. Practice tools only. Not affiliated with any government, embassy, or consular service.
          </p>
          {/* Waitlist-specific info pages. Distinct namespace (/waitlist/*) so
              they don't collide with the main app's /privacy /terms /contact
              /faq routes — production users see different pages. */}
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 font-bold text-slate-400">
            <Link to="/waitlist/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/waitlist/terms"   className="hover:text-white transition-colors">Terms</Link>
            <Link to="/waitlist/faq"     className="hover:text-white transition-colors">FAQ</Link>
            <Link to="/waitlist/support" className="hover:text-white transition-colors">Support</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SocialIcon({
  href, label, children,
}: {
  href: string; label: string; children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 ring-1 ring-white/10 hover:ring-cyan-300/40 flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
    >
      {children}
    </a>
  );
}

// ─── Brand glyphs ───────────────────────────────────────────────────────────
// Inline SVGs so we don't add a brand-icon dependency just for three marks.
// Each glyph is sized 14×14 so it sits comfortably inside the 32px button.

function InstagramGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function FacebookGlyph() {
  // Facebook "f" mark inside its rounded square.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06C2 17.07 5.66 21.21 10.44 22v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47H15.2c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.34V22C18.34 21.21 22 17.07 22 12.06z" />
    </svg>
  );
}

function LinkedInGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.98 3.5C4.98 4.881 3.87 6 2.5 6S0 4.881 0 3.5C0 2.12 1.12 1 2.5 1S4.98 2.12 4.98 3.5zM.22 8h4.56v14H.22V8zm7.4 0h4.37v1.91h.06c.61-1.16 2.1-2.39 4.32-2.39 4.62 0 5.47 3.04 5.47 7v7.48h-4.56v-6.63c0-1.58-.03-3.61-2.2-3.61-2.2 0-2.54 1.72-2.54 3.5V22H7.62V8z" />
    </svg>
  );
}
