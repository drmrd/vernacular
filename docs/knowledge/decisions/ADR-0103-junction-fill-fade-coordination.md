---
slug: decisions/ADR-0103-junction-fill-fade-coordination
title: 'ADR-0103: Junction fill stays opaque when an incident wall fades'
type: decision
tags: [architecture, three-dimensional, transparency, walls, junctions, preview]
related:
  [
    decisions/ADR-0082-three-dimensional-wall-junction-fill,
    decisions/ADR-0086-near-wall-transparency,
    decisions/ADR-0087-opening-fade-with-host-wall,
    decisions/ADR-0080-generalized-wall-junction-geometry,
  ]
sourceFiles:
  [
    core/scene/junction-fade.ts,
    core/scene/exterior-walls.ts,
    engine/scene/junction-fill-builder.ts,
    engine/scene/near-wall-transparency.ts,
    engine/scene/floor-subgroups.ts,
    bridge/react/framed-scene.ts,
  ]
status: current
updated: 2026-06-18
---

# ADR-0103: Junction fill stays opaque when an incident wall fades

## Status

Accepted. Issue #227, a seam between two earlier decisions that did not know about each
other. The wall-junction fill ([[ADR-0082-three-dimensional-wall-junction-fill]]) is
non-pickable and carries no entity id, and near-wall transparency
([[ADR-0086-near-wall-transparency]]) builds its fade membership entirely from exterior
wall entity ids. This issue forces the two to meet.

## Context

At a T-junction the leg wall's end is mitered so it tucks behind the through (bar) wall
and the junction fill that covers the corner core (ADR-0080, ADR-0082). The fill is the
small polygon a junction's incident walls leave uncovered, and it doubles as the cover
over each wall's mitered end and as the solid mass that keeps the bar reading as a divider
between the two rooms it splits.

Near-wall transparency fades an exterior wall when the camera looks at the building from
outside it. When the camera fades the bar wall, two problems appear. The bar's mitered
neighbor, the leg, is no longer hidden, so its angled end reads as a wall tapering to a
point rather than ending squarely. And the fill that sat behind the bar does nothing to
help, because the fill is outside the fade system entirely: ADR-0082 deliberately gave it
no entity id, and ADR-0086's fade pass only privatizes and animates meshes it can find by
an entity id present in an `ExteriorWall`. So the fill is never enrolled, never animated,
and never coordinated with the bar. Whether the seam shows depends only on which of the
leg or bar happens to be the faded wall for the current camera, with the fill sitting
statically opaque behind both. As the bar fades, the now-exposed leg miter and the two
rooms the bar divided merge into one space.

The fix needs the fill to participate in the fade decision. The fill already reads the
walls' resolved corners (ADR-0082), so the only missing link is that the fade pass cannot
see it and the fill carries no policy about what it should do when a neighbor fades.

## Decision

Keep the junction fill opaque when any incident exterior wall fades, and bind the fill's
fade state to the same per-junction decision its incident walls use, computed by a pure
core selector. Three pieces.

### A pure core selector pairs each junction with its exterior walls

A new pass in `core` (`junctionFadeGroups(graph, walls, rooms, openings)` in
`core/scene/junction-fade.ts`) enumerates every 3+-way junction, the same incidence
threshold the fill pass uses, and returns one group per junction. Each group carries the
junction's identity (its incident `edgeIndexes`, the same key the fill is built from) and
the subset of incident walls that are exterior, joined through the existing
`exteriorWalls` pass. A junction with no incident exterior wall yields a group with no
members. The selector stays in `core` as pure plan data over the graph, gated by Node
tests, so the rule for which junctions stay opaque is verified without the renderer.

The membership join carries the policy. A group with one or more incident exterior walls
sets `fillStaysOpaque`, the issue's chosen rule: the fill holds at its solid baseline
while any member wall fades, so the leg-end cover and the room divider persist. The policy
is a property of the data, not buried in per-frame engine glue, so a later slice could
choose a different policy without re-deriving membership.

### The junction fill carries a non-pickable junction tag

`buildJunctionFill` tags the fill mesh with a stable `userData.junctionKey` derived from
the fill's `edgeIndexes`, and it still sets no `userData.entityId`. This is a new middle
ground between a pickable entity and a mesh that is invisible to every pass. The fade pass
can now find the fill and join it to its core fade group, while a click that lands only on
a fill still resolves to no selection, so ADR-0082's non-pickability holds. The tag is the
same join key the core selector uses, so the two sides meet without an entity id.

### The engine holds enrolled fills opaque per frame

