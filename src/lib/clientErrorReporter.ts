// Firebase is imported DYNAMICALLY in the send path. This module is loaded
// from main.tsx before anything renders, so a static firebase import here
// would drag the whole Firebase SDK into the entry bundle and delay first
// paint on slow mobile networks. Errors are rare; paying the import cost
// only when one actually happens is the right trade.

export type ClientErrorSeverity = "error" | "warning";

interface ReportClientErrorOptions {
  source: string;
  severity?: ClientErrorSeverity;
  context?: Record<string, unknown>;
}

interface ClientErrorPayload {
  source: string;
  severity: ClientErrorSeverity;
  message: string;
  name?: string;
  code?: string;
  stack?: string;
  page: string;
  context?: Record<string, unknown>;
}

const MAX_REPORTS_PER_SESSION = 30;
const DEDUPE_WINDOW_MS = 60_000;
const MAX_STACK_LENGTH = 4_000;

const recentFingerprints = new Map<string, number>();
let reportsSent = 0;
let globalReporterInstalled = false;
let consoleReporterInstalled = false;
let reportingInFlight = false;

export function installGlobalClientErrorReporting(): void {
  if (typeof window === "undefined" || globalReporterInstalled) return;
  globalReporterInstalled = true;

  window.addEventListener("error", (event) => {
    reportClientError(event.error ?? event.message, {
      source: "client.window_error",
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason, {
      source: "client.unhandled_rejection",
    });
  });
}

export function installConsoleErrorReporting(): void {
  if (typeof window === "undefined" || consoleReporterInstalled) return;
  consoleReporterInstalled = true;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    if (reportingInFlight) return;
    const errorArg = args.find((arg) => arg instanceof Error) ?? args[0] ?? "console.error";
    reportClientError(errorArg, {
      source: "client.console_error",
      context: {
        arguments: args.map(toConsoleValue).slice(0, 5),
      },
    });
  };
}

export function reportClientError(error: unknown, options: ReportClientErrorOptions): void {
  if (typeof window === "undefined") return;
  if (reportsSent >= MAX_REPORTS_PER_SESSION) return;

  const payload = buildPayload(error, options);
  const fingerprint = [
    payload.source,
    payload.code ?? "",
    payload.name ?? "",
    payload.message,
    payload.page,
  ].join("|");

  const now = Date.now();
  const lastSeen = recentFingerprints.get(fingerprint);
  if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) return;

  recentFingerprints.set(fingerprint, now);
  reportsSent += 1;

  reportingInFlight = true;
  void Promise.all([import("firebase/functions"), import("./firebase")])
    .then(([{ httpsCallable }, { functions }]) => {
      const fn = httpsCallable<ClientErrorPayload, { ok: boolean }>(functions, "logClientError");
      return fn(payload);
    })
    .catch(() => {
      // Logging must never create a second user-visible failure.
    })
    .finally(() => {
      reportingInFlight = false;
    });
}

function buildPayload(error: unknown, options: ReportClientErrorOptions): ClientErrorPayload {
  const info = normalizeError(error);
  const location = getSafeLocation();
  return {
    source: normalizeSource(options.source),
    severity: options.severity ?? "error",
    message: info.message,
    name: info.name,
    code: info.code,
    stack: info.stack,
    page: location.page,
    context: pruneContext({
      ...options.context,
      route: location.route,
      searchKeys: location.searchKeys,
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      environment: import.meta.env.MODE,
      build: import.meta.env.VITE_APP_VERSION ?? null,
    }),
  };
}

function normalizeError(error: unknown): {
  message: string;
  name?: string;
  code?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      message: truncate(error.message || error.name || "Unknown client error", 1_000),
      name: truncate(error.name, 120),
      code: readStringProperty(error, "code", 120),
      stack: error.stack ? truncate(error.stack, MAX_STACK_LENGTH) : undefined,
    };
  }

  if (typeof error === "object" && error !== null) {
    const message =
      readStringProperty(error, "message", 1_000) ??
      safeStringify(error, 1_000) ??
      "Unknown client error";
    return {
      message,
      name: readStringProperty(error, "name", 120),
      code: readStringProperty(error, "code", 120),
      stack: readStringProperty(error, "stack", MAX_STACK_LENGTH),
    };
  }

  return {
    message: truncate(String(error ?? "Unknown client error"), 1_000),
  };
}

function readStringProperty(value: object, key: string, maxLength: number): string | undefined {
  if (!(key in value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[key] === "string" ? truncate(record[key], maxLength) : undefined;
}

function getSafeLocation(): { page: string; route: string; searchKeys: string[] } {
  const searchParams = new URLSearchParams(window.location.search);
  return {
    page: `${window.location.origin}${window.location.pathname}`,
    route: window.location.pathname,
    searchKeys: [...searchParams.keys()].slice(0, 20),
  };
}

function normalizeSource(source: string): string {
  const clean = source.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160);
  return clean.startsWith("client.") ? clean : `client.${clean || "unknown"}`;
}

function pruneContext(context: Record<string, unknown>): Record<string, unknown> {
  const json = safeStringify(context, 4_000);
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toConsoleValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: readStringProperty(value, "code", 120),
      stack: value.stack ? truncate(value.stack, 1_500) : undefined,
    };
  }
  if (typeof value === "string") return truncate(value, 1_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value === undefined) return "[undefined]";
  return safeStringify(value, 1_000) ?? String(value);
}

function safeStringify(value: unknown, maxLength: number): string | undefined {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? truncate(json, maxLength) : undefined;
  } catch {
    try {
      return truncate(String(value), maxLength);
    } catch {
      return undefined;
    }
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}…[truncated:${value.length - maxLength}chars]`
    : value;
}
