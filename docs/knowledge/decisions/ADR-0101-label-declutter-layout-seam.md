---
slug: decisions/ADR-0101-label-declutter-layout-seam
title: 'ADR-0101: Deterministic label declutter layout seam'
type: decision
tags:
  [
    architecture,
    editor,
    plan,
    rendering,
    canvas,
    labels,
    rooms,
    dimensions,
    layout,
    declutter,
    overlap,
    testability,
  ]
related:
  [
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0043-dom-overlay-and-accessibility,
    decisions/ADR-0099-2d-plan-renderer-y-up-coordinate-convention,
  ]
sourceFiles:
  [
    editor/plan/label-layout.ts,
    editor/plan/room-label.ts,
    editor/plan/label-constants.ts,
    editor/plan/draw-plan.ts,
    editor/plan/draw-dimension.ts,
    editor/plan/spatial-index.ts,
    editor/plan/viewport.ts,
  ]
status: current
updated: 2026-06-18
---

# ADR-0101: Deterministic label declutter layout seam

## Status

Accepted, landed. A new pure layout module, `editor/plan/label-layout.ts`, sits
between the plan model and the Canvas draw path. The draw path consults it for
where each room label and dimension label goes, instead of painting every label
at its raw anchor with no awareness of its neighbors. The module decides per-room
label visibility from the on-screen footprint and de-conflicts colliding labels
by nudging them apart, all as a deterministic function of rectangles. No
specification or schema text changed; this is an implementation change behind the
existing rendering seam from ADR-0021.

## Context

On dense plans the 2D Canvas renderer painted room labels and dimension labels
on top of one another. A room label drew its name and area at the room centroid.
A dimension label drew its measured length at the midpoint of the offset line.
Each entity was painted in isolation: `drawRoomLabel` and `drawDimension` each
projected one entity and stamped its text down with no measurement of the result
and no pass that could see all label rects together. Small adjacent rooms stacked
their centroid labels into an unreadable pile, and parallel dimension chains laid
their midpoint labels directly over each other. The output on a busy plan was an
illegible blob, which is what the screenshots on the issue showed.

There was no batch step anywhere in the draw path. Both paint paths walked their
entities one at a time, so there was no point at which the renderer knew that two
labels would land in the same place. Resolving the collisions therefore needed a
new pass, not a tweak to either existing path.

The obvious way to know whether two labels collide is to measure them with the
Canvas `measureText` and compare the resulting rects. That route is hostile to
testing. `measureText` is a property of a live drawing context, it varies by
platform and font availability, and it is absent from the drawing-context fake the
plan tests run against. Building declutter on it would have pushed the only proof
of correctness onto pixel-snapshot baselines, which are brittle, slow to update,
and platform-coupled (the darwin home baseline already drifts independently of any
label work). The collision policy is geometry, and geometry deserves a unit test
on rectangles, not a screenshot diff.

## Decision

Introduce a pure, deterministic label-layout module that the draw path consults,
and resolve overlaps on estimated rectangles rather than on pixel snapshots. The
module has five pieces.

- `labelBox(text, anchor, font)` estimates a label's on-screen axis-aligned box
  from a deterministic font metric: an average-glyph-advance ratio times the font
  pixel size times the character count for width, and the font pixel size for
  height, centered on the anchor. It deliberately does not call `measureText`, so
  a box is a pure function of its inputs and can be asserted in a unit test with
  no DOM. The ratio (`0.55` for the 12px sans-serif label face) is a stand-in for
  the real glyph advance, chosen to estimate width closely enough for collision
  decisions while keeping placement reproducible.
- `labelsOverlap(a, b)` is a strict positive-area intersection predicate: two
  boxes overlap only when they share area, so two rects that touch along a shared
  boundary edge do not count as overlapping. It is deliberately not the
  `boundsIntersect` from `spatial-index.ts`. That predicate uses inclusive
  comparisons because its broad-phase query callers (ADR-0032) need edge-touch to
  count as a candidate hit. Declutter needs the opposite: edge-adjacent labels are
  fine and should be left alone, so a separate strict predicate lives here rather
  than overloading the shared one.
