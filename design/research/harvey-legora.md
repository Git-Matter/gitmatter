# Harvey and Legora: evidence-led design study

Research date: November 12, 2026. Public website observations use a 1440 × 1000 desktop viewport;
mobile captures use 390 × 844. These are samples, not complete internal design systems. Fonts,
measurements, and campaign content may change. No authenticated vendor product account was used.

## Correction: the product design system is the primary reference

The earlier study omitted Harvey's own [design-system rebuild](https://www.harvey.ai/blog/rebuilding-harveys-design-system-from-the-ground-up)
and [product design principles](https://www.harvey.ai/blog/how-we-approach-design-at-harvey).
That was a material research gap. Public-site colors and typography did not establish the product's
component architecture, composition or appropriate operational density.

**Documented:** Harvey describes replacing a fragmented Figma/React library containing legacy,
Shadcn and custom components with coordinated semantic tokens and component anatomy. Figma
variables feed a GitHub pull-request sync; Tailwind exposes the resulting roles. Components must
cover states, accessibility and extensible composition. [Harvey's engineering account](https://www.harvey.ai/blog/rebuilding-harveys-design-system-from-the-ground-up).

**Documented:** Its product design account prioritizes domain familiarity, low-friction work and
deliberate structure, illustrated with review tables, workflow building and evidence inspection.
[Harvey's product-design account](https://www.harvey.ai/blog/how-we-approach-design-at-harvey).

**Correction for gitmatter:** the delivered settings screen overuses large rounded containers and
serif section titles, while the review screen lacks a disciplined hierarchy between context,
toolbars, work and inspection. Shared colors and token checks did not repair that composition.
The user rejected the visual result; the earlier completion claim is superseded for visual design.
Keep the requested roundness, but apply it to meaningful controls and surfaces within a coherent,
compact workspace. Review component anatomy, alignment, density and hierarchy against rendered
product references before expanding the implementation again.

Figma's [UI3 design account](https://www.figma.com/blog/our-approach-to-designing-ui3/) is a separate
workspace reference: keep the work central and let navigation/properties support it. That comparison
is our design inference; it is not evidence that Harvey copies Figma's editor layout.

## Evidence and a necessary correction

Keep four labels separate: **documented** (vendor says it), **observed** (measured/rendered public UI),
**inferred** (our interpretation), and **decision** (what gitmatter adopts). Vendor claims about
accuracy or customer outcomes are not independently validated usability evidence.

Historical Legora case studies describe a serif-led identity. Its current public homepage instead
uses Legora Sans Regular/Medium, a green CTA, and a cinematic background. E&W's current case study
credits Stockholm Design Lab with the 2026 identity and E&W with the Framer implementation. That
is stronger evidence for attribution and recency than a gallery entry assigning the whole brand
to the website studio. [E&W project](https://www.ew.studio/work/legora-2026),
[E&W dated news](https://www.ew.studio/news), [current Legora homepage](https://legora.com/).

## Observed visual foundations

| Dimension        | Harvey public homepage                                                 | Legora public homepage                                                | gitmatter decision                                                  |
| ---------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Display          | HarveySerifFont, regular, sampled H1 72px                              | Legora Sans Regular, sampled H1 about 56.25px                         | Newsreader regular for identity; Inter for work                     |
| Operational type | HarveySansFont                                                         | Legora Sans Regular/Medium; loaded Aktiv Grotesk family also observed | One operational family, no per-page font choices                    |
| Surfaces         | Warm near-black body `rgb(15,14,13)`; light content regions            | Warm off-white body `rgb(250,250,249)` plus media overlays            | Explicit light and dark semantic palettes                           |
| CTA geometry     | Sampled demo links 4px corners                                         | Sampled demo links 48px corners                                       | User preference wins: 16px controls, 24px media/dialogs, 28px cards |
| CTA color        | Ink in sampled buttons                                                 | Green `rgb(0,80,50)` in sampled buttons                               | Ink primary; colors reserved for semantic state                     |
| Hero composition | Large statement and product positioning; announcement/navigation above | Full-height campaign media, centered brand and lower statement        | Explain the legal job and show the product immediately              |
| Identity device  | Type scale, contrast, restraint                                        | Motion, bespoke campaign art, rounded green action                    | Traceable source → decision → revision, not decorative AI imagery   |

Sources: direct DOM measurements of [Harvey](https://www.harvey.ai/) and
[Legora](https://legora.com/). Captures are in `output/playwright/design-research/` (local evidence,
not shipped assets). Body background is not the background of every visible region. Measurements
must not be promoted into universal tokens for either private app.

Harvey's [press page](https://www.harvey.ai/press) publishes brand identity assets. Its availability
does not grant a reason to replace gitmatter's identity or bundle proprietary fonts. The older
[Design Extractor observation](https://www.design-extractor.com/gallery/harvey) remains useful as
an earlier public-site sample, not an official component library or a private-app specification.

## Harvey: information architecture and workflow

**Documented:** The getting-started guide describes a sidebar with global search, threads, Vault,
workflows, history, and library. Threads combine requests with chosen documents/knowledge sources;
answers link to source material. The guide warns that Harvey II may differ. The linked newer
Harvey II overview redirected to authentication during this research; that experience is unverified.
[Getting started, updated October 29, 2026](https://help.harvey.ai/articles/getting-started-with-harvey).

**Documented:** Vault connects document organization, structured extraction, shared knowledge,
and use across other surfaces. Its public product page positions review tables beside analysis,
sharing, and permissions. **Inference:** the organizing object survives changes of tool, reducing
context rebuilding. Adopt a stable Matter context; do not replicate the vendor's advertised
capacity numbers or imply gitmatter has equivalent capabilities.
[Vault product](https://www.harvey.ai/platform/vault).

**Documented:** The 2024 Vault article explains typed review columns, including verbatim extraction,
and using Vault material inside Assistant. It is historical evidence for the pattern, not proof of
the current release. **Decision:** a review cell must expose its captured source and type; moving
from table to source must preserve the selected document, question, filter, and row position.
[Vault evolution](https://www.harvey.ai/blog/introducing-the-next-version-of-vault).

**Documented:** Harvey's document-system engineering article describes connected upload, metadata,
review-table, and Assistant interactions and the performance pressures of large collections.
**Decision:** paginated/virtualized data and per-document upload/extraction status are workflow
requirements; an attractive loading shell cannot hide failure or browser exhaustion.
[Document systems](https://www.harvey.ai/blog/scaling-harveys-document-systems-vault-file-upload-and-management).

**Documented:** Workflow enhancements support attached knowledge sources and optional inputs with
preselected fallbacks. **Decision:** make defaults inspectable; distinguish optional information
from legally required context; an unknown legal instruction must remain explicit rather than
being silently inferred to make a form shorter.
[Knowledge/workflow enhancements](https://www.harvey.ai/blog/knowledge-workflows-enhancements).

### What to adopt, adapt, and reject

- Adopt: persistent work context, source inspection adjacent to output, reusable knowledge, compact
  operational controls and clearly separated reading/working typography.
- Adapt: review-table patterns to gitmatter's exact-version source and audited human decisions;
  global navigation to Client → Matter → artifacts rather than vendor tool names.
- Reject: copying headline copy, customer statistics, logos, proprietary fonts, and assuming a
  public marketing screenshot proves an authenticated interaction or permission rule.

## Legora: information architecture and workflow

**Documented:** Tabular Review maps documents to rows and prompts to columns. Cells expand to
reasoning and source material; the page describes formats, filtering, sorting, reusable templates,
review mode, reviewed markers, and locked cells. **Decision:** split scanning from inspecting.
The table answers “where should I look?”; a contextual inspector answers “what supports this?”
A reviewed marker is not legal approval and must not be styled or named as one.
[Tabular Review](https://legora.com/product/tabular-review).

**Documented:** Legora presents workflows as connected tasks that use firm context and existing
ways of working. **Inference:** a workflow is a repeatable path through several artifacts, not a
collection of unrelated settings cards. **Decision:** define each workflow's inputs, saved output,
required human decision, next action, and recovery before arranging its screen.
[Workflows](https://legora.com/product/workflows).

**Documented:** The current Agent page describes a proposed plan, execution across tools, and
work products delivered to the project workspace for review. These are vendor product claims,
not an observed private run. **Decision:** separate “plan proposed”, “running”, “result ready”, and
“approved”; keep cancellation, scope, cost, and uncertainty visible where relevant. Do not adopt
proactive autonomous action as a default for legal changes.
[Agent](https://legora.com/product/agent).

**Documented:** The Word add-in keeps drafting/redlining/review in the document environment and
uses customizable playbooks. **Decision:** match the user's editing context; show the quotation,
rule and proposed language together. In gitmatter, distinguish a tracked draft, reviewed report,
and approved clean output. Never imply that download readiness proves a lawyer inspected Word.
[Word add-in](https://legora.com/product/word-add-in).

### What to adopt, adapt, and reject

- Adopt: expandable evidence, task-specific review modes, reusable question sets, artifact-oriented
  agent output, and explicit human judgment boundaries.
- Adapt: rounded geometry to the user's preferred radius scale; collaboration to named matter
  membership and exact-version approvals; artifact actions to the existing audit engine.
- Reject: campaign glass, cinematic motion and generated abstractions inside work screens;
  borrowing green as a second brand accent; claiming private UI behavior from product copy.

## Synthesis: complementary references, one product

Harvey informs the calm reading frame and persistent workspace. Legora informs structured review
and inspectable evidence. Neither determines the whole screen. Combine those with contextual
creation from Linear, record inspection from Airtable, anchored review from Figma/GitHub, and
check-before-commit from GOV.UK. Preserve a single gitmatter component/token system underneath.

The signature is a trustworthy legal decision loop:

`matter → source + instructions + standard → explicit run → cited finding → human decision → audited revision → correct output`

Every transition needs a reason, current-state evidence, a recovery route, and a stable object
identity. Stylistic restraint cannot compensate for missing or misleading transitions.
