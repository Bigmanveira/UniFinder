import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  Briefcase,
  ChevronDown,
  Code2,
  Dna,
  MapPin,
  Palette,
  Search,
  RotateCcw,
} from "lucide-react";
import { getActiveSchools } from "../../lib/schools/getSchools";
import { TabScreen } from "../../components/layout/AppShell";
import { ScreenHeader, HeaderIconButton } from "../../components/layout/ScreenHeader";
import AppFooter from "../../components/layout/AppFooter";
import SchoolCardArt from "../../components/schools/SchoolCardArt";
import type { School } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// DiscoverScreen — live school directory. Single vertical flow: search pill,
// filter row, a 2-up featured grid, a 4-up fields grid, then the paged
// directory. Deliberately NO horizontal scroll rails — every section stacks,
// so the only scroll on this screen is the page itself.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

type Ownership = "all" | "Public" | "Private";

const FIELDS = [
  { label: "Engineering", icon: Code2 },
  { label: "Business", icon: Briefcase },
  { label: "Design", icon: Palette },
  { label: "Health", icon: Dna },
] as const;

const TUITION_OPTIONS = [
  { value: "", label: "Any tuition" },
  { value: "20000", label: "Under $20k" },
  { value: "35000", label: "Under $35k" },
  { value: "50000", label: "Under $50k" },
  { value: "75000", label: "Under $75k" },
] as const;

