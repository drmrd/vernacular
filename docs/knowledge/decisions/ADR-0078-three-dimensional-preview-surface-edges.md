---
slug: decisions/ADR-0078-three-dimensional-preview-surface-edges
title: 'ADR-0078: Surface edge lines for three-dimensional preview legibility'
type: decision
tags: [architecture, three-dimensional, rendering, legibility, edges, preview, engine]
related:
  [
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0066-three-dimensional-selection-and-accessibility,
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
    decisions/ADR-0077-three-dimensional-mitered-wall-junctions,
  ]
sourceFiles:
  [
    docs/specs/2026-06-14-three-dimensional-preview-surface-edges.md,
    docs/plans/2026-06-14-three-dimensional-preview-surface-edges.md,
    engine/scene/edge-overlay.ts,
    engine/scene/edge-lines.ts,
    engine/scene/build-scene.ts,
    engine/scene/selection-outline.ts,
  ]
status: current
updated: 2026-06-14
---

# ADR-0078: Surface edge lines for three-dimensional preview legibility

## Status

Accepted. A legibility item on the three-dimensional preview, from owner feedback
on 2026-06-14: a wall is hard to tell apart from the floor behind it or from an
adjacent wall, and corners are hard to read. It builds on the wall shell
([[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]) and reuses
the edge-line step of the selection outline
([[ADR-0066-three-dimensional-selection-and-accessibility]]).

## Context

Every structural surface in the preview shares one neutral material, so under soft
lighting two faces of the same tone blend where they meet. That is worst exactly at
the places the owner reported: a wall against the floor behind it, two adjacent
walls, and the corners. Lighting differentiates faces by orientation, but it cannot
separate two same-tone surfaces that meet at an edge, and turning the lighting up to
force contrast trades one legibility problem for another.

The decisions are how to make the geometry legible, where the work lives, and how it
relates to the existing selection outline.

## Decision

### Draw the surfaces' edges as dark hidden-line overlays

The preview draws a thin dark line along the edges of every structural mesh: the
outline and the sharp creases, from `THREE.EdgesGeometry` of the mesh geometry, as a
`THREE.LineSegments`. The lines depth-test against the scene, so the geometry in
front hides the lines behind it (a hidden-line look) rather than a full wireframe
bleeding through. This is the standard architectural-viewer technique, and it reads
whatever the lighting and paint are because it does not rely on shading.

An edge overlay is the right tool here over the alternatives. Lighting changes alone
cannot separate two same-tone surfaces that meet, which is the reported failure. A
silhouette or ambient-occlusion post-processing pass would help but is a heavier
render-pass technique with a real cost and added complexity on the renderer; the
edge overlay gives most of the legibility for far less, with no new dependency, and
the post-processing options stay open as a later refinement. Giving the floor a
different material from the walls would fight the paint model and only separate floor
from wall, not wall from wall.

### The overlay is one additive pass at the end of the scene build

A pure engine pass walks the built group tree, collects the meshes, and adds an
edge-line child to each. It runs at the end of `buildScene`, so it covers every
structural mesh (walls, slabs, ceilings, opening profiles) without each builder
knowing about edges, and it rebuilds with the scene. The lines are children of their
meshes, so they inherit the mesh transform with no separate matrix step, and they
carry no entity id and are lines rather than meshes, so the hit-test, the
accessibility proxies, and the selection traversal (all of which collect meshes by
entity id) ignore them. Line hit-testing stays off, so the lines are never picked.

The edges are on by default; a preference to turn them off is a later addition that
reads the same overlay, not a reason to gate the first version behind a setting.

### Share the edge-line step with the selection outline

The selection outline already builds an edge line from a mesh's geometry inline. The
slice lifts that one step into a shared `edgeLines(geometry, material)` helper so the
always-on overlay and the selection overlay build their lines the same way. The
selection overlay keeps everything that is specific to it: its high-contrast color,
its draw-over-the-top depth behavior, its render order, and its rebuild-on-selection
lifecycle. The always-on overlay differs in exactly the ways that matter for its job:
a dark color, depth testing on, and a build-once-with-the-scene lifecycle.

## Consequences

- A wall reads against the floor and against its neighbors, and corners draw as crisp
  lines, whatever the lighting and paint.
- The overlay is one additive engine pass gated by Node geometry tests; it changes no
  model, file-format, scene-graph-data, geometry, or two-dimensional-plan code.
- The edge lines carry no entity id and are lines, so selection, picking, and the
  proxies are untouched; the selection outline keeps its own behavior and now shares
  one line-building helper with the overlay.
- A user toggle, configurable line styling, and post-processing silhouettes or
  ambient occlusion stay deferred and are recorded follow-ons.

## Alternatives considered

- **Tune the lighting instead.** Rejected as a fix on its own: lighting separates
  faces by orientation but cannot separate two same-tone surfaces that meet, which is
  the reported problem; the edge overlay addresses that directly and is lighting and
  paint independent.
- **A silhouette or ambient-occlusion post-processing pass.** Deferred, not rejected:
  it would add depth but is a heavier render-pass technique with real cost and added
  renderer complexity; the edge overlay delivers most of the legibility for far less,
  and the post-processing options remain open.
- **Give the floor a distinct material.** Rejected: it fights the paint model and only
  separates floor from wall, leaving wall-against-wall and corners unsolved.
- **Add edges in each builder.** Rejected: a single post-build pass covers every mesh
  additively and keeps the wall, slab, and opening builders unaware of the overlay.

## References

- Slice specification `docs/specs/2026-06-14-three-dimensional-preview-surface-edges.md`.
- Implementation plan `docs/plans/2026-06-14-three-dimensional-preview-surface-edges.md`.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the wall shell,
  the material seam, and the pixel-approximate visual tier this overlay renders into.
- [[ADR-0066-three-dimensional-selection-and-accessibility]]: the selection outline
  whose edge-line step this slice shares.
- [[ADR-0077-three-dimensional-mitered-wall-junctions]]: the mitered corners the edge
  lines make legible.
