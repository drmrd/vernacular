---
slug: decisions/ADR-0137-wall-construction-profiles
title: 'ADR-0137: A wall references a construction profile that drives its footprint thickness'
type: decision
tags:
  [
    architecture,
    core,
    engine,
    walls,
    construction-profiles,
    registries,
    schema,
    migrations,
    old-house-vocabulary,
  ]
related:
  [
    decisions/ADR-0130-finishes-system-architecture,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0038-openings-doors-and-windows,
    decisions/ADR-0001-six-layer-architecture,
  ]
sourceFiles:
  [
    docs/plans/2026-06-29-wall-construction-profiles.md,
    core/model/types.ts,
    core/model/factories.ts,
    core/migrations/schema/add-wall-construction-profile.ts,
    schema/12/vernacular.schema.json,
    core/scene/scene-graph.ts,
    core/scene/construction-profile.ts,
    core/registries/construction-profiles.ts,
    engine/scene/wall-builder.ts,
  ]
status: current
updated: 2026-06-29
---

# ADR-0137: A wall references a construction profile that drives its footprint thickness

## Status

Accepted, landed. A wall can now name a construction profile, and when it does,
the assembly's total thickness drives the wall's drawn footprint instead of a
single hand-entered number. This wires the construction-profile registry and
resolve layer that [[ADR-0130-finishes-system-architecture]] introduced into the
wall model, the derived scene graph, and the 3D wall builder.

## Context

Historic walls are layered. A solid masonry wall is brick or stone with a plaster
face; a stud partition is lath and plaster over a framed cavity. Their finished
thickness is the sum of those layers, not a number the drafter wants to look up
and re-enter by hand. The construction-profile registry already carried that data,
and `core/scene/construction-profile.ts` already resolved a profile id into its
ordered layers and total thickness, but nothing on a wall pointed at a profile, so
the data had no path to the geometry. A wall's footprint still came from its single
`thickness` field.

The question was how a wall should reference a profile and where the resolution
from id to thickness should live. The registry holds the layers, so the wall needs
only to name one. That name has to survive being saved and reloaded, which makes it
a versioned change to the persisted model, and the resolution has to stay in pure
core so the engine read stays trivial and the behavior is unit-tested without a 3D
context.

## Decision

### A bare registry id on the wall, validated at the boundary

`Wall` gains an optional `constructionProfile?: string`, a
`ConstructionProfileRegistry` id. The model type keeps it a bare string rather than
a union of known ids. The id is validated where it is resolved, at the registry
boundary, not by the model type. This follows the precedent set by `Opening.type`
in [[ADR-0038-openings-doors-and-windows]] and the registry pattern in
[[ADR-0006-registry-pattern]]: registry-parameterized model data is an alias the
registry vouches for, so a project can carry a profile from a pack the model layer
has never heard of. Absent, the field preserves the existing single-`thickness`
footprint, so every wall drawn before this change reads back unchanged.

### Schema version 12 with a passthrough migration

The CORE JSON Schema is generated from the model with `additionalProperties: false`
and committed immutable under `schema/<version>/`, with `pnpm schema:check` guarding
drift, so adding a field is not free. `CURRENT_SCHEMA_VERSION` moves from 11 to 12,
`schema/12/vernacular.schema.json` is regenerated, and a `from: 11` migration is
registered. Because the new field is optional, a version-11 wall is already valid at
version 12 with nothing to backfill, so the migration is an identity passthrough; it
exists only so the migration framework in
[[ADR-0029-schema-registry-migration-framework]] can advance the document version
without throwing. The orchestrator owns the version stamp, so the migration step
leaves `meta.schemaVersion` alone.

### The id rides the scene graph and resolves to thickness in pure core

`deriveWallNode` carries the id onto `WallSceneNode.constructionProfile`, omitting it
when the wall has none so an optional field is never written as `undefined`. A pure
helper, `effectiveWallThickness(node, constructionProfiles?)`, turns the node into a
footprint thickness: the resolved assembly total when the node names a
registry-known profile, otherwise the node's raw thickness. An unknown id also falls
back to the raw thickness, so a project that references a profile the active registry
no longer carries degrades to today's single-thickness wall rather than collapsing to
a zero-width sliver.

### The engine only reads the helper

`engine/scene/wall-builder.ts` builds its per-edge thickness array through
`effectiveWallThickness` instead of reading `node.thickness` directly. The footprint
math, the prism path, and the junction fills all already consume that array, so the
profile thickness flows to all of them from the one read. The resolve logic stays in
`core/`, and the engine keeps no knowledge of layers or registries, holding the
boundary in [[ADR-0001-six-layer-architecture]].

## Consequences

- A masonry or layered wall draws to its true finished thickness once it names a
  profile, and the drafter sets the assembly rather than re-deriving a number.
- A wall with no profile, and a wall naming a profile the active registry does not
  carry, both draw exactly as before. The feature is additive and the fallback is
  the prior behavior, so nothing regresses for existing projects.
- The id-to-thickness resolution is a pure function unit-tested without Three.js,
  and the engine change is a single read, so the 3D and the eventual 2D paths share
  one source of truth for footprint thickness.
- Per-layer rendering is deliberately out of scope here. The 3D builder draws the
  wall as one solid block at the resolved thickness, not as distinct material
  layers; per-layer 3D materials are tracked separately under issue #380 and the
  finishes seam in [[ADR-0130-finishes-system-architecture]]. The 2D plan wall
  symbol still reads the raw `thickness`; wiring it to `effectiveWallThickness` is a
  named follow-up, filed at merge, so the partial render coverage is a chosen scope
  line rather than an oversight.

## Alternatives considered

- **A typed union of known profile ids on the model.** Rejected for the same reason
  `Opening.type` is a bare alias: it would lock the model to the built-in registry
  and break the moment a pack ships a profile the core type does not enumerate.
  Validation belongs at the registry boundary, not in the model type.
- **Resolving thickness inside the engine.** Rejected because it would pull registry
  knowledge across the layer boundary and make the resolution untestable without a
  3D context. Keeping `effectiveWallThickness` in pure core leaves the engine a thin
  reader and lets both the 3D and the future 2D path call the same helper.
- **No schema version bump, treating the field as free-additive.** Not possible: the
  generated schema pins `additionalProperties: false` and is drift-guarded, so an
  unversioned field would fail `pnpm schema:check` and a version-11 document would
  throw on load. The version 12 bump with a passthrough migration is the supported
  path.

## References

- ADR-0130 (the finishes system that introduced the construction-profile registry
  and the `core/scene/construction-profile.ts` resolve layer this wires in).
- ADR-0006 (the registry pattern: a model id the registry validates at its
  boundary).
- ADR-0029 (the schema-and-registry migration framework that the version 11 to 12
  bump and the passthrough migration run through).
- ADR-0038 (the `Opening.type` precedent for a bare registry-id alias on a model
  type).
- ADR-0001 (the six-layer architecture that keeps the resolve in pure core and the
  engine a reader).
- Issue #365 (wall construction profiles). Issue #380 (per-layer 3D wall materials),
  deferred from this change.
