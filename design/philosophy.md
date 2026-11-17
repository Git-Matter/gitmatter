# Design philosophy: quiet evidence, clear decisions

A legal team should spend its attention on the document and the decision. The interface provides
orientation, evidence, safe actions, and a reliable way back. It earns trust through inspectable
behavior rather than “AI” decoration. This is gitmatter's philosophy, informed by the research in
[the legal-product study](research/harvey-legora.md) and [workflow comparisons](research/saas-patterns.md).

## Principles that decide trade-offs

1. **The work object anchors the screen.** Identify the client, matter, artifact and current revision
   before offering tools. Do not make users rebuild that context after navigation.
2. **One consequential decision at a time.** A region has one leading action. Supporting actions
   appear where their prerequisites and consequences can be understood. This is a local hierarchy,
   not a rule that every whole page may contain only one button.
3. **Evidence is adjacent to a decision.** A source-bound finding shows the quotation, captured
   version, applicable instruction or standard, and proposed change together. A summary is an index
   into evidence, not a replacement for it.
4. **State comes from saved facts.** Opening a page, choosing a route, downloading a file, or waiting
   for a timer must not mark legal work approved or complete. Unknown and stale remain explicit.
5. **People control legal consequences.** Preparing, running, proposing, approving, publishing and
   exporting are distinct actions. Name the action that actually happens. Preserve existing server
   permissions and commit paths; visual simplification cannot weaken them.
6. **Reveal complexity where it becomes relevant.** Keep a clear overview and current next step;
   allow inspection of completed work. Disclose provider details, advanced settings and provenance
   without turning the work surface into a settings dashboard.
7. **Recovery is part of the flow.** Preserve entered data, selections and scroll position when
   returning. Explain partial failure at its affected unit. Retry only work that is safe to retry.
8. **Consistency is behavioral.** Equivalent tasks use the same labels, control variants, focus
   movement, confirmation rules, and recovery behavior. Matching corner radii alone is insufficient.
9. **Accessibility is a design input.** Keyboard, contrast, target size, source order, reflow and
   status announcements constrain the initial layout. They are not a final decorative polish pass.
10. **Character is concentrated.** Warm paper, regular serif identity type, quiet sans controls, and
    deliberately rounded geometry provide identity. Unnecessary accents and animated flourishes
    compete with legal content. Use the default shadcn radius scale, following the user's latest preference.
11. **Truth outweighs persuasion.** No fabricated customers, unsupported outcome statistics, fake
    live indicators, unjustified confidence scores, or illustrations presented as real product proof.
12. **A rule has a boundary.** Use documented exceptions for real domain content: a monospace hash,
    a multicolored chart, a destructive state, an italic legal quotation. Do not turn heuristics
    about generic design into bans on useful conventions.

## Deterministic design contract

Given the same **job, object, actor permissions, saved state, viewport, and user preference**, the
system prescribes the same layout recipe, action hierarchy, component variants and transitions.
Model-generated legal content can vary; the interaction frame and legal state machine must not.
Taste, originality, and whether a task is natural still require human judgment and user evidence.

### Ownership

| Concern                                        | Single owner                      | Change protocol                                                         |
| ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Physical foundation values and recipes         | `design/tokens.json`              | Edit source; generate CSS; inspect specimen; run policy                 |
| Generated CSS                                  | `apps/web/src/styles/tokens.css`  | Generated only; `design:check` rejects drift                            |
| Semantic utility mappings/base document styles | `apps/web/src/styles/globals.css` | Use existing roles; do not duplicate physical foundation values         |
| Shared interactive behavior                    | `apps/web/src/components/ui`      | Extend a primitive/variant before styling a local copy                  |
| Page height and scrolling                      | `PageShell`                       | Choose scroll or fill; one intentional owner per pane                   |
| Page identity and actions                      | `PageHeader`                      | Identify object; group related actions; avoid floating decorative pills |
| Specific workflow contract                     | `design/workflows`                | Define states, consequences, recovery and acceptance scenarios first    |
| Guardrail rules and allowed exceptions         | `design/policy.json`              | Exact scope, specific reason and evidence; no wildcard exceptions       |
| Evidence and inspiration                       | `design/research`                 | Source-linked, dated, confidence-labeled; distinguish inference         |

