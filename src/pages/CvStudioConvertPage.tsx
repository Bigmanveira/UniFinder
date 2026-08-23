import { FileText, AlertTriangle, RotateCw } from "lucide-react";
import { useAcademicCv } from "../components/cv/useAcademicCv";
import CvDocumentIntake from "../components/cv/CvDocumentIntake";
import CvPreviewPaywall from "../components/cv/CvPreviewPaywall";
import CvStudioFooter from "../components/cv/CvStudioFooter";
import GenerationLoader from "../components/cv/GenerationLoader";
import { AppHeader } from "../components/AppHeader";
import { Card } from "../components/ui/Card";
import { IconChip } from "../components/ui/IconChip";

export default function CvStudioConvertPage() {
  const cv = useAcademicCv("convert");

  return (
    <div className="min-h-screen bg-surface text-slate-900 antialiased flex flex-col">
      <AppHeader
        title="Professional → Academic"
        subtitle="Restructure a corporate CV into academic format · 800 tokens to unlock"
        backTo="/app/cv-studio"
        backLabel="Back to CV Studio"
        maxWidth="max-w-6xl"
      />

      {!cv.document && (
        <section className="relative max-w-3xl mx-auto px-5 pt-10 sm:pt-14 pb-2 text-center">
          <IconChip icon={<FileText size={22} />} tint="primary" size="lg" className="mx-auto mb-5" />
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mb-3 leading-[1.1]">
            Industry CV in. Academic CV out.
          </h2>
          <p className="text-base sm:text-[17px] text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Upload or paste your professional CV. We'll restructure it for an academic reader — foregrounding research, publications, and teaching while stripping the corporate marketing language.
          </p>
        </section>
      )}

      <main className="relative max-w-3xl mx-auto px-5 py-8 w-full flex-1 space-y-8">
        {cv.generating && (
          <GenerationLoader mode="convert" />
        )}

        {!cv.document && !cv.generating && (
          <Card pad="lg" className="rounded-card">
            <CvDocumentIntake
              busy={cv.generating}
              submitLabel="Convert to academic format (free preview)"
              helpText="The first ~30% of your converted CV is free to preview. Unlock the rest for 800 tokens."
              onSubmit={(payload) => void cv.generate(payload)}
            />
          </Card>
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
                  Restructured for academic review. Preview free; unlock for 800 tokens.
                </p>
                <button
                  onClick={cv.reset}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
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

      <CvStudioFooter />
    </div>
  );
}
