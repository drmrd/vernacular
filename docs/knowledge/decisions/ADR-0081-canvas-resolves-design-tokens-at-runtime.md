---
slug: decisions/ADR-0081-canvas-resolves-design-tokens-at-runtime
title: 'ADR-0081: The 2D plan canvas resolves design tokens at runtime'
type: decision
tags: [design-system, canvas, tokens, plan-editor, theming, draughtsmans-restraint]
related: [decisions/ADR-0069-visual-design-language-draughtsmans-restraint]
sourceFiles:
  [
    docs/specs/2026-06-14-editor-visual-design-quality.md,
    editor/design-system/tokens.css,
    editor/plan/plan-palette.ts,
    editor/plan/plan-scene.ts,
    editor/plan/plan-view.tsx,
    editor/plan/draw-plan.ts,
  ]
status: current
updated: 2026-06-14
---

# ADR-0081: The 2D plan canvas resolves design tokens at runtime

## Status

Accepted. Part of the editor visual-design-quality pass
(`docs/specs/2026-06-14-editor-visual-design-quality.md`).

## Context

The plan editor paints to an imperative 2D canvas. A canvas context takes color as a
string argument and cannot reference CSS custom properties the way styled DOM does, so the
draw routines used to carry their own hardcoded color literals. Those literals were cool
blues and grays, off the warm Draughtsman's Restraint palette (ADR-0069), and they lived
apart from the design-system token vocabulary in `tokens.css`.

Earlier cycles in this pass moved every canvas color onto a `PlanPalette` and added matching
`--color-canvas-*` role tokens to `tokens.css`. That left one gap: the canvas still drew
from a baked-in default palette rather than the live token values, so `tokens.css` was not
yet the single source for canvas color, and a future dark canvas had no path to take effect.

## Decision

The shell resolves a `PlanPalette` from the `--color-canvas-*` tokens at runtime and threads
it into the draw pipeline. `PlanView` reads the tokens once with
`getComputedStyle(document.documentElement)`, wrapped in `resolvePlanPalette`, and memoizes
the result on the resolved theme so a theme change re-resolves and repaints. The palette
flows through `usePlanRedraw` into `buildDrawOptions` and on to `drawPlan`, which already
draws from `options.palette`. `DEFAULT_PLAN_PALETTE` supplies warm fallbacks for any token
that reads empty, which covers server render and the test environment.

The pure pieces are unit-tested: `resolvePlanPalette` maps tokens to palette fields and falls
back on empty reads, and `buildDrawOptions` threads the palette into the returned options.
The `getComputedStyle` read in `PlanView` is canvas glue, coverage-excluded for the same
reason the rest of `PlanView` is, since jsdom has no 2D canvas.

## Consequences

- `tokens.css` is the single source for canvas color. The draw routines hold no color
  literals, so a canvas color change is a token edit rather than a code edit.
- A theme switch re-resolves the palette because the memo depends on the resolved theme, so
  the canvas can follow the theme once dark values exist.
- The token read uses `document.documentElement`, where the `:root` light values live. The
  `data-theme` attribute currently sits on the design-system wrapper element rather than the
  document root, so a dark canvas needs its `--color-canvas-*` overrides reachable from the
  document root (promote the theme attribute, or override the canvas tokens under a
  `prefers-color-scheme` media query at `:root`), or the read root moves to the themed
  element. The dark-canvas pass settles that placement.
- A token that reads empty falls back to the warm default rather than painting a blank color,
  so the canvas degrades to the light palette instead of failing.

## References

- `docs/specs/2026-06-14-editor-visual-design-quality.md`: the visual-design-quality spec.
- ADR-0069: the Draughtsman's Restraint visual language and its warm palette.
- `editor/plan/plan-palette.ts`: the `PlanPalette` type, the resolver, and the defaults.
