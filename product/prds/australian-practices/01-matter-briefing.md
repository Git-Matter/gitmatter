# PRD 01: Matter briefing and client correspondence

## Problem and outcome

A sole practitioner receives several documents and needs to understand the file, identify what is missing, and prepare a useful client update. A blank assistant requires the practitioner to design the process repeatedly. Success is a checked briefing and editable correspondence filed under the right matter, with traceable source material.

## First release

Provide shared task definitions for understanding a file, reviewing an agreement, and drafting a client update. Reuse existing assistant, attachment, generation, and audit paths. The briefing requests document-grounded facts, a chronology where supported, missing information, unresolved questions, and possible next steps. Dates are extracted facts requiring confirmation, not automatically calculated legal deadlines. Correspondence is a draft, uses Australian English and the practitioner's saved correspondence preferences, and does not invent advice, events, progress, or authority.

## Requirements

1. Require at least one ready source document and a user-confirmed matter before starting work on client material. Preserve the selected document IDs and task instructions.
2. Ground assertions in actual source documents. Ask for quotations or document references supported by available citation tools; state when a source cannot establish a fact. Never manufacture page numbers.
3. Ask for applicable state/territory and the practitioner's client role/instructions. A selected jurisdiction is context, not proof that an output is legally correct.
4. Separate supported facts, uncertainties, missing documents, and recommendations requiring practitioner assessment.
5. A draft client update can be generated as a matter-linked Word artifact using the existing `generate_docx` path. It must not be sent automatically.
6. Preserve manual prompt editing and existing free-form chat.
7. Record engine/tool actions using existing commits. Do not claim external assistant conversations are completely captured.

## Acceptance

- The same task definition powers guided launch and reusable built-in workflows.
- Source selection excludes documents the user cannot read; failed or processing documents cannot start a guided run.
- A sample briefing identifies a deliberately missing instruction and reports supported dates as unconfirmed.
- A generated document can be opened, edited, downloaded, and traced to its creation commit.
- Missing AI configuration has an actionable settings path; interruption never implies completed work.

## Measurement and limits

Measure total time through practitioner checking and export, missed material issues, unsupported assertions, and repeat use. No claimed time saving until observed. Full autonomous advice, filing, emailing, and source-independent legal research are outside this release. Depends on PRDs 02 and 04 for launch and practice context.
