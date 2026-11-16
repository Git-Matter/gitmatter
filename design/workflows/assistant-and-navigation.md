# Ask, inspect and resume a legal conversation

Person: a permitted workspace or matter member. Object: the selected conversation, matter and
source documents. Terminal result: an inspectable answer, attributed pending artifact change, or an
explicit stopped/failed response with retained context. Opening a page or prepared workflow is not
consent to buy inference.

Reference composition: Harvey's source selection and Legora's artifact delivery; Claude's
[project context](https://support.claude.com/en/articles/9517075-what-are-projects); Slack's
[unsent-message distinction](https://slack.com/help/articles/201457107-Send-and-read-messages-in-Slack);
Linear's [context-preserving drafts](https://linear.app/docs/creating-issues); HAX correction/control.
These are public documented patterns, not private-app interaction observations.

## State contract

1. Show the actual workspace/matter/conversation context before sending. A failed saved-chat fetch
   offers loading/error/retry; it must not silently become a new conversation. A mismatched matter
   cannot inherit another matter's conversation context.
2. Compose a message with an explicit accessible name, selected configured model, attachments and
   source scope. Enter and the send button use the same gates; Shift+Enter inserts a line break and
   IME composition does not send. Processing and failed attachments block dispatch. Model setup
   opens separately to retain the draft; a metadata failure retries in place. Optional reasoning
   and research controls live under message options. Planned inputs stay read-only during a run.
3. A workflow seed prepares its first message and exposes the ordered steps. An explicit start runs
   them; only a confirmed completed response advances the queue. Failure, truncated transport and
   Stop pause execution. A view change never authorizes an extra step.
4. Stream curated activity, answer text and inspectable source/artifact references. A partial answer
   is not a saved result, an approval or a completed workflow. Stop does not undo recorded changes.
5. Preserve original request text and attachment identity in the open view when a response fails. Keep incomplete
   output visible and make another attempt deliberate; never automatically retry uncertain paid work.
6. Returning to a saved chat uses its server identity. A transient refresh can preserve local input
   while blocking new dispatch; an authoritative denial removes the private view.

## Acceptance

Prepared workflow causes zero sends until start; completed steps advance in order; error, truncated
stream and cancellation stop the queue. Exercise empty/unavailable models, processing files, keyboard
and IME, partial answer, current/failed/denied resume and matter mismatch. Repeat at 390px with the
actual composer and saved-conversation routes. Fixture responses are not live inference or auth proof.

## Current walkthrough and limits

The [assistant replay](../evidence/assistant.json) exercises actual components and client routing with
fictional metadata, extraction status and streams. It covers the model/configuration gates, IME and
multiline input, failed/processing files, explicit preparation/start, sequential success, interrupted
queues, truncated responses, retained request context and follow-up drafts, and deliberate route exits.

Saved-chat checks cover initial failure/retry, continuing the same identity, a fresh history on return,
503 retention/recovery, 403 removal, a mismatched matter, and redirecting a matter-owned conversation
into its own workspace. Cache removal is limited to inactive conversations; active observers remain
registered for refresh and access checks, using [query filters](https://tanstack.com/query/latest/docs/framework/react/guides/filters).
The first mount waits for current history; background refresh does not overwrite a local draft.

Earlier tool-call inputs are presented as records with unavailable outcomes, never synthesized into
completed activity. Curated activity shows recorded status/time rather than an invented thinking timer.
On narrow screens it opens in a named modal and returns focus to its opener. Matter workspaces retain
their panes, expose separate Conversation/Files/Document views, show the selected source before send,
and provide keyboard resizing on wide screens. Reader/unknown membership does not expose uploads.

No live inference, server cancellation/usage settlement, credential operations, authentication,
native-unload prompt behavior, legal-quality or representative-user study is established. Explicit
fixture resets suppress native unload prompts; production client route guards remain exercised.

The mobile breadcrumb geometry is checked for overlap. The current matter and selected document are
also exposed at the composer, including as its accessible description; header truncation never becomes
the only way to identify the request scope.
