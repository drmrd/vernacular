---
slug: decisions/ADR-0006-registry-pattern
title: 'ADR-0006: Versioned data-driven registries for typed taxonomy'
type: decision
tags: [architecture, registries, extensibility, data-driven]
related: [decisions/ADR-0007-content-addressed-assets]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0006: Versioned data-driven registries for typed taxonomy

## Status

Accepted. Implementation lands in Phase 0f.

## Context

Vernacular needs to grow new architectural element types (Federalist sash windows, dutch doors), new eras, new trim profiles, and new finishes without a code change for every addition. A subclassing approach (one class per type) makes additions painful and brittle; a free-form "string type plus metadata blob" approach loses type safety and tooling support.

## Decision

Seven typed registries in `core/registries/`, each with the same shape:

- `ElementTypeRegistry` (doors, windows, wall features, ceiling features, stair components)
- `EraRegistry`
- `CategoryRegistry`
- `TrimProfileRegistry`
- `FinishRegistry`
- `PaletteRegistry`
- `RoomPurposeRegistry`

Each entry carries a stable `id`, locale-aware display names, parameters, era tags, and rendering hints. Registries are versioned, mergeable across sources, append-only by convention, and have their own migration tables. Community contributions are "registry packs", JSON files with manifest metadata.

## Consequences

- Adding a new opening type (e.g., a curved transom) is a registry entry plus rendering rules, not a schema change.
- The library browser query API is uniform across categories: filter by era, by category, by source pack.
- Migrations can rename or deprecate entries without breaking projects that reference them.

## References

- Design specification, section 4.4 (Registries).
- Asset registry resolution algorithm (section 4.2) is the sibling to this pattern.
