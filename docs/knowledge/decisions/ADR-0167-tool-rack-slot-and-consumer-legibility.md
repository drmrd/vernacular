---
slug: decisions/ADR-0167-tool-rack-slot-and-consumer-legibility
title: 'ADR-0167: The rack slot is a third measurement, and the scanner follows the fill out of the design system'
type: decision
tags: [design-system, visual-language, css, accessibility, contrast, tokens, tool-rack]
related:
  [
    decisions/ADR-0163-drawn-control-height-and-hit-target,
    decisions/ADR-0162-parallel-design-language-theme,
    decisions/ADR-0154-arris-visual-design-language,
    decisions/ADR-0155-keyboard-and-command-model,
    decisions/ADR-0112-minimum-interactive-target-sizes,
  ]
sourceFiles:
  [
    editor/tools/tools-panel.css,
    editor/tools/tools-panel.css.test.ts,
    bridge/react/scene-nav-toolbar.css,
    bridge/react/scene-nav-toolbar.css.test.ts,
    editor/design-system/arris-effective-label.test.ts,
  ]
status: current
updated: 2026-08-16
---

# ADR-0167: The rack slot is a third measurement, and the scanner follows the fill out of the design system

## Status

Current. This is the tool selector rack slice of the Arris migration, following the button and
field families in [[ADR-0163-drawn-control-height-and-hit-target]]. Draughtsman's Restraint is
still the shipped language and still the resolved default.

## Context

ADR-0163 separated two numbers that had been confused for each other: `--size-target-min` is a
promise about where a pointer may land, and `--size-control-height` is a paint size. It reconciled
them for the families whose drawn size is the standard 28px control, by keeping the target on the
control's own box and drawing the impression inside it with a pseudo-element.

The tool rack does not draw a standard control. Section 10 of the language asks for 32px slots
holding 20px icons, which is the first drawn geometry in the system that is neither the hit target
nor the drawn control height. It also asks for two marks the rest of the system has no use for: a
Layout Blue scribe line down the active slot's left edge, and a shortcut letter engraved in each
slot.

ADR-0163 left a list of surfaces that stay illegible under the preview because they pair the
active fill with the ordinary text ink, and named the 3D navigation toolbar among them. It also
said what would close them: the scanner's scan root, not a second scanner. The scanner could only
name stylesheets inside the design system, so no consumer could be enrolled in it at all.

## Decision

### The slot is a third measurement, and it is clamped rather than stated

The rack declares its slot as one 4px step over the drawn control height, which is the 32px the
language asks for, and takes the smaller of that and the hit target. The clamp is the whole reason
the rule is written as a relationship instead of a value. On a coarse pointer `tokens-arris.css`
raises the drawn control height to the 44px touch floor, and a slot one step above that would
reach 48px inside a 44px box. Rather than restate the coarse-pointer case in a component
stylesheet, the slot takes whichever number is smaller, which holds ADR-0163's no-overflow rule
for whatever either token resolves to later and collapses the slot onto the hit target exactly
where a finger has to hit it.

The rack keeps its shipped layout. The slot is drawn across the full width of a labeled row rather
than as a 32px square, because the shipped rack is a labeled rail and section 9 wants the label
beside the glyph anyway. What the language buys here is the drawn slot, the glyph size, and the
marks, not a different rail.

### The scribe is drawn on the bench, because the accent cannot be read on the fill

Layout Blue is lawful as a line and never as a fill, which is what makes a scribe legal at all.
But a line still owes 3:1 against the ground it crosses, and the ground the active slot offers is
the ink fill it is marking. The accent measures 2.30:1 on the light fill and 2.26:1 on the dark
one, so a scribe drawn on the impression would be a lawful mark nobody can see.

So the impression reserves a gutter at its inline start and the scribe is drawn beside it, on the
bench, where it measures 4.65:1 in light and 5.39:1 in dark. Every slot reserves the gutter
whether or not it is active, so marking a slot never shifts the rack. The test measures all four
ratios instead of asserting the geometry, so if a palette change ever lifts the accent clear of
the fill, the test holding the gutter in place is the one that fails.

### A probe may name any stylesheet in the repository

The cascade-legibility scanner resolves a bare stylesheet name against the design system as
before, and a name containing a path separator against the repository root. That one change lets
a probe follow the fill wherever it is painted. The tool rack and the 3D navigation toolbar are
the first two consumers enrolled through it.

