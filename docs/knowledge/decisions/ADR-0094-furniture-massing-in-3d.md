---
slug: decisions/ADR-0094-furniture-massing-in-3d
title: 'ADR-0094: Furniture massing in the 3D preview'
type: decision
tags:
  [
    architecture,
    furniture,
    assets,
    three-d-preview,
    scene-graph,
    massing,
    schema,
    migration,
    selection,
  ]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0076-three-dimensional-floor-slab-under-walls,
    decisions/ADR-0078-three-dimensional-preview-surface-edges,
    decisions/ADR-0089-within-floor-mesh-reuse,
    decisions/ADR-0092-furniture-instance-model,
    decisions/ADR-0093-in-app-asset-library,
  ]
sourceFiles:
  [
    docs/specs/2026-06-17-furniture-in-the-3d-preview.md,
    docs/plans/2026-06-17-furniture-in-the-3d-preview.md,
    core/model/furniture-footprint.ts,
    core/migrations/schema/add-furniture-height.ts,
    core/commands/handlers/furniture-commands.ts,
    core/scene/scene-graph.ts,
    core/scene/scene-graph-deriver.ts,
    engine/scene/furniture-builder.ts,
    engine/scene/floor-subgroups.ts,
    engine/scene/build-scene.ts,
    bridge/react/framed-scene-reconciler.ts,
    editor/plan/furniture-inspector.tsx,
  ]
status: current
updated: 2026-06-17
---

# ADR-0094: Furniture massing in the 3D preview

## Status

Accepted, landed. A furniture piece placed on the plan now shows in the 3D preview
as a solid box sized to its footprint and height, standing at its position, rotation,
and elevation. The box selects in step with the plan. Real model geometry is not
loaded yet; that work is tracked as a follow-up on the assets and furniture track.

## Context

ADR-0092 added the furniture instance to the model and ADR-0093 gave the editor a
library browser, a custom-import path, a place-furniture tool, and a 2D footprint
symbol. None of that reached the 3D pane: a placed piece was invisible the moment the
user switched to the preview. ADR-0044 lists furniture in the 3D view as the next step
on the track, and ADR-0092 left the door open for it, noting that deriving a scene node
for furniture would be an additive change once it had a 3D representation.

The asset format records each piece's declared width, depth, and height, but the loader
does not parse or validate the GLB geometry, and the spec defers origin and scale
normalization. A correct model loader needs the node transforms a glTF file carries,
which the manifest dimensions alone cannot stand in for. We wanted furniture to appear
in the preview now, sized and placed correctly and selectable, without waiting on that
loader.

## Decision

Render each piece as a solid box and carry the data that box needs through the same
seams openings already use.

`FurnitureInstance` gains a `height` in millimetres, a sibling of `footprint` and
`elevationZ`. It defaults at placement from the library item's declared height: a pack
reads it from the manifest dimensions, and a user import, which has no parsed geometry,
defaults to `DEFAULT_FURNITURE_HEIGHT_MM` (750), the same editable bridge the footprint
uses. The inspector edits it through a new `setFurnitureHeight` command beside the width
and depth fields. `core/migrations/schema/add-furniture-height.ts` migrates a project
from schema 10 by backfilling that default onto any piece saved without a height, and
the current schema version moves to 11. The migration mirrors the add-floor-furniture
step that preceded it.

`deriveFurnitureNode` projects an instance into a `FurnitureSceneNode`, reversing the
ADR-0092 choice to keep furniture off the scene graph now that it has a 3D form. The
node mirrors the opening node: it holds the floor id, the rotated footprint corners
(computed once in core by `furnitureFootprintCorners`, the winding the 2D symbol already
uses), the elevation, and the height. The memoizing deriver reuses an unchanged node by
its source `FurnitureInstance` reference, the way it reuses opening nodes, so an
unrelated edit does not rebuild it.

`buildFurnitureMassing` extrudes the footprint corners from world `Y = elevationZ` to
`Y = elevationZ + height` through the same `geometryFromSections` prism path the junction
fill uses, so the box shares the walls' axis map and reads solid from outside under
front-side culling. The box draws with a new neutral `furniture` surface role. Furniture
is never a paint target, so the role falls through to the existing neutral appearance and
nothing else in the material provider changed.

The box group's name is the prefixed scene id, but its `userData.entityId` is the raw
instance id. The 2D selection keys furniture on that raw id, so the generic 3D pick and
the selection outline already select a box in step with the plan, and no selection-layer
code changed.

Furniture threads the deterministic `buildScene` path and the live-preview reconciler the
way openings do: a self-decorating sub-group of box, edge overlay, and shadow flags; a
per-floor filter in each build path; and a reconciler tier that reuses an unchanged box
across edits. The camera bounds pick up furniture on their own.

The box is the shipped representation. Loading a real model, normalizing its origin and
scale to the instance box, and falling back to the box on a load failure waits for the
follow-up.

## Consequences

- A placed piece appears in the preview as soon as it lands, frames into the camera on
  its own, and survives an unrelated edit without rebuilding.
- Selection and the outline stay in sync between the plan and the preview because the box
  carries the raw id; the selection layer needed no change.
- The neutral role keeps furniture out of the paint surfaces, so a piece is never painted.
- The per-instance height round-trips through the schema like the other furniture fields,
  backfills sensibly for older projects, and is editable in the inspector.
- The box and the height are the target the real-model loader fits a GLB into. The
  follow-up scales and centers a parsed model to the same footprint and height, so
  placement, rotation, and elevation resolve before any model loads. Until then the box
  is a faithful stand-in, and it is what the scene-webgl visual baseline checks.

## References

- Spec: `docs/specs/2026-06-17-furniture-in-the-3d-preview.md`
- Plan: `docs/plans/2026-06-17-furniture-in-the-3d-preview.md`
- ADR-0092 (furniture instance model), ADR-0093 (in-app asset library), ADR-0044
  (delivery tracks), ADR-0061 (junction geometry within a floor), ADR-0089 (within-floor
  mesh reuse), ADR-0078 (scene edge overlay).
