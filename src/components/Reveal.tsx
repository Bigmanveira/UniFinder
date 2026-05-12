import { useEffect, useRef, useState, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight scroll-reveal — pure browser primitives, no framer-motion.
//
// Why a separate component instead of FadeIn (which exists already)?
//   - FadeIn pulls in framer-motion (~150 KB minified). The landing page
//     deliberately avoids that bundle for first-paint reasons.
//   - This version is ~50 lines and uses IntersectionObserver + a plain
//     Tailwind opacity/translate transition. The browser only does work
//     at the moment of intersection; once revealed we disconnect the
//     observer entirely so there's zero ongoing scroll cost.
//
// Performance notes:
//   - opacity + transform animate on the compositor; no layout/paint cost.
//   - We honour `prefers-reduced-motion` and skip the animation entirely.
//   - One-shot only. Disconnect after the first reveal — no flicker on
//     scroll-back, no JS handler running while the user scrolls.
//   - Use rootMargin to trigger slightly before the element enters the
//     viewport, so the user never sees the un-revealed state.
// ─────────────────────────────────────────────────────────────────────────────

interface RevealProps {
  children: ReactNode;
  /** Extra classes appended to the outer wrapper. */
  className?: string;
  /** Delay (ms) before the fade-up starts. Useful for staggering siblings. */
  delay?: number;
  /** Translate distance in pixels (default 16). */
  offset?: number;
  /** Render as a different tag (default "div"). */
  as?: "div" | "section" | "article" | "li" | "header" | "footer";
}

export function Reveal({
  children,
  className = "",
  delay = 0,
  offset = 16,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Reduced-motion users: skip the animation entirely.
    if (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    // Safety net for very old browsers without IntersectionObserver — just
    // show immediately. Mobile browsers from 2018+ have it natively.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -50px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const baseStyle: React.CSSProperties = {
    // Inline so we can vary the distance without a Tailwind class explosion.
    transform: visible ? "none" : `translateY(${offset}px)`,
    opacity:   visible ? 1 : 0,
    transition: `opacity 600ms ease-out, transform 600ms ease-out`,
    transitionDelay: `${delay}ms`,
    willChange: visible ? "auto" : "opacity, transform",
  };

  // Forward the ref correctly regardless of the chosen tag.
  return (
    <Tag
      ref={ref as React.RefObject<any>}
      className={className}
      style={baseStyle}
    >
      {children}
    </Tag>
  );
}
