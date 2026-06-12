---
slug: decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier
title: 'ADR-0061: Wall shell extrusion, box-per-wall junctions, and the pixel-approximate visual tier'
type: decision
tags:
  [
    architecture,
    rendering,
    three-d-preview,
    scene,
    walls,
    extrusion,
    junctions,
    material-provider,
    surface-role,
    winding,
    testing,
    visual-regression,
    playwright,
    engine,
    core,
  ]
related:
  [
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0004-three-js-r3f-webgpu,
  ]
sourceFiles:
  [
    docs/specs/2026-06-12-three-dimensional-wall-shell.md,
    docs/plans/2026-06-12-three-dimensional-wall-shell.md,
    core/scene/scene-graph.ts,
    core/scene/wall-height.ts,
    engine/scene/build-scene.ts,
    engine/scene/wall-builder.ts,
    engine/materials/material-provider.ts,
    engine/materials/neutral-material-provider.ts,
    bridge/react/scene-harness-view.tsx,
    e2e/tests/scene-visual-regression.spec.ts,
  ]
status: current
updated: 2026-06-12
---

# ADR-0061: Wall shell extrusion, box-per-wall junctions, and the pixel-approximate visual tier

## Status

Accepted, landed. This is slice 1 of the three-dimensional preview track
([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]), the first geometry
slice on top of the slice-0 harness and conventions
([[ADR-0045-three-dimensional-render-harness-and-conventions]]). The slice
specification (`docs/specs/2026-06-12-three-dimensional-wall-shell.md`) and the
track foundation spec are authoritative for scope; this record captures the two
decisions that are not already fixed by the foundation: how wall corners are built
and how the visual tier verifies the render.

## Context

The foundation pinned the coordinate, datum, winding, and unit conventions, the
material seam, the per-surface identity, and a two-tier testing strategy, but it
deliberately left two things open for the slice that hits them. The exact junction
miter rule for a vertex with more than two incident walls or walls of differing
thickness is an open question recorded in foundation section 9. And the foundation
described a visual render harness without fixing how strict its comparison should
be. Both choices land here because this is the first slice that draws solid
geometry and the first slice that has a shell worth looking at.

## Decision

### Walls extrude as independent boxes; junctions overlap

Each wall renders as a box extruded from its centerline, its thickness, and its
height. Walls that share a junction overlap into a solid mass rather than mitering
or butting against each other. This slice ships a per-wall builder,
`buildWallMesh(node, materials)`, that `buildScene` maps over each floor's walls;
it reads only the centerline, thickness, and height. The foundation's graph-aware
`WallBuildInput` seam (the wall graph, the openings keyed by wall, the material
provider) is introduced by the opening slice, which is the first consumer that
needs the graph and openings and is the slice the foundation (section 3.3) expects
to settle that shape. Slice 1 does not thread an unread graph just to hold the
seam open.

This is the minimal correct first shell. A union of overlapping opaque boxes reads
as a continuous solid wall, which is what a first navigable preview needs. Clean
mitered or butted corners matter for face culling and for painting a corner
cleanly, but neither is load-bearing for turning the empty pane into a real
visualization, and the miter rule for the awkward cases (three or more incident
walls, mixed thicknesses) is genuinely involved. Building it now would front-load
the foundation's hardest deferred question for a visual refinement the first shell
does not need. The mitered junction builder is an additive follow-on: it reads the
wall graph this slice already passes through the seam, resolves each junction from
its incident edges, and plugs in behind the same `WallMeshBuilder` type without
touching any consumer.

### Wall height lives on the scene node and is read through an accessor

`WallSceneNode` carries an additive `height`, set by the deriver from the host
floor's `defaultCeilingHeight` because the wall model has no per-wall height field
yet. A pure `wallHeight(node)` accessor is the single read point. The builder
calls the accessor rather than the field, so the eventual move from a scalar to a
sloped-top height profile (ADR-0034) is an additive change at the accessor, not a
change rippling through the builder. This realizes the foundation's section 2.4
intent in code.

### Per-surface material groups from the first mesh

Every wall mesh is split into material groups tagged by surface role
(`interiorFace`, `exteriorFace`, `top`, `base`; `reveal` arrives with openings),
behind a `MaterialProvider` seam with a neutral default provider. The slice paints
every role with the neutral material, but the groups exist immediately, so the
paint track swaps the provider rather than remeshing. This is the foundation's
sections 3.4 and 5.2 realized for walls.