export default function DiscoverScreen() {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [error, setError] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [maxTuition, setMaxTuition] = useState<number | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    let mounted = true;
    getActiveSchools()
      .then((list) => { if (mounted) setSchools(list); })
      .catch(() => { if (mounted) setError(true); });
    return () => { mounted = false; };
  }, []);

  // Distinct states present in the live dataset, alphabetised.
  const states = useMemo(() => {
    if (!schools) return [];
    return [...new Set(schools.map((s) => s.state).filter((v): v is string => !!v))].sort();
  }, [schools]);

  const filtered = useMemo(() => {
    if (!schools) return [];
    const q = queryText.trim().toLowerCase();
    return schools.filter((s) => {
      if (q && !`${s.name} ${s.city ?? ""} ${s.state ?? ""}`.toLowerCase().includes(q)) return false;
      if (stateFilter !== "all" && s.state !== stateFilter) return false;
      if (ownership !== "all" && !(s.ownership ?? "").toLowerCase().includes(ownership.toLowerCase())) return false;
      if (maxTuition != null) {
        const tuition = s.outOfStateTuition ?? s.inStateTuition;
        if (tuition == null || tuition > maxTuition) return false;
      }
      return true;
    });
  }, [schools, queryText, stateFilter, ownership, maxTuition]);

  const filtersActive = stateFilter !== "all" || ownership !== "all" || maxTuition != null || queryText.trim() !== "";
  const resetFilters = () => {
    setStateFilter("all");
    setOwnership("all");
    setMaxTuition(null);
    setQueryText("");
    setVisible(PAGE_SIZE);
  };

  // Featured pair: most selective schools with complete data.
  const featured = useMemo(() => {
    if (!schools) return [];
    return [...schools]
      .filter((s) => s.admissionRate != null && (s.outOfStateTuition ?? s.inStateTuition) != null)
      .sort((a, b) => (a.admissionRate ?? 1) - (b.admissionRate ?? 1))
      .slice(0, 2);
  }, [schools]);

  const searching = queryText.trim().length > 0;
  const shown = filtered.slice(0, visible);

  return (
    <TabScreen>
      <ScreenHeader
        eyebrow="Explore programs"
        title="Discover Schools"
        action={
          filtersActive ? (
            <HeaderIconButton icon={<RotateCcw size={18} />} label="Reset all filters" onClick={resetFilters} />
          ) : undefined
        }
      />

      {/* Search pill */}
      <div className="mb-4 flex items-center rounded-full border border-slate-100 bg-white p-2 pl-4 shadow-card">
        <Search size={20} className="shrink-0 text-slate-500" />
        <input
          type="text"
          value={queryText}
          onChange={(e) => { setQueryText(e.target.value); setVisible(PAGE_SIZE); }}
          placeholder="Search school, city, or state..."
          className="min-w-0 flex-1 border-none bg-transparent px-3 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-500"
        />
      </div>

      {/* Filter row — real select-backed pill filters, wraps instead of scrolling */}
      <div className="mb-7 flex flex-wrap gap-2">
        <SelectPill
          label="State"
          value={stateFilter}
          active={stateFilter !== "all"}
          onChange={(v) => { setStateFilter(v); setVisible(PAGE_SIZE); }}
          options={[{ value: "all", label: "All states" }, ...states.map((s) => ({ value: s, label: s }))]}
        />
        <SelectPill
          label="Ownership"
          value={ownership}
          active={ownership !== "all"}
          onChange={(v) => { setOwnership(v as Ownership); setVisible(PAGE_SIZE); }}
          options={[
            { value: "all", label: "Public & private" },
            { value: "Public", label: "Public" },
            { value: "Private", label: "Private" },
          ]}
        />
        <SelectPill
          label="Tuition"
          value={maxTuition == null ? "" : String(maxTuition)}
          active={maxTuition != null}
          onChange={(v) => { setMaxTuition(v === "" ? null : Number(v)); setVisible(PAGE_SIZE); }}
          options={TUITION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>

      {/* Featured pair — hidden while searching so results lead */}
      {!searching && (
        <section className="mb-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight">Featured Institutions</h2>
            <span className="text-xs font-bold text-primary-500">Most selective</span>
          </div>
          {schools === null && !error ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => <div key={i} className="h-64 animate-pulse rounded-card-lg bg-white shadow-card" />)}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {featured.map((s) => (
                <article key={s.unitId} className="flex flex-col justify-between rounded-card-lg border border-slate-100 bg-white p-4 shadow-card">
                  <div>
                    <div className="relative mb-3 h-32 w-full overflow-hidden rounded-2xl">
                      <SchoolCardArt unitId={s.unitId} schoolUrl={s.schoolUrl} name={s.name} className="h-full w-full" />
                      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-white shadow-md">
                        <Award size={12} className="text-primary-400" />
                        <span className="text-[11px] font-bold">
                          {s.admissionRate != null ? `${Math.round(s.admissionRate * 100)}% accept` : "Selective"}
                        </span>
                      </div>
                    </div>
                    <h3 className="text-base font-black leading-tight">{s.name}</h3>
                    <p className="mb-2 mt-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                      <MapPin size={13} /> {[s.city, s.state].filter(Boolean).join(", ") || "United States"}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-eyebrow text-slate-500">Annual tuition</span>
                      <span className="text-sm font-black">{formatTuition(s)}</span>
                    </div>
                    <SchoolLink school={s} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Popular fields — fixed 4-up grid, no rail */}
      {!searching && (
        <section className="mb-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight">Popular Fields</h2>
            <span className="text-xs font-bold text-slate-500">Match quiz picks yours</span>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {FIELDS.map(({ label, icon: Icon }) => (
              <Link
                key={label}
                to="/intake"
                className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white px-2 py-3.5 shadow-card transition-shadow hover:shadow-card-hover"
              >
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
                  <Icon size={20} />
                </div>
                <span className="text-xs font-bold">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Directory */}
      <section className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">
            {searching ? "Results" : "All Schools"}{schools ? ` (${filtered.length})` : ""}
          </h2>
          <span className="flex items-center gap-0.5 text-xs font-bold text-slate-500">
            Sort: <span className="flex items-center gap-0.5 text-slate-900">A–Z <ChevronDown size={14} /></span>
          </span>
        </div>

        {error && (
          <div className="rounded-card border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            Couldn't load the school directory. Refresh to try again.
          </div>
        )}

        {schools === null && !error && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-card bg-white shadow-card" />)}
          </div>
        )}

        <div className="space-y-3">
          {shown.map((s) => (
            <article key={s.unitId} className="rounded-card border border-slate-100 bg-white p-4 shadow-card">
              <div className="mb-1.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black">{s.name}</h3>
                  <p className="text-xs font-medium text-slate-500">
                    {[s.city, s.state].filter(Boolean).join(", ") || "United States"} · {s.ownership || "—"}
                  </p>
                </div>
                {s.admissionRate != null && (
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold">
                    {Math.round(s.admissionRate * 100)}% accept
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-eyebrow text-slate-500">Tuition / yr</span>
                  <span className="text-sm font-black">{formatTuition(s)}</span>
                </div>
                <SchoolLink school={s} outline />
              </div>
            </article>
          ))}
        </div>

        {schools && filtered.length === 0 && !error && (
          <div className="rounded-card border border-dashed border-slate-300 bg-white p-6 text-center shadow-card">
            <p className="text-sm font-black">No schools match those filters</p>
            <p className="mt-1 text-xs font-medium text-slate-500">Try clearing the tuition or ownership filter.</p>
          </div>
        )}

        {schools && visible < filtered.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="mt-4 w-full rounded-full border border-slate-200 bg-white py-3 text-sm font-bold text-slate-900 shadow-card transition-colors hover:bg-slate-50"
          >
            Show more ({filtered.length - visible} left)
          </button>
        )}
      </section>

      <AppFooter />
    </TabScreen>
  );
}

/**
 * SelectPill — a pill that IS a working filter: a native <select> stretched
 * invisibly over the pill so taps open the platform picker (accessible,
 * keyboard-friendly, mobile-native). Shows the chosen value once active.
 */
function SelectPill({
  label, value, active, onChange, options,
}: {
  label: string;
  value: string;
  active?: boolean;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <label
      className={`relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
        active ? "bg-ink text-white" : "border border-slate-100 bg-white text-slate-900 shadow-card"
      }`}
    >
      {active && current ? current.label : label}
      <ChevronDown size={14} aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Filter by ${label.toLowerCase()}`}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function SchoolLink({ school, outline }: { school: School; outline?: boolean }) {
  const href = school.schoolUrl
    ? (school.schoolUrl.startsWith("http") ? school.schoolUrl : `https://${school.schoolUrl}`)
    : null;
  const classes = outline
    ? "rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-50"
    : "rounded-full bg-primary-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-glow transition-colors hover:bg-primary-600";
  if (!href) {
    return <Link to="/intake" className={classes}>Match me</Link>;
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>Visit</a>;
}

function formatTuition(s: School): string {
  const t = s.outOfStateTuition ?? s.inStateTuition ?? s.averageCost;
  return t != null ? `$${t.toLocaleString()}` : "—";
}
