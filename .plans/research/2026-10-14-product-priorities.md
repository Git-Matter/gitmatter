# Product priorities for the NDA workflow

Research date: 2026-10-14. Source baseline: `dev` at `99acd833`.
Audience: small-to-mid law firms from `PRODUCT.md`; commercial NDA work is the first-use hypothesis.

The most worthwhile additions help a lawyer set the correct review position, exchange a usable
Word document, and get another person to complete the next decision. Guided first-review setup can
make the existing capabilities easier to buy and use. Broader legal research, a native Word add-in
and a large integration catalogue should follow observed demand.

The first priority remains proving the existing workflow on a deployed application and real Word
files. Source implementation, a synthetic browser fixture and a passing test suite are different
from lawyer acceptance. The staging registry failure is recorded in the
[integration evidence](../evidence/2026-10-14-dev-integration-and-staging.md).

## Evidence behind the priorities

The SRA's independent research, published 19 June 2025, surveyed 138 England and Wales firms with
four or fewer partners and turnover below £400,000, alongside interviews and a workshop. Firms
reported cost, uncertainty about value and compliance, limited time/technical knowledge, and setup
and integration friction. Its approximately 3% survey response and narrow firm definition limit
generalisation. This supports a short first-review journey, rather than assuming small firms want
more configuration. [SRA findings](https://www.sra.org.uk/sra/research-publications/sole-practitioners-small-firms-technology-innovation/),
[methods](https://contact.sra.org.uk/globalassets/documents/sra/research/small-firms-technology-and-innovation-thinks-report.pdf).

The ABA's 2024 survey, administered October–December 2024 and reported in 2025, had 512 US attorneys in private practice
in its online-research section. Accuracy was a concern for 74.7%, reliability for 56.3%, and privacy
and security for 47.2%; saving time was the leading perceived benefit. This concerns legal AI
generally, not NDA review specifically. It supports measuring correct, usable completed work
alongside speed. [ABA TechReport](https://www.americanbar.org/groups/law_practice/resources/tech-report/2024/2024-artificial-intelligence-techreport/).

Australian research published by Agile on 17 January 2026 surveyed 515 legal professionals during
December 2025–January 2026. Only 25% of respondents in firms with 1–10 employees reported clear AI
policies, and 11% reported using AI without approval. Recruitment, weighting and subgroup sample
sizes are not sufficiently described in the public article. The useful inference is that governance
must be understandable to a firm without dedicated IT staff. [Publisher's findings](https://agilemarketintelligence.com.au/news/over-half-of-australian-law-firms-now-have-clear-ai-policies-in-place).

MyCase's vendor-produced 2025 survey of 2,800+ legal professionals reports that integration with
trusted software and understanding firm workflows influenced investment in legal-specific AI.
The public article gives limited methodological detail. This is directional support for fitting the
existing workflow, not evidence that a particular connector will sell. [Survey article hosted by the ABA](https://www.americanbar.org/groups/law_practice/resources/law-technology-today/2025/the-legal-industry-report-2025/).

Thomson Reuters' 2026 legal report uses 736 law-firm responses across 46 countries and references
203 corporate legal respondents, collected March–April 2026. It describes client pressure to
demonstrate AI-enabled value. This vendor-sponsored, self-reported global study is not a small-firm
NDA benchmark. It strengthens the case for a pilot scorecard showing usable outputs and verification
effort, without assuming an AI feature creates ROI. [2026 report and methodology](https://www.thomsonreuters.com/en/institute/future-of-professionals-2026/report-legal).

The Law Society of South Australia's guidance, updated 30 June 2026, emphasises independent
verification, professional responsibility and understanding data handling. It supports clear human
decisions and accurate processing information. It does not establish a universal requirement to
collect client consent for every AI interaction. [Professional guidance](https://www.lawsocietysa.asn.au/site/site/for-legal-practitioners/resource-hubs/aihub/aiguidance.aspx).

The surveys use different populations and definitions; their adoption rates should not be
combined. The South Australian guidance establishes professional considerations rather than buyer
demand. None establishes willingness to pay for gitmatter. The priorities below combine these
signals with a source audit and official competitor workflows; they remain product judgments.

## What the market already offers

| Workflow                      | Current official examples                                                                                                                                                                                                                                         | Implication                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Word drafting and review      | [LegalOn](https://us-direct.legalontech.com/word), [Legora](https://legora.com/product/word-add-in), [Gavel](https://www.gavel.io/)                                                                                                                               | Usable Word output belongs in the core acceptance bar. A native add-in is a separate investment. |
| Returned-document comparison  | [Spellbook Compare Documents](https://help.spellbook.legal/en/articles/11322178-compare-documents) describes reference comparison, untracked changes and navigation between differences.                                                                          | A negotiation normally continues after the first export. Explicit revision lineage is valuable.  |
| Fast firm playbook setup      | [Spellbook Create Playbooks](https://help.spellbook.legal/en/articles/11327030-create-playbooks) supports starters, importing standards, rules and fallbacks.                                                                                                     | A first firm should not need to become a prompt engineer to start.                               |
| Party and negotiating context | [Ironclad's review-agent guide](https://support.ironcladapp.com/hc/en-us/articles/34188767294359-Use-Contract-Review-Agent-Redlining-with-Playbooks-and-Precedents) includes represented party, paper source and negotiating stance. Its feature is Early Access. | Capture the user's actual instructions before preparing the review.                              |
| Review handoff                | [Spellbook Overview](https://help.spellbook.legal/en/articles/9926203-spellbook-overview) includes review summaries; [Gavel sharing](https://exechelp.gavel.io/article/14-exec-workspaces-sharing) supports read-only/edit access.                                | A review needs a clear output and next owner. This does not require a full client portal.        |

Vendor documentation describes advertised behaviour; it is not independent evidence of accuracy,
usage or buyer preference. Audit logs and AI agents are also present in competitors. Gitmatter's
strongest positioning hypothesis is one attributable history across human decisions and a firm's
chosen external agents, with exact versions and shared enforcement. Validate whether firms value
that difference enough to pay for it.

## Ranked decisions

Effort is relative to the current repository, not a delivery estimate: S is a bounded existing-flow
extension; M crosses contracts/core/UI/MCP or introduces a shared model; L is a substantial document
or external integration workflow. Confidence describes the recommendation, not measured ROI.

| Priority | Addition or acceptance work                  | Value and current gap                                                                                                                             | Effort                                   | Decision                                                                          |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| 0        | Verify the deployed NDA and Word loop        | Existing source covers most first-pass work; authenticated, real Word and pilot proof remain open.                                                | Acceptance work                          | Essential before expanding the product.                                           |
| 1        | Explicit review position and assumptions     | Setup selects documents/playbook, but the immutable review does not capture represented party, disclosure role, purpose or governing-law context. | M                                        | Add next. High correctness value; medium demand confidence.                       |
| 2        | Guided first successful review               | Region, provider/agent settings, approvals, privacy evidence and budgets exist across separate screens.                                           | S–M                                      | Add a small guided path. Strong small-firm adoption rationale.                    |
| 3        | Incoming Word inspection and revision triage | Versions and accepted baselines exist; returned tracked/untracked changes have no dedicated reconciliation journey.                               | S–M initially; L for full reconciliation | Add honest inspection first; validate a complete second-round workflow in pilots. |
| 4        | Named reviewer handoff                       | Escalation, membership and an attention overview exist; finding assignment/due date and approval notifications are missing.                       | M                                        | Add a narrow audited handoff after setup. Validate notification needs.            |
| 5        | Partner/client decision brief                | A source report exists; a deliberately selected audience-specific deliverable is a different job.                                                 | S–M                                      | Prototype using the report model; build if pilots use it.                         |
| 6        | One existing-workflow integration            | General integration demand exists; the target firms' actual tools and repeated friction are unknown.                                              | M–L                                      | Choose one from pilot evidence. Defer a marketplace and native Word add-in.       |

### 1 Capture review position

Ask which party the firm advises and whether its client receives information, discloses it, or does
both. Capture mutual versus unilateral NDA structure separately: a mutual agreement does not imply
equal negotiating interests. Include business purpose, governing-law context and the approved firm
standard. Offer known matter defaults for confirmation; preserve an explicit unknown state rather
than silently guessing.

Store these instructions in the immutable review snapshot and show them beside findings and in the
report. A later instruction change starts a new review. Existing client/matter clause exceptions
and approved playbooks should supply standards, rather than creating another clause system.

Source evidence: `ContractReviewSetup.tsx` submits documents, matter and playbook; `runPlaybook` and
`packages/contracts/src/review.ts` capture source/rules but no explicit review-position object.
Matter jurisdiction already exists. Extend contracts, core preparation, request fingerprints,
reports and UI/MCP together. Preserve legacy snapshots without inventing past instructions.

Acceptance: the same NDA can be reviewed from receiving and disclosing positions; the captured
instructions are visible and cannot drift when the matter or defaults change. A lawyer validates
that differences follow the approved playbook and instructions.

### 2 Make the first review easy

Guide the firm through a fictional sample, its approved NDA standard, one actual document, findings,
human decisions and Word output. Explain the selected execution route: application model calls or
the firm's connected agent. Show whose key/subscription is used and where spend controls apply,
without exposing credentials. A starter standard remains a draft until an eligible human firm
administrator approves it.

Reuse existing onboarding, `OrganizationCard`, `AiSettings`, `DataPrivacyCard` and `JobControls`.
Consolidate status and links rather than rebuilding permissions, privacy exports or budgets. Show
document-storage region separately from database/backups and model-processing information.

Provider retention policy is distinct from gitmatter's retained documents/audit history and from an
external agent client's policy. Spellbook's September 2026 terms illustrate this distinction:
third-party model retention/training restrictions coexist with its own defined QA retention.
[Spellbook terms section 4.1](https://spellbook.com/legal/terms-of-service).
Publish only verified operating claims; configuration evidence is not a compliance certification.

Acceptance: an observed new lawyer completes the first review without developer coaching and can
explain who processes the document, what remains stored, and who must approve changes. Record the
steps that required help before adding more onboarding screens.

### 3 Close the Word exchange loop

First inspect an incoming DOCX for existing tracked changes and unsupported editing regions. Keep
the original available and explain the text view used for review. If the document cannot be safely
finalised, offer a clear route to resolving it in Word and uploading a new baseline.

Then prototype a second-round journey: select the previous outgoing version, upload the returned
document, compare tracked and untracked wording changes, and identify new or reopened issues.
External proposals need their own provenance. Past decisions remain historical; do not carry an
approval forward merely because the paragraph resembles an earlier clause.

The existing `core/content/docx` engine, immutable versions and accepted baselines are the
foundation. The tracked-change engine intentionally leaves some document regions alone, and clean
export rejects detected `w:ins`/`w:del` changes in `word/document.xml`; broader Word revision
coverage remains to be verified. The inspector should expose those coverage limits and prevent
clean-output claims for detected unsupported revisions. Full reconciliation is larger than adding an upload button.

Acceptance: a lawyer checks real desktop Word files with styles, numbering, tables, comments,
headers/footnotes and incoming tracked/untracked edits. Preserve originals, attribute changes, show
unsupported regions and prevent stale approvals. Measure round-trip fidelity and second-round
review time before committing to a native Word add-in.

### 4 Give outstanding work an owner

Allow an escalated finding or review to name an eligible matter member and optional due date. Show
who is responsible for the next step and provide a small personal work list. Assignment must not
grant access or change the required approval role.

Extend the audited review model and existing attention overview. The current notification inbox
is terminal-job-specific; assignment/approval reminders need a shared, permission-checked outbox.
Start with in-app delivery. Add identifier-only email digests when firms request them and recipient
authorisation can be rechecked at delivery.

Acceptance: a reviewer can leave and return, find assigned work, decide the exact current proposal,
and see the assignment/decision history. Revoked access prevents subsequent delivery and decisions.

### 5 Make the review usable at handoff

Prototype a concise partner/client brief with material risks, unresolved questions, recommended
decisions, next owner and the exact reviewed/approved output references. Include a human preview
that selects what is shared; internal comments and strategy must not enter a client brief by default.

Use the existing consistent review-report capture. A client brief is a presentation of authorised
facts, not another review engine or automatic email-sending feature. Validate whether firms need it
before adding external sharing permissions or a client portal.

## Pilot tests before larger commitments

Run a small observed cohort of commercial-law firms; three to five firms is a practical starting
proposal, not a statistically representative sample. Observe an unaided first review, a real Word
exchange and a returned revision. Ask the same people to repeat the workflow later.

Confirm how often those firms receive NDAs and who owns the purchasing decision. Repetition should
come from actual matters, not only a second demonstration. If NDA volume is too low to support paid
repeat use, reassess the initial commercial-contract job before adding more NDA features; any new
contract type still needs approved firm standards and reviewer capacity.

Use the existing [pilot record](../../test/acceptance/pilot-review.md) and a lawyer-labelled,
sanitised NDA set. Record material missed risks, incorrect findings, citation errors, redline edits,
Word fidelity, time spent verifying, unresolved work and cost per completed document. A faster first
response is not enough if verification takes longer or the final document cannot be used.

Obtain explicit willingness-to-pay evidence and identify the existing tool that forces repeated
copying, re-entry or version confusion. A small pilot can identify usability failures and purchasing
conditions; it cannot establish broad product-market fit or causal productivity gains.

Do the legal quality evaluation before building a dashboard. Human correction must not
automatically publish new firm standards or become a cross-matter precedent. Acceptance-aware
precedent retrieval is a later hypothesis that can reuse permission-filtered full-text search;
execution-complete cells are not equivalent to human-approved language.

## Scope to defer

Defer broad legal research, more contract types without approved firm standards, semantic/vector
infrastructure, general client portals, billing/trust accounting, signature infrastructure, broad
CRM/DMS/email integrations and autonomous negotiations/approval. They each introduce another
product and operating burden without resolving the first NDA workflow's purchasing case.

Recommended next engineering package: captured review position, a guided first-review path and
bounded incoming-Word inspection, alongside deployed/Word/quality acceptance. Follow with named
reviewer handoff. Treat full revision reconciliation, client briefs and one connector as explicit
pilot decisions. Keep proposals within the existing numbered plans rather than adding another
parallel platform roadmap.
