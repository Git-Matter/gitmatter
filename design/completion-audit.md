# Full objective audit

**Vault revision:** the user selected Harvey Vault's table-first review workspace. The review now
starts with a dense matrix, compact file objects, typed columns and a selected-cell inspector.
Document is a secondary view with shared drafts. See the [reference comparison and deliberate
differences](research/harvey-visual-gap.md), [layout contract](workflows/product-frame.md), and
[four current review captures](screenshots.json). The seven current review browser records are in
[evidence/review-and-output.json](evidence/review-and-output.json).

This is an implementation grounded in Harvey's published Vault figure, with the user's rounder
geometry, gitmatter's own context/audit model and substitute typography. Private-library parity and
user visual acceptance are not inferred from passing tests. The earlier eight frame captures and
their original source hashes are preserved in [the historical packet](evidence/product-frame-screenshots.json).
Other earlier completion statements below describe their original checkpoints.

Audit date: November 13, 2026. This is a requirement audit, not a release or usability certificate.
The original brief includes research on Harvey and Legora, a broad anti-slop study, a philosophy,
deterministic design rules, natural workflows, and multiple SaaS inspirations for a single screen.
The user's later rounded-corner preference is part of the system, not an exception to remove.

## Requirements and authoritative evidence

| Requirement                        | Inspected evidence                                                                                                                                                                                                                                                         | Finding                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harvey deep dive                   | [Comparative study](research/harvey-legora.md), [observations](research/observations.json), public homepage desktop/mobile captures, linked vendor help/product/engineering sources                                                                                        | Public visual foundations and document/context/workflow patterns are documented, with adopt/adapt/reject decisions. Newer gated Harvey II remains explicitly unobserved. No official private token library is claimed.                                                                                                                                                          |
| Legora deep dive                   | Same comparative study and observations; current homepage and tabular-review captures; current vendor Agent, Workflows, Word and Tabular Review pages; dated studio attribution                                                                                            | Current sans/green campaign identity is distinguished from historical serif references. Structured review, evidence expansion and artifact delivery inform product behavior. Public claims are not presented as authenticated runs.                                                                                                                                             |
| All kinds of slop and their traits | [Taxonomy](research/anti-slop.md), original Paralect source, trait → replacement → verification mapping, legitimate exceptions                                                                                                                                             | Covers visual/content/architecture/interaction/state/AI-trust/accessibility/performance/governance defects. “Slop” is not an authorship classifier or an absolute ban on a font, rounded corner, grid or gradient. This is a broad maintainable taxonomy, not a claim to enumerate every future aesthetic defect.                                                               |
| Design philosophy                  | [Twelve principles](philosophy.md), ownership table, finite layout recipes and interaction decisions                                                                                                                                                                       | Work identity, evidence, saved facts, explicit consequences, progressive disclosure, recovery and truth determine decisions. Competing inspirations have an ordered resolution rule.                                                                                                                                                                                            |
| Deterministic system               | [Canonical tokens](tokens.json), generated CSS, shared primitives, PageShell/PageHeader, five workflow briefs, authoring instructions                                                                                                                                      | Physical values have one owner; same job/role/facts/viewport/preference has prescribed recipes and actions. Model answers and subjective taste are not claimed deterministic.                                                                                                                                                                                                   |
| Executable guardrails              | [Policy](policy.json), [checker](tooling/design-policy.ts), token/media checkers, design-policy tests, explicit CI design check                                                                                                                                            | Ten scoped rules, generated-output drift, 22 theme contrast pairs, exact exceptions and 19 media assets are checked. Generated router and vendored AI elements are declared exclusions. Manual/contextual traits retain an explicit review gate.                                                                                                                                |
| Multiple inspirations per screen   | [SaaS pattern matrix](research/saas-patterns.md), each workflow's primary/supporting references and rejected alternatives                                                                                                                                                  | First review, setup, findings, documents, templates, assistant, output, settings, auth and shell combine responsibilities under one vocabulary/token system. Vendor palettes and private behavior are not mixed indiscriminately.                                                                                                                                               |
| Natural, intuitive workflows       | [Five contracts](workflows/first-review.md), [review/output](workflows/review-and-output.md), [templates](workflows/template-library.md), [assistant](workflows/assistant-and-navigation.md), [settings/access](workflows/settings-and-access.md), current browser records | Internal state/keyboard/responsive walkthroughs cover normal, error, partial, denied, stale, cancelled and resumed paths where applicable and drove implemented repairs. The requested design is evaluated through these concrete task/state walkthroughs and rendered review. Formal practitioner research is optional follow-up; no empirical user-performance claim is made. |
| Rounder borders and screenshots    | Canonical 16px controls / 24px media-dialogs / 28px cards, compact exceptions; rendered component captures                                                                                                                                                                 | Implemented and measured in the browser. Light/dark and 390px foundation captures exist. The theme system is a gitmatter adaptation, not copied proprietary assets.                                                                                                                                                                                                             |

