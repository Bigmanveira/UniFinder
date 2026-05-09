import { useMemo, useState } from "react";
import { logoUrl, faviconUrl } from "../../lib/schools/schoolLogo";

// ─────────────────────────────────────────────────────────────────────────────
// SchoolCardArt — full-bleed background art for a school card.
//
// Renders a deterministic colored gradient (seeded by the school's unitId so
// every card stays visually consistent across renders/sessions) with the
// school's logo centered on top. If Clearbit doesn't have the logo we fall
// back to Google's favicon service; if BOTH fail (rare — usually only for
// schools whose website domain we don't store) we draw the school's first
// initial in a large letter mark.
// ─────────────────────────────────────────────────────────────────────────────

const GRADIENTS: { from: string; to: string }[] = [
  { from: "from-indigo-600",   to: "to-violet-700"   },
  { from: "from-blue-600",     to: "to-indigo-800"   },
  { from: "from-emerald-600",  to: "to-teal-700"     },
  { from: "from-rose-600",     to: "to-pink-700"     },
  { from: "from-amber-500",    to: "to-orange-700"   },
  { from: "from-cyan-600",     to: "to-blue-700"     },
  { from: "from-purple-600",   to: "to-fuchsia-700"  },
  { from: "from-slate-700",    to: "to-slate-900"    },
  { from: "from-red-600",      to: "to-rose-800"     },
  { from: "from-teal-600",     to: "to-emerald-800"  },
];

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function gradientFor(seed: string): { from: string; to: string } {
  return GRADIENTS[hashString(seed) % GRADIENTS.length];
}

interface Props {
  /** Used as the gradient seed. Same school always gets the same gradient. */
  unitId:    string | null | undefined;
  /** School's website URL — fed into the Clearbit logo API. */
  schoolUrl: string | null | undefined;
  /** Used for the letter-mark fallback when no logo source resolves. */
  name:      string | null | undefined;
  /**
   * Pixel size to request from the logo CDN. Logos render larger than this
   * via CSS but we ask the CDN for a high-res copy so it stays crisp on
   * retina screens. Defaults to 400.
   */
  logoSize?: number;
  /**
   * Tailwind className applied to the root container. The container is
   * positioned absolutely-friendly (h-full w-full + relative) so the
   * caller controls the outer aspect ratio.
   */
  className?: string;
}

type Stage = "clearbit" | "favicon" | "letter";

export default function SchoolCardArt({
  unitId, schoolUrl, name, logoSize = 400, className = "",
}: Props) {
  const seed = String(unitId ?? name ?? "default");
  const grad = useMemo(() => gradientFor(seed), [seed]);
  const clearbit = useMemo(() => logoUrl(schoolUrl, logoSize),  [schoolUrl, logoSize]);
  const favicon  = useMemo(() => faviconUrl(schoolUrl, 256),    [schoolUrl]);

  // We progressively degrade: clearbit → favicon → letter.
  const [stage, setStage] = useState<Stage>(() =>
    clearbit ? "clearbit" : favicon ? "favicon" : "letter",
  );

  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={`relative bg-gradient-to-br ${grad.from} ${grad.to} ${className}`}>
      {/* Soft light burst behind the logo to lift it off the gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.18),transparent_60%)]" />

      {stage === "letter" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white/85 font-black tracking-tight" style={{ fontSize: "clamp(64px, 22vw, 140px)", lineHeight: 1 }}>
            {initial}
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <img
            src={stage === "clearbit" ? clearbit! : favicon!}
            alt={name ?? "School logo"}
            loading="lazy"
            // Sit the logo on a soft white tile so dark monogram logos don't
            // disappear into a dark gradient. Aspect-square keeps wide and
            // tall logos from getting weirdly stretched.
            className="max-w-[55%] max-h-[55%] object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
            onError={() => {
              // Clearbit returned nothing → try favicon. Favicon failed too →
              // give up and show the initial.
              setStage((s) => s === "clearbit" && favicon ? "favicon" : "letter");
            }}
          />
        </div>
      )}
    </div>
  );
}
