// Runtime config accessor. Reads from a bound env object first (e.g. a Cloudflare
// Worker `env` passed at request bootstrap via setRuntimeEnv), falling back to
// process.env for Node.js. Lets the same code run on both without sprinkling
// `process.env` (which does not exist in the Workers runtime) across modules.

type EnvSource = Record<string, string | undefined>;

let boundEnv: EnvSource | null = null;

/** Bind a runtime env object (Cloudflare `env` bindings). Call once at bootstrap. */
export function setRuntimeEnv(env: EnvSource): void {
  boundEnv = env;
}

export function getEnv(name: string): string | undefined {
  if (boundEnv && name in boundEnv) return boundEnv[name];
  // process may be absent in the Workers runtime.
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export function requireEnv(name: string): string {
  const v = getEnv(name);
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/**
 * Read a positive numeric limit from env, falling back to `fallback` when unset,
 * empty, or not a finite number > 0. The pattern for tunable budgets/timeouts: an
 * unset or `0` value should disable a feature via an explicit `<= 0` guard at the
 * call site, never silently become the fallback.
 */
export function getEnvNumber(name: string, fallback: number): number {
  const v = getEnv(name);
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
