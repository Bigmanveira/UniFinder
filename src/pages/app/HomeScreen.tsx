import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  FolderOpen,
  GraduationCap,
  Lightbulb,
  MessageCircle,
} from "lucide-react";
import { useAppData } from "../../hooks/useAppData";
import { TabScreen } from "../../components/layout/AppShell";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import AppFooter from "../../components/layout/AppFooter";
import FeedbackSurveyModal, { type SurveyTrigger } from "../../components/FeedbackSurveyModal";
import { ROADMAP_STAGES, ROADMAP_STAGE_ORDER } from "../../lib/roadmap/studyAbroad";
import { formatTokens } from "../../lib/tokens";
import type { SchoolMatch } from "../../types";

// Legacy `?tab=` deep links (Paystack returnUrl, old emails) — those tabs are
// standalone routes now; redirect while PRESERVING remaining params so
// `paid=1` survives the hop to /app/billing.
const TAB_ROUTES: Record<string, string> = {
  saved: "/app/saved",
  billing: "/app/billing",
  profile: "/app/profile",
  interviews: "/app/interviews",
};

const VALID_SURVEY_TRIGGERS = new Set<SurveyTrigger>(["match_report", "visa_interview"]);

// Card width (220) + gap (12) — used to map scroll position ↔ dot index.
const RAIL_STRIDE = 232;

