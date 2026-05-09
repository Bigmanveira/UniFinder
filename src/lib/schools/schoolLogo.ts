// Resolves a square logo for a school from its website URL.
// Strategy: try the Clearbit Logo API first (best quality, transparent PNG).
// Fall back to Google's favicon service (universally available, lower quality).
// If schoolUrl is missing, return null and let the card show its photo only.

function cleanDomain(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    let s = rawUrl.trim().toLowerCase();
    if (!s) return null;
    // Strip protocol + www and anything after the host
    s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
    s = s.split("/")[0].split("?")[0].split("#")[0];
    // Domain must contain a dot
    return s.includes(".") ? s : null;
  } catch {
    return null;
  }
}

/**
 * Primary logo source — Clearbit returns a transparent square PNG for most
 * institutional domains. Returns null when the school has no usable URL.
 */
export function logoUrl(schoolUrl: string | null | undefined, size = 200): string | null {
  const domain = cleanDomain(schoolUrl);
  if (!domain) return null;
  return `https://logo.clearbit.com/${domain}?size=${size}`;
}

/**
 * Fallback logo source — Google's favicon service. Always returns *something*
 * (Google's generic globe at worst), so a null return is the only failure mode.
 */
export function faviconUrl(schoolUrl: string | null | undefined, size = 128): string | null {
  const domain = cleanDomain(schoolUrl);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}
