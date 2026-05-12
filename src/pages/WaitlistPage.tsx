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
  image:    string;
  alt:      string;
  badge:    string;
  caption:  string;
  duration: number;
}> = [
  {
    image:    "/anna.webp",
    alt:      "Anna, the AI consular officer practising an F-1 interview",
    badge:    "Live AI Consular Officer",
    caption:  "Rehearse the F-1 visa interview that decides everything.",
    duration: 7500,
  },
  {
    image:    "https://images.unsplash.com/photo-1607237138185-eedd9c632b0b?auto=format&fit=crop&w=1600&q=80",
    alt:      "Stanford University campus archway",
    badge:    "Verified College Matches",
    caption:  "Real schools. Real programs. No AI-invented listings.",
    duration: 6500,
  },
  {
    image:    "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1600&q=80",
    alt:      "Students walking through a sunlit campus",
    badge:    "Personalised AI Reasoning",
    caption:  "Each match explains why it fits and what to strengthen.",
    duration: 6500,
  },
];

// Social handles. Update the URLs here once the accounts are live; the
// component reads them lazily so you can swap one without redeploying any
// other page.
const SOCIALS = {
  instagram: "https://instagram.com/collegeready",
  twitter:   "https://twitter.com/collegeready",
  linkedin:  "https://linkedin.com/company/collegeready",
};

export default function WaitlistPage() {
  const [email, setEmail]   = useState("");
  const [name, setName]     = useState("");
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
        name:      name.trim() || null,
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
    <div className="min-h-screen relative overflow-hidden bg-slate-950 text-white font-sans selection:bg-primary-500 selection:text-white">

      {/* ── Slideshow backdrop ───────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0" aria-hidden>
        {SLIDES.map((s, i) => (
          <div
            key={s.image}
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:    `url(${s.image})`,
              opacity:            i === slideIdx ? 1 : 0,
              transition:         "opacity 1400ms cubic-bezier(0.4, 0, 0.2, 1)",
              willChange:         "opacity",
              // Anna's portrait is centred top-heavy in the source; nudge the
              // background position to keep her face inside the visible area.
              backgroundPosition: s.image === "/anna.webp" ? "right 30%" : "center",
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
      <header className="relative z-10 px-5 sm:px-8 lg:px-12 pt-6 sm:pt-8 flex items-center justify-between">
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
          <SocialIcon href={SOCIALS.twitter}   label="X (Twitter)"><XGlyph /></SocialIcon>
          <SocialIcon href={SOCIALS.linkedin}  label="LinkedIn"><LinkedInGlyph /></SocialIcon>
        </div>
      </header>

      {/* ── Main content grid ────────────────────────────────────────────── */}
      <main className="relative z-10 px-5 sm:px-8 lg:px-12 pt-10 sm:pt-16 lg:pt-24 pb-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center min-h-[calc(100vh-12rem)]">

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
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 ring-1 ring-white/15 backdrop-blur-sm text-[10px] sm:text-[11px] font-black tracking-widest uppercase text-cyan-200 mb-6"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                {slide.badge}
              </motion.div>
            </AnimatePresence>

            <h1 className="text-[2.5rem] sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight leading-[1.02] mb-5">
              Match your college.
              <br />
              <span className="bg-gradient-to-br from-primary-400 via-cyan-300 to-accent-500 bg-clip-text text-transparent">
                Ace the visa.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 font-medium leading-relaxed mb-9 max-w-lg">
              AI college matching grounded in verified program data — plus a live AI consular officer that rehearses your F-1 visa interview, scored.
              <br className="hidden sm:block" />
              Join the waitlist for early access and free credits at launch.
            </p>

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
                {/* Optional name row — kept above the email row so the email
                    line + button compose the visual "primary" action. */}
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  maxLength={80}
                  className="w-full bg-slate-900/60 backdrop-blur-sm ring-1 ring-white/10 hover:ring-white/20 focus:ring-cyan-400/60 rounded-2xl px-5 py-4 text-white placeholder:text-slate-400 font-medium focus:outline-none focus:bg-slate-900/80 transition-all"
                />

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

          {/* Right column: only on lg+ — shows the active slide's caption as
              a small overlay caption card that floats over the imagery. The
              full slideshow image is in the page background. */}
          <div className="hidden lg:flex lg:col-span-5 items-end justify-end">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.caption}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="max-w-sm bg-slate-900/65 backdrop-blur-md ring-1 ring-white/10 rounded-3xl p-5 shadow-2xl shadow-black/40"
              >
                <p className="text-[10px] font-bold tracking-widest uppercase text-cyan-300 mb-2">{slide.badge}</p>
                <p className="text-base font-semibold text-white leading-snug">
                  {slide.caption}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Slide pagination dots — tiny but help the user know it's a
            slideshow, not a static image. */}
        <div className="max-w-6xl mx-auto mt-10 flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.badge}
              onClick={() => setSlideIdx(i)}
              aria-label={`Show slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === slideIdx
                  ? "w-10 bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.6)]"
                  : "w-2.5 bg-white/25 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/10 mt-auto">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
          <p className="text-slate-400 font-medium text-center sm:text-left">
            © 2026 CollegeReady. Practice tools only. Not affiliated with any government, embassy, or consular service.
          </p>
          <div className="flex gap-5 font-bold text-slate-400">
            <Link to="/privacy" className="hover:text-cyan-300 transition-colors">Privacy</Link>
            <Link to="/terms"   className="hover:text-cyan-300 transition-colors">Terms</Link>
            <Link to="/contact" className="hover:text-cyan-300 transition-colors">Contact</Link>
          </div>
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

function XGlyph() {
  // The "X" wordmark glyph (formerly Twitter). Two diagonal strokes.
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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
