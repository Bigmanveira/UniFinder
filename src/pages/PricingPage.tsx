import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import {
  Loader2, Check, AlertTriangle, ShieldCheck, Lock,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { Button } from "../components/ui/Button";
import { IconChip } from "../components/ui/IconChip";
import { formatTokens } from "../lib/tokens";

type CreditPack = {
  id: string;
  label: string;
  // Display: shown as the primary $X.XX in the card so an international
  // audience sees a familiar currency.
  priceUsd: number;
  // Actual: what Paystack charges. Shown as "Charged in ₵X GHS" underneath
  // the USD price so the user knows exactly what hits their card.
  priceLocal: number;
  currency: string;
  credits: number;
  recommended: boolean;
};

const currencyGlyph = (code: string): string => {
  switch ((code ?? "").toUpperCase()) {
    case "GHS": return "₵";
    case "NGN": return "₦";
    case "ZAR": return "R";
    case "KES": return "KSh ";
    case "USD": return "$";
    default:    return "";
  }
};

// Per-pack feature lines. Kept in code (not on the server) so we can shape
// the copy for the marketing surface without redeploying the catalogue
// function. Order matches the CREDIT_PACKS order on the backend.
const PACK_FEATURES: Record<string, string[]> = {
  try:     ["6 match-report unlocks", "Personalised application roadmap", "Tokens never expire"],
  starter: ["15 match-report unlocks", "1 visa interview practice", "Personalised application roadmap"],
  plus:    ["45 match-report unlocks", "3 visa interview practice sessions", "Priority email support"],
  pro:     ["120 match-report unlocks", "8 visa interview practice sessions", "Priority email support"],
  power:   ["300 match-report unlocks", "20 visa interview practice sessions", "Priority email support"],
};

export default function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [returnStatus, setReturnStatus] = useState<"paid" | "cancelled" | null>(null);

  // Detect return from Paystack
  useEffect(() => {
    const url = new URL(window.location.href);
    const paid = url.searchParams.get("paid");
    const cancelled = url.searchParams.get("cancelled");
    if (paid === "1") {
      setReturnStatus("paid");
      url.searchParams.delete("paid");
      window.history.replaceState({}, "", url.toString());
    } else if (cancelled === "1") {
      setReturnStatus("cancelled");
      url.searchParams.delete("cancelled");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // bfcache reset — when the user clicks "Buy now" we redirect to Paystack.
  // If they cancel on Paystack and hit the browser back button, modern
  // browsers restore the page from the back-forward cache with all JS
  // state intact. That leaves the button stuck on "Opening checkout…"
  // forever. `pageshow` with persisted=true is the canonical signal for a
  // bfcache restore — clear the in-flight state so the user can retry.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setBuying(null);
        setError("");
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Load server-owned catalogue
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const fn = httpsCallable(functions, "listCreditPacks");
        const res = await fn({});
        if (mounted) setPacks(res.data as CreditPack[]);
      } catch (err) {
        console.error("[pricing] Could not load credit packs:", err);
        if (mounted) setError("Could not load pricing. Refresh and try again.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleBuy = async (packId: string) => {
    setError("");

    // Require auth to buy; preserve intent and drop user on Billing after auth.
    if (!user) {
      navigate(`/signup?next=${encodeURIComponent("/app/billing")}`);
      return;
    }

    setBuying(packId);
    try {
      const base = window.location.origin;
      // Paystack's callback_url is single; success and cancel routes both
      // land here. The checkout flow handles cancel-flow inside Paystack's
      // hosted UI (back to merchant button), so we only need the success
      // URL with ?paid=1.
      const returnUrl = `${base}/pricing?paid=1`;
      const fn = httpsCallable(functions, "createPaystackCheckout");
      const res = await fn({ packId, returnUrl });
      const data = res.data as { checkoutUrl?: string };
      if (!data?.checkoutUrl) throw new Error("No checkout URL returned");
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      console.error("[pricing] Checkout failed:", err);
      setError(err?.message ?? "Could not start checkout. Please try again.");
      setBuying(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface font-sans selection:bg-primary-500 selection:text-white">
      {/* Header — clean surface bar, sticky so the Buy CTA stays in reach. */}
      <header className="sticky top-0 z-40 bg-surface/95 md:bg-surface/90 md:backdrop-blur border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <BrandLogo size="md" />
          <nav className="hidden md:flex items-center gap-8">
            <Link to="/" className="text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors">Home</Link>
            <Link to="/faq" className="text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors">FAQ</Link>
          </nav>
          <div className="flex items-center gap-3 md:gap-4">
            {user ? (
              <Button to="/app" variant="dark">Dashboard</Button>
            ) : (
              <>
                <Link to="/login" className="hidden sm:inline text-sm font-bold text-slate-700 hover:text-slate-900 transition-colors">Log in</Link>
                <Button to="/intake" variant="dark">Start Free</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-10 md:pb-12 text-center">
        <p className="inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-eyebrow text-slate-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-primary-500" />
          Pricing
        </p>
        <h1 className="text-4xl md:text-5xl font-black text-slate-900 leading-[1.05] tracking-tight mb-5">
          Pay per match. No subscriptions.
        </h1>
        <p className="text-base md:text-lg text-slate-500 font-medium max-w-2xl mx-auto leading-relaxed">
          Tokens unlock match reports and F-1 visa interview practice. Buy what you need, when you need it.
          Tokens never expire.
        </p>
      </section>

      {/* Banners */}
      <div className="max-w-6xl mx-auto px-6">
        {returnStatus === "paid" && (
          <div className="mb-6 bg-primary-50 border border-primary-200 rounded-card p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 flex-shrink-0">
              <Check size={16} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-primary-900 text-sm mb-0.5">Payment received</p>
              <p className="text-xs text-primary-800 leading-relaxed">
                Tokens usually post within a few seconds. If your balance hasn't updated in two minutes, contact{" "}
                <a className="underline" href="mailto:support@collegeready.io">support@collegeready.io</a> with your confirmation.
              </p>
            </div>
          </div>
        )}
        {returnStatus === "cancelled" && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-card p-4 text-sm text-amber-900">
            Payment was cancelled — no tokens charged.
          </div>
        )}
        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-card p-3 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Pricing grid — same pack-card recipe as the in-app Billing page so
          public pricing and in-app billing read as one system. */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="bg-white rounded-card p-6 border border-slate-200/70 shadow-card h-80 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {packs.map((pack) => {
              const isBuying = buying === pack.id;
              const localGlyph = currencyGlyph(pack.currency);
              const perCreditUsd = (pack.priceUsd / pack.credits).toFixed(2);
              const features = PACK_FEATURES[pack.id] ?? [];

              return (
                <div
                  key={pack.id}
                  className={`relative rounded-card p-6 flex flex-col transition-all ${
                    pack.recommended
                      ? "bg-primary-50 border-2 border-primary-500 shadow-card-hover sm:-translate-y-1"
                      : "bg-white border border-slate-200/70 shadow-card hover:border-primary-300 hover:shadow-card-hover"
                  }`}
                >
                  {pack.recommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-[10px] font-black tracking-eyebrow uppercase px-3 py-1 rounded-full whitespace-nowrap">
                      Most Popular
                    </div>
                  )}

                  <h3 className={`text-sm font-black uppercase tracking-eyebrow mb-3 ${
                    pack.recommended ? "text-primary-700" : "text-slate-500"
                  }`}>
                    {pack.label}
                  </h3>

                  {/* Price block — USD bold, GHS subline. tabular-nums so the
                      column of $ signs lines up visually across all cards. */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-5xl font-black tabular-nums tracking-tight ${
                        pack.recommended ? "text-primary-900" : "text-slate-900"
                      }`}>${pack.priceUsd}</span>
                      <span className={`text-xs font-bold ${
                        pack.recommended ? "text-primary-700/70" : "text-slate-400"
                      }`}>USD</span>
                    </div>
                    <p className={`text-xs font-bold mt-2 ${
                      pack.recommended ? "text-primary-800" : "text-slate-700"
                    }`}>
                      {formatTokens(pack.credits)} tokens · ${perCreditUsd} per 100 tokens
                    </p>
                    <p className={`text-[11px] font-medium mt-1 ${
                      pack.recommended ? "text-primary-700/80" : "text-slate-400"
                    }`}>
                      Charged in {localGlyph}{pack.priceLocal} {pack.currency}
                    </p>
                  </div>

                  {/* Feature list — three concrete unlocks per pack. Kept
                      tight; the cards have a hard width budget at lg-grid-cols-5. */}
                  <ul className="space-y-2 mb-6 flex-1">
                    {features.map((feat) => (
                      <li key={feat} className={`flex items-start gap-2 text-xs leading-snug ${
                        pack.recommended ? "text-primary-900/80" : "text-slate-600"
                      }`}>
                        <Check size={14} className="flex-shrink-0 mt-0.5 text-primary-500" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleBuy(pack.id)}
                    disabled={!!buying}
                    className={`w-full inline-flex items-center justify-center gap-2 font-bold py-3.5 rounded-full text-sm transition-colors active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${
                      pack.recommended
                        ? "bg-primary-500 text-white hover:bg-primary-600 shadow-glow"
                        : "bg-slate-100 text-slate-900 hover:bg-slate-200"
                    }`}
                  >
                    {isBuying && <Loader2 size={14} className="animate-spin" />}
                    {isBuying ? "Opening checkout…" : "Buy now"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* How credits are spent — a single-screen explainer the user can
          glance at before buying. Calls out the three concrete spends so
          the per-category 5-credit reveal isn't a surprise once they're
          inside the report. */}
      <section className="max-w-6xl mx-auto px-6 pb-12">
        <div className="rounded-card border border-slate-200/70 bg-white shadow-card p-6 sm:p-8">
          <p className="inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-eyebrow text-slate-400 mb-4">
            <span className="w-2 h-2 rounded-full bg-primary-500" />
            How tokens are spent
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CreditSpend
              cost="100 tokens"
              title="Unlock a match report"
              body="Generates your full AI shortlist + roadmap. Reach schools are visible right away."
            />
            <CreditSpend
              cost="500 tokens"
              title="Reveal a category"
              body="Unlocks Target or Safety schools inside an existing report. Optional — only if you want the wider list."
            />
            <CreditSpend
              cost="1,500 tokens"
              title="F-1 visa interview"
              body="One live AI mock interview with feedback. Practice until you're confident."
            />
          </div>
        </div>
      </section>

      {/* Trust strip — restrained, status-page-style row that explains the
          payment posture and currency conversion in plain language. */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200/70 rounded-card overflow-hidden border border-slate-200/70 shadow-card">
          <TrustCell
            icon={<ShieldCheck size={18} />}
            heading="Secure checkout"
            body="Processed by Paystack. We never see or store your card details."
          />
          <TrustCell
            icon={<Lock size={18} />}
            heading="Transparent pricing"
            body="USD prices shown above. Charged in GHS at the equivalent rate; your bank converts to your local currency."
          />
          <TrustCell
            icon={<Check size={18} />}
            heading="No subscriptions"
            body="One-time payment per pack. Tokens never expire and there's nothing to cancel."
          />
        </div>
        <p className="text-xs text-slate-400 mt-6 text-center leading-relaxed">
          Refunds and disputes:{" "}
          <a className="underline hover:text-primary-600 transition-colors" href="mailto:support@collegeready.io">
            support@collegeready.io
          </a>
        </p>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-slate-200/70">
        <div className="max-w-6xl mx-auto px-6 flex flex-col gap-8">
          <div className="flex flex-col items-center md:flex-row md:justify-between gap-6">
            <BrandLogo size="sm" />
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-bold text-slate-400">
              <Link to="/pricing" className="hover:text-primary-600 transition-colors">Pricing</Link>
              <Link to="/faq" className="hover:text-primary-600 transition-colors">FAQ</Link>
              <Link to="/privacy" className="hover:text-primary-600 transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-primary-600 transition-colors">Terms</Link>
              <Link to="/contact" className="hover:text-primary-600 transition-colors">Contact</Link>
            </nav>
          </div>
          <p className="text-xs font-medium text-slate-400 text-center md:text-left border-t border-slate-200/70 pt-6">
            © 2026 College Ready. Practice tools only. Not affiliated with any government, embassy, or consular service.
          </p>
        </div>
      </footer>
    </div>
  );
}

function CreditSpend({ cost, title, body }: { cost: string; title: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-5">
      <span className="inline-block text-[10px] font-black tracking-eyebrow uppercase text-primary-600 bg-primary-50 border border-primary-100 rounded-full px-2.5 py-1 mb-3">
        {cost}
      </span>
      <p className="text-sm font-black text-slate-900 mb-1.5">{title}</p>
      <p className="text-xs text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}

function TrustCell({ icon, heading, body }: { icon: React.ReactNode; heading: string; body: string }) {
  return (
    <div className="bg-white p-6 flex items-start gap-4">
      <IconChip icon={icon} tint="primary" size="md" />
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-900 mb-1">{heading}</p>
        <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
