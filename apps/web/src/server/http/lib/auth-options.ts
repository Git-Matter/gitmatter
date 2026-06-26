import type { BetterAuthOptions } from "better-auth";

type Env = (name: string) => string | undefined;

const AUTH_WINDOW_SECONDS = 60;

function originOf(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function trustedOriginsFromEnv(getEnv: Env): string[] | undefined {
  const origins = new Set<string>();
  const baseOrigin = originOf(getEnv("BETTER_AUTH_URL"));
  if (baseOrigin) origins.add(baseOrigin);

  for (const part of (getEnv("BETTER_AUTH_TRUSTED_ORIGINS") ?? "").split(",")) {
    const origin = originOf(part);
    if (origin) origins.add(origin);
  }

  return origins.size ? [...origins] : undefined;
}

export function allowedEmailDomainsFromEnv(getEnv: Env): string[] | undefined {
  const domains = new Set<string>();

  for (const part of (getEnv("AUTH_ALLOWED_EMAIL_DOMAINS") ?? "").split(",")) {
    const domain = part.trim().toLowerCase().replace(/^@+/, "");
    if (domain) domains.add(domain);
  }

  return domains.size ? [...domains] : undefined;
}

export function emailAllowed(email: string | undefined, domains: string[] | undefined): boolean {
  if (!domains) return true;
  const trimmed = email?.trim().toLowerCase() ?? "";
  const at = trimmed.lastIndexOf("@");
  const domain = at > 0 && at < trimmed.length - 1 ? trimmed.slice(at + 1) : "";
  return domain ? domains.includes(domain) : false;
}

function limitFromEnv(getEnv: Env, name: string): number | null {
  const raw = getEnv(name);
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function authRateLimitFromEnv(getEnv: Env): BetterAuthOptions["rateLimit"] {
  const customRules: NonNullable<BetterAuthOptions["rateLimit"]>["customRules"] = {};
  const signInLimit = limitFromEnv(getEnv, "AUTH_SIGN_IN_RATE_LIMIT");
  const signUpLimit = limitFromEnv(getEnv, "AUTH_SIGN_UP_RATE_LIMIT");
  const passwordLimit = limitFromEnv(getEnv, "AUTH_PASSWORD_RATE_LIMIT");

  if (signInLimit) customRules["/sign-in/*"] = { window: AUTH_WINDOW_SECONDS, max: signInLimit };
  if (signUpLimit) customRules["/sign-up/*"] = { window: AUTH_WINDOW_SECONDS, max: signUpLimit };
  if (passwordLimit) {
    customRules["/request-password-reset"] = { window: AUTH_WINDOW_SECONDS, max: passwordLimit };
    customRules["/send-verification-email"] = { window: AUTH_WINDOW_SECONDS, max: passwordLimit };
  }

  return {
    enabled: true,
    window: AUTH_WINDOW_SECONDS,
    max: limitFromEnv(getEnv, "AUTH_RATE_LIMIT") ?? 100,
    ...(Object.keys(customRules).length ? { customRules } : {}),
  };
}
