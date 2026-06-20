---
slug: decisions/ADR-0069-visual-design-language-draughtsmans-restraint
title: "ADR-0069: Visual design language, Draughtsman's Restraint"
type: decision
tags: [design-system, visual-language, theming, color, typography, iconography, accessibility]
related:
  [
    decisions/ADR-0096-design-system-consolidation,
    decisions/ADR-0076-wordmark-typeface,
    decisions/ADR-0048-paint-color-palette-and-site-metadata,
    decisions/ADR-0081-canvas-resolves-design-tokens-at-runtime,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-visual-design-language.md,
    docs/specs/2026-06-10-editor-experience-makeover.md,
    docs/specs/2026-06-09-design-system-token-and-theming-contract.md,
    editor/design-system/tokens.css,
    editor/design-system/tokens.ts,
    editor/design-system/palette-contrast.test.ts,
    index.html,
  ]
status: current
updated: 2026-06-13
---

# ADR-0069: Visual design language -- Draughtsman's Restraint

Date: 2026-06-13
Status: Accepted

## Context

The editor experience makeover spec (`docs/specs/2026-06-10-editor-experience-makeover.md`)
calls for "a single coherent visual language (the drafting-table direction) through the
design-system tokens, with light and dark variants," but names the direction without
specifying it. The design-system token contract
(`docs/specs/2026-06-09-design-system-token-and-theming-contract.md`) establishes the
two-tier token system and says the light-mode ramp will use the colors already in the
existing shell CSS, which was a placeholder palette (slate grays and a blue accent) not
the intended drafting-table aesthetic.

A UX Pilot mockup (June 2026) showed a warm amber-forward direction. Reviewing the
mockup against the product goals (a tool for power users and old-house renovators that
signals respect for historic architecture while staying comfortable for long working
sessions) surfaced a core tension: warm saturated color supports the heritage aesthetic
but causes eye fatigue over extended use. This decision records how that tension is
resolved and what the resulting design language looks like.

## Decision

Vernacular's visual design language is named Draughtsman's Restraint. The resolution of
the heritage-versus-usability tension is to separate the two layers: the heritage feel
comes from material choices (parchment canvas, warm ink text, serif type for named
artifacts), while the UI chrome stays quiet. Brass (warm amber) appears only where it
carries semantic meaning in the way a draughtsman's colored pencil does: measurement
annotations on the canvas, the active-selection indicator, period and era tags, and the
primary Export action.

The specific decisions within this language:

**Color.** `--color-accent` moves from ink-800 (#2c3e57) to brass-500 (#b08646) in
light mode, matching dark mode. A new primitive `--brass-600: #8b692a` is added for
primary button backgrounds; vellum-50 label text on this fill clears WCAG AA 4.5:1 at 4.72:1. Two new semantic
tokens are added: `--color-surface-active` (vellum-200, the active tool chip background)
and `--color-indicator` (brass-500, the 2px left-border active state marker).
`--color-focus-ring` stays at ink-900 because brass at 2.8:1 against vellum-100 does
not clear the WCAG 2.2 3:1 focus-indicator threshold.

**Typography.** EB Garamond (Google Fonts) for project names, component titles in the
inspector, and italic period subtitles. Inter (Google Fonts) for all UI controls,
section labels, property labels, values, and button text. ui-monospace for coordinate
readouts and dimension values. Both web fonts load from a single Google Fonts request.
Using web fonts rather than the OS-native serif stack (Iowan Old Style / Palatino)
ensures consistent appearance across Mac, Windows, and Linux.

**Iconography.** Phosphor Icons at Regular weight (2px effective stroke, 24px grid) for
all common tools. The 2px stroke matches the line weight of floor plan wall outlines,
so icons and drawing geometry share visual weight. Period section icons (Fireplace,
Chimney, Stairs, and future era-specific components) use Phosphor approximations until
custom SVGs are drawn. Custom icons will follow the same 24px/2px grid.

**Rail structure.** Four sections (Select, Draw, Period, Annotate) with icon-plus-label
chips in a single-column grid at the default rail width for multi-tool sections. Snap
controls are removed from the
rail entirely; snap state lives in the status bar and the opt-in precision panel from
the editor experience makeover spec. The Period section is intentionally sparse at
launch and grows as the Period component asset track adds era-specific components.

**Full details** in `docs/specs/2026-06-13-visual-design-language.md`.

## Alternatives considered

**Full brass chrome (amber active states everywhere).** The UX Pilot mockup moved in
this direction. Rejected because saturated warm color in the panel chrome would cause
eye fatigue in multi-hour sessions, and because it removes the visual distinction
between "UI state" and "drawing annotation" that makes measurement lines readable at a
glance.

**Ink-blue chrome (prior token assignment).** Keeping ink-800/ink-900 as the light-mode
accent was the prior direction. Rejected because ink-blue reads as a generic SaaS tool
rather than something that respects the subject matter. The heritage feel was absent from
the UI chrome entirely, relying on the canvas alone.

**OS-native serif stack instead of web fonts.** Iowan Old Style on Mac and Palatino
Linotype on Windows both work well, but the rendering difference is visible and
inconsistent. EB Garamond provides the same old-style character at a ~30KB font cost.

## Consequences

- `editor/design-system/tokens.css` gains one new primitive, two new semantic tokens,
  and updated light-mode accent assignments. The existing dark-mode tokens are unchanged.
- `editor/design-system/tokens.ts` gains entries for the two new semantic tokens.
- `editor/design-system/palette-contrast.test.ts` must be updated for the new assignments.
- `index.html` gains a Google Fonts preconnect and stylesheet link for EB Garamond
  and Inter.
- Existing components that reference `--color-accent` or `--color-accent-strong` in
  light mode will pick up the brass values automatically. Each component needs a visual
  check that the new color is correct in context; some components may need new
  variant rules.
- The `DraftingTable` Storybook story is replaced by a `DraughtsmansRestraint` story
  that documents the full swatch ramp, semantic assignments, and component gallery.

## Related

- ADR-0096 (design-system consolidation) extends this language: it fills in the token
  scales, routes the chrome through shared primitives, and collapses the drifted active
  treatments to one canonical surface-active state, all without changing the look set here.
