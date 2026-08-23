import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Eyebrow — the tiny uppercase kicker label above headings.
// tone "muted" for light surfaces (default), "primary" for emphasis,
// "light" for dark ink surfaces.
// ─────────────────────────────────────────────────────────────────────────────
type Tone = "muted" | "primary" | "light";

const TONES: Record<Tone, string> = {
  muted: "text-slate-400",
  primary: "text-primary-600",
  light: "text-white/60",
};

export function Eyebrow({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-eyebrow",
        TONES[tone],
        className,
      )}
    >
      {children}
    </p>
  );
}
