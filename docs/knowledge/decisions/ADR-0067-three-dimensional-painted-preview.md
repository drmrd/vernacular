---
slug: decisions/ADR-0067-three-dimensional-painted-preview
title: 'ADR-0067: Painted three-dimensional preview: widen the material seam to a surface identity'
type: decision
tags:
  [
    architecture,
    rendering,
    three-d-preview,
    paint,
    material,
    material-seam,
    surface-identity,
    surface-ref,
    color,
    engine,
    bridge,
    react-three-fiber,
    testing,
    visual-tier,
  ]
related:
  [
    decisions/ADR-0066-three-dimensional-selection-and-accessibility,
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0056-surface-paint-selection-and-treatments,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-three-dimensional-painted-preview.md,
    docs/plans/2026-06-13-three-dimensional-painted-preview.md,
    engine/materials/material-provider.ts,
    engine/materials/paint-material-provider.ts,
    engine/materials/neutral-material-provider.ts,
    engine/scene/wall-builder.ts,
    engine/scene/room-builder.ts,
    bridge/react/framed-scene.ts,
    bridge/react/webgpu-scene-view.tsx,
  ]
status: current
updated: 2026-06-13
---

# ADR-0067: Painted three-dimensional preview: widen the material seam to a surface identity

## Status

Accepted. The painted-preview slice of the paint track, converging on the
three-dimensional preview ([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]),
on the lit and navigable shell
([[ADR-0065-three-dimensional-lighting-and-color-temperature]],
[[ADR-0066-three-dimensional-selection-and-accessibility]]). It consumes the paint
model from [[ADR-0056-surface-paint-selection-and-treatments]]. Delivered in two pull
requests (7a floor and ceiling, 7b wall faces) against one specification
(`docs/specs/2026-06-13-three-dimensional-painted-preview.md`).

## Context

The shell renders every surface in one neutral gray through a material provider keyed
by surface role. The paint model already exists: the Paint panel assigns a
`SurfaceTreatment` (a solid color) to a `SurfaceRef` (a wall face with a left or right
side, a floor, or a ceiling), keyed in `project.paint`, and the two-dimensional plan
renders it through `resolveSurfacePaint`. The `SurfaceRef` type documents the intent
for this slice directly: the three-dimensional surfaces carry the same `SurfaceRef` and
read the same paint store. The foundation reserved the material seam's widening from a
role to a surface identity as additive (section 5.2). This slice realizes both.

## Decision

### The material seam widens from a role to a surface identity, additively

`MaterialProvider.material(role)` becomes
`material(role: SurfaceRole, ref?: SurfaceRef)`. The role still drives the per-face
material groups and the neutral appearance; the optional `ref` is the surface identity
the paint provider resolves a color for. Making the identity an optional second
argument keeps the widening additive at the call sites: every existing `material(role)`
call still compiles and renders neutral, and only a paintable surface passes a `ref`.
This is the additive widening the foundation named: the neutral provider ignores the
`ref` (its role-keyed cache and the harness baselines are unchanged), and the paint
provider uses it. A surface with no
`ref` (a reveal, a slab underside) stays neutral, because the paint model has no
reference for it.

### Paint is the albedo; the light still carries the temperature

The paint provider is constructed with the project paint store. For a surface whose
`ref` is painted, it builds a material whose albedo is the paint color (set from the
`SurfaceTreatment`'s sRGB hex, which the renderer manages into its working space);
otherwise it falls back to the role's neutral albedo. The color temperature stays in
the light ([[ADR-0065-three-dimensional-lighting-and-color-temperature]]), so a painted
surface is shown under the chosen illuminant rather than tinted twice. This is the
preview the design specification's paint hook describes (section 6.8): the same paint
shifting under warm and cool light, achieved by a real albedo lit by a tinted light.

### The builders tag each surface with its `SurfaceRef`

The geometry builders pass a `PaintedSurface` per material group instead of a bare
role. The room builder tags the floor slab's top cap with `{ kind: 'floor', floorId }`
and the ceiling with `{ kind: 'ceiling', floorId }` (7a). The wall builder tags each
wall's two long faces with `{ kind: 'wall-face', wallId, side }` (7b), mapping its
interior and exterior faces to the paint model's left and right sides by a fixed
convention that matches the two-dimensional Paint panel, so a face painted in the plan
is the same physical face painted in three dimensions. Reveals, tops, bases, and slab
undersides keep no reference and stay neutral.

### Paint is threaded as the project paint store, not the scene graph

Paint lives on the project model, not the derived scene graph, so it is passed
alongside the graph. `buildScene` already takes the provider; `buildFramedScene` gains
the paint store and constructs the paint provider from it, defaulting to empty (neutral)
so the harness and existing callers are unaffected. The live view reads the paint store
reactively through a small bridge hook on the editor session, so a paint dispatch
rebuilds the scene with the new colors, like any other project edit, until the
incremental-update slice (foundation 5.5) replaces the wholesale rebuild.

### Delivery in two parts

7a widens the seam, threads the paint store, and paints the floor and ceiling, whose
`SurfaceRef` mapping is unambiguous, establishing the whole mechanism. 7b adds the
wall-face mapping. Each is its own plan and red-green-blue cycle, so each lands
reviewed.

## Consequences

- A surface painted in the two-dimensional plan shows its color in the
  three-dimensional view, under the current color-temperature light, and updates
  without a reload.
- The material seam now carries a surface identity, so per-surface painting works and
  the neutral path is unchanged; reference-less surfaces stay neutral.
- The builders emit a `SurfaceRef` per paintable face, so the paint store keyed by the
  two-dimensional Paint panel is read directly in three dimensions, with no new paint
  state.
- No model, scene-graph, file-format, or migration change: the slice widens an engine
  seam, threads existing project paint, and tags existing material groups.
- The wall-face side mapping is a fixed convention that must match the two-dimensional
  Paint panel; it is verified by eye against a painted baseline and is a one-line swap
  if mirrored.

## Alternatives considered

- **Carry paint on the scene graph.** Rejected: paint is project state the Paint panel
  owns; the scene graph is a derived projection. Passing the paint store alongside the
  graph keeps the graph a pure geometric projection and reuses the one paint store both
  views read.
- **A second material key rather than widening the existing one.** Rejected: the
  foundation reserved the widening of the one seam (section 5.2) as additive; a parallel
  key would fork the provider contract.
- **Tint the paint color by the color temperature in the material.** Rejected: the
  temperature lives in the light ([[ADR-0065-three-dimensional-lighting-and-color-temperature]]),
  so multiplying it into the albedo as well would double it. The albedo is the paint
  color; the tinted light does the rest.
- **Resolve paint inside the geometry builders.** Rejected: the builders are pure
  geometry and should not reach into the project paint store; they tag surfaces with a
  `SurfaceRef`, and the provider (constructed with the paint store) resolves the color,
  keeping resolution at the material seam.

## References

- Slice specification `docs/specs/2026-06-13-three-dimensional-painted-preview.md`.
- Implementation plan `docs/plans/2026-06-13-three-dimensional-painted-preview.md`.
- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 6.8.
- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  sections 3.4 and 5.2.
- [[ADR-0056-surface-paint-selection-and-treatments]]: the paint model, `SurfaceRef`,
  and the paint store this slice consumes.
- [[ADR-0065-three-dimensional-lighting-and-color-temperature]]: the color temperature
  in the light, so paint is shown under the illuminant.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the per-surface
  material groups by role this slice keys paint onto.
