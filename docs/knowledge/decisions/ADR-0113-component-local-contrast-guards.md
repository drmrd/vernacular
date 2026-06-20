---
slug: decisions/ADR-0113-component-local-contrast-guards
title: 'ADR-0113: Component-local contrast guards'
type: decision
tags: [design-system, tokens, accessibility, a11y, wcag, contrast, color, css, chrome]
related:
  [
    decisions/ADR-0069-visual-design-language-draughtsmans-restraint,
    decisions/ADR-0096-design-system-consolidation,
    decisions/ADR-0112-minimum-interactive-target-sizes,
  ]
sourceFiles:
  [
    editor/shell/inspector.css,
    editor/paint/color-picker.tsx,
    core/color/readable-text-color.ts,
    core/index.ts,
    editor/plan/plan-overlay.css,
    editor/design-system/tokens.css,
    editor/design-system/palette-contrast.test.ts,
  ]
status: current
updated: 2026-06-19
---

# ADR-0113: Component-local contrast guards

## Status

Accepted, landed. Four shipped surfaces that failed WCAG color contrast now meet it: the
inspector period tag, the color-swatch label, the 2D entity-proxy focus ring, and the active-state
fills in dark mode. Each fix routes the surface back onto an existing semantic token or, where the
background comes from data, picks the readable text color at runtime. Each is held by a guard that
matches the shape of the surface. This extends the contrast invariant that ADR-0069 set up and the
token vocabulary the design system shares.

## Context

The codebase already had a contrast guard, `palette-contrast.test.ts`. It enumerates the semantic
token pairs that the design language promises to keep legible, body text on the surface, on-accent
text on the strong accent, the focus ring against the surface, and checks each in both themes with
the project's own WCAG math. That guard is sound for the pairs it lists, but it can only see
token-to-token relationships. A component is free to pair colors the enumerator never considers,
and four shipped surfaces did exactly that.

The period tag in the inspector filled with `--color-accent`, the weaker brass, rather than the
`--color-accent-strong` the button system uses, so its on-accent label sat at 3.10:1. The
color-swatch chips painted their name in the browser-default near-black on a fill that comes from
palette data or a user's recent colors, so a mid-tone swatch such as clay dropped the label to
4.15:1 and a darker one would go lower. The 2D proxy focus ring was a hard-coded orange that
bypassed `--color-focus-ring` and read at 2.62:1 on the light canvas. And the dark theme block
overrode almost every surface token but forgot `--color-surface-active`, so dark mode inherited the
light value and active-state text landed at about 1.19:1, effectively invisible. None of these is a
token-pair the enumerator lists, so all four passed the existing guard while failing on screen.

## Decision

Treat a shipped surface that pairs a foreground and background outside the enumerated token pairs
as something that needs its own guard, and pick the guard from the shape of the surface.

### Route a surface back onto the right token when one exists

Three of the four failures were a surface reaching for the wrong value when a correct semantic token
was already available. The period tag moves to `--color-accent-strong`, the same choice the button
system makes, which reads at 4.73:1. The proxy focus ring moves to `--color-focus-ring`, which is
ink on the light canvas at 11.77:1 and becomes theme-aware in the bargain. The dark theme block
gains `--color-surface-active: var(--ink-800)`, which lifts active-state text to 10.16:1 and leaves
the light path untouched. Each of these is a one-line change that puts the surface back on the token
it should have used.

### Pick the readable color at runtime when the background comes from data

The swatch label has no static token to reach for, because its background is whatever color the
swatch shows, and that can be any palette entry or any color the user picked recently. So the label
color is computed. A small pure helper, `readableTextColor`, lives in `core/color` next to the
existing WCAG math and takes the fill plus a light and a dark candidate, returning whichever has the
higher contrast against the fill. The chip passes the two design-system extremes and paints the
label in the result, so a label on a light swatch goes dark and a label on a dark swatch goes light.
The helper is best effort: on a very mid-tone fill that neither candidate clears it still returns the
better of the two. It is pure and lives in `core`, so it carries no React or Three dependency and is
testable on its own.

### Match each guard to the surface

The three token-routing fixes are pinned by the project's CSS literal-guard idiom, a Vitest test
that reads the stylesheet and asserts the selector block routes through the expected token and no
longer carries the bad literal. The runtime picker is pinned two ways: a unit test on the helper
that asserts it returns the higher-contrast candidate and that the result clears the 4.5:1 floor on
a fill that admits one, and a thin component test that the chip actually paints its label in the
helper's pick, so the wiring cannot quietly fall out. The dark surface fix extends the theme-pair
enumerator itself: one assertion added inside its existing light-and-dark loop checks active-state
text on the active fill in both themes, which is the natural home because a new semantic pair now
exists in a theme block, plus a literal guard that the dark block declares the token so a later edit
cannot drop it back to the light inheritance.

## Consequences

- The enumerator stays the home for promised token pairs, and it grew by one pair, the active-state
  text on the active fill, now checked in both themes.
- Surfaces that pair colors outside that set are no longer invisible to the test suite. Each of the
  four now reds if its fix regresses, by the guard that suits it.
- The runtime picker introduces two hard-coded label hexes in the color picker, the light and dark
  extremes, because the contrast math needs hex and the token registry exposes only `var()` strings.
  This is a deliberate seam, documented at the call site. Promoting the pair into a small `core`
  palette constant is a reasonable later step if more surfaces need the same choice.
- None of the four surfaces appears in the light home screenshot, so the visual-regression baseline
  did not move and CI was unaffected.
- The general literal guard still scans only border-radius and font-size, so it does not yet enforce
  that a new surface reaches for a contrast-safe token. The per-surface guards carry that discipline
  for the surfaces that exist now, and widening the scanner is a later option if the pattern recurs.

## References

- ADR-0069 (the visual design language and its color tokens, whose contrast invariant this extends).
- ADR-0096 (the design-system consolidation that produced the shared primitives these surfaces use).
- ADR-0112 (the sibling accessibility pass on interactive target sizes, same token family).
- WCAG 1.4.3 Contrast (Minimum) for text and 1.4.11 Non-text Contrast for the focus ring.
