# Product

## Register

product

## Users

Australian sole practitioners and general practices are the primary audience, alongside the AI
agents they drive. The first jobs are understanding a matter file, reviewing an agreement, and
preparing a client update. Other legal teams remain supported. Context: bright
office, large monitor, long sessions reading contracts and review tables. The primary job on any
screen is reading and judging legal text: a redline, an extracted table, a cited answer. The
secondary job is trusting the audit trail (who changed what, when, why). A recorded agent action
is distinct from a practitioner's own review of a particular document state.

Marketing pages address the buying lawyer or firm IT: skeptical of AI hype, allergic to vendor
gloss, convinced by evidence (audit spine, citations, bring-your-own-key).

## Product Purpose

AI-assisted legal review (contract redline, tabular extraction, document generation, workflows) on
a git-style audit spine. Every change, human or agent, is a commit with author, message, and
field-level diff. Success: a lawyer trusts the output enough to file it, and an auditor can trace
every change.

## Brand Personality

Calm, precise, trustworthy. Quiet confidence: the tool recedes, the work (documents, diffs,
citations) is the hero. Feels like HarveyAI and Legora had a child, but more breathable: generous
whitespace, fewer borders, stronger typographic hierarchy instead of chrome.

## Anti-references

- Generic shadcn/SaaS: default-theme look, identical card grids, hero metrics, gradient buttons.
- Dense enterprise legal (iManage, Westlaw): cramped toolbars, tiny text, chrome everywhere.
- Dark techy AI tool: neon-on-black, glassmorphism, "AI sparkle" gradients.

## Design Principles

1. **The document is the hero.** UI chrome stays quiet; legal text, diffs, and tables get the
   contrast, the width, and the serif moments.
2. **Breathe.** Whitespace does the separating; borders and boxes are a last resort. When in
   doubt, remove the container.
3. **Cues over chrome.** State (draft, reviewed, committed, agent-made) reads at a glance through
   small, consistent visual cues: type weight, a tinted dot, a serif label, never loud badges.
4. **Audit-grade legibility.** Anything a lawyer must verify (diffs, blame, citations) meets the
   highest readability bar on the page.
5. **One calm voice.** Light-first warm paper surface; dark mode maintained but secondary. No
   surface shouts.

## Accessibility & Inclusion

WCAG AA: 4.5:1 body-text contrast, visible focus rings, keyboard-completable flows,
`prefers-reduced-motion` respected. Long-session comfort: no pure white/black, restrained motion.
