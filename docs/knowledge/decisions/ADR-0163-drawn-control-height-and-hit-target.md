---
slug: decisions/ADR-0163-drawn-control-height-and-hit-target
title: 'ADR-0163: The drawn control height and the hit target are two measurements'
type: decision
tags: [design-system, accessibility, a11y, wcag, target-size, tokens, visual-language, css]
related:
  [
    decisions/ADR-0112-minimum-interactive-target-sizes,
    decisions/ADR-0162-parallel-design-language-theme,
    decisions/ADR-0154-arris-visual-design-language,
    decisions/ADR-0096-design-system-consolidation,
  ]
sourceFiles:
  [
    editor/design-system/segmented.css,
    editor/design-system/button.css,
    editor/design-system/icon-button.css,
    editor/design-system/field.css,
    editor/design-system/arris-control-geometry.test.ts,
    editor/design-system/active-impression.test.ts,
  ]
status: current
updated: 2026-08-15
---

# ADR-0163: The drawn control height and the hit target are two measurements

## Status

Current. This is the button and field family slice of the Arris migration, following the token
layer in [[ADR-0162-parallel-design-language-theme]]. Draughtsman's Restraint is still the
shipped language and still the resolved default.

## Context

[[ADR-0112-minimum-interactive-target-sizes]] put every interactive control in the chrome on a
40px minimum on a fine pointer, rising to 44px on a coarse one, and routed all of them through
one token so the floor could be tuned in a single place. Arris draws a 28px control. ADR-0162
declined to settle that, kept the target tokens at their shipped values inside the Arris scope,
landed the drawn size as a separate `--size-control-height`, and handed the reconciliation to
this slice.

The preview also had a plainer problem. Arris signals an active control by inversion: the
control fills with ink and its label reverses to the ground. The token layer published
`--color-on-surface-active` for the reversed label and gave it a value in both languages, but
nothing consumed it. Every active rule in the design system set its background to the active
fill and left the label on `--color-text`. Under the shipped language those two colors differ,
so the bug was invisible. Under Arris the active fill is the text ink, so the label matched the
fill exactly and every selected control rendered as a solid box with nothing readable in it: the
tool chips, the segmented toggles, the floor tabs, and the view tabs, in both appearances.

## Decision

### The two numbers measure different things

`--size-target-min` is a promise about where a pointer may land. `--size-control-height` is a
paint size. Under Draughtsman's Restraint they happen to resolve to the same value, which is
what made it easy to write rules that confuse them. They are kept apart here: the control's own
box carries the target, and the impression is drawn inside that box at the drawn height.

### The hit area is the layout box, and never overflows

The obvious alternative was to draw the control at 28px and win the target back with a
transparent overlay reaching past its edges, the technique ADR-0112 used for the pane resize
handle. It does not survive a vertical rack. Arris stacks 28px controls on 4px gaps, so the
pitch is 32px and a 40px overlay reaches 6px past each edge. Two neighbouring overlays then
share an 8px band, the later one in document order wins it, and a click on the visible bottom
edge of one chip selects the chip below it. A hit area that steals from its neighbour is worse
than a small one, because the user aimed correctly and got the wrong answer.

So the box keeps the target and nothing overflows. The cost lands on density: on a fine pointer
a rack of 28px Arris controls still consumes 40px of layout each, and the space between drawn
controls is wider than the 4px the language asks for. The alternative was to lower an
accessibility floor for a preview flag, which is not a trade this project makes. Arris density
is expressed in the drawn control here, not in the layout pitch.

### The impression is drawn by a pseudo-element

Vertical padding alone cannot do it. A background painted on a padded box fills the padding, and
`background-clip: content-box` reduces the corner radius to nothing at these paddings, which
would cost the 2px machined chamfer that the language treats as doctrine. A pseudo-element is a
box of its own: it holds the fill, the border at its resting or active weight, and the chamfer,
centred with `inset-block: calc((100% - var(--size-control-height)) / 2)`.

