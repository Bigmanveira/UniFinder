import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Button — the one pill button for the whole app.
//
// variant  primary  filled brand blue with a soft colored glow (main CTAs)
//          dark     ink navy fill (hero/dark-surface CTAs)
//          outline  white card with border (secondary actions)
//          ghost    borderless, text-only (tertiary/inline actions)
//          danger   destructive red fill
// size     sm | md | lg
// to       renders a react-router <Link> instead of <button>
// loading  swaps the icon for a spinner and disables the button
// ─────────────────────────────────────────────────────────────────────────────
type Variant = "primary" | "dark" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary-500 text-white hover:bg-primary-600 shadow-glow",
  dark: "bg-ink text-white hover:bg-slate-800 shadow-lg shadow-slate-900/20",
  outline:
    "bg-white text-slate-900 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm",
  ghost: "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20",
};

const SIZES: Record<Size, string> = {
  sm: "px-4 py-2 text-xs gap-1.5",
  md: "px-5 py-2.5 text-sm gap-2",
  lg: "px-7 py-3.5 text-sm gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  /** Render as a router link to this path instead of a <button>. */
  to?: string;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  to,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-full font-bold leading-none",
    "transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
    VARIANTS[variant],
    SIZES[size],
    className,
  );

  const content = (
    <>
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </>
  );

  if (to && !disabled && !loading) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}
