# Anti-slop taxonomy and prevention

“AI slop” is an informal quality judgment, not a reliable authorship detector. Human-made interfaces
can have the same defects. A font, gradient, rounded button or glass effect alone is not proof of low
quality. The problem is unmotivated repetition, weak information architecture, misleading content,
and unverified behavior. Assess the user's task and consequence, not whether a screen resembles a trend.

## The visual warning set

The linked [Paralect article](https://www.paralect.com/blog/signs-of-ai-slop-in-design) provides a
useful 21-pattern starting lens. Compressed mapping to gitmatter decisions:

| Warning cluster                                     | Decision                                                      |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Decorative edges and excessive containers           | Group with space; use boundaries to clarify interaction/state |
| Arbitrary type accents, kickers and markers         | Establish hierarchy once; make labels earn their place        |
| Technical styling without technical content         | Reserve monospace for code and copyable identifiers           |
| Buried quantities and abstract headings             | Surface digits and name the user's task                       |
| Mismatched pictographs and placeholder proof        | Use one icon language and genuine product evidence            |
| Congested screens and labeled metaphors             | Remove non-actions; explain the result directly               |
| Descriptions posing as demonstrations               | Show a real task or label an illustration honestly            |
| Blur, uniform rounding/elevation and faint copy     | Differentiate roles and preserve readable contrast            |
| Idle motion and delayed content appearance          | Respond to state; render content immediately                  |
| Unverifiable persuasion, default gradients and neon | Use checkable claims and a deliberate identity                |

The deeper taxonomy below is gitmatter's synthesis from product inspection, the
[NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/),
[HAX interaction guidance](https://www.microsoft.com/en-us/haxtoolkit/library/),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/), and the research on
[contextual SaaS workflows](saas-patterns.md). It is not a claim that any single source enumerates
all these defects, or that a static linter can recognize all of them.

## Actionable defect taxonomy

| Category      | Trait / failure                                       | Replacement                                            | Verification                           |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| Visual        | Repeated decorative stripe                            | State treatment only where attention is needed         | Review purpose; semantic state tokens  |
| Visual        | A box around every paragraph                          | Proximity, headings and occasional rules               | Review grouping and nesting            |
| Visual        | Accent-colored italic word in every heading           | Single readable heading voice                          | Source scan + visual review            |
| Visual        | Label repeating the title                             | Remove repetition; keep meaningful metadata            | Read heading hierarchy aloud           |
| Visual        | Promotional badge/dot without a decision              | Plain text or actual lifecycle state                   | Ask what changes for the user          |
| Visual        | Identical treatment for controls and content          | Role-specific shape/elevation                          | Component/variant review               |
| Visual        | Arbitrary shadow, glow or static glass                | Shared surface and overlay scale                       | DG002 / DG006                          |
| Visual        | Default rainbow/gradient as identity                  | Approved semantic palette                              | Token ownership + manual review        |
| Visual        | Every block animates before becoming readable         | Immediate content; short response motion               | Reduced-motion and fast-scroll checks  |
| Visual        | Idle bouncing, pinging or looping                     | Actual work state or explicit playback                 | DG003 / DG004                          |
| Content       | Unverifiable customers, performance or live status    | Source-linked proof or omission                        | Claims ledger and product facts        |
| Content       | Placeholder avatars/logos marketed as real people     | Genuine approved assets; label examples                | Media provenance review                |
| Content       | Noun-heavy title and generic filler                   | Verb, object and specific consequence                  | Screen brief and comprehension review  |
| Content       | Emoji standing in for an icon system                  | Shared icons or text                                   | Component import review                |
| Content       | Synthetic screenshot passed off as a working product  | Real capture or explicit illustration label            | Capture provenance                     |
| Architecture  | Dashboard assembled from available widgets            | Only the questions the page must answer                | Task-to-element mapping                |
| Architecture  | Same object represented differently in each tool      | Stable identity, vocabulary and parent context         | Cross-route walkthrough                |
| Architecture  | Supporting configuration crowds out the work          | Contextual disclosures and scoped settings             | First-action review                    |
| Architecture  | A separate page for each micro-decision               | Group coherent input; persist return context           | Navigation and back-path audit         |
| Architecture  | All stages expanded, including blocked/completed work | Current task focus with inspectable summary            | Fresh/resumed/state walkthrough        |
| Interaction   | Dead or decorative controls                           | Working action, navigation or honest disabled reason   | Browser interaction                    |
| Interaction   | Icon action with no discoverable name                 | Accessible name and visible help where necessary       | Accessibility tree and keyboard        |
| Interaction   | Multiple indistinguishable primary actions            | Local action hierarchy and clear consequences          | Per-region action review               |
| Interaction   | Link containing a button or the reverse               | One composed interactive host                          | DG007 + rendered DOM audit             |
| Interaction   | Closing loses edits or source context                 | Dirty-work protection and explicit return target       | Close/back/reopen scenario             |
| Interaction   | Action enabled beyond current authority               | Explain role and request access appropriately          | Permission matrix and backend checks   |
| State         | Spinner suggests work that never started              | Status from the durable job/request                    | API/state-to-label trace               |
| State         | Fake precision in progress or confidence              | Actual counts, uncertainty and affected units          | State provenance review                |
| State         | Partial failure presented as a completed whole        | Per-unit status and scoped recovery                    | Partial/failed scenario                |
| State         | Automatic retry can duplicate paid/legal work         | Read status; idempotent explicit retry when safe       | Fault/reconnect scenario               |
| State         | Optimistic approval before server commit              | Pending → confirmed or rejected                        | Mutation/commit trace                  |
| AI trust      | Finding and source are separated by several contexts  | Adjacent captured quotation/version                    | Inspect/return walkthrough             |
| AI trust      | Citation points at a changed document as if exact     | Identify captured vs current source explicitly         | Stale-source scenario                  |
| AI trust      | Generated conclusion looks like human approval        | Named decision and distinct lifecycle labels           | Actor/state review                     |
| AI trust      | Hidden provider scope, cost or processing consequence | Clear scope and pre-run review                         | Prepare/run boundary test              |
| AI trust      | No correction or dismissal path                       | Edit instructions, reject, cancel, retry safely        | HAX-based scenario review              |
| Accessibility | Soft gray at unreadable opacity                       | Semantic ink at measured contrast                      | DG009 + rendered contrast              |
| Accessibility | Focus disappears or is trapped incorrectly            | Visible focus and predictable return                   | Keyboard, dialog and nested-pane audit |
| Accessibility | Small target, fixed width or horizontal page overflow | Adequate hit area; single-pane mobile adaptation       | 390px/reflow/zoom review               |
| Accessibility | Error is color-only or detached from its input        | Named field error and summary when useful              | Submit/correct loop                    |
| Performance   | Decorative media loads/decodes everywhere             | Static thumbnails and user playback                    | Network/playback inspection            |
| Governance    | New values/components invented for every screen       | Canonical foundations and reused variants              | DG008 + code review                    |
| Governance    | Exceptions grow into a hidden second design system    | Exact scope, reason, evidence, stale-exception failure | Policy audit                           |
| Governance    | Passing screenshots used to claim full usability      | Task and state evidence; representative users          | Acceptance ledger                      |

## How to use the taxonomy

Start with the job. Map each visible element to orientation, evidence, an input, an action, or
necessary feedback. Remove elements that do none of those jobs. Then walk the task through its
normal and failure paths. Apply visual scrutiny after understanding that behavior.

Hard automated gates cover only specific code and token defects. Contextual traits such as
hierarchy, misleading proof, cognitive load, and source comprehension require a reviewer. A risk
matrix and a task study are more useful than an invented “slop score”. A quiet palette cannot
compensate for a wrong source, lost edit, hidden consequence, or unclear next step.

### Legitimate exceptions

- Legal quotations may contain italics and emphasis from the original document.
- User avatars can have initials as a fallback; they are not fabricated customer proof.
- Syntax, commit hashes, recovery codes and identifiers may use monospace.
- Tables, selected items, form fields, maps and canvases may need boundaries or grids.
- State palettes and categorical data may need several colors; keep a legend and text meaning.
- A loading indicator can move while work is actually running. User-controlled media can animate.
- A brand campaign may intentionally use rich motion or atmospheric art. That is not evidence that
  the same treatment belongs in a legal-review workspace; Legora's current homepage illustrates
  this distinction.
