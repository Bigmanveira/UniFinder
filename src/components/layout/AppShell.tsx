import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bookmark, Compass, FileText, FolderOpen, GraduationCap, Home,
  LogOut, Map, Mic, UserRound, Wallet, X,
} from "lucide-react";
import BrandLogo from "../BrandLogo";
import { AppDataProvider, useAppData } from "../../hooks/useAppData";
import { cn } from "../../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// AppShell — top bar with the logo + a hamburger that opens a navigation
// drawer (per user direction). The drawer lists EVERY destination grouped by
// purpose, so nothing in the product is more than two taps away:
//   Explore → Home / Discover / Matches / Visa prep
//   Tools   → Roadmap / Saved schools / Practice history / CV Studio
//   Account → Wallet / Profile
// plus a primary "Find school matches" CTA and Sign out.
// ─────────────────────────────────────────────────────────────────────────────

const EXPLORE = [
  { to: "/app", end: true, icon: Home, label: "Home" },
  { to: "/app/discover", icon: Compass, label: "Discover schools" },
  { to: "/app/matches", icon: FolderOpen, label: "My matches" },
  { to: "/app/visa", icon: UserRound, label: "Visa prep" },
] as const;

const TOOLS = [
  { to: "/app/roadmap", icon: Map, label: "My roadmap" },
  { to: "/app/saved", icon: Bookmark, label: "Saved schools" },
  { to: "/app/interviews", icon: Mic, label: "Practice history" },
  { to: "/app/cv-studio", icon: FileText, label: "CV Studio" },
] as const;

const ACCOUNT = [
  { to: "/app/billing", icon: Wallet, label: "Wallet" },
  { to: "/app/profile", icon: UserRound, label: "Profile" },
] as const;

function DrawerLink({
  to, end, icon: Icon, label, onNavigate,
}: {
  to: string; end?: boolean; icon: typeof Home; label: string; onNavigate: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-bold transition-colors",
          isActive ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={17} className={isActive ? "text-primary-400" : "text-slate-400"} />
          {label}
        </>
      )}
    </NavLink>
  );
}

function DrawerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 px-4 text-[11px] font-semibold uppercase tracking-eyebrow text-slate-400">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function TopBar() {
  const { username, avatarURL, handleSignOut } = useAppData();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const initial = (username?.[0] ?? "U").toUpperCase();

  // Close the drawer on any route change and on Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Opaque on mobile: backdrop-filter re-blurs the page on every scroll
          frame, which was a measurable jank source on phones. Desktop GPUs
          keep the glass look. */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-surface md:bg-surface/85 md:backdrop-blur-xl">
        {/* Symmetric bar: hamburger — centred wordmark — profile */}
        <div className="mx-auto grid h-16 max-w-5xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
          <div className="justify-self-start">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={open}
              className="group flex h-11 w-11 flex-col items-start justify-center gap-[5px] rounded-full border border-slate-100 bg-white px-3 shadow-sm transition-transform active:scale-95"
            >
              {/* Modern staggered two-line menu glyph — the short line
                  stretches to meet the long one on hover */}
              <span aria-hidden className="h-[2px] w-5 rounded-full bg-slate-900" />
              <span aria-hidden className="h-[2px] w-3 rounded-full bg-slate-900 transition-all duration-200 group-hover:w-5" />
            </button>
          </div>

          <div className="justify-self-center">
            <BrandLogo size="sm" />
          </div>

          <div className="justify-self-end">
            <button
              type="button"
              onClick={() => navigate("/app/profile")}
              aria-label="Your profile"
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-ink text-sm font-bold text-white ring-2 ring-white transition-transform active:scale-95"
            >
              {avatarURL ? <img src={avatarURL} alt={username} className="h-full w-full object-cover" /> : initial}
            </button>
          </div>
        </div>
      </header>

      {/* Navigation drawer — pure CSS transitions. This used to be the only
          framer-motion consumer inside the app shell, which pulled the whole
          ~120 KB motion chunk onto every /app route before first paint. A
          transform + opacity transition composites on the GPU and costs
          nothing when closed. `inert` keeps the closed drawer out of the tab
          order and accessibility tree. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          "fixed inset-0 z-50 bg-ink/40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        inert={!open}
        className={cn(
          "fixed bottom-0 left-0 top-0 z-50 flex w-[84%] max-w-xs flex-col bg-white shadow-2xl",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <BrandLogo size="sm" />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  <X size={16} />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-3 py-4">
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate("/intake"); }}
                  className="mb-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary-500 py-3 text-sm font-bold text-white shadow-glow transition-colors hover:bg-primary-600"
                >
                  <GraduationCap size={16} /> Find school matches
                </button>

                <DrawerSection label="Explore">
                  {EXPLORE.map((item) => (
                    <DrawerLink key={item.to} {...item} onNavigate={() => setOpen(false)} />
                  ))}
                </DrawerSection>
                <DrawerSection label="Tools">
                  {TOOLS.map((item) => (
                    <DrawerLink key={item.to} {...item} onNavigate={() => setOpen(false)} />
                  ))}
                </DrawerSection>
                <DrawerSection label="Account">
                  {ACCOUNT.map((item) => (
                    <DrawerLink key={item.to} {...item} onNavigate={() => setOpen(false)} />
                  ))}
                </DrawerSection>
              </nav>

              <div className="border-t border-slate-100 px-3 py-3">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold text-rose-500 transition-colors hover:bg-rose-50"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
      </aside>
    </>
  );
}

/** Standard content column for shell screens. */
export function TabScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto w-full max-w-xl px-6 pt-7 pb-16 sm:max-w-2xl", className)}>
      {children}
    </main>
  );
}

export default function AppShell() {
  return (
    <AppDataProvider>
      <div className="min-h-screen bg-surface font-sans text-slate-900 selection:bg-primary-500 selection:text-white">
        <TopBar />
        <Outlet />
      </div>
    </AppDataProvider>
  );
}
