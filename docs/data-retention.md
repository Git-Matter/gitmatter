# Data Retention

gitcounsel purges aged data on a rolling basis. Purges run on every app boot (no
external scheduler), so a long-running deployment sweeps continuously; a restarted
one sweeps on startup. Every window is configured by an environment variable and
measured in days. Setting a window to `0` disables that purge (keep forever).

| Data                     | Env var                | Default             | Keyed on                           | Notes                                                                                                                                            |
| ------------------------ | ---------------------- | ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Documents (soft-deleted) | —                      | 30 days             | `deleted_at`                       | Hard-deletes the row + S3 bytes after the soft-delete window. Built-in, not env-configurable.                                                    |
| Chat history             | `CHAT_RETENTION_DAYS`  | `0` (keep forever)  | `chats.updated_at` (last activity) | Pinned chats are never purged. Messages cascade with their chat.                                                                                 |
| Audit events             | `AUDIT_RETENTION_DAYS` | `365`               | `audit_events.created_at`          | Security/operational log (logins, token + key lifecycle, OAuth, uploads).                                                                        |
| OAuth auth codes         | —                      | purged once expired | `expires_at`                       | Short-lived single-use codes; removed as soon as they expire.                                                                                    |
| OAuth access tokens      | `TOKEN_RETENTION_DAYS` | `30`                | `revoked_at`                       | Only **revoked** tokens are purged after the window. A row whose access token has merely expired is kept while its refresh token is still valid. |
| Static MCP tokens        | `TOKEN_RETENTION_DAYS` | `30`                | `revoked_at`                       | Only **revoked** tokens are purged after the window.                                                                                             |

## What is not purged automatically

- **Live tokens** (no `revoked_at`) are never time-purged — revoke them to start the clock.
- **BYOK provider keys** (`user_api_keys`) have no expiry; they are removed only when the user deletes them.
- **Artifacts** (matters, clients, tabular reviews, workflows) and the **git commit spine** persist until the artifact is deleted; they are not on a retention timer.

## Operational notes

- Purges are idempotent and best-effort: a failure is swallowed so it never blocks
  boot, and the next sweep retries.
- Object-store deletions that genuinely fail (not already-deleted) are recorded in
  the audit log as `storage.delete_failed`.
- To enforce a stricter policy, lower the relevant `*_RETENTION_DAYS` value in the
  deployment environment and restart.
