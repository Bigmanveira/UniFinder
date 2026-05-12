// One-shot script: render public/og-image.png from an inline SVG.
// Run with `node scripts/buildOgImage.cjs` whenever the brand badge or
// wordmark needs to change. Output is 1200×630 (the Open Graph spec
// default; LinkedIn, X, Facebook, Slack, Discord all render this size).
//
// The SVG mirrors the in-app navbar badge: radial sky-300 → blue-400 →
// blue-500 gradient circle, white logo glyph inside, then the
// "CollegeReady" wordmark + tagline beside it on a deep slate-950 canvas
// with brand cyan/indigo glow blobs for depth.

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOGO_PATH    = path.join(PROJECT_ROOT, "public", "weblogo.png");
const OUT_PATH     = path.join(PROJECT_ROOT, "public", "og-image.png");

const logoB64 = fs.readFileSync(LOGO_PATH).toString("base64");

const W = 1200;
const H = 630;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Page background — deep slate with brand-colour glow blobs. -->
    <radialGradient id="glowL" cx="15%" cy="25%" r="60%">
      <stop offset="0%"  stop-color="#1d4ed8" stop-opacity="0.55"/>
      <stop offset="60%" stop-color="#0c1733" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowR" cx="85%" cy="75%" r="55%">
      <stop offset="0%"  stop-color="#06b6d4" stop-opacity="0.40"/>
      <stop offset="60%" stop-color="#0c1733" stop-opacity="0"/>
    </radialGradient>
    <!-- Badge gradient — same palette as the in-app circle. -->
    <radialGradient id="badge" cx="30%" cy="30%" r="80%">
      <stop offset="0%"   stop-color="#7dd3fc"/>
      <stop offset="50%"  stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </radialGradient>
    <!-- Force every visible pixel of the inlined PNG to pure white while
         preserving its alpha — equivalent to CSS filter: brightness(0)
         invert(1). -->
    <filter id="whitify" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/>
    </filter>
  </defs>

  <!-- Base canvas -->
  <rect width="${W}" height="${H}" fill="#020617"/>
  <rect width="${W}" height="${H}" fill="url(#glowL)"/>
  <rect width="${W}" height="${H}" fill="url(#glowR)"/>

  <!-- Badge: 280px circle centred-left -->
  <g transform="translate(120, 175)">
    <circle cx="140" cy="140" r="140" fill="url(#badge)"/>
    <circle cx="140" cy="140" r="140" fill="none" stroke="white" stroke-opacity="0.18" stroke-width="3"/>
    <!-- Inlined logo. The PNG is mostly transparent with the glyph in the
         upper-middle, so we oversize it (320×320) and shift it down so
         the glyph lands at the badge centre. The whitify filter forces
         the strokes to pure white. -->
    <image
      href="data:image/png;base64,${logoB64}"
      x="-30" y="-10" width="340" height="340"
      preserveAspectRatio="xMidYMid meet"
      filter="url(#whitify)"
    />
  </g>

  <!-- Wordmark + tagline -->
  <g transform="translate(470, 280)" font-family="Inter, system-ui, sans-serif" fill="white">
    <text font-size="80" font-weight="900" letter-spacing="-2">
      <tspan>College</tspan><tspan font-weight="500">Ready</tspan>
    </text>
    <text y="60" font-size="32" font-weight="500" fill="#94a3b8" letter-spacing="-0.5">
      Match your college. Ace the visa.
    </text>
    <text y="115" font-size="22" font-weight="600" fill="#67e8f9" letter-spacing="-0.2">
      AI college matching + live F-1 visa interview practice
    </text>
  </g>
</svg>`;

(async () => {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT_PATH);
  const bytes = fs.statSync(OUT_PATH).size;
  console.log(`Wrote ${OUT_PATH} (${(bytes / 1024).toFixed(1)} KB)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
