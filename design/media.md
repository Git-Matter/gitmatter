# Public product media

All 19 current public MP4s are rendered illustrations from `apps/video`. They are examples of a
workflow, not documentary evidence of a live session, legal result, provider integration or timing.
The origin inventory is [media.json](media.json): public path, composition ID, source file and SHA-256.
Those mappings were reviewed against the repository compositions. A hash identifies the reviewed
asset; it is not a complete render-chain attestation.

`ProductVideo` owns the public playback contract: paused on entry, explicit controls, an accessible
name and a caption that says “Illustrative preview using example data.” The video's description
references that visible caption. Home, platform, feature, resource, blog and smaller feature figures
use this component. Resource cards identify illustrative videos before opening the watch page.

Do not describe a rendered composition as an actual session, real product recording or measured
customer outcome. Scenario quantities such as 100 contracts and twelve NDAs are example inputs.
Do not infer product capability or provider privacy terms from an illustrated interface.

## Change procedure

1. Review what an asset actually depicts and where it came from.
2. Register its public path, composition, source file and reviewed bytes in `media.json`.
3. Use the shared player with a meaningful name and optional task caption.
4. Run `vp run design:check`, the structural guard tests and the marketing-media browser replay.

DG010 rejects direct native marketing players, unregistered/missing public MP4s, changed asset bytes,
missing illustration sources and unknown composition IDs. Tests exercise changed, unreviewed and
removed assets. This is an origin-drift guard, not an automated truth detector. Introducing a real
screen recording requires an explicit extension of the origin model, reviewed capture evidence and
appropriate visible wording; changing a JSON label alone is insufficient.

The [browser record](evidence/marketing-media.json) covers home, platform, a feature, a resource
watch page and a blog post at 1440px and 390px. It checks every player on those pages for paused
state, controls, accessible naming, visible origin disclosure and page overflow. It does not claim
subtitle/audio coverage, universal WCAG conformance or that the illustrated capabilities ran live.
