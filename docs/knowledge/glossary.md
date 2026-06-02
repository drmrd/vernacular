---
slug: glossary
title: Glossary
type: glossary
tags: [reference]
related: []
sourceFiles: []
status: current
updated: 2026-06-02
---

# Glossary

Terms used across the Vernacular design specification and codebase.
Cross-references between this file and the design specification's
glossary in section 12 should stay synchronized; this file is the
canonical version going forward.

## Architecture and code

- **AC**: Acceptance Criterion. Each MVP phase has a numbered AC table.
- **ADR**: Architecture Decision Record. Lives under `docs/knowledge/decisions/`.
- **Bridge layer**: The single module that touches both React state and Three.js scene state. Owns the command dispatch boundary.
- **Command pattern**: Mutation discipline; every state change flows through `dispatch(command)`, with the framework capturing the inverse for undo/redo.
- **Composite project**: TypeScript build mode (`tsc -b`) used to type-check the Vite config alongside the app sources.
- **Content-addressed asset reference**: `(scope, contentHash)` identifier resolved through the `AssetRegistry`.
- **Core layer**: Pure-TS domain code. Forbidden from importing React or Three.js.
- **Editor layer**: The React UI: shell, tools, panels, gizmos.
- **Engine layer**: Three.js scene management, renderers, loaders. The only layer that imports Three.js.
- **OPFS**: Origin Private File System; browser sandboxed filesystem used for asset cache and as the universal `ProjectStore` backend.
- **R3F**: React Three Fiber. Declarative React wrapper over Three.js.
- **Red-green-blue**: The TDD cycle adopted by the project: failing test (red), minimal implementation (green), Clean Code review (blue).
- **Six-layer architecture**: The repo's hard dependency-direction split: `app/` -> `editor/` -> `bridge/` -> `engine/` -> `storage/` -> `core/`.
- **Storage layer**: Provider-shaped interfaces (`ProjectStore`, `LibraryStore`, `AssetCache`) plus their implementations.

## Domain (floor planning)

- **Architectural element**: A typed first-class building-shell record: doors, windows, transoms, sidelights, wall features, ceiling features, trim profiles. Defined in the `ElementTypeRegistry`.
- **Era**: Period-aware architectural style tag. Resolved hierarchically (room override beats floor override beats project default).
- **Floor**: One horizontal level of a project (basement, main, upper, attic). Has its own walls, openings, rooms, trim, furniture, ceiling features, and underlays.
- **Furniture instance**: A placed reference to an asset, with position, rotation, and optional material overrides.
- **Opening**: A wall cut for a door, window, transom, or similar. Different from a stair, which is its own entity spanning two floors.
- **Project**: A floor planner document. Lives on disk as a folder (or a `.house.zip` bundle for sharing).
- **Room**: A polygon derived from wall topology. Optionally overridable via `customPolygon`. Has a name, purpose, and optional era override.
- **Stair**: Distinct top-level entity that spans two floors. Has parametric geometry (treads, risers, runs, landings, railings, balusters, newels).
- **Trim**: Path-based wall or ceiling profile (crown molding, baseboard, picture rail, wainscoting, etc.).
- **Underlay**: Calibrated reference image, PDF, or 3D scene pinned to a floor; the migration-trace workflow draws plans on top of these.

## File formats and packs

- **`.house` / `.house.zip`**: The project sharing format. A folder on disk; zipped only for distribution.
- **Asset pack**: Versioned, content-addressed bundle of 3D models, textures, palettes, or registry entries. Distributed under SPDX-declared licenses.
- **Registry pack**: Same shape as an asset pack but contributes registry entries (eras, element types, trim profiles, finishes, room purposes).
- **`vernacular-pack`**: The in-tree CLI tool that builds, validates, and publishes packs. Lands in Phase 0i.

## Engineering norms

- **Dependency cooldown**: The 15-day minimum release age enforced by pnpm via `.npmrc`.
- **FIRST**: Test-quality principles: Fast, Independent, Repeatable, Self-validating, Timely.
- **Knowledge graph**: The `docs/knowledge/` tree. Indexed by `pnpm knowledge:index` into `INDEX.md` and `index.json`.
- **OKLab**: Perceptually uniform color space; the canonical internal color representation.
- **SPDX**: Software Package Data Exchange license identifier registry.
