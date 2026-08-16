---
slug: decisions/ADR-0166-raised-objects-and-notification-tiers
title: 'ADR-0166: Raised objects, and which notifications get to be one'
type: decision
tags: [design-system, visual-language, elevation, notifications, accessibility, contrast, css]
related:
  [
    decisions/ADR-0163-drawn-control-height-and-hit-target,
    decisions/ADR-0162-parallel-design-language-theme,
    decisions/ADR-0154-arris-visual-design-language,
    decisions/ADR-0112-minimum-interactive-target-sizes,
  ]
sourceFiles:
  [
    editor/design-system/menu-surface.css,
    editor/design-system/notifications/banner.css,
    editor/design-system/notifications/toast.css,
    editor/shell/project-menu.css,
    editor/shell/export-menu.css,
    editor/design-system/arris-effective-label.test.ts,
  ]
status: current
updated: 2026-08-16
---

# ADR-0166: Raised objects, and which notifications get to be one

## Status

Current. This is the raised-objects family slice of the Arris migration, after the token layer in
[[ADR-0162-parallel-design-language-theme]] and the button and field families in
[[ADR-0163-drawn-control-height-and-hit-target]]. Draughtsman's Restraint is still the shipped
language and still the resolved default.

## Context

Arris publishes two elevation tiers and no third. The bench, meaning everything docked, is dead
flat and separated by kerf lines. A raised object is something the user has physically picked up,
and only it casts a shadow: `0 2px 8px` at 25 percent black, over a 1px border. Refusal 4 says
where that tier stops. Nothing floats over the canvas uninvited, and toasts are named in it
explicitly. A menu, a dialog, or the command deck is exempt because the user summoned it and it
leaves on Escape.

Four surfaces in this family had never been told which side of that line they were on. The shared
menu surface, the project dropdown, and the export dropdown all reach for `--elevation-overlay`, a
role the Arris token layer aliases onto the raised tier and the shipped layer does not. The banner
and the toast both sit on the panel surface with the same border and the same rounding, so the one
that floats and the one that is a row of the app frame render as the same object.

The family also inherited two defects from the slice before it. ADR-0163 moved the Arris button's
impression into a pseudo-element, and a menu row is a button, so under the preview every row
gained the bordered box the dropdown idiom deliberately does without. And that ADR listed the
consumer stylesheets its scanner could not see, including the project and export menu rows, which
paint the active fill and say nothing about the label. Under the shipped language the two colors
differ and the bug is invisible; under Arris the active fill is the text ink, so a hovered row is a
solid block with nothing readable in it. ADR-0163 said the scan root was what would close that
gap, and tracked it as issue #551.

## Decision

### A picked-up thing names its own tier

Each raised surface declares `box-shadow: var(--elevation-raised)` inside the Arris scope rather
than leaving the question to whichever role its unscoped rule happens to reach for. The resolved
shadow is the same today, because the token layer aliases the overlay role onto the raised tier.
The alias is a convenience, not the doctrine, and a rule that depends on it reads as though a menu
takes a deeper tier that Arris does not have.

Shape follows from the same paragraph. Section 7 squares off docked panels and the status bar, so
a surface the user summoned and dismisses with Escape is outside that sentence and keeps the
machined 2px chamfer the language gives everything else.

### The notification tier decides the doctrine

A toast is pinned over the canvas, which is what refusal 4 refuses. The carve-out is written for a
thing the user summoned that leaves on Escape, and a toast is neither. While the tier exists it is
at least held to the raised-object doctrine: the one shadow, a resting border, the chamfer, and
the raised material rather than the bench it is not sitting on. It also stops sliding in, because
nothing moves unless the user moved it and an arriving toast is the one thing on screen the user
did not touch.

A banner is a row of the app frame, above the canvas rather than over it. That makes it bench, so
it is square and casts nothing. With both of them on the panel surface, nothing on screen said
which object had been picked up, so the elevation doctrine was invisible in the one place it had
two objects to tell apart.

### A menu row is cut from the surface, not stacked on it

The resting row keeps the raised material the button impression paints and drops its border, so a
menu reads as a stack of rows cut from one piece instead of a column of separate tools. Hover
brings the border back at the active weight and cancels the fill, which is the Arris hover doctrine
applied to a row: brighten a border, never bloom a glow.

Cancelling that fill obliges the rule to restate the label, which is the general lesson the
ADR-0163 addendum ended on. The declaration that reversed the label to the ground is still in force
at a lower specificity, and a reversed label over the resting material is the same ink on the same
ground. Every hover rule in this slice therefore says `color: var(--color-text)` beside the
cancelled background.