## Principle-to-behavior audit

| Principle                      | Concrete implementation/evidence                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Work object anchors context | Matter/document identity in assistant request payload and visible composer; captured/current source in review inspectors.                                                                    |
| 2. One consequential decision  | Guide selection is distinct from recommendation; explicit Continue; prepared assistant workflow has an explicit Start; output request and approval remain separate.                          |
| 3. Evidence beside decision    | Quotation inspection highlights and focuses captured text; source/version, rationale and proposal remain connected through compare/return.                                                   |
| 4. State from saved facts      | Opening/selecting does not mark completion. Only stream `done` completes an answer; legacy tool inputs do not fabricate successful outcomes.                                                 |
| 5. People control consequences | Request counters verify no paid dispatch on preparation; server decision/approval APIs remain authoritative; sign-out transition resolves dirty-work guards before dispatch.                 |
| 6. Relevant complexity         | One guide stage in depth, model/research options disclosed, current task and blockers visible; inactive retained content is hidden/inert.                                                    |
| 7. Recovery                    | Drafts survive comparison, tabs and transient refresh. Stale revisions require explicit reload. Denial removes private views. Auth failures restore a retry action.                          |
| 8. Behavioral consistency      | Shared controls, guard, snapshot-retention policy and selected-model eligibility; equivalent closes use Keep/Discard and focus return.                                                       |
| 9. Accessibility               | Configured light/dark contrast, named dialogs, keyboard activation/resizing, mobile pane/tabs and focus return are exercised. A complete WCAG or assistive-technology audit is not asserted. |
| 10. Concentrated character     | Warm monochrome, regular serif identity, sans controls and the user's 16/24/28px geometry; overlay elevation is restrained.                                                                  |
| 11. Truth                      | All 19 marketing videos disclose illustrative example data and have reviewed inventory/source hashes. Fictional UI responses are not provider, auth, legal-quality or deployment proof.      |
| 12. Bounded rules              | Exact exceptions only; no current authored-source exceptions. Quotation emphasis, identifiers, real status colors and useful boundaries remain legitimate.                                   |

## Verification scope

The authoritative command outcomes and current source/script hashes are maintained in
[acceptance.md](acceptance.md) and [the replay records](evidence/access.json). The replay runner
rejects tool-level errors, missing results and changed relevant sources. Those checks cover the
named scenarios; they are not a complete transitive bundle attestation or a claim about every UI.

Template evidence adds current Hono/core with real loopback Postgres and original fictional Word
files. Other interaction evidence uses fictional API/provider/auth outcomes. Public media evidence
checks actual local public pages. Keep those tiers distinct. Production deployment, live provider
quality, private vendor app access and real authentication are not requested deliverables and are
not silently claimed by a green local build.

## Delivery clarification

On November 13 the user explicitly removed practitioner research as a blocker and requested the
finished design with app screenshots. The requested acceptance basis is the source-linked research,
implemented system, expert task/state walkthroughs, rendered review and repository checks. Those
deliverables retain the original workflow scope; no empirical user-performance claim is substituted
for them. A formal study was an additional requirement introduced by the agent, not requested work.

[The moderated task packet](usability-study.md) remains an optional follow-up, marked NOT RUN.
There are no invented participant results. Real practitioner observations would support later
empirical claims, but their absence does not block this design delivery.

## Final acceptance

The requested research and design delivery is complete. The seven current
[browser captures](screenshots.json) were visually inspected, including the actual review/settings
app frame, light/dark settings and 390px reflow. The assistant capture preserves visible matter and
document scope and an unsent message; no model request was made for these screenshots.

All 21 workflow records match their current relevant source and script hashes. The twelve
first-review/review functions were replayed after adding the fixture's app-frame preview mode.
`vp check`, workspace and fixture typechecks, design policy and cloud build pass. The full suite
passes 371 tests / 67 files with `vp test --maxWorkers=1 --testTimeout=15000`; the previously
documented default-timeout limitation is retained. No schema or test-timeout source was changed.

The study gate has been removed per the user's instruction. Optional empirical research remains
unrun, and no deployment, live-authentication or legal-quality claim is made by this acceptance.
