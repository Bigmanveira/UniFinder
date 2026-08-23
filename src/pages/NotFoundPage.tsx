import { Compass } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { Button } from "../components/ui/Button";
import { Eyebrow } from "../components/ui/Eyebrow";

// ─────────────────────────────────────────────────────────────────────────────
// 404 — dark hero card treatment. Registered as the catch-all route; unknown
// URLs previously rendered a blank page.
// ─────────────────────────────────────────────────────────────────────────────
export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-5">
      <div className="relative w-full max-w-lg bg-ink text-white rounded-card-lg overflow-hidden shadow-2xl p-8 sm:p-12 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-12 -top-16 w-56 h-56 rounded-full border-[22px] border-primary-500/15" />
          <div className="absolute -left-16 -bottom-20 w-56 h-56 rounded-full bg-primary-500/15 blur-3xl" />
        </div>
        <div className="relative flex flex-col items-center">
          <BrandLogo size="md" tone="light" iconOnly asLink={false} className="mb-6" />
          <Eyebrow tone="light" className="mb-2">Error 404</Eyebrow>
          <h1 className="text-3xl font-black tracking-tight mb-3">This page took a gap year.</h1>
          <p className="text-sm text-white/60 font-medium leading-relaxed mb-8 max-w-sm">
            The page you're looking for doesn't exist or has moved. Let's get you back on track.
          </p>
          <Button variant="primary" size="lg" icon={<Compass size={16} />} to="/">
            Back home
          </Button>
        </div>
      </div>
    </div>
  );
}
