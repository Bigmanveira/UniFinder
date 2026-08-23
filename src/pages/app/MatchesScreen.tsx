import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileText,
  Gem,
  MapPin,
  Plus,
  Target,
} from "lucide-react";
import { useAppData } from "../../hooks/useAppData";
import { TabScreen } from "../../components/layout/AppShell";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import AppFooter from "../../components/layout/AppFooter";
import SchoolCardArt from "../../components/schools/SchoolCardArt";
import type { SchoolMatch } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// MatchesScreen — the mockups' "Top Matches" tab on the user's real match
// reports: profile summary card, rich match cards from the latest report,
// and a "hidden gem" (best-funded safety) callout.
// ─────────────────────────────────────────────────────────────────────────────

const VISIBLE_BATCH = 4;

export default function MatchesScreen() {
  const navigate = useNavigate();
  const { matchReports } = useAppData();
  const [visible, setVisible] = useState(VISIBLE_BATCH);

  const latest = matchReports[0];

  const allMatches: SchoolMatch[] = useMemo(() => {
    if (!latest) return [];
    const top10: SchoolMatch[] | undefined = latest.top10Matches;
    if (top10?.length) return top10;
    return [
      ...(latest.bucketTarget ?? []),
      ...(latest.bucketSafety ?? []),
      ...(latest.bucketReach ?? []),
    ];
  }, [latest]);

  // "Hidden gem": the safety/target match with the best budget fit.
  const gem = useMemo(() => {
    const pool = allMatches.filter(
      (m) => m.admissionBucket !== "reach" && (m.budgetFit === "Excellent" || m.budgetFit === "Good"),
    );
    return pool.sort((a, b) => (b.admissionLikelihood ?? 0) - (a.admissionLikelihood ?? 0))[0] ?? null;
  }, [allMatches]);

  const profile = latest?.profileSnapshot;
  const profileLine = profile
    ? [profile.field ?? profile.intendedMajor, profile.level ?? profile.degreeLevel].filter(Boolean).join(" · ")
    : null;

  return (
    <TabScreen>
      <ScreenHeader
        eyebrow="AI match engine"
        title="Top Matches"
        action={
          <button
            type="button"
            onClick={() => navigate("/intake")}
            className="group relative inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-primary-500 px-4 py-2.5 text-sm font-bold text-white shadow-glow transition-transform hover:scale-105 hover:bg-primary-600 active:scale-95"
          >
            {/* Animated sheen — sweeps across the pill on hover */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
            />
            <Plus size={15} />
            New match
          </button>
        }
      />

      {/* Profile summary / refine card */}
      <div className="mb-6 flex items-center justify-between rounded-card border border-slate-100 bg-white p-4 shadow-card">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
            <Target size={20} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-900">
              {profileLine ? `Matched for ${profileLine}` : "No matches generated yet"}
            </p>
            <p className="truncate text-[11px] font-medium text-slate-500">
              {profile?.gpa ? `Based on your GPA (${profile.gpa})` : "Run the 2-minute quiz to get your shortlist"}
            </p>
          </div>
        </div>
        <Link to="/intake" className="shrink-0 text-xs font-bold text-primary-500 underline underline-offset-2">
          {latest ? "Refine" : "Start"}
        </Link>
      </div>

      {!latest ? (
        <EmptyState />
      ) : (
        <>
          {/* Match cards */}
          <div className="mb-8 space-y-5">
            {allMatches.slice(0, visible).map((m) => (
              <MatchCard key={m.school.unitId} match={m} onOpen={() => navigate(`/app/reports/${latest.id}`)} />
            ))}
          </div>

          {visible < allMatches.length && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + VISIBLE_BATCH)}
              className="mb-8 w-full rounded-full border border-slate-200 bg-white py-3 text-sm font-bold text-slate-900 shadow-card transition-colors hover:bg-slate-50"
            >
              Show more matches ({allMatches.length - visible} left)
            </button>
          )}

          {/* Hidden gem */}
          {gem && (
            <section className="mb-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black tracking-tight">Hidden Gem</h2>
                  <p className="text-xs font-medium text-slate-500">Strong odds &amp; budget fit</p>
                </div>
                <Gem size={20} className="text-primary-500" />
              </div>
              <div className="rounded-card border border-slate-100 bg-white p-4 shadow-card">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mb-1 inline-block rounded-md bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow text-primary-600">
                      {gem.budgetFit} budget fit
                    </span>
                    <h3 className="truncate text-base font-black">{gem.school.name}</h3>
                    <p className="text-xs font-medium text-slate-500">
                      {[gem.school.city, gem.school.state].filter(Boolean).join(", ") || "United States"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-black">{gem.matchScore}% match</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs font-black text-slate-900">
                    {gem.admissionLikelihood != null ? `${gem.admissionLikelihood}% admission likelihood` : gem.academicFit}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/reports/${latest.id}`)}
                    className="flex items-center gap-1 text-xs font-bold text-primary-500"
                  >
                    Explore in report <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Older reports */}
          {matchReports.length > 1 && (
            <p className="mb-4 text-center text-xs font-medium text-slate-500">
              {matchReports.length - 1} older report{matchReports.length === 2 ? "" : "s"} —{" "}
              <Link to={`/app/reports/${matchReports[1].id}`} className="font-bold text-primary-500">open previous</Link>
            </p>
          )}
        </>
      )}

      <AppFooter />
    </TabScreen>
  );
}

function MatchCard({ match, onOpen }: { match: SchoolMatch; onOpen: () => void }) {
  const { school } = match;
  const reasons: string[] = [];
  if (match.admissionLikelihood != null) reasons.push(`${match.admissionLikelihood}% estimated admission likelihood for your profile`);
  else reasons.push(`${match.academicFit} academic fit for your profile`);
  if (match.budgetFit === "Excellent" || match.budgetFit === "Good") reasons.push(`${match.budgetFit} fit for your stated budget`);
  else if (school.admissionRate != null) reasons.push(`${Math.round(school.admissionRate * 100)}% overall acceptance rate`);

  const cost = school.averageCost ?? school.outOfStateTuition ?? school.inStateTuition;

  return (
    <article className="rounded-card-lg border border-slate-100 bg-white p-4 shadow-card">
      <div className="relative mb-3 h-44 w-full overflow-hidden rounded-2xl">
        <SchoolCardArt unitId={school.unitId} schoolUrl={school.schoolUrl} name={school.name} className="h-full w-full" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-ink/95 px-3 py-1.5 text-white shadow-lg">
          <BadgeCheck size={14} className="text-primary-400" />
          <span className="text-xs font-bold">{match.matchScore}% Match</span>
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-eyebrow text-slate-700 shadow-md">
          {match.admissionBucket ?? match.category}
        </span>
      </div>
      <div className="px-1">
        <h3 className="text-lg font-black tracking-tight">{school.name}</h3>
        <p className="mb-3 mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
          <MapPin size={13} /> {[school.city, school.state].filter(Boolean).join(", ") || "United States"} · {school.ownership || "University"}
        </p>
        <div className="mb-4 space-y-1.5 rounded-2xl border border-slate-100 bg-surface p-3">
          {reasons.slice(0, 2).map((r) => (
            <div key={r} className="flex items-center gap-2 text-xs font-medium text-slate-900">
              <CheckCircle2 size={16} className="shrink-0 text-[#2E7D32]" />
              <span>{r}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-eyebrow text-slate-500">Est. cost</span>
            <span className="text-base font-black">
              {cost != null ? <>${cost.toLocaleString()}<span className="text-xs font-medium text-slate-500">/yr</span></> : "—"}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full bg-primary-500 px-5 py-2.5 text-xs font-bold text-white shadow-glow transition-colors hover:bg-primary-600"
          >
            Open full report
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card-lg border border-slate-100 bg-white p-8 text-center shadow-card">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
        <FileText size={24} />
      </div>
      <h2 className="text-lg font-black tracking-tight">No matches yet</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-6 text-slate-500">
        Answer six quick questions about your grades, budget, and goals — the AI turns them into a ranked shortlist.
      </p>
      <Link
        to="/intake"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-500 px-6 py-3 text-sm font-bold text-white shadow-glow transition-colors hover:bg-primary-600"
      >
        Find my schools <ArrowRight size={15} />
      </Link>
    </div>
  );
}
