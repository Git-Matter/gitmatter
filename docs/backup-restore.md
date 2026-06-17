# Backup & Restore

gitcounsel state lives in two places: **Postgres** (accounts, matters, documents
metadata, audit log, tokens) and **object storage** (the document file bytes).
Back up both; a database restored without its objects has dangling document
references, and vice-versa.

## Postgres

### Back up

```bash
bun scripts/db-backup.ts                 # → gitcounsel-<timestamp>.dump
bun scripts/db-backup.ts /backups/x.dump # explicit path
```

Produces a compressed custom-format dump (`pg_dump -Fc`). Requires the
`postgresql-client` package (`pg_dump`) and `DATABASE_URL` in `.env`.

Schedule it off-host (cron / CI / a managed-Postgres automated-backup feature)
and keep dumps somewhere other than the database host. For managed Postgres
(Neon, Supabase, RDS, Crunchy), prefer the provider's point-in-time recovery in
addition to these dumps.

### Restore

```bash
# Point DATABASE_URL at the TARGET db (a scratch db for drills), then:
bun scripts/db-restore.ts gitcounsel-<timestamp>.dump
```

`db-restore.ts` runs `pg_restore --clean --if-exists`, which **drops and
recreates** objects — destructive. Never run it against production unless you
intend to overwrite it.

## Object storage (S3 / R2)

Enable **versioning** on the bucket so overwritten or deleted objects are
recoverable:

- **Cloudflare R2** — enable object versioning on the bucket (dashboard or
  `wrangler r2 bucket` settings).
- **AWS S3 / compatible** — enable Bucket Versioning (and optionally a lifecycle
  rule to expire old versions).

With versioning on, gitcounsel's document purge (which deletes objects) leaves
recoverable prior versions until the lifecycle policy expires them.

## Restore drill (do this before launch)

1. Take a backup: `bun scripts/db-backup.ts`.
2. Create a scratch database; set `DATABASE_URL` to it.
3. Restore: `bun scripts/db-restore.ts <dump>`.
4. Point the app at the scratch DB and confirm it boots and serves `/api/health`.
5. Spot-check a tenant's data (members, matters, a document download against the
   versioned bucket).
6. Record the wall-clock restore time — that is your recovery-time objective.
