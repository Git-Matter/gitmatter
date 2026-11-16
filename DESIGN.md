---
name: gitmatter
description: Warm monochrome legal workspace with a serif display voice and flat, compact controls
reference: https://www.design-extractor.com/gallery/harvey
---

# gitmatter design system

The document and its decisions lead. Navigation, forms, and metadata provide a quiet frame.
The product implementation follows Harvey's published [system architecture](https://www.harvey.ai/blog/rebuilding-harveys-design-system-from-the-ground-up)
and [design principles](https://www.harvey.ai/blog/how-we-approach-design-at-harvey): intent-based
tokens, consistent component anatomy, contextual composition and complete interaction states.
This remains gitmatter's own implementation.

`AppFrame` owns a compact navigation rail and an unboxed work surface. `PageHeader` uses operational
sans typography; `PageShell` separates context from scrolling work. Settings use flat sections and
stable section navigation; review defaults to a table with an independently scrolling inspector.
See [the product frame contract](design/workflows/product-frame.md). Use shadcn’s default radius scale,
with a 0.625rem base and derived component radii.

Review the live components at `/design-system` on the development server. The page is excluded
from production use and marked noindex. Its controls only affect preview state. The implementation
lives in `apps/web/src/design-system/DesignSystem.tsx` and imports the actual product primitives.

## Research, philosophy and enforcement

The deeper [design program](design/README.md) separates documented vendor behavior, public visual
observations, inference, and gitmatter decisions. Read the [philosophy](design/philosophy.md),
[Harvey/Legora research](design/research/harvey-legora.md), [SaaS workflow composition](design/research/saas-patterns.md),
[anti-slop taxonomy](design/research/anti-slop.md), and [guardrails](design/guardrails.md).
Workflow acceptance is tracked explicitly in [the ledger](design/acceptance.md).

Foundation values and shared recipes are owned by `design/tokens.json`. Run `vp run design:generate`
to update the generated CSS, then `vp run design:check`. The design policy checks known structural
risks and token contrast; it does not certify taste, intuitive workflows, or complete accessibility.

## Sources and implementation

- [Harvey website extraction](https://www.design-extractor.com/gallery/harvey), reviewed November 11, 2026. The extraction reports uncertainty around responsive breakpoints, motion, and some recipes.
- [Paralect’s design audit](https://www.paralect.com/blog/signs-of-ai-slop-in-design), used to remove
  repeated decoration, unnecessary boxes, low-contrast type, and autonomous motion.
- `apps/web/src/styles/globals.css` owns shadcn semantic mappings and base document styles.
- `design/tokens.json` owns light/dark colors, typography, spacing, status, shape and elevation;
  `apps/web/src/styles/tokens.css` is its generated output.
- `apps/web/src/components/ui` owns shared controls. Change primitives here before adding local styles.

## Color

Use semantic utilities instead of literal colors in product components. The light palette follows
measured reference values; the dark theme and legal status colors are gitmatter adaptations.

| Role                | Light     | Dark      | Utility / purpose                               |
| ------------------- | --------- | --------- | ----------------------------------------------- |
| Page                | `#FAFAF9` | `#0F0E0D` | `bg-background`                                 |
| Surface             | `#FFFFFF` | `#1F1D1A` | `bg-card`, `bg-popover`                         |
| Muted surface       | `#F2F1F0` | `#292723` | `bg-muted`, `bg-secondary`                      |
| Primary ink         | `#0F0E0D` | `#FAFAF9` | `text-foreground`                               |
| Secondary ink       | `#33312C` | `#E7E5E1` | `text-ink-secondary`                            |
| Metadata            | `#706D66` | `#B4B0A8` | `text-muted-foreground`                         |
| Grid rule           | `#E5E4E1` | `#373531` | `border-grid-line`, decorative table separation |
| Hairline            | `#CCCAC6` | `#44413A` | `border-border`                                 |
| Field edge          | `#8F8B85` | `#8F8B85` | `border-input`                                  |
| Focus               | `#005FCC` | `#99C8FF` | `ring-ring`, visible outline                    |
| Approved / addition | `#285D40` | `#A6D2B3` | `text-success` on `bg-success-surface`          |
| Needs attention     | `#795010` | `#E6C681` | `text-warning` on `bg-warning-surface`          |
| Error / deletion    | `#A12D25` | `#F2978E` | `text-destructive` on `bg-destructive-surface`  |

Keep text at full opacity; use a different ink token for secondary hierarchy. Body text must meet
4.5:1 on its actual surface, and focus indicators must stay visible in both themes. Status color
always comes with text. Do not use a colored dot as the only state indicator.

`text-bronze` and `bg-bronze-tint` remain compatibility aliases for older audit components; they
now resolve to neutral foreground and muted surface. New components should use semantic names.
The sidebar uses the muted paper tint.
Do not add a decorative brand hue, gradient text, neon edges, background grids, or glows.

## Typography

Newsreader Variable is the display and legal quotation face. Inter Variable is the operational
face. Both are bundled through Fontsource and available under the SIL Open Font License. Harvey’s
proprietary fonts are not included. `font-heading` and `font-serif` map to Newsreader; `font-sans`
maps to Inter. Keep font optical sizing enabled.

| Role             | Size          | Weight | Leading | Usage                                 |
| ---------------- | ------------- | ------ | ------- | ------------------------------------- |
| Display          | fluid 44–72px | 400    | 1.05    | `text-display`, display heading       |
| Section          | fluid 32–48px | 400    | 1.1     | `text-section`, major sections        |
| App page         | 18–20px       | 500    | 1.2     | Sans PageHeader and object context    |
| App section      | 14px          | 600    | 1.4     | Sans operational group identity       |
| UI title         | 20px          | 500    | 1.3     | `text-title`, operational heading     |
| Lead             | 20px          | 400    | 1.5     | `text-lead`, introductions            |
| Body             | 16px          | 400    | 1.5     | Long explanations and reading pages   |
| UI body          | 14px          | 400    | 1.5     | Tables, forms, dense workspaces       |
| Label            | 14px          | 500    | 1.3     | Controls, navigation, field labels    |
| Compact metadata | 12px          | 400    | 1.3     | Audit details beside readable content |

Use sentence case. Omit a section label when the heading already identifies it. Display type
stays regular; controls never use serif. Use short task-oriented headings and digits for concrete
counts. Keep legal text emphasis from source documents intact. Monospace belongs to code, hashes,
and copyable identifiers, not navigation or ordinary inputs.

## Space and layout

Use a 4px rhythm: 4, 8, 16, 24, 32, 64, and 128px. Existing semantic spacing remains compatible:
field = 6px, stack = 16px, section = 40px, page = 32px. Avoid arbitrary spacer elements.

`page-container` caps content at 1280px with fluid 24–48px gutters. Reading content stays within
60–70 characters. Tables may scroll horizontally inside their own container. Pages must not overflow.
Use the existing project breakpoints (sm/md/lg), rather than claiming they were measured at Harvey.

The app frame has its own density: `navigation` = 224px, `chrome` = 56px minimum and `work` = 20px.
These roles are generated from the canonical foundations. `Card variant="section"` groups settings with proximity and a divider; `surface` is reserved
for standalone contained content. Operational titles stay sans; legal reading and brand identity
can use serif.

Group by proximity first. Use a horizontal rule only where it makes scanning easier. Avoid boxes
inside boxes, identical card grids for unrelated content, and a metric card for every number.
An app page should make its immediate work and required decisions apparent before secondary tools.
Use tabs, menus, and inline expansion for supporting content.

## Shape and elevation

- Use the [shadcn default scale](https://ui.shadcn.com/docs/theming#radius-scale), derived from a
  0.625rem base. Fields and controls are 8px (`rounded-md`); small elements are 6px (`rounded-sm`).
- Dialogs use the 10px base (`rounded-lg`); cards use 14px (`rounded-xl`).
- This replaces the earlier custom 16/24/28px treatment at the user’s request.
- Circular people and truly circular icon/media controls may use `rounded-full`.
- Pages, cards, inputs, and buttons cast no shadow.
- Menus and popovers use `shadow-float`; dialogs use `shadow-modal`.
- No frosted cards or glass toolbars. Overlays use an opaque readable surface. A scrim may blur
  the obscured page; blur must never be required to read foreground text.

## Controls and state

### Buttons

Use the shared Button. Default height is 36px; compact is 32px, extra-small 24px, and large 48px.
Icon buttons keep a visible focus indicator and an accessible name. Compact table controls are a
density exception.
Primary is ink with paper text. Outline uses a hairline edge. Ghost belongs in toolbars; links
remain clearly identifiable. One primary action per local group. Destructive actions use the
semantic error treatment. Hover changes tone; it does not bounce or shift the layout.

Links styled as buttons must use `nativeButton={false}` with `render={<a ... />}` or the router
Link, so interactive elements are never nested. Disabled controls keep their meaning in text.
Use native button semantics for actual actions.

### Fields

Use Input, Textarea, Select, Checkbox, Switch, and their visible Label. Fields use a 1px input
border, default 8px corners, and no shadow. Hover darkens the edge; keyboard focus uses the focus token.
Describe errors next to the field, connect them with `aria-describedby`, and set `aria-invalid`.
Placeholders give an example; they do not replace labels. Errors cannot rely on color alone.

### Navigation

The sidebar is flat muted paper. Active rows use a neutral tint, ink text, and `aria-current`.
Do not add a second dot to repeat the selected state. Line tabs mark their active label with an
underline. Menus reveal supporting actions. Mobile navigation has a 44px hit area.

### Tables, lists, and documents

Tables use readable column headings, horizontal separators, and a muted hover or selected row.
Keep number alignment consistent; use tabular figures for comparable numeric values. Content
stays unboxed when spacing suffices. Form boundaries and selectable items may keep their edges.

### Audit and diff

Keep author, reason, revision, and the exact language together. Legal quotations can use the
serif. Operational metadata stays sans. Additions and removals use semantic tinted surfaces,
with `ins` / `del` or equivalent textual meaning. An AI author uses a literal label or bot icon,
not sparkles. Preserve the underlying commit and permission paths during visual changes.

### Dialogs and feedback

Use Dialog’s existing accessible focus trap, title, description, Escape behavior, and focus return.
Dialog surfaces are opaque and distinct from the backdrop. Popovers and menus are the only other
surfaces with elevation. Toasts should confirm completed work without becoming permanent banners.
Loading UI describes the work in words. Empty states explain the next action. State badges are
reserved for actual status, not promotion or decoration.

## Motion and media

Use 100–200ms transitions for hover, focus, and opening UI. Content is visible immediately; no
scroll-triggered appearance effects. Respect `prefers-reduced-motion` globally. Loading indicators
may move while work is running. Do not animate idle content.

Authored video playback starts paused and has controls. Prefer `preload="metadata"` when appropriate.

## Review against the 21-pattern audit

| Pattern                      | gitmatter rule                                                          |
| ---------------------------- | ----------------------------------------------------------------------- |
| Colored card stripes         | Reserve colored edges for genuine errors or attention states.           |
| Border around every block    | Space first; rules for scannable rows; fields retain useful boundaries. |
| Colored italic accent        | No decorative mixed-face accent words.                                  |
| Repeated uppercase labels    | Omit redundant kickers; useful categories remain ordinary metadata.     |
| Meaningless markers          | State labels describe an actual condition.                              |
| Monospace UI                 | Restrict to code, identifiers, and appropriate numeric data.            |
| Spelled-out numbers          | Use digits for counts and steps.                                        |
| Noun-stack titles            | Name the task or result briefly.                                        |
| Emoji icons                  | Use the installed Lucide set where an icon helps.                       |
| Placeholder media            | Use real captures; user initials remain a legitimate account fallback.  |
| Overstuffed screens          | Lead with the work; disclose supporting controls.                       |
| Labeled abstract diagrams    | Show the actual product or explain it directly.                         |
| Text pretending to be a demo | Use product footage or a screenshot.                                    |
| Glass cards                  | Flat opaque surfaces.                                                   |
| Same shape and shadow        | Small controls, larger media, elevation only for overlays.              |
| Faint text                   | Full-opacity semantic ink with measured contrast.                       |
| Idle motion                  | Nothing moves without a state change or user playback.                  |
| Heavy appear effects         | Render content immediately.                                             |
| Uncheckable proof            | No invented customer identities, metrics, or certifications.            |
| Purple gradients             | Warm monochrome, flat fills.                                            |
| Dark neon and grids          | Plain dark paper and readable ink.                                      |

## Adding a screen

Start with PageShell, PageHeader, and the existing primitives. Choose the primary task, then the
supporting information. Reuse tokens before adding values. Check both themes, a narrow mobile
viewport, keyboard focus, and reduced motion. Use the development specimen to inspect shared
changes. Keep custom styles local only when a shared component cannot express the behavior.

## Validation for this revision

Historical verification on November 11, 2026: `vp check`, `vp run typecheck`, all 354 tests across
63 files, and the cloud production build passed. Development specimen checks covered desktop and
390px mobile widths, light/dark contrast, reduced motion, field errors, dialog focus, Escape, and
focus return. `/design-system` returned 404 in production, with specimen content absent from
production JS. Signed-in end-to-end flows and deployment were not exercised.

The project keeps pnpm’s virtual store local (`enableGlobalVirtualStore: false` in `pnpm-workspace.yaml`).
The machine’s global-store setting caused Vite+ native-binding and editor peer-dependency resolution
errors; a local reinstall resolved them. Final checks use the ordinary project commands without
runtime path overrides. `vp env doctor` passed. Postgres was started with the project’s existing
Compose service for integration tests. No schema changes were required.

## Review table recipe

The review route defaults to the Vault-inspired document-by-question matrix. Use the canonical
`review-row` (44px cell control) and `review-header` (36px) spacing roles, compact filename objects
and thin grid separators. The fixed virtual-row estimate is 45px, including the 1px ruling. Keep the document column pinned from medium widths; the entire table scrolls horizontally
on narrow screens. Question text is single-line at scan time; the cell inspector supplies complete
findings, explanations, quotations and decisions. Citation counts are not human verification.

Desktop inspection is a nonmodal 24rem region, with modal inspection on narrow screens. Document is
an explicit secondary representation. Both share revision-keyed drafts and URL selection. Retain the
user's rounded surface/control geometry; do not copy the published illustration's sharper corners.

## Standard component ownership

Use the installed shadcn primitives for general interface behavior. `PageHeader` composes Breadcrumb;
review view navigation composes Tabs with retained TabsContent; document and mobile finding overlays
compose one Sheet implementation; status indicators use Badge variants. The virtualized DataTable
continues to compose shadcn Table with TanStack data/virtualization. Client, matter, source identity,
revision-keyed drafts and audited actions belong to the application layer.

Workspace frames and data grids are not cards. They have square edges, no outer rounded perimeter,
and a distinct light `grid-line` role for decorative rulings. Controls, dialogs and standalone cards use the default
shadcn radius scale. Horizontal data overflow stays inside the table, with
visible previous/next-column controls and keyboard scrolling. Column headings can wrap; full
finding text remains available in the inspector.

## Application-wide primitive composition

Generic interface behavior has one shared implementation across the product:

| Concern                       | Shared primitive                | Application boundary                                                                                                                                      |
| ----------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation                    | Sidebar, SidebarMenu, Sheet     | AppFrame preserves the saved desktop preference; mobile navigation restores focus and closes on selection. Editor shortcuts take precedence while typing. |
| List/matter view filters      | ToggleGroup                     | ToolbarTabs is a controlled adapter; selected filters do not run work.                                                                                    |
| Form and search input         | Input, InputGroup, NativeSelect | NativeSelect retains browser/mobile selection semantics and existing change handlers. File uploads retain native file inputs.                             |
| Selection and acknowledgement | Checkbox                        | TanStack selection receives booleans; revision review and unknown-outcome acknowledgements retain their explicit gates.                                   |
| Status and people             | Badge, Avatar                   | Existing status/actor/role labels remain authoritative; extraction readiness is not legal approval.                                                       |
| Empty/error states            | Empty, Button                   | Retry and first actions retain their original scope.                                                                                                      |
| Activity                      | Sheet on narrow screens         | Existing activity/source identity remains in the application layer.                                                                                       |

Do not rebuild these patterns in route components. Retain domain compositions for document rendering,
version identity, audit actions, revision-keyed drafts, streaming conversations and virtualized tables.
Native file inputs and semantic disclosure elements do not need replacement with new widgets.

List pages have no negative viewport-margin compensation. The shared pager wraps at narrow widths;
body scrolling remains within each workspace. The canonical navigation width roles apply to the
shadcn Sidebar rather than a second custom rail implementation.

## Workspace recovery and interaction consistency

Use [the workspace recovery contract](design/workflows/workspace-recovery.md) for collection
loading/failure/denial, pending confirmations, unfinished forms, keyboard object actions, named
dialogs, persistent field errors, return navigation, primary-action labels and mixed selection.
CollectionPanel, FormFeedback, ConfirmDialog and the shared exit/view-state hooks own these patterns.
The [nine-issue replay](design/evidence/ux-nine.json) records current client behavior with fictional
API outcomes. Default shadcn radii remain unchanged.

## Input and action feedback

Follow [the input and action feedback contract](design/workflows/action-feedback.md). FieldDescription
makes prerequisites visible and associated with inputs. Confirmed actions use one persistent,
session-scoped ActionFeedback receipt; new edits and failed requests never imply success. Workflow
autosave retains its local status. Shared buttons, toggles and tabs react subtly while pressed without
moving layout, with transitions removed for reduced motion. Current UI evidence is recorded separately
in [the feedback replay](design/evidence/feedback.json).
