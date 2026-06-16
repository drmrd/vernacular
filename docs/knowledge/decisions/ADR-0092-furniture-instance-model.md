---
slug: decisions/ADR-0092-furniture-instance-model
title: 'ADR-0092: Furniture instances on the floor model'
type: decision
tags: [architecture, model, furniture, assets, commands, migration]
related: [decisions/ADR-0007-content-addressed-assets, decisions/ADR-0093-in-app-asset-library]
sourceFiles:
  [
    docs/specs/2026-06-16-asset-library-browser-and-placement.md,
    core/model/types.ts,
    core/model/factories.ts,
    core/commands/handlers/furniture-commands.ts,
    core/migrations/schema/add-floor-furniture.ts,
  ]
status: current
updated: 2026-06-16
---

# ADR-0092: Furniture instances on the floor model

## Status

Accepted, landed. A `FurnitureInstance` record lives on `Floor.furniture`, a
`createFurnitureInstance` factory builds it, six commands place, move, rotate,
resize, rename, and remove it, and a schema migration adds the empty array to
every floor while raising the current schema version to 10.

## Context

The plan model already carried walls, openings, rooms, dimensions, stairs, and
underlays per floor. The asset-library work (#174) needed somewhere to record a
piece of furniture the user drops on the plan: which asset it is, where it sits,
how it is turned, and how big its footprint reads in 2D. The asset itself is a
content-addressed reference (ADR-0007); a placed piece is an instance of that
reference at a spot on a floor, the same way an opening is an instance hosted by a
wall.

Two forces shaped the record. The 3D preview is a later issue (#175), so the model
should not bake in anything that presumes a parsed mesh; the footprint is an
editable 2D rectangle the user can correct, not a value read from geometry.
Vernacular's audience renovates old houses whose rooms are rarely square, so the
rotation has to be a free angle rather than a 90-degree step.

## Decision

Add `FurnitureInstance` to `core/model/types.ts` and hang an array of them off
each `Floor` as `furniture`. The record holds an `id`, the content-addressed
`assetRef`, a plan `position` in millimetres, a free `rotation` in degrees, an
`elevationZ` above the floor (0 sits a piece on the floor), a `footprint` of
`width` and `depth` in millimetres, an optional `name`, and a reserved
`customizations` bag for later per-instance data. `elevationZ` is present now even
though placement is 2D, so a future wall-mounted or floating piece needs no second
migration; the spec review asked for it explicitly.

`createFurnitureInstance` in `core/model/factories.ts` builds the record, filling a
random `id`, a zero rotation and elevation, and omitting `name` when none is given.
A piece with no specific footprint falls back to `DEFAULT_FURNITURE_FOOTPRINT_MM`, a
neutral 600 mm square that names its scalar the way the wall-thickness default does.

`core/commands/handlers/furniture-commands.ts` adds the six undoable commands
(`placeFurniture`, `moveFurniture`, `rotateFurniture`, `resizeFurniture`,
`setFurnitureName`, `removeFurniture`) and a `registerFurnitureCommands` registrar,
mirroring the opening commands and registered beside them. Each maps the target
floor and, for the per-piece edits, the target furniture by id; setting an empty
name drops the field rather than storing a blank.

`core/migrations/schema/add-floor-furniture.ts` migrates a project from schema 9 by
giving every floor an empty `furniture` array, and the current schema version moves
to 10. The migration mirrors the add-floor-openings step that preceded it.

Furniture stays out of the derived `SceneGraph`. The scene graph flattens the
entities the 3D builder and the spatial index consume; furniture has no 3D
representation yet and is hit-tested and drawn from the floor record directly, so
deriving a scene node for it now would be unused weight. ADR-0093 records how the
2D editor reads the floor array.

## Consequences

- A placed piece is a first-class, undoable part of the project and round-trips
  through the schema like any other floor entity.
- The footprint is editable model data, so an approximate default can be corrected
  in the inspector without touching the asset; geometry-derived sizing waits for
  the 3D work that parses the mesh.
- `elevationZ` and `customizations` are reserved now, so wall-mounted pieces and
  per-instance variants land later without another migration.
- Keeping furniture off the scene graph means the 2D selection, hit-test, and draw
  paths read it from the floor; if and when furniture renders in 3D, deriving a
  scene node is an additive change.

## References

- Feature specification: `docs/specs/2026-06-16-asset-library-browser-and-placement.md`.
- ADR-0007 (content-addressed assets; the `assetRef` a placed piece points at).
- ADR-0093 (the in-app asset library and the 2D placement that consume this model).
