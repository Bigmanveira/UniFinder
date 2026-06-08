// ─────────────────────────────────────────────────────────────────────────────
// CvStudioBuildPage — the "build from scratch" tool. Single-screen form that
// captures the academic-CV essentials, serializes them as JSON, and ships
// to the backend builder mode.
//
// The form is intentionally minimal — the AI fills in formatting and prose
// from the facts. Long forms kill conversion; we ask for what the AI
// cannot infer (names, dates, titles) and let it generate everything else.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Wrench, AlertTriangle, RotateCw, Plus, X, Loader2 } from "lucide-react";
import { useAcademicCv } from "../components/cv/useAcademicCv";
import CvPreviewPaywall from "../components/cv/CvPreviewPaywall";

interface EduEntry { degree: string; field: string; institution: string; startYear: string; endYear: string; gpa: string; advisor: string; thesis: string; }
interface ExpEntry { role: string; lab: string; institution: string; startYear: string; endYear: string; description: string; }
interface PubEntry { type: string; citation: string; }
interface PresEntry { title: string; venue: string; year: string; type: string; }
interface TeachEntry { course: string; institution: string; role: string; term: string; }
interface AwardEntry { name: string; year: string; amount: string; }
interface ServiceEntry { role: string; organization: string; year: string; }

const emptyEdu = (): EduEntry => ({ degree: "", field: "", institution: "", startYear: "", endYear: "", gpa: "", advisor: "", thesis: "" });
const emptyExp = (): ExpEntry => ({ role: "", lab: "", institution: "", startYear: "", endYear: "", description: "" });
const emptyPub = (): PubEntry => ({ type: "journal", citation: "" });
const emptyPres = (): PresEntry => ({ title: "", venue: "", year: "", type: "talk" });
const emptyTeach = (): TeachEntry => ({ course: "", institution: "", role: "TA", term: "" });
const emptyAward = (): AwardEntry => ({ name: "", year: "", amount: "" });
const emptyService = (): ServiceEntry => ({ role: "", organization: "", year: "" });

