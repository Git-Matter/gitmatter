# Design guardrails and authoring protocol

## Commands

- `vp run design:generate`: generate `apps/web/src/styles/tokens.css` from `design/tokens.json`.
- `vp run design:check`: verify generated output, scan authored source, and check semantic contrast.
- `vp test test/design-policy.test.ts`: validate guard behavior and false-positive boundaries.
- `vp check` and `vp run typecheck`: repository format, lint and type gates.
- `vp test --maxWorkers=2`: full tests where shared-machine contention requires bounded workers.

CI runs `design:check` explicitly before the build. `vp check` alone does not invoke the design
policy. A green source scan does not replace the browser/workflow evidence below.

## Enforcement scope

The checker scans authored `.ts`/`.tsx` files under `apps/web/src`. It excludes the generated router
and the vendored `components/ai-elements` directory. It is a TypeScript AST-based structural check,
not a classifier of whether a human or model created a screen. Class-like tokens in string literals
are conservatively checked, including conditional class definitions. Comments are not inspected.

| ID    | Hard gate                                                                              | What it does not prove                                                         |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| DG001 | Reject clipped decorative text fills                                                   | Every heading has good hierarchy                                               |
| DG002 | Reject the old glass-panel surface                                                     | Every translucent element is an inappropriate overlay                          |
| DG003 | Reject bounce/ping utility decorations                                                 | All motion conveys useful information                                          |
| DG004 | Reject authored automatic video playback and direct playback surfaces without controls | Media provenance, captions, bandwidth or external players                      |
| DG005 | Reject the magic/sparkle icon import, including aliases                                | All icons have accessible names                                                |
| DG006 | Reject arbitrary per-screen shadow utilities                                           | Every use of shared elevation is appropriate                                   |
| DG007 | Reject direct native/router link and Button nesting; allow render-host composition     | Every custom wrapper renders a valid interactive tree                          |
| DG008 | Compare generated CSS with canonical foundation input                                  | Every local value or every document renderer is tokenized                      |
| DG009 | Check configured opaque sRGB text/control pairs in both themes                         | Full rendered contrast, alpha compositing, imagery, charts or WCAG conformance |

Token generation rejects missing theme roles, unsupported format versions, malformed declaration
names and declaration injection. It sorts keys for repeatable output. Tests deliberately exercise
unsafe render nesting, safe render props, aliased imports, conditional classes and dynamic autoplay.

The generated palette now uses a stronger neutral field edge than the older Harvey public-site
sample: input edges must meet our 3:1 configured pair floor. Keep the difference documented rather
than reducing contrast to match a reference.

## Exception protocol

An exception in `design/policy.json` must name an exact file, a known rule, a specific reason and
supporting evidence. Wildcard exceptions and unexplained allowlists are invalid. Unused exceptions
fail the check, so a removed design deviation cannot leave a dormant permission behind. Do not add
an exception merely to make a failing check green; first determine whether the design is necessary
or the structural rule has a demonstrated false positive, then test that boundary.

There are currently no authored-source exceptions. Vendored/generated exclusions are explicit
scope boundaries and must not be described as audited surfaces.

## Before writing a screen

Create or update a brief in `design/workflows` with:

1. Person/role and job, client/matter/artifact identity, entry point, and saved-state prerequisites.
2. Terminal result and the leading decision, including cost, legal and external effects.
3. Primary and secondary reference patterns, cited sources, and rejected alternatives.
4. Layout recipe, shared components, state vocabulary and responsive adaptation.
5. Normal, loading, empty, failed, partial, denied, stale, cancelled and resumed states that apply.
6. Back/close behavior, input preservation, focus destination, and safe recovery.
7. Acceptance tasks and evidence needed to establish the result.

Use [the philosophy](philosophy.md) to resolve competing inspirations. Use the existing audit and
permission APIs; do not invent a local approval or readiness state for aesthetic convenience.

## During implementation

Reuse an existing primitive before creating a wrapper. New shared behavior belongs in a shared UI
component or design-system module; backend contracts and audit logic retain their existing package
owners. Keep physical foundation values in the canonical token file. Prefer semantic roles over
raw hues. Keep primary-action labels literal: “Prepare review”, “Run review”, “Request approval”,
“Approve this revision”, and “Download tracked draft” describe different events.

For each dynamic label, record its source of truth: server fact, current request state, or local
unsaved choice. Local choice must never masquerade as saved legal progress. Keep denial and stale
source explanations at the affected object. Preserve the user's work when refreshing/reconnecting.

## Review gate

Run the commands above, then inspect the screen at desktop and 390px mobile in light/dark themes.
Use keyboard entry/activation, focus-visible, Escape/back, error correction and return to the source.
Verify no horizontal page overflow and no inaccessible hidden primary action. Inspect the actual
rendered surface; an AST rule cannot see every composition or alpha-blended color.

Walk the realistic task with the relevant actor and failure states. Record observed steps and
limitations in `design/acceptance.md`. Any claim about representative-user intuitiveness requires
actual user-study evidence, not a successful internal walkthrough. Do not invent click-time or
completion-rate benchmarks after seeing the result.

A formal practitioner study is optional follow-up work, not a gate on delivering the researched
design system and internally verified workflows. Keep empirical claims separate from design review.
