import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { Loader2, AlertTriangle } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { AppHeader } from "../components/AppHeader";
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
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 size={20} className="text-slate-400 animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-surface text-slate-900">
        <AppHeader
          title="Interview report"
          backTo="/app/interviews"
          backLabel="Back to interview reports"
          maxWidth="max-w-3xl"
        />
        <main className="max-w-3xl mx-auto px-5 py-8">
          <div className="bg-rose-50 border border-rose-200 rounded-card p-6 text-rose-800 flex items-start gap-3">
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
    <div className="min-h-screen bg-surface text-slate-900 antialiased pb-20 relative overflow-hidden">
      <div className="pointer-events-none absolute top-[-100px] right-[-100px] w-[440px] h-[440px] bg-primary-200/40 rounded-full blur-[120px]" aria-hidden />

      <AppHeader
        title="F-1 Visa Interview — feedback"
        subtitle="Past practice session"
        backTo="/app/interviews"
        backLabel="Back to interview reports"
        maxWidth="max-w-3xl"
      />

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
