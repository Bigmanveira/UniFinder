import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// AppHeader — the one sticky sub-header used by every full-page flow screen
// (roadmap, reports, visa, CV studio…). Replaces ~11 hand-rolled copies of
// the same back-arrow + title + right-action bar.
//
//   backTo    path for the back-arrow circle (omit to hide it)
//   title     required page title (kept small; pages put big headings in-body)
//   subtitle  optional one-line muted subtitle under the title
//   action    optional right-side node (chips, buttons, links)
//   maxWidth  content column width class, defaults to max-w-5xl
// ─────────────────────────────────────────────────────────────────────────────
interface AppHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  backLabel?: string;
  action?: ReactNode;
  maxWidth?: string;
  className?: string;
}

export function AppHeader({
  title,
  subtitle,
  backTo,
  backLabel = "Back",
  action,
  maxWidth = "max-w-5xl",
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-slate-200/50 bg-white/95 md:bg-white/70 md:backdrop-blur-xl md:supports-[backdrop-filter]:bg-white/60",
        className,
      )}
    >
      <div className={cn("mx-auto px-5 h-14 flex items-center gap-3", maxWidth)}>
        {backTo && (
          <Link
            to={backTo}
            className="w-9 h-9 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors"
            aria-label={backLabel}
          >
            <ArrowLeft size={15} />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-[14px] font-bold leading-tight text-slate-900 truncate">{title}</h1>
          {subtitle && (
            <p className="text-[11px] font-medium text-slate-500 leading-tight truncate">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  );
}
