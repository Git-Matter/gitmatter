# Australian sole practitioners and general practices

Date: 10 November 2026. Owner: product and engineering. Status: implementation authorised.

## Product decision

Serve Australian sole practitioners and general practices first. Help a practitioner understand a document bundle, prepare the next piece of work, verify its sources, and retain a record of their own decisions. Preserve bring-your-own-agent and bring-your-own-key workflows. All matter and document mutations must use the existing commit path.

## Work packages

| PRD                                                               | Deliverable                                                                     | Dependencies                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| [01 Matter briefing and correspondence](01-matter-briefing.md)    | Reusable, source-first task instructions and matter-linked output               | Existing assistant, document tools         |
| [02 Guided starting actions](02-guided-starts.md)                 | Three guided tasks and an explicitly fictional sample                           | 01                                         |
| [03 Assisted setup and trust](03-assisted-setup.md)               | Setup guidance, practice preferences, accurate processing disclosures           | 04 profile contract                        |
| [04 Australian practice outputs](04-practice-outputs.md)          | State/territory context, correspondence preferences, version-bound human review | Existing document versions and audit spine |
| [05 Sole-practice commercial offering](05-commercial-offering.md) | AUD quote path and transparent cost explanation                                 | Marketing shell                            |
| [06 Practitioner pilot](06-practitioner-pilot.md)                 | Pilot enquiry flow, interview/runbook, explicit measures and acceptance gates   | 01–05                                      |

## Delivery boundaries

The initial release implements these workflows using the existing assistant and audited engine. It does not promise a new Australian legal research corpus, approved legal precedents, automatic deadline calculation, court filing, automated billing, completed practitioner recruitment, or Australian residency for all data. The document-storage selection is distinct from governing law and AI processing location. No invented price, legal identity, certification, customer quote, practitioner endorsement, or provider agreement may appear in the product.

Source-complete, locally tested, authenticated browser verified, practitioner accepted, staging deployed, and production deployed are separate states. Record evidence and unfinished acceptance criteria in [DELIVERY.md](DELIVERY.md); do not mark a PRD complete because its code exists. Production rollout uses the repository's normal release path and requires deployment-specific verification.

## Shared acceptance gates

- Tenant and matter authorisation applies to every new read and mutation; agents cannot create human review attestations.
- Practitioner review refers to the exact reviewed content version and becomes stale after relevant document changes.
- Sample material is conspicuously fictional and cannot be mistaken for a real client's matter or approved precedent.
- User-visible AI outputs remain drafts; uncertainty and unverified dates stay visible.
- Keyboard access, labelled fields, pending/error states, and existing design tokens apply to all new UI.
- Run `vp check`, `vp run typecheck`, `vp test`, relevant package builds, and migration generation when schema changes. Exercise authenticated local flows and inspect an exported Word file.

## Research basis

- [Joint NSW/WA/Victorian regulator statement](https://lsbc.vic.gov.au/resources/statement-use-artificial-intelligence-australian-legal-practice): confidentiality, competent verification, supervision, and accurate costs.
- [Multi-state AI selection checklist](https://www.qls.com.au/news-media-advocacy/qls-releases-new-ai-checklist-for-legal-practitioners): vendor due diligence and adoption in small practices.
- [OAIC guidance](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/guidance-on-privacy-and-the-use-of-commercially-available-ai-products): risk-based due diligence and oversight; applicability depends on the entity and circumstances.
- [2024 National Profile](https://www.lawsociety.com.au/sites/default/files/2025-06/2024%20National%20Profile%20of%20Solicitors%20-%20Final.pdf): practice ownership distribution, not a validated demand forecast.

Research informs product requirements; none of these sources endorses gitmatter.
