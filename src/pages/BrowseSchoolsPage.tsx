import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getActiveSchools } from "../lib/schools/getSchools";
import type { School } from "../types";
import {
  GraduationCap, MapPin, Building, DollarSign, Search,
  ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { FadeIn, FadeInItem } from "../components/FadeIn";

const PAGE_SIZE = 24;

export default function BrowseSchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [query,    setQuery]    = useState("");
  const [stateF,   setStateF]   = useState("");
  const [ownerF,   setOwnerF]   = useState("");
  const [page,     setPage]     = useState(0);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getActiveSchools();
        setSchools(data);
      } catch (err: any) {
        console.error(err);
        setError(`Failed to load schools: ${err.message || "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Reset to page 0 whenever filters change
  useEffect(() => { setPage(0); }, [query, stateF, ownerF]);

  // Distinct values for the filter dropdowns
  const stateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of schools) if (s.state) set.add(s.state);
    return Array.from(set).sort();
  }, [schools]);

  const ownershipOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of schools) if (s.ownership) set.add(s.ownership);
    return Array.from(set).sort();
  }, [schools]);

  // Apply filters
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schools.filter(s => {
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (stateF && s.state !== stateF) return false;
      if (ownerF && s.ownership !== ownerF) return false;
      return true;
    });
  }, [schools, query, stateF, ownerF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const pageItems  = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const goTo       = (p: number) => setPage(Math.max(0, Math.min(totalPages - 1, p)));

  // Build a small windowed page list (e.g. 1 … 4 5 [6] 7 8 … 99)
  const pageWindow = useMemo(() => {
    const window: (number | "…")[] = [];
    const push = (x: number | "…") => { if (window[window.length - 1] !== x) window.push(x); };
    const around = 1;
    push(0);
    if (safePage - around > 1) push("…");
    for (let i = Math.max(1, safePage - around); i <= Math.min(totalPages - 2, safePage + around); i++) {
      push(i);
    }
    if (safePage + around < totalPages - 2) push("…");
    if (totalPages > 1) push(totalPages - 1);
    return window;
  }, [safePage, totalPages]);

  const hasFilters = query || stateF || ownerF;
  const clearFilters = () => { setQuery(""); setStateF(""); setOwnerF(""); };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24 selection:bg-primary-500 selection:text-white">
      {/* Header */}
      <header className="p-6 flex justify-between items-center max-w-6xl mx-auto relative z-20">
        <Link to="/" className="flex items-center gap-2 text-slate-900 group">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center text-white shadow-lg shadow-primary-600/20 group-hover:scale-105 transition-transform">
            <GraduationCap size={22} />
          </div>
          <span className="text-xl font-black tracking-tight">College Ready</span>
        </Link>
        <Link to="/login" className="text-sm font-bold text-slate-600 hover:text-primary-600 transition-colors">Log In</Link>
      </header>

      <main className="max-w-6xl mx-auto px-6 mt-4">
        {/* Hero */}
        <FadeIn className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-3">Browse schools</h1>
          <p className="text-slate-500 font-medium">
            {loading ? "Loading…" : `${schools.length.toLocaleString()} active US institutions from the College Scorecard.`}
          </p>
        </FadeIn>

        {/* Filter bar */}
        <div className="bg-white border border-slate-100 rounded-[24px] p-4 sm:p-5 shadow-sm mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name (e.g. Berkeley)…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={stateF}
            onChange={(e) => setStateF(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All states</option>
            {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={ownerF}
            onChange={(e) => setOwnerF(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All ownership</option>
            {ownershipOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-500 transition-colors px-2">
              <X size={13} /> Clear
            </button>
          )}
        </div>

        {/* States */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-primary-600 rounded-full animate-spin mb-4" />
            <p className="text-slate-500 font-bold tracking-widest text-sm uppercase">Loading database…</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-rose-50 text-rose-600 p-6 rounded-2xl text-center font-bold border border-rose-100">{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20 bg-white rounded-[24px] border border-slate-100">
            <Building size={48} className="mx-auto text-slate-300 mb-4" />
            <h2 className="text-xl font-black text-slate-900 mb-2">No schools match your filters</h2>
            <p className="text-slate-500 font-medium">Try a different name, state, or ownership type.</p>
          </div>
        )}

        {/* Result count + page indicator */}
        {!loading && !error && filtered.length > 0 && (
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-4 px-1">
            <span>
              Showing <span className="text-slate-900">{safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)}</span> of <span className="text-slate-900">{filtered.length.toLocaleString()}</span>
            </span>
            <span>Page {safePage + 1} / {totalPages}</span>
          </div>
        )}

        {/* Grid */}
        {!loading && !error && pageItems.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pageItems.map((school, i) => (
              <FadeInItem
                key={school.unitId}
                index={i}
                className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 hover:shadow-xl hover:border-primary-200 transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 border border-primary-100 group-hover:scale-110 transition-transform">
                    <Building size={20} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-3 py-1 rounded-full">
                    {school.ownership}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 leading-tight mb-2 group-hover:text-primary-600 transition-colors">
                  {school.name}
                </h3>
                <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5 mb-6">
                  <MapPin size={14} /> {school.city}, {school.state}
                </p>
                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-100">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Admissions</p>
                    <p className="font-bold text-slate-900">
                      {school.admissionRate ? `${Math.round(school.admissionRate * 100)}%` : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg cost</p>
                    <p className="font-bold text-emerald-600 flex items-center">
                      <DollarSign size={14} />
                      {school.averageCost ? school.averageCost.toLocaleString() : "N/A"}
                    </p>
                  </div>
                </div>
                {school.schoolUrl && (
                  <a href={school.schoolUrl} target="_blank" rel="noreferrer"
                    className="block text-center mt-6 py-3 w-full bg-slate-50 text-slate-600 font-bold text-sm rounded-xl hover:bg-primary-50 hover:text-primary-600 transition-colors">
                    Visit website
                  </a>
                )}
              </FadeInItem>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-1.5 flex-wrap">
            <button
              onClick={() => goTo(safePage - 1)}
              disabled={safePage === 0}
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {pageWindow.map((p, i) =>
              p === "…" ? (
                <span key={`e-${i}`} className="px-2 text-slate-400 font-bold">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => goTo(p)}
                  className={`w-10 h-10 rounded-xl text-sm font-black transition-colors ${
                    p === safePage
                      ? "bg-primary-600 text-white shadow-lg shadow-primary-600/20"
                      : "bg-white border border-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary-600"
                  }`}
                >
                  {p + 1}
                </button>
              )
            )}
            <button
              onClick={() => goTo(safePage + 1)}
              disabled={safePage === totalPages - 1}
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
