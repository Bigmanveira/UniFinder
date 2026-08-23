import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Card — the base surface of the design language.
//
// tone   light  white card, hairline border, soft layered shadow (default)
//        dark   ink navy hero surface with white text
// decor  dark-tone only: adds the signature decorative ring + glow orb in the
//        top-right corner (pure CSS, aria-hidden, clipped by overflow-hidden)
// hover  lift shadow on hover for clickable cards
// pad    none | sm | md | lg — common padding presets
// ─────────────────────────────────────────────────────────────────────────────
type Tone = "light" | "dark";
type Pad = "none" | "sm" | "md" | "lg";

const PADS: Record<Pad, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6 sm:p-8",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  pad?: Pad;
  hover?: boolean;
  decor?: boolean;
}

export function Card({
  tone = "light",
  pad = "md",
  hover = false,
  decor = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "relative rounded-card",
        tone === "light" && "bg-white border border-slate-200/70 shadow-card",
        tone === "dark" && "bg-ink text-white rounded-card-lg overflow-hidden shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)]",
        hover && "transition-shadow hover:shadow-card-hover",
        PADS[pad],
        className,
      )}
      {...rest}
    >
      {tone === "dark" && decor && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-8 -top-10 w-36 h-36 rounded-full border-[18px] border-primary-500/20" />
          <div className="absolute -right-4 top-10 w-40 h-40 rounded-full bg-primary-500/15 blur-3xl" />
        </div>
      )}
      {tone === "dark" && decor ? <div className="relative">{children}</div> : children}
    </div>
  );
}
