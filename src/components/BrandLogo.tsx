import { Link } from "react-router-dom";
import webLogo from "../assets/weblogo.png";

// ─────────────────────────────────────────────────────────────────────────────
// BrandLogo — the College Ready wordmark.
//
// One component for every nav header, footer, and split-screen marketing
// surface. The "logo" is a circular badge (radial sky→blue gradient) that
// holds the white weblogo.png glyph, sat beside the "College Ready"
// wordmark. The glyph in the source PNG is white-on-transparent and
// off-centre toward the top of the canvas; we force-whiten with a CSS
// filter and nudge it down with translate-y so it lands visually centred
// inside the circle.
//
// Props:
//   size      — "sm" (mobile chrome, ~32px), "md" (default headers, ~40px),
//               "lg" (hero pill on the landing page, ~44px desktop).
//   tone      — "dark" wordmark for light backgrounds (default), "light"
//               wordmark when the surrounding surface is dark navy / glass.
//   iconOnly  — drop the wordmark text. Useful on very tight chrome.
//   asLink    — wrap in <Link to="/">. Set false when the parent is already
//               clickable.
// ─────────────────────────────────────────────────────────────────────────────
type Size = "sm" | "md" | "lg";
type Tone = "dark" | "light";

interface Props {
  size?:     Size;
  tone?:     Tone;
  iconOnly?: boolean;
  asLink?:   boolean;
  /** Extra classes appended to the outer wrapper. */
  className?: string;
}

const SIZES: Record<Size, { circle: string; img: string; text: string; gap: string }> = {
  sm: { circle: "w-8 h-8",   img: "scale-[1.45] translate-y-[2px]", text: "text-base", gap: "gap-2" },
  md: { circle: "w-10 h-10", img: "scale-[1.55] translate-y-[3px]", text: "text-xl",  gap: "gap-2.5" },
  lg: { circle: "w-11 h-11 md:w-12 md:h-12", img: "scale-[1.55] translate-y-[3px]", text: "text-xl md:text-2xl", gap: "gap-3" },
};

export default function BrandLogo({
  size = "md",
  tone = "dark",
  iconOnly = false,
  asLink = true,
  className = "",
}: Props) {
  const s = SIZES[size];
  const textColor = tone === "dark" ? "text-slate-900" : "text-white";

  const inner = (
    <div className={`flex items-center ${s.gap} ${className}`}>
      <div
        className={`${s.circle} rounded-full overflow-hidden flex-shrink-0 shadow-md shadow-primary-500/30 flex items-center justify-center p-2 ring-1 ring-white/20`}
        style={{ background: "radial-gradient(circle at 30% 30%, #7dd3fc 0%, #60a5fa 50%, #3b82f6 100%)" }}
      >
        <img
          src={webLogo}
          alt=""
          aria-hidden
          className={`w-full h-full object-contain select-none ${s.img}`}
          style={{ filter: "brightness(0) invert(1)" }}
          draggable={false}
        />
      </div>
      {!iconOnly && (
        // Wordmark is one word: "CollegeReady". "College" is heavy/bold,
        // "Ready" is a lighter weight on the same line so the eye reads
        // them as a compound brand without a space.
        <span className={`${s.text} tracking-tight leading-none ${textColor}`}>
          <span className="font-black">College</span>
          <span className="font-medium">Ready</span>
        </span>
      )}
    </div>
  );

  if (asLink) {
    return <Link to="/" aria-label="College Ready home" className="inline-block">{inner}</Link>;
  }
  return inner;
}
