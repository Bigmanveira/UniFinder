import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// IconChip — the tinted rounded icon square that anchors cards and list rows.
// ─────────────────────────────────────────────────────────────────────────────
type Tint = "primary" | "ink" | "slate" | "amber" | "sky" | "rose" | "white";
type Size = "sm" | "md" | "lg";

const TINTS: Record<Tint, string> = {
  primary: "bg-primary-50 text-primary-600",
  ink: "bg-ink/5 text-ink",
  slate: "bg-slate-100 text-slate-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-rose-600",
  // For use on dark surfaces
  white: "bg-white/15 text-white",
};

const SIZES: Record<Size, string> = {
  sm: "w-8 h-8 rounded-xl",
  md: "w-10 h-10 rounded-2xl",
  lg: "w-12 h-12 rounded-2xl",
};

interface IconChipProps {
  icon: ReactNode;
  tint?: Tint;
  size?: Size;
  className?: string;
}

export function IconChip({ icon, tint = "primary", size = "md", className }: IconChipProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0",
        SIZES[size],
        TINTS[tint],
        className,
      )}
    >
      {icon}
    </div>
  );
}
