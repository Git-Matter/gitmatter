# NDA MVP: development integration and staging gate

Recorded 2026-10-14 (Australia/Sydney), following the 2026-10-13 implementation and integration.

## Development integration

- Source commit `26b729dc1711b7c9d4a2f1188c1dfea682cd6bbd` is
  `feat: deliver governed NDA review MVP`.
- [PR #12](https://github.com/Git-Matter/gitmatter/pull/12) merged into `dev` at
  `ba161318bfbfd3a5981658d1d250976d3f8fab7f`, 2026-10-13T12:50:31Z.
- [PR-head CI](https://github.com/Git-Matter/gitmatter/actions/runs/38399777954) passed for
  `26b729dc`. The [staging workflow](https://github.com/Git-Matter/gitmatter/actions/runs/38400299545)
  also passed verification, built/published both images and triggered both server deployments for
  `ba161318`. Those workflow results do not establish runtime rollout.
- Local `dev` was fast-forwarded to the merged revision and `vp install` rerun. The coordinated
  [implementation record](2026-10-13-mvp-implementation.md) contains the 282 passing tests in 54
  files, local build/checks, reviewed migrations and explicit evidence limits.
- A subsequent acceptance-harness correction keys findings, proposals, rationales and resolutions
  by the actual requested column, including an anchored missing-clause insertion. Browser checks
  verified that the selected missing finding becomes pending and repeated proposal is disabled.
  This correction affects the isolated fixture, not production enforcement or DOCX bytes.
- Post-integration `vp check`, workspace typecheck and fixture TypeScript passed. Plans now link
  the merged PR and distinguish passing repository checks from remaining acceptance gates.

## Exact staging observations

Read-only inspection after the new deployment attempts established:

| Service | Attempt for `ba161318`  | Runtime result                    | Still-running OCI revision                 |
| ------- | ----------------------- | --------------------------------- | ------------------------------------------ |
| Web     | `vwR00Oqvprcgah3fP_xSD` | Error: GHCR authentication denied | `0ee3a6f82dd3dd7220be8e0badbccd55a4919cb6` |
| Docs    | `WzHnuDDu9nqjv23U55kNo` | Error: GHCR authentication denied | `7c6f18e3dcfbae7365eccec9ee1790499606e917` |

The web attempt ran 2026-10-13T12:57:08.489Z–12:57:08.970Z. The docs attempt ran
2026-10-13T12:54:29.575Z–12:54:30.066Z. These are fresh attempts for the merge revision, not the
older September failures. Safe log classification identified registry authorization rather than
network or missing-image failures. No credential values or full environment/configuration objects
were retained in this record.

The web container still uses `ghcr.io/git-matter/gitmatter-cloud:staging`. The docs container still
uses `ghcr.io/peteqian/gitmatter-docs:staging`, while its configured target is the Git-Matter image.
Public readiness returned HTTP 200 with database up after these attempts; that proves the older
runtime's database health only. **The NDA MVP has not rolled out to staging.**

## Blocking dependency and remaining proof

The staging server needs valid authorization to pull the private Git-Matter images. No registry
access was widened and signup/security controls were not weakened. AWS login was authorized and
attempted, but browser sign-in was not completed before authorization expired. The reusable
synthetic staging account has not been created or stored. Credential handling must follow the
repository's runtime Secrets Manager resolution workflow after the AWS session is restored.

Once the credential dependency is resolved: pull the verified image revision, confirm migrations
and running OCI revision, provision the isolated account securely, then execute authenticated
browser/MFA and scoped MCP acceptance. Provider quality/billing, Word round-trip, fault/load and
pilot evidence remain separate gates. No production release or completed plan is claimed.
