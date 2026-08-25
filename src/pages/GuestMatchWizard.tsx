import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, MapPin, BookOpen, Calculator, DollarSign, FileCheck, ArrowRight, ArrowLeft, ChevronDown } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import AppFooter from "../components/layout/AppFooter";
import { motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

// Autocomplete suggestions for the "Intended Major" field. Curated from the
// fields our `programs` collection actually covers + the most-applied
// majors across U.S. universities. Users can still type anything they want —
// this is hint-only, not a constraint.
const INTENDED_MAJOR_SUGGESTIONS = [
  // STEM — Computing / Engineering
  "Computer Science",
  "Data Science",
  "Artificial Intelligence",
  "Cybersecurity",
  "Information Systems",
  "Information Science",
  "Software Engineering",
  "Computer Engineering",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Chemical Engineering",
  "Biomedical Engineering",
  "Industrial Engineering",
  "Aerospace Engineering",
  "Materials Science",
  // STEM — Sciences
  "Mathematics",
  "Applied Mathematics",
  "Statistics",
  "Physics",
  "Chemistry",
  "Biology",
  "Biochemistry",
  "Neuroscience",
  "Environmental Science",
  "Geology",
  // Business
  "Business Administration",
  "Business Analytics",
  "Finance",
  "Accounting",
  "Marketing",
  "Economics",
  "Management",
  "Entrepreneurship",
  "Supply Chain Management",
  "International Business",
  "MBA",
  // Health
  "Public Health",
  "Nursing",
  "Pharmacy",
  "Health Administration",
  "Nutrition",
  "Kinesiology",
  // Social sciences / humanities
  "Psychology",
  "Sociology",
  "Political Science",
  "International Relations",
  "Economics",
  "Education",
  "History",
  "English",
  "Communications",
  "Journalism",
  "Linguistics",
  "Philosophy",
  // Arts & Design
  "Architecture",
  "Graphic Design",
  "Fine Arts",
  "Industrial Design",
  "Film & Media Studies",
  "Music",
  // Law-adjacent
  "Criminal Justice",
  "Legal Studies",
];

export default function GuestMatchWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const totalSteps = 7;
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    destination: "us United States (USA)",
    level: "Master's",
    field: "",
    gradingSystem: "GPA (4.0 scale)",
    gpa: "",
    testType: "None",
    testScores: "",
    funding: "Partial Scholarship",
  });

  const updateForm = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileName(e.target.files[0].name);
    }
  };

  const handleNext = () => {
    // Validation
    if (step === 3 && !formData.field.trim()) {
      alert("Please enter your Intended Major to continue.");
      return;
    }
    if (step === 4) {
      if (formData.level !== "Undergraduate") {
        // For Postgrad, GPA is required unless we decide to make it fully optional.
        // The instructions say "If GPA is missing but GRE/GMAT exists: score academic fit using GRE/GMAT, do not force GPA."
        // So I'll remove the strict GPA requirement for postgrads too if they have a test score, or just remove it entirely.
        if ((!formData.gpa || parseFloat(formData.gpa) <= 0) && (!formData.testScores || formData.testScores.trim().length === 0)) {
          alert("Please enter a valid GPA or test score to continue.");
          return;
        }
      }
    }

    if (step < totalSteps - 1) {
      setStep(prev => prev + 1);
    } else if (step === totalSteps - 1) {
      // Step 6: User clicks "Generate Matches"
      setStep(7); // Show processing screen
      
      // Simulate backend AI deterministic matching delay
      setTimeout(async () => {
        if (user) {
          // Logged-in user: save directly to their profile and go to dashboard
          try {
            // updatedAt powers the "you left off matching" reminder sweep —
            // it's how the daily scheduled function detects an idle profile
            // that never got a match report unlocked.
            await setDoc(doc(db, "studentProfiles", user.uid), { ...formData, updatedAt: serverTimestamp() }, { merge: true });
          } catch (e) {
            console.error(e);
          }
        }
        
        // Always save to localStorage for LockedPreviewPage to read
        localStorage.setItem("unifinder_guest_profile", JSON.stringify(formData));
        localStorage.setItem("unifinder_preview_expires", (Date.now() + 1000 * 60 * 60 * 24).toString()); // 24h expiry
        navigate("/results");
      }, 2500);
    }
  };

  const progress = Math.round(((step - 1) / totalSteps) * 100);

  const renderIcon = (stepNum: number) => {
    switch(stepNum) {
      case 1: return <MapPin size={20} />;
      case 2: return <GraduationCap size={20} />;
      case 3: return <BookOpen size={20} />;
      case 4: return <Calculator size={20} />;
      case 5: return <DollarSign size={20} />;
      case 6: return <FileCheck size={20} />;
      default: return <GraduationCap size={20} />;
    }
  };

  const renderHeader = (title: string) => (
    <div className="mb-8">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-primary-600 flex items-center justify-center text-white shadow-glow">
          {renderIcon(step)}
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-eyebrow text-slate-400">Step {step} of {totalSteps - 1}</div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">{title}</h2>
        </div>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          className="h-full bg-primary-600 rounded-full"
        />
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-surface dot-grid-bg font-sans selection:bg-primary-500 selection:text-white flex flex-col">
      {/* Decorative atmosphere — soft orbs + navy ring motifs in the desktop
          gutters. Purely visual: aria-hidden, no pointer events, clipped so
          nothing can cause horizontal overflow. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-140px] h-[440px] w-[440px] rounded-full bg-[radial-gradient(closest-side,rgba(191,219,254,0.4),transparent_70%)]" />
        <div className="absolute -right-32 bottom-[-160px] h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(186,230,253,0.5),transparent_70%)]" />
        <div className="absolute right-[-60px] top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(191,219,254,0.4),transparent_70%)]" />
        <div className="hidden lg:block absolute left-[calc(50%-560px)] top-24 h-36 w-36 rounded-full border-[18px] border-primary-500/20" />
        <div className="hidden lg:block absolute right-[calc(50%-580px)] bottom-28 h-44 w-44 rounded-full border-[18px] border-primary-500/10" />
      </div>

      <header className="relative z-10 p-6 flex justify-center">
        <BrandLogo size="md" />
      </header>

      <main className="relative z-10 flex-1 w-full max-w-xl mx-auto px-6 pb-12 pt-4 flex flex-col justify-center">
        <motion.div 
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-white rounded-card-lg p-8 shadow-card border border-slate-200/70 relative overflow-hidden"
        >
          {/* STEP 1: DESTINATION */}
          {step === 1 && (
            <div>
              {renderHeader("Destination")}
              <label className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-2">Select country</label>
              <div className="relative">
                <select className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 appearance-none cursor-pointer">
                  <option>🇺🇸 United States (USA)</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          )}

          {/* STEP 2: LEVEL */}
          {step === 2 && (
            <div>
              {renderHeader("Level of Study")}
              <div className="space-y-3">
                {["Undergraduate", "Master's", "PhD / Doctorate"].map(lvl => (
                  <button key={lvl} onClick={() => {
                    updateForm("level", lvl);
                    updateForm("testType", lvl === "Undergraduate" ? "SAT" : "None");
                  }} className={`w-full text-left px-6 py-4 rounded-full border-2 transition-all font-bold ${formData.level === lvl ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200/70 bg-white text-slate-600 hover:border-slate-300'}`}>
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: FIELD */}
          {step === 3 && (
            <div>
              {renderHeader("Field of Study")}
              <label htmlFor="intended-major" className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-2">Intended Major</label>
              <input
                id="intended-major"
                type="text"
                placeholder="Start typing — e.g. Computer Science"
                value={formData.field}
                onChange={(e) => updateForm("field", e.target.value)}
                list="major-options"
                autoComplete="off"
                className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
              {/* Native datalist — browser-rendered autocomplete, zero JS,
                  zero network requests. Users can still type free-form (we
                  normalise the input server-side via normaliseProfileField). */}
              <datalist id="major-options">
                {INTENDED_MAJOR_SUGGESTIONS.map((m) => <option key={m} value={m} />)}
              </datalist>
              <p className="text-[11px] text-slate-400 mt-2">Pick from the list or type your own — we'll match against verified programs either way.</p>
            </div>
          )}

          {/* STEP 4: GRADES */}
          {step === 4 && (
            <div className="space-y-6">
              {renderHeader("Academic Profile")}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-2">
                  Standardized Test
                </label>
                <div className="flex gap-4">
                  <div className="relative w-1/3">
                    <select
                      value={formData.testType}
                      onChange={(e) => {
                        updateForm("testType", e.target.value);
                        if (e.target.value === "None") updateForm("testScores", "");
                      }}
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 appearance-none cursor-pointer"
                    >
                      {formData.level === "Undergraduate" ? (
                        <>
                          <option value="SAT">SAT</option>
                          <option value="ACT">ACT</option>
                        </>
                      ) : (
                        <>
                          <option value="None">None</option>
                          <option value="GRE">GRE</option>
                          <option value="GMAT">GMAT</option>
                        </>
                      )}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                  
                  {formData.testType !== "None" && (
                    <input 
                      type="text" 
                      placeholder={formData.testType === "SAT" ? "e.g. 1450" : formData.testType === "ACT" ? "e.g. 32" : formData.testType === "GRE" ? "e.g. 320" : "e.g. 700"} 
                      value={formData.testScores} 
                      onChange={(e) => updateForm("testScores", e.target.value)} 
                      className="flex-1 bg-white border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" 
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-2">
                  Grading system
                </label>
                <div className="relative mb-4">
                  <select
                    value={formData.gradingSystem}
                    onChange={(e) => {
                      updateForm("gradingSystem", e.target.value);
                      // Clear GPA when switching scales so users don't accidentally
                      // submit a 5.0-scale value as a 4.0-scale value.
                      updateForm("gpa", "");
                    }}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 appearance-none cursor-pointer"
                  >
                    <option value="GPA (4.0 scale)">GPA (4.0 scale)</option>
                    <option value="GPA (5.0 scale)">GPA (5.0 scale) — Nigerian / WAEC</option>
                    <option value="CWA (out of 100)">CWA (out of 100)</option>
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>

                <label className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-2">
                  {formData.gradingSystem === "CWA (out of 100)" ? "Your CWA" : "Your GPA"}
                  {formData.level === "Undergraduate" && <span className="font-medium normal-case text-slate-400 ml-1">— Optional</span>}
                </label>
                <input
                  type="number"
                  step={formData.gradingSystem === "CWA (out of 100)" ? "1" : "0.1"}
                  max={formData.gradingSystem === "CWA (out of 100)" ? 100 : formData.gradingSystem === "GPA (5.0 scale)" ? 5.0 : 4.0}
                  min={0}
                  placeholder={
                    formData.gradingSystem === "CWA (out of 100)" ? "e.g. 75"
                    : formData.gradingSystem === "GPA (5.0 scale)" ? "e.g. 4.5"
                    : "e.g. 3.8"
                  }
                  value={formData.gpa}
                  onChange={(e) => updateForm("gpa", e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-bold focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
                <p className="text-[11px] text-slate-400 mt-2">
                  {formData.gradingSystem === "CWA (out of 100)"
                    ? "We convert CWA to a US 4.0 equivalent for matching."
                    : formData.gradingSystem === "GPA (5.0 scale)"
                    ? "We convert your 5.0-scale GPA to the US 4.0 equivalent."
                    : "Standard US 4.0 scale — no conversion applied."}
                </p>
              </div>
            </div>
          )}

          {/* STEP 5: FUNDING */}
          {step === 5 && (
            <div>
              {renderHeader("Funding")}
              <div className="space-y-3">
                {["Full Funding", "Partial Scholarship", "Self-Funded"].map(f => (
                  <button key={f} onClick={() => updateForm("funding", f)} className={`w-full text-left px-6 py-4 rounded-full border-2 transition-all font-bold ${formData.funding === f ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200/70 bg-white text-slate-600 hover:border-slate-300'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 6: UPLOAD */}
          {step === 6 && (
            <div>
              {renderHeader("Document Upload")}
              <div 
                className={`border-2 border-dashed rounded-card p-8 text-center cursor-pointer transition-colors ${fileName ? 'border-primary-500 bg-primary-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileCheck className={`w-8 h-8 mx-auto mb-3 ${fileName ? 'text-primary-600' : 'text-primary-500'}`} />
                <p className="font-bold text-slate-900 text-sm">
                  {fileName ? fileName : "Upload Transcript (Optional)"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {fileName ? "Ready to analyze" : "Provides a more complete profile"}
                </p>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.doc,.docx" className="hidden" />
            </div>
          )}

          {/* STEP 7: PROCESSING */}
          {step === 7 && (
            <div className="text-center py-12">
              <div className="w-20 h-20 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin mx-auto mb-6"></div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-2">Analyzing our growing database of U.S. schools...</h2>
              <p className="text-slate-500 text-sm">Feeding your profile into the deterministic matching engine.</p>
            </div>
          )}

          {step < 7 && (
            <div className="mt-10 pt-6 border-t border-slate-100 flex gap-4">
              <button
                onClick={() => {
                  // step > 1: walk back through the wizard.
                  // step === 1: leave the wizard. We honour browser history
                  // first so a user who came from /app/roadmap (or any other
                  // page) lands back where they were, not on the dashboard.
                  // If history is empty (deep link / new tab), fall back to
                  // a sensible default — /app for signed-in users, / otherwise.
                  if (step > 1) {
                    setStep((s) => s - 1);
                  } else if (typeof window !== "undefined" && window.history.length > 1) {
                    navigate(-1);
                  } else {
                    navigate(user ? "/app" : "/");
                  }
                }}
                className="px-6 py-4 rounded-full font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-2"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button onClick={handleNext} className="flex-1 px-6 py-4 rounded-full font-bold text-sm bg-primary-500 text-white hover:bg-primary-600 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-glow">
                {step === 6 ? "Generate Matches" : "Continue"} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </motion.div>
      </main>

      <div className="relative z-10 w-full max-w-xl mx-auto px-6">
        <AppFooter />
      </div>
    </div>
  );
}
