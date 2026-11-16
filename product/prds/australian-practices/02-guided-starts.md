# PRD 02: Guided starting actions and fictional sample

## Problem and outcome

A general practitioner should not have to learn prompt engineering before seeing useful work. The first screen should explain the three supported jobs and make their required inputs clear.

## First release

Replace the empty assistant's single blank entry point with three optional starting actions: **Help me understand this file**, **Review this agreement**, and **Draft a client update**. Each action opens a focused input surface using existing UI primitives. Keep the composer available.

## Requirements

1. Show the purpose and expected output of each task in plain language.
2. Collect the matter, ready source documents, applicable jurisdiction, and short task-specific instructions. Let the practitioner inspect the prepared prompt before explicitly starting.
3. Reuse the assistant seed mechanism with a versioned payload; never launch a billable model call merely because someone opens a task or sample.
4. Supply a small fictional Australian matter bundle. Label the client, matter, documents, and launch action as sample/fictional. Create actual matter-linked source artifacts through existing authorised core functions so provenance is inspectable.
5. Prevent accidental duplicate sample creation on retries and repeated button clicks. Sample creation must not overwrite user work.
6. Present empty, loading, error, and processing states. Keyboard users can complete the flow, cancel, and return focus predictably.
7. Do not store document content, client names, or draft advice in analytics events.

## Acceptance

- Each card produces the correct editable instructions and attaches only the user's selected ready documents.
- Cancelling does not send a prompt or create a chat.
- Creating the fictional sample requires an explicit action; reopening it does not create duplicate clients/matters/documents.
- A user from another tenant cannot access the sample through guessed IDs.
- Task launch works from a new session; an old/malformed seed fails safely.
- Existing normal chat, attachment upload, workflow launch, and matter navigation still work.

## Measurement and limits

Track first task started, source opened for checking, exported artifact, and return with another matter, using metadata only. A sample illustrates workflow, not legal correctness or practitioner endorsement. Visual acceptance requires actual browser evidence; fixtures are not production proof.
