---
slug: decisions/ADR-0162-parallel-design-language-theme
title: 'ADR-0162: Parallel design-language theme and the Arris token contract'
type: decision
tags: [design-system, visual-language, theming, tokens, feature-flag, accessibility]
related:
  [
    decisions/ADR-0154-arris-visual-design-language,
    decisions/ADR-0069-visual-design-language-draughtsmans-restraint,
    decisions/ADR-0159-plan-ink-weight-hierarchy,
    decisions/ADR-0112-minimum-interactive-target-sizes,
    decisions/ADR-0096-design-system-consolidation,
  ]
sourceFiles:
  [
    editor/design-system/design-language.ts,
    editor/design-system/theme-provider.tsx,
    editor/design-system/tokens-arris.css,
    editor/design-system/tokens.css,
    editor/design-system/tokens.ts,
    app/app.tsx,
    .storybook/design-language-decorator.tsx,
    .storybook/preview.ts,
    scripts/ci/select-tests.mjs,
  ]
status: current
updated: 2026-08-16
---

# ADR-0162: Parallel design-language theme and the Arris token contract

## Status

Current. This is the first build slice of the Arris migration
([[ADR-0154-arris-visual-design-language]]), covering the parallel-theme scaffold and the token
layer beneath it. Draughtsman's Restraint
([[ADR-0069-visual-design-language-draughtsmans-restraint]]) remains the shipped language and the
resolved default; nothing here changes what a user sees.

## Context

ADR-0154 adopted Arris as the target visual language and required the migration to run in stages,
with one hard constraint: the running editor is never left visibly half-migrated between two
languages. That rules out the obvious incremental path of moving one live component at a time.

The design system already carries a theming axis. `ThemeProvider` resolves a light or dark
appearance and stamps `data-theme` on a single wrapper; `tokens.css` declares the semantic
custom properties at `:root` and flips the color subset under `[data-theme='dark']`. Components
read only `var(--...)` names and never branch on the theme themselves.

Arris differs from the shipped language at the level of the language, not the values: a different
palette, a different accent doctrine, different typefaces, a tighter density, one machined radius
instead of a rounding scale. Building it as a second design system would fork every component.
Building it as a retune of `tokens.css` would change the live app on the first commit.

## Decision

### A second theming axis, resolved by attribute

The design language becomes an axis independent of the appearance. `ThemeProvider` stamps
`data-design-language` beside `data-theme` on the same wrapper element it already renders, with
`draughtsmans-restraint` as the default and `arris` as the alternative. Switching languages is an
attribute swap that retargets the custom-property layer underneath. No component reads the
language, and no component branches on it.

Putting both axes on one element is what makes the dark Arris appearance addressable at all:
`[data-design-language='arris'][data-theme='dark']` is a single compound selector, and it
outranks both single-attribute blocks without needing `!important` or a cascade layer.

### The preview flag is a URL query key and nothing else

`?theme-preview=arris` selects the Arris layer, read through the same `searchParam` helper in
`app/app.tsx` that already reads the render-harness seams. The match is exact: a missing
parameter, an empty value, a case variant, and an unrecognized value all resolve to Draughtsman's
Restraint. A normal page load carries no query string, so the shipped language is what every real
user gets, and the flag is a provable no-op without it.

There is no companion storage key and no environment gate. The migration plan left that question
open. A URL parameter is enough to preview a language, it leaves nothing behind on a machine that
tried it once, and a persisted preference would be one more standing configuration surface to
migrate or retire at cutover. A preview that survives a reload can be added on top of this seam
later without changing it.

### The token contract: same names, complete on both sides

The two languages publish the same vocabulary. `tokens-arris.css` declares Arris values for every
semantic token `tokens.css` declares, so flipping the attribute moves the whole system at once
instead of migrating components one at a time. Where Arris introduces a role the shipped system
lacked, the property is added to `tokens.css` as well, with a Draughtsman's Restraint value chosen
to preserve current behavior if a component adopts it (the line-height roles resolve to `normal`,
the texture opacity to `0`, the reversed active label to the ordinary text ink). Raw values stay
inside one file per language: the shipped ramps in `tokens.css`, the Arris palette in
`tokens-arris.css`.

Some of the language's refusals then land as token values rather than as separate decisions. The
primary button fill resolves to Japanned Iron under Arris, not to the accent, because Layout Blue
never fills a surface. The pill radius resolves to the 2px machined radius, so a component that
still reaches for a pill gets a chamfer instead. The overlay elevation resolves to the same shadow
as the raised tier, because Arris has two elevation tiers and no third.

The test that guards this reads both stylesheets and fails on any semantic token present in one
and missing from the other, in either appearance. It follows the scanner pattern the design
system already uses for its CSS literal guard.

### Appearance preferences are restated inside the Arris scope

`tokens.css` declares its reduced-motion, high-contrast, and coarse-pointer overrides against
`:root`. Those land on the document element and reach components only by inheritance, so a
declaration on the themed wrapper overrides them. Left alone, a preview would lose reduced motion,
the strengthened high-contrast border, and the touch-pointer target bump without any of the three
looking broken. All three blocks are therefore restated inside the Arris layer, and a test derives
the list from `tokens.css` so a fourth block cannot be added on one side only.

Arris also has to answer those preferences with the tokens it introduced. The kerf line carries
panel structure at 20 percent ink, which is the first tone a high-contrast reader loses, so it
strengthens alongside the border. On a coarse pointer the drawn control height and the compact row
rise to the touch floor, because a 28px control centered in a 44px hit area invites a press that
looks like a miss.

