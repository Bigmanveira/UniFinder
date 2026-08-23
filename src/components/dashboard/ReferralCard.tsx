import { useEffect, useState } from "react";
import { Check, Copy, Gift, Mail } from "lucide-react";
import { FadeIn } from "../FadeIn";
import { getOrCreateReferralCode, buildReferralUrl } from "../../lib/referrals";

// ─────────────────────────────────────────────────────────────────────────────
// Referral card — earn 500 tokens per friend who signs up and purchases.
// Moved verbatim from DashboardPage (logic unchanged); card radius/shadow
// aligned to the design tokens.
// ─────────────────────────────────────────────────────────────────────────────
export function ReferralCard({ userId }: { userId: string | undefined }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    getOrCreateReferralCode(userId)
      .then(c => { if (mounted) setCode(c); })
      .catch(err => console.error("Referral code fetch failed:", err));
    return () => { mounted = false; };
  }, [userId]);

  const url = code ? buildReferralUrl(code) : "";
  const shareText = "I'm using College Ready to find a U.S. college match — sign up with my link and we both win.";

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
  };

  const shareLinks = url ? {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`,
    twitter:  `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`,
    email:    `mailto:?subject=${encodeURIComponent("Find your U.S. college match — College Ready")}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`,
  } : null;

  return (
    <FadeIn className="mb-8">
      <section className="relative overflow-hidden rounded-card-lg border border-slate-100 bg-white p-5 shadow-card sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full border-[18px] border-primary-500/10" />

        {/* Header row */}
        <div className="relative mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
              <Gift size={19} strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500">Refer a friend</p>
              <h3 className="text-lg font-black tracking-tight text-slate-950">Share, and you both win</h3>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-primary-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-eyebrow text-white shadow-glow">
            Earn 500
          </span>
        </div>

        <p className="relative mb-4 text-sm font-medium leading-6 text-slate-500">
          You'll receive 500 free tokens after your friend's first token purchase.
        </p>

        {/* Link + copy */}
        <div className="relative mb-5 flex items-center gap-2 rounded-full border border-slate-200 bg-surface p-1.5 pl-4">
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600">
            {url || "Generating your referral link…"}
          </p>
          <button
            onClick={handleCopy}
            disabled={!url}
            className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
              copied
                ? "bg-[#E8F5E9] text-[#2E7D32]"
                : "bg-ink text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            }`}
          >
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </button>
        </div>

        {/* Share buttons */}
        {shareLinks && (
          <div className="relative grid grid-cols-5 gap-2">
            <ShareButton href={shareLinks.whatsapp} label="WhatsApp" icon={<WhatsAppIcon />} brand="whatsapp" />
            <ShareButton href={shareLinks.facebook} label="Facebook" icon={<FacebookIcon />} brand="facebook" />
            <ShareButton href={shareLinks.twitter} label="X" icon={<XSocialIcon />} brand="x" />
            <ShareButton href={shareLinks.telegram} label="Telegram" icon={<TelegramIcon />} brand="telegram" />
            <ShareButton href={shareLinks.email} label="Email" icon={<Mail size={18} />} brand="email" />
          </div>
        )}

        <p className="relative mt-4 text-[11px] font-medium leading-5 text-slate-400">
          Your code: <span className="font-utility font-bold text-slate-600">{code || "······"}</span> · Tokens post automatically after the qualifying purchase.
        </p>
      </section>
    </FadeIn>
  );
}


function ShareButton({ href, label, icon, brand }: {
  href: string;
  label: string;
  icon: React.ReactNode;
  brand: "whatsapp" | "facebook" | "x" | "telegram" | "email";
}) {
  const brandClasses = {
    whatsapp: "text-[#128C7E] group-hover:border-[#25D366]/50 group-hover:bg-[#25D366]/10",
    facebook: "text-[#1877F2] group-hover:border-[#1877F2]/40 group-hover:bg-[#1877F2]/10",
    x: "text-slate-950 group-hover:border-slate-400 group-hover:bg-slate-100",
    telegram: "text-[#229ED9] group-hover:border-[#229ED9]/40 group-hover:bg-[#229ED9]/10",
    email: "text-slate-600 group-hover:border-slate-400 group-hover:bg-slate-100",
  }[brand];

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Share via ${label}`}
      className="group min-w-0 text-center"
    >
      <span className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition-colors sm:h-12 sm:w-12 ${brandClasses}`} aria-hidden>
        {icon}
      </span>
      <span className="mt-2 block truncate text-[10px] font-semibold text-slate-500 sm:text-[11px]">{label}</span>
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-current" aria-hidden>
      <path d="M12.04 2a9.84 9.84 0 0 0-8.47 14.84L2 22l5.28-1.5A9.96 9.96 0 1 0 12.04 2Zm0 17.98a8.05 8.05 0 0 1-4.1-1.12l-.3-.18-3.13.9.87-3.05-.2-.32a7.93 7.93 0 1 1 6.86 3.77Zm4.37-5.94c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19a7.21 7.21 0 0 1-1.34-1.66c-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.41-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.58.18 1.1.16 1.51.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-current" aria-hidden>
      <path d="M13.75 22v-8.18h2.75l.41-3.19h-3.16V8.6c0-.92.26-1.55 1.58-1.55H17V4.2a22.1 22.1 0 0 0-2.44-.13c-2.42 0-4.08 1.48-4.08 4.19v2.37H7.75v3.19h2.73V22h3.27Z" />
    </svg>
  );
}

function XSocialIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-current" aria-hidden>
      <path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.24-8.28L2.96 2H9.36l4.42 5.84L18.9 2Zm-1.1 17.84h1.72L8.42 4.05H6.58L17.8 19.84Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-current" aria-hidden>
      <path d="M21.73 2.27a1.18 1.18 0 0 0-1.2-.2L2.9 8.87c-1.2.47-1.19 1.14-.22 1.44l4.52 1.41 1.74 5.45c.21.6.1.84.73.84.49 0 .7-.22.97-.48l2.17-2.1 4.51 3.33c.83.46 1.43.22 1.64-.77l2.97-14c.3-1.2-.46-1.75-1.2-1.72ZM8.24 11.4l10.48-6.61c.52-.31 1-.14.61.2l-8.65 7.8-.34 3.63-2.1-5.02Z" />
    </svg>
  );
}
