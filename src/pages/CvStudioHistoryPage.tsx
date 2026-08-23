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
  FileText, Wrench, RefreshCw, Lock, Unlock,
  Loader2, ChevronRight, Inbox,
} from "lucide-react";
import CvStudioFooter from "../components/cv/CvStudioFooter";
import { formatTokens } from "../lib/tokens";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconChip } from "../components/ui/IconChip";

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
}> = {
  review:  { label: "Review & revamp",          Icon: RefreshCw },
  build:   { label: "Built from scratch",       Icon: Wrench },
  convert: { label: "Professional → Academic",  Icon: FileText },
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
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
    <div className="min-h-screen bg-surface text-slate-900 antialiased flex flex-col">
      <AppHeader
        title="CV History"
        subtitle="Every CV you've generated — preview and unlocked"
        backTo="/app/cv-studio"
        backLabel="Back to CV Studio"
        maxWidth="max-w-6xl"
      />

      <section className="relative max-w-3xl mx-auto px-5 pt-10 sm:pt-14 pb-2 text-center">
        <IconChip icon={<Inbox size={22} />} tint="ink" size="lg" className="mx-auto mb-5" />
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mb-3 leading-[1.1]">
          Your CV history
        </h2>
        <p className="text-base sm:text-[17px] text-slate-600 leading-relaxed max-w-2xl mx-auto">
          Open any past document. Unlocked ones are ready to download; previews can be unlocked anytime if you still have the tokens.
        </p>
      </section>

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
          <Card pad="none" className="p-10 text-center">
            <IconChip icon={<Inbox size={22} />} tint="slate" size="lg" className="mx-auto mb-4" />
            <p className="text-lg font-black tracking-tight text-slate-900 mb-1">No CVs yet</p>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed mb-6">
              When you generate a CV with any of the three tools, it lands here so you can come back to it anytime.
            </p>
            <Button to="/app/cv-studio" variant="primary" size="lg">
              Open the studio
            </Button>
          </Card>
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
                    className="group block bg-white rounded-card border border-slate-200/70 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all p-4 sm:p-5"
                  >
                    <div className="flex items-center gap-4">
                      <IconChip icon={<Icon size={18} />} tint="primary" size="lg" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[15px] font-black tracking-tight text-slate-900 truncate">{meta.label}</p>
                          {row.unlocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200 text-[10px] font-semibold uppercase tracking-eyebrow">
                              <Unlock size={9} /> Unlocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold uppercase tracking-eyebrow">
                              <Lock size={9} /> Preview
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {fmtDate(row.createdAt)}{row.unlocked ? "" : ` · ${formatTokens(row.creditCost)} tokens to unlock`}
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