export default function HomeScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const railRef = useRef<HTMLDivElement>(null);
  const [railPage, setRailPage] = useState(0);
  // rAF-coalesced: onScroll fires every frame of a touch fling, and this
  // screen consumes useAppData(), so an unguarded setState per event was
  // re-rendering the whole subtree at 60–120 Hz on phones. One read per
  // frame, and setRailPage's identity-bail skips renders when the dot
  // index hasn't changed.
  const railTickRef = useRef(false);
  const handleRailScroll = () => {
    if (railTickRef.current) return;
    railTickRef.current = true;
    requestAnimationFrame(() => {
      railTickRef.current = false;
      const el = railRef.current;
      if (!el) return;
      setRailPage(Math.max(0, Math.round(el.scrollLeft / RAIL_STRIDE)));
    });
  };
  const {
    credits, isFounder, matchReports, interviewReports, savedSchools,
    studyRoadmap, studyRoadmapLoaded, username,
  } = useAppData();

  // Feedback deep-link (/app?survey=<trigger>&ref=<id>): consume once, open
  // the survey modal, strip params so refresh doesn't re-prompt.
  const [surveyPrompt, setSurveyPrompt] = useState<{ trigger: SurveyTrigger; triggerId?: string } | null>(null);
  useEffect(() => {
    const requested = searchParams.get("survey") as SurveyTrigger | null;
    if (requested && VALID_SURVEY_TRIGGERS.has(requested)) {
      setSurveyPrompt({ trigger: requested, triggerId: searchParams.get("ref") ?? undefined });
    }
    if (searchParams.has("survey") || searchParams.has("ref")) {
      const next = new URLSearchParams(searchParams);
      next.delete("survey");
      next.delete("ref");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestedTab = searchParams.get("tab");
  if (requestedTab && TAB_ROUTES[requestedTab]) {
    const rest = new URLSearchParams(searchParams);
    rest.delete("tab");
    const suffix = rest.toString();
    return <Navigate to={`${TAB_ROUTES[requestedTab]}${suffix ? `?${suffix}` : ""}`} replace />;
  }

  const firstName = username.split(/[\s.@_-]/)[0] || username;
  const latestReport = matchReports[0];
  const newMatchCount = latestReport
    ? (latestReport.top10Matches?.length ??
       ((latestReport.bucketReach?.length ?? 0) + (latestReport.bucketTarget?.length ?? 0) + (latestReport.bucketSafety?.length ?? 0)))
    : 0;

  const stageMeta = studyRoadmap ? ROADMAP_STAGES[studyRoadmap.currentStage] : null;
  const stageNumber = studyRoadmap ? ROADMAP_STAGE_ORDER.indexOf(studyRoadmap.currentStage) + 1 : 0;
  const progress = studyRoadmap ? Math.min(studyRoadmap.progressPercentage, 100) : 0;

  // Recently-viewed rail: saved schools first, else the latest report's top matches.
  const recentSchools: Array<{ key: string; name: string; sub: string; badge?: string }> =
    savedSchools.length > 0
      ? savedSchools.slice(0, 6).map((s: any) => ({
          key: s.unitId,
          name: s.name,
          sub: [s.city, s.state].filter(Boolean).join(", ") || "United States",
        }))
      : ((latestReport?.top10Matches ?? latestReport?.bucketTarget ?? []) as SchoolMatch[])
          .slice(0, 6)
          .map((m) => ({
            key: m.school.unitId,
            name: m.school.name,
            sub: [m.school.city, m.school.state].filter(Boolean).join(", ") || "United States",
            badge: `${m.matchScore}% match`,
          }));

  return (
    <TabScreen>
      <ScreenHeader
        eyebrow="Your study journey"
        title={<>Hi, {firstName} <span className="inline-block">👋</span></>}
        subtitle="Your next step is waiting for you."
      />

      {/* Journey progress hero — navy card with ring decor */}
      <section className="relative mb-6 overflow-hidden rounded-card bg-ink p-5 text-white shadow-[0_12px_32px_-8px_rgba(26,33,56,0.18)]">
        <div aria-hidden className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[18px] border-primary-500/20" />
        <div className="relative">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary-500" />
              <span className="text-xs font-bold uppercase tracking-wide">
                {stageMeta ? stageMeta.short : "Your roadmap"}
              </span>
            </div>
            <span className="text-sm font-black">{studyRoadmap ? `${progress}%` : "New"}</span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-primary-500 transition-all duration-700" style={{ width: `${studyRoadmap ? progress : 4}%` }} />
          </div>
          {studyRoadmap && stageMeta ? (
            <>
              <h2 className="mb-1 text-lg font-black tracking-tight">
                {progress >= 60 ? "You're making great progress." : `Stage ${stageNumber} of ${ROADMAP_STAGE_ORDER.length}: ${stageMeta.title}.`}
              </h2>
              <p className="mb-4 text-xs font-medium text-white/65">{stageMeta.description}</p>
              <Link
                to="/app/roadmap"
                className="inline-flex items-center gap-2 rounded-full bg-primary-500 px-4 py-2.5 text-xs font-bold text-white shadow-glow transition-colors hover:bg-primary-600"
              >
                Continue prep <ArrowUpRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <h2 className="mb-1 text-lg font-black tracking-tight">Let's build your plan.</h2>
              <p className="mb-4 text-xs font-medium text-white/65">
                Six quick questions create your personal study-abroad roadmap.
              </p>
              <Link
                to="/app/roadmap/onboarding"
                className="inline-flex items-center gap-2 rounded-full bg-primary-500 px-4 py-2.5 text-xs font-bold text-white shadow-glow transition-colors hover:bg-primary-600"
              >
                {studyRoadmapLoaded ? "Start my roadmap" : "Loading…"} <ArrowUpRight size={16} />
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section className="mb-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">Quick actions</h2>
          <span className="text-xs font-bold text-slate-500">
            {isFounder ? "∞" : formatTokens(credits)} tokens
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/intake"
            className="flex min-h-[132px] flex-col justify-between rounded-[24px] border border-slate-100 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
              <GraduationCap size={20} />
            </div>
            <div>
              <p className="text-sm font-black">Find school matches</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                2-minute quiz · instant shortlist
              </p>
            </div>
          </Link>
          <Link
            to="/app/matches"
            className="flex min-h-[132px] flex-col justify-between rounded-[24px] border border-slate-100 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink/5 text-ink">
              <FolderOpen size={20} />
            </div>
            <div>
              <p className="text-sm font-black">My matches</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                {newMatchCount > 0 ? `${newMatchCount} matches ready` : "No report yet — run the quiz"}
              </p>
            </div>
          </Link>
          <Link
            to="/app/visa-interview"
            className="col-span-2 flex items-center justify-between rounded-[24px] bg-primary-500 p-4 text-white shadow-glow transition-colors hover:bg-primary-600"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                <MessageCircle size={20} />
              </div>
              <div>
                <p className="text-sm font-black">Practice visa interview</p>
                <p className="mt-1 text-[11px] font-medium text-white/75">
                  {interviewReports.length > 0
                    ? `Last score ${interviewReports[0]?.overallScore ?? "—"}/100 · beat it`
                    : "Get AI feedback in 10 min"}
                </p>
              </div>
            </div>
            <ChevronRight size={20} />
          </Link>
        </div>
      </section>

      {/* Insight */}
      <section className="mb-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">Your insights</h2>
          <Link to="/app/matches" className="text-xs font-bold text-primary-500">See all</Link>
        </div>
        <div className="flex gap-3 rounded-[24px] border border-slate-100 bg-white p-4 shadow-card">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF7DE] text-[#F5A623]">
            <Lightbulb size={20} />
          </div>
          <InsightCopy
            reports={matchReports.length}
            interviews={interviewReports.length}
            saved={savedSchools.length}
            hasRoadmap={!!studyRoadmap}
          />
        </div>
      </section>

      {/* Recently viewed rail */}
      <section className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">
            {savedSchools.length > 0 ? "Saved schools" : "Recently matched"}
          </h2>
          <Link to={savedSchools.length > 0 ? "/app/saved" : "/app/discover"} className="text-xs font-bold text-primary-500">
            View all
          </Link>
        </div>
        {recentSchools.length === 0 ? (
          <Link
            to="/intake"
            className="block rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-card transition-colors hover:border-primary-300"
          >
            <p className="text-sm font-black text-slate-900">No schools yet</p>
            <p className="mt-1 text-xs font-medium text-slate-500">Run the 2-minute match quiz to fill this shelf.</p>
          </Link>
        ) : (
          <>
            {/* Swipe rail: hidden scrollbar + snap points; the dot row below
                tracks scroll position and doubles as tap-to-jump pagination. */}
            <div
              ref={railRef}
              onScroll={handleRailScroll}
              className="no-scrollbar -mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-6 px-6 pb-2"
            >
              {recentSchools.map((s) => (
                <div key={s.key} className="w-[220px] shrink-0 snap-start rounded-[24px] border border-slate-100 bg-white p-4 shadow-card">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-100 text-sm font-black text-primary-500">
                      {initialsOf(s.name)}
                    </div>
                    {s.badge && <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold">{s.badge}</span>}
                  </div>
                  <p className="truncate text-sm font-black">{s.name}</p>
                  <p className="mt-1 truncate text-xs font-medium text-slate-500">{s.sub}</p>
                </div>
              ))}
            </div>
            {recentSchools.length > 1 && (
              <div className="mt-3 flex justify-center gap-1.5">
                {recentSchools.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-label={`Go to school ${i + 1}`}
                    onClick={() => railRef.current?.scrollTo({ left: i * RAIL_STRIDE, behavior: "smooth" })}
                    className={`h-1.5 rounded-full transition-all ${i === railPage ? "w-4 bg-primary-500" : "w-1.5 bg-slate-300"}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {surveyPrompt && (
        <FeedbackSurveyModal
          open
          trigger={surveyPrompt.trigger}
          triggerId={surveyPrompt.triggerId}
          onClose={() => setSurveyPrompt(null)}
        />
      )}

      <AppFooter />
    </TabScreen>
  );
}

function initialsOf(name: string): string {
  const words = name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** One data-driven nudge — picks the most useful next step, no fabrication. */
function InsightCopy({
  reports, interviews, saved, hasRoadmap,
}: {
  reports: number; interviews: number; saved: number; hasRoadmap: boolean;
}) {
  let title: string;
  let body: string;
  if (!hasRoadmap) {
    title = "Start with your roadmap";
    body = "Answering the six diagnostic questions unlocks stage-by-stage guidance tuned to where you are.";
  } else if (reports === 0) {
    title = "Your profile is ready for matching";
    body = "Run the match quiz to turn your profile into a ranked shortlist of Reach, Target, and Safety schools.";
  } else if (interviews === 0) {
    title = "Your matches are ahead of your visa prep";
    body = "Most applicants underestimate the interview. A 10-minute practice session with Anna shows you exactly where you stand.";
  } else if (saved === 0) {
    title = "Shortlist your favourites";
    body = "Saving schools from your match report builds the board you'll work from during applications.";
  } else {
    title = "You're covering every angle";
    body = `${reports} match report${reports === 1 ? "" : "s"}, ${interviews} interview session${interviews === 1 ? "" : "s"}, and ${saved} saved school${saved === 1 ? "" : "s"} — keep the momentum on your current stage.`;
  }
  return (
    <div>
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{body}</p>
    </div>
  );
}