### The visual tier is pixel-approximate, not pixel-exact

The foundation's tier-one Node geometry and scene-tree tests stay the gating proof
of correctness: they are deterministic, run without a graphics processor, and
catch flipped normals, wrong dimensions, missing material groups, and missing
entity ids. The tier-two visual render exists to catch what only a render shows (a
miswired light, a material that does not draw, geometry that lands off screen), and
for that purpose an exact pixel match is the wrong contract. A graphics-processor
render varies with the driver and the antialiasing, and the two-dimensional
home-page baseline already shows how a strict pixel comparison turns environmental
rendering differences into spurious failures.

So the visual tier asserts semantically. It renders a small fixed walls fixture
through the deterministic hardware-WebGL harness and reads the canvas pixels to
confirm the wall silhouette region is non-background and roughly wall-colored,
rather than diffing every pixel against a committed frame. A committed
perceptual-tolerance baseline image, with a generous threshold and a maximum
different-pixel ratio, is an optional best-effort secondary, never the gate. The
harness self-skips where a WebGL 2 context cannot be created, as the foundation
already does, and it runs in the separate `scene-webgl` Playwright project, outside
the gating chromium tree.

No new dependency supports this. Playwright's bundled perceptual comparison and
canvas pixel readback are enough. A dedicated image-diff library would duplicate
the bundled comparison and wait out the thirty-day dependency cooldown for no gain.
A deterministic software-rasterizer path that could hard-gate a
graphics-processor-less continuous-integration run is the foundation's tracked
follow-on (foundation section 9); it is the recorded escalation if the project ever
wants the visual tier to gate continuous integration rather than self-skip there.

## Consequences

- The first shell ships with the minimal correct geometry: a union of extruded
  boxes that reads as solid walls. Corner quality is a known, isolated follow-on
  that reuses the wall graph already threaded through the builder seam.
- Slice 1 ships a per-wall `buildWallMesh`; the opening slice introduces the
  graph-aware `WallBuildInput` seam when it first needs the graph and openings, so
  the seam is shaped by its real consumer rather than guessed at here.
- Height is read through one accessor, so a per-wall override or a sloped-top
  profile is an additive change at a single point.
- Per-surface material groups exist from the first mesh, so the paint track is a
  provider swap.
- The visual tier adds render-level rigor without the brittleness of an exact pixel
  diff, and the gating proof of correctness stays the deterministic Node tests. The
  software-rasterizer escalation is recorded rather than rediscovered.

## Alternatives considered

- **Miter junctions now.** Rejected for this slice: it front-loads the foundation's
  hardest deferred geometry question (mixed thicknesses, three or more incident
  walls) for a refinement the first shell does not need, and it is additive behind
  the same builder seam later.
- **Pixel-exact visual baseline.** Rejected: a graphics-processor render is not
  pixel-stable across drivers and antialiasing, so an exact diff turns
  environmental differences into spurious failures, as the two-dimensional home
  baseline already shows. A semantic, pixel-approximate assertion catches the
  failures that matter without the brittleness.
- **Add an image-diff dependency.** Rejected: Playwright already bundles perceptual
  comparison, so a new library is redundant and would wait out the dependency
  cooldown.
- **Stand up a software-rasterizer path now.** Rejected as out of scope for this
  slice: it is the foundation's tracked continuous-integration follow-on, recorded
  here as the escalation rather than built speculatively.

## References

- Slice specification `docs/specs/2026-06-12-three-dimensional-wall-shell.md`.
- Implementation plan `docs/plans/2026-06-12-three-dimensional-wall-shell.md`.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the harness,
  conventions, and the hardware-WebGL visual baseline this slice renders against.
- [[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]: the track delivery
  model; this is the three-dimensional preview track's first geometry slice.
- [[ADR-0018-scene-graph-derivation]]: the scene graph and the `userData.entityId`
  the wall meshes carry.
- [[ADR-0034-future-direction-extensibility-seams]]: the height-profile accessor
  and the read-shape-from-the-element-type seams this slice keeps additive.
- [[ADR-0004-three-js-r3f-webgpu]]: the renderer stack and the millimeter scene
  tree.
  </content>
