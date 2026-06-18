---
slug: decisions/ADR-0098-keep-or-remove-the-sidebar-overall-section
title: 'ADR-0098: Keep or remove the sidebar Overall section'
type: decision
tags: [editor, left-rail, ux, title-block, design-system]
related:
  [decisions/ADR-0068-pdf-export, decisions/ADR-0069-visual-design-language-draughtsmans-restraint]
sourceFiles:
  [
    editor/shell/overall-dimensions.tsx,
    editor/shell/overall-dimensions.css,
    editor/shell/editor-shell.tsx,
    editor/plan/fit.ts,
    docs/specs/2026-06-14-editor-shell-realignment.md,
  ]
status: current
updated: 2026-06-18
---

# ADR-0098: Keep or remove the sidebar Overall section

Date: 2026-06-18
Status: Accepted

## Context

The left rail carries a small "Overall" section that prints the drawn plan's
overall width by height. The reporter for issue #270 was not sure the section
earns its place and said removing it would be fine. The ask was a design and UX
review with a decision behind it: keep the section as it stands, restyle or
move it, or drop it.

The section is not the only thing pulling on that part of the rail. Issue #228
wants the Furniture and Underlay menus to sit above the divider that the Overall
block owns, so the block's position and its border are already in play. Issue
#279 will fold the rail's hand-rolled section labels into a shared
`ds-section-label` style, which touches this section's label whatever we decide
here. So the question is not only whether the readout is useful, but whether its
current shape fits where the rail is heading.

This record settles the decision. It does not change any UI. The keep, move, or
remove code change is a separate follow-up that carries its own work and its own
review, so issue #270 closes on the decision alone.

## What the section does

`OverallDimensions` renders one line: an "Overall" label over a `W × H` value.
The width and height come from `planExtent` (`editor/plan/fit.ts`), which is the
bounding box of the active floor's wall endpoints and room polygons. The shell
narrows the scene graph to the active floor before measuring, so the readout
reports the floor on screen rather than every floor stacked together. The two
numbers are formatted in the project's units through `formatAdaptiveLength`.

The block hides itself on an empty plan: `planExtent` returns null when nothing
is drawn, and the component returns null in turn, so a blank project stays
uncluttered. Its CSS sets `margin-top: auto`, which floats the block to the
bottom of the rail column against a `border-top` divider, so it settles at the
foot of the rail the way a drawing's title block sits at the foot of the sheet.
The label uses the rail's uppercase
section-label styling and the value uses the monospace dimension face from the
visual design language (ADR-0069).

In the source the block sits between the tool navigation and the Furniture and
Underlay menus, but `margin-top: auto` pushes it visually to the bottom. That gap
between source order and rendered position is the same tension issue #228 is
working against.

## Is it duplicated?

No. The overall bounding-box extent appears nowhere else in the editor. The
rulers print interval tick labels along the canvas edge, not a whole-plan size.
The dimension tool draws measurements the user places by hand, and the dimension
inspector reports a single annotation's length. The entity inspector shows only
the selected wall, room, or opening, never the plan as a whole. The status bar
reports the active tool, snap state, cursor coordinates, units, and zoom. The
plan overlay carries a scale bar and a compass. None of these answers "how big is
the whole drawing" at a glance. The Overall section is the only surface that
does, which is a point in favor of keeping the information in some form.

## Options

### Keep as is

The readout is unique, as the duplication check shows, and the cost to maintain
it is low. It matches the title-block convention the design language leans on,
and it disappears on an empty plan so it never clutters a fresh project.

Against: a whole-plan size is something a user glances at occasionally, not
constantly, so the section spends rail height on low-frequency information. The
label is hand-rolled rather than the shared section-label style. And the divider
the block owns is exactly the one issue #228 needs to move the Furniture and
Underlay menus above, so leaving the block where it is keeps a known collision in
place. This is the weakest option.

### Restyle and move into the title block

The editor-shell realignment spec
(`docs/specs/2026-06-14-editor-shell-realignment.md`, lines 86 to 89) already
calls for the project-identity block at the top of the rail to carry the
project name, a period subtitle, and the plan's overall dimensions. Folding the
extent into that block matches the spec's intent, gathers the title-block idea
into one place, and frees the mid-rail divider so issue #228 can arrange the
menus the way it wants. The unique information survives the move.

Against: the project-identity block gets denser, and the readout has to read
well above the tool list rather than anchored at the foot of the rail. That is a
layout question the follow-up has to handle with care, not a reason against the
direction.

### Remove

The simplest path. The reporter is fine with it, and on-demand measurement is
already covered: the rulers give a sense of scale, and the dimension tool measures
any span the user cares about.

Against: removing the section drops the only at-a-glance whole-plan size and
gives up a title-block affordance the realignment spec asked for. The information
is genuinely unique, so removal is a real loss rather than a tidy-up.

## Decision drivers

- The extent is unique. No ruler, dimension tool, inspector, status bar, or
  overlay reports it, so removing the section removes the only place it lives.
- A whole-plan size is glanced at now and then, not watched, so it does not need
  prime, always-visible rail height.
- Issue #228 needs the divider this block owns, so the block's current position
  is a standing obstacle.
- The realignment spec already places the overall dimensions in the
  project-identity block, which gives the move a home that is already specified.
- Issue #279 will replace the hand-rolled section label with the shared
  `ds-section-label` regardless of what happens to this block, and issue #277's
  inspector grouping pass informs how a consolidated title-block group should read.

## Decision

Fold the overall-extent readout into the project-identity title block at the top
of the rail, and drop the standalone mid-rail block together with its divider.
This honors the realignment spec, clears the divider issue #228 is fighting, and
keeps the unique information the duplication check turned up.

If the owner prefers the smallest possible change, removing the section outright
is an acceptable fallback. The reporter endorses removal, and the rulers and the
dimension tool cover measurement on demand. Keeping the section exactly as it is
today is the weakest choice, because it leaves the issue #228 divider collision
unresolved and keeps the copy-pasted section-label idiom that issue #279 is
retiring anyway.

The actual UI change is a separate follow-up. This issue closes on the decision.

## Consequences

- A follow-up issue carries the code change: either move the readout into
  `editor/shell/project-identity.{tsx,css}` and delete
  `editor/shell/overall-dimensions.{tsx,css}`, or delete the standalone block
  outright. Either way the mount at `editor/shell/editor-shell.tsx` stops
  rendering `OverallDimensions` in the mid-rail.
- `planExtent` in `editor/plan/fit.ts` stays. The fold reuses it from the
  project-identity block, and `fit.test.ts` keeps covering the bounding-box
  computation. Only `overall-dimensions.test.tsx` moves or retires with its
  component.
- Changing the rail layout will drift the editor's home-scene visual baseline, so
  the follow-up regenerates that snapshot rather than this docs-only change.
- Sequence the follow-up after issue #279, which owns the shared shell and
  section-label files, and coordinate with issue #228 on the divider and the menu
  order. Issue #279 handles the section-label styling whichever direction lands.
- The section-label styling cleanup is independent of this decision. Issue #279
  applies it to the rail regardless of whether the Overall block moves or goes.

## References

- Issue #270 (this decision), #228 (tool-rail menus and the divider), #279
  (design-system section-label consolidation), #277 (inspector grouping pass).
- Spec: `docs/specs/2026-06-14-editor-shell-realignment.md` (lines 86 to 89 place
  the overall dimensions in the project-identity block).
- ADR-0069 (the visual design language whose monospace dimension face and
  section-label idiom this block uses), ADR-0068 (PDF export, which defers a full
  page title block and so leaves the in-editor extent as the only title-block
  element today).