- `roomLabelPlacement(room, viewport)` decides per-room label visibility from the
  room's on-screen footprint versus the label size. A room large enough on screen
  shows the full label (name and area); a tighter room shows name only; an unnamed
  room shows area only; and a room too small at the current zoom hides its label
  entirely. Visibility therefore tracks zoom, so panning into a dense area reveals
  more labels and zooming out drops the ones that no longer fit.
- `layoutRoomLabels` and `layoutDimensionLabels` are the batch passes. Each
  projects every label to its anchor, sizes its box, and then de-conflicts the
  colliding boxes through a shared generic `deconflictBoxes` helper. The helper
  walks every pair, and for each colliding pair it pushes the two boxes
  symmetrically apart along the vector between their centers, one bounded nudge
  step at a time, until they are disjoint. Already-disjoint labels are returned
  unchanged at their projected anchor. Hidden room labels keep a degenerate box
  and sit out de-confliction entirely, which is the only behavioral difference
  between the two passes and the reason the skip is a predicate argument to the
  shared helper.
- The Canvas draw path (`drawRoomLabels` and `drawDimensions` in `draw-plan.ts`)
  runs each batch pass once per frame and paints each label at its resolved box,
  skipping the labels the room pass marked hidden. The renderer no longer chooses
  where a label goes; it draws what the layout decided.

Every label anchor funnels through `worldToScreen`, which negates y under the
y-up world convention (ADR-0099). The layout therefore builds on the corrected
orientation: a room centroid or a dimension offset-line midpoint projects to the
same upright screen position the rest of the canvas now uses, so the de-conflicted
boxes land where the labels actually paint.

### Why the layout is separate from the draw path

The renderer consults placement decisions; it does not embed the policy. Keeping
the layout in its own pure module is what makes the collision avoidance testable
on rectangles instead of through pixel baselines, which is the whole point of the
change. It also keeps a single source of truth for the placement rule. The DOM
overlay path renders dimension chips through `dimension-chip.ts` (ADR-0043), and
those chips will want the same declutter behavior for consistency with the canvas.
Because the rule lives in one pure module rather than inside the canvas paint
calls, the overlay can adopt it later without reimplementing it. This change fixes
the canvas path the screenshots came from; aligning the DOM overlay chips with the
same layout module is a follow-up, not part of this change.

## Consequences

- Dense plans are legible. Small adjacent room labels separate instead of
  stacking, parallel dimension chains spread along their offset direction, and
  labels that cannot fit at the current zoom are dropped rather than painted into
  a pile. The canvas reads cleanly where it previously produced a blob.
- Collision behavior is unit-tested on rectangles. Box estimation, the strict
  overlap predicate, per-room visibility, and both de-confliction passes are
  asserted directly on `{ min, max }` boxes with no DOM and no drawing context, so
  the policy is verified without a pixel baseline. The home-plan visual-regression
  baseline still moves to match the new label positions, but it is a consequence
  of the change rather than the proof of it.
- The placement policy has one home. Because the renderer consults the layout
  module instead of embedding the rule, the room and dimension passes share the
  same de-confliction helper, and a future consumer (the DOM overlay dimension
  chips) can reuse the rule rather than fork it.
- The estimate is an estimate. Box width comes from an average glyph advance, not
  from real font metrics, so a label with unusually wide or narrow glyphs is sized
  approximately. The strict positive-area overlap test and the symmetric nudge are
  tolerant of small sizing error, and the constant can be refined later without
  touching any caller, but exact pixel-perfect packing is explicitly not a goal of
  this seam.
- The layout depends on the corrected y-up projection from ADR-0099. The anchors
  it de-conflicts are the same screen points the draw path paints, so the two stay
  in agreement only as long as both project through the single `worldToScreen`
  choke point, which they do.

## References

- ADR-0021 (the 2D plan rendering seam: pure modules behind a Canvas boundary,
  which this layout module extends with a batch placement pass the draw path
  consults).
- ADR-0036 (room metadata and the original Canvas room labels, name and area at
  the centroid, that this change measures and de-conflicts).
- ADR-0032 (the broad-then-narrow hit test and its inclusive `boundsIntersect`,
  which this module deliberately does not reuse because declutter needs a strict
  positive-area overlap test).
- ADR-0043 (the DOM overlay and the dimension chip, the follow-up consumer that
  can adopt this same layout rule for consistency with the canvas).
- ADR-0099 (the y-up world convention and the `worldToScreen` flip every label
  anchor in this module passes through).
