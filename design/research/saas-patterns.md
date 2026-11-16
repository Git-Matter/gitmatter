# SaaS workflow references and screen composition

These products were selected for specific, documented interaction patterns, not as a ranking of
all SaaS products or proof that their entire UX is superior. Research date: November 12, 2026.
All proposed combinations below are gitmatter design decisions, not vendor feature parity claims.

## Pattern library

| Reference                                                                                                                                                                  | Documented pattern                                                                            | Use in gitmatter                                                                                 | Do not import blindly                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [Linear issue creation](https://linear.app/docs/creating-issues)                                                                                                           | Minimal required identity/status, contextual creation and reusable templates                  | Create a matter/review from its parent, prefill known context, disclose optional detail          | Developer-specific shortcuts and issue terminology                   |
| [Linear views](https://linear.app/docs/custom-views)                                                                                                                       | Save a filtered working view                                                                  | Preserve review filters and return position; a saved view is not a new artifact                  | Navigation proliferation for every filter                            |
| [Notion templates](https://www.notion.com/help/database-templates)                                                                                                         | Named reusable page structures and defaults, with editing context visible                     | A template can start work without rebuilding its structure; identify the exact approved revision | Silent live updates to a published legal template                    |
| [Airtable record detail](https://support.airtable.com/articles/5805061650-airtable-interface-layout-record-detail)                                                         | Open detail from multiple collection layouts                                                  | Table/list → inspector → same table/list context                                                 | Arbitrarily nested inspectors and confusing permission inheritance   |
| [Figma comments](https://help.figma.com/hc/en-us/articles/360041068574-Add-comments-to-files)                                                                              | Feedback is pinned to a location/region and remains attached to its parent                    | Attach legal discussion to a quotation and captured revision                                     | Treating a location-only anchor as sufficient after source edits     |
| [GitHub review](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request) | Viewed files collapse; changed files lose the viewed marker; review dispositions are distinct | Keep evidence inspection separate from approval; invalidate stale version-bound decisions        | Repository-admin bypasses as a legal policy rule                     |
| [Stripe lifecycle](https://docs.stripe.com/payments/payment-intents)                                                                                                       | Creation and confirmation are distinct; the durable object carries state across attempts      | Preparing a review does not run it; retry/refresh reads durable state                            | Payment-specific fields or an automatic retry of uncertain paid work |
| [IBM Carbon tables](https://carbondesignsystem.com/components/data-table/usage/)                                                                                           | Sorting/filtering, progressive row detail, selection and contextual batch actions             | One table toolbar; selected actions appear when selection exists                                 | Batch approval without inspecting exact legal revisions              |
| [GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/)                                                                                       | Inspect information before submission and return to change it                                 | Review source, instructions, standard and model/cost before a consequential run                  | A full confirmation page for harmless navigation or view changes     |
| [GOV.UK multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/)                                                                            | Longer multi-session work shows real task status and order                                    | Onboarding/review preparation uses saved facts and a clear next step                             | A long checklist when the task can be simplified                     |
| [GOV.UK validation](https://design-system.service.gov.uk/patterns/validation/)                                                                                             | Correctable field errors plus an error summary; preserve context                              | Return to the exact input and retain entered instructions                                        | Validating every keystroke or making users re-enter saved context    |

## Compose a screen from responsibilities

| Screen / job               | Primary reference           | Supporting reference                                     | gitmatter-specific decision                                                                       | Evidence to require                                                              |
| -------------------------- | --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| First review               | GOV.UK task status          | Linear contextual defaults; Stripe explicit confirmation | One current preparation task; completed steps remain inspectable; preparing never buys inference  | Fresh, missing setup, read-only, existing review, stale source, resumed states   |
| Matter overview            | Harvey persistent workspace | Linear recent work/context                               | Show work needing a decision and recent artifacts; avoid generic KPI dashboard cards              | Jump into an artifact and return without losing matter context                   |
| Review setup               | GOV.UK check answers        | Notion reusable structures; Legora playbooks             | Capture known source/standard/client context once, show unknowns, then explicitly run             | Correct prefill, change/recheck loop, no side effect on opening                  |
| Tabular review             | Legora table/evidence       | Carbon toolbar; Airtable inspector                       | Scan → inspect exact quotation → decide; preserve row/filter and keyboard focus                   | Click and keyboard round trip; large-data and partial failure states             |
| Finding inspector          | Airtable record detail      | Figma anchors; GitHub review                             | Finding, captured source version, applicable rule, proposal and human decision stay together      | Stale source, no citation, read-only, next/previous, close/focus return          |
| Document/redline workspace | Legora Word context         | GitHub diff review                                       | Separate review findings from tracked edits; show source and proposal identity                    | Accept/reject correct revision; conflict and revalidation paths                  |
| Template library           | Notion reusable templates   | GitHub stale approvals; Airtable list/detail             | Working revision stays private; approved revision stays available until replaced/withdrawn        | Editor/reviewer/reader paths, dirty-close, stale approval, archived download     |
| Assistant                  | Harvey source selection     | HAX correction/control; Legora artifact delivery         | Matter/source scope visible before request; source cards and created artifacts remain inspectable | Streaming, cancel, reconnect, failed tool, partial answer, unavailable citation  |
| Output/export              | GOV.UK check answers        | Stripe durable states; GitHub required review            | Label tracked draft/report/clean DOCX separately; readiness is derived, not optimistic            | Not ready, approval requested, changed source, approved output, download failure |
| Settings                   | Linear grouped settings     | GOV.UK progressive questions                             | Organization vs account scope is explicit; sensitive configuration lives outside work screens     | Permission differences, validation, save/retry, changed configuration            |
| Public homepage            | Harvey type hierarchy       | Legora prominent action; real gitmatter evidence         | One result, one short explanation, clear next action, genuine product media                       | Desktop/mobile, paused media, truthful proof, keyboard navigation                |

## Per-screen synthesis rule

### Settings and authentication refinement (November 13, 2026)

Linear documents distinct [personal profile](https://linear.app/docs/profile) and
[workspace settings](https://linear.app/docs/workspaces), with administration visible according to
role. We adapt that separation to Account, Organization, AI, Agents and Data, while keeping one
URL-selected panel and retaining local input. Role-check failure cannot imply administration access.
GOV.UK's [password pattern](https://design-system.service.gov.uk/patterns/passwords/) supports clear,
consistent constraints and paste; we retain ordinary password inputs, explicit recovery and the
existing server policy rather than adding decorative strength scores or new password rules.
Stripe documents [an explicit passkey sign-in action](https://support.stripe.com/questions/sign-in-using-a-passkey?locale=en-GB)
followed by browser-owned steps. We keep that action distinct from password login and preserve a
retry/password alternative after service failure. These are documented references and gitmatter
adaptations, not authenticated comparative tests.

| Surface            | Primary pattern                    | Supporting patterns                                      | gitmatter adaptation and rejected alternative                                                                                      |
| ------------------ | ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Settings           | Linear account/workspace scope     | GOV.UK recoverable validation; Stripe durable states     | Retained visited tabs, explicit save/retry and revision-bound limits; reject lost input and optimistic “configured” claims         |
| Login/signup/reset | GOV.UK password and error recovery | Stripe explicit passkey action; shared safe local return | Button/Enter readiness, literal pending state and preserved input; reject auto-submit and simulated security success               |
| Shell navigation   | Linear working views               | Claude project context; Slack draft continuity           | Stable section destinations, saved matter/chat identity and accessible mobile overlay; reject a second navigation model per screen |

See [the settings/access contract](../workflows/settings-and-access.md) and
[the current fictional-request record](../evidence/access.json). A successful intercepted response
does not prove real mail, authentication, passkey hardware or server authorization.

Assistant refinement also draws on Claude's [project context](https://support.claude.com/en/articles/9517075-what-are-projects),
Slack's [unsent drafts](https://slack.com/help/articles/201457107-Send-and-read-messages-in-Slack), and
Linear's [retained creation context](https://linear.app/docs/creating-issues). The adaptation keeps
matter/source identity explicit, protects local drafts, and separates workflow preparation from paid
dispatch. It does not copy cross-device draft storage or treat a previous conversation's existence as
evidence that its last request succeeded. These are documented public patterns, not private UI tests.

A screen brief names the person, job, work object, decision, and terminal result. It can borrow
several patterns, but every borrowed element must serve a responsibility in that brief. Record
which pattern is primary, which supports it, what was changed for legal audit requirements, and
what was deliberately rejected. Resolve conflicts using these priorities:

1. Correctness and permissions of the legal action.
2. Preservation of source, version, instructions, and user work.
3. Clarity of the next decision and ability to recover.
4. Accessible, consistent component behavior.
5. Visual character and reference fidelity.

Do not splice vendors' color palettes, navigation models, button shapes and vocabularies into one
screen. Compose interaction ideas under one identity. A successful flow should remain explainable
without mentioning any reference product.

## Workflow review protocol

For each role and state, write a realistic task without naming the UI control. Check whether the
screen communicates: where am I; what is selected; what can I do next; what will it cost/change;
what is saved; how do I leave/recover; and how do I know it finished. Record observed behavior,
not “looks intuitive”. First-click and task-completion studies with representative legal users
remain separate from an internal cognitive walkthrough; neither screenshots nor tests prove them.
