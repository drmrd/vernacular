---
slug: decisions/ADR-0159-plan-ink-weight-hierarchy
title: 'ADR-0159: Plan ink-weight hierarchy: cut, fixture, and annotation roles'
type: decision
tags: [design-system, visual-language, 2d-plan, canvas, theming]
related:
  [
    decisions/ADR-0069-visual-design-language-draughtsmans-restraint,
    decisions/ADR-0154-arris-visual-design-language,
  ]
sourceFiles:
  [
    editor/plan/plan-ink.ts,
    editor/plan/plan-palette.ts,
    editor/plan/draw-opening.ts,
    editor/plan/draw-dimension.ts,
    editor/plan/draw-stair.ts,
    editor/plan/draw-furniture.ts,
    editor/plan/draw-plan.ts,
  ]
status: current
updated: 2026-08-14
---

# ADR-0159: Plan ink-weight hierarchy: cut, fixture, and annotation roles

## Status

Current.

## Context

Every layer of the 2D plan canvas drew at the same 1px line weight. Walls, openings, stairs,
furniture, and dimensions were visually indistinguishable, so nothing on the page told a reader
which lines were the building and which were commentary on it. Drafting convention resolves this
with a weight hierarchy: the cut plane, what a horizontal section actually slices through, reads
heaviest; objects sitting on that plane read at a medium weight; annotation reads lightest.

Two related defects came up during this work and are fixed here too. The wall-break gap fill at
door and window openings was hardcoded to white, painting a bright rectangle over the wall stroke
on a dark canvas. The furniture label draw left `ctx.textAlign` and `ctx.textBaseline` unset, so it
silently inherited whatever a previous draw call left in the shared canvas context, shifting the
label depending on draw order.

## Decision

1. **Three ink roles for the wall, opening, stair, furniture, and dimension ink strokes, not a
   per-layer constant.** `editor/plan/plan-ink.ts` exports `PlanInkRole`
   (`'cut' | 'fixture' | 'annotation'`) and `PLAN_INK_WIDTH`, a lookup table in device-independent
   pixels: `cut: 2.5`, `fixture: 1.5`, `annotation: 1`. Every wall, opening, stair, furniture, and
   dimension ink stroke reads its weight from this table instead of a local literal, so retuning
   the hierarchy is a one-file change for those strokes.

   This promise is scoped to those ink strokes, not to every line width the plan canvas draws. The
   grid, the wall-draw preview line, the snap-indicator marker, the drag-select marquee, the
   move-drag ghost, the underlay calibration line, the surface-paint band and highlight widths, and
   the dimension and furniture selection highlights all remain local literals outside this table.
   Bringing them into the hierarchy is out of scope here and tracked in issue #524.

2. **Role assignment follows what a stroke represents, not which file draws it.** Walls and the
   jamb caps that close an opening's break in the wall stroke are `cut`: they are the structural
   section line. Stairs and furniture footprints are `fixture`: objects sitting within the cut
   plane. Dimensions and labels are `annotation`: commentary over the plan, drawn lightest. An
   opening's door leaf, its swing arc, and a curved head are also `annotation`, since they read as
   a motion diagram layered over the cut rather than part of the cut itself.
3. **Selection and hover emphasis are defined relative to `cut`, not as an independent literal.**
   The opening selection highlight, the selected-room highlight, and the plan-wide hover highlight
   are each `PLAN_INK_WIDTH.cut + 1`. Before this decision each was its own hardcoded constant (2,
   2, and 3) that happened to read heavier than the old uniform 1px ink. Once `cut` moved to 2.5,
   the opening and room selection weight of 2 would have read thinner than the ink they were meant
   to emphasize. Defining emphasis as an offset from `cut` keeps that relationship correct under a
   future retune instead of requiring every emphasis constant to be hand-checked against it. The
   dimension and furniture selection highlights are left as their own literals for now: both still
   clear their ink weight, so nothing is currently wrong, and deriving them is folded into the
   issue #524 sweep instead of this ADR.
4. **`plan-ink.ts` is a module separate from `plan-palette.ts`.** `plan-palette.ts` resolves the
   canvas's colors from the design-system's CSS custom properties, a themed value read at draw time.
   Ink weight is a fixed rendering scale that does not vary by theme. Keeping the two apart keeps
   each module's header claim accurate, and keeps a future theme's color work and its line-weight
   work independent of each other.
5. **The wall-break gap fill now sources from the palette's room fill** (`OpeningPainter.gapFill` in
   `editor/plan/draw-opening.ts`), replacing the hardcoded white so it tracks the canvas's theme.
   This is exact for an interior wall between two unpainted rooms. It is a known mismatch on the
   exterior side of an exterior wall and on a room with a floor-paint override, since the gap paints
   one opaque color regardless of which side or finish actually shows through it. The durable fix is
   a geometric break in the wall stroke rather than a painted-over gap, tracked in issue #521.
6. **The furniture label sets `textAlign`/`textBaseline` explicitly** before every draw, in
   `editor/plan/draw-furniture.ts`, matching the pattern `draw-dimension.ts` already used. The label
   position no longer depends on what a previous draw call left behind in the shared canvas context.

### Reconciling with the icon-stroke coupling

