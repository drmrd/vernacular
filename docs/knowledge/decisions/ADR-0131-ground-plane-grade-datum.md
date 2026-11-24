---
slug: decisions/ADR-0131-ground-plane-grade-datum
title: 'ADR-0131: Ground plane sits at the zero-elevation grade datum'
type: decision
tags: [3d-preview, scene-graph, engine, ground, grade, foundation, elevation]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0075-three-dimensional-preview-camera-fit,
    decisions/ADR-0078-surface-edge-overlay,
    decisions/ADR-0127-whole-building-3d-view,
    decisions/ADR-0138-explicit-grade-elevation-field,
    decisions/ADR-0219-pack-assets-carry-textures,
    decisions/ADR-0238-a-texture-cache-lives-for-one-effect-run-of-one-view,
  ]
sourceFiles:
  [
    engine/scene/ground-plane.ts,
    engine/scene/build-scene.ts,
    engine/scene/scene-bounds.ts,
    bridge/react/framed-scene-reconciler.ts,
    bridge/react/framed-scene.ts,
    bridge/react/use-ground-grass.ts,
    bridge/react/use-ground-texture.ts,
    core/environment/ground-surface.ts,
  ]
status: current
updated: 2026-11-24
---

# ADR-0131: Ground plane sits at the zero-elevation grade datum

## Status

Accepted, landed. `buildScene` adds a grass-colored ground plane to the built scene at the grade datum.
The whole-building view (ADR-0127) seats the stacked model on it, and a basement that is not fully buried
shows the part of its foundation walls that rises above the surface. (Amended 2026-11-24: the plane now
draws the grass texture of the starter pack, and the flat color only while the texture loads or after its
load fails. See the amendment below.)

## Context