The token format is intentionally a small repository format, not a claim of full DTCG interchange
conformance. The [stable DTCG format module](https://www.designtokens.org/tr/2025.10/format/) informs
explicit types/aliases/ownership; its report is a community specification, not a W3C Standard.

### Finite layout recipes

| Job                        | Recipe                                        | Leading action                             | Supporting content                                         |
| -------------------------- | --------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Find or triage work        | Collection + toolbar + contextual detail      | Create or open relevant work               | Search/filter; batch actions after selection               |
| Inspect one item           | Object header + reading pane + inspector      | Decide or edit the selected item           | Version, source, history; return context                   |
| Prepare consequential work | Focused form + review summary                 | Prepare/save; then a separate explicit run | Required context first; optional details disclosed         |
| Resume multi-stage work    | Task summary + current stage                  | Continue the next available task           | Other stages inspectable; real saved status                |
| Run asynchronous work      | Persistent object + per-unit progress         | Cancel or inspect results                  | Retry failures safely; distinguish uncertain outcomes      |
| Deliver work               | Output identity + readiness + requirements    | Download/request the chosen output         | Source/revision, unresolved work and approval requirements |
| Configure the system       | Scoped settings sections                      | Save the current scope                     | Scope label, validation, changed-setting feedback          |
| Explain the product        | Statement + short lead + actual demonstration | One clear next step                        | Specific capabilities and checkable evidence               |

### Deterministic interaction decisions

- Use a page when work needs its own URL, substantial context, or a multi-step session.
- Use a dialog for a bounded task with a clear finish/cancel and manageable content. A long legal
  review is not a tiny confirmation dialog. Dirty close must protect entered work.
- Use a side inspector when detail supports a collection; close returns focus to the source item.
  On narrow screens it becomes a single readable surface, not a squeezed desktop grid.
- Use an inline disclosure for explanation or completed prerequisites. It cannot hide the only
  error, required consequence, or next action.
- Use a confirmation/review step for destructive, costly, externally visible, or legal decisions
  where the user needs to verify scope. Do not interrupt harmless navigation with confirmation.
- Use a status label for a meaningful condition. A filled badge is optional; a colored dot alone
  is insufficient. “Read”, “reviewed”, “approved” and “published” never mean the same thing.
- Use a toast for a short confirmation. Durable errors and next-step blockers remain at their
  affected object, with an action to recover.

## Accessibility and AI interaction floor

[WCAG 2.2](https://www.w3.org/TR/WCAG22/) supplies the normative accessibility criteria; this program
checks selected token contrasts but does not claim a full WCAG audit. Relevant criteria include
text contrast (1.4.3), essential non-text contrast (1.4.11), keyboard access (2.1.1), unobscured focus
(2.4.11), minimum target size with its exceptions (2.5.8), correctable input errors (3.3.1), legal/data
error prevention (3.3.4), avoiding redundant entry (3.3.7), and status announcements (4.1.3).
Our public/mobile control target policy aims for 44px hit areas; this is stronger than WCAG 2.2 AA's
24px minimum and exceptions. Dense workspaces require explicit target/spacing review.

[Microsoft HAX](https://www.microsoft.com/en-us/haxtoolkit/library/) informs capability disclosure,
context, correction, user control and consequences. Apply those ideas to legal work: inspectable
sources, explicit scope, cancel/retry, known limitations, and named human decisions. Do not expose a
model's hidden reasoning as supposed proof or display an invented certainty percentage.

## Workflow design acceptance

1. A task brief, actors, work object, current facts, primary action and terminal result.
2. A cognitive walkthrough of normal, empty, loading, error, partial, denied, stale and resumed states.
3. Browser evidence for keyboard entry, focus, escape/back/return, reflow and source/action connection.
4. No lost user input or silent state changes in the walkthrough.

These task contracts and internal walkthroughs are the acceptance basis for the requested design
work. A formal practitioner study is an optional follow-up, not a delivery blocker. If making
empirical claims about user performance or comprehension, collect actual representative-user
observations and define success thresholds before the study.

Automated checks prevent known classes of regressions. Internal walkthroughs expose design defects.
Neither is proof that every legal professional finds the workflow natural. Keep that distinction in
release notes and the acceptance ledger rather than manufacturing a usability score.
