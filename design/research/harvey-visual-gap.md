# Harvey Vault reference and remaining deviations

The user rejected the latest app as still not capturing Harvey. Shared token semantics, reusable
components and passing interaction checks are useful engineering work, but do not establish visual
fidelity. The next revision must start with a specific product surface and its actual visual grammar.

## Published visual evidence inspected

The following are rendered figures published in Harvey's
[product-design article](https://www.harvey.ai/blog/how-we-approach-design-at-harvey), not an
authenticated private-app session:

- [Vault review figure](https://cdn.sanity.io/images/07s0r5r6/production/9de3021de0a872c076ca713814c40e85d61ff54e-1200x675.svg): compact rows, typed columns, file objects and meaningful verification states.
- [Workflow figure](https://cdn.sanity.io/images/07s0r5r6/production/d1ecc9e04df9f1d8c1144eae73cbaa413cd0949f-1200x675.svg): a focused task composer with source controls and a distinct generation action.
- [Thread/activity figure](https://cdn.sanity.io/images/07s0r5r6/production/34e58c2d7523fd9ffa346a043ceb88fe10d35320-1200x675.svg): a readable sequence of work, attached-file objects and contextual source/search elements.

The [system-engineering article](https://www.harvey.ai/blog/rebuilding-harveys-design-system-from-the-ground-up)
describes Figma variables and component anatomy aligned with implementation. This does not justify
adopting Figma's editor layout as Harvey's visual identity. That inference influenced the prior pass
too heavily. The published figures' outer presentation backdrops are not verified app-canvas tokens.

## Specific gaps in the delivered app

| Area                | Delivered result                                                            | Required correction direction                                                                                                         |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Review metaphor     | Findings automatically replace the table with a document workbench          | Distinguish table scanning from selected-cell inspection and document reading; anchor the default to the intended Harvey surface      |
| Information density | One sparse demonstration document and large form/reading regions            | Evaluate realistic row/column density and object treatments, rather than judging only empty panes                                     |
| Typography          | A broad operational-sans correction with independently chosen sizes/weights | Establish roles and relative proportions from the selected product reference; keep measured evidence separate from font substitutions |
| Application chrome  | An invented rounded outer workspace and Figma-like panes                    | Verify actual product chrome before asserting a Harvey match; roundness does not require turning the entire app into a card           |
| Acceptance evidence | Functional checks and local screenshots presented as completion             | Add a direct reference-to-app comparison and record visible deviations before a fidelity claim                                        |

The original Design Extractor link describes the public website. It remains a brand reference,
while Vault, Threads and Workflow Builder have different task surfaces. The user selected **Harvey Vault — table-first review workspace** as the anchor. No third broad reskin is accepted merely
because its component code is cleaner. Existing audit, permission and draft-preservation behavior
must be retained through any subsequent visual changes.

## Vault implementation revision (2026-11-13)

The review now defaults to the matrix even when findings exist. It uses compact document objects,
question-type glyphs, thin cell separators, pinned filename context and single-line findings. A
selected cell opens a nonmodal desktop inspector; Document is an explicit secondary view. Both
share draft and source identity. The multirow preview uses fourteen identical, labelled fictional
review copies; it demonstrates density rather than heterogeneous extraction quality.

Deliberate differences from the published figure: 16/24/28px geometry follows the user's request;
Inter substitutes for Harvey's proprietary typography; gitmatter retains its own navigation and
Client/Matter/artifact vocabulary. The figure's verification badges are not copied as gitmatter
approvals. Source identity has its own labelled status. Full private-library parity is unverified;
this revision grounds the review surface in Vault, not every unrelated application page.
