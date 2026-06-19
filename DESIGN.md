---
name: gitmatter
description: Audited legal review — calm warm-paper surface where the document is the hero
colors:
  ink: "oklch(0.17 0.008 90)"
  ink-soft: "oklch(0.50 0.012 90)"
  paper: "oklch(0.985 0.005 90)"
  paper-card: "oklch(0.999 0.003 90)"
  paper-sunken: "oklch(0.965 0.006 90)"
  hairline: "oklch(0.92 0.007 90)"
  bronze: "oklch(0.55 0.09 75)"
  bronze-tint: "oklch(0.94 0.025 75)"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-surface: "oklch(0.955 0.035 27)"
typography:
  display:
    fontFamily: "Newsreader Variable, ui-serif, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Newsreader Variable, ui-serif, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
spacing:
  field: "0.375rem"
  stack: "1rem"
  section: "2.5rem"
  page: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "0 0.625rem"
    height: "2.25rem"
  button-outline:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.625rem"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.625rem"
    height: "2.25rem"
  badge-state:
    backgroundColor: "{colors.bronze-tint}"
    textColor: "{colors.bronze}"
    rounded: "{rounded.sm}"
    padding: "0.125rem 0.5rem"
  card:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
  input:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 0.75rem"
---

# Design System: gitmatter

## 1. Overview

**Creative North Star: "The Quiet Chambers"**

A calm counsel's office. Warm ivory paper, dark ink, serif headings; the document on the desk gets
the light. The interface is the room, not the conversation: it holds the work steady and never
raises its voice. Where Harvey is cream-corporate and Legora is stone-cool, gitmatter is the more
breathable child of both: fewer boxes, wider margins, hierarchy carried by type instead of chrome.

This system explicitly rejects the generic shadcn/SaaS look (default-theme gray, identical card
grids, hero metrics), dense enterprise legal chrome (cramped toolbars, tiny text), and dark techy
AI styling (neon, glassmorphism, sparkle gradients). When a screen needs more structure, the answer
is more whitespace and stronger type, not another border.

**Key Characteristics:**

- Warm ivory neutrals tinted toward hue 90; never pure white or black.
- Serif (Newsreader) for page identity, sans (Geist) for everything operational.
- Whitespace separates; hairlines confirm; boxes are a last resort.
- One quiet accent (bronze) reserved for state cues: ≤10% of any screen.
- Soft ambient elevation: barely-there shadows that read as paper lift, not floating panels.

## 2. Colors

Warm paper and ink, with one bronze voice for state.

### Primary

- **Counsel Ink** (oklch(0.17 0.008 90)): all primary text, primary buttons, active nav. The ink
  of the office; carries authority without color.

### Secondary

- **Quiet Bronze** (oklch(0.55 0.09 75)): the only accent. State cues exclusively: commit/audit
  markers, agent-made indicators, citation affordances, selected-state dots. Its tint
  (**Bronze Wash**, oklch(0.94 0.025 75)) backs state badges.

### Neutral

- **Warm Paper** (oklch(0.985 0.005 90)): the app background. Ivory, not white.
- **Raised Paper** (oklch(0.999 0.003 90)): cards, inputs, popovers; one breath lighter than the page.
- **Sunken Paper** (oklch(0.965 0.006 90)): wells, table headers, code/diff gutters.
- **Soft Ink** (oklch(0.50 0.012 90)): secondary text, descriptions, timestamps. Meets AA on Warm Paper.
- **Hairline** (oklch(0.92 0.007 90)): 1px rules and borders. The only border weight that exists.

### Named Rules

**The One Voice Rule.** Bronze appears on at most 10% of any screen. If two bronze elements sit in
the same view region, one of them is wrong.
**The No Pure Extremes Rule.** `#fff` and `#000` are forbidden. Every neutral carries the hue-90
tint, light and dark theme alike.

## 3. Typography

**Display Font:** Newsreader Variable (with ui-serif, Georgia fallback)
**Body Font:** Geist Variable (with sans-serif fallback)

**Character:** A law library pairing: a bookish, slightly warm serif for identity moments above a
precise, quiet grotesque doing the operational work. The serif appears where a page states its
name or a document speaks; the sans does everything else.

### Hierarchy

- **Display** (500, 2rem, 1.15): one per screen at most; the page title in PageHeader.
- **Headline** (500, 1.5rem, 1.2): section titles inside long pages, dialog titles for weighty acts.
- **Title** (600, 1rem, 1.4): card titles, table-row primary text, form section labels.
- **Body** (400, 0.875rem, 1.6): default text. Max line length 70ch; legal prose gets the full measure.
- **Label** (500, 0.75rem, +0.01em): metadata, column headers, badges, timestamps.

### Named Rules

