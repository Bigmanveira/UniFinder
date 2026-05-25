import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { auth, db, storage } from "../lib/firebase";
import { signOut, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { LogOut, Plus, Wallet, Bookmark, FileText, ChevronRight, User, GraduationCap, MapPin, Sparkles, Camera, Globe, Trash2, ChevronDown, ChevronUp, ArrowRight, Heart, Map, Gift, Copy, Check, Send, Mail, Home, ShieldAlert, Menu, X, Bell, Mic, KeyRound, Loader2, AlertTriangle } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, where } from "firebase/firestore";
import { FadeIn, FadeInItem } from "../components/FadeIn";
import { getOrCreateReferralCode, buildReferralUrl } from "../lib/referrals";

const VALID_DASHBOARD_TABS = new Set(["matches", "saved", "billing", "profile", "interviews"]);

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Honour deep-links like /app?tab=billing (used by the landing page's
  // "View All Packages" CTA and any other entry point that wants to drop
  // the user on a specific tab). After consuming the param we strip it so
  // a refresh doesn't keep forcing the tab.
  const initialTab = (() => {
    const requested = searchParams.get("tab");
    return requested && VALID_DASHBOARD_TABS.has(requested) ? requested : "matches";
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (searchParams.has("tab")) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [credits, setCredits] = useState<number>(0);
  const [matchReports, setMatchReports] = useState<any[]>([]);
  const [interviewReports, setInterviewReports] = useState<any[]>([]);
  const [savedSchools, setSavedSchools] = useState<any[]>([]);
  const [showAllReports, setShowAllReports] = useState(false);
  const [showAllInterviews, setShowAllInterviews] = useState(false);
  // Live user-profile doc so saved displayName + avatar reflect everywhere
  // (top-right avatar, dashboard greeting, drawer header).
  const [userProfile, setUserProfile] = useState<{ displayName?: string; photoURL?: string } | null>(null);
  // Mobile drawer (the new top navbar uses a hamburger that opens this).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Number of reports visible by default before "View all" is clicked
  const REPORTS_COLLAPSED_LIMIT = 3;

  useEffect(() => {
    if (!user) return;
    const unsubCredits = onSnapshot(doc(db, "creditWallets", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data.credits === 'number') {
          setCredits(data.credits);
        }
      } else {
        // Wallet not yet created — new users start with 2 free credits.
        // The wallet document is created by the Cloud Function on first
        // paid action (match unlock or visa interview). Keep this number
        // in sync with FREE_CREDITS_ON_SIGNUP in functions/src/index.ts.
        setCredits(2);
      }
    });

    const qReports = query(collection(db, "matchReports"), where("userId", "==", user.uid));
    const unsubReports = onSnapshot(qReports, (snapshot) => {
      const reports: any[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      // Sort in memory since we might not have an index for orderBy("createdAt", "desc") yet
      reports.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
      setMatchReports(reports);
    });

    const qInterviews = query(collection(db, "visaInterviewReports"), where("userId", "==", user.uid));
    const unsubInterviews = onSnapshot(qInterviews, (snapshot) => {
      const reports: any[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      reports.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
      setInterviewReports(reports);
    });

    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setUserProfile({
          displayName: typeof data.displayName === "string" ? data.displayName : undefined,
          photoURL:    typeof data.photoURL    === "string" ? data.photoURL    : undefined,
        });
      } else {
        setUserProfile(null);
      }
    });

    const unsubSaved = onSnapshot(doc(db, "savedSchools", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSavedSchools(data.schools || []);
      } else {
        setSavedSchools([]);
      }
    });

    return () => {
      unsubCredits();
      unsubReports();
      unsubInterviews();
      unsubProfile();
      unsubSaved();
    };
  }, [user]);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/");
  };

  const emailHandle = user?.email ? user.email.split('@')[0] : "Student";
  // Prefer the saved display name everywhere the dashboard greets the user.
  // We still keep emailHandle around for the username strip ("@email") and
  // initials-fallback when no avatar is set.
  const username = userProfile?.displayName?.trim() || emailHandle;
  const avatarURL = userProfile?.photoURL ?? null;

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans selection:bg-primary-500 selection:text-white">
      
      {/* 
        DESKTOP SIDEBAR 
      */}
      <aside className="hidden md:flex w-72 bg-white border-r border-slate-100 flex-col p-6 sticky top-0 h-screen overflow-y-auto">
        <div className="mb-10 px-2">
          <BrandLogo size="md" />
        </div>

        <nav className="flex-1 space-y-2">
          <DesktopNavItem icon={<Home size={18} />} label="Home" active={activeTab === "matches"} onClick={() => setActiveTab("matches")} badge={matchReports.length} />
          <DesktopNavItem icon={<Bookmark size={18} />} label="Saved Schools" active={activeTab === "saved"} onClick={() => setActiveTab("saved")} badge={savedSchools.length} />
          <DesktopNavItem icon={<Map size={18} />} label="Roadmap" active={false} onClick={() => navigate("/app/roadmap")} />
          <DesktopNavItem icon={<ShieldAlert size={18} />} label="Live interview practice" active={false} onClick={() => navigate("/app/visa-interview")} />
          <DesktopNavItem icon={<Mic size={18} />} label="Interview history" active={activeTab === "interviews"} onClick={() => setActiveTab("interviews")} badge={interviewReports.length} />
          <DesktopNavItem icon={<Wallet size={18} />} label="Credits & Billing" active={activeTab === "billing"} onClick={() => setActiveTab("billing")} />
          <DesktopNavItem icon={<User size={18} />} label="Profile" active={activeTab === "profile"} onClick={() => setActiveTab("profile")} />
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="bg-slate-50 p-4 rounded-2xl mb-4 border border-slate-100">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Logged in as</p>
            <p className="text-sm font-bold text-slate-900 truncate">@{username}</p>
          </div>
          <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-rose-500 hover:bg-rose-50 font-bold text-sm transition-colors">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* 
        MAIN CONTENT 
      */}
      <main className="flex-1 p-6 md:p-10 lg:p-12 pt-24 md:pt-10 max-w-5xl w-full mx-auto h-screen overflow-y-auto">
        
        {/* Other-tab page header (matches tab gets the image hero instead) */}
        {activeTab !== "matches" && (
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-3xl font-black text-slate-900">
                {activeTab === "saved" && "Saved Schools"}
                {activeTab === "billing" && "Credit Wallet"}
                {activeTab === "profile" && "Your Profile"}
                {activeTab === "interviews" && "Interview history"}
              </h1>
              <p className="text-slate-500 font-medium text-sm mt-1">Welcome back! You have {credits} credits available.</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3">
              <button onClick={() => navigate("/intake")} className="bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm px-6 py-3 rounded-full transition-colors flex items-center gap-2 shadow-xl shadow-primary-600/20 active:scale-95">
                <Plus size={18} /> Find my schools
              </button>
            </motion.div>
          </header>
        )}

        {activeTab === "matches" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-8">
            {/* Image hero — campus photo + overlaid greeting + CTA */}
            <FadeIn>
              <DashboardHero
                displayName={username}
                photoURL={avatarURL}
                credits={credits}
                reportsCount={matchReports.length}
                savedCount={savedSchools.length}
                onStart={() => navigate("/intake")}
              />
            </FadeIn>

            {/* Stats row — refined, single accent dot, no gradients on the cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FadeInItem index={0}>
                <StatTile
                  label="Available credits"
                  value={credits}
                  accent="bg-blue-500"
                  icon={<Wallet size={15} />}
                  action="Buy more"
                  onAction={() => setActiveTab("billing")}
                />
              </FadeInItem>
              <FadeInItem index={1}>
                <StatTile
                  label="Match reports"
                  value={matchReports.length}
                  accent="bg-cyan-500"
                  icon={<FileText size={15} />}
                  action={matchReports.length > 0 ? "Jump to list" : undefined}
                  onAction={() => document.getElementById("recent-reports")?.scrollIntoView({ behavior: "smooth" })}
                />
              </FadeInItem>
              <FadeInItem index={2}>
                <StatTile
                  label="Saved schools"
                  value={savedSchools.length}
                  accent="bg-emerald-500"
                  icon={<Heart size={15} />}
                  action="View board"
                  onAction={() => setActiveTab("saved")}
                />
              </FadeInItem>
            </div>

            {/* Roadmap CTA — shown once the user has at least one report */}
            {matchReports.length > 0 && (
              <FadeIn>
                <button
                  onClick={() => navigate("/app/roadmap")}
                  className="group w-full text-left bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900 text-white rounded-3xl p-6 sm:p-7 relative overflow-hidden hover:shadow-xl hover:shadow-slate-900/20 transition-shadow"
                >
                  <div className="absolute -top-16 -right-16 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl" aria-hidden />
                  <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-cyan-500/15 rounded-full blur-3xl" aria-hidden />
                  <div className="relative flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white flex-shrink-0">
                      <Map size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold tracking-wide text-amber-300 mb-1">NEXT STAGE</p>
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Your application roadmap</h3>
                      <p className="text-sm text-white/70 mt-1 leading-relaxed">
                        7 stages, step-by-step — from funding strategy to your visa interview.
                      </p>
                    </div>
                    <div className="hidden sm:flex w-10 h-10 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors items-center justify-center text-white flex-shrink-0">
                      <ArrowRight size={16} />
                    </div>
                  </div>
                </button>
              </FadeIn>
            )}

            {/* F-1 visa interview tile — cinematic, now-playing feel.
                Avatar dominates the visual space, title overlays at the
                bottom against a fade-up gradient. Pure CSS animation
                (transform + opacity), no extra assets, no mobile lag. */}
            <FadeIn>
              <button
                onClick={() => navigate("/app/visa-interview")}
                className="group block w-full text-left rounded-[28px] overflow-hidden relative aspect-[4/3] sm:aspect-[2.6/1] shadow-2xl shadow-slate-950/30 hover:shadow-[0_24px_60px_rgba(15,23,42,0.35)] transition-shadow active:scale-[0.995]"
              >
                {/* Layered background — gradient + soft color blooms.
                    The blooms are absolute-positioned blurred divs (CSS,
                    not SVG filters), which mobile GPUs handle efficiently. */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-slate-950 to-slate-900" aria-hidden />
                <div className="absolute top-1/2 -translate-y-1/2 -right-[15%] w-[55%] aspect-square bg-blue-500/30 rounded-full blur-[80px] pointer-events-none" aria-hidden />
                <div className="absolute -bottom-[20%] -left-[10%] w-[55%] aspect-square bg-cyan-500/25 rounded-full blur-[80px] pointer-events-none" aria-hidden />

                {/* Subtle radial spotlight behind the avatar */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] sm:-translate-y-1/2 sm:left-[28%] w-72 h-72 bg-[radial-gradient(circle,rgba(255,255,255,0.18),transparent_70%)] pointer-events-none" aria-hidden />

                {/* Top status chips */}
                <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-300 text-[10px] font-bold uppercase tracking-widest z-10 backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> Live
                </div>
                <div className="absolute top-4 right-4 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900/60 border border-white/10 text-white/70 text-[10px] font-bold uppercase tracking-widest z-10 backdrop-blur-sm">
                  <ShieldAlert size={10} className="text-amber-300" /> Simulation
                </div>

                {/* Avatar — Anna's actual headshot (87 KB WebP served from /public).
                    Same image as the live HeyGen avatar so the brand is
                    consistent between this preview and the real interview. */}
                <div className="absolute inset-0 flex items-center justify-center sm:justify-start sm:pl-[10%]" style={{ paddingBottom: "min(35%, 7rem)" }}>
                  <div className="relative">
                    {/* Outer breathing ring */}
                    <div className="absolute inset-0 rounded-full bg-primary-400/25 animate-ping" style={{ animationDuration: "2.5s" }} aria-hidden />
                    {/* Mid ring */}
                    <div className="absolute -inset-3 rounded-full ring-1 ring-white/10" aria-hidden />
                    {/* Avatar disk */}
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-primary-300 via-primary-500 to-accent-500 ring-2 ring-white/20 shadow-[0_20px_50px_rgba(59,130,246,0.45)] overflow-hidden">
                      <img
                        src="/anna.webp"
                        alt="Anna, your AI consular officer"
                        decoding="async"
                        width={112}
                        height={112}
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  </div>
                </div>

                {/* Decorative voice-wave hint behind the avatar (3 thin bars) */}
                <div className="hidden sm:flex absolute right-[12%] top-1/2 -translate-y-1/2 items-end gap-1.5 opacity-50" aria-hidden>
                  <span className="w-1 bg-primary-300 rounded-full animate-pulse-slow" style={{ height: "20%" }} />
                  <span className="w-1 bg-primary-300 rounded-full animate-pulse-slow" style={{ height: "55%", animationDelay: "0.2s" }} />
                  <span className="w-1 bg-primary-300 rounded-full animate-pulse-slow" style={{ height: "35%", animationDelay: "0.4s" }} />
                  <span className="w-1 bg-primary-300 rounded-full animate-pulse-slow" style={{ height: "70%", animationDelay: "0.1s" }} />
                  <span className="w-1 bg-primary-300 rounded-full animate-pulse-slow" style={{ height: "30%", animationDelay: "0.3s" }} />
                  <span className="w-1 bg-primary-300 rounded-full animate-pulse-slow" style={{ height: "50%", animationDelay: "0.5s" }} />
                </div>

                {/* Bottom overlay — kicker + title + CTA */}
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent">
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold tracking-widest text-primary-300 uppercase mb-1.5">F-1 visa interview practice</p>
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight mb-1.5">
                        Rehearse with Anna<span className="hidden sm:inline">, your AI consular officer</span>
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] sm:text-xs text-white/65 font-semibold">
                        <span>15 credits</span>
                        <span className="opacity-50">·</span>
                        <span>~5 min</span>
                        <span className="opacity-50">·</span>
                        <span>Voice-only</span>
                      </div>
                    </div>
                    {/* Hero "play" CTA */}
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all flex-shrink-0">
                      <ArrowRight size={20} strokeWidth={2.5} />
                    </div>
                  </div>
                </div>
              </button>
            </FadeIn>

            {/* Interview history — past F-1 practice sessions. Only renders
                when the user has at least one completed interview report. */}
            {interviewReports.length > 0 && (
              <div id="interview-history">
                <FadeIn>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-slate-900">Interview history</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {`${interviewReports.length} practice session${interviewReports.length === 1 ? "" : "s"} · showing ${showAllInterviews ? interviewReports.length : Math.min(REPORTS_COLLAPSED_LIMIT, interviewReports.length)}`}
                      </p>
                    </div>
                    {interviewReports.length > REPORTS_COLLAPSED_LIMIT && (
                      <button
                        onClick={() => setShowAllInterviews(v => !v)}
                        className="text-sm font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
                      >
                        {showAllInterviews ? "Show less" : `View all (${interviewReports.length})`}
                        <ChevronRight size={14} className={`transition-transform ${showAllInterviews ? "rotate-90" : ""}`} />
                      </button>
                    )}
                  </div>
                </FadeIn>

                <div className="space-y-3">
                  {(showAllInterviews ? interviewReports : interviewReports.slice(0, REPORTS_COLLAPSED_LIMIT)).map((r, i) => (
                    <FadeInItem key={r.id} index={i}>
                      <InterviewRow report={r} onClick={() => navigate(`/app/interview-reports/${r.id}`)} />
                    </FadeInItem>
                  ))}
                </div>
              </div>
            )}

            {/* Recent reports — bounded with View all toggle */}
            <div id="recent-reports">
              <FadeIn>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-slate-900">Recent reports</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {matchReports.length === 0
                        ? "Generate your first match report to see it here."
                        : `${matchReports.length} total · showing ${showAllReports ? matchReports.length : Math.min(REPORTS_COLLAPSED_LIMIT, matchReports.length)}`}
                    </p>
                  </div>
                  {matchReports.length > REPORTS_COLLAPSED_LIMIT && (
                    <button
                      onClick={() => setShowAllReports(v => !v)}
                      className="text-sm font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
                    >
                      {showAllReports ? "Show less" : `View all (${matchReports.length})`}
                      <ChevronRight size={14} className={`transition-transform ${showAllReports ? "rotate-90" : ""}`} />
                    </button>
                  )}
                </div>
              </FadeIn>

              <div className="space-y-3">
                {matchReports.length > 0 ? (
                  (showAllReports ? matchReports : matchReports.slice(0, REPORTS_COLLAPSED_LIMIT)).map((report, i) => (
                    <FadeInItem key={report.id} index={i}>
                      <ReportRow report={report} onClick={() => navigate(`/app/reports/${report.id}`)} />
                    </FadeInItem>
                  ))
                ) : (
                  <FadeIn>
                    <button
                      onClick={() => navigate("/intake")}
                      className="w-full bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-slate-400 hover:bg-slate-50 transition-colors group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 mx-auto mb-3 group-hover:bg-slate-200 transition-colors">
                        <Plus size={18} />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">Generate your first match report</p>
                      <p className="text-xs text-slate-500 mt-1">Takes about 2 minutes — answer a few quick questions about your profile.</p>
                    </button>
                  </FadeIn>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "profile" && (
          <ProfileTab user={user} username={username} onSignOut={handleSignOut} />
        )}

        {activeTab === "billing" && (
          <BillingTab credits={credits} userId={user?.uid} />
        )}

        {activeTab === "saved" && (
          <SavedSchoolsTab savedSchools={savedSchools} userId={user?.uid || ""} />
        )}

        {activeTab === "interviews" && (
          <InterviewHistoryTab
            reports={interviewReports}
            onOpen={(id) => navigate(`/app/interview-reports/${id}`)}
            onPractice={() => navigate("/app/visa-interview")}
          />
        )}

      </main>

      {/*
        MOBILE TOP NAVIGATION — hamburger | logo | bell
        Replaces the old floating bottom-pill so the user has standard
        top-of-screen orientation. Drawer slides from the left, dismissable
        via backdrop tap or Escape.
      */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 px-4 pt-3 pb-3 bg-white/95 backdrop-blur-md border-b border-slate-100">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-transform"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <BrandLogo size="sm" />
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-transform relative"
            aria-label="Notifications"
          >
            <Bell size={18} />
          </button>
        </div>

        {/* Notifications popover (placeholder until real notifs ship) */}
        <AnimatePresence>
          {notifOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute right-4 top-16 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-4"
            >
              <p className="text-sm font-bold text-slate-900 mb-1">Notifications</p>
              <p className="text-xs text-slate-500 leading-relaxed">You're all caught up. We'll notify you here when a match report finishes processing or your visa interview score is ready.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/*
        MOBILE DRAWER — slides in from the left on hamburger tap.
        Mirrors the desktop sidebar items so feature parity is the same
        on both viewports.
      */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="md:hidden fixed inset-0 z-50 bg-slate-950/40"
              aria-hidden
            />
            {/* Drawer */}
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-[82%] max-w-xs bg-white shadow-2xl flex flex-col"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <BrandLogo size="md" />
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>

              <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
                <DesktopNavItem icon={<Home size={18} />}        label="Home"               active={activeTab === "matches"} onClick={() => { setActiveTab("matches"); setMobileNavOpen(false); }} badge={matchReports.length} />
                <DesktopNavItem icon={<Bookmark size={18} />}    label="Saved Schools"      active={activeTab === "saved"}   onClick={() => { setActiveTab("saved");   setMobileNavOpen(false); }} badge={savedSchools.length} />
                <DesktopNavItem icon={<Map size={18} />}         label="Roadmap"            active={false} onClick={() => { navigate("/app/roadmap");        setMobileNavOpen(false); }} />
                <DesktopNavItem icon={<ShieldAlert size={18} />} label="Live interview practice" active={false} onClick={() => { navigate("/app/visa-interview"); setMobileNavOpen(false); }} />
                <DesktopNavItem icon={<Mic size={18} />}         label="Interview history"  active={activeTab === "interviews"} onClick={() => { setActiveTab("interviews"); setMobileNavOpen(false); }} badge={interviewReports.length} />
                <DesktopNavItem icon={<Wallet size={18} />}      label="Credits & Billing"  active={activeTab === "billing"} onClick={() => { setActiveTab("billing"); setMobileNavOpen(false); }} />
                <DesktopNavItem icon={<User size={18} />}        label="Profile"            active={activeTab === "profile"} onClick={() => { setActiveTab("profile"); setMobileNavOpen(false); }} />
              </nav>

              <div className="p-4 border-t border-slate-100 space-y-3">
                <button
                  onClick={() => { navigate("/intake"); setMobileNavOpen(false); }}
                  className="w-full inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm py-3.5 rounded-2xl transition-colors active:scale-[0.99] shadow-lg shadow-primary-600/20"
                >
                  <Plus size={16} /> Find my schools
                </button>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Logged in as</p>
                  <p className="text-sm font-bold text-slate-900 truncate">@{username}</p>
                </div>
                <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-rose-500 hover:bg-rose-50 font-bold text-sm transition-colors">
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}

// Subcomponents

type ProfileFormStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

type PasswordResetStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

const LANGUAGE_OPTIONS = ["English (US)", "Spanish", "French"];
const NOTIFICATION_OPTIONS = ["All Notifications", "Important Updates Only", "None"];

function ProfileTab({ user, username, onSignOut }: { user: any, username: string, onSignOut: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persisted state, loaded from users/{uid} on mount.
  const [photoURL, setPhotoURL]           = useState<string | null>(null);
  const [displayName, setDisplayName]     = useState<string>(username);
  const [language, setLanguage]           = useState<string>(LANGUAGE_OPTIONS[0]);
  const [notifPref, setNotifPref]         = useState<string>(NOTIFICATION_OPTIONS[0]);

  // Pending photo file kept locally until "Save All Changes" — that way users
  // can preview the avatar without paying the Storage write until they commit.
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);

  const [loading, setLoading]   = useState(true);
  const [status, setStatus]     = useState<ProfileFormStatus>({ kind: "idle" });
  const [pwStatus, setPwStatus] = useState<PasswordResetStatus>({ kind: "idle" });

  // Detect provider so we can tailor the password-reset action. Google /
  // Apple sign-in users don't have a Firebase password to reset; they must
  // go through their provider, so we surface a clear note instead.
  const providers: string[] = (user?.providerData ?? []).map((p: any) => p?.providerId).filter(Boolean);
  const hasPasswordAuth = providers.includes("password");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.uid) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          if (typeof data.displayName === "string" && data.displayName)   setDisplayName(data.displayName);
          if (typeof data.photoURL    === "string" && data.photoURL)      setPhotoURL(data.photoURL);
          if (typeof data.language    === "string" && data.language)      setLanguage(data.language);
          if (typeof data.notificationPref === "string" && data.notificationPref) setNotifPref(data.notificationPref);
        }
      } catch (err) {
        console.warn("Could not load profile:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Object URLs leak unless explicitly revoked. Wipe on file change or unmount.
  useEffect(() => {
    if (!pendingPhotoPreview) return;
    return () => URL.revokeObjectURL(pendingPhotoPreview);
  }, [pendingPhotoPreview]);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus({ kind: "error", message: "Please choose an image file." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus({ kind: "error", message: "Image must be under 5 MB." });
      return;
    }
    if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
    setPendingPhotoFile(file);
    setPendingPhotoPreview(URL.createObjectURL(file));
    setStatus({ kind: "idle" });
  };

  const handleSave = async () => {
    if (!user?.uid) return;
    setStatus({ kind: "saving" });
    try {
      let nextPhotoURL = photoURL;
      if (pendingPhotoFile) {
        // Single fixed filename so re-uploads overwrite — keeps Storage tidy
        // and avoids needing to clean up old objects.
        const sref = storageRef(storage, `users/${user.uid}/profile/avatar`);
        await uploadBytes(sref, pendingPhotoFile, { contentType: pendingPhotoFile.type });
        nextPhotoURL = await getDownloadURL(sref);
      }

      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: displayName.trim() || null,
          photoURL: nextPhotoURL ?? null,
          language,
          notificationPref: notifPref,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (pendingPhotoFile) {
        setPhotoURL(nextPhotoURL);
        setPendingPhotoFile(null);
        if (pendingPhotoPreview) { URL.revokeObjectURL(pendingPhotoPreview); setPendingPhotoPreview(null); }
      }
      setStatus({ kind: "saved" });
      setTimeout(() => setStatus(s => (s.kind === "saved" ? { kind: "idle" } : s)), 2500);
    } catch (err: any) {
      console.error("Profile save failed:", err);
      setStatus({ kind: "error", message: err?.message ?? "Could not save your changes." });
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setPwStatus({ kind: "sending" });
    try {
      await sendPasswordResetEmail(auth, user.email);
      setPwStatus({ kind: "sent" });
    } catch (err: any) {
      console.error("Password reset failed:", err);
      setPwStatus({ kind: "error", message: err?.message ?? "Could not send reset email." });
    }
  };

  const displayedAvatar = pendingPhotoPreview ?? photoURL;
  const headerName = (displayName?.trim() || username).trim();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl space-y-6">

      {/* Cover Banner & Profile Info Card */}
      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">

        {/* Gradient Banner */}
        <div className="h-32 md:h-40 bg-gradient-to-r from-primary-600 to-accent-500 relative">
          <div className="absolute inset-0 bg-white/10 mix-blend-overlay"></div>
        </div>

        {/* Profile Details Container */}
        <div className="px-6 md:px-10 pb-8 relative">

          {/* Overlapping Avatar */}
          <div className="absolute -top-16 left-6 md:left-10 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-32 h-32 rounded-[32px] bg-white flex items-center justify-center p-1.5 shadow-xl shadow-slate-900/10">
              <div className="w-full h-full bg-slate-100 rounded-[26px] overflow-hidden flex items-center justify-center text-slate-400 relative">
                {displayedAvatar ? (
                  <img src={displayedAvatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={48} />
                )}

                {/* Hover Camera Overlay */}
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white backdrop-blur-sm">
                  <Camera size={24} />
                </div>
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white border-4 border-white shadow-sm transition-transform group-hover:scale-110">
              <Plus size={16} />
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImagePick} accept="image/*" className="hidden" />
          </div>

          {/* Name & Badge */}
          <div className="pt-20">
            <h2 className="text-3xl font-black text-slate-900 leading-tight mb-1">@{headerName}</h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 text-primary-700 text-xs font-bold tracking-widest uppercase border border-primary-100">
                <Sparkles size={12} /> Free Plan
              </span>
              <span className="text-sm font-medium text-slate-500">{user?.email}</span>
              {pendingPhotoFile && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200">
                  Pending — Save to apply
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Personal Details Card */}
        <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-sm border border-slate-100">
          <h3 className="text-sm font-black text-slate-900 mb-6 flex items-center gap-2">
            <User size={18} className="text-primary-500" /> Personal Details
          </h3>
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Full Name</label>
              <input
                type="text"
                placeholder="Your Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Email Address</label>
              <input type="email" disabled value={user?.email || ""} className="w-full bg-slate-100 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-500 font-bold focus:outline-none cursor-not-allowed" />
            </div>
          </div>
        </div>

        {/* App Preferences Card */}
        <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-sm border border-slate-100">
          <h3 className="text-sm font-black text-slate-900 mb-6 flex items-center gap-2">
            <Sparkles size={18} className="text-primary-500" /> App Preferences
          </h3>
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Notifications</label>
              <select
                value={notifPref}
                onChange={(e) => setNotifPref(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all appearance-none cursor-pointer"
              >
                {NOTIFICATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black tracking-widest text-slate-500 mb-2 uppercase ml-1">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all appearance-none cursor-pointer"
              >
                {LANGUAGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>

      </div>

      {/* Security card — password reset */}
      <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-sm border border-slate-100">
        <h3 className="text-sm font-black text-slate-900 mb-2 flex items-center gap-2">
          <KeyRound size={18} className="text-primary-500" /> Security
        </h3>
        {hasPasswordAuth ? (
          <>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              We'll email a secure link to <span className="font-bold text-slate-700">{user?.email}</span>. Open it on the same device and choose a new password.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <button
                onClick={handlePasswordReset}
                disabled={pwStatus.kind === "sending" || pwStatus.kind === "sent"}
                className="inline-flex items-center justify-center gap-2 bg-slate-900 text-white font-bold py-3 px-5 rounded-2xl hover:bg-slate-800 transition-colors active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-sm"
              >
                {pwStatus.kind === "sending" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                {pwStatus.kind === "sent" ? "Reset email sent" : pwStatus.kind === "sending" ? "Sending…" : "Send password reset email"}
              </button>
              {pwStatus.kind === "sent" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <Check size={13} /> Check your inbox (and spam folder).
                </span>
              )}
              {pwStatus.kind === "error" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                  <AlertTriangle size={13} /> {pwStatus.message}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500 leading-relaxed">
            You signed in with {providers[0] === "google.com" ? "Google" : providers[0] === "apple.com" ? "Apple" : "a social provider"}. There's no separate College Ready password to reset — manage your account through {providers[0] === "google.com" ? "your Google account settings" : "your provider's account settings"}.
          </p>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mt-2">
        <div className="flex items-center gap-3 flex-1 w-full">
          <button
            onClick={handleSave}
            disabled={status.kind === "saving"}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-4 px-10 rounded-2xl hover:bg-primary-700 transition-transform active:scale-[0.98] shadow-lg shadow-primary-600/25 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {status.kind === "saving" ? <Loader2 size={16} className="animate-spin" /> : null}
            {status.kind === "saving" ? "Saving…" : "Save All Changes"}
          </button>
          {status.kind === "saved" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Check size={13} /> Saved
            </span>
          )}
          {status.kind === "error" && (
            <span className="inline-flex items-start gap-1.5 text-xs font-semibold text-rose-700 leading-relaxed">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {status.message}
            </span>
          )}
        </div>

        <button onClick={onSignOut} className="w-full sm:w-auto md:hidden flex items-center justify-center gap-2 bg-white border border-rose-200 text-rose-600 font-bold py-4 px-8 rounded-2xl hover:bg-rose-50 transition-colors shadow-sm">
          <LogOut size={18} /> Sign Out
        </button>
      </div>

    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing tab — pulls credit packs from the backend, kicks off Paystack
// hosted checkout, and surfaces a success/cancel banner when the user is
// bounced back from Paystack via callback_url.
// ─────────────────────────────────────────────────────────────────────────────
type CreditPack = {
  id:          string;
  label:       string;
  priceLocal:  number;
  currency:    string;
  credits:     number;
  recommended: boolean;
};

const currencyGlyph = (code: string): string => {
  switch ((code ?? "").toUpperCase()) {
    case "GHS": return "₵";
    case "NGN": return "₦";
    case "ZAR": return "R";
    case "KES": return "KSh ";
    case "USD": return "$";
    default:    return "";
  }
};

function BillingTab({ credits, userId }: { credits: number; userId: string | undefined }) {
  const [packs, setPacks]   = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError]   = useState("");
  const [returnStatus, setReturnStatus] = useState<"paid" | "cancelled" | null>(null);

  // Read query param Paystack bounces back with. We strip it from
  // the URL so refreshing the page doesn't keep showing the banner.
  useEffect(() => {
    const url = new URL(window.location.href);
    const paid      = url.searchParams.get("paid");
    const cancelled = url.searchParams.get("cancelled");
    if (paid === "1") {
      setReturnStatus("paid");
      url.searchParams.delete("paid");
      window.history.replaceState({}, "", url.toString());
    } else if (cancelled === "1") {
      setReturnStatus("cancelled");
      url.searchParams.delete("cancelled");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // bfcache reset — clicking "Buy now" redirects to Paystack. If the
  // user cancels on Paystack and hits the browser back button, modern
  // browsers restore the page from the back-forward cache with all JS
  // state intact, which leaves the button stuck on "Opening checkout…"
  // forever because the `buying` state was set right before redirect
  // and never cleared. `pageshow` with persisted=true is the canonical
  // signal for a bfcache restore — clear the in-flight state and any
  // stale error so the user can retry.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setBuying(null);
        setError("");
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const fn  = httpsCallable(functions, "listCreditPacks");
        const res = await fn({});
        if (mounted) setPacks(res.data as CreditPack[]);
      } catch (err) {
        console.error("Could not load credit packs:", err);
        if (mounted) setError("Could not load pricing. Refresh and try again.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleBuy = async (packId: string) => {
    if (!userId) return;
    setBuying(packId);
    setError("");
    try {
      const base = window.location.origin;
      const returnUrl = `${base}/app?tab=billing&paid=1`;
      const cancelUrl = `${base}/app?tab=billing&cancelled=1`;
      const fn  = httpsCallable(functions, "createPaystackCheckout");
      const res = await fn({ packId, returnUrl, cancelUrl });
      const data = res.data as { checkoutUrl?: string };
      if (!data?.checkoutUrl) throw new Error("No checkout URL returned");
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      console.error("Checkout failed:", err);
      setError(err?.message ?? "Could not start checkout. Please try again.");
      setBuying(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl">

      {/* Return-from-Paystack banner */}
      {returnStatus === "paid" && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
            <Check size={16} />
          </div>
          <div className="flex-1">
            <p className="font-bold text-emerald-900 text-sm mb-0.5">Payment received</p>
            <p className="text-xs text-emerald-800 leading-relaxed">Credits usually post within a few seconds. If your balance hasn't updated in two minutes, contact <a className="underline" href="mailto:support@collegeready.io">support@collegeready.io</a> with your payment confirmation.</p>
          </div>
        </div>
      )}
      {returnStatus === "cancelled" && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          Payment was cancelled — no credits charged. You can pick a pack again any time.
        </div>
      )}

      {/* Balance Card */}
      <div className="bg-slate-900 rounded-[40px] p-8 md:p-12 text-white shadow-2xl relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/20 rounded-full blur-[80px]"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-sm font-black tracking-widest text-slate-400 uppercase mb-2">Available Balance</h2>
            <div className="flex items-end gap-3">
              <span className="text-7xl font-black leading-none">{credits}</span>
              <span className="text-xl font-bold text-slate-400 mb-2">Credits</span>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 max-w-xs">
            <p className="text-sm font-bold mb-1">How credits work:</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="font-bold text-white">1 credit</span> = Match report unlock.
              <br />
              <span className="font-bold text-white">15 credits</span> = F-1 interview practice (live avatar).
              <br />
              Credits never expire.
            </p>
          </div>
        </div>
      </div>

      {/* Referral card — earn 5 credits per friend */}
      <ReferralCard userId={userId} />

      <h3 className="text-xl font-black text-slate-900 mb-2">Top Up Credits</h3>
      <p className="text-sm text-slate-500 mb-6">Secure checkout by Paystack. Credits post automatically once payment confirms.</p>

      {error && (
        <div className="mb-4 bg-rose-50 border border-rose-200 rounded-2xl p-3 text-sm text-rose-700 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm h-56 animate-pulse" />
          ))}
        </div>
      ) : (
        // 5 packs at lg+ (Try / Starter / Plus / Pro / Power) — collapses to
        // 2 columns at sm and 1 column on phones. Wrap is fine if the count
        // changes again.
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {packs.map((pack) => {
            const isBuying = buying === pack.id;
            const glyph = currencyGlyph(pack.currency);
            const perCredit = (pack.priceLocal / pack.credits).toFixed(2);
            return (
              <div
                key={pack.id}
                className={`relative rounded-[32px] p-6 md:p-7 shadow-sm transition-all ${
                  pack.recommended
                    ? "bg-primary-50 border-2 border-primary-500 shadow-lg sm:-translate-y-1"
                    : "bg-white border border-slate-100 hover:border-primary-300 hover:shadow-xl"
                }`}
              >
                {pack.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full whitespace-nowrap">
                    Most Popular
                  </div>
                )}
                <h4 className={`text-lg font-black mb-1 ${pack.recommended ? "text-primary-900" : "text-slate-900"}`}>{pack.label}</h4>
                <p className={`text-xs font-medium mb-5 ${pack.recommended ? "text-primary-700/80" : "text-slate-500"}`}>
                  {glyph}{perCredit} per credit
                </p>
                <div className="mb-5">
                  <span className={`text-4xl font-black ${pack.recommended ? "text-primary-900" : "text-slate-900"}`}>{glyph}{pack.priceLocal}</span>
                  <span className={`font-bold ${pack.recommended ? "text-primary-700" : "text-slate-500"}`}> / {pack.credits} credits</span>
                </div>
                <button
                  onClick={() => handleBuy(pack.id)}
                  disabled={!!buying}
                  className={`w-full inline-flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    pack.recommended
                      ? "bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-600/30"
                      : "bg-slate-100 text-slate-900 hover:bg-slate-200"
                  }`}
                >
                  {isBuying ? <Loader2 size={14} className="animate-spin" /> : null}
                  {isBuying ? "Opening checkout…" : "Buy Now"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-6 leading-relaxed">
        Payments are processed by Paystack. We don't see or store your card details.
        Refunds and disputes: contact <a className="underline" href="mailto:support@collegeready.io">support@collegeready.io</a>.
      </p>
    </motion.div>
  );
}

function DesktopNavItem({ icon, label, active, onClick, badge }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, badge?: string | number }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-[20px] font-bold text-sm transition-all ${
        active 
          ? 'bg-primary-50 text-primary-700 shadow-sm border border-primary-100/50' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`${active ? 'text-primary-600' : 'text-slate-400'}`}>
          {icon}
        </div>
        {label}
      </div>
      {badge !== undefined && (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${active ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard pieces — image-led hero + refined stats + report rows
// ─────────────────────────────────────────────────────────────────────────────

// Hero pool — strictly college buildings / campus architecture. The previous
// list mixed in interior, graduation, and (per a user report) an Unsplash ID
// that returned a photo of children rather than the captioned campus shot.
// We trimmed the pool to images we have visually verified through their use
// elsewhere in the app and explicitly want behind the dashboard greeting.
// Add a new URL only after eyeballing it — the captions on Unsplash are
// authored by the uploader and can lie about content.
const HERO_IMAGES = [
  // Stanford Memorial Arch / Main Quad — also used on the landing-page hero
  // mock card, so we know what it looks like in production.
  "https://images.unsplash.com/photo-1607237138185-eedd9c632b0b?auto=format&fit=crop&w=1600&q=80",
];

function DashboardHero({
  displayName, photoURL, credits, reportsCount, savedCount, onStart,
}: {
  displayName: string;
  photoURL?: string | null;
  credits: number;
  reportsCount: number;
  savedCount: number;
  onStart: () => void;
}) {
  const heroImg = HERO_IMAGES[new Date().getDate() % HERO_IMAGES.length];
  const greetingHour = new Date().getHours();
  const timeOfDay = greetingHour < 12 ? "Good morning" : greetingHour < 18 ? "Good afternoon" : "Good evening";
  const initial = (displayName?.[0] ?? "U").toUpperCase();

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[32px] h-[280px] sm:h-[340px] bg-slate-900"
    >
      {/* Background image with graceful fallback to slate-900 */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImg})` }}
        aria-hidden
      />
      {/* Gradient overlay for legible text */}
      <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/85 via-slate-900/60 to-transparent" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/40 pointer-events-none" aria-hidden />

      {/* Avatar top-right — uses saved photo when present, otherwise initial */}
      <div className="absolute top-5 right-5 z-10 w-11 h-11 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white font-bold shadow-lg overflow-hidden">
        {photoURL ? (
          <img src={photoURL} alt={displayName} className="w-full h-full object-cover" />
        ) : initial}
      </div>

      {/* Bottom-left content */}
      <div className="absolute inset-x-0 bottom-0 p-7 sm:p-9 z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
        <div className="min-w-0 max-w-xl">
          <p className="text-white/70 text-xs font-semibold mb-1 tracking-wide">{timeOfDay}</p>
          <h1 className="text-white text-3xl sm:text-4xl font-bold tracking-tight leading-[1.1] mb-2">
            {displayName}
          </h1>
          <p className="text-white/80 text-sm sm:text-[15px] leading-relaxed mb-5 hidden sm:block">
            Ready to find your next school match?
          </p>

          <button onClick={onStart}
            className="inline-flex items-center gap-2 bg-white text-slate-900 hover:bg-slate-100 font-semibold text-sm py-3 px-5 rounded-2xl transition-colors active:scale-[0.99] shadow-lg shadow-slate-900/30">
            <Plus size={15} /> Find my schools <ArrowRight size={14} />
          </button>
        </div>

        {/* Inline stat chips — quick at-a-glance */}
        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
          <HeroChip label="Credits" value={credits} />
          <HeroChip label="Reports" value={reportsCount} />
          <HeroChip label="Saved" value={savedCount} />
        </div>
      </div>
    </motion.section>
  );
}

function HeroChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/15 text-white text-[12px]">
      <span className="text-white/65">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

function StatTile({
  label, value, accent, icon, action, onAction,
}: {
  label: string;
  value: number;
  accent: string;
  icon: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 transition-colors flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white ${accent}`}>{icon}</div>
        <span className="text-xs font-semibold text-slate-600">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900 leading-none">{value}</span>
        {action && (
          <button onClick={onAction} className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-0.5">
            {action} <ChevronRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral card — earn 5 credits per friend who signs up
// ─────────────────────────────────────────────────────────────────────────────
function ReferralCard({ userId }: { userId: string | undefined }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    getOrCreateReferralCode(userId)
      .then(c => { if (mounted) setCode(c); })
      .catch(err => console.error("Referral code fetch failed:", err));
    return () => { mounted = false; };
  }, [userId]);

  const url = code ? buildReferralUrl(code) : "";
  const shareText = "I'm using College Ready to find a U.S. college match — sign up with my link and we both win.";

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
  };

  const shareLinks = url ? {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`,
    twitter:  `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`,
    email:    `mailto:?subject=${encodeURIComponent("Find your U.S. college match — College Ready")}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`,
  } : null;

  return (
    <FadeIn className="mb-8">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 relative overflow-hidden">
        {/* Decorative accent */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-100/60 rounded-full blur-3xl pointer-events-none" aria-hidden />

        <div className="relative flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/20">
            <Gift size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold tracking-tight text-slate-900">Refer friends, earn credits</h3>
            <p className="text-sm text-slate-500 leading-relaxed mt-0.5">
              You get <span className="font-semibold text-emerald-700">5 free credits</span> when a friend signs up with your link.
            </p>
          </div>
        </div>

        {/* Link row + copy button */}
        <div className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 mb-3">
          <p className="flex-1 min-w-0 text-sm text-slate-700 font-medium truncate">{url || "Generating your link…"}</p>
          <button
            onClick={handleCopy}
            disabled={!url}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              copied
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>

        {/* Social share row */}
        {shareLinks && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-500 mr-1">Share:</span>
            <ShareButton href={shareLinks.whatsapp} label="WhatsApp" emoji="💬" tone="emerald" />
            <ShareButton href={shareLinks.twitter}  label="X / Twitter" emoji="𝕏" tone="slate" />
            <ShareButton href={shareLinks.telegram} label="Telegram" icon={<Send size={12} />} tone="blue" />
            <ShareButton href={shareLinks.email}    label="Email" icon={<Mail size={12} />} tone="slate" />
          </div>
        )}

        <p className="text-[11px] text-slate-400 mt-4">
          Your code: <span className="font-mono font-semibold text-slate-600">{code || "…"}</span>
        </p>
      </div>
    </FadeIn>
  );
}

function ShareButton({ href, label, emoji, icon, tone = "slate" }: {
  href: string; label: string; emoji?: string; icon?: React.ReactNode;
  tone?: "slate" | "blue" | "emerald";
}) {
  const cls =
    tone === "blue"    ? "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
    : tone === "emerald" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
    : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${cls}`}
    >
      {emoji && <span aria-hidden className="text-sm leading-none">{emoji}</span>}
      {icon}
      {label}
    </a>
  );
}

function ReportRow({ report, onClick }: { report: any; onClick: () => void }) {
  // The report stores per-bucket arrays. Fall back to top10Matches → matches.
  const reach  = (report.bucketReach?.length  ?? 0) as number;
  const target = (report.bucketTarget?.length ?? 0) as number;
  const safety = (report.bucketSafety?.length ?? 0) as number;
  const top10 = report.top10Matches?.length;
  const bucketSum = reach + target + safety;
  const fallbackFromLegacy = ((report.matches || []) as any[]).filter((m: any) =>
    m.category === "Strong Fit" || m.category === "Good Fit" || m.category === "Exploratory Fit"
  ).length;
  const totalDisplayed = top10 ?? (bucketSum > 0 ? bucketSum : fallbackFromLegacy);

  const field = report.profileSnapshot?.field || report.profileSnapshot?.intendedMajor || "Unknown field";
  const level = report.profileSnapshot?.level || report.profileSnapshot?.degreeLevel || "Unknown level";
  const created = report.createdAt?.toDate?.() as Date | undefined;
  const dateStr = created
    ? created.toLocaleDateString(undefined, { month: "short", day: "numeric", year: created.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
    : "Recent";

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-slate-200 hover:border-slate-300 p-4 sm:p-5 transition-colors group flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 text-white flex items-center justify-center flex-shrink-0">
        <GraduationCap size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <h3 className="text-[15px] font-bold text-slate-900 truncate">{field}</h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{level}</span>
        </div>
        <p className="text-xs text-slate-500 truncate">
          {totalDisplayed} match{totalDisplayed === 1 ? "" : "es"} · {dateStr}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500 mr-1">
        {reach > 0  && <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{reach}</span>}
        {target > 0 && <span className="inline-flex items-center gap-1 ml-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{target}</span>}
        {safety > 0 && <span className="inline-flex items-center gap-1 ml-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{safety}</span>}
      </div>
      <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
    </button>
  );
}

function InterviewHistoryTab({
  reports, onOpen, onPractice,
}: {
  reports: any[];
  onOpen: (id: string) => void;
  onPractice: () => void;
}) {
  if (reports.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-[24px] flex items-center justify-center text-slate-400 mb-6 border-2 border-dashed border-slate-200">
            <Mic size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">No interview practice yet</h2>
          <p className="text-slate-500 font-medium max-w-md mb-6">
            Rehearse with Anna, our AI consular officer. Every practice session is scored and saved here so you can track your improvement.
          </p>
          <button
            onClick={onPractice}
            className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-5 py-3 rounded-2xl transition-colors active:scale-[0.99] shadow-lg shadow-slate-900/20"
          >
            <Mic size={14} /> Start a practice interview
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-500">
          {reports.length} practice session{reports.length === 1 ? "" : "s"} · most recent first
        </p>
        <button
          onClick={onPractice}
          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-full transition-colors active:scale-[0.99] shadow-md shadow-slate-900/20"
        >
          <Mic size={12} /> New practice
        </button>
      </div>

      <div className="space-y-3">
        {reports.map((r, i) => (
          <FadeInItem key={r.id} index={i}>
            <InterviewRow report={r} onClick={() => onOpen(r.id)} />
          </FadeInItem>
        ))}
      </div>
    </motion.div>
  );
}

function InterviewRow({ report, onClick }: { report: any; onClick: () => void }) {
  const overall = typeof report.overallScore === "number" ? report.overallScore : null;
  const created = report.createdAt?.toDate?.() as Date | undefined;
  const dateStr = created
    ? created.toLocaleDateString(undefined, { month: "short", day: "numeric", year: created.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
    : "Recent";

  // Score-colored dot. Mirrors the palette inside InterviewReportView so the
  // dashboard preview reads consistently with the detail page.
  const dotClass =
    overall == null    ? "bg-slate-300"
    : overall >= 80    ? "bg-emerald-500"
    : overall >= 60    ? "bg-blue-500"
    : overall >= 40    ? "bg-amber-500"
    :                    "bg-rose-500";

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-slate-200 hover:border-slate-300 p-4 sm:p-5 transition-colors group flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-900 to-blue-900 text-white flex items-center justify-center flex-shrink-0">
        <Mic size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <h3 className="text-[15px] font-bold text-slate-900 truncate">F-1 practice interview</h3>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
            {overall != null ? `${overall}/100` : "—"}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">
          With Anna · {dateStr}
        </p>
      </div>
      <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
    </button>
  );
}

function SavedSchoolsTab({ savedSchools, userId }: { savedSchools: any[], userId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRemove = async (unitId: string) => {
    if (!userId) return;
    setRemoving(unitId);
    try {
      const newSchools = savedSchools.filter(s => s.unitId !== unitId);
      await updateDoc(doc(db, "savedSchools", userId), { schools: newSchools });
    } catch (err) {
      console.error("Failed to remove school:", err);
    } finally {
      setRemoving(null);
    }
  };

  if (savedSchools.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <h2 className="text-lg font-black text-slate-900 mb-4">Your Saved Schools</h2>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-[24px] flex items-center justify-center text-slate-400 mb-6 border-2 border-dashed border-slate-200">
            <Bookmark size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">No Saved Schools</h2>
          <p className="text-slate-500 font-medium">When you view a match report, you can save schools to build your shortlist here.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-black text-slate-900">Your Saved Schools</h2>
        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black border border-emerald-100">
          {savedSchools.length} {savedSchools.length === 1 ? "school" : "schools"}
        </span>
      </div>

      {savedSchools.map((school) => {
        const isExpanded = expandedId === school.unitId;
        const isRemoving = removing === school.unitId;
        return (
          <div key={school.unitId} className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden">
            {/* Header row — clickable */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : school.unitId)}
              className="w-full flex items-center justify-between p-6 text-left hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-100 flex-shrink-0">
                  <Bookmark size={20} className="fill-current" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base group-hover:text-primary-600 transition-colors">{school.name}</h3>
                  <p className="text-sm font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin size={13} /> {school.city || "—"}, {school.state || "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronUp size={18} className="text-slate-400" />
                ) : (
                  <ChevronDown size={18} className="text-slate-400" />
                )}
              </div>
            </button>

            {/* Expanded details */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-6 border-t border-slate-100 pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Location</p>
                        <p className="font-bold text-sm text-slate-700">{school.city || "—"}, {school.state || "—"}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Type</p>
                        <p className="font-bold text-sm text-slate-700">{school.ownership || "—"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {school.schoolUrl && (
                        <a
                          href={school.schoolUrl.startsWith("http") ? school.schoolUrl : `https://${school.schoolUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                        >
                          <Globe size={16} /> Visit Website
                        </a>
                      )}
                      <button
                        onClick={() => handleRemove(school.unitId)}
                        disabled={isRemoving}
                        className="flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-3 px-5 rounded-xl transition-colors text-sm border border-rose-100 disabled:opacity-50"
                      >
                        {isRemoving ? (
                          <div className="w-4 h-4 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        Remove
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </motion.div>
  );
}

