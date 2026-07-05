import pino, { type DestinationStream, type Logger } from "pino";
import { getEnv } from "./config.js";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

// Optional sink for error-level events, wired by the app at bootstrap (e.g. to
// forward into Sentry). Kept as a settable hook so this shared package never
// imports a runtime-specific error SDK — the boundary stays clean.
type ErrorReporter = (
  level: Extract<LogLevel, "error" | "fatal">,
  msg: string,
  fields?: Record<string, unknown>
) => void;

type LogOptions = { report?: boolean };

const REDACT_PATHS = [
  "authorization",
  "cookie",
  '["set-cookie"]',
  '["mcp-session-id"]',
  "token",
  "apiKey",
  "password",
  "secret",
  "key",
  "headers.authorization",
  "headers.cookie",
  'headers["set-cookie"]',
  'headers["mcp-session-id"]',
  "headers.token",
  "headers.apiKey",
  "headers.password",
  "headers.secret",
  "headers.key",
];
const SENSITIVE_FIELD_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "mcp-session-id",
  "token",
  "apikey",
  "api_key",
  "password",
  "secret",
  "key",
]);
const REDACTED = "[redacted]";

let errorReporter: ErrorReporter | null = null;
let testDestination: DestinationStream | null = null;
let logger: Logger | null = null;

function defaultLevel() {
  const configured = getEnv("LOG_LEVEL")?.trim();
  if (configured) return configured;
  return getEnv("NODE_ENV") === "development" ? "debug" : "info";
}

function getLogger() {
  logger ??= pino(
    {
      level: defaultLevel(),
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    },
    testDestination ?? undefined
  );
  return logger;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function redactForReporter(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== "object") return value;
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };
  if (value instanceof Date) return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactForReporter(item, seen));
  if (!isRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_FIELD_NAMES.has(key.toLowerCase())
      ? REDACTED
      : redactForReporter(item, seen);
  }
  return out;
}

function redactFields(fields: Record<string, unknown> | undefined) {
  return fields ? (redactForReporter(fields) as Record<string, unknown>) : undefined;
}

export function setErrorReporter(fn: ErrorReporter | null): void {
  errorReporter = fn;
}

export function logEvent(
  level: LogLevel,
  msg: string,
  fields?: Record<string, unknown>,
  opts?: LogOptions
): void {
  getLogger()[level](fields ?? {}, msg);
  if ((level === "error" || level === "fatal") && opts?.report !== false && errorReporter) {
    // Never let the reporter throw out of a log call.
    try {
      errorReporter(level, msg, redactFields(fields));
    } catch {}
  }
}

export function setLogDestinationForTest(destination: DestinationStream | null): void {
  testDestination = destination;
  logger = null;
}

export function resetLogForTest(): void {
  errorReporter = null;
  testDestination = null;
  logger = null;
}
