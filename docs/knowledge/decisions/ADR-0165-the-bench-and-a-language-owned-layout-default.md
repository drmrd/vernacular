---
slug: decisions/ADR-0165-the-bench-and-a-language-owned-layout-default
title: 'ADR-0165: The bench, and a layout default the language owns'
type: decision
tags: [design-system, visual-language, css, layout, accessibility, a11y, tokens]
related:
  [
    decisions/ADR-0163-drawn-control-height-and-hit-target,
    decisions/ADR-0162-parallel-design-language-theme,
    decisions/ADR-0154-arris-visual-design-language,
    decisions/ADR-0112-minimum-interactive-target-sizes,
    decisions/ADR-0111-story-coverage-guardrail-and-backfill-policy,
  ]
sourceFiles:
  [
    editor/design-system/app-frame.css,
    editor/design-system/app-frame.tsx,
    editor/design-system/panel-slot.css,
    editor/design-system/section-label.css,
    editor/design-system/arris-effective-label.test.ts,
    editor/shell/inspector.css,
    editor/plan/opening-inspector.css,
  ]
status: current
updated: 2026-08-16
---

# ADR-0165: The bench, and a layout default the language owns

## Status

Current. This is the panels and structure family slice of the Arris migration, after
the token layer in [[ADR-0162-parallel-design-language-theme]] and the control
families in [[ADR-0163-drawn-control-height-and-hit-target]]. Draughtsman's
Restraint is still the shipped language and still the resolved default.

## Context

Arris describes docked chrome as a workbench: one piece of material, dead flat,
with sections told apart by a kerf line rather than by cards, tones, or shadows.
The shipped frame is the opposite in three specific ways. Its panes are rounded and
bordered so they read as separate cards, the frame insets the canvas rather than
letting the sheet run to the edge, and the section header is a small caption instead
of a stamped mark on a row of its own.

Most of that is a matter of pointing existing rules at existing tokens under the
preview scope, which is the bounded exception ADR-0163 already argued for. One item
would not go that way. The language publishes a docked panel width, and the panes
read theirs from an inline custom property the frame writes on every render. An
inline declaration outranks every stylesheet rule, so the stylesheet fallback beside
it can never fire and a scoped rule cannot reach the value at all. Setting the width
outright under the scope would win, and would take the keyboard resize away from
anyone previewing the language.

ADR-0163 also left a list of illegible surfaces behind. Its scanner resolves the
cascade for a control state and measures the winning label against the ground it
truly lands on, but it could only name stylesheets inside the design system, and the
surfaces that pair the active fill with the ordinary text ink live outside it. Two of
them belong to this family: the inspector's selection count and the opening
inspector's fraction chips, both filed as issue #551.

## Decision

### Declarations that look redundant

The scoped block says a docked pane is flat, square, and edged with a kerf line,
even where a declaration resolves to what the shipped language already renders. An
elevation of `none` on a pane that casts no shadow today is not bookkeeping: it puts
the flatness in the stylesheet, so a later shadow has to argue with a line someone
wrote on purpose rather than land in a gap. The same reasoning restates the section
gutter at 8px. The Arris layer redeclares the whole spacing scale, so the step itself
was never at risk; what the restatement pins is which step a section clusters on,
because the base rule is free to be re-pointed at another one.

### Letting the sheet reach the edge moves the frame onto the bench

Dropping the frame's padding is what makes the canvas run edge to edge, and it has
a second effect that is easy to miss. The frame's own background stops being hidden
and starts showing through the 8px gutters between regions. That ground was the
canvas surface, chosen back when the frame never showed any of it, and on a bench
made of Beech the gutters would have rendered as strips of Rag Vellum laid between
the panels: paper on the outside of the panels, which is the sheet-and-bench
relationship read backwards.

So the frame is seated on the panel surface under the scope. The plan view paints
the sheet on its own element, so the drawing loses nothing by the frame beneath it
going darker.

### A layout default the language owns, with the resize left alone

The pane's inline custom property carries `var(--size-panel-docked-width)` until the
user resizes it, and the user's own value from then on. The frame keeps writing the
property on every render, so nothing about the pane's shape in the DOM changes; what
changes is that before the first resize the value is a token the language resolves
rather than a number this component picked.

The obvious alternative is to omit the property until the first resize and let the
stylesheet fallback do the work. That renders correctly, but it makes the attribute
appear out of nowhere on a keypress for no reason a reader of the DOM could infer.
Comparing the live size against the initial one on each render is worse. Resize away
and back, and the pane silently jumps to the other language's width, because a
comparison cannot tell "never touched" from "touched and returned".

The rail is deliberately not included. It is the tool rack's home and sizes to its
slots, and a 280px tool rail would be wrong the moment the rack lands.

### The grain is generated, and it sits under the content

The one texture the language allows rides the two docked panes and nothing else. It
is inline SVG noise rather than a shipped image, so there is no asset to fetch and
none to go stale. One copy covers both appearances, because at 1.5 percent over
either bench the grain reads as texture rather than as tone. It draws into a
pseudo-element at a
negative layer so it paints above the pane's background and below its content, which
means the pane has to become a stacking context of its own. That is the same
isolation idiom ADR-0163 introduced for the drawn control impression.

### The scanner names any stylesheet in the repo

A probe now names either a design-system stylesheet by its bare filename or any
other stylesheet by its repo-relative path. This is the widened scan root ADR-0163
asked for, not a second scanner, and it is one expression rather than a second code
path: a name containing a separator resolves from the repo root, and a bare name
resolves inside the design system.