export default function CvStudioBuildPage() {
  const cv = useAcademicCv("build");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [websiteOrOrcid, setWebsiteOrOrcid] = useState("");
  const [researchInterests, setResearchInterests] = useState("");
  const [education, setEducation] = useState<EduEntry[]>([emptyEdu()]);
  const [researchExperience, setResearchExperience] = useState<ExpEntry[]>([emptyExp()]);
  const [publications, setPublications] = useState<PubEntry[]>([]);
  const [presentations, setPresentations] = useState<PresEntry[]>([]);
  const [teaching, setTeaching] = useState<TeachEntry[]>([]);
  const [awards, setAwards] = useState<AwardEntry[]>([]);
  const [service, setService] = useState<ServiceEntry[]>([]);
  const [skills, setSkills] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = () => {
    setFormError(null);
    if (!fullName.trim()) { setFormError("Your name is required."); return; }
    if (education.every((e) => !e.degree.trim() && !e.institution.trim())) {
      setFormError("Add at least one education entry."); return;
    }
    const payload = {
      fullName, email, phone, location, websiteOrOrcid, researchInterests,
      education: education.filter((e) => e.degree.trim() || e.institution.trim()),
      researchExperience: researchExperience.filter((e) => e.role.trim() || e.lab.trim() || e.institution.trim()),
      publications, presentations, teaching, awards, service, skills,
    };
    void cv.generate({ inputText: JSON.stringify(payload) });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-violet-50/30 to-white text-slate-900 antialiased pb-20 relative overflow-hidden">
      <div className="pointer-events-none absolute top-[-100px] right-[-100px] w-[440px] h-[440px] bg-violet-200/40 rounded-full blur-[120px]" aria-hidden />

      <header className="border-b border-slate-200 sticky top-0 z-40 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/app/cv-studio" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to CV Studio">
            <ArrowLeft size={15} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">Build from scratch</h1>
            <p className="text-xs text-slate-500 truncate">Guided intake — 8 credits to unlock the full CV</p>
          </div>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-5 py-8 space-y-8">
        {!cv.document && (
          <>
            <section>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white flex items-center justify-center mb-4 shadow-md">
                <Wrench size={20} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mb-2 leading-tight">
                Tell us the facts. We'll do the formatting.
              </h2>
              <p className="text-base text-slate-700 max-w-2xl leading-relaxed">
                Fill in only what applies — empty sections are skipped. The AI takes your raw facts and produces a clean academic CV in the right voice. Preview is free; unlock costs 8 credits.
              </p>
            </section>

            <section className="space-y-7">
              <Block title="Contact">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Full name *"        value={fullName}        onChange={setFullName}        placeholder="Ada Lovelace" />
                  <Field label="Email"              value={email}           onChange={setEmail}           placeholder="ada@example.edu" />
                  <Field label="Phone"              value={phone}           onChange={setPhone}           placeholder="+1 555 0100" />
                  <Field label="Location"           value={location}        onChange={setLocation}        placeholder="London, UK" />
                  <Field label="Website / ORCID"    value={websiteOrOrcid}  onChange={setWebsiteOrOrcid}  placeholder="orcid.org/0000-0000-0000-0000" wide />
                </div>
              </Block>

              <Block title="Research interests (1–2 sentences)" sub="Seeds the research statement at the top of the CV.">
                <textarea
                  value={researchInterests}
                  onChange={(e) => setResearchInterests(e.target.value)}
                  placeholder="Reinforcement learning for biological control; safe exploration in robotics; benchmarking generalization."
                  className="w-full min-h-[80px] resize-y bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[14px] text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
              </Block>

              <RepeatableBlock<EduEntry>
                title="Education *"
                items={education}
                setItems={setEducation}
                empty={emptyEdu}
                renderRow={(item, update) => (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Degree" value={item.degree} onChange={(v) => update({ ...item, degree: v })} placeholder="PhD" />
                    <Field label="Field"  value={item.field}  onChange={(v) => update({ ...item, field: v })}  placeholder="Computer Science" />
                    <Field label="Institution" value={item.institution} onChange={(v) => update({ ...item, institution: v })} placeholder="MIT" wide />
                    <Field label="Start year" value={item.startYear} onChange={(v) => update({ ...item, startYear: v })} placeholder="2020" />
                    <Field label="End year"   value={item.endYear}   onChange={(v) => update({ ...item, endYear: v })}   placeholder="2025" />
                    <Field label="GPA"      value={item.gpa}     onChange={(v) => update({ ...item, gpa: v })}     placeholder="4.0/4.0" />
                    <Field label="Advisor"  value={item.advisor} onChange={(v) => update({ ...item, advisor: v })} placeholder="Daniela Rus" />
                    <Field label="Thesis title" value={item.thesis} onChange={(v) => update({ ...item, thesis: v })} placeholder="Optional" wide />
                  </div>
                )}
              />

              <RepeatableBlock<ExpEntry>
                title="Research experience"
                items={researchExperience}
                setItems={setResearchExperience}
                empty={emptyExp}
                renderRow={(item, update) => (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Role"   value={item.role}  onChange={(v) => update({ ...item, role: v })}  placeholder="Graduate Researcher" />
                    <Field label="Lab"    value={item.lab}   onChange={(v) => update({ ...item, lab: v })}   placeholder="CSAIL — Distributed Robotics" />
                    <Field label="Institution" value={item.institution} onChange={(v) => update({ ...item, institution: v })} placeholder="MIT" wide />
                    <Field label="Start year" value={item.startYear} onChange={(v) => update({ ...item, startYear: v })} placeholder="2020" />
                    <Field label="End year"   value={item.endYear}   onChange={(v) => update({ ...item, endYear: v })}   placeholder="present" />
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Description</label>
                      <textarea
                        value={item.description}
                        onChange={(e) => update({ ...item, description: e.target.value })}
                        placeholder="1–3 lines describing the work, methods used, and outputs."
                        className="w-full min-h-[80px] resize-y bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[14px] text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                      />
                    </div>
                  </div>
                )}
              />

              <RepeatableBlock<PubEntry>
                title="Publications"
                items={publications}
                setItems={setPublications}
                empty={emptyPub}
                startCollapsed
                renderRow={(item, update) => (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-1">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Type</label>
                      <select
                        value={item.type}
                        onChange={(e) => update({ ...item, type: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                      >
                        <option value="journal">Journal</option>
                        <option value="conference">Conference</option>
                        <option value="workshop">Workshop</option>
                        <option value="preprint">Preprint</option>
                        <option value="book_chapter">Book chapter</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Citation</label>
                      <textarea
                        value={item.citation}
                        onChange={(e) => update({ ...item, citation: e.target.value })}
                        placeholder="Authors. (Year). Title. Journal, vol(issue), pages."
                        className="w-full min-h-[60px] resize-y bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[14px] text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                      />
                    </div>
                  </div>
                )}
              />

              <RepeatableBlock<PresEntry>
                title="Presentations"
                items={presentations}
                setItems={setPresentations}
                empty={emptyPres}
                startCollapsed
                renderRow={(item, update) => (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Title" value={item.title} onChange={(v) => update({ ...item, title: v })} placeholder="Talk title" wide />
                    <Field label="Venue" value={item.venue} onChange={(v) => update({ ...item, venue: v })} placeholder="NeurIPS 2024" />
                    <Field label="Year"  value={item.year}  onChange={(v) => update({ ...item, year: v })}  placeholder="2024" />
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Type</label>
                      <select
                        value={item.type}
                        onChange={(e) => update({ ...item, type: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                      >
                        <option value="talk">Talk (contributed)</option>
                        <option value="invited">Invited talk</option>
                        <option value="poster">Poster</option>
                      </select>
                    </div>
                  </div>
                )}
              />

              <RepeatableBlock<TeachEntry>
                title="Teaching"
                items={teaching}
                setItems={setTeaching}
                empty={emptyTeach}
                startCollapsed
                renderRow={(item, update) => (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Course" value={item.course} onChange={(v) => update({ ...item, course: v })} placeholder="6.034 — AI" />
                    <Field label="Institution" value={item.institution} onChange={(v) => update({ ...item, institution: v })} placeholder="MIT" />
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Role</label>
                      <select
                        value={item.role}
                        onChange={(e) => update({ ...item, role: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                      >
                        <option value="TA">Teaching Assistant</option>
                        <option value="instructor">Instructor</option>
                      </select>
                    </div>
                    <Field label="Term" value={item.term} onChange={(v) => update({ ...item, term: v })} placeholder="Spring 2024" />
                  </div>
                )}
              />

              <RepeatableBlock<AwardEntry>
                title="Awards & honors"
                items={awards}
                setItems={setAwards}
                empty={emptyAward}
                startCollapsed
                renderRow={(item, update) => (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Award" value={item.name} onChange={(v) => update({ ...item, name: v })} placeholder="Hertz Fellowship" wide />
                    <Field label="Year"  value={item.year} onChange={(v) => update({ ...item, year: v })} placeholder="2021" />
                    <Field label="Amount" value={item.amount} onChange={(v) => update({ ...item, amount: v })} placeholder="$250k (optional)" />
                  </div>
                )}
              />

              <RepeatableBlock<ServiceEntry>
                title="Service"
                items={service}
                setItems={setService}
                empty={emptyService}
                startCollapsed
                renderRow={(item, update) => (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Role" value={item.role} onChange={(v) => update({ ...item, role: v })} placeholder="Reviewer" />
                    <Field label="Organization" value={item.organization} onChange={(v) => update({ ...item, organization: v })} placeholder="ICML 2024" />
                    <Field label="Year" value={item.year} onChange={(v) => update({ ...item, year: v })} placeholder="2024" />
                  </div>
                )}
              />

              <Block title="Skills" sub="Free-form — comma-separated. Languages, frameworks, lab methods, etc.">
                <textarea
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="Python, PyTorch, JAX, CRISPR, qPCR, French (fluent)"
                  className="w-full min-h-[60px] resize-y bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[14px] text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
              </Block>
            </section>

            {(formError || cv.error) && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium rounded-2xl px-4 py-3 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{formError ?? cv.error}</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={cv.generating}
              className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cv.generating && <Loader2 size={14} className="animate-spin" />}
              {cv.generating ? "Building your CV…" : "Generate my CV (free preview)"}
            </button>
          </>
        )}

        {cv.document && (
          <>
            <section>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mb-2 leading-tight">
                Your academic CV
              </h2>
              <div className="flex items-center justify-between gap-3 mb-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Built from your intake. Preview free; unlock for 8 credits.
                </p>
                <button
                  onClick={cv.reset}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <RotateCw size={12} /> Start over
                </button>
              </div>
            </section>
            <CvPreviewPaywall
              documentId={cv.document.documentId}
              mode="build"
              creditCost={cv.document.creditCost}
              previewMarkdown={cv.document.previewMarkdown}
              fullMarkdown={cv.document.fullMarkdown}
              unlocked={cv.document.unlocked}
              walletCredits={cv.walletCredits}
              isFounder={cv.isFounder}
              onUnlocked={cv.onUnlocked}
            />
          </>
        )}
      </main>
    </div>
  );
}

// ── Form helpers ─────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, wide }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
      />
    </div>
  );
}

function Block({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7">
      <h3 className="text-base font-black text-slate-900 mb-1">{title}</h3>
      {sub && <p className="text-xs text-slate-500 mb-4 leading-relaxed">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </div>
  );
}

function RepeatableBlock<T>({
  title, items, setItems, empty, renderRow, startCollapsed,
}: {
  title: string;
  items: T[];
  setItems: (v: T[]) => void;
  empty: () => T;
  renderRow: (item: T, update: (next: T) => void) => React.ReactNode;
  startCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!startCollapsed);
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-base font-black text-slate-900 text-left flex-1"
        >
          {title}
          <span className="ml-2 text-xs font-medium text-slate-500">{items.length > 0 ? `(${items.length})` : "(optional)"}</span>
        </button>
        {open && (
          <button
            type="button"
            onClick={() => setItems([...items, empty()])}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 py-1.5 transition-colors"
          >
            <Plus size={12} /> Add
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-4">
          {items.length === 0 && (
            <button
              type="button"
              onClick={() => setItems([empty()])}
              className="w-full text-[13px] text-slate-500 hover:text-slate-900 border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-2xl py-4 transition-colors"
            >
              + Add your first entry
            </button>
          )}
          {items.map((item, idx) => (
            <div key={idx} className="relative bg-slate-50/60 border border-slate-200 rounded-2xl p-4 pr-12">
              {renderRow(item, (next) => {
                const copy = items.slice();
                copy[idx] = next;
                setItems(copy);
              })}
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  className="absolute top-3 right-3 w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center transition-colors"
                  aria-label="Remove entry"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
