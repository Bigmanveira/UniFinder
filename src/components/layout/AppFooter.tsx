import { Link } from "react-router-dom";
import BrandLogo from "../BrandLogo";

// ─────────────────────────────────────────────────────────────────────────────
// AppFooter — quiet in-app footer for logged-in shell screens. Rendered as the
// last child inside <TabScreen> so its width always matches the content
// column. Hairline top border, small brand mark, legal/support links, and a
// muted copyright line.
// ─────────────────────────────────────────────────────────────────────────────

const LINKS = [
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

export default function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t border-slate-100 py-10">
      <div className="flex flex-col items-start gap-4">
        <BrandLogo size="sm" />
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900"
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="text-xs font-medium text-slate-400">
          © {year} CollegeReady · Visa practice is a simulation.
        </p>
      </div>
    </footer>
  );
}
