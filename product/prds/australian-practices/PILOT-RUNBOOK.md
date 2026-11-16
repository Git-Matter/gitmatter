# Australian practitioner pilot runbook

Owner: product lead. Duration: four weeks per practitioner. Recruitment target: five Australian sole practitioners or general practices. Status: materials prepared; no participants recruited or outcomes recorded by this work.

The pilot tests whether guided, source-first work reduces the practitioner's total effort while preserving their ability to check, correct, and retain the result. It does not test whether a model can replace professional judgment.

## Before recruitment

- Complete the authenticated browser and Word-export acceptance gates in the PRDs. Record the tested revision and environment in DELIVERY.md. Source review and synthetic test output do not establish hosted acceptance.
- Confirm support capacity, service scope, the proposed AUD price, GST treatment, and separate provider costs. Record which terms a participant will receive. Do not imply a free or discounted plan before that decision.
- Retain deployment and provider evidence for the offered processing route. Distinguish document storage from extracted text, accounts, logs, backups, monitoring, and AI-provider processing.
- Prepare an access-controlled participant log, a product issue tracker, and a contact for security/authorisation problems. Keep research identifiers separate from contact information.
- Start with fictional documents. Any later client-material use requires an appropriate documented decision and authorisation by the practitioner; avoid receiving client documents through recruitment email or calendar descriptions.
- An expression of interest is not participation consent, permission to use client files, a meeting booking, or consent to marketing. Obtain each separately where required.

## Participant screening

The public pilot enquiry flow was removed on 17 November 2026. This internal runbook does not authorise outreach, invitations, meeting creation, or enrolment.

Screen for:

1. Australian jurisdiction and practice role/size.
2. A recurring document-bundle, agreement-review, or client-correspondence task.
3. Whether the practitioner personally checks and approves the resulting work.
4. Their existing Word/document tools and approved AI account, if any.
5. Ability to participate in four short weekly sessions and attempt a second task.

Collect only role/size, state/territory, generic task type, current tools, and preferred contact details during initial screening. Do not request client names, matter details, document attachments, passwords, or API keys. Arrange credentials through designated product settings only.

## Baseline interview (week one)

Explain the purpose, scope, confidentiality handling, and how observations will be retained. Confirm recording/observation arrangements before starting. Use a fictional file or an appropriately authorised and minimised example.

Ask:

- What triggers this task, and what must be produced before you can move on?
- Show the existing steps from receiving the documents to a checked deliverable.
- What do you search for, verify, and correct? What would constitute a material miss?
- Where does the finished document go? Who else, if anyone, needs it?
- Which parts of Word formatting, numbering, tables, or cross-references must survive?
- What stops you using your current AI tools for this task?
- Who decides whether a new tool is acceptable, and what evidence do they need?
- What costs are you paying now, and what would a new charge need to justify?

Observe one comparable task. Record active preparation, checking, correction, export/formatting, and assistance time separately. Record external waiting time separately. Do not record invented billable hours, multiply estimated time into a marketing saving, or count generation speed alone as practitioner time saved.

## Setup and fictional sample (week two)

1. Review AI execution path, account configuration, current agreements, and document-storage limits.
2. Save practice correspondence preferences and applicable jurisdiction.
3. Explicitly create/open the fictional sample; confirm every sample artifact is recognisable as fictional.
4. Open each guided action, inspect its prepared instructions, and explicitly start the chosen task. Opening an action must not itself incur a model call.
5. Check source links and quotations. Compare facts, missing information, uncertainties, and extracted dates with the sample documents.
6. Generate and open a Word draft. Inspect headers, paragraphs, tables, numbering, special characters, and download behaviour.
7. Explain practitioner review scope, version binding, and the distinction between an AI action and human review. Change a reviewed document and confirm the previous review becomes stale.
8. Record assistance required and any point where the practitioner cannot tell what to do next.

## Recurring workflow (week three)

Confirm authorisation and configuration before each use of actual client material. The practitioner remains responsible for checking the result. Do not direct them to rely on an unverified output.

Choose the same task type as the baseline and capture the same time categories. Have the practitioner inspect source claims, missing information, proposed edits, and formatting. Ask them to complete a second appropriate task or matter during the week, recording whether they returned without a reminder.

