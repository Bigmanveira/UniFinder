import colors from 'tailwindcss/colors';

// ─────────────────────────────────────────────────────────────────────────────
// Sleek design system tokens (2026-08 total redesign).
//   primary  → coral   #FF6A55  (CTAs, accents, active states)
//   ink/navy → #1A2138 (dark surfaces, headings, the floating tab nav)
//   surface  → warm cream #FAF9F6 (page background)
//   neutral  → the `slate` scale below is remapped to a warm-paper ramp with
//              navy-tinted darks so every existing slate-* class in the app
//              renders in the new warm palette automatically.
// ─────────────────────────────────────────────────────────────────────────────

// Accent palette derived from the brand logo badge (sky #7dd3fc → blue
// #3b82f6 → royal #1d4ed8) so every accent blends with the mark. The Sleek
// mockups' coral slot is filled by the logo blue; structure/radii/shadows
// keep the Sleek system.
const logoBlue = {
  50: '#eff6ff',
  100: '#dbeafe',  // tinted icon-chip fill (the mockups' --accent slot)
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',  // primary — the logo's core blue
  600: '#2563eb',  // hover step — the logo's royal stop
  700: '#1d4ed8',
  800: '#1e40af',
  900: '#1e3a8a',
  950: '#172554',
};

// Cool paper neutrals with navy darks — harmonises with the blue mark the
// way the mockups' warm paper harmonised with coral.
const coolSlate = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#27304a',
  900: '#1A2138',  // navy foreground/secondary from the design system
  950: '#111629',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    colors: {
      inherit: 'inherit',
      current: 'currentColor',
      transparent: 'transparent',
      black: '#000',
      white: '#fff',
      slate: coolSlate,
      gray: colors.gray,
      zinc: colors.zinc,
      neutral: colors.neutral,
      stone: colors.stone,
      red: colors.red,
      orange: colors.orange,
      amber: colors.amber,
      yellow: colors.yellow,
      blue: colors.blue,
      sky: colors.sky,
      cyan: colors.cyan,
      indigo: colors.indigo,
      violet: colors.violet,
      purple: colors.purple,
      fuchsia: colors.fuchsia,
      pink: colors.pink,
      rose: colors.rose,
      primary: logoBlue,
      // Brand lock-in: success-ish hue classes render the brand accent so no
      // stray palette sneaks in. (Real success/warn states use amber/rose,
      // which stay stock.)
      emerald: logoBlue,
      green: logoBlue,
      lime: logoBlue,
      teal: logoBlue,
      accent: {
        500: '#38bdf8',  // the logo's sky highlight
      },
    },
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        landing: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        utility: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: '#1A2138',      // navy --secondary / --foreground (blends with the mark)
        surface: '#f6f9fd',  // cool paper background — sits naturally behind the blue badge
      },
      borderRadius: {
        card: '1.75rem',     // 28px — cards
        'card-lg': '2rem',   // 32px — hero cards
      },
      boxShadow: {
        card: '0 12px 32px -8px rgba(26,33,56,0.08)',
        'card-hover': '0 20px 48px -12px rgba(26,33,56,0.14)',
        glow: '0 8px 20px -6px rgba(59,130,246,0.45)',
        pillnav: '0 20px 40px -10px rgba(26,33,56,0.4)',
      },
      letterSpacing: {
        eyebrow: '0.08em',
      },
      // Plus Jakarta Sans has no 900 weight — clamp font-black to the real
      // 800 so browsers don't synthesize a faux-bold.
      fontWeight: {
        black: '800',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
