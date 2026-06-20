---
slug: decisions/ADR-0112-minimum-interactive-target-sizes
title: 'ADR-0112: Minimum interactive target sizes'
type: decision
tags: [design-system, tokens, accessibility, a11y, wcag, target-size, css, chrome]
related:
  [
    decisions/ADR-0069-visual-design-language-draughtsmans-restraint,
    decisions/ADR-0096-design-system-consolidation,
  ]
sourceFiles:
  [
    editor/design-system/tokens.css,
    editor/design-system/tokens.ts,
    editor/design-system/segmented.css,
    editor/design-system/app-frame.css,
    editor/tools/tools-panel.css,
    editor/plan/opening-inspector.css,
    bridge/react/scene-nav-toolbar.css,
  ]
status: current
updated: 2026-06-19
---

# ADR-0112: Minimum interactive target sizes

## Status

Accepted, landed. The interactive controls in the editor chrome now present a target of at
least 40px on a fine pointer and 44px on a coarse one, sized from a pair of new design tokens.
The change adds the token scale, re-points the existing icon-button size token at it, and grows
the segmented options, tool chips, opening-inspector chips, and the 3D nav buttons and pills to
match. The pane resize handle keeps its thin look but gains a wider pointer target. It extends
the token vocabulary set up in ADR-0069 and the primitive consolidation in ADR-0096.

## Context

Almost every interactive control in the chrome rendered below the size a pointer or fingertip
can comfortably hit. Measured at 1rem to 16px, the header icon buttons were 28 by 28, the tool
chips about 24 tall, the theme and unit toggle options about 22, the opening-inspector chips
about 18, and the 3D nav buttons 28. The pane splitter was a 4px-wide pointer target. WCAG 2.5.8
asks for at least 24 by 24, and the widely used accessible default is 40 on a desktop pointer
rising to 44 for touch, so the chrome sat under even the conservative reading in most places.

The token file had already anticipated the fix. `--size-control-icon` carried a comment marking
it as a placeholder to raise to 40 or 44 once this work happened, so the icon square was the one
control already wired to a single tunable value. The rest of the controls set their height
indirectly through padding and font size, or in the 3D toolbar through a hard-coded `height`, so
each one had to be reached on its own terms.

## Decision

Add a named target-size scale to the token file and route every chrome control through it, then
pin each control with a small per-file stylesheet test.

### A target-size token scale

`tokens.css` gains `--size-target-min` at 2.5rem (40px) for a fine pointer and
`--size-target-min-touch` at 2.75rem (44px) for a coarse one, both registered in `tokens.ts`
alongside the other size tokens. `--size-control-icon` stops being its own literal and becomes
`var(--size-target-min)`, which resolves the placeholder and makes the icon square equal to the
fine minimum by definition. Because every header icon button already drew its width and height
from that one token, this single edit raised all of them at once.

### One place to express the touch bump

The 44px value is applied by re-pointing the fine token inside a `@media (pointer: coarse)`
block, the same shape the file already uses to flip color tokens for dark mode and to zero the
motion token under reduced motion. A consumer references `--size-target-min` and nothing else,
and the coarse-pointer rule lifts that value to the touch size for all of them together. The
alternative, repeating a 44px rule in each consuming stylesheet, would scatter the same number
across five files and was rejected. The desktop render, which is what the visual baseline
captures and what most of the audience uses, stays at 40.

### Consumers reference the token

The controls that are not icon buttons get a `min-height: var(--size-target-min)` rather than a
fixed height, so a wrapped label can still grow the box instead of clipping. The shared
segmented option carries the rule, which covers both the theme and the unit toggle since they
render the same primitive with no styling of their own. The tool chips, the opening-inspector
chips, and the two 3D nav controls each take the same rule in their own file, and the 3D nav
button trades its hard-coded `height` for the `min-height` form. Where a rule had no `display`
of its own it also gains `inline-flex` centering so the label sits in the middle of the taller
box.

### A hit area for the resize handle, not a wider bar

The pane splitter is a 4px visual rule, and widening it to 40px would dominate the layout and
break the look. Instead the handle gains a transparent `::before` overlay 40px wide and the full
height of the pane, centered over the thin bar. The visible rule is unchanged and only the
pointer-interactive region grows past the 24px floor. The handle was already keyboard operable,
so this is purely a pointer improvement. The overlay reaches into the neighboring panes by about
18px on each side and is inert today because the handle has no pointer-drag handler, only key
handling. A comment on the rule records that a future drag handler would need to scope or shrink
the overlay first so it does not swallow clicks meant for the panes.

### Pinned by per-file stylesheet tests

Each control is held in place by the project's CSS literal-guard idiom, a Vitest test that reads
the stylesheet and asserts the selector block carries the expected declaration routed through the
token. jsdom does not apply stylesheets, so a computed-pixel assertion is not available, and the
literal guard is how the codebase already pins presentational CSS. The token test also asserts
that the old `1.75rem` literal is gone, so the icon square cannot quietly drift off the token.

## Consequences

- Target size has one source of truth. Tuning the minimum, or changing the touch threshold,
  happens in the token file and reaches every control at once.
- The header strip grows from roughly 44 to 56px tall as the icon buttons rise to 40. The
  toolbar has no fixed height and the app-frame header row is auto-sized, so it absorbs the
  growth without clipping. The local darwin home baseline was refreshed to the taller chrome.
  CI runs on Linux with no committed Linux baseline, so the visual-regression spec self-skips
  there and the refresh does not affect CI.
- The resize handle keeps its thin appearance while meeting the target-size floor. The recorded
  caveat about the overlay is the one thing a later interaction change has to respect.
- The global literal guard still scans only border-radius and font-size, so it does not yet
  enforce that a new control reaches for the target-size token. The per-file guards carry that
  discipline for the controls that exist now. Generalizing the scanner to cover min-height is a
  reasonable later step if the vocabulary grows.

## References

- ADR-0069 (the visual design language and its design-token scales, which this extends with a size scale).
- ADR-0096 (the design-system consolidation that produced the shared primitives these controls use).
- WCAG 2.5.8 Target Size (Minimum), the accessibility requirement the token scale satisfies.
