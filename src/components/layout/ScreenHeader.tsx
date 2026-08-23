import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// ScreenHeader — the mockups' screen-top pattern: uppercase eyebrow, big
// extrabold title (optional subtitle), and a round white icon button on the
// right (bell, filters, calendar…).
// ─────────────────────────────────────────────────────────────────────────────
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500">{eyebrow}</p>
        <h1 className="text-[28px] font-black leading-9 tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Round white icon button used in screen headers. */
export function HeaderIconButton({
  icon,
  label,
  onClick,
  dot,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-900 shadow-card transition-transform active:scale-95"
    >
      {dot && <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-white bg-primary-500" />}
      {icon}
    </button>
  );
}
