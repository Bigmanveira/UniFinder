// ─────────────────────────────────────────────────────────────────────────────
// CvDocumentIntake — the PDF-upload-OR-paste-text input used by the Reviewer
// and Converter flows. (Builder uses a structured form instead, so it has
// its own intake.)
//
// File handling: we read the PDF as a base64 string in the browser and ship
// it to the backend's generateAcademicCvDocument callable. The backend's
// extractCvText() runs Claude vision over the PDF to produce raw text,
// which then feeds the generator. Browser-side OCR was considered + ruled
// out — pdfjs is heavy (~400KB), scanned-PDF support is shaky, and we
// already have Claude vision capacity warm.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { FileUp, Loader2, AlertTriangle, X, Type, FileText } from "lucide-react";

const MAX_FILE_MB = 10;
const ACCEPT_TYPES = "application/pdf,image/jpeg,image/png,image/webp";

type Mode = "upload" | "paste";

export default function CvDocumentIntake({
  busy,
  onSubmit,
  submitLabel,
  helpText,
}: {
  busy:       boolean;
  submitLabel: string;
  helpText?:   string;
  onSubmit:   (payload: { inputText?: string; fileBase64?: string; fileMediaType?: string }) => void;
}) {
  const [mode, setMode] = useState<Mode>("upload");
  const [pasteText, setPasteText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    setError(null);
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File is over ${MAX_FILE_MB}MB. Use a smaller scan or paste the text.`);
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    setError(null);
    if (mode === "paste") {
      const trimmed = pasteText.trim();
      if (trimmed.length < 80) {
        setError("Paste at least a few sentences of your CV — under 80 characters won't give the AI enough to work with.");
        return;
      }
      onSubmit({ inputText: trimmed });
      return;
    }
    if (!file) {
      setError("Pick a PDF or image of your CV, or switch to paste-text.");
      return;
    }
    try {
      // FileReader → DataURL → strip the `data:...;base64,` prefix.
      // Spread the work into a Promise so the spinner state is live.
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => {
          const result = reader.result;
          if (typeof result !== "string") return reject(new Error("Bad file"));
          const idx = result.indexOf(",");
          resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      onSubmit({ fileBase64: base64, fileMediaType: file.type || "application/pdf" });
    } catch (err: any) {
      setError(err?.message ?? "Could not read the file. Try paste-text instead.");
    }
  };

  return (
    <div className="space-y-5">
      {/* Mode switch */}
      <div className="inline-flex p-1 bg-slate-100 rounded-2xl">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-colors inline-flex items-center gap-1.5 ${mode === "upload" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          <FileUp size={14} /> Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-colors inline-flex items-center gap-1.5 ${mode === "paste" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          <Type size={14} /> Paste text
        </button>
      </div>

      {helpText && (
        <p className="text-sm text-slate-600 leading-relaxed">{helpText}</p>
      )}

      {/* Upload path */}
      {mode === "upload" && (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_TYPES}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          {!file ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-3xl px-6 py-10 text-center transition-colors"
            >
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mb-3">
                <FileUp size={20} />
              </div>
              <p className="text-sm font-bold text-slate-900 mb-1">Click to pick a CV file</p>
              <p className="text-xs text-slate-500">PDF, JPG, PNG, or WebP. Max {MAX_FILE_MB}MB.</p>
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 flex-shrink-0">
                <FileText size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-900 truncate">{file.name}</p>
                <p className="text-[11px] text-slate-500">{(file.size / 1024).toFixed(0)} KB · {file.type || "unknown"}</p>
              </div>
              <button
                type="button"
                onClick={() => handleFile(null)}
                className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center transition-colors"
                aria-label="Remove file"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Paste path */}
      {mode === "paste" && (
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste your CV text here…"
          className="w-full min-h-[280px] resize-y bg-white border border-slate-200 rounded-3xl px-5 py-4 text-[14px] text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium rounded-xl px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {busy ? "Working…" : submitLabel}
      </button>
    </div>
  );
}
