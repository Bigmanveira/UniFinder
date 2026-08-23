import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Reveal — now a static wrapper (2026-08-23). The scroll-triggered fade-up
// held content at opacity 0 until an IntersectionObserver fired, which on
// mobile read as slow loads and elements "vanishing" while scrolling.
// Content now renders immediately; the API is kept so call sites don't churn.
// ─────────────────────────────────────────────────────────────────────────────

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Kept for API compatibility — no longer used. */
  delay?: number;
  /** Kept for API compatibility — no longer used. */
  offset?: number;
  as?: "div" | "section" | "article" | "li" | "header" | "footer";
}

export function Reveal({ children, className = "", as: Tag = "div" }: RevealProps) {
  return <Tag className={className}>{children}</Tag>;
}
