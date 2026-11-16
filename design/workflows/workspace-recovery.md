# Workspace recovery, forms and table actions

Apply these rules across Clients, Matters, Documents, Reviews, Workflows, Library and Settings.
The existing Client → Matter → artifact identity, server authorization and audited mutation paths
remain authoritative. This work changes interaction behavior; a local selection or navigation does
not create an approval, completed review or paid run.

## Research and implementation

| Finding                                                           | Shared pattern and application                                                                                                                                                                                                                           | Research                                                                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failed queries looked empty; old filter results stayed actionable | CollectionPanel distinguishes loading, refresh, error and denial. Previous results are inert during a new-view request, including search debounce. A denied response removes private content. Retry stays beside the failure.                            | [NN/g: visibility of system status](https://www.nngroup.com/articles/visibility-system-status/), [Carbon: data tables](https://carbondesignsystem.com/components/data-table/usage/) |
| Pending destructive confirmations could disappear                 | ConfirmDialog synchronously latches dispatch, awaits the returned promise, blocks dismissal and route exit while pending, and retains a persistent error for retry. Closing a dialog is never described as cancelling a sent request.                    | [NN/g: user control](https://www.nngroup.com/articles/user-control-and-freedom/), [WAI: modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)                      |
| Forms lost unfinished input                                       | useDraftExit protects modal close, route exit and unload. AppFrame aggregates active forms into one decision. Keep retains input; explicit discard clears it; confirmed success resolves the guard. Background metadata cannot reseed over an open edit. | [NN/g: user control](https://www.nngroup.com/articles/user-control-and-freedom/)                                                                                                    |
| Object rows required a pointer                                    | Object names are native links for navigation or Buttons for inspection. Keyboard activation, browser Back and focus return are exercised, while row clicking remains a convenience.                                                                      | [WCAG: Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)                                                                                                         |
| Workflow dialogs lacked names                                     | WorkflowModal and review creation have DialogTitle. The prompt editor exposes a named multiline textbox.                                                                                                                                                 | [WAI: modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)                                                                                                        |
| Failures disappeared with toasts                                  | FormFeedback persists beside the affected form. Required-field errors use aria-invalid and aria-describedby. Inputs survive failed saves; retry remains deliberate.                                                                                      | [GOV.UK: error summary](https://design-system.service.gov.uk/components/error-summary/)                                                                                             |
| Returning lost the working view                                   | Session-scoped, in-memory view state restores filters, page, table scroll and the activated object. Search terms are not copied into durable browser storage. Table position is keyed to its exact view.                                                 | [NN/g: user control](https://www.nngroup.com/articles/user-control-and-freedom/)                                                                                                    |
| Primary actions were ambiguous icons                              | List headers name New client, New matter, Upload documents, New review and New workflow. Compact secondary icons retain accessible names.                                                                                                                | [NN/g: icon usability](https://www.nngroup.com/articles/icon-usability/)                                                                                                            |
| Partial selection looked unchecked                                | Shared Checkbox represents mixed selection, and table headers explicitly select the current page. Cross-page selection names the matching-record count separately.                                                                                       | [Carbon: data tables](https://carbondesignsystem.com/components/data-table/usage/)                                                                                                  |

Workflow metadata autosave also retains an unsaved guard through debounce, pending writes and
failure. Writes are serialized; only the latest revision can announce Saved. Opening a prompt editor
must send no save. Tiptap hydration uses setContent with emitUpdate false. A failed save preserves
the latest input and offers an explicit retry. These are metadata writes through the existing API,
not a new route around the audit engine.

Use the current default shadcn geometry and existing primitives. CollectionPanel, FormFeedback and
the guard hooks compose common behavior; do not create new local versions of these patterns.

## Recorded checks and boundaries

[The current replay](../evidence/ux-nine.json) includes the nine regression scenarios, authoring
recovery, six list routes at desktop/mobile and Settings captures. Relevant source and script hashes
are captured before and after the replay. Earlier workflow records retain their original evidence.

- Normal and resumed: keyboard object inspection, focus return, saved filter/page/scroll and explicit
  retry followed by a confirmed fictional save.
- Error and partial: initial 503, cached refresh failure, retained form input, mixed selection,
  failed autosave and an older save response while a newer edit is pending.
- Denied and stale: 403 removes private rows; held filtering makes old results inert; metadata
  refresh preserves local editing.
- Cancelled: Keep and explicit Discard are tested for unfinished input. Pending destructive requests
  and saves cannot be dismissed as though they were cancelled.

These are real client components and native browser history with fictional identity/data and
intercepted API outcomes. No real credential, provider call, deletion, server mutation authorization,
legal-quality, deployment, cross-browser native-unload prompt or representative-user study is proved.
Explicit scenario resets suppress unload only to clear fictional test setup. Screenshots are direct
browser captures, not modified images. The main app is restored to port 4280 after the fixture stops.
