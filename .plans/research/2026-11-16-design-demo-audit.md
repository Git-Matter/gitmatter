# Demo design audit - 16 November 2026

The current system has a clear legal-workspace identity: quiet operational controls, an unboxed
document/review canvas, a compact navigation frame and a restrained display face for public pages.
Keep that direction. The deadline calls for truthful copy, readable states and predictable controls,
not another visual system.

This is a current source review of the dirty consolidation candidate. It does not re-attest earlier
screenshots or fictional workflow recordings, prove production behavior, establish legal correctness
or certify WCAG conformance. `design/acceptance.md` remains the historical evidence ledger; each
affected workflow needs current replay after the final combined source is known.

## Sources and method

- [Paralect's 21-pattern analysis](https://www.paralect.com/blog/signs-of-ai-slop-in-design),
  reopened on 16 November. Its warning vocabulary informs rows 1-21 below; it is a qualitative
  lens, not a reliable authorship test.
- [Impeccable's official pattern catalog](https://impeccable.style/slop/) and
  [product guidance](https://impeccable.style/), accessed on 16 November. Rows 22-29 extend the
  review with its implementation and interaction checks.
- Installed Impeccable 4.3.1: `/Users/applecakes/.agents/skills/impeccable/SKILL.md`, its
  `reference/audit.md` and `reference/critique.md`. The context command ran once with
  `--target apps/web/src/marketing/Home.tsx`. It resolved the existing PRODUCT/DESIGN files.
  Marketing is Persuade; authenticated workspaces are Operate; documentation is Read.
- [Harvey's published system architecture](https://www.harvey.ai/blog/rebuilding-harveys-design-system-from-the-ground-up)
  supports semantic foundations and consistent component anatomy. It does not establish parity
  with Harvey's private product or justify copying a proprietary library.
- [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md),
  fetched on 16 November, informed named controls, focus, explicit transitions and responsive checks.
- [W3C's explanation of color use](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
  requires a visible alternative where color distinguishes information. An accessible name alone
  does not serve a sighted person who cannot distinguish the colors.
- [W3C's hover/focus content guidance](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
  describes dismissal, persistence and pointer access for overlays triggered this way.

Project context read: `DESIGN.md`, `design/philosophy.md`, `design/research/anti-slop.md`,
`design/acceptance.md`, and the product-frame, first-review and review/output workflow contracts.
The table records current mitigation separately from remaining defects. These are 29 reviewed
patterns, not a claim that 29 independent defects currently exist.

## Pattern inventory

Paths in this table are relative to `apps/web/src` unless stated otherwise. Priorities apply only
to identified remaining work: P1 before public demo, P2 bounded cleanup, Keep intentional behavior.

| #   | Pattern reviewed              | Current evidence and disposition                                                                                                                                                                                        | Priority |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Decorative color stripes      | `marketing/components/WorkIndex.tsx` uses neutral row rules. Keep semantic warnings distinct; no stripe needs adding.                                                                                                   | Keep     |
| 2   | Excessive outlines            | `components/ui/card.tsx:18` supplies flat section grouping; `settings/-components/AiSettings.tsx:84-120` still nests outlined tool tiles inside a tinted box. Flatten that one composition.                             | P2       |
| 3   | Arbitrary italic accents      | `marketing/components/Hero.tsx` uses a solid regular headline; no isolated color/italic word treatment. Preserve the display voice.                                                                                     | Keep     |
| 4   | Repetitive uppercase kickers  | Hero and home sections begin with their useful headings. Resource type metadata remains useful classification rather than a redundant section label.                                                                    | Keep     |
| 5   | Meaningless status markers    | `AiSettings.tsx:98` adds the same bronze dot to each research source. Remove it. The review matrix has meaningful flags but needs visible text, addressed below.                                                        | P1/P2    |
| 6   | Decorative monospace          | `reviews/-components/CellDetailDrawer.tsx` uses monospace for audit operations, and MFA recovery codes use it for copyable identifiers. Keep those functional uses.                                                     | Keep     |
| 7   | Hidden numeric quantities     | `components/FirstReviewGuide.tsx:557-560` renders completed/total/failed findings as digits. Retain concrete counts and distinguish incomplete work.                                                                    | Keep     |
| 8   | Abstract noun-heavy headings  | Home's review promise and clause-history heading name actual work. Keep short actions; do not add category slogans above them.                                                                                          | Keep     |
| 9   | Mixed pictographs             | Authored controls use the installed Lucide family. Preserve literal AI actor labels rather than introducing sparkle or emoji decoration.                                                                                | Keep     |
| 10  | Placeholder evidence          | `marketing/productMedia.ts` and `design/media.json` identify rendered illustrations. Their disclosure must remain visible; these assets are not current live-app proof.                                                 | Keep     |
| 11  | Competing dashboard elements  | `components/AppFrame.tsx:35-43` leaves one work surface; the review inspector supports selected work. Do not add KPI cards, tips or an investor-only dashboard.                                                         | Keep     |
| 12  | Labeled abstract metaphors    | `marketing/components/AuditSpine.tsx` explains change history and presents disclosed example media. Avoid bringing back removed diagram-like promotional components.                                                    | Keep     |
| 13  | Description presented as demo | `marketing/components/ProductVideo.tsx` includes an illustration disclosure. Hero's accompanying description must remain compatible with that origin. Show the real workflow separately during acceptance.              | Keep     |
| 14  | Decorative glass layers       | Product surfaces use opaque semantic backgrounds. `components/ui/dialog.tsx` blurs only the obscured backdrop, which does not determine foreground legibility.                                                          | Keep     |
| 15  | Uniform rounding/elevation    | `design/tokens.json` supplies the requested shadcn radius scale; grids stay unboxed and overlays have distinct elevation. Do not change the foundation again for this deadline.                                         | Keep     |
| 16  | Faint operational text        | Semantic inks and 22 configured theme contrast pairs exist in design policy. This is token evidence, not proof of all rendered combinations or disabled controls.                                                       | Verify   |
| 17  | Idle motion                   | Public videos start paused with controls; the remaining spinning indicators correspond to work in progress. Do not replace status text with motion alone.                                                               | Keep     |
| 18  | Delayed content entrance      | `styles/globals.css` does not hide page content for scroll reveals. Preserve immediate content and test reduced-motion outcomes after final edits.                                                                      | Keep     |
| 19  | Uncheckable assurances        | TrustBand, BringYourOwn, Platform and catalog universally promise zero retention. Security/Privacy qualify provider support. Align the public summaries to those limitations.                                           | P1       |
| 20  | Default gradient styling      | Hero and workspaces use solid semantic ink. `design/tooling/design-policy.ts` rejects clipped decorative text. Keep the existing palette.                                                                               | Keep     |
| 21  | Neon/grid background clutter  | The app uses warm neutral reading surfaces. Table rulings represent data structure; they are not decorative background grids.                                                                                           | Keep     |
| 22  | Nested container hierarchy    | AiSettings has provider group, repeated tool tiles and another icon container. Keep source identity and tool descriptions in a simple divided list.                                                                     | P2       |
| 23  | Status conveyed only by color | `reviews/$id.tsx:905-907` renders a color dot; the button's explicit name omits the flag. Add visible literal flag text and include it in the button name without inventing a risk interpretation.                      | P1       |
| 24  | Repeated icon tiles           | Every research tool in `AiSettings.tsx:110` receives the same Scale tile. It does not distinguish tools. Remove the repeated icon container with the nested tile cleanup.                                               | P2       |
| 25  | Broad property transitions    | `MarketingLayout.tsx:35` and `Resources.tsx:99,124` use `transition-all` for arrows. Restrict to opacity/transform so unrelated properties cannot animate.                                                              | P2       |
| 26  | Hover overlay dismissal       | `MarketingLayout.tsx:99-124` opens a large CSS-only panel on focus/hover without Escape dismissal. Replace this with explicit bounded dismissal while retaining link navigation and pointer access. Confirm in browser. | P1       |
| 27  | Equal feature weights         | Home already varies task index, clause-history explanation and trust summary. A grid of security facts can remain scannable; it need not become six decorative cards.                                                   | Keep     |
| 28  | Template typography changes   | Inter serves dense controls and Newsreader serves brand/legal text. Both are established project choices. Changing fonts because they appear on a warning list would undermine consistency.                             | Keep     |
| 29  | Palette replacement by reflex | Warm monochrome is an explicit product choice for legal reading. Preserve it; judge actual contrast and hierarchy rather than replacing beige with another fashionable default.                                         | Keep     |

## Verified fixes for the demo candidate

1. **P1 - Capability/privacy copy must agree with its detailed policy.**
   `marketing/components/TrustBand.tsx:13-14`, `BringYourOwn.tsx:13`, `marketing/Platform.tsx:27,188`
   and `marketing/catalog.ts:245,604` make broader retention claims than
   `marketing/Security.tsx:42` and `marketing/Privacy.tsx:71-75`. Describe provider controls and
   supported handling, while acknowledging that provider/account terms determine retention.
   This is an internal contradiction visible in source; no provider-policy promise was inferred.

2. **P1 - Review flags need visible words.**
   `routes/_auth/reviews/$id.tsx:902-907` currently places the flag only on the dot's accessible
   label. The containing button supplies its own name. Display the contract's actual flag value
   and include it in the button name. Do not silently reinterpret a green flag as legal approval.
   Confirm that the fixed-width row still fits and full findings remain available in the inspector.

3. **P1 - Public navigation must dismiss predictably.**
   `marketing/MarketingLayout.tsx:99-124` has no dismissal handler. The full-width panel can cover
   the underlying page. Add Escape dismissal without changing the destination links or requiring
   a new library; confirm focus, re-entry and pointer movement before claiming conformance.

4. **P2 - Flatten research-tool presentation.**
   `routes/_auth/settings/-components/AiSettings.tsx:84-120` repeats a border, colored dot and Scale
   tile for ordinary text. Preserve source names, counts, labels, summaries and current empty/error
   handling; use proximity and dividers to reduce visual work.

5. **P2 - Name animated properties.**
   Replace the three marketing arrow `transition-all` utilities with explicit opacity/transform
   transitions. Keep the motion brief and nonessential.

Separate factual finding outside this agent's bounded edit set: `marketing/Security.tsx:34-35`
says MFA is unavailable and contains a duplicated "not". Reconcile it against the actual MFA setup,
challenge and recovery implementation; SSO needs its own verified status. This is a copy-truth
finding, not an authorization to change authentication behavior.

## Verification and remaining proof

The source composition is coherent, with the specific defects above. A numeric accessibility or
usability score would overstate this source-only review, so none is assigned. Current browser
reflow, actual text contrast, keyboard behavior and workflow outcomes remain unverified by this
audit. Earlier fixture results are explicitly historical.

The consolidation owner should run the Impeccable detector once after UI edits settle, interpret
each finding against the task, and attach its exact result. No detector was run by this agent to
avoid scanning an intermediate snapshot repeatedly. The context loader reported legacy PRODUCT
metadata; it was ignored for mode selection, and no unrelated metadata migration was performed.

Required finishing sequence: bounded fixes; current desktop/mobile and relevant light/dark/focus
checks; affected first-review, review/output, settings and navigation replays; design policy;
repository format/lint/type/tests/build gates; authenticated staging workflow checks; then exact
release verification. Public example media and fictional fixture results cannot stand in for the
authenticated application workflow.

## Remediation checkpoint

The bounded copy, research-list and marketing-navigation changes are now implemented. Marketing
summaries qualify provider retention; Security describes available authenticator/backup-code MFA
separately from unavailable SSO; the tools panel uses source groups and a definition list; public
navigation exposes open state, closes on Escape/navigation and returns keyboard focus to its
trigger. Arrows transition only opacity and the CSS translate property. The workflow owner is
applying the review flag text alongside the separate query-state changes.

Focused formatting and `git diff --check` pass. This checkpoint is source evidence only: current
browser replay and combined repository gates remain the consolidation owner's next step.
