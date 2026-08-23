import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Mic, FileText, Wallet } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useAppData } from "../../hooks/useAppData";
import { TabScreen } from "../../components/layout/AppShell";
import { ScreenHeader, HeaderIconButton } from "../../components/layout/ScreenHeader";
import AppFooter from "../../components/layout/AppFooter";
import { ReferralCard } from "../../components/dashboard/ReferralCard";
import { formatTokens } from "../../lib/tokens";

// ─────────────────────────────────────────────────────────────────────────────
// BillingPage — fintech-wallet presentation: a navy hero card with the balance
// big and a usage legend inside (100 = report · 1,500 = interview), then a
// two-column grid of pack tiles where the token amount is the hero number and
// the recommended pack flips to a navy tile with a "Most popular" pill.
// Paystack logic is untouched: paid/cancelled banners, bfcache pageshow
// reset, createPaystackCheckout redirect. The legacy /app?tab=billing link
// still lands here via HomeScreen's redirect.
// ─────────────────────────────────────────────────────────────────────────────

type CreditPack = {
  id:          string;
  label:       string;
  // Primary display — what an international audience expects to see.
  priceUsd:    number;
  // Actual charge currency (GHS for our Paystack-Ghana merchant). Shown as
  // a "Charged as ₵X GHS" sub-label so the user knows exactly what hits
  // their card before clicking Buy.
  priceLocal:  number;
  currency:    string;
  credits:     number;
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

export default function BillingPage() {
  const { user } = useAuth();
  const { credits, isFounder } = useAppData();
  const userId = user?.uid;

  const [packs, setPacks]   = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError]   = useState("");
  const [returnStatus, setReturnStatus] = useState<"paid" | "cancelled" | null>(null);

  // Read query param Paystack bounces back with. We strip it from
  // the URL so refreshing the page doesn't keep showing the banner.
  useEffect(() => {
    const url = new URL(window.location.href);
    const paid      = url.searchParams.get("paid");
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

  // bfcache reset — clicking "Buy now" redirects to Paystack. If the
  // user cancels on Paystack and hits the browser back button, modern
  // browsers restore the page from the back-forward cache with all JS
  // state intact, which leaves the button stuck on "Opening checkout…"
  // forever because the `buying` state was set right before redirect
  // and never cleared. `pageshow` with persisted=true is the canonical
  // signal for a bfcache restore — clear the in-flight state and any
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const fn  = httpsCallable(functions, "listCreditPacks");
        const res = await fn({});
        if (mounted) setPacks(res.data as CreditPack[]);
      } catch (err) {
        console.error("Could not load credit packs:", err);
        if (mounted) setError("Could not load pricing. Refresh and try again.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleBuy = async (packId: string) => {
    if (!userId) return;
    setBuying(packId);
    setError("");
    try {
      const base = window.location.origin;
      const returnUrl = `${base}/app/billing?paid=1`;
      const cancelUrl = `${base}/app/billing?cancelled=1`;
      const fn  = httpsCallable(functions, "createPaystackCheckout");
      const res = await fn({ packId, returnUrl, cancelUrl });
      const data = res.data as { checkoutUrl?: string };
      if (!data?.checkoutUrl) throw new Error("No checkout URL returned");
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      console.error("Checkout failed:", err);
      setError(err?.message ?? "Could not start checkout. Please try again.");
      setBuying(null);
    }
  };

  return (
    <TabScreen>
      <ScreenHeader
        eyebrow="Tokens & billing"
        title="Wallet"
        subtitle="Secure checkout by Paystack — tokens never expire."
        action={<HeaderIconButton icon={<Wallet size={20} />} label="Wallet" />}
      />

      {/* Return-from-Paystack banners */}
      {returnStatus === "paid" && (
        <div className="mb-5 flex items-start gap-3 rounded-card border border-primary-200 bg-primary-50 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <Check size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-sm font-bold text-primary-900">Payment received</p>
            <p className="text-xs leading-relaxed text-primary-800">
              Tokens usually post within a few seconds. If your balance hasn't updated in two minutes, contact{" "}
              <a className="underline" href="mailto:support@collegeready.io">support@collegeready.io</a> with your payment confirmation.
            </p>
          </div>
        </div>
      )}
      {returnStatus === "cancelled" && (
        <div className="mb-5 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Payment was cancelled — no tokens charged. You can pick a pack again any time.
        </div>
      )}

      {/* Wallet hero — navy, balance big, usage legend inside */}
      <section className="relative mb-7 overflow-hidden rounded-card-lg bg-ink p-6 text-white shadow-[0_12px_32px_-8px_rgba(26,33,56,0.18)]">
        <div aria-hidden className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[18px] border-primary-500/20" />
        <div aria-hidden className="absolute -bottom-16 -left-12 h-36 w-36 rounded-full border-[14px] border-white/5" />
        <div className="relative">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-eyebrow text-white/50">Available balance</p>
          <div className="flex flex-wrap items-end gap-2">
            <span className="text-6xl font-black leading-none tracking-tight">{isFounder ? "∞" : formatTokens(credits)}</span>
            <span className="mb-1.5 text-base font-bold text-white/40">tokens</span>
          </div>
          {isFounder && (
            <p className="mt-2 text-xs font-bold text-primary-300">Founder account — unlimited tokens for product testing.</p>
          )}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/80">
              <FileText size={13} className="shrink-0 text-primary-300" /> 100 = match report
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/80">
              <Mic size={13} className="shrink-0 text-primary-300" /> 1,500 = interview practice
            </span>
          </div>
        </div>
      </section>

      {/* Pack list — one column, recommended highlighted inline */}
      <section className="mb-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">Top up</h2>
          <span className="text-xs font-bold text-slate-500">USD · charged in GHS</span>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-card border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-52 animate-pulse rounded-card border border-slate-100 bg-white shadow-card" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {packs.map((pack) => {
              const isBuying = buying === pack.id;
              const localGlyph = currencyGlyph(pack.currency);
              const perCreditUsd = (pack.priceUsd / pack.credits).toFixed(2);
              return (
                <div
                  key={pack.id}
                  className={`relative overflow-hidden rounded-card border p-5 ${
                    pack.recommended
                      ? "border-ink bg-ink text-white shadow-card-hover"
                      : "border-slate-100 bg-white shadow-card transition-shadow hover:shadow-card-hover"
                  }`}
                >
                  {pack.recommended && (
                    <div aria-hidden className="absolute -right-7 -top-9 h-28 w-28 rounded-full border-[14px] border-primary-500/20" />
                  )}
                  <div className="relative flex h-full flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[11px] font-semibold uppercase tracking-eyebrow ${pack.recommended ? "text-white/50" : "text-slate-500"}`}>
                        {pack.label}
                      </p>
                      {pack.recommended && (
                        <span className="shrink-0 rounded-full bg-primary-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-eyebrow text-white shadow-glow">
                          Most popular
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-4xl font-black leading-none tracking-tight">{formatTokens(pack.credits)}</p>
                    <p className={`mt-1 text-[11px] font-medium ${pack.recommended ? "text-white/50" : "text-slate-400"}`}>
                      tokens · never expire
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-sm font-black ${pack.recommended ? "bg-white/10 text-white" : "bg-slate-100 text-slate-900"}`}>
                        ${pack.priceUsd}
                      </span>
                      <span className={`text-[11px] font-bold ${pack.recommended ? "text-white/60" : "text-slate-500"}`}>
                        ${perCreditUsd} per 100
                      </span>
                    </div>
                    <p className={`mt-1.5 text-[11px] font-medium ${pack.recommended ? "text-white/40" : "text-slate-400"}`}>
                      Charged as {localGlyph}{pack.priceLocal} {pack.currency}
                    </p>
                    <button
                      onClick={() => handleBuy(pack.id)}
                      disabled={!!buying}
                      className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        pack.recommended
                          ? "bg-primary-500 text-white shadow-glow hover:bg-primary-600"
                          : "bg-ink text-white hover:bg-slate-800"
                      }`}
                    >
                      {isBuying ? <Loader2 size={13} className="animate-spin" /> : null}
                      {isBuying ? "Opening…" : "Buy now"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Referral */}
      <ReferralCard userId={userId} />

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        Prices shown in USD. Payments are processed in Ghanaian Cedi (₵) by Paystack at the equivalent rate above — your
        bank may convert to your local currency. We don't see or store your card details. Refunds and disputes: contact{" "}
        <a className="underline" href="mailto:support@collegeready.io">support@collegeready.io</a>.
      </p>

      <AppFooter />
    </TabScreen>
  );
}