Both surfaces this family owns are enrolled through it. Both failed at exactly
1.00:1 in both appearances before the fix, which is the number that names this
defect, and both were repaired the way ADR-0163's addendum prescribes. The filled
states take the reversed label role in their unscoped rule, where the shipped
language resolves it to the ordinary text ink and nothing moves. The scoped hover
rule then drops the fill Arris does not want and restates the label with it, because
the declaration that reversed it is still in force underneath.

The fraction chip needed one thing the design-system controls did not. Its resting
impression paints the bench it sits on rather than staying transparent. A cancelled
fill leaves the label sitting on something, and the scanner can only measure a ground
the stylesheet is willing to name.

### A control can be in two states at once

The chip taught the addendum's lesson a second time, in a form the guard could not
see. Selecting a chip and then hovering it put both rules in play, and the scoped
hover rule is the more specific of the two, so it took the label while the active
fill sat on a pseudo-element hover never touches. That is the reversed label landing
back on the fill it was reversed away from, at 1.00:1 in both appearances again.

Two things follow. The fix is to restate the reversal at the hover rule's own
specificity and later in the file, which hands the selected chip its label back
without weakening the plain hover state. And the guard now takes a second state per
probe, because a control in two states is matched by the rule for each state as well
as by the rule for both, and a candidate set built from only the base and one state
leaves out the rule that actually wins.

The design system escaped this by luck rather than by design. Its pressed state is an
attribute selector, which ties `:hover` on specificity and wins on source order; a
modifier class loses. Any family that signals a selected state with a class inherits
this problem, so the probe belongs with the family, not with the chip.

### No panel-header component

The migration plan lists a panel header alongside the four existing pieces. It is
not here. The two halves of the exemplar are covered by what already exists: the
section label takes the stamped treatment and a band of the drawn control height, so
a header sits on the same rhythm as the controls beneath it, and the kerf between
adjacent sections carries the separation.

What is missing is the header's own closing kerf and its flush-right micro-actions,
which want a wrapper element around a label and an action slot. Adding one means
adding an exported component, and the story-coverage ratchet
([[ADR-0111-story-coverage-guardrail-and-backfill-policy]]) then requires either a story or an allowlist
entry. A story would need a rendered baseline, and those render only on CI, which
this slice is not in a position to refresh. The component belongs with the story
work already tracked in issue #551.

## Consequences

- Previewing Arris shows a frame that reads as one bench. With the flag off nothing
  moves: every new rule is scoped, and the three unscoped edits are token-role swaps
  the shipped layer resolves to what was there before.
- The resize model does not know the language set the width the pane started from,
  and that shows twice under the flag. The separator announces the pre-resize number
  in `aria-valuenow` while the pane renders wider, and the first press of the grow
  key takes the inspector from 17.5rem to 16rem, so growing it narrows it once. Both
  close the same way, by teaching the resize hook about a default it does not own,
  and both are preview-only: with the flag off the token resolves to the number the
  hook already starts at. Tracked as a follow-up alongside issue #551.
- The remaining families have a pattern to copy when they hit the same wall. The
  status rail and the tool rack both carry a size the language wants to set.
- The Arris ink ramp is still not measured against its true grounds. The stamped
  header takes the 80 percent tier on the strength of the ramp published in
  ADR-0162, and the tier's own contrast gate remains that slice's deferral, because
  the contrast helper reads hex and the ramp is expressed as `color-mix`.
- The fraction chips keep the interface face. Setting an increment in the data face
  is the instruments family's call, not this one's.
- The chip is the fourth copy of the drawn-control idiom, after the push button, the
  icon button, and the segmented option, and re-typing it is what carried the
  specificity bug above: the shared idiom's ordering guarantee did not come with it.
  The icon button escapes the same trap only by accident, because an attribute
  selector ties `:hover` on specificity and wins on source order where a modifier
  class loses. Issue #551 schedules at least two more copies, and extracting the
  idiom crosses the design-system and plan stylesheets, so it wants deciding before
  copy five.
- `PanelSlot` has no consumer in the running app today. The panel sections in the
  inspector and the tool rail compose a section label with their own markup, so the
  kerf line separates nothing on a live surface yet. It is the design system's
  statement of what a section boundary is, and the surfaces adopt it when they are
  migrated.
- Nothing here is covered by a rendered baseline, for the same reason ADR-0163 gave:
  there is no flag-scoped story yet, so the Arris rendering of these families is
  asserted from the stylesheets alone.

## References

- [[ADR-0163-drawn-control-height-and-hit-target]]: the scanner this slice widens,
  the hover-cancellation lesson it applies, and the illegible-surface list it works
  through.
- [[ADR-0162-parallel-design-language-theme]]: the token layer every value here
  reads, and the source of the ink ramp and the docked width.
- [[ADR-0154-arris-visual-design-language]]: the language being migrated.
- [[ADR-0112-minimum-interactive-target-sizes]]: the hit-target floor the fraction
  chip keeps on its own box.
- [[ADR-0111-story-coverage-guardrail-and-backfill-policy]]: why a new exported component is not free.
- `docs/specs/2026-07-06-arris-visual-design-language.md`: sections 6, 7, and 10, the
  authority for the bench, the kerf line, the grain, and the stamped header.
- `docs/plans/2026-07-08-arris-migration.md`: the panels and structure family slice.
- Issue #551: the illegible consumer surfaces and the story-baseline work.
