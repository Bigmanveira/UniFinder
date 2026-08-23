import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, FileText, Check, AlertTriangle, Loader2 } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "../../lib/firebase";
import type { VisaDocumentType } from "../../types";

const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg"]);
const MAX_BYTES = 10 * 1024 * 1024;

const DOC_LABELS: Record<VisaDocumentType, { title: string; hint: string }> = {
  i20:                { title: "Form I-20",                hint: "Issued by the school. Contains your SEVIS ID." },
  ds160_confirmation: { title: "DS-160 confirmation page", hint: "Printed barcode page from your DS-160 submission." },
  bank_statement:     { title: "Bank statement",           hint: "Recent statement showing the funds available for your studies." },
  employment_letter:  { title: "Employment letter",        hint: "Letter or contract from your or your sponsor's employer." },
  sponsor_letter:     { title: "Sponsor letter",           hint: "Letter from your financial sponsor (e.g. parent, relative, or scholarship body)." },
  transcript:         { title: "Academic transcript",      hint: "Most recent transcript or grade report from your school." },
};

interface Props {
  open:           boolean;
  onClose:        () => void;
  userId:         string;
  sessionId:      string;
  documentType:   VisaDocumentType;
  onUploaded:     (docType: VisaDocumentType) => void;
  /**
   * When true, shows an "I don't have this" button that lets the user
   * dismiss the request without uploading. For supporting docs Anna asks
   * for mid-interview (bank statement, sponsor letter, etc.) this is the
   * natural answer when the student doesn't carry the document. Not shown
   * for the mandatory I-20 / DS-160 at the top of the interview.
   */
  allowSkip?:     boolean;
  /** Called when the user clicks "I don't have this". The page should tell
   *  the backend so Anna's next turn acknowledges the missing document. */
  onSkipped?:     (docType: VisaDocumentType) => void;
}

export default function DocumentUploadModal({
  open, onClose, userId, sessionId, documentType, onUploaded, allowSkip = false, onSkipped,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file,    setFile]    = useState<File | null>(null);
  const [error,   setError]   = useState("");
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState(false);

  const reset = () => { setFile(null); setError(""); setDone(false); };

  // X / backdrop close. If the user is bailing out without uploading, treat
  // it as a skip so the interview keeps moving (Anna probes verbally instead
  // of leaving the page stuck on "Officer is thinking…"). After a successful
  // upload (`done` is true) or while a request is in flight (`busy`), close
  // is just a dismissal.
  const handleClose = () => {
    if (busy) return;
    if (!done && onSkipped) {
      onSkipped(documentType);
    }
    reset();
    onClose();
  };

  const handlePick = (f: File | null | undefined) => {
    setError("");
    if (!f) return;
    if (!ALLOWED.has(f.type)) { setError("Only PDF, PNG, or JPEG files are allowed."); return; }
    if (f.size > MAX_BYTES)  { setError("File must be 10 MB or smaller.");           return; }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      // Sanitize filename so it stays a single path segment (matches storage rules)
      const safeName = file.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80);
      const path = `users/${userId}/visa-interviews/${sessionId}/${documentType}/${safeName}`;
      const ref = storageRef(storage, path);
      const uploaded = await uploadBytes(ref, file, { contentType: file.type });

      // Best-effort sanity check that we can read it back via download URL
      try { await getDownloadURL(uploaded.ref); } catch { /* ignore — rules sometimes need a tick */ }

      // Record metadata. Firestore rules allow client-create with strict shape.
      await addDoc(collection(db, "visaInterviewDocuments"), {
        sessionId,
        userId,
        documentType,
        storagePath: path,
        fileName:    safeName,
        contentType: file.type,
        size:        file.size,
        status:      "uploaded",
        uploadedAt:  serverTimestamp(),
      });

      setDone(true);
      onUploaded(documentType);
      // Auto-close after a beat
      setTimeout(() => { reset(); onClose(); }, 1100);
    } catch (e: any) {
      console.error("Upload error:", e);
      setError(e?.message ?? "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const meta = DOC_LABELS[documentType];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative overflow-hidden bg-white w-full sm:max-w-md rounded-t-card-lg sm:rounded-card-lg border border-slate-100 shadow-card"
          >
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full border-[16px] border-primary-100/70" />
            <div className="relative px-6 pt-5 pb-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 text-primary-600 flex items-center justify-center">
                <FileText size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500">Document check</p>
                <h2 className="text-base font-black tracking-tight text-slate-900 leading-tight">Upload requested document</h2>
                <p className="text-xs text-slate-500 mt-0.5">{meta.title} · {meta.hint}</p>
              </div>
              <button
                onClick={handleClose}
                disabled={busy}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="relative p-6 space-y-4">
              {/* Disclaimer */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[12px] text-amber-900 flex items-start gap-2">
                <AlertTriangle size={13} className="mt-0.5 text-amber-700 flex-shrink-0" />
                <span>Use the real document only when practicing for yourself. Don't upload someone else's I-20 or DS-160.</span>
              </div>

              {/* Drop area */}
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className={`w-full border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
                  file ? "border-primary-300 bg-primary-50/40" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <Upload size={22} className={`mx-auto mb-2 ${file ? "text-primary-600" : "text-slate-500"}`} />
                {file ? (
                  <>
                    <p className="text-sm font-bold text-slate-900 truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-700">Click to choose a file</p>
                    <p className="text-xs text-slate-500 mt-0.5">PDF, PNG, or JPG · max 10 MB</p>
                  </>
                )}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/jpg"
                onChange={(e) => handlePick(e.target.files?.[0])}
                className="hidden"
              />

              {error && (
                <div className="bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 rounded-lg text-xs font-semibold">
                  {error}
                </div>
              )}

              {/* Action */}
              <button
                onClick={handleUpload}
                disabled={!file || busy || done}
                className={`w-full inline-flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold transition-colors ${
                  done
                    ? "bg-[#E8F5E9] text-[#2E7D32] border border-[#2E7D32]/20"
                    : "bg-ink hover:bg-slate-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                }`}
              >
                {busy ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                  : done ? <><Check size={14} /> Uploaded</>
                  : <>Upload {meta.title}</>}
              </button>

              {/* Skip — only offered for mid-interview supporting docs.
                  Stays subtle so users don't reflex-click past it. */}
              {allowSkip && !done && !busy && (
                <button
                  onClick={() => { reset(); onSkipped?.(documentType); onClose(); }}
                  className="w-full text-center text-[12px] text-slate-500 hover:text-slate-700 underline underline-offset-2 -mt-1"
                >
                  I don't have this — continue without it
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
