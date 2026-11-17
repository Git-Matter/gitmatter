# Workflow validation with legal users

Status: **OPTIONAL FOLLOW-UP — NOT RUN. No participant observations exist in this packet.** Internal browser checks are
recorded separately in [the acceptance ledger](acceptance.md). This packet makes the optional
comprehension check concrete; it is not a substitute for the people doing it. Per the user's
November 13 clarification, this study is not a blocker for the requested design delivery.

## Questions and participants

Can legal practitioners identify the right matter and source, understand the next consequential
action, inspect its evidence, and recover without losing their work? Do the terms “prepared”,
“running”, “reviewed” and “approved” communicate different facts?

Start with 3–5 actual or likely users spanning matter preparation, legal review and administration.
That is a proposed first round, not a statistical sample or a universal usability benchmark. Include
someone who normally uses keyboard or assistive technology when available. Record roles and relevant
experience under anonymous IDs. A product developer's walkthrough is not practitioner evidence.

The method follows [GOV.UK's moderated usability guidance](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing):
observe believable tasks, use neutral prompts, and record assistance separately. Fictional data and
isolated components reduce contextual realism; include that limitation in the findings.

## Setup before the session

Use only the fictional local fixtures. Do not enter client documents, real passwords, API keys or
mail addresses. No recruitment messages are sent by this packet. Agree how notes will be used;
recordings are optional and require the participant's agreement. Anonymous text notes are enough.

- First review and findings: start the fixture using the [replay guide](../test/acceptance/design-workflows/README.md).
  At `http://127.0.0.1:4286/`, select the scenario and surface described below before handing over.
- Assistant: start the [assistant fixture](../test/acceptance/assistant-ui-fixture/vite.config.ts)
  and open the stated local URL. It supplies fictional metadata/streams and blocks remote inference.
- Templates: use the [tracked loopback harness](../test/acceptance/template-library/design-acceptance.md),
  with the fictional original files and injected personas. This is real local test persistence;
  prepare a fresh test run rather than using someone else's test tenant.
- Settings/sign-out: use the headed `study-setup.js` session described in the replay guide. Opening
  port 4300 in a different browser does not inherit intercepted requests; its APIs deliberately fail.

Keep the fixture disclosure visible. Its scenario/persona controls are moderator tools, outside the
task. Do not count those controls as product navigation. Use desktop first; repeat one relevant
task at 390px and one with keyboard input. Record which viewport, theme and input method was used.
Reference the current `design/evidence/*.json` source hashes in the session notes. An older build's
observations cannot establish acceptance of a later interaction change.

## Participant introduction

“This prototype contains invented legal records. We want to see where the interface makes your
work clear or confusing. Please describe what you expect as you go. You may stop or ask a question
at any time. If something does not work, that is useful feedback about the interface.”

Do not name a button, tell the person where to click, or explain the expected distinction before
they encounter it. If help is needed, record the point of confusion and exact help before continuing.

## Tasks to read one at a time

| ID  | Participant task                                                                                                                                                                    | Moderator setup / expected evidence (do not read this column)                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | A new contract needs a review. Get it ready with the client's instruction that confidentiality survives termination. Explain what would happen next, without starting the analysis. | Port 4286, “First review — ready to prepare”, “Guided first review”. Can find the current prerequisite, identify matter/source/standard, capture instructions, distinguish preparation from execution; execution counter remains zero. |
| U2  | A colleague flagged the liability clause. Find the language behind that finding, compare it with the suggested change, then return to your unfinished explanation of the decision.  | Port 4286, “Partial findings”, “Contract review”. Can connect the correct finding to captured quotation/version, understand proposed vs recorded decisions, and retain input across comparison/source inspection.                      |
| U3  | The document changed after this review. Explain whether you would rely on the current finding, and show how you would get back to current evidence.                                 | Port 4286, “Stale source”. Recognizes captured vs current version and does not treat old review as current approval. Record participant's reasoning, not legal correctness of the fictional clause.                                    |
| U4  | Prepare the three-step assistant workflow. Start it when you are satisfied, then stop it during a response. Explain what has happened and what you would do next.                   | `http://127.0.0.1:4299/assistant?scenario=workflow-stop`. Preparation sends nothing, Start is explicit, Stop pauses future steps, and partial output is not mistaken for a completed/rolled-back transaction.                          |
| U5  | You drafted a question for this matter. Inspect the attached source and return to your question without losing it.                                                                  | Use the matter assistant route from `assistant-context.js`, in the “new” scenario. Full matter/document scope and message remain identifiable; mobile pane switching preserves the draft.                                              |
| U6  | A reusable NDA has a newer draft, but your colleague needs the approved version. Find the appropriate original and explain which version you are sharing.                           | Fresh template harness; owner/editor prepares private next revision, sales reader inspects approved original. Does not confuse private draft, approved version and archive state.                                                      |
| U7  | Change your display name, look at provider configuration, then come back to your name. Decide to stay when you consider leaving.                                                    | Headed settings study session. Draft survives tab/history and Keep; no credentials are entered or saved. Then attempt sign-out and Keep; sign-out count stays zero.                                                                    |
| U8  | Your sign-out attempt did not receive confirmation. Explain what you know and what you would do next.                                                                               | Headed study session, explicitly discard the fictional name when appropriate. Sign-out is intercepted with failure. Participant distinguishes uncertainty from success and finds retry/return without assuming session state.          |

Choose tasks matching each person's actual role; do not require a reader to perform an admin's job.
Across the round cover every row. Reset fictional state between participants; do not turn earlier
participant work into another person's starting state. No real model, mail, credential or session
operation is part of these tasks.

## Decisions defined before observing results

For each task record: completed without guidance, completed with guidance, not completed, or not
attempted. Also record the first intended action, source/version comprehension, unexpected behavior,
recovery, lost input, and the person's explanation of the result. Time is descriptive only; no
performance or success-rate benchmark is inferred from this small first round.

Any loss of entered work, unintended consequential request, wrong source/version selection, or
confusion that treats uncertain/partial output as approved work is a critical finding. Resolve it
and rerun the affected task with a fresh participant or clearly mark the retest as learned behavior.
Do not average critical failures away or call coaching an unassisted completion. Repeated inability
to find the next action requires an interaction/copy revision before a broad intuitiveness claim.

After each task ask: “What do you think happened?”, “What information did you use?”, and “Was there
anything you expected to find that you could not?” Save preference questions for after task behavior.

## Observation form

Copy this form for each participant; do not fill it with simulated outcomes.

| Field                                                       | Observation  |
| ----------------------------------------------------------- | ------------ |
| Anonymous participant ID / role / experience                | NOT RECORDED |
| Date / fixture / relevant source hashes                     | NOT RECORDED |
| Viewport / theme / input / assistive technology             | NOT RECORDED |
| Task ID / starting scenario                                 | NOT RECORDED |
| First intended action                                       | NOT OBSERVED |
| Completion / assistance given                               | NOT OBSERVED |
| Matter, source and revision understanding                   | NOT OBSERVED |
| Preparation, run, stop, decision and approval understanding | NOT OBSERVED |
| Confusion / recovery / lost work / unintended action        | NOT OBSERVED |
| Participant explanation (verbatim if agreed)                | NOT OBSERVED |
| Finding severity / proposed repair / retest                 | NOT ASSESSED |

Return anonymous task notes, including unsuccessful attempts. Existing legal-user feedback is useful
if its task, version, role, observed outcome and assistance are known. Generic praise, a screenshot,
or an AI acting as a pretend lawyer does not close this evidence gap.