Classify every problem:

| Category                         | Examples                                                                                      | Response                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Confidentiality or authorisation | Wrong tenant access; unapproved external processing; accidental sensitive logging             | Stop affected testing immediately, contain the issue, follow incident procedures, and require revalidation before resuming. |
| Material output error            | Unsupported fact or authority; material omitted term; false deadline; incorrect client advice | Do not use the output. Record a minimised issue, correct the cause, and revalidate the workflow.                            |
| Review integrity                 | Agent recorded as human reviewer; stale review presented as current                           | Stop the affected review path and correct it before further reliance.                                                       |
| Word handoff                     | Lost numbering, broken table, altered cross-reference, invalid file                           | Retain a synthetic/minimised reproduction and fix before describing that document type as supported.                        |
| Usability or setup               | Unclear next action; excessive prompt editing; repeated assistance                            | Record the exact step, assess frequency and effort, and prioritise by observed impact.                                      |

## Decision interview (week four)

- Review a completed deliverable with the practitioner, including source checking and corrections.
- Compare total active time with the baseline, recording differences in task complexity and familiarity.
- Establish whether the second task was completed and what triggered the return.
- Present the actual proposed AUD price, GST treatment, scope, terms, and separate provider charges. Record the answer verbatim or as an agreed summary; do not infer willingness to pay from positive feedback.
- Ask what would prevent continued use and which one change would most improve the workflow.
- Confirm whether they choose to stop, continue subject to a specific change, or enter a separately agreed paid continuation.
- Agree data return/deletion and any follow-up arrangements. Separate permission is needed for a named case study, testimonial, or public quote.

## Weekly evidence template

Store one sheet per participant under an access-controlled research location. The repository and analytics must not contain client content or participant contact details.

| Field                                                             | Observation |
| ----------------------------------------------------------------- | ----------- |
| Participant research ID                                           |             |
| Week/date, observer, tested environment/revision                  |             |
| Generic task type and complexity                                  |             |
| Material authorised/configuration verified                        |             |
| Preparation time                                                  |             |
| Source-checking time                                              |             |
| Correction time                                                   |             |
| Export/formatting time                                            |             |
| Assistance time and nature                                        |             |
| External waiting time (separate)                                  |             |
| Supported/unsupported assertions checked                          |             |
| Missed material issue count and severity                          |             |
| Extracted dates verified                                          |             |
| Word handoff pass/fail and synthetic reproduction reference       |             |
| Practitioner review and stale-state check                         |             |
| Second task/matter attempted/completed; spontaneous or prompted   |             |
| Quote shown: AUD amount, GST treatment, provider-cost explanation |             |
| Explicit willingness to continue and conditions                   |             |
| Open issues and next action/owner                                 |             |

An empty cell is unobserved, not zero, success, or consent. No measures are populated by this implementation.

## Predetermined decision gates

These are proposed pilot decision rules, not evidence of demand or externally validated benchmarks:

- **Stop the affected test:** any unresolved material confidentiality, authorisation, review-integrity, or output issue. Remediate and repeat the relevant checks before resuming.
- **Change and retest:** the practitioner cannot reliably check sources, complete the Word handoff, or repeat the task without excessive assistance; or total checked effort is no better for the observed use case. Record the specific obstacle instead of averaging it away.
- **Consider a restricted paid continuation:** no unresolved material failures; at least three of five practitioners complete a second task; at least three explicitly choose continuation at the quoted price; and the completed deliverables pass checking and Word handoff for the tested task types. Record results individually and document exceptions. Any smaller cohort requires an explicit new decision.
- **Broader release:** requires separate operational readiness, support, legal/commercial terms, and normal deployment acceptance. A successful five-person pilot alone does not substantiate universal time-saving, legal-correctness, or market-leadership claims.

## Final pilot readout

Report recruited/completed/withdrawn counts, task types, environments, total checked time distributions with limitations, material failures and remediation, Word outcomes, assistance, second-use behaviour, quoted prices, and explicit continuation decisions. Distinguish observed results from hypotheses and record which PRD requirements need revision. Publish only claims supported by the evidence and authorised for public use.
