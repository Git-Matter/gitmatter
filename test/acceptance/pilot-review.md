# Pilot review record

Use this record for plan 08 after the synthetic acceptance journey passes. It is a template, not
evidence of a pilot, legal accuracy, Word compatibility, or production availability. Use sanitized
representative paper that the firm has authorized for this evaluation.

## Session

Record date/timezone, environment, tested commit, document type, approved playbook revision,
opaque document/review ids, selected model, and whether findings were authored fixtures or live
provider results. Keep reviewer/client identities, source text, passwords, provider keys, bearer
tokens and screenshots of enrollment/recovery out of the repository.

Observe first use without coaching. Record setup obstacles, task completion, elapsed time, abandoned
steps, corrections and user explanations. Separate inference duration from human review time.
Mark each acceptance row `passed`, `failed`, or `not exercised`; a screenshot or checklist alone
does not prove an operation committed.

## Quality evaluation

Before inference, an eligible legal reviewer specifies the expected rule outcomes and acceptable
positions privately. Record only sanitized findings/evaluation summaries in the repository.
Evaluate each rule independently:

| Dimension             | Classification                                                                     | Evidence needed                                                            |
| --------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Requirement detection | Correct / false positive / false negative / inconclusive                           | Expected rule outcome compared with generated finding                      |
| Citation              | Exact and relevant / wrong version / unrelated / fabricated / absent appropriately | Source version, quote validation and reviewer judgment                     |
| Position              | Approved position used / unapproved wording / wrong fallback / judgment needed     | Library clause revision and chosen fallback                                |
| Redline               | Correct target and text / wrong match / lost formatting / unresolved               | Proposed and resolved document versions                                    |
| Word round-trip       | Passed / failed / not exercised                                                    | Open tracked output, inspect changes, save/reopen in actual Microsoft Word |
| Audit                 | Complete / missing attribution / missing provenance / wrong decision               | History, decision records and exported commit references                   |

Authored fixture cells test plumbing. They cannot count as provider-quality observations. An absent
clause needs an explicit absence outcome; unavailable extraction or model failure is not absence.
Human judgment is required for legal quality and cannot be replaced by a passing test suite.

## Reliability, authority and cost

Record run/job/proposal ids, attempt counts, restart/reconnect behavior, retained partial results,
permission denials, actual known usage and uncertain provider charges. Check that retries do not
duplicate legal mutations; paid provider execution may occur more than once after interruption.
Verify both UI and scoped MCP paths. Test at least one denied cross-matter read/write and one agent
attempt to resolve/approve its own work. Do not store real access credentials in evidence.

## Repeat use and integration selection

Schedule a second observed session with the same firm and compare the work completed, remaining
friction and corrections. Do not assert weekly repeat use from a single session.

For a candidate Word/DMS/email integration, record the repeated job, current workaround, required
permissions, authorized test environment, success criterion and observed frequency. Select one
integration only after a firm establishes the use case. External messages and provider settings
need explicit authorization; this template does not grant it.

## Release decision

Maintain distinct outcomes for source, repository, local runtime, staging, Word/provider quality,
pilot and production proof. Record unresolved failures with their owning numbered plan. A reviewer
decides whether limitations are acceptable for the intended pilot; do not turn a source-code check
into a release, customer metric, testimonial or compliance claim.
