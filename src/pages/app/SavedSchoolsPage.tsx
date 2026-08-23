import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, ChevronDown, ChevronUp, Compass, Globe, MapPin, Trash2 } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useAppData } from "../../hooks/useAppData";
import { TabScreen } from "../../components/layout/AppShell";
import { ScreenHeader, HeaderIconButton } from "../../components/layout/ScreenHeader";
import AppFooter from "../../components/layout/AppFooter";

// ─────────────────────────────────────────────────────────────────────────────
// Saved Schools — the user's shortlist board, in the Sleek tab-screen
// language: ScreenHeader with a Discover shortcut, expandable white cards.
// Remove/save logic unchanged.
// ─────────────────────────────────────────────────────────────────────────────
export default function SavedSchoolsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { savedSchools } = useAppData();
  const userId = user?.uid || "";

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

  return (
    <TabScreen>
      <ScreenHeader
        eyebrow="Your shortlist"
        title="Saved Schools"
        subtitle={
          savedSchools.length > 0
            ? `${savedSchools.length} school${savedSchools.length === 1 ? "" : "s"} on your board`
            : "Build your board from your match reports."
        }
        action={
          <HeaderIconButton
            icon={<Compass size={20} />}
            label="Discover schools"
            onClick={() => navigate("/app/discover")}
          />
        }
      />

      {savedSchools.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-card-lg border border-slate-100 bg-white p-8 text-center shadow-card"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
            <Bookmark size={24} />
          </div>
          <h2 className="text-lg font-black tracking-tight">No saved schools yet</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-6 text-slate-500">
            When you view a match report, you can save schools to build your shortlist here.
          </p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {savedSchools.map((school) => {
            const isExpanded = expandedId === school.unitId;
            const isRemoving = removing === school.unitId;
            return (
              <div key={school.unitId} className="overflow-hidden rounded-card border border-slate-100 bg-white shadow-card">
                {/* Header row — clickable */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : school.unitId)}
                  className="group flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-surface"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
                      <Bookmark size={18} className="fill-current" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black text-slate-900 transition-colors group-hover:text-primary-600">{school.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                        <MapPin size={13} /> {[school.city, school.state].filter(Boolean).join(", ") || "United States"}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={18} className="shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown size={18} className="shrink-0 text-slate-400" />
                  )}
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
                      <div className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-slate-100 bg-surface p-4">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-eyebrow text-slate-500">Location</p>
                            <p className="text-sm font-bold text-slate-700">{[school.city, school.state].filter(Boolean).join(", ") || "—"}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-100 bg-surface p-4">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-eyebrow text-slate-500">Type</p>
                            <p className="text-sm font-bold text-slate-700">{school.ownership || "—"}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {school.schoolUrl && (
                            <a
                              href={school.schoolUrl.startsWith("http") ? school.schoolUrl : `https://${school.schoolUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary-500 py-3 text-sm font-bold text-white shadow-glow transition-colors hover:bg-primary-600"
                            >
                              <Globe size={16} /> Visit website
                            </a>
                          )}
                          <button
                            onClick={() => handleRemove(school.unitId)}
                            disabled={isRemoving}
                            className="flex items-center justify-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50"
                          >
                            {isRemoving ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-rose-300 border-t-rose-600" />
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
      )}

      <AppFooter />
    </TabScreen>
  );
}
