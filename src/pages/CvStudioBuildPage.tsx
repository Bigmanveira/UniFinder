// ─────────────────────────────────────────────────────────────────────────────
// CvStudioBuildPage — the "build from scratch" tool. Single-screen form that
// matches the user-supplied template exactly:
//
//   Contact → Objective → Education → Achievements/Awards →
//   Work Experience → Key Skills → Leadership
//
// Each repeating block uses the same layout: institution + location on one
// row, role/degree + dates on the next, optional bullets / extra detail
// below. Mirrors how a typical academic-leaning resume reads in Word.
//
// The form is serialized to JSON and shipped to generateAcademicCvDocument
// in build mode. The backend BUILD_PROMPT renders it in the exact template
// layout — DO NOT change section names or order without updating both.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Wrench, AlertTriangle, RotateCw, Plus, X, Loader2 } from "lucide-react";
import { useAcademicCv } from "../components/cv/useAcademicCv";
import CvPreviewPaywall from "../components/cv/CvPreviewPaywall";
import CvStudioFooter from "../components/cv/CvStudioFooter";
import GenerationLoader from "../components/cv/GenerationLoader";

interface EduEntry        { institution: string; location: string; degree: string; dates: string; gpa: string; electives: string; }
interface AchievementEntry{ title: string; date: string; }
interface WorkEntry       { organization: string; location: string; role: string; dates: string; bullets: string[]; }
interface LeadershipEntry { organization: string; location: string; role: string; dates: string; bullets: string[]; }

const emptyEdu        = (): EduEntry         => ({ institution: "", location: "", degree: "", dates: "", gpa: "", electives: "" });
const emptyAchievement= (): AchievementEntry => ({ title: "", date: "" });
const emptyWork       = (): WorkEntry        => ({ organization: "", location: "", role: "", dates: "", bullets: [""] });
const emptyLeadership = (): LeadershipEntry  => ({ organization: "", location: "", role: "", dates: "", bullets: [""] });

