// ─────────────────────────────────────────────────────────────────────────────
// CvDocumentIntake — PDF / Word / image upload OR paste-text. Used by the
// Reviewer + Converter flows (Builder uses a structured form instead).
//
// File handling:
//   - PDFs + images → Claude vision (server side)
//   - .docx          → mammoth.extractRawText (server side; no AI cost)
//   - .doc (legacy)  → refused with a clear "save as .docx" message
//
// We read the file as base64 in the browser and ship to the
// generateAcademicCvDocument callable, which calls extractCvText().
// Browser-side PDF.js was considered and ruled out (heavy, scanned-PDF
// support is shaky, and Claude vision capacity is already warm).
//
// Drag-and-drop: the upload zone accepts dropped files in addition to
// click-to-pick. dragenter / dragleave / dragover / drop all wired,
// with a `dragOver` state to highlight the drop target.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { FileUp, AlertTriangle, X, Type, FileText } from "lucide-react";
import { Button } from "../ui/Button";
import { IconChip } from "../ui/IconChip";
import { cn } from "../../lib/cn";

const MAX_FILE_MB = 10;
const ACCEPT_TYPES =
  "application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/msword," +
  "image/jpeg,image/png,image/webp";
const ACCEPT_HUMAN = "PDF, Word (.docx), JPG, PNG, or WebP";

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
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    setError(null);
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File is over ${MAX_FILE_MB}MB. Use a smaller scan or paste the text.`);
      setFile(null);
      return;
    }
    // Belt-and-braces type check. Browsers occasionally report a generic
    // `application/octet-stream` for files dragged off the desktop; we
    // fall back to extension matching so a legitimate .docx still works.
    const looksOK =
      ["application/pdf",
       "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
       "application/msword",
       "image/jpeg", "image/png", "image/webp"].includes(f.type) ||
      /\.(pdf|docx|doc|jpe?g|png|webp)$/i.test(f.name);
    if (!looksOK) {
      setError(`Unsupported file type. Use ${ACCEPT_HUMAN}.`);
      return;
    }
    setFile(f);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) handleFile(dropped);
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
      setError("Pick a PDF, Word doc, or image — or drag one onto the dashed area. You can also switch to paste-text.");
      return;
    }
    try {
      // FileReader → DataURL → strip the `data:...;base64,` prefix.
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
      // Some browsers report empty / octet-stream — pick the right MIME
      // from the file extension so the server-side extractor branches
      // correctly. mammoth needs the precise docx media type.
      let mediaType = file.type;
      if (!mediaType || mediaType === "application/octet-stream") {
        if (/\.docx$/i.test(file.name)) mediaType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (/\.doc$/i.test(file.name)) mediaType = "application/msword";
        else if (/\.pdf$/i.test(file.name)) mediaType = "application/pdf";
        else if (/\.jpe?g$/i.test(file.name)) mediaType = "image/jpeg";
        else if (/\.png$/i.test(file.name))   mediaType = "image/png";
        else if (/\.webp$/i.test(file.name))  mediaType = "image/webp";
      }
      onSubmit({ fileBase64: base64, fileMediaType: mediaType });
    } catch (err: any) {
      setError(err?.message ?? "Could not read the file. Try paste-text instead.");
    }
  };

  return (
    <div className="space-y-5">
      {/* Mode switch */}
      <div className="inline-flex p-1 bg-slate-100 rounded-full">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={cn(
            "px-4 py-2 rounded-full text-[13px] font-bold transition-colors inline-flex items-center gap-1.5",
            mode === "upload" ? "bg-ink text-white" : "text-slate-600 hover:text-slate-900",
          )}
        >
          <FileUp size={14} /> Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={cn(
            "px-4 py-2 rounded-full text-[13px] font-bold transition-colors inline-flex items-center gap-1.5",
            mode === "paste" ? "bg-ink text-white" : "text-slate-600 hover:text-slate-900",
          )}
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
              onDragEnter={onDragOver}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={cn(
                "w-full border-2 border-dashed rounded-card px-6 py-10 text-center transition-all",
                dragOver
                  ? "border-primary-500 bg-primary-50/60 ring-2 ring-primary-100 scale-[1.005]"
                  : "border-slate-300 hover:border-slate-400 hover:bg-slate-50",
              )}
            >
              <IconChip
                icon={<FileUp size={22} />}
                tint={dragOver ? "primary" : "slate"}
                size="lg"
                className="mx-auto mb-3 transition-colors"
              />
              <p className="text-sm font-bold text-slate-900 mb-1">
                {dragOver ? "Drop your file here" : "Drag and drop your CV here"}
              </p>
              <p className="text-xs text-slate-500 mb-2">or click to pick a file</p>
              <p className="text-[11px] text-slate-400">{ACCEPT_HUMAN} · Max {MAX_FILE_MB}MB</p>
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/70 rounded-2xl px-4 py-3">
              <IconChip icon={<FileText size={16} />} tint="primary" size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-900 truncate">{file.name}</p>
                <p className="text-[11px] text-slate-500">{(file.size / 1024).toFixed(0)} KB · {file.type || "unknown"}</p>
              </div>
              <button
                type="button"
                onClick={() => handleFile(null)}
                className="w-8 h-8 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center transition-colors"
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
          className="w-full min-h-[280px] resize-y bg-white border border-slate-200 rounded-2xl px-5 py-4 text-[14px] text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium rounded-xl px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        loading={busy}
        variant="primary"
        size="lg"
        className="w-full"
      >
        {busy ? "Working…" : submitLabel}
      </Button>
    </div>
  );
}
