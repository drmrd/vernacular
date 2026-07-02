---
slug: decisions/ADR-0140-conditional-junction-fill-fade
title: 'ADR-0140: A junction fill fades once every incident wall fades'
type: decision
tags: [architecture, three-dimensional, transparency, walls, junctions, preview]
related:
  [
    decisions/ADR-0103-junction-fill-fade-coordination,
    decisions/ADR-0082-three-dimensional-wall-junction-fill,
    decisions/ADR-0086-near-wall-transparency,
    decisions/ADR-0087-opening-fade-with-host-wall,
    decisions/ADR-0080-generalized-wall-junction-geometry,
  ]
sourceFiles:
  [
    core/scene/junction-fade.ts,
    engine/scene/near-wall-transparency.ts,
    engine/scene/floor-subgroups.ts,
    bridge/react/framed-scene.ts,
  ]
status: current
updated: 2026-07-01
---

# ADR-0140: A junction fill fades once every incident wall fades

## Status

Accepted. This refines the fade policy [[ADR-0103-junction-fill-fade-coordination]]
set for issue #227. That decision holds the junction fill opaque whenever any incident
exterior wall fades. The refinement keeps that behavior wherever a junction still has a
solid neighbor, and lets the fill fade in the one case ADR-0103 does not distinguish: a
junction whose every incident wall has faded at once. ADR-0103's mechanism (the core
selector, the junction tag, the per-frame hold) stays in place; only the hold condition
changes from unconditional to conditional.

## Context

A local triage note reported that when near-wall transparency fades a wall, thin slivers
stay opaque along the wall's edges and mitered corners, so the wall does not read as fully
see-through. The report guessed the wall's own edge and miter faces were missing the faded
material.

The investigation found the wall's own faces already fade correctly, every one of them.
The opaque slivers that remain are the junction fills that ADR-0103 deliberately holds
opaque. At a 3+-way junction the fill covers the corner core and the mitered end each
incident wall tucks behind its neighbor (ADR-0080, ADR-0082). ADR-0103 gave that fill a
single rule: hold opaque while any incident exterior wall fades, so a faded bar wall never
exposes the leg's mitered end and never merges the two rooms the bar divides.

That rule reads a junction by one fact only, whether it has an incident exterior wall, and
it decides the same way for two junctions that should behave differently.

- A junction where an interior wall meets an exterior wall (the #227 tee) has a neighbor
  that never fades. Near-wall transparency only fades exterior walls, so the interior wall
  stays solid at every camera angle. Its fill should always hold opaque, because there is
  always a solid wall whose miter it covers and always two rooms it divides.
- A junction where every incident wall is exterior (a projecting wing or ell meeting an
  outer wall, where each leg has open air on one side) can reach a state the tee never
  can: the camera sits outside all of the incident walls at once, so every one of them
  fades. Now the fill has nothing left to cover, since each mitered end it was hiding has
  faded with its wall, and no solid neighbor remains. ADR-0103 still holds it opaque, and
  that lone opaque patch floating among faded walls is the reported sliver.

ADR-0103 already noted the naive "fade the fill along with its walls" alternative and
rejected it, because a fill that fades the moment one wall fades stops covering the miter
and stops dividing the rooms, which is the #227 failure. The gap is that the rejected
alternative and the shipped rule are the two ends of a spectrum. What the sliver needs is
the middle: hold the fill opaque while any incident wall is still solid, and fade it only
once none are.

## Decision

Bind the fill's opacity to the live state of its incident walls: a junction fill is opaque
for as long as at least one of its incident walls is opaque, and it fades only when every
incident wall has faded. This states ADR-0103's goal exactly (the fill stands in for its
solid neighbors) while covering the all-faded case ADR-0103 left out.

Two junction shapes fall out of the one rule, and the split between the layers follows
from where each fact can be known.

### Core keeps the membership and the one structural fact

`junctionFadeGroups` in `core/scene/junction-fade.ts` already enumerates each 3+-way
junction and pairs it with its incident exterior walls. It keeps doing that. It also
records one structural fact per junction: whether a non-fading wall is incident. A wall is
non-fading when it is not exterior, since near-wall transparency never fades an interior
wall. A junction with a non-fading incident wall always has a solid neighbor, so its fill
holds opaque unconditionally, and the #227 tee is exactly this case. A junction whose walls
are all exterior carries no such guarantee, so its fill's hold is conditional on the live
camera.

This is plan data over the graph, with no camera in it, so it stays a pure core selector
gated by Node tests, the same as ADR-0103. Core cannot decide when the fill fades, because
that answer depends on the camera and changes every frame. Core can only say which walls
the fill tracks and whether one of them can never fade.

### The engine decides per frame whether every incident wall has faded

