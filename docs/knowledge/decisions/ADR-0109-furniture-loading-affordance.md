---
slug: decisions/ADR-0109-furniture-loading-affordance
title: 'ADR-0109: Render a still-loading furniture model as a distinct loading box'
type: decision
tags:
  [
    architecture,
    furniture,
    three-d-preview,
    model-loader,
    cache,
    reconciler,
    surface-role,
    materials,
    scene-graph,
  ]
related:
  [
    decisions/ADR-0094-furniture-massing-in-3d,
    decisions/ADR-0095-furniture-3d-mesh-loader,
    decisions/ADR-0107-furniture-failed-load-stand-in,
  ]
sourceFiles:
  [
    engine/materials/material-provider.ts,
    engine/materials/role-appearance.ts,
    engine/scene/furniture-builder.ts,
    engine/scene/floor-subgroups.ts,
    bridge/react/framed-scene-reconciler.ts,
  ]
status: current
updated: 2026-06-19
---

# ADR-0109: Render a still-loading furniture model as a distinct loading box

## Status

Accepted, landed. A furniture piece whose real model is still fetching or parsing now
shows its massing box in a distinct warm amber rather than the same red box an
unloaded piece draws. The signal stays in the 3D viewport and never reaches the 2D
inspector.

## Context

ADR-0095 gave furniture a real-model loader that swaps a parsed GLB in for the
ADR-0094 massing box once the model is ready. The model cache settles each content
hash through `loading`, then `ready` or `failed`, and the reconciler reads that status
synchronously at the point where it decides between a mesh and a box. ADR-0095 named a
loading affordance as a known gap: while a model is in flight the box looked the same
as one whose load had not started, so a user had no cue that anything was happening.

By the time this slice landed, two of the box's states already read distinctly. Issue
#259 made the `furniture` role a static semi-transparent red, so an unloaded piece
reads as a deliberate placeholder. ADR-0107 then gave a failed load its own
desaturated gray box. That left the loading state still sharing the unloaded red: a
piece that had not started loading and a piece actively fetching its model painted the
same box. The cue this slice adds is the third and final placeholder appearance, so
not-yet-loaded, loading, and failed each read differently.

The inspector was off the table for the same reason it was in ADR-0107. The 2D
inspector surfaces under `editor/` belong to a separate, parallel design-system
effort, and routing the loading signal through an inspector note would cross into that
lane. The clean seam was a distinct in-viewport material driven off the cache status
the loader already produces, which keeps this change inside the 3D-scene engine and
bridge and touches no editor file.

## Decision

Render the model cache's `loading` status as its own furniture surface role on the
massing box, selected by a status branch in the reconciler, reusing the seam ADR-0107
established for the failed box.

**A distinct `furnitureLoading` surface role.** A new member joins the `SurfaceRole`
union in `engine/materials/material-provider.ts`, beside `furniture` and
`furnitureFailed`. Its appearance lives with the other render-role constants in
`engine/materials/role-appearance.ts` as `FURNITURE_LOADING_COLOR` (a warm amber
`0xddaa33`) at `FURNITURE_LOADING_OPACITY` (`0.45`), with a branch in
`roleMaterialParameters` that returns a transparent, double-sided material named for
the role. The amber is deliberately neither the saturated red of an unloaded box nor
the gray of a failed one, so a loading box reads as in flight. It shares the failed box's
opacity, so hue alone separates the working state from the settled one. The constants stay engine-local, following the convention #259 set and
ADR-0107 repeated: `core/` owns only the paint domain, and a fixed render-role
appearance is engine-local because it is not paint. A future reader should not relocate
this hex into `core/`, where no precedent for a render-only role color exists.

**The reconciler maps the loading status onto the role.** `buildFurnitureMassing` and
`buildFurnitureSubgroup` already took an optional role from ADR-0107, defaulting to
`furniture`, so the box geometry is built once and the reconciler asks for the loading
appearance without a duplicate builder. `buildFurnitureGroup` in
`bridge/react/framed-scene-reconciler.ts` now selects across four states: a ready model
builds the mesh, a `failed` entry builds the failed box, a `loading` entry builds the
loading box with the `furnitureLoading` role, and an absent entry builds the plain box.
This extends the convention ADR-0107 set, that the reconciler maps a model-cache load
status onto a furniture surface role and the appearance for each state has one home in
`roleMaterialParameters`, by one more state.

**The reuse discriminant grows one kind.** ADR-0107 replaced the old `builtReady`
boolean with a `buildKind` of `'mesh' | 'failedBox' | 'box'`, derived once per piece
and compared on reuse, so a piece that goes from loading to failed rebuilds rather than
reusing a stale box. This slice adds `'loadingBox'` to that union. Because the loading
box now carries its own kind, a `loading`-to-`ready`, `loading`-to-`failed`, or
`loading`-to-box transition changes the per-piece key and the tagged whole-floor
readiness signature, so the one piece rebuilds without forcing a floor-wide rebuild
(ADR-0089). No new key was invented; the existing discriminant absorbed the new state.

**Static tint as the shipped MVP, with the pulse deferred.** A static distinct tint is
the shipped behavior, and it is the testable one: it asserts as a pure color and
opacity value out of `roleMaterialParameters`, exactly like the unloaded and failed
roles before it. An animated pulse would read as more obviously alive, but it would
require a `useFrame` opacity ramp in the R3F canvas glue, which is not Node-unit-
testable without a render loop and a material-ref harness and which pulls the change
into the canvas lane the pure reconciler avoids. The pulse is recorded here as an
explicitly deferred optional follow-up; if it is taken up later, it should be scoped as
its own behavior with its own harness rather than folded into this role.

This slice changed no `docs/specs/` file. It renders a cache status the loader already
produces and adds no schema field or format change, so there is no spec-change ADR
companion.

## Consequences

- The three placeholder states now read distinctly in the viewport: not-yet-loaded is
  the static red box from #259, loading is the amber box from this slice, and a failed
  load is the gray box from ADR-0107. The two states that read identically before this
  change, loading and unloaded, now differ, so a user sees that a model is actively
  fetching.
- The render-role color stays an engine-local constant beside its siblings, not in
  `core/`. Core owns the paint domain; a fixed render-role appearance is not paint and
  belongs to the engine, matching the convention #259 and ADR-0107 set.
- The status-to-role pattern is now full for the cache's three statuses. The branch in
  the reconciler and the appearance table in `roleMaterialParameters` carry one entry
  per state, and the `buildKind` discriminant carries one kind per state, so the design
  is closed rather than left with a fourth state to slot in later.
- The deterministic export and static snapshot path is unchanged. `build-scene.ts` has
  no model lookup, so it always builds the box through the default `furniture` role, and
  the committed scene baseline does not move. The loading appearance only renders when a
  live cache reports `loading`, which the static harness fixture does not drive.
- The change stays lane-disjoint from the 2D inspector. No `editor/` file moved, so it
  does not collide with the parallel design-system work on the inspector surfaces, and
  the loading signal lives entirely in the engine and bridge scene path.

## References

- ADR-0094 (the furniture massing box this loading box stands in for).
- ADR-0095 (the mesh loader whose `loading` status this renders, and which left the
  loading affordance as a deferred follow-up that this slice realizes).
- ADR-0107 (the failed-load box this reuses the surface-role and `buildKind` seam from,
  and reads differently from).
- ADR-0089 (within-floor mesh reuse; the per-piece reuse key and whole-floor early
  return whose `buildKind` discriminant this slice extends with `loadingBox`).
- Issue #259 (the unloaded-red box this reads differently from) and issue #261 (the
  loading cue this ADR records).
