---
slug: decisions/ADR-0107-furniture-failed-load-stand-in
title: 'ADR-0107: Render a failed furniture-model load as a distinct stand-in box'
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
    decisions/ADR-0089-within-floor-mesh-reuse,
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

# ADR-0107: Render a failed furniture-model load as a distinct stand-in box

## Status

Accepted, landed. A furniture piece whose real model fails to load now shows its
stand-in box in a distinct desaturated gray rather than the same box every other
unloaded piece draws. The signal stays in the 3D viewport and never reaches the 2D
inspector.

## Context

ADR-0095 gave furniture a real-model loader that swaps a parsed GLB in for the
ADR-0094 massing box once the model is ready. When a model cannot load, whether the
bytes are missing or the parse rejects, the cache settles that content hash to
`failed`, warns once to the console, and leaves the box in place. ADR-0095 named
that as a known gap: the failure was silent by contract, and a visible failure
affordance was a deferred follow-up.

The box the loader falls back to had meanwhile become its own signal. Issue #259
made the `furniture` role a static semi-transparent red, so an unloaded piece reads
as a deliberate placeholder. That left three states sharing one appearance. A piece
that has not started loading, a piece still loading, and a piece whose load failed
all painted the same red box. The user had no way to tell a failed placeholder from
a not-yet-loaded one, and the only failure signal was a console warning no user
sees.

The inspector was off the table. The 2D inspector surfaces under `editor/` are owned
by a separate, parallel design-system effort, and routing the failure through an
inspector note would have crossed into that lane. The clean seam was a distinct
in-viewport material driven off the cache status the loader already produces, which
keeps this change inside the 3D-scene engine and bridge and touches no editor file.

## Decision

Render the model cache's `failed` status as its own furniture surface role on the
stand-in box, selected by a status branch in the reconciler.

**A distinct `furnitureFailed` surface role.** A new member joins the `SurfaceRole`
union in `engine/materials/material-provider.ts`. Its appearance lives beside the
other render-role constants in `engine/materials/role-appearance.ts` as
`FURNITURE_FAILED_COLOR` (a desaturated gray `0x6a6a6a`) at `FURNITURE_FAILED_OPACITY`
(`0.45`), with a branch in `roleMaterialParameters` that returns a transparent,
double-sided material named for the role. The gray is deliberately not red, so a
failed box reads as a quiet inert placeholder distinct from #259's saturated-red
unloaded box, and the slightly higher opacity reads as a settled final state rather
than something still in flight. The constants stay engine-local, following the
convention #259 set: `core/` owns only the paint domain, and a fixed render-role
appearance is engine-local because it is not paint.

**The reconciler maps a load status onto a role.** `buildFurnitureMassing` and
`buildFurnitureSubgroup` take an optional role, defaulting to `furniture`, so the
box geometry is built once and the reconciler asks for the failed appearance without
a duplicate builder. `buildFurnitureGroup` in
`bridge/react/framed-scene-reconciler.ts` now selects in three steps: a ready model
builds the mesh, a `failed` entry builds the box with the `furnitureFailed` role, and
everything else, including `loading` and an absent entry, builds the plain box. This
establishes the convention that the reconciler maps a model-cache load status onto a
furniture surface role, and that the appearance for each state has one home in
`roleMaterialParameters`.

**A generalized reuse discriminant.** The furniture per-piece reuse key used a
`builtReady` boolean, which only told a ready mesh from a box. A piece that goes from
`loading` to `failed` keeps `builtReady` false through both, so the early return
would wrongly reuse the red box and never repaint it gray. The key is now a
`buildKind` of `'mesh' | 'failedBox' | 'box'`, derived once per piece and compared on
reuse, so a `loading`-to-`failed` transition rebuilds that one sub-group. The
whole-floor early-return signature was extended the same way: instead of a string of
ready hashes, it tags each furniture hash with the build kind its status calls for,
so a load that fails changes the signature and lets the piece rebuild without forcing
a floor-wide rebuild (ADR-0089).

This slice changed no `docs/specs/` file. It renders a cache status the loader
already produces and adds no schema field or format change, so there is no
spec-change ADR companion.

## Consequences

- The three furniture states now read distinctly in the viewport: not-yet-loaded is
  the static red box from #259, a failed load is the gray box from this slice, and a
  loading cue is coming next under #261. A user can tell a failed placeholder from a
  box that simply has not loaded its model yet.
- The render-role colors stay engine-local constants beside their siblings, not in
  `core/`. Core owns the paint domain; a fixed render-role appearance is not paint and
  belongs to the engine, matching the convention #259 set.
- A future loading role slots into the same pattern. The status-to-role branch in the
  reconciler and the appearance table in `roleMaterialParameters` are the seams #261
  extends, and the loading box reuses the optional-role parameter this slice added to
  the builders. The `buildKind` discriminant grows one more kind rather than gaining a
  parallel key, and the loading cue reserves its own ADR number when it lands.
- The reuse discriminant is the subtle part. Without it the `loading`-to-`failed`
  transition would silently reuse the red box, because both states sit on the same
  side of a ready-or-box boolean. The `buildKind` key and the tagged early-return
  signature are what make the transition repaint, and a reuse test pins it.
- The change stays lane-disjoint from the 2D inspector. No `editor/` file moved, so it
  does not collide with the parallel design-system work on the inspector surfaces, and
  the failure signal lives entirely in the engine and bridge scene path.
- The committed scene baseline does not move. The static harness fixture renders a
  piece whose model is never loaded, so it shows the unloaded-red box; the `failed`
  appearance only renders after a real load attempt fails, which the harness does not
  trigger.

## References

- ADR-0094 (the furniture massing box this failed-load box stands in for).
- ADR-0095 (the mesh loader whose `failed` status this renders, and which left the
  user-facing failure signal as a deferred follow-up).
- ADR-0089 (within-floor mesh reuse; the per-piece reuse key and the whole-floor early
  return this slice extends with the `buildKind` discriminant).
- Issue #259 (the unloaded-red box this reads differently from) and issue #261 (the
  loading cue that will slot into the same status-to-role pattern as the sibling
  third state).
