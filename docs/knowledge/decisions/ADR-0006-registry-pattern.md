---
slug: decisions/ADR-0006-registry-pattern
title: 'ADR-0006: Versioned data-driven registries for typed taxonomy'
type: decision
tags: [architecture, registries, extensibility, data-driven]
related: [decisions/ADR-0007-content-addressed-assets, decisions/ADR-0001-six-layer-architecture]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    core/registries/registry.ts,
    core/registries/finishes.ts,
    core/registries/element-types.ts,
  ]
status: current
updated: 2026-06-02
---

# ADR-0006: Versioned data-driven registries for typed taxonomy

## Status

Accepted. The generic registry mechanism and the first two built-in registries
are implemented in `core/registries/`.

## Context

Vernacular needs to grow new architectural element types (Federalist sash
windows, dutch doors), new eras, new trim profiles, and new finishes without a
code change for every addition. A subclassing approach (one class per type)
makes additions painful and brittle; a free-form "string type plus metadata
blob" approach loses type safety and tooling support.

## Decision

Seven typed registries in `core/registries/`, each with the same shape:

- `ElementTypeRegistry` (doors, windows, wall features, ceiling features, stair components)
- `EraRegistry`
- `CategoryRegistry`
- `TrimProfileRegistry`
- `FinishRegistry`
- `PaletteRegistry`
- `RoomPurposeRegistry`

Each entry carries a stable `id`, locale-aware display names, parameters, era
tags, and rendering hints. Registries are versioned, mergeable across sources,
append-only by convention, and have their own migration tables. Community
contributions are "registry packs", JSON files with manifest metadata.

## Current implementation state

The generic mechanism lives in `core/registries/registry.ts`:

- `RegistryEntry` is the base shape (`{ id: string }`).
- `Registry<T extends RegistryEntry>` is `{ version: number; entries:
Readonly<Record<string, T>> }`. Entries are indexed by `id` for lookup.
- `createRegistry(version, entries[])` indexes a list into the keyed shape.
- `getEntry(registry, id)` returns the entry or `undefined`.
- `mergeRegistries(base, overlay)` overlays entries with overlay winning on `id`
  collision and the merged version taking the higher of the two. This is the
  cross-source merge the design calls for (built-in plus user plus pack).

Two registries are seeded so the model has concrete data to build against:

- `core/registries/finishes.ts` defines `Finish` (adds `roughness`, `sheen`,
  `specular` to a registry entry) and `builtinFinishes`, a version-1 registry of
  the six paint finishes from the spec: flat, matte, eggshell, satin,
  semi-gloss, gloss, each mapped to material-parameter presets.
- `core/registries/element-types.ts` defines `ElementType` (adds `category`,
  `plan2D`, `scene3D`) and `builtinElementTypes`, a version-1 registry with two
  entries: a `straight-wall` (category `wall`) and a `single-swing-door`
  (category `opening`). Each entry pairs a 2D plan symbol with a 3D builder
  reference, matching the spec's requirement that element types carry both
  `plan2D` rendering rules and a `scene3D` reference.

The remaining five registries (eras, categories, trim profiles, palettes, room
purposes) are not seeded yet; they follow the same `createRegistry` shape when
they land.

## Consequences

- Adding a new opening type (for example a curved transom) is a registry entry
  plus rendering rules, not a schema change.
- The library browser query API is uniform across categories: filter by era, by
  category, by source pack.
- Migrations can rename or deprecate entries without breaking projects that
  reference them. `ProjectMeta.registryVersions` records the per-registry
  version a project was last saved against, which drives registry-aware
  migration.
- `eslint.config.js` turns `no-magic-numbers` off under `**/registries/**`
  because registries are declarative data tables; numeric material parameters
  are inherent data, not unexplained constants.

## References

- Design specification, sections 4.4 and 6.8 (Registries; finishes to material
  parameters).
- Asset registry resolution (ADR-0007) is the sibling to this pattern.
