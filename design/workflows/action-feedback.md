# Input guidance and action feedback

A person should understand what an action needs, whether it was sent and which outcome was
confirmed. Feedback must not mark legal work approved, a review complete, an email delivered or
an uncertain provider run successful.

## Shared rules

- Use shadcn FieldDescription for requirements and next steps. Associate guidance with the control
  using aria-describedby; retain the error ID as well when both apply. Explain unavailable actions
  beside the form, including empty or unchanged input, required scope, invalid limits, stale metadata,
  document processing and minimum input requirements. Keep optional fields explicit.
- Persistent guidance supplements labels. Do not depend on disappearing placeholders or tooltips
  attached to disabled controls. Keep field/server errors separate from guidance and retain input
  through failure.
- Confirmed success uses notifySuccess and the shared ActionFeedback region. It composes shadcn Alert
  and Button, announces politely without taking focus, names its original app section, and stays
  visible until explicitly dismissed or replaced by a later success. “Last successful action” is a
  historical result, not a claim that new input is saved. Errors never publish success.
- Closing a successful modal or changing route does not erase its receipt. Dismissal returns focus
  to the current page heading. Only one receipt is visible, rather than an accumulating stack.
- Receipt state belongs to the authenticated workspace session and lives only in memory. It resets
  across session identities or a full reload. Do not include input values, keys, codes or document
  content in a receipt. Standalone surfaces without the workspace region retain Sonner fallback.
- Use local persistent Saved / Saving / Not saved status for frequent workflow autosave, rather than
  publishing a new workspace receipt for each edit. Only the latest confirmed revision may say Saved.
- Button, Toggle and TabsTrigger provide a subtle brightness change while pressed, with no scale,
  position change or layout movement. Existing hover/focus/selected states remain distinct. Disabled
  controls do not receive the pressed treatment; reduced motion removes the transition.

## Research composition

[W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
informs the polite live region without a focus change. [GOV.UK text-input guidance](https://design-system.service.gov.uk/components/text-input/)
informs visible labels and hints that remain available after typing. The [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
inform clear action prerequisites, error recovery, stronger interaction states and reduced motion.
The implementation uses the existing [shadcn FieldDescription](https://ui.shadcn.com/docs/components/field)
and Alert anatomy rather than introducing a new control system.

## Acceptance and limits

[The feedback replay](../evidence/feedback.json) exercises visible associated guidance before typing,
a failed save with retained input and no success, confirmed save, persistence beyond six seconds and
route navigation, explicit dismissal/focus return, creation feedback, persistent autosave status,
pressed feedback without layout shift, reduced motion, mobile containment and no durable receipt
storage. It also repeats the nine-issue, authoring and app-wide regressions. Relevant source and
script hashes are checked before and after execution.

Normal, failed, stale, denied, pending, kept/discarded and resumed paths are covered across those
scripts. A fixture response is not a real server write, authorization decision or credential change.
These are production UI components with fictional identities/data and intercepted API outcomes;
no live auth, provider call, legal quality, participant study or deployment proof is established.
Direct screenshots show current client states. Restore the sole main app on port 4280 after replay.
