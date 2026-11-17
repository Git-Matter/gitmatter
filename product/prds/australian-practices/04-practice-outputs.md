# PRD 04: Australian practice context and practitioner review

## Problem and outcome

General practitioners need locally appropriate terminology and correspondence, and an accurate distinction between AI-generated work and their own verification. An agent accepting an edit is not evidence that a solicitor reviewed it.

## First release

Add Australian state/territory options, a saved practice correspondence profile, and a human-only review record bound to an exact document version/content state. Surface these controls in Settings and document detail. Keep the existing Word-generation pipeline and include preferences in guided task context.

## Requirements

1. Add AU-ACT, AU-NSW, AU-NT, AU-QLD, AU-SA, AU-TAS, AU-VIC, and AU-WA to the shared registry. Preserve existing jurisdictions and inheritance. The Australian task default is AU without changing existing non-Australian users' choices.
2. A tenant-scoped practice profile stores a display name, plain-text correspondence header, preferred sign-off, default Australian jurisdiction, and correspondence instructions. Explicitly limit field lengths. Reuse tenant admin/owner permission rules for edits and record an attributable audit event without logging field content.
3. Profiles are preferences, never verified legal identities. Text headers support letterhead wording; image/logo uploads are deferred.
4. A human reviewer confirms a stated scope for the exact expected document state. Authorise matter/document editor access, reject agent actors, and reject stale expected state or unresolved edits. Bind review to version plus relevant content fingerprint/head state; changes must not inherit a current review.
5. Persist review via the existing commit path with reviewer identity, timestamp, scope, and reviewed state. Expose current versus stale status and review history. No client-supplied reviewer identity may override the authenticated actor.
6. A read/export path includes the review record with clear wording about what was checked. It must not imply legal correctness, certification, filing, or approval by another practitioner.
7. Use Australian English and readable, unambiguous dates in new flows. Generated correspondence follows the saved header and sign-off when requested.

## Acceptance

- Tenant isolation, profile validation, permissions, agent rejection, stale-state rejection, and invalidation after edits have meaningful tests.
- Two concurrent changes cannot leave a review claiming a document state that was never reviewed. Review comparison/write uses the existing transaction/locking approach.
- A browser user saves preferences, opens a ready document, records review, reloads, changes the document, and sees the old review become stale.
- Review and generated correspondence are downloadable and readable in Word-compatible output.
- Schema changes include generated, checked migrations; builds and required checks pass.

## Measurement and limits

Measure correction/formatting effort and practitioner use of review records. Court-specific declarations, full legal letterhead systems, automatic reminders, and legally approved precedent content are excluded. Existing agent edit decisions can remain attributed agent actions; human review is a separate boundary.