It has to paint above the group's background and below the label. A negative `z-index` alone
would drop it behind an ancestor's background, so each control gets `isolation: isolate` and
becomes a stacking context of its own, which bounds the negative layer to the control.

### A text field sizes its own box

An `input` element carries no pseudo-element, so a field cannot draw an impression inside a
larger box. It does not need to. The shipped layer never held a field at the target minimum, and
today's fields already measure about 28px from their padding and line height, so under Arris the
drawn height sets the field box directly and no promise is lowered. The field's own Arris work
is the shallow recess the language allows at rest, a top border one step darker than its sides,
plus the data face on numeric values and a Red Lead underline that marks invalid entry without
clearing what the user typed.

### The coarse pointer collapses the split

`tokens-arris.css` already lifts both the target and the drawn height to 44px under
`@media (pointer: coarse)`. Where a finger has to hit the control, the drawn control is the hit
target again and the split disappears.

### The reversed label role gets its consumers

Every design-system rule that paints the active fill now declares
`color: var(--color-on-surface-active)` beside it. Under Draughtsman's Restraint that role
resolves to the ordinary text ink, so the rendering is unchanged; under Arris the label reverses
to the ground and the impression reads. A scanner walks the design system's stylesheets and
fails on any rule that fills without reversing. Where the fill is drawn into a pseudo-element,
which holds no text, the scanner checks the originating element's rule instead.

### Structural rules are scoped, and that is a bounded exception

ADR-0162 said no component reads the design language and no component branches on it, because
the languages differ in values and a token swap can carry the whole difference. The drawn height
is not a value difference. It is a relationship between two boxes, and no single custom property
expresses it. Those rules therefore sit under `[data-design-language='arris']` in the
component's own stylesheet.

The exception is worth its cost, because it buys a stronger guarantee than the token swap does.
A scoped rule cannot reach a page without the flag at all, so rendering with the flag off is
unchanged by construction rather than by the two languages happening to resolve a token the same
way. A test holds the fence: every rule that reads the drawn-height token must be scoped, and no
scoped rule may lower a box height the shipped layer holds at the target.

## Consequences

- The preview is legible. Every control state the design system owns reads in both appearances,
  which is what the flag was for.
- Arris looks less dense on a fine pointer than the language describes. Section 6's 28px control
  is what gets drawn, while the spacing between controls comes from the hit area. Anyone reading
  the preview against the spec will see that gap, and it is deliberate.
- The guards are stylesheet scanners, not rendered measurements. jsdom applies no stylesheets, so
  a computed-pixel assertion is not available at this tier, and the scanner idiom is what the
  design system already uses. A rendered check would have to come from the story baselines.
- Consumer stylesheets outside the design system still pair the active fill with the ordinary
  text ink, so a few surfaces stay illegible under the preview: the opening inspector's fraction
  chips, the 3D navigation toolbar, the inspector count badge, and the project and export menu
  rows. The scanner's scan root is what closes that, not a second scanner.
- `--stroke-icon` still has no consumer. The icons in the chrome come from the icon dependency
  and are drawn with fills rather than strokes, so a stroke width applied from CSS would do
  nothing. The 1.5px alignment lands with the iconography track that replaces them, which the
  migration plan already sequences ahead of the families that consume icons.
- Nothing here is covered by a rendered baseline yet. The story suite has no flag-scoped story,
  so the Arris rendering of these families is asserted from the stylesheets alone.

## References

- [[ADR-0112-minimum-interactive-target-sizes]]: the floor this slice holds rather than lowers.
- [[ADR-0162-parallel-design-language-theme]]: the token layer beneath this, and the source of
  the deferral this ADR closes.
- [[ADR-0154-arris-visual-design-language]]: the language being migrated.
- `docs/specs/2026-07-06-arris-visual-design-language.md`: sections 6, 7, and 8, the authority
  for the drawn height, the recess, and the active-state doctrine.
- `docs/plans/2026-07-08-arris-migration.md`: the button and field family slices of Phase 3.
- WCAG 2.5.8 Target Size (Minimum).
