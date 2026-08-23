import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Modal — the shared popup shell.
//
// Exists so surfaces that used to take over the whole screen (the roadmap
// diagnostic, the stage picker) can be dismissed instead of navigated away
// from. Handles the things every dialog needs and that are easy to forget:
// Escape to close, backdrop click, body scroll lock, focus moved into the
// dialog on open and restored to the trigger on close, and a real
// role="dialog" + aria-modal for screen readers.
//
// Renders through a portal so a modal opened from deep inside a card is never
// clipped by an ancestor's overflow or stacking context.
// ─────────────────────────────────────────────────────────────────────────────

export type ModalWidth = "sm" | "md" | "lg";

const WIDTH: Record<ModalWidth, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  width = "md",
  closeOnBackdrop = true,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  width?: ModalWidth;
  /** Set false for flows where a stray backdrop click would lose work. */
  closeOnBackdrop?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef   = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open so the page behind doesn't scroll under it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Move focus into the dialog, and hand it back to whatever opened it.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => restoreRef.current?.focus?.();
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (closeOnBackdrop && e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 16, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-card border border-slate-200/70 bg-white shadow-card-hover outline-none sm:rounded-card ${WIDTH[width]}`}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold tracking-tight text-slate-900">{title}</h2>
                {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

            {footer && <div className="border-t border-slate-100 px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
