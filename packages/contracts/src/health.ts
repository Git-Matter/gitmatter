/** Public process readiness, not proof of migrations, docs rollout or image identity. */
export type ReadinessReport = {
  ok: boolean;
  checks: Record<string, string>;
  /** Observed build-supplied SENTRY_RELEASE; unknown in an unlabelled local process. */
  release: string | null;
};