[[ADR-0069-visual-design-language-draughtsmans-restraint]] and its spec
(`docs/specs/2026-06-13-visual-design-language.md`) tie the shipped icon set's 2px effective stroke
to the plan canvas: the stroke width is chosen to match the line weight of wall outlines, so icons
and walls were meant to read at the same visual weight. The Arris spec
(`docs/specs/2026-07-06-arris-visual-design-language.md`, the target language under
[[ADR-0154-arris-visual-design-language]]) independently specifies a 1.5px icon stroke, with no
claim of coupling it to plan geometry at all.

Neither prior statement survives this decision unchanged. `PLAN_INK_WIDTH.cut` (2.5px) is now the
authoritative wall weight for the plan canvas, and the coupling in ADR-0069 was already an
approximation before this change: a wall's actual stroke width is `wall.thickness *
viewport.scale`, not a fixed pixel value, and the 1px (now 2.5px) constant only ever applied as the
floor at extreme zoom-out. The 2px figure was never a maintained invariant checked against the
canvas, and it is not one now.

Going forward, icon stroke width and plan canvas ink weight are independent decisions, each owned
by its own document: this ADR and `PLAN_INK_WIDTH` govern the canvas, and the visual-design-language
ADR in force (ADR-0069 today, moving to Arris as it ships) governs icon stroke width. That the
Arris spec's 1.5px icon stroke happens to equal `PLAN_INK_WIDTH.fixture` is a coincidence, not a
coupling worth preserving. Editing either document going forward does not require keeping the
numbers in sync.

## Rationale

A weight hierarchy is a standard drafting convention because it lets a reader parse a plan at a
glance, telling the building's actual structure apart from the furniture inside it and the
measurements annotating it, without reading a single label. Coupling icon stroke width to a canvas
rendering constant added a second reason a plan-ink change could break something, the icon set, for
a payoff that was never verified once walls started drawing at variable width instead of a fixed
weight. Decoupling the two removes that hazard and states plainly which artifact governs which
surface.

Deriving selection and hover emphasis from `cut` rather than hardcoding them closes a class of bug
this same change would otherwise have introduced: an emphasis constant silently drifting out of
correct relative order the next time `cut` is retuned. It is the same single-lookup-table reasoning
applied one level up, from the base weights to the derived ones.

## Consequences

- `editor/plan/plan-ink.ts` is now the single place that defines the cut/fixture/annotation ink
  strokes. A future theme, including Arris once it reaches the canvas, retunes those strokes there;
  the literals listed in decision 1 still need a per-file edit until issue #524 lands.
- `editor/plan/plan-palette.ts`'s header claim, that it holds the colors the 2D plan canvas draws
  with, is accurate again now that ink weight lives in its own module.
- Net against origin/main: the opening selection highlight widened from 2px to 3.5px, the hover
  highlight from 3px to 3.5px, and the selected-room highlight from 2px to 3.5px. The wall-stroke
  floor and the opening jamb caps both widened from 1px to 2.5px, so a wall at extreme zoom-out, or
  an opening's wall-break jamb, now draws 2.5 times heavier than before this branch. No committed
  visual baseline covers the 2D plan canvas as of this change (checked: the home-page baseline
  renders an empty new project with no walls; the Storybook and scene-webgl baselines do not render
  `PlanView`), so none needed a refresh.
- The door leaf, swing arc, and head arcs are net unchanged at 1px. They moved to 2.5px partway
  through this branch's history and split back out to the annotation weight in a later cycle, so
  comparing the branch's start and end states shows no change there.
- ADR-0069 and the visual-design-language spec's icon/wall coupling claim is superseded by this ADR
  for the plan-canvas half of that claim. The icon half is untouched and still governs icon stroke
  width. Neither document is edited by this ADR; a future pass through either can drop the stale
  coupling language.
- The wall-break gap fill's known mismatch, on the exterior side of exterior walls and in
  painted-floor rooms, is carried forward as a documented limitation rather than silently accepted.
  Issue #521 tracks the geometric fix that removes the gap-fill approach entirely.
- The grid, preview, snap-marker, marquee, ghost, underlay calibration, surface-paint, and
  dimension/furniture selection line widths stay outside `PLAN_INK_WIDTH` for now. Issue #524
  tracks deriving them from the hierarchy in a later sweep.

## References

- [[ADR-0069-visual-design-language-draughtsmans-restraint]] (the shipped language; its icon-stroke
  claim this ADR reconciles).
- [[ADR-0154-arris-visual-design-language]] (the target language; its icon stroke addressed here
  without coupling to it).
- `docs/specs/2026-06-13-visual-design-language.md` (the shipped spec's icon-stroke section).
- `docs/specs/2026-07-06-arris-visual-design-language.md` (the Arris spec's iconography section).
- `editor/plan/plan-ink.ts` (`PlanInkRole`, `PLAN_INK_WIDTH`).
- `editor/plan/plan-palette.ts` (`PlanPalette`, `resolvePlanPalette`).
- `editor/plan/draw-opening.ts`, `draw-dimension.ts`, `draw-stair.ts`, `draw-furniture.ts`,
  `draw-plan.ts` (the role assignments).
- Issue #521 (the durable geometric fix for the wall-break gap fill).
- Issue #524 (the line-weight sweep for the remaining plan-canvas literals).