Naming the material on the row's impression does a second job. It states the ground the label
actually lands on, which is what the cascade scanner needs in order to measure anything.

### Severity stops being a color

Layout Blue exists as lines and glyphs in an enumerated set of roles, and nothing else borrows it.
A severity stripe is not in the set, and neither is an action label. Red Lead is narrower still:
destructive actions and data-loss warnings only, on perhaps one control per screen. So the toast's
4px colored left edge goes back to the ordinary resting border, and the action label leaves the
accent for full ink, which is also where the contrast floors want it. An action is a word the user
has to read and act on, so it belongs in the 7:1 body tier rather than the 3:1 accent tier. Dismiss
keeps the secondary tier, since its meaning survives on position and its own label.

That leaves one lawful Red Lead use in this family, and section 12 already specifies it. A
data-loss warning renders its words at full ink and carries a 2px Red Lead rule beneath and a Red
Lead dot, with the rest of the frame left on the ordinary border. Red Lead running text is retired
because it falls below the label floor. The alarm is the rule and the dot; the legibility is the
ink. Both notification tiers obey it, because the custody doctrine is stated once for every surface
that touches saving, storage, import, or export.

### The scanner reaches outside the design system

`arris-effective-label.test.ts` resolved probe stylesheets against `editor/design-system`, which is
why the consumer surfaces ADR-0163 listed were out of its reach. A probe now names a design-system
stylesheet by bare file name and anything else by its repo-relative path. That is the scan-root
widening ADR-0163 asked for rather than a second scanner, and it closes the menu-row half of issue
#551.

## Consequences

- The preview is legible for menus, dropdowns, and notifications in both appearances. The four
  scoped families and the two consumer stylesheets are all under the cascade scanner now.
- The raised-tier rule is stated three times, because the project and export dropdowns still copy
  the shared menu surface's chrome instead of wearing its class. Consolidating them is a component
  change, and this slice stayed in the stylesheets.
- `.ds-menu-surface` is also worn by the furniture library panel, which is docked and should be
  square and flat by the same section that raises a menu. The shared class already carried the
  overlay shadow, so nothing about that surface changed here, but the raised doctrine now reaches a
  bench surface by name. Separating the two is a component change for the library family's own
  slice.
- Several scoped rules tie on specificity with `button.css` and `icon-button.css` and win on
  stylesheet order. Every consumer imports the design system before its own stylesheet, which is
  the same ordering `project-menu.css` already depended on for its trigger hover. A future import
  reshuffle would break it quietly, and only the rendered baselines would notice.
- The toast still floats. Refusal 4's actual endpoint is that this tier does not exist and custody
  lives permanently in the status rail, which is a save-and-storage change rather than a stylesheet
  one. Nothing here commits to keeping the tier.
- Success and warning notifications read the same as an ordinary one under Arris. The message text
  and the alert role carry the difference, which is what principle 6 asks for, but it is a real
  reduction in at-a-glance signal and worth watching. `--color-warning` and `--color-positive` are
  still referenced with fallbacks and exist in neither token layer.
- Nothing changed in any component, so no story moved and no baseline needed a refresh. Nothing
  here is covered by a rendered baseline either: the story suite still has no flag-scoped story, so
  the Arris rendering of this family is asserted from the stylesheets alone. That is the other half
  of issue #551.
- The reduced-motion cancel on the toast entrance is now redundant under Arris, since the scoped
  rule removes the animation outright. It still matters under the shipped language.

## References

- [[ADR-0163-drawn-control-height-and-hit-target]]: the impression pseudo-element this family
  inherits, the addendum about cancelled fills, and the list of illegible consumer surfaces.
- [[ADR-0162-parallel-design-language-theme]]: the token layer, the attribute scope, and the
  overlay alias this slice declines to lean on.
- [[ADR-0154-arris-visual-design-language]]: the language being migrated.
- [[ADR-0112-minimum-interactive-target-sizes]]: the hit-target floor menu rows keep.
- `docs/specs/2026-07-06-arris-visual-design-language.md`: sections 5, 7, 8, 12, and 14, the
  authority for the ink ramp, the two elevation tiers, the hover doctrine, custody, and the
  refusals.
- `docs/plans/2026-07-08-arris-migration.md`: the raised-objects family of Phase 3.
- Issue #551: the consumer surfaces and the missing flag-scoped story baseline.