This obligation is a property of scoping a language by attribute rather than by stylesheet. Any
future language added on this axis inherits it.

### Two values the language does not get to move

Icon stroke width is a design-language token (`--stroke-icon`, 1.5px under Arris and 2px under
Draughtsman's Restraint), following [[ADR-0159-plan-ink-weight-hierarchy]], which decoupled it
from plan-canvas ink weight and assigned it to whichever visual language is in force. The plan
canvas keeps its own hierarchy in `editor/plan/plan-ink.ts`; this slice does not touch it.

The WCAG target-size tokens ([[ADR-0112-minimum-interactive-target-sizes]]) keep their shipped
values under Arris. Arris draws a 28px control, which is a paint size, while the target minimum is
a hit-area promise, and a preview flag is not a reason to drop an accessibility floor. The drawn
height lands as a separate `--size-control-height` token. On a fine pointer the two differ by
design, and reconciling what a 28px control looks like inside a 40px hit area is the job of the
button and field families that migrate next.

## Consequences

- Arris can be selected without changing a single component, and with the flag off the rendered
  output is unchanged. Nothing consumes any of the newly added properties yet, which is what makes
  the second half of that claim checkable.
- The Arris stylesheet ships in the bundle whether or not anyone previews it. It is a few
  kilobytes of scoped declarations, and loading it conditionally would trade that for a flash of
  the wrong language on the first paint.
- Custom properties substitute on the element that declares them, so a token whose value points at
  another token has to be restated in every block that redefines the target. Both dark blocks do
  this. It is the likeliest way a future token addition breaks quietly.
- Canvas colors are ported into the Arris layer as plain `rgba` literals rather than `color-mix`,
  because `PlanPalette` reads these properties and hands them to a canvas fill style, which cannot
  parse `color-mix`. The chrome ink ramp uses `color-mix` since only CSS consumes it.
- Those canvas values are a direct port of the palette doctrine, not a designed canvas family. The
  cased mark and the lit-board exception belong to the canvas family's own slice and depend on a
  feasibility spike that has not run.
- The component-family slices consume this layer next: each family migrates against the Arris
  tokens in Storybook, reading the same `var(--...)` names it reads today. The families that need
  roles this slice named but left unused are the buttons (the reversed active label), the panels
  (the kerf line and the stamped-label tracking), the fields and instruments (the ink ramp's
  instrument and emphasis tiers, the detent duration), and the tool rack (the scribe border width
  and the icon stroke).
- The self-hosted faces are not here. The Arris font-family tokens name Besley, Atkinson
  Hyperlegible Next, and B612 Mono and fall through to platform stacks until the faces land.
- The Arris contrast floors are not yet gated. The existing contrast test still measures the
  shipped tokens only; the parallel test that measures the Arris ink ramp against its true grounds
  is its own slice.

## Addendum: the Storybook seam (2026-08-16)

The component families migrate in Storybook before they reach the app, and the query flag has no
read site there, so Storybook needs its own way to select a language. The seam is a toolbar
global backed by an opt-in decorator: choosing `arris` mounts `ThemeProvider` around the story,
and the default choice returns the story with no wrapper element, the same bare tree the preview
rendered before the decorator existed. A second toolbar global picks the light or dark appearance
for the wrapped case, narrowed by the same helpers beside `resolveTheme` that the shell's theme
toggle uses.

Loading the decorator changed the story environment in one deliberate way. The preview module now
imports `ThemeProvider`, and with it the token layer: `tokens.css` and the attribute-scoped
`tokens-arris.css` load for every story. Before this, a story received the tokens only if its
module graph happened to reach the design-system barrel. The stories that import their component
files directly rendered with every `var(--...)` reference unresolved, a state the running editor
never shows because `app/app.tsx` always mounts `ThemeProvider`. Seven committed story baselines
had captured that starved rendering (the toast and banner notifications, the project identity
block, the snap panel, and the snap status) and were re-rendered on the CI runner as part of this
slice. The Arris sheet stays inert under the default language; its attribute gate scopes every
rule.

The slice also closed a selection gap: `scripts/ci/select-tests.mjs` now treats `.storybook/` as
a test directory, so a change under it selects the decorator's own tests. Before that, a
`.storybook`-only change selected nothing and would have merged ungated.

## References

- [[ADR-0154-arris-visual-design-language]]: the decision this slice implements, and the
  no-half-migrated-app constraint it works around.
- [[ADR-0069-visual-design-language-draughtsmans-restraint]]: the shipped language, still the
  resolved default.
- [[ADR-0159-plan-ink-weight-hierarchy]]: assigns icon stroke width to the design language in
  force and keeps plan ink separate.
- [[ADR-0112-minimum-interactive-target-sizes]]: the target-size floor Arris does not lower.
- `docs/specs/2026-07-06-arris-visual-design-language.md`: the authority for every token value
  ported here.
- `docs/plans/2026-07-08-arris-migration.md`: the migration plan, whose parallel-theme scaffold
  and Arris token-set slices this ADR closes.
- `editor/design-system/tokens-arris.css`, `tokens.css`, `tokens.ts`: the two token layers and the
  registry that names them.
- `editor/design-system/design-language.ts`, `theme-provider.tsx`, `app/app.tsx`: the flag, the
  attribute, and the single read site.
