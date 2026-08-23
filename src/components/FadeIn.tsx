import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// FadeIn / FadeInItem — now static wrappers (2026-08-23). The scroll-triggered
// entrance animations held content at opacity 0 until an observer fired,
// which on mobile read as slow loads and elements vanishing mid-scroll.
// Content now renders immediately. APIs kept so call sites don't churn;
// framer-motion is no longer imported here, keeping it out of these chunks.
// ─────────────────────────────────────────────────────────────────────────────

export interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  offset?: number;
  repeat?: boolean;
  className?: string;
  as?: "div" | "section" | "article" | "li" | "header";
}

export function FadeIn({ children, className, as: Tag = "div" }: FadeInProps) {
  return <Tag className={className}>{children}</Tag>;
}

export function FadeInItem({
  children, className, as: Tag = "div",
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: "div" | "section" | "article" | "li";
  offset?: number;
  base?: number;
  max?: number;
}) {
  return <Tag className={className}>{children}</Tag>;
}