Enrolling a consumer has a consequence worth stating, because it looks like duplication. The
scanner resolves one stylesheet at a time, so a consumer that inherits its active fill from a
shared class leaves the scanner with no ground to measure against. A consumer enrolled in the
scanner therefore states its own active treatment, even where a shared stylesheet already states
the same thing at the same specificity. That is the same idiom each design-system family already
follows, and it is now load bearing rather than stylistic.

### A scoped override answers for every state its target can hold at once

ADR-0163's addendum ended on the rule that a rule cancelling a fill owes an answer about the
label. The same defect has a second form, which this slice shipped into a cycle and caught in
review.

The Arris hover rule for the navigation toolbar cancels the fill, because hover here brightens a
border. It is more specific than the pressed rule and declares every property the pressed rule
declares, so it also won on a button that was pressed and hovered at once: the fill, the indicator
border, and the reversed label all went, and an active toggle under the pointer rendered exactly
like an inactive one. Each rule was correct about the state it was written for. Neither was
correct about the state where both applied.

A guard that reads declarations cannot see this, and neither can one that resolves a single state.
The check that catches it resolves the cascade for a combination of states, so the assertion is
about what wins on the element rather than about what a rule says. The general rule for the
remaining families: a scoped override is checked against every combination of attributes and
pseudo-classes its target can satisfy at the same time, not only the one it was written against.

### The engraved shortcut letter is not drawn yet

Section 10 asks each slot to engrave its shortcut letter, always visible. The rack draws no letter
here.

No letter key selects a tool in the shipped editor. Escape returns to Select, and nothing else in
the rack is bound to anything. [[ADR-0155-keyboard-and-command-model]] adopted a keyboard model as
a target and was explicit that promoting any specific binding into build work waits on the
deliverability audit and on the reconciliation against the shipped editor. Engraving a letter now
would advertise a keystroke that does nothing, which is the opposite of what section 13 asks of a
mark: that it name itself truthfully within one hover or one keystroke. A decoration is not worth
that trade.

The engraved-mark tier itself is also unreachable from the tokens as they stand. The letter is
specified at 9px, the smallest font-size token under Arris is 11px, and the editor's literal guard
requires every font size to be exactly one `--font-size-*` token, so the value cannot be composed
either. Both halves of the mark wait on work outside this slice.

## Consequences

- The rack reads under the preview: the slot, the glyph, the impression, and the scribe are all
  drawn, and the active slot is legible in both appearances.
- One of the four surfaces ADR-0163 listed as illegible, the 3D navigation toolbar, is now
  closed, and the mechanism that closes the rest is in place rather than pending. The rack itself
  was never on that list; it already wore the segmented option class ADR-0163 repaired, and what
  this slice added for it was scanner coverage. The remaining surfaces on the list are enrolled by
  adding a probe, not by building anything.
- The rack is less dense than the language describes, for the reason ADR-0163 already accepted: a
  32px slot inside a 40px hit box makes the pitch 44px on a fine pointer, not the 36px the spec
  asks for. Arris density lands in the drawn slot, not in the layout.
- The scribe's placement is derived from four measured ratios rather than from the drawing, and
  the derivation is in the test. A reader comparing the rendering against section 10 will see the
  scribe outside the impression rather than on its edge, and that is deliberate.
- The engraved letter is missing from a rack the spec describes as always showing one. Anyone
  reading the preview against the spec will find that gap first. It closes when the keyboard model
  is reconciled with the shipped editor and the rack has real bindings to engrave.
- Nothing here is covered by a rendered baseline. The story suite still has no flag-scoped story,
  so the Arris rendering of this family is asserted from the stylesheets and the palette alone,
  the same limit ADR-0163 recorded.

## References

- [[ADR-0163-drawn-control-height-and-hit-target]]: the two measurements this slice adds a third
  to, the pseudo-element impression idiom, and the addendum this slice extends.
- [[ADR-0162-parallel-design-language-theme]]: the token layer, and the source of the scribe width
  and the reversed active label consumed here.
- [[ADR-0154-arris-visual-design-language]]: the language being migrated.
- [[ADR-0155-keyboard-and-command-model]]: the target keyboard model, and the reason no shortcut
  letter is engraved yet.
- [[ADR-0112-minimum-interactive-target-sizes]]: the hit-target floor the slot is clamped to.
- `docs/specs/2026-07-06-arris-visual-design-language.md`: sections 5, 8, 9, 10, and 13, the
  authority for the ink ramp, the active-state doctrine, the rack, and answerable silence.
- `docs/plans/2026-07-08-arris-migration.md`: the tool selector rack family of Phase 3.
