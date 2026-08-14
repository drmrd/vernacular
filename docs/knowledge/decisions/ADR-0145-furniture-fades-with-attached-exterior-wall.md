---
slug: decisions/ADR-0145-furniture-fades-with-attached-exterior-wall
title: 'ADR-0145: Furniture fades with the exterior wall it stands against'
type: decision
tags: [architecture, three-dimensional, transparency, furniture, walls, preview]
related:
  [
    decisions/ADR-0086-near-wall-transparency,
    decisions/ADR-0087-opening-fade-with-host-wall,
    decisions/ADR-0089-within-floor-mesh-reuse,
    decisions/ADR-0094-furniture-massing-in-3d,
  ]
sourceFiles:
  [
    core/scene/wall-attached-furniture.ts,
    core/scene/exterior-walls.ts,
    engine/scene/near-wall-transparency.ts,
    engine/scene/near-wall-transparency-enrollment.ts,
    bridge/react/framed-scene.ts,
  ]
status: current
updated: 2026-08-14
---

# ADR-0145: Furniture fades with the exterior wall it stands against

## Status

Accepted. Part of issue #256 (near-wall transparency refinements). It extends the
near-wall fade ([[ADR-0086-near-wall-transparency]]) and the opening fade
([[ADR-0087-opening-fade-with-host-wall]]) to furniture
([[ADR-0094-furniture-massing-in-3d]]).

## Context

Near-wall transparency fades an exterior wall when the camera looks at the building
from outside, and the doors and windows in that wall fade with it. Furniture does
not. A wardrobe pushed against the faded facade stays solid, so it hangs in front of
a see-through wall instead of receding with it.

An opening carries its host wall id, so the opening fade joined openings to walls by
id. Furniture carries no wall reference. Placement is free-form, and a piece is
"against" a wall only in the geometric sense: its footprint sits on or near the
wall's plan segment. Two questions follow. How does a piece find its wall, and what
happens in a corner, where a piece touches two walls whose fade decisions flip at
different camera angles?

## Decision

Decide attachment in pure core, from plan geometry. `furnitureAttachedToWall` takes
a footprint polygon and a wall's centerline segment with its thickness, and reports
attachment when the polygon comes within reach of the segment: half the thickness
for the wall body, plus `WALL_ATTACHMENT_TOLERANCE_MM` (100 mm) for the gap a
hand-dragged piece keeps from the face. The tolerance is far smaller than common
furniture depths, so a piece in the middle of a room never attaches. The test
composes four existing geometry helpers: a footprint corner within reach of the
centerline, a footprint edge crossing it, a wall endpoint within reach of a
footprint edge, and a footprint that contains the whole segment. The minimum
distance between a polygon and a segment that do not cross is always attained at a
vertex of one against the body of the other, so these cases are exhaustive.

Pair each piece with at most one wall. `withAttachedFurniture` walks the exterior
walls in order and gives each piece to the first wall it is attached to, filling a
`furnitureIds` list per wall. A corner piece touches two walls, and enrolling it in
both fade targets would let the per-frame update apply both walls' decisions in
target order: whenever the camera sees only one wall from outside, the other wall's
restore would overwrite the fade in the same frame, and the piece would stay solid
in a corner where it should recede. One wall per piece removes the conflict, at the
cost that a corner piece follows only its first wall's decision.

Fold the piece into its wall's fade target in the engine pass, exactly as hosted
openings fold. The preparation pass clones the piece's materials into private
instances and adds them to the wall's target, so one camera-side decision drives the
wall, its openings, and its furniture together. The restore-to-start rule from the
opening fade applies unchanged: the neutral massing box is translucent by design, so
after a fade it returns to its own translucent look rather than to blanket solid.
One engine detail: furniture groups carry the raw instance id as their entity id
(the furniture-builder convention), so the enrollment strips the `furniture:` node
prefix before the lookup.

## Alternatives considered

- **A per-piece fade decision.** Decide each piece's fade from its own position and
  the camera. Rejected for the reason the opening fade already recorded: a separate
  test flips a hair before or after the wall's, so the piece and its wall disagree
  for a frame near the switching angle. Riding the wall's one decision keeps them in
  step.
- **Enroll a corner piece in both walls' targets.** Honest about the geometry, but
  the per-frame update applies targets in order, so the second wall's restore
  cancels the first wall's fade whenever only one of them faces the camera. The
  piece would never fade in exactly the corner situations that motivated the
  question.
- **A persistent wall reference on the furniture model.** Give furniture a
  `hostWallId` the way openings have one. Rejected: openings are carved into a wall
  and cannot exist without it, while furniture placement is free-form and changes
  with every drag. A stored reference would need constant upkeep to answer what the
  footprint geometry already answers.

## Consequences

- In scenes built through `buildFramedScene`, a piece standing against a faded
  exterior wall recedes with the wall and returns with it, in step with the wall's
  openings.
- Which pieces fade is a pure core rule, unit tested without the renderer, and the
  proximity threshold is one named constant.
- The incremental reconciler path ([[ADR-0089-within-floor-mesh-reuse]]) prepares a
  floor's fade targets from the wall sub-group alone. Opening fills and furniture
  are sibling sub-groups there, so neither enrolls in that path today; the wall
  itself still fades. Closing that gap needs enrollment over the assembled floor
  root, plus material privatization that survives sub-group reuse without capturing
  a faded state as the restore baseline. That is deferred to follow-up issue #437
  covering openings and furniture together.

## Update (2026-08-14): the reconciler path closes

The last consequence above recorded that the incremental reconciler prepared a floor's
fade targets from the wall sub-group alone, so neither opening fills nor wall-attached
furniture enrolled there. Issue #437 closes that gap on the terms this decision sketched.
Enrollment moved onto the assembled floor root, and both scene-assembly paths now reach it
through one seam, `enrollNearWallTargets`, which runs the `withAttachedFurniture` pairing
itself rather than leaving each caller to remember it. A piece standing against a faded
exterior wall recedes with it in the live view the same way it does in a scene built by
`buildFramedScene`. [[ADR-0089-within-floor-mesh-reuse]] carries the enrollment site and
the material privatization that had to change with it.
