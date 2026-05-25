import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { Loader2, Check, AlertTriangle } from "lucide-react";

type CreditPack = {
  id: string;
  label: string;
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

  // bfcache reset — when the user clicks "Buy now" we redirect to
  // Paystack. If they cancel on Paystack and hit the browser back
  // button, modern browsers restore the page from the back-forward
  // cache with all JS state intact. That leaves the button stuck on
  // "Opening checkout…" forever because the `buying` state never
  // cleared. `pageshow` with persisted=true is the canonical signal
  // for a bfcache restore — clear the in-flight state and wipe any
  // stale error so the user can retry.
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
      navigate(`/signup?next=${encodeURIComponent("/app?tab=billing")}`);
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
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-500 selection:text-white">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-slate-900 font-black tracking-tight text-lg">College Ready</Link>
          <nav className="flex items-center gap-6 text-sm font-bold text-slate-600">
            <Link to="/faq" className="hover:text-primary-600 transition-colors">FAQ</Link>
            <Link to="/login" className="hover:text-primary-600 transition-colors">Log In</Link>
            <Link to="/intake" className="bg-slate-900 text-white px-4 py-2 rounded-full hover:bg-slate-800 transition-colors">Start Free</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 md:py-14">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Pricing</h1>
          <p className="text-slate-500 font-medium mt-2">Pay per match. No hidden subscriptions. Credits post automatically after payment.</p>
        </div>

        {/* Banners */}
        {returnStatus === "paid" && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
              <Check size={16} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-emerald-900 text-sm mb-0.5">Payment received</p>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Credits usually post within a few seconds. If your balance hasn't updated in two minutes, contact{" "}
                <a className="underline" href="mailto:support@collegeready.io">support@collegeready.io</a> with your confirmation.
              </p>
            </div>
          </div>
        )}
        {returnStatus === "cancelled" && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
            Payment was cancelled — no credits charged.
          </div>
        )}
        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-2xl p-3 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Explainer */}
        <section className="bg-white rounded-[32px] p-6 md:p-8 border border-slate-200 mb-8">
          <h2 className="text-lg font-black text-slate-900 mb-2">How credits work</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            1 credit unlocks one full match report. 15 credits power an F-1 visa interview practice session. Credits never expire.
          </p>
        </section>

        {/* Pricing grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => (
              <div key={i} className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm h-56 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packs.map((pack) => {
              const isBuying = buying === pack.id;
              const glyph = currencyGlyph(pack.currency);
              const perCredit = (pack.priceLocal / pack.credits).toFixed(2);
              return (
                <div
                  key={pack.id}
                  className={`relative rounded-[28px] p-6 md:p-7 transition-all ${
                    pack.recommended
                      ? "bg-primary-50 border-2 border-primary-500 shadow-lg sm:-translate-y-1"
                      : "bg-white border border-slate-100 hover:border-primary-300 hover:shadow-md"
                  }`}
                >
                  {pack.recommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full whitespace-nowrap">
                      Most Popular
                    </div>
                  )}
                  <h3 className={`text-lg font-black mb-1 ${pack.recommended ? "text-primary-900" : "text-slate-900"}`}>{pack.label}</h3>
                  <p className={`text-xs font-medium mb-5 ${pack.recommended ? "text-primary-700/80" : "text-slate-500"}`}>
                    {glyph}{perCredit} per credit
                  </p>
                  <div className="mb-5">
                    <span className={`text-4xl font-black ${pack.recommended ? "text-primary-900" : "text-slate-900"}`}>{glyph}{pack.priceLocal}</span>
                    <span className={`font-bold ${pack.recommended ? "text-primary-700" : "text-slate-500"}`}> / {pack.credits} credits</span>
                  </div>
                  <button
                    onClick={() => handleBuy(pack.id)}
                    disabled={!!buying}
                    className={`w-full inline-flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      pack.recommended
                        ? "bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-600/30"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    {isBuying ? <Loader2 size={14} className="animate-spin" /> : null}
                    {isBuying ? "Opening checkout…" : "Buy Now"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-slate-400 mt-6 leading-relaxed">
          Payments are processed by Paystack. We don't see or store your card details. Refunds and disputes: contact{" "}
          <a className="underline" href="mailto:support@collegeready.io">support@collegeready.io</a>.
        </p>
      </main>

      <footer className="bg-white py-10 border-t border-slate-100 mt-10">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <p>© 2026 College Ready</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-primary-600 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-primary-600 transition-colors">Terms</Link>
            <Link to="/contact" className="hover:text-primary-600 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}