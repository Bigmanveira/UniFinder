import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";
import { Eyebrow } from "./Eyebrow";

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader — the recurring section pattern: extrabold title on the left,
// optional small action link (or any node) on the right.
// ─────────────────────────────────────────────────────────────────────────────
interface SectionHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: { label: string; to?: string; onClick?: () => void } | ReactNode;
  className?: string;
}

function isActionConfig(
  action: SectionHeaderProps["action"],
): action is { label: string; to?: string; onClick?: () => void } {
  return typeof action === "object" && action !== null && "label" in action;
}

export function SectionHeader({ title, eyebrow, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-3 mb-3", className)}>
      <div>
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h2 className="text-lg font-black tracking-tight text-slate-900">{title}</h2>
      </div>
      {isActionConfig(action) ? (
        action.to ? (
          <Link
            to={action.to}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 shrink-0 pb-0.5"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 shrink-0 pb-0.5"
          >
            {action.label}
          </button>
        )
      ) : (
        action
      )}
    </div>
  );
}
