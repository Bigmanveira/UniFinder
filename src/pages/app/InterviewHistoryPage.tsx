import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { useAppData } from "../../hooks/useAppData";
import { TabScreen } from "../../components/layout/AppShell";
import { ScreenHeader, HeaderIconButton } from "../../components/layout/ScreenHeader";
import AppFooter from "../../components/layout/AppFooter";
import { InterviewRow } from "../../components/dashboard/ReportRow";
import { FadeInItem } from "../../components/FadeIn";

// ─────────────────────────────────────────────────────────────────────────────
// Practice history — every scored F-1 practice session, in the Sleek
// tab-screen language. Matches the "Practice history" section on the Visa
// Hub screen; the header mic button starts a new session.
// ─────────────────────────────────────────────────────────────────────────────
export default function InterviewHistoryPage() {
  const navigate = useNavigate();
  const { interviewReports } = useAppData();

  const onOpen = (id: string) => navigate(`/app/interview-reports/${id}`);
  const onPractice = () => navigate("/app/visa-interview");

  return (
    <TabScreen>
      <ScreenHeader
        eyebrow="Visa prep"
        title="Practice history"
        subtitle={
          interviewReports.length > 0
            ? `${interviewReports.length} scored session${interviewReports.length === 1 ? "" : "s"} · most recent first`
            : "Every scored session lands here."
        }
        action={
          <HeaderIconButton
            icon={<Mic size={20} />}
            label="Start a practice interview"
            onClick={onPractice}
          />
        }
      />

      {interviewReports.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-card-lg border border-slate-100 bg-white p-8 text-center shadow-card"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
            <Mic size={24} />
          </div>
          <h2 className="text-lg font-black tracking-tight">No practice sessions yet</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-6 text-slate-500">
            Rehearse with Anna, our AI consular officer. Every session is scored and saved here so you can track your improvement.
          </p>
          <button
            onClick={onPractice}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-primary-500 px-6 py-3 text-sm font-bold text-white shadow-glow transition-colors hover:bg-primary-600"
          >
            <Mic size={14} /> Start a practice interview
          </button>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {interviewReports.map((r, i) => (
            <FadeInItem key={r.id} index={i}>
              <InterviewRow report={r} onClick={() => onOpen(r.id)} />
            </FadeInItem>
          ))}
        </motion.div>
      )}

      <AppFooter />
    </TabScreen>
  );
}
