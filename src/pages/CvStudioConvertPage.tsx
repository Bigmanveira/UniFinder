import { Link } from "react-router-dom";
import { ArrowLeft, FileText, AlertTriangle, RotateCw } from "lucide-react";
import { useAcademicCv } from "../components/cv/useAcademicCv";
import CvDocumentIntake from "../components/cv/CvDocumentIntake";
import CvPreviewPaywall from "../components/cv/CvPreviewPaywall";

export default function CvStudioConvertPage() {
  const cv = useAcademicCv("convert");

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-slate-900 antialiased pb-20 relative overflow-hidden">
      <div className="pointer-events-none absolute top-[-100px] right-[-100px] w-[440px] h-[440px] bg-emerald-200/40 rounded-full blur-[120px]" aria-hidden />

      <header className="border-b border-slate-200 sticky top-0 z-40 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/app/cv-studio" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors" aria-label="Back to CV Studio">
            <ArrowLeft size={15} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">Professional → Academic</h1>
            <p className="text-xs text-slate-500 truncate">Restructure a corporate CV into academic format — 8 credits to unlock</p>
          </div>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-5 py-8 space-y-8">
        {!cv.document && (
          <>
            <section>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center mb-4 shadow-md">
                <FileText size={20} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mb-2 leading-tight">
                Industry CV in. Academic CV out.
              </h2>
              <p className="text-base text-slate-700 max-w-2xl leading-relaxed">
                Upload or paste your professional CV. We'll restructure it for an academic reader — foregrounding research, publications, teaching, and stripping the corporate marketing language.
              </p>
            </section>

            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <CvDocumentIntake
                busy={cv.generating}
                submitLabel="Convert to academic format (free preview)"
                helpText="The first ~30% of your converted CV is free to preview. Unlock the rest for 8 credits."
                onSubmit={(payload) => void cv.generate(payload)}
              />
            </section>
          </>
        )}

        {cv.error && !cv.document && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium rounded-2xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{cv.error}</span>
          </div>
        )}

        {cv.document && (
          <>
            <section>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mb-2 leading-tight">
                Your academic-format CV
              </h2>
              <div className="flex items-center justify-between gap-3 mb-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Restructured for academic review. Preview free; unlock for 8 credits.
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
              mode="convert"
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
