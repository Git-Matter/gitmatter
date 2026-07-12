# Marketing Site Roadmap

Where the marketing site is, what ships next, and which Harvey-style elements are
deliberately **gated on real-world inputs** (we do not fabricate metrics, logos,
testimonials, or certifications).

## Done (this worktree, branch `worktree-marketing`)

- Harvey-style header: Platform / Solutions / Resources mega menus with full-bleed
  panels, Overview items, hover arrows, featured video cards (poster + play-on-hover).
- `/platform` + 7 feature child pages; `/solutions` + 6 solution child pages; old
  `/features` and `/use-cases` 301-redirect. All copy in `src/marketing/catalog.ts`.
- `/resources` hub (posts, videos, guides, comparisons) + `/resources/$slug` watch
  pages for 6 real Remotion-rendered videos.
- Blog with 4 launch posts, plain-English register, per-post clips.
- Landing: editorial capability index (WorkIndex) + truthful trust band (TrustBand).
- Question-led editorial register on /platform ("Who decided?" / "Who changed this
  clause?" / "Where did the documents go?").

## Next (no external inputs needed)

1. **More demo videos.** The Remotion pipeline is proven (7 feature clips, overview
   reel, 4 marketing comps). Candidates: per-solution walkthroughs, a 60-second
   "connect ChatGPT" screencap-style comp, webinar openers already scaffolded in
   `apps/video/src/WebinarOpen.tsx`.
2. **Resource hub filters.** Harvey-style search + content-type filter once the
   catalog passes ~15 items (client-side, no backend).
3. **Blog cadence.** Topic backlog from the Harvey/Legora research: clause-library
   how-to, tabular extraction for due diligence, "from redline to signature"
   workflow guide, self-hosting for client mandates, engineering deep-dive on the
   commit model.
4. **Full-bleed photographic hero** (Harvey's "Practice Made Perfect"): needs a real
   photo/film asset decision — can be commissioned or stock; layout is a day of work
   once the asset exists.
5. **OG images per resource video** (reuse `/api/og` or the extracted posters).

## Gated on reality (do NOT ship until true)

| Harvey element                         | What must exist first                      |
| -------------------------------------- | ------------------------------------------ |
| Customer logo strip                    | Signed, referenceable customers            |
| Testimonial quotes with names/photos   | A customer who approves the quote          |
| Metrics band (hours saved, adoption %) | Measured product telemetry from real firms |
| SOC 2 / ISO badge grid                 | Actual audits/certifications completed     |
| "N professionals use gitmatter"        | Real usage numbers                         |
| Customer story pages                   | A written, approved case study             |

Interim stand-ins already in place: TrustBand (verifiable guarantees instead of
badges), WorkIndex (the work itself instead of logos), open source as the proof
point ("read the code" beats "trust the badge") .

## Open question: investor communications

Raised 2026-07-12, undecided. Options, roughly in order of effort:

1. **Nothing on the site; a private memo/deck** shared directly (most common
   pre-seed/seed posture; keeps the site purely customer-facing).
2. **Quiet `/about` expansion**: a paragraph on the company, what's built, and a
   contact line for investors (low effort, low noise).
3. **A dedicated private one-pager** (PDF or unlisted page): product thesis, the
   audit-spine differentiator, bring-your-own-agent/key positioning, roadmap,
   ask. Reuses this site's copy; no confidential numbers on the public site.

Recommendation: (1) or (3) — investor material and customer marketing have
different jobs; mixing them on the public site weakens both. Decide before any
fundraise outreach.