**The Serif Earns It Rule.** Serif is reserved for identity (page titles, document names, marketing
headlines) and quoted legal text. Buttons, nav, tables, and form controls are always sans.
**The Two-Step Rule.** Adjacent hierarchy levels differ by both size and weight, never size alone.

## 4. Elevation

Soft ambient. Surfaces rest almost flat on the paper; cards carry a barely-perceptible diffuse
shadow that reads as a sheet lifted a millimeter, not a floating panel. Depth beyond that comes
from the three paper tints (Sunken, Warm, Raised), with hairlines confirming edges. Floating
layers (popover, dropdown, dialog) are the only surfaces allowed a visible shadow.

### Shadow Vocabulary

- **Paper lift** (`box-shadow: 0 1px 2px oklch(0.17 0.008 90 / 0.05)`): cards and inputs at rest.
- **Float** (`box-shadow: 0 4px 16px oklch(0.17 0.008 90 / 0.10)`): popovers, dropdowns, command menus.
- **Modal** (`box-shadow: 0 12px 40px oklch(0.17 0.008 90 / 0.14)`): dialogs only.

### Named Rules

**The Millimeter Rule.** If a shadow is noticeable at a glance, it is too strong. Shadows confirm
edges; they never create drama.

## 5. Components

### Buttons

- **Shape:** gently rounded (0.5rem), 2.25rem tall, sans Label-to-Body sized text.
- **Primary:** Counsel Ink fill, Warm Paper text. One per view region.
- **Hover / Focus:** primary lightens to 80% opacity; all buttons take a 3px soft ring
  (`ring-ring/50`) on focus-visible; active nudges 1px down.
- **Outline / Ghost:** hairline border + Raised Paper, or borderless with Sunken Paper hover.
  Ghost is the default for toolbars and row actions.

### Badges / State cues

- **Style:** pill (rounded-4xl), Label type. State badges use Bronze Wash background with Quiet
  Bronze text; lifecycle states may also render as a tinted 6px dot beside Label text instead of a
  filled badge: quieter, preferred in dense tables.
- **State:** committed/audited = bronze; draft = neutral (Sunken Paper bg, Soft Ink text);
  destructive states use the destructive-surface tokens.

### Cards / Containers

- **Corner Style:** 0.875rem radius.
- **Background:** Raised Paper.
- **Shadow Strategy:** Paper lift only (see Elevation).
- **Border:** none by default; the shadow and tint difference carry the edge. A hairline ring is
  the fallback on Sunken Paper backgrounds.
- **Internal Padding:** 1.5rem (1rem for `size="sm"`). Never nest a card in a card.

### Inputs / Fields

- **Style:** hairline border, Raised Paper background, 0.5rem radius, 2.25rem height.
- **Focus:** border shifts to ring color + 3px soft ring. No glow.
- **Error:** destructive border + destructive-surface tint; message in destructive text below at
  Label size, never inside a tooltip.

### Navigation (sidebar)

- **Style:** Warm Paper (slightly sunken from content area), no border against content when tint
  difference suffices; hairline if not. Items are ghost rows: Label-weight sans, Soft Ink at rest,
  Counsel Ink + Sunken Paper fill when active. Active item may carry a bronze dot, not a filled
  background in brand color.
- **Mobile:** collapses to an overlay sheet with the Float shadow.

### Diff / Audit trail (signature)

The product's identity component. Field-level diffs render on Sunken Paper gutters with serif for
quoted document text and sans for metadata. Additions/removals use tinted backgrounds at
readable-text contrast, never saturated fills. Blame metadata (author, time, commit message) is
Label type in Soft Ink, with bronze marking agent-authored commits.

## 6. Do's and Don'ts

### Do:

- **Do** tint every neutral toward hue 90; the page is ivory (oklch(0.985 0.005 90)), not white.
- **Do** carry hierarchy with type scale + weight; remove a border before adding one.
- **Do** keep bronze under 10% of any screen and tied to state meaning, never decoration.
- **Do** give legal text the serif and the full 70ch measure; it is the hero.
- **Do** meet WCAG AA: 4.5:1 body text, visible 3px focus rings, `prefers-reduced-motion` honored.

### Don't:

- **Don't** ship the generic shadcn/SaaS look: default gray theme, identical card grids, hero
  metrics, gradient buttons.
- **Don't** recreate dense enterprise legal chrome (iManage, Westlaw): cramped toolbars, tiny
  text, borders on everything.
- **Don't** drift dark-techy: neon on black, glassmorphism, "AI sparkle" gradients. Agent activity
  is marked with quiet bronze, not magic sparkles.
- **Don't** use side-stripe borders (`border-left` > 1px as accent), gradient text, or modals as
  the first answer; prefer inline and progressive disclosure.
- **Don't** put serif in buttons, nav, tables, or controls. The Serif Earns It Rule.