The per-frame answer lives in the engine, because only the engine has the camera.
`prepareNearWallTransparency` in `engine/scene/near-wall-transparency.ts` enrolls each
junction fill as before, finding it by its junction tag and privatizing its shared
`junction` material so holding or fading one fill never pins another. The enrollment now
branches on the structural fact from core.

- A fill whose junction has a non-fading incident wall is held opaque unconditionally, the
  ADR-0103 behavior unchanged, so the #227 tee is untouched.
- A fill whose junction is all exterior is enrolled with the facing geometry of its
  incident walls, the same world point and outward normal each wall uses to decide its own
  fade. Each frame the fill runs the incident walls' facing test and fades only when the
  camera sits outside all of them, and holds opaque otherwise.

`updateNearWallTransparency` reads that per-fill decision the same way it reads a wall's
own facing, so the fill fades or holds in one pass with the walls, no second traversal.
Both build seams (`engine/scene/floor-subgroups.ts` and `bridge/react/framed-scene.ts`)
already hand `prepareNearWallTransparency` the exterior walls and the fade groups, so no
seam signature changes; the engine reads the incident facings from inputs it already
receives.

## Consequences

- A projecting wing or ell whose incident walls all fade no longer leaves an opaque patch
  where its junction fill sat. The fill fades with the last of its walls, so the corner
  reads fully see-through, which is what the sliver report asked for.
- The #227 tee is preserved to the letter. Its interior leg never fades, so the "every
  incident wall faded" condition can never hold, and the fill stays opaque through every
  camera angle exactly as ADR-0103 shipped it. The tests that pin the tee's hold carry
  over unchanged.
- The fill's opacity now tracks its incident walls' live state rather than a fact fixed at
  build time. The cost is that an all-exterior fill re-runs a small facing test per frame,
  the same test its walls already run, so the added per-frame work is bounded by the count
  of incident walls at a junction and stays trivial.
- The unconditional hold survives as a genuine specialization, not a duplicate path. When a
  junction has a wall that can never fade, "hold while any incident wall is solid" reduces
  to "hold always," and the engine takes the cheaper hold rather than testing walls whose
  answer cannot change. A reader sees one rule with a fast path, not two rules.
- No committed pixel baseline is added, matching ADR-0103, ADR-0086, and ADR-0087. The
  conditional membership is covered by pure core tests and the per-frame fade by engine
  tests over a built scene, in both the all-faded and some-solid conditions. A rendered
  baseline stays deferred until the 3D-scene visual-regression harness lands, because it
  cannot be regenerated across targets in this pass.

## Alternatives considered

- **Decide the fade in core.** Move the "every incident wall faded" test into the core
  selector so the engine reads a ready answer. Rejected: the answer depends on the camera
  and changes each frame, and core holds no camera. Core would have to take a camera
  argument and stop being pure plan data, which trades the value ADR-0103 built for.
- **One code path for both junction shapes.** Drop the unconditional hold and drive every
  fill from the same "outside all incident walls" test, modelling the interior wall as a
  neighbor that never faces outside. Rejected as churn without benefit: it rewrites the
  hold marker the #227 tests pin, and it makes every held fill re-run a facing test each
  frame whose answer a non-fading wall already settles for good. The specialization is
  clearer and cheaper.
- **Fade the fill the moment one wall fades.** The far end of the spectrum, already
  recorded and rejected in ADR-0103: a fill that fades with the first faded wall reopens
  #227, exposing the leg miter and merging the rooms. The conditional rule is the middle
  ground between this and ADR-0103's always-hold.
- **Square-cap the exposed end instead.** Rebuild the wall end a fade would expose as a
  square cap, so no fill hold is needed. Deferred for the same reason ADR-0103 deferred it:
  it changes wall-footprint geometry ([[ADR-0080-generalized-wall-junction-geometry]]) and
  the committed junction baselines, a far larger blast radius than the fill's fade rule.

## References

- [[ADR-0103-junction-fill-fade-coordination]]: the fill-fade coordination this decision
  refines, its core selector and junction tag that carry over unchanged, and the always-hold
  policy this decision narrows to a conditional hold.
- [[ADR-0082-three-dimensional-wall-junction-fill]]: the junction fill and its shared
  `junction` material the enrollment clones before holding or fading.
- [[ADR-0086-near-wall-transparency]]: the near-wall fade trigger, its exterior-only fade
  membership (the reason an interior wall never fades), and the deferred pixel baseline this
  decision matches.
- [[ADR-0087-opening-fade-with-host-wall]]: the sibling extension of the same fade membership
  to opening bodies.
- [[ADR-0080-generalized-wall-junction-geometry]]: the wall-footprint geometry the deferred
  square-cap alternative would touch.
- Issue #227: a faded T-junction cross wall reveals the leg wall's mitered end as a point,
  the report ADR-0103 closed and this decision preserves.
