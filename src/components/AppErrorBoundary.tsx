import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "../lib/clientErrorReporter";
import webLogo from "../assets/weblogo.png";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError(error, {
      source: "client.react_render",
      context: {
        componentStack: info.componentStack,
      },
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Dark ink hero card centered on bg-surface — sibling of
      // NotFoundPage. This boundary mounts ABOVE the router and auth
      // providers, so the fallback must not use BrandLogo (useAuth) or
      // any router <Link>; the icon-only logo badge is replicated
      // inline from the raw asset instead.
      return (
        <main className="min-h-screen bg-surface flex items-center justify-center p-5">
          <div className="relative w-full max-w-lg bg-ink text-white rounded-card-lg overflow-hidden shadow-2xl p-8 sm:p-12 text-center">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute -right-12 -top-16 w-56 h-56 rounded-full border-[22px] border-primary-500/15" />
              <div className="absolute -left-16 -bottom-20 w-56 h-56 rounded-full bg-primary-500/15 blur-3xl" />
            </div>
            <div className="relative flex flex-col items-center">
              <div
                aria-hidden
                className="mb-6 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center p-2 ring-1 ring-white/35 shadow-lg shadow-primary-600/25"
                style={{ background: "linear-gradient(145deg, #7dd3fc 0%, #3b82f6 52%, #1d4ed8 100%)" }}
              >
                <img
                  src={webLogo}
                  alt=""
                  className="w-full h-full object-contain select-none scale-[1.55] translate-y-[3px]"
                  style={{ filter: "brightness(0) invert(1)" }}
                  draggable={false}
                />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-white/50 mb-2">
                Something went wrong
              </p>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-3">We could not load this page.</h1>
              <p className="text-sm text-white/60 font-medium leading-relaxed max-w-sm mb-8">
                The error has been logged for support. Refresh the page, or contact support@collegeready.io if it keeps happening.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary-500 hover:bg-primary-600 px-7 py-3.5 text-sm font-bold text-white shadow-glow transition-all active:scale-95"
              >
                Refresh page
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
