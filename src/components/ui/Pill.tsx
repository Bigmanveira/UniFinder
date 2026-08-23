import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Pill — rounded-full chip for filters and small badges.
// Interactive (button) when onClick is provided; static span otherwise.
// active: dark ink fill; inactive: white card with border.
// ─────────────────────────────────────────────────────────────────────────────
interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: ReactNode;
}

export function Pill({ active = false, icon, className, children, onClick, ...rest }: PillProps) {
  const classes = cn(
    "inline-flex items-center gap-1.5 shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors",
    active
      ? "bg-ink text-white"
      : "bg-white text-slate-700 border border-slate-200/70 shadow-sm",
    onClick && !active && "hover:border-slate-300",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={classes} {...rest}>
        {icon}
        {children}
      </button>
    );
  }
  return (
    <span className={classes}>
      {icon}
      {children}
    </span>
  );
}