The whole-building view stacks every floor at its own elevation (ADR-0127, #206). Without a ground
reference the model floats in space, and there is no way to read how far a partly buried basement rises
above grade (#207). The model already encodes the vertical datum the ground needs: it has no explicit
grade field, but it treats a finished-floor elevation of 0 as the ground datum, so above-grade floors sit
at positive elevations and basements at negative ones. The floor-placement defaults produce that ordering
(`core/model/floor-placement.ts`), and the building view's underground filter reads it directly, hiding
every floor seated below 0.

A basement wall is an ordinary wall on a below-grade floor. Its mesh already renders at the right world
height because the floor group is seated at the floor's negative elevation and the wall rises from there.
So the exposed-foundation behavior needs no new geometry. It needs a surface at grade that the building
sits on, opaque enough to read as the ground the below-grade portion disappears into.

## Decision

A new engine module, `engine/scene/ground-plane.ts`, builds the ground surface and `buildScene` adds it
from a single call after the floors and the edge overlay. The live view seats the same plane per scene
through `refreshGroundPlane` in `bridge/react/framed-scene.ts`, keyed only on the grade so a grade edit
refreshes the ground without discarding cached floor sub-groups; it was a missed second consumer of this
decision until issue #477, and issue #479 moved the seating out of the caching reconciler into that
scene-assembly helper as the preview grew to stack every floor of a whole building. `GRADE_ELEVATION_MM` names the datum at 0, where
the model places ground level. The plane is a horizontal `PlaneGeometry` at that elevation, sized to the
horizontal extent of the built geometry plus a fixed site margin so the lawn surrounds the building rather
than stopping at its walls, and centered on that footprint. An empty plan falls back to a default square so
a ground surface is always present.

The surface uses a flat grass-green `MeshStandardMaterial`. A real grass texture is deferred: pulling one
through the content-addressed asset pipeline is out of scope for this change, and a flat color carries the
ground until then. (Replaced on 2026-11-24: the grass texture now comes through that pipeline. See the
amendment below.)

The plane carries no entity id and no surface ref, so entity picking, surface picking, and the selection
traversal ignore it. It is added after the edge overlay (ADR-0078) so the lawn takes no hidden-line
outline. A `userData.ground` marker and an `isGroundPlane` predicate identify it.

`sceneBounds` excludes the ground plane, so it never drives the camera fit (ADR-0075). The lawn spans the
footprint plus a wide margin, so framing it would pull the building away from the viewer, and a scene
holding only the ground reads as empty and falls back to the default pose. Excluding the plane keeps the
camera framing identical to the per-floor and whole-building views that shipped before.

The underground-levels toggle (ADR-0127) keeps working untouched. That toggle filters the scene graph at
the bridge seam before `buildScene` runs, so hiding the basement removes its walls while the ground plane,
added inside `buildScene` at grade, stays put. With the basement shown, the opaque ground occludes the
below-grade portion of the foundation and the above-grade portion rises through it.

### Rejected: a stored grade or basement-exposure field on the model

Adding an explicit grade or above-grade-exposure field was rejected for this change to avoid widening the
model surface. Elevation already encodes the datum the same way ADR-0127 relied on it for the underground
filter, so the ground reads the elevations the floors carry. An explicit field is recorded below as a
recommended follow-up for cases the zero datum cannot express, such as a sloped site or a stepped
foundation.

### Rejected: gating the ground plane on view scope

The ground plane is added unconditionally in `buildScene` rather than only in building scope. `buildScene`
does not know the view scope (the bridge selects the floor or building graph upstream), and the single
consumer of the engine builder is the 3D view. A floor-scoped view of the ground floor sits at grade as
expected, and excluding the plane from the camera fit keeps an upper-floor view framed on its own geometry.

## Consequences

- The whole-building view shows the model on its site, and a shallow basement's foundation reads as rising
  out of the ground. The below-grade portion is hidden by the opaque surface from above.
- Camera framing is unchanged from before, since the ground plane is excluded from `sceneBounds`.
- Picking and selection are unchanged, since the plane carries no entity or surface ref.
- The grade datum is fixed at elevation 0. A site that does not sit at that datum, or a stepped foundation,
  cannot be expressed until an explicit grade field exists.

## Follow-ups

- Add an explicit grade or above-grade-exposure field to the model so the ground level is not pinned to the
  zero datum, covering sloped sites and stepped foundations. The grade half landed as
  [[ADR-0138-explicit-grade-elevation-field]] (`Site.gradeElevation`); the per-edge / sloped-site /
  stepped-foundation exposure half remains open.
- Replace the flat grass color with a grass texture once the content-addressed asset pipeline is in scope.
  Done on 2026-11-24; see the amendment below.

## References

- ADR-0001 (the layer boundaries that keep the ground builder in the engine).
- ADR-0018 (the scene-graph derivation that carries floor elevations).
- ADR-0075 (the camera fit to world bounds the ground plane is excluded from).
- ADR-0078 (the surface edge overlay the ground plane is added after).
- ADR-0127 (the whole-building view the ground plane seats the model on).
- Issues: #207 (ground plane and exposed foundation); builds on #206.

## Amendment 2026-11-24: the plane draws the starter pack grass

The flat color held the ground until a grass texture could come through the asset pipeline. It now
does, with the fourth pull request of `docs/plans/2026-11-19-texture-assets-in-packs.md` (issue
#409). The status, the paragraph on the flat material, and the last follow-up above describe the
plane as it was before.

`addGroundPlane` and `refreshGroundPlane` take an optional texture appearance: a texture and its
tile size in millimeters. Given one, the plane draws the texture on a white base color, one copy
per tile. Its UVs come from world positions, so a texel keeps its place on the ground when the
plane grows with the building. Without one, the plane keeps the flat `GROUND_SURFACE_HEX`.
`groundPlaneDrawsWith` tells whether a plane already draws a given appearance, so a refresh keeps a
plane that matches.

The texture is the grass of starter pack 1.1.0, which `GROUND_GRASS_REFERENCE` in
`core/environment/ground-surface.ts` names. `useGroundGrass` (`bridge/react/use-ground-grass.ts`)
loads it through `useGroundTexture` and the view's asset registry, and
[[ADR-0238-a-texture-cache-lives-for-one-effect-run-of-one-view]] records how that hook's cache
holds and frees the decoded texture. The live view puts it on the plane through `useFramedScene`
and the framed-scene reconciler, and the scene harness through `useHarnessGround`. Both views show
the flat lawn hex only while the texture loads or after its load fails. The mean of the grass in
linear light is the lawn color ([[ADR-0219-pack-assets-carry-textures]]), so the grey ground bounce
of the sky dome still matches the lawn's luminance.

Readiness waits for the ground in both views. The harness ready frame waits until the ground is no
longer loading and reports its status in `data-ground-texture`; the amendment of
[[ADR-0149-harness-lighting-readiness]] on this date covers it. In the live view,
`useLiveViewReadiness` counts a drawn frame only when no pipeline build and no ground load is in
flight, and a ground load that starts clears the drawn-frame fact.

Section 4.5 of the design specification now says in the present tense that the ground uses a
texture for its grass. This amendment records that change.
