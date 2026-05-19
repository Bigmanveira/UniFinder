import * as Sentry from "@sentry/react";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ─────────────────────────────────────────────────────────────────────────────
// Sentry — error tracking + performance monitoring.
// Initialised before createRoot so it captures errors thrown during the very
// first render. DSN is a public identifier (Sentry's design: paired with a
// server-side secret we never see) — safe to commit.
// ─────────────────────────────────────────────────────────────────────────────
Sentry.init({
  dsn: "https://6a370ec76f07e64c42e64208e0d1a80e@o4511392172408832.ingest.us.sentry.io/4511392181387264",
  // Sentry's UI uses this to filter dev/staging/prod errors. import.meta.env.MODE
  // is "development" on `vite` (local) and "production" on `vite build` (Vercel).
  environment: import.meta.env.MODE,
  // 100% performance sampling at launch — small traffic means we want to see
  // everything. Drop to ~0.1 (10%) once monthly transactions cross Sentry's
  // free quota; raise tracesSampleRate before that lands and the dashboard
  // goes dark.
  tracesSampleRate: 1.0,
  integrations: [
    // Tracks page loads + navigation transactions, fetch/XHR spans, and
    // long-task warnings. Required for the "Performance" tab in Sentry.
    Sentry.browserTracingIntegration(),
  ],
  // Sentry's "default PII" toggle — collects user IPs, headers, etc. Useful
  // for debugging "this error only happens for one user" cases. Disable
  // before a strict-privacy audience (e.g. EU/GDPR-only).
  sendDefaultPii: true,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ErrorBoundary catches render-phase errors anywhere in the tree and
        reports them to Sentry. fallback is a minimal "something broke" UI;
        without it, an uncaught render error would white-screen the app. */}
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          color: '#0f172a',
          padding: '24px',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px 0' }}>Something went wrong.</h1>
            <p style={{ fontSize: 14, color: '#475569', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              We've been notified and are looking into it. Try refreshing or reloading the page.
            </p>
            <button
              onClick={resetError}
              style={{
                background: '#1e3a8a',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                padding: '12px 22px',
                borderRadius: 12,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
