import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Premium ease used by Linear / Vercel / Notion — soft start, snappy end.
const PREMIUM_EASE = [0.21, 0.47, 0.32, 0.98] as const;

export interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  /** Distance in px the content starts shifted down from. Default 16. */
  offset?: number;
  /** When true, animates every time the element comes into view. Default false (run once). */
  repeat?: boolean;
  className?: string;
  as?: "div" | "section" | "article" | "li" | "header";
}

/**
 * Wraps content with a scroll-triggered fade-up animation.
 * Performs well on mobile because each animation runs once and
 * uses GPU-friendly transform/opacity properties.
 */
export function FadeIn({
  children,
  delay    = 0,
  duration = 0.45,
  offset   = 16,
  repeat   = false,
  className,
  as       = "div",
}: FadeInProps) {
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      initial={{ opacity: 0, y: offset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: !repeat, margin: "-60px" }}
      transition={{ duration, delay, ease: PREMIUM_EASE }}
      className={className}
    >
      {children}
    </Tag>
  );
}

/**
 * Applies a deterministic stagger so a grid of items pops in cascade.
 * Wrap with <FadeIn> on the parent and use <FadeInItem index={i} /> on children.
 */
export function FadeInItem({
  children, index = 0, className, as = "div", offset = 16, base = 0.05, max = 0.4,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: "div" | "section" | "article" | "li";
  offset?: number;
  base?: number;
  max?: number;
}) {
  const Tag = motion[as] as typeof motion.div;
  const delay = Math.min(index * base, max);
  return (
    <Tag
      initial={{ opacity: 0, y: offset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay, ease: PREMIUM_EASE }}
      className={className}
    >
      {children}
    </Tag>
  );
}