export default function CvStudioBuildPage() {
  const cv = useAcademicCv("build");

  // Contact
  const [fullName, setFullName] = useState("");
  const [address,  setAddress]  = useState("");
  const [email,    setEmail]    = useState("");
  const [phone,    setPhone]    = useState("");
  const [website,  setWebsite]  = useState("");
  // Objective
  const [objective, setObjective] = useState("");
  // Sections
  const [education,    setEducation]    = useState<EduEntry[]>([emptyEdu()]);
  const [achievements, setAchievements] = useState<AchievementEntry[]>([]);
  const [workExperience, setWorkExperience] = useState<WorkEntry[]>([emptyWork()]);
  const [keySkills,    setKeySkills]    = useState("");
  const [leadership,   setLeadership]   = useState<LeadershipEntry[]>([]);

  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = () => {
    setFormError(null);
    if (!fullName.trim()) { setFormError("Your name is required."); return; }
    if (education.every((e) => !e.institution.trim() && !e.degree.trim())) {
      setFormError("Add at least one education entry."); return;
    }
    const payload = {
      fullName, address, email, phone, website,
      objective,
      education: education.filter((e) => e.institution.trim() || e.degree.trim()),
      achievements: achievements.filter((a) => a.title.trim()),
      workExperience: workExperience
        .filter((w) => w.organization.trim() || w.role.trim())
        .map((w) => ({ ...w, bullets: w.bullets.filter((b) => b.trim()) })),
      keySkills,
      leadership: leadership
        .filter((l) => l.organization.trim() || l.role.trim())
        .map((l) => ({ ...l, bullets: l.bullets.filter((b) => b.trim()) })),
    };
    void cv.generate({ inputText: JSON.stringify(payload) });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute top-[-160px] right-[-120px] w-[480px] h-[480px] bg-gradient-to-br from-violet-300/40 via-fuchsia-200/25 to-transparent rounded-full blur-[140px]" aria-hidden />

        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
            <Link to="/app/cv-studio" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to CV Studio">
              <ArrowLeft size={15} />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-bold leading-tight truncate">Build from scratch</h1>
              <p className="text-xs text-slate-500 truncate">Guided intake · 8,000 tokens to unlock the full CV</p>
            </div>
          </div>
        </header>

        {!cv.document && (
          <section className="relative max-w-3xl mx-auto px-5 pt-10 sm:pt-14 pb-2 text-center">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white items-center justify-center mb-5 shadow-md shadow-violet-500/20">
              <Wrench size={22} />
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mb-3 leading-[1.1]">
              Tell us the facts. We'll do the formatting.
            </h2>
            <p className="text-base sm:text-[17px] text-slate-600 leading-relaxed max-w-2xl mx-auto">
              Fill in only what applies — empty sections are skipped. The AI takes your raw facts and produces a polished CV that follows the standard template. Preview is free; unlock costs 8,000 tokens.
            </p>
          </section>
        )}
      </div>

      <main className="relative max-w-3xl mx-auto px-5 py-8 w-full flex-1 space-y-8">
        {cv.generating && (
          <GenerationLoader mode="build" />
        )}

        {!cv.document && !cv.generating && (
          <>
            <section className="space-y-7">
              {/* ── Contact ─────────────────────────────────────────── */}
              <Block title="Contact">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Full name *"     value={fullName} onChange={setFullName} placeholder="Shaibu Yahaya" wide />
                  <Field label="Address"         value={address}  onChange={setAddress}  placeholder="P. O. Box 224, Cape Coast, Ghana" wide />
                  <Field label="Email"           value={email}    onChange={setEmail}    placeholder="you@example.com" />
                  <Field label="Phone"           value={phone}    onChange={setPhone}    placeholder="+233 24 000 0000" />
                  <Field label="Website"         value={website}  onChange={setWebsite}  placeholder="www.example.com" wide />
                </div>
              </Block>

              {/* ── Objective ──────────────────────────────────────── */}
              <Block
                title="Objective"
                sub="1–3 sentences describing what you're aiming to do. Used as the OBJECTIVE section at the top of the CV."
              >
                <textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="To advance in knowledge and develop new skills for critical analysis of economic issues, in order to become a practically astute and academically informed economist."
                  className="w-full min-h-[90px] resize-y bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[14px] text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
              </Block>

              {/* ── Education ──────────────────────────────────────── */}
              <RepeatableBlock<EduEntry>
                title="Education *"
                items={education}
                setItems={setEducation}
                empty={emptyEdu}
                renderRow={(item, update) => (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Institution"     value={item.institution} onChange={(v) => update({ ...item, institution: v })} placeholder="University of Cape Coast" />
                    <Field label="Location"        value={item.location}    onChange={(v) => update({ ...item, location: v })}    placeholder="Cape Coast, Ghana" />
                    <Field label="Degree / Certificate" value={item.degree}  onChange={(v) => update({ ...item, degree: v })}      placeholder="Bachelor of Arts – Economics" />
                    <Field label="Date(s)"         value={item.dates}       onChange={(v) => update({ ...item, dates: v })}       placeholder="May 2015" />
                    <Field label="GPA"             value={item.gpa}         onChange={(v) => update({ ...item, gpa: v })}         placeholder="3.8/4.0" />
                    <Field label="Electives / Honours" value={item.electives} onChange={(v) => update({ ...item, electives: v })} placeholder="Economics, Geography, Elective Mathematics" wide />
                  </div>
                )}
              />

              {/* ── Achievements / Awards ──────────────────────────── */}
              <RepeatableBlock<AchievementEntry>
                title="Achievements / Awards"
                items={achievements}
                setItems={setAchievements}
                empty={emptyAchievement}
                renderRow={(item, update) => (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <Field label="Title" value={item.title} onChange={(v) => update({ ...item, title: v })} placeholder="Departmental Award for the Best Graduating Economics Student" wide />
                    </div>
                    <Field label="Date" value={item.date} onChange={(v) => update({ ...item, date: v })} placeholder="September 25, 2015" />
                  </div>
                )}
              />

              {/* ── Work Experience ────────────────────────────────── */}
              <RepeatableBlock<WorkEntry>
                title="Work experience"
                items={workExperience}
                setItems={setWorkExperience}
                empty={emptyWork}
                renderRow={(item, update) => (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Organization" value={item.organization} onChange={(v) => update({ ...item, organization: v })} placeholder="University of Cape Coast" />
                      <Field label="Location"     value={item.location}     onChange={(v) => update({ ...item, location: v })}     placeholder="Cape Coast, Ghana" />
                      <Field label="Role"         value={item.role}         onChange={(v) => update({ ...item, role: v })}         placeholder="Teaching Assistant, Department of Economics" wide />
                      <Field label="Date(s)"      value={item.dates}        onChange={(v) => update({ ...item, dates: v })}        placeholder="September 2015 – July 2016" wide />
                    </div>
                    <BulletList
                      bullets={item.bullets}
                      onChange={(next) => update({ ...item, bullets: next })}
                      placeholder="Teaching undergraduate courses in Economics"
                    />
                  </div>
                )}
              />

              {/* ── Key Skills ─────────────────────────────────────── */}
              <Block
                title="Key skills"
                sub='Free-form, one per line. Use prefixes like "Computer skills:" or "Languages:" if you want grouping.'
              >
                <textarea
                  value={keySkills}
                  onChange={(e) => setKeySkills(e.target.value)}
                  placeholder={"Computer skills: proficient in Microsoft Office, SPSS, and STATA\nWriter of articles and motivational messages"}
                  className="w-full min-h-[100px] resize-y bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[14px] text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
              </Block>

              {/* ── Leadership ─────────────────────────────────────── */}
              <RepeatableBlock<LeadershipEntry>
                title="Leadership"
                items={leadership}
                setItems={setLeadership}
                empty={emptyLeadership}
                renderRow={(item, update) => (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Organization" value={item.organization} onChange={(v) => update({ ...item, organization: v })} placeholder="ACKOSA UCC" />
                      <Field label="Location"     value={item.location}     onChange={(v) => update({ ...item, location: v })}     placeholder="Cape Coast, Ghana" />
                      <Field label="Role"         value={item.role}         onChange={(v) => update({ ...item, role: v })}         placeholder="President" />
                      <Field label="Date(s)"      value={item.dates}        onChange={(v) => update({ ...item, dates: v })}        placeholder="2014/2015" />
                    </div>
                    <BulletList
                      bullets={item.bullets}
                      onChange={(next) => update({ ...item, bullets: next })}
                      placeholder="Began the process of re-registering the association after years of no recognition"
                    />
                  </div>
                )}
              />
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
                Your CV
              </h2>
              <div className="flex items-center justify-between gap-3 mb-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Built from your intake. Preview free; unlock for 8,000 tokens.
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

      <CvStudioFooter />
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

function BulletList({ bullets, onChange, placeholder }: {
  bullets: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Bullets</label>
      <div className="space-y-2">
        {bullets.map((b, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              type="text"
              value={b}
              onChange={(e) => {
                const next = bullets.slice();
                next[idx] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
            {bullets.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(bullets.filter((_, i) => i !== idx))}
                className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors flex-shrink-0"
                aria-label="Remove bullet"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...bullets, ""])}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 py-1.5 transition-colors"
        >
          <Plus size={12} /> Add bullet
        </button>
      </div>
    </div>
  );
}

function RepeatableBlock<T>({
  title, items, setItems, empty, renderRow,
}: {
  title: string;
  items: T[];
  setItems: (v: T[]) => void;
  empty: () => T;
  renderRow: (item: T, update: (next: T) => void) => React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-black text-slate-900">
          {title}
          <span className="ml-2 text-xs font-medium text-slate-500">{items.length > 0 ? `(${items.length})` : "(optional)"}</span>
        </h3>
        <button
          type="button"
          onClick={() => setItems([...items, empty()])}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 py-1.5 transition-colors"
        >
          <Plus size={12} /> Add
        </button>
      </div>
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
    </div>
  );
}