`prepareNearWallTransparency` takes the core fade groups and, for each opaque-holding
group, finds the tagged fill meshes by their junction key, privatizes their materials, and
records each as a hold-opaque member. `updateNearWallTransparency` reads a `holdOpaque`
marker on each material record and keeps those materials at their solid baseline even when
their target is in the camera-outside, faded condition. Ordinary wall and opening
materials on the same target fade exactly as before. So the bar fades while the fill it
sits behind stays solid, covering the exposed leg miter and dividing the rooms, no matter
which of the leg or bar is the faded wall for the current camera.

The membership reaches the renderer through both build seams. The per-floor path
(`engine/scene/floor-subgroups.ts`) and the live reconciler path
(`bridge/react/framed-scene.ts`) both compute `junctionFadeGroups` and pass it into the
prep call, so the live preview and the per-floor or harness path enroll the fill
identically. The exterior decision, the camera-side decision, and the opaque policy are
pure and unit tested; the tag and the enrollment are tested on a built scene.

## Consequences

- A faded bar wall no longer reveals its neighbor's mitered end as a tapering point, and
  the rooms the bar divides stay divided, because the fill behind it holds opaque. This
  closes issue #227 for both camera sides.
- The fill must privatize (clone) its shared `junction`-role material before being marked
  hold-opaque, the same way the wall pass clones. Holding one fill's shared material opaque
  would otherwise pin every junction's material opaque, because ADR-0082 gives every fill
  side face the one cached `junction` material. The enrollment clones first, so only the
  enrolled fill is held.
- The junction identity model gains a third state. A mesh can be a pickable entity (an
  entity id), invisible to all passes (the prior fill, the edge overlay), or addressable
  but non-pickable (a junction key with no entity id). This is the new middle ground the
  fade pass needed; it does not change picking.
- The fix threads through two build seams. If only one passed the fade groups, the fix
  would land in the live preview but not the per-floor or harness path, or the reverse. The
  seam wiring lands with the prep signature change so the suite never compiles half-wired.
- The fade stays logic-tested. The coordination is verified by pure core tests for
  membership and policy and by engine tests for the tag, the enrollment, and the per-frame
  hold in both camera conditions. No committed pixel baseline is added, which deliberately
  avoids regenerating a per-platform baseline that cannot be refreshed across targets in
  this pass. This is the same deferral as ADR-0086 and ADR-0087.

## Alternatives considered

- **Square-cap the exposed leg end.** Rebuild the wall end a neighbor's fade exposes as a
  square cap, so the leg reads as ending squarely even with the fill gone. Deferred: it
  changes wall-footprint geometry ([[ADR-0080-generalized-wall-junction-geometry]]) and the
  committed always-opaque junction baselines, a much larger blast radius, and the issue's
  own recommended direction is the keep-the-fill-opaque path. Square-capping is recorded as
  a possible later refinement, not a regression to fix.
- **Fade the fill along with its walls.** Let the fill fade when its incident walls do, so
  the junction reads consistently transparent. Rejected: it makes the seam worse, because a
  faded fill stops covering the leg miter and stops dividing the rooms, which is exactly the
  failure the issue reports.
- **Give the fill an entity id so the fade pass can find it the ordinary way.** Rejected: it
  would make a bare corner pickable, which ADR-0082 ruled out, since a junction is not an
  entity and a corner belongs to several walls at once. The non-pickable junction tag
  reaches the fade pass without putting the fill in the pick path.
- **Bundle the new input into the prep input object up front.** The extended prep and
  per-frame signatures and the build-seam calls can press on the parameter and
  function-length limits. The first cut keeps the fade groups as one optional parameter and
  the hold marker as one optional field, folding a refactor only if review flags it, rather
  than reshaping the target type ahead of need.
- **Add a committed pixel baseline of the held-opaque junction.** Deferred, consistent with
  ADR-0086 and ADR-0087: a rendered baseline is per-platform and cannot be regenerated
  across targets in this pass, and the unit and engine tests cover the coordination logic in
  the meantime.

## References

- Issue #227: a faded T-junction cross wall reveals the leg wall's mitered end as a point.
- [[ADR-0082-three-dimensional-wall-junction-fill]]: the junction fill, its no-entity-id
  non-pickability that this decision extends with a junction tag, and the shared `junction`
  role material that the enrollment must clone before holding opaque.
- [[ADR-0086-near-wall-transparency]]: the near-wall fade trigger and the exterior-wall fade
  membership this decision extends with junction fills as stay-opaque members.
- [[ADR-0087-opening-fade-with-host-wall]]: the prior extension of the same fade membership
  to opening bodies, and the deferred pixel baseline this decision matches.
- [[ADR-0080-generalized-wall-junction-geometry]]: the wall-footprint geometry the deferred
  square-cap alternative would touch.
