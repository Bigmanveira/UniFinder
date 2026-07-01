// ─────────────────────────────────────────────────────────────────────────────
// CvStudioHistoryPage — list of every CV the user has generated. Streams
// from /academicCvDocuments via onSnapshot (rules allow user reads scoped
// to their own userId). Each row links to the detail page.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import {
  ArrowLeft, FileText, Wrench, RefreshCw, Lock, Wand2,
  Loader2, ChevronRight, Inbox,
} from "lucide-react";
import CvStudioFooter from "../components/cv/CvStudioFooter";
import { formatTokens } from "../lib/tokens";

interface HistoryRow {
  id:         string;
  mode:       "review" | "build" | "convert";
  unlocked:   boolean;
  creditCost: number;
  createdAt:  Date | null;
}

const MODE_META: Record<HistoryRow["mode"], {
  label: string;
  Icon: typeof FileText;
  accent: string;
  ring:   string;
}> = {
  review:  { label: "Review & revamp",          Icon: RefreshCw, accent: "from-blue-500 to-blue-700",       ring: "ring-blue-100" },
  build:   { label: "Built from scratch",       Icon: Wrench,    accent: "from-violet-500 to-violet-700",   ring: "ring-violet-100" },
  convert: { label: "Professional → Academic",  Icon: FileText,  accent: "from-emerald-500 to-emerald-700", ring: "ring-emerald-100" },
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} Â· ${time}`;
}

export default function CvStudioHistoryPage() {
  const { user } = useAuth();
  const [rows, setRows]       = useState<HistoryRow[] | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "academicCvDocuments"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: HistoryRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          next.push({
            id:         d.id,
            mode:       (data.mode === "build" || data.mode === "convert") ? data.mode : "review",
            unlocked:   data.unlocked === true,
            creditCost: typeof data.creditCost === "number" ? data.creditCost : 5,
            createdAt:  data.createdAt?.toDate?.() ?? null,
          });
        });
        setRows(next);
      },
      (err) => {
        console.error("[cv-history] snapshot error:", err);
        setError("Could not load your CV history. Refresh and try again.");
        setRows([]);
      },
    );
    return () => unsub();
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute top-[-160px] right-[-120px] w-[480px] h-[480px] bg-gradient-to-br from-slate-300/40 via-blue-200/20 to-transparent rounded-full blur-[140px]" aria-hidden />

        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
            <Link to="/app/cv-studio" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to CV Studio">
              <ArrowLeft size={15} />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-bold leading-tight truncate">CV History</h1>
              <p className="text-xs text-slate-500 truncate">Every CV you've generated — preview and unlocked</p>
            </div>
          </div>
        </header>

        <section className="relative max-w-3xl mx-auto px-5 pt-10 sm:pt-14 pb-2 text-center">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-slate-900 text-white items-center justify-center mb-5 shadow-md">
            <Inbox size={22} />
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mb-3 leading-[1.1]">
            Your CV history
          </h2>
          <p className="text-base sm:text-[17px] text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Open any past document. Unlocked ones are ready to download; previews can be unlocked anytime if you still have the tokens.
          </p>
        </section>
      </div>

      <main className="relative max-w-3xl mx-auto px-5 py-8 w-full flex-1">
        {rows === null && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="text-slate-400 animate-spin" />
          </div>
        )}

        {error && rows !== null && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium rounded-2xl px-4 py-3">
            {error}
          </div>
        )}

        {rows !== null && rows.length === 0 && !error && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-4">
              <Inbox size={22} />
            </div>
            <p className="text-lg font-black text-slate-900 mb-1">No CVs yet</p>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed mb-6">
              When you generate a CV with any of the three tools, it lands here so you can come back to it anytime.
            </p>
            <Link
              to="/app/cv-studio"
              className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-2xl text-sm transition-colors"
            >
              Open the studio
            </Link>
          </div>
        )}

        {rows !== null && rows.length > 0 && (
          <ul className="space-y-3">
            {rows.map((row) => {
              const meta = MODE_META[row.mode];
              const Icon = meta.Icon;
              return (
                <li key={row.id}>
                  <Link
                    to={`/app/cv-studio/document/${row.id}`}
                    className={`group block bg-white rounded-2xl border border-slate-200 ring-1 ${meta.ring} shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-4 sm:p-5`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${meta.accent} text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-slate-900/10`}>
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[15px] font-black text-slate-900 truncate">{meta.label}</p>
                          {row.unlocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-widest">
                              <Wand2 size={9} /> Unlocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-black uppercase tracking-widest">
                              <Lock size={9} /> Preview
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {fmtDate(row.createdAt)}{row.unlocked ? "" : ` Â· ${formatTokens(row.creditCost)} tokens to unlock`}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-700 transition-colors flex-shrink-0" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <CvStudioFooter />
    </div>
  );
}
