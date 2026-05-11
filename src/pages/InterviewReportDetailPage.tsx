import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import InterviewReportView from "../components/visa/InterviewReportView";
import type { VisaInterviewReport } from "../types";

export default function InterviewReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [report,  setReport]  = useState<VisaInterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user)      { navigate("/login"); return; }
    if (!reportId)  { setError("Missing report id"); setLoading(false); return; }

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "visaInterviewReports", reportId));
        if (cancelled) return;
        if (!snap.exists()) {
          setError("That interview report doesn't exist or has been deleted.");
        } else {
          const data = snap.data() as any;
          if (data.userId !== user.uid) {
            setError("You don't have access to this report.");
          } else {
            setReport({ id: snap.id, ...data } as VisaInterviewReport);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not load the interview report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, reportId, navigate]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 size={20} className="text-slate-400 animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-blue-50/30 to-white text-slate-900">
        <header className="border-b border-slate-200 sticky top-0 z-40 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
            <Link to="/app" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to dashboard">
              <ArrowLeft size={15} />
            </Link>
            <h1 className="text-[15px] font-bold leading-tight">Interview report</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-5 py-8">
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-800 flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-1">Couldn't load report</p>
              <p className="text-sm leading-relaxed">{error || "Report not found."}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-blue-50/30 to-white text-slate-900 antialiased pb-20 relative overflow-hidden">
      <div className="pointer-events-none absolute top-[-100px] right-[-100px] w-[440px] h-[440px] bg-blue-200/40 rounded-full blur-[120px]" aria-hidden />

      <header className="border-b border-slate-200 sticky top-0 z-40 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/app" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to dashboard">
            <ArrowLeft size={15} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">F-1 Visa Interview — feedback</h1>
            <p className="text-xs text-slate-500 truncate">Past practice session</p>
          </div>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-5 py-6">
        <InterviewReportView
          report={report}
          onRetry={() => navigate("/app/visa-interview")}
          onBack={() => navigate("/app")}
        />
      </main>
    </div>
  );
}
