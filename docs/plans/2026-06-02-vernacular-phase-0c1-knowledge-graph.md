# Vernacular: Phase 0c.1 Knowledge Graph Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `docs/knowledge/` directory with the index-builder script, ten seed Architecture Decision Records (ADRs) covering Phase 0a/0b/0b.1 decisions, a project glossary, and the generated index files. This is the load-bearing foundation that Phase 0c.2's Claude Code agents will rely on.

**Architecture:** Markdown files with YAML frontmatter live under `docs/knowledge/`. A Node script (`scripts/knowledge-index.mjs`) scans every Markdown file under `docs/knowledge/` (excluding `INDEX.md` and `index.json`), validates the frontmatter against a small schema, and emits two artifacts: `docs/knowledge/INDEX.md` (human-readable, grouped by tag) and `docs/knowledge/index.json` (machine-readable, flat). The script is wired up as `pnpm knowledge:index` and runs in CI to verify the committed artifacts are in sync. Future phases (0d) add a pre-commit hook to regenerate them on the fly.

**Tech Stack:** Node 20 (ESM), no new pnpm dependencies (`yaml` parser comes from a tiny inline implementation or via the existing toolchain).

**Scope boundary:** This plan does NOT create CLAUDE.md, `.claude/rules.md`, any `.claude/agents/` definitions, any `.claude/commands/` slash commands, or any `.claude/tools/` wrappers. Those land in Phase 0c.2 (Claude infrastructure) and assume the knowledge graph stood up here. This plan also does NOT add Husky, commitlint, or release-please (Phase 0d).

---

## File Structure

| File                                                            | Purpose                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `docs/knowledge/INDEX.md`                                       | Auto-generated; human-readable index of every entry, grouped by tag    |
| `docs/knowledge/index.json`                                     | Auto-generated; machine-readable flat list                             |
| `docs/knowledge/glossary.md`                                    | Hand-curated; terms used across the spec and code                      |
| `docs/knowledge/decisions/ADR-0001-six-layer-architecture.md`   | The 6-layer codebase split                                             |
| `docs/knowledge/decisions/ADR-0002-license-apache-2.md`         | Apache-2.0 throughout                                                  |
| `docs/knowledge/decisions/ADR-0003-storage-provider-pattern.md` | `ProjectStore` / `LibraryStore` / `AssetCache` interfaces              |
| `docs/knowledge/decisions/ADR-0004-three-js-r3f-webgpu.md`      | Three.js + R3F + WebGPU stack choice                                   |
| `docs/knowledge/decisions/ADR-0005-command-pattern-undo.md`     | Command pattern with framework-captured inverse                        |
| `docs/knowledge/decisions/ADR-0006-registry-pattern.md`         | Versioned data-driven registries (eras, element types, finishes, etc.) |
| `docs/knowledge/decisions/ADR-0007-content-addressed-assets.md` | `(scope, contentHash)` references with multi-source resolution         |
| `docs/knowledge/decisions/ADR-0008-oklab-internal-color.md`     | OKLab as internal color representation                                 |
| `docs/knowledge/decisions/ADR-0009-test-pyramid-rgb-tdd.md`     | Test pyramid plus red-green-blue TDD with independent agents           |
| `docs/knowledge/decisions/ADR-0010-dependency-cooldown.md`      | 15-day minimum release age                                             |
| `scripts/knowledge-index.mjs`                                   | The index-builder script                                               |
| `package.json`                                                  | Adds `knowledge:index` script                                          |
| `.github/workflows/ci.yml`                                      | Adds a "Knowledge index up to date" check                              |
| `CONTRIBUTING.md`                                               | Adds a Knowledge graph section explaining contributor workflow         |
| `docs/plans/2026-06-01-vernacular-phase-0a-build-foundation.md` | Cleans up a stray Co-Authored-By line at line 943 (housekeeping nit)   |
| `ROADMAP.md`                                                    | Updates Phase 0c row status                                            |

Empty placeholder subdirectories (`components/`, `patterns/`, `anti-patterns/`, `incidents/`, `runbooks/`) are NOT created here. Each one is added when its first entry lands.

---

## Tasks

### Task 1: Verify branch and clean tree

- [ ] **Step 1: Confirm working directory and branch**

Run:

```
pwd
git branch --show-current
git status --short
```

Expected:

- `pwd` shows `/Users/dan/workspace/vernacular`
- branch is `feat/phase-0c1-knowledge-graph`
- working tree is clean

If wrong, STOP and report BLOCKED.

---

### Task 2: Create `docs/knowledge/decisions/` directory

- [ ] **Step 1: Make the directory**

Run:

```
mkdir -p docs/knowledge/decisions
```

- [ ] **Step 2: Verify**

Run: `test -d docs/knowledge/decisions && echo ok`
Expected: `ok`.

---

### Task 3: Create `docs/knowledge/glossary.md`

**Files:**

- Create: `docs/knowledge/glossary.md`

- [ ] **Step 1: Write the file**

```markdown
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
```

- [ ] **Step 2: Verify**

Run: `head -2 docs/knowledge/glossary.md`
Expected: the YAML front-matter opening `---` and the `slug: glossary` line.

---

### Task 4: Create ADR-0001 (six-layer architecture)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0001-six-layer-architecture.md`

- [ ] **Step 1: Write the file**

```markdown
---
slug: decisions/ADR-0001-six-layer-architecture
title: 'ADR-0001: Six-layer codebase architecture'
type: decision
tags: [architecture, layering, boundaries]
related: [decisions/ADR-0004-three-js-r3f-webgpu]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0001: Six-layer codebase architecture

## Status

Accepted. Implementation lands in Phase 0f.

## Context

Vernacular spans a React UI, a Three.js-driven 3D engine, multiple storage backends, and a pure-TS domain model. Letting any module import from any other leads to tangled dependencies, slow test feedback, and high coupling between rendering and storage. We need a structure where the domain model is testable without a browser, the engine is swappable, and the UI is replaceable.

## Decision

Six layers with a strict downward dependency direction:

1. `app/`, top-level routes, providers, top-level state.
2. `editor/`, React UI: shell, tools, panels, gizmos.
3. `bridge/`, React Three Fiber glue; the only place commands cross into the engine.
4. `engine/`, Three.js scene management, renderers, asset loaders.
5. `storage/`, `ProjectStore`, `LibraryStore`, `AssetCache` interfaces and impls.
6. `core/`, pure TypeScript domain model. No React. No Three.js. No DOM.

Every layer may depend on layers below it; never above. Enforced by lint rules in Phase 0d.

## Consequences

- `core/` runs in Node, so unit tests for domain logic do not need a browser.
- The 3D renderer can be replaced (WebGL fallback, future native renderer, server-side rasterization) without touching higher layers.
- Adding new features tends to spread across layers; contributors must understand the layering up front. This is why CLAUDE.md and ARCHITECTURE.md make it the very first thing they read.

## References

- Design specification, section 2 (Architecture).
- Phase 0a foundation commit: 48000cd.
- Phase 0f source skeleton (pending).
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0001-six-layer-architecture.md`
Expected: the three opening lines including `slug: decisions/ADR-0001-six-layer-architecture`.

---

### Task 5: Create ADR-0002 (Apache-2.0 license)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0002-license-apache-2.md`

- [ ] **Step 1: Write the file**

```markdown
---
slug: decisions/ADR-0002-license-apache-2
title: 'ADR-0002: Apache-2.0 license throughout the repository'
type: decision
tags: [license, governance]
related: [decisions/ADR-0007-content-addressed-assets]
sourceFiles: [LICENSE, NOTICE, package.json]
status: current
updated: 2026-06-02
---

# ADR-0002: Apache-2.0 license throughout the repository

## Status

Accepted. Implemented in Phase 0a.

## Context

We needed a license that protects contributors from patent claims, accommodates corporate contributors (whose internal compliance teams flag unfamiliar licenses), and stays compatible with the broader open-source ecosystem we intend to draw asset packs from. MIT and BSD are simpler but lack a patent grant; AGPL deters corporate contribution; the Mozilla and Eclipse families are workable but uncommon for browser-first projects.

## Decision

Apache License, Version 2.0, applied uniformly to:

- Source code and configuration in this repository.
- Documentation (specs, plans, knowledge-graph entries).
- Schemas and data formats produced by Vernacular.

Asset packs and registry packs declare their own SPDX licenses in their manifests, which Vernacular enforces at install and export time (see ADR-0007).

## Consequences

- Patent grant from contributors protects downstream users.
- The NOTICE file accumulates required attributions over time.
- Asset packs with incompatible licenses (e.g., GPL) can still be installed if explicitly accepted but cannot be redistributed via a bundle export; the export pipeline refuses those mixes.

## References

- Phase 0a commit: 48000cd (LICENSE, NOTICE created).
- Phase 0a commit 0be9856 (NOTICE org placeholder resolved).
- Design specification, section 1 (Overview), section 4.8 (license enforcement).
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0002-license-apache-2.md`
Expected: the slug line in frontmatter.

---

### Task 6: Create ADR-0003 (storage provider pattern)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0003-storage-provider-pattern.md`

- [ ] **Step 1: Write the file**

```markdown
---
slug: decisions/ADR-0003-storage-provider-pattern
title: 'ADR-0003: Provider pattern for storage with cloud-sync seam'
type: decision
tags: [architecture, storage, persistence, opfs]
related: [decisions/ADR-0007-content-addressed-assets, decisions/ADR-0001-six-layer-architecture]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0003: Provider pattern for storage with cloud-sync seam

## Status

Accepted. Implementation lands in Phase 0h.

## Context

Vernacular projects must persist locally (no backend required at MVP), survive across browsers that vary in filesystem support, and remain ready to add cloud sync later without rewriting consumers. Browsers offer multiple persistence APIs (File System Access, OPFS, IndexedDB, Service Worker cache) with quirky availability. Hard-coding any one of them paints us into a corner.

## Decision

Three interfaces in `storage/`, each with multiple implementations:

- `ProjectStore`, open, save, lock, watch the active project (`FileSystemFolderProjectStore`, `OPFSProjectStore`, `ZipBundleProjectStore`, future `CloudSyncProjectStore`).
- `LibraryStore`, user library of custom assets, custom palettes, settings.
- `AssetCache`, content-hash keyed cache for the assets the app has fetched or imported.

Consumers (the bridge, editor, and engine layers) interact with the aggregated facades only, never with browser APIs directly.

## Consequences

- Project files can be a folder on disk (best for git interop), an OPFS-only flow (works in all major browsers), or a `.house.zip` bundle (shareable). The user picks per project; switching is supported.
- A future cloud-sync implementation is additive: it plugs into the existing interfaces without consumer changes.
- The interface boundary is the right place to apply policies like multi-tab Web Locks coordination, quota observation, and autosave snapshots.

## References

- Design specification, section 5 (Storage & persistence).
- ADR-0007 (asset references that flow through the same providers).
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0003-storage-provider-pattern.md`
Expected: the slug line.

---

### Task 7: Create ADR-0004 (Three.js + R3F + WebGPU)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0004-three-js-r3f-webgpu.md`

- [ ] **Step 1: Write the file**

```markdown
---
slug: decisions/ADR-0004-three-js-r3f-webgpu
title: 'ADR-0004: Three.js plus React Three Fiber on WebGPU'
type: decision
tags: [architecture, rendering, engine, webgpu, three.js]
related: [decisions/ADR-0001-six-layer-architecture, decisions/ADR-0008-oklab-internal-color]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0004: Three.js plus React Three Fiber on WebGPU

## Status

Accepted. Implementation lands in Phase 0f. Color-temperature paint preview lands in Phase 0g.

## Context

The 3D scene is the visual product. The renderer choice dictates the ceiling on lighting fidelity, paint preview accuracy, and performance under load. The options span pure WebGL (Three.js, Babylon.js), modern WebGPU, and out-of-band native engines compiled to WebAssembly.

## Decision

- **Three.js** as the rendering engine. Mature ecosystem, well-understood API, broad community.
- **React Three Fiber (R3F)** as the integration layer for the React UI. Declarative composition of the scene tree matches the rest of the editor.
- **WebGPU** as the primary backend via Three.js's WebGPURenderer. WebGL2 fallback is a fast-follow in Phase 0f; the renderer-selection seam is in place from day one.

The engine layer wraps all of this. Higher layers do not import Three.js directly (see ADR-0001).

## Consequences

- Phase-8 lighting fidelity work plugs into the existing `LightingProvider` seam without touching the scene graph or material definitions.
- Custom shaders (paint material with finish parameter and color-temperature responsiveness) live in `engine/materials/` and are isolated from the rest of the codebase.
- A future native renderer (e.g., Tauri-hosted Skia) is a candidate replacement at the engine layer, not a rewrite.

## References

- Design specification, section 6 (Rendering & engine).
- Brainstorming transcript on the native-vs-web tradeoff.
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0004-three-js-r3f-webgpu.md`
Expected: the slug line.

---

### Task 8: Create ADR-0005 (command pattern undo)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0005-command-pattern-undo.md`

- [ ] **Step 1: Write the file**

```markdown
---
slug: decisions/ADR-0005-command-pattern-undo
title: 'ADR-0005: Command pattern with framework-captured inverse'
type: decision
tags: [architecture, commands, undo-redo, mutation-discipline]
related: [decisions/ADR-0001-six-layer-architecture]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0005: Command pattern with framework-captured inverse

## Status

Accepted. Implementation lands in Phase 0f.

## Context

A floor planner has many mutation surfaces (walls, openings, furniture, paint, trim, stairs, etc.). Undo and redo must work correctly across every one of them, including coalescing of continuous actions like a drag. Hand-writing matched do-and-undo pairs for every operation is error-prone; contributors often forget to update the undo path when they tweak the forward path.

## Decision

A single mutation boundary in `core/commands/dispatch.ts`. Every state change goes through `dispatch(command, projectState)`. Commands declare their `apply` logic only; the framework wraps that with an `InverseCapture` proxy that records every mutation, and the captured snapshot drives the automatic `revert` path. Custom `revert` is supported as an escape hatch but is rare.

Coalescing is opt-in via `coalesceWith(prev)`; drag operations declare themselves coalescable so the resulting undo history shows one entry per drag, not one per pointer event. Selection state lives outside the undo history.

## Consequences

- Contributors only write the forward path. The undo path is correct by construction.
- A single dispatch boundary is the natural place to add observability (audit log, telemetry once opt-in, structured logging in dev).
- Coalescing rules are explicit per command type rather than implicit timing windows.
- Persistence of the history with autosave snapshots becomes straightforward because commands are serializable.

## References

- Design specification, section 7.1 (Commands and undo/redo).
- Phase 0g (Hello-wall) will be the first place a real command flows through dispatch.
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0005-command-pattern-undo.md`
Expected: the slug line.

---

### Task 9: Create ADR-0006 (registry pattern)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0006-registry-pattern.md`

- [ ] **Step 1: Write the file**

```markdown
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
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0006-registry-pattern.md`
Expected: the slug line.

---

### Task 10: Create ADR-0007 (content-addressed asset references)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0007-content-addressed-assets.md`

- [ ] **Step 1: Write the file**

```markdown
---
slug: decisions/ADR-0007-content-addressed-assets
title: 'ADR-0007: Content-addressed asset references'
type: decision
tags: [architecture, assets, references, integrity, supply-chain]
related: [decisions/ADR-0003-storage-provider-pattern, decisions/ADR-0006-registry-pattern]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0007: Content-addressed asset references

## Status

Accepted. Implementation lands in Phase 0f.

## Context

A project references many external pieces (furniture models, underlay images, paint palettes). Sharing a project should not break references; renaming an asset, switching pack versions, or moving a custom model between machines should resolve gracefully. Path-based references fail all three. Hash-based references (`sha256:...`) work but make project files opaque.

## Decision

Every asset reference is the pair `(scope, contentHash)`:

- `scope` is one of `pack:<id>@<version>` (a curated or community pack), `user` (the user's personal library), or `project` (embedded in this project's `assets/`).
- `contentHash` is a sha256 over the asset bytes.

The `AssetRegistry` aggregates all sources and resolves a reference with graceful degradation: exact match first, then hash match in any other source, then pack-version fallback, then a clearly-labeled placeholder with the correct footprint so editing continues.

## Consequences

- Renaming a pack does not break projects.
- A user who imports a custom model and shares the project carries that model along (it lives in `project` scope), so the recipient gets the same scene.
- Deduplication is automatic. If two packs ship the same hash, the cache stores it once.
- License and attribution travel with the source record. The export pipeline can audit them without parsing the project.

## References

- Design specification, section 4.2 (Resolution precedence and fallback) and 4.3 (Asset pack format).
- ADR-0003 (storage providers, where references live).
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0007-content-addressed-assets.md`
Expected: the slug line.

---

### Task 11: Create ADR-0008 (OKLab internal color)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0008-oklab-internal-color.md`

- [ ] **Step 1: Write the file**

```markdown
---
slug: decisions/ADR-0008-oklab-internal-color
title: 'ADR-0008: OKLab as the internal color representation'
type: decision
tags: [color, color-science, paint, oklab]
related: [decisions/ADR-0004-three-js-r3f-webgpu]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0008: OKLab as the internal color representation

## Status

Accepted. Implementation lands in Phase 0g (basic paint material) and gains fidelity in Phase 6.

## Context

Vernacular's value-add over generic floor planners is fidelity for paint, finish, and lighting. Storing paint colors in sRGB makes mixing and comparison hue-distorted; CIELAB is perceptually uniform but older and less faithful to modern displays. OKLab (Björn Ottosson, 2020) is perceptually uniform, mathematically tractable, and matches modern wide-gamut displays well.

## Decision

All paint colors, palette entries, and intermediate color operations (mixing, comparing, interpolating) use OKLab internally. The conversion to sRGB (or Display P3 on wide-gamut devices) happens only at the renderer boundary, with proper gamma. The custom `PaintMaterial` shader receives OKLab inputs and produces gamma-correct outputs.

Palette entries store color in three forms simultaneously: OKLab (canonical), sRGB hex (display and serialization convenience), and `originalSpec` (the source brand or vendor identifier, e.g., a Sherwin-Williams code).

## Consequences

- Mixing two paints in OKLab produces a perceptually plausible midpoint, not a muddy sRGB average.
- The color-temperature slider in Phase 0g can shift paint perception in real time without recomputing palettes.
- Phase 6 paint catalogs from third parties carry the brand's stated sRGB hex (for compatibility with their tooling) while we use OKLab for everything else.

## References

- Design specification, section 7.4 (Color science).
- Björn Ottosson, ["A perceptual color space for image processing"](https://bottosson.github.io/posts/oklab/), 2020.
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0008-oklab-internal-color.md`
Expected: the slug line.

---

### Task 12: Create ADR-0009 (test pyramid + RGB TDD)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0009-test-pyramid-rgb-tdd.md`

- [ ] **Step 1: Write the file**

```markdown
---
slug: decisions/ADR-0009-test-pyramid-rgb-tdd
title: 'ADR-0009: Test pyramid with red-green-blue TDD and independent agents'
type: decision
tags: [testing, tdd, quality, clean-code, agents]
related: [decisions/ADR-0001-six-layer-architecture]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0009: Test pyramid with red-green-blue TDD and independent agents

## Status

Accepted. Implementation begins in Phase 0c.2 (subagent definitions) and Phase 0e (testing scaffolds); enforced from Phase 0f onward.

## Context

A floor planner mixes pure math (wall topology, color science), heavy UI (an editor canvas plus 3D viewport), and a 3D rendering layer that is notoriously hard to test mechanically. Without a deliberate testing discipline, the project can drift into a mode where new features ship with thin unit tests and visual regressions go undetected. The user has been explicit about wanting "militant" TDD.

## Decision

A pyramid with the standard shape (many unit tests, fewer integration, even fewer end-to-end), and the following layer assignments:

- **Unit**: Vitest. Pure functions in `core/` (geometry, units, color science, command handlers, registry resolvers).
- **Property-based**: fast-check, integrated with Vitest. For geometry under random configurations, unit round-trips, color round-trips, and command coalescing.
- **Integration**: Vitest. Multi-module flows in `core/` with no DOM.
- **Component**: React Testing Library plus Storybook play functions.
- **3D scene snapshot**: Custom Three.js harness with perceptual diff and per-renderer baselines.
- **End-to-end**: Playwright across Chromium (WebGPU), Firefox, and WebKit. Visual regression via `toHaveScreenshot`.
- **Accessibility**: `@axe-core/playwright` on every page transition.
- **Performance**: Three.js render benchmark harness, Lighthouse CI, bundle-size budget, memory leak detection.
- **Acceptance**: User journey scenarios traced to each phase's AC table.

Application code is built via the **red-green-blue** TDD cycle: write a failing test (red), make it pass with the minimal implementation (green), apply Clean Code review and any resulting refactors (blue). Each phase of the cycle is a separate commit. The "blue" commit is mandatory; if no changes are needed, the commit is an empty `refactor:` marker.

The three roles (test author, implementer, refactorer) are intentionally separated; subagent definitions in `.claude/agents/` enforce this by giving each agent only the file access it needs. The implementer cannot see the test source (only the failing test's runner output) and the test author cannot see implementation source.

## Consequences

- Domain logic is testable in Node, with feedback under one second.
- Adding new component tests for a feature is mechanical because Storybook stories double as visual regression baselines.
- The discipline is enforceable by CI checks (PR commit-history pattern) plus the `pr-reviewer` agent.

## References

- Design specification, section 9 (Testing strategy).
- ADR-0001 (six-layer architecture; the layering is what makes `core/` testable without a browser).
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0009-test-pyramid-rgb-tdd.md`
Expected: the slug line.

---

### Task 13: Create ADR-0010 (dependency cooldown)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0010-dependency-cooldown.md`

- [ ] **Step 1: Write the file**

```markdown
---
slug: decisions/ADR-0010-dependency-cooldown
title: 'ADR-0010: 15-day minimum release age for dependencies'
type: decision
tags: [supply-chain, dependencies, pnpm, security]
related: [decisions/ADR-0002-license-apache-2]
sourceFiles: [.npmrc, package.json, docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0010: 15-day minimum release age for dependencies

## Status

Accepted. Implemented in Phase 0b.1.

## Context

Recent npm and PyPI incidents (compromised maintainer accounts, malicious dependency confusion attacks, post-install scripts mining the wallet of CI runners) share a pattern: the bad package is published, ships for a few hours or days, gets caught, and is yanked. Projects that hold off on updates for a few days rarely see the bad version. Vernacular has no immediate need to chase fresh-published patch releases, so a cooldown is cheap insurance.

## Decision

`.npmrc` sets `minimum-release-age=21600` minutes (15 days). pnpm 10 honors this setting and refuses to install any direct or transitive dependency whose newest matching version is younger than that. The version pinned in `packageManager` is `pnpm@10.33.4`, itself older than 15 days at the time of adoption.

No exclusions are maintained. `minimum-release-age-exclude` is available if we ever need to bypass the cooldown for a specific trusted package, but the bar is high: an entry in that list is an explicit ADR.

## Consequences

- Adding a brand-new dependency requires waiting 15 days, choosing an older version, or filing an ADR adding the package to the exclusion list. The most common case is choosing the prior patch version.
- Renovate/Dependabot bumps need to respect the same window when they land. We will configure their schedule to match in Phase 0d.
- Cooldown is enforced at install time both locally and in CI (CI re-runs `pnpm install --frozen-lockfile`), so PRs that attempted to bypass cooldown locally would still be caught.

## References

- pnpm settings reference: `minimum-release-age`.
- Design specification, section 8.5b (Dependency cooldown).
- The cooldown was demonstrated working by an attempt to install pnpm 11.5.1 (published the same day) being refused.
```

- [ ] **Step 2: Verify**

Run: `head -3 docs/knowledge/decisions/ADR-0010-dependency-cooldown.md`
Expected: the slug line.

---

### Task 14: Create the index builder `scripts/knowledge-index.mjs`

**Files:**

- Create: `scripts/knowledge-index.mjs`

This is the script that scans `docs/knowledge/`, parses each entry's YAML frontmatter, validates a minimal schema, and emits `INDEX.md` (grouped by tag) and `index.json` (flat list).

We do NOT add any external dependency for YAML parsing. The frontmatter our entries use is a small subset (string, list of strings, dates as strings), and a tiny inline parser is sufficient.

- [ ] **Step 1: Create the `scripts/` directory**

Run:

```
mkdir -p scripts
```

- [ ] **Step 2: Create `scripts/knowledge-index.mjs`**

```js
#!/usr/bin/env node
// scripts/knowledge-index.mjs
//
// Scans docs/knowledge/ for Markdown entries with YAML frontmatter and emits
// docs/knowledge/INDEX.md (human-readable, grouped by tag) and
// docs/knowledge/index.json (flat, machine-readable).
//
// Frontmatter schema (all fields required unless marked optional):
//   slug:        string, must equal the path relative to docs/knowledge/ with the .md extension stripped
//   title:       string
//   type:        string (one of: decision, pattern, anti-pattern, component, runbook, incident, glossary)
//   tags:        list of strings
//   related:     list of slug strings; may be empty
//   sourceFiles: list of repo-relative paths; may be empty
//   status:      one of: current, superseded, deprecated
//   updated:     ISO date (YYYY-MM-DD)
//
// Exits 0 on success, non-zero on schema violation.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = 'docs/knowledge'
const INDEX_MD = join(ROOT, 'INDEX.md')
const INDEX_JSON = join(ROOT, 'index.json')

const ALLOWED_TYPES = new Set([
  'decision',
  'pattern',
  'anti-pattern',
  'component',
  'runbook',
  'incident',
  'glossary',
])
const ALLOWED_STATUS = new Set(['current', 'superseded', 'deprecated'])

function listMarkdownFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) listMarkdownFiles(full, out)
    else if (name.endsWith('.md') && name !== 'INDEX.md') out.push(full)
  }
  return out
}

function parseFrontmatter(text, file) {
  if (!text.startsWith('---\n')) {
    throw new Error(`${file}: missing leading YAML frontmatter`)
  }
  const end = text.indexOf('\n---\n', 4)
  if (end < 0) throw new Error(`${file}: unterminated frontmatter`)
  const block = text.slice(4, end)
  const out = {}
  let currentKey = null
  for (const rawLine of block.split('\n')) {
    if (rawLine.trim() === '') continue
    if (rawLine.startsWith('  - ')) {
      if (!currentKey) throw new Error(`${file}: list item without key`)
      out[currentKey].push(stripQuotes(rawLine.slice(4).trim()))
      continue
    }
    if (rawLine.startsWith('  ') && currentKey === null) {
      throw new Error(`${file}: unexpected indent`)
    }
    const m = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(rawLine)
    if (!m) throw new Error(`${file}: cannot parse frontmatter line: ${rawLine}`)
    const [, key, rest] = m
    currentKey = key
    if (rest === '' || rest === '[]') {
      out[key] = rest === '[]' ? [] : ''
      continue
    }
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim()
      out[key] = inner === '' ? [] : inner.split(',').map((s) => stripQuotes(s.trim()))
      continue
    }
    out[key] = stripQuotes(rest)
  }
  return out
}

function stripQuotes(s) {
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))
  ) {
    return s.slice(1, -1)
  }
  return s
}

function validate(meta, file) {
  const required = ['slug', 'title', 'type', 'tags', 'related', 'sourceFiles', 'status', 'updated']
  for (const k of required) {
    if (!(k in meta)) throw new Error(`${file}: missing required frontmatter key: ${k}`)
  }
  if (!ALLOWED_TYPES.has(meta.type)) {
    throw new Error(`${file}: invalid type ${meta.type}; allowed: ${[...ALLOWED_TYPES].join(', ')}`)
  }
  if (!ALLOWED_STATUS.has(meta.status)) {
    throw new Error(
      `${file}: invalid status ${meta.status}; allowed: ${[...ALLOWED_STATUS].join(', ')}`,
    )
  }
  const expectedSlug = relative(ROOT, file).split(sep).join('/').replace(/\.md$/, '')
  if (meta.slug !== expectedSlug) {
    throw new Error(`${file}: slug ${meta.slug} does not match path-derived slug ${expectedSlug}`)
  }
  if (!Array.isArray(meta.tags)) throw new Error(`${file}: tags must be a list`)
  if (!Array.isArray(meta.related)) throw new Error(`${file}: related must be a list`)
  if (!Array.isArray(meta.sourceFiles)) throw new Error(`${file}: sourceFiles must be a list`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) {
    throw new Error(`${file}: updated must be ISO date YYYY-MM-DD`)
  }
}

function renderIndexMd(entries) {
  const lines = []
  lines.push('<!-- AUTO-GENERATED by `pnpm knowledge:index`. Do not edit by hand. -->')
  lines.push('')
  lines.push('# Knowledge Graph Index')
  lines.push('')
  lines.push(`Total entries: ${entries.length}.`)
  lines.push('')
  lines.push(
    'Each entry is a Markdown file with YAML frontmatter under `docs/knowledge/`. This index is auto-generated; the entries themselves are the source of truth.',
  )
  lines.push('')
  const byTag = new Map()
  for (const e of entries) {
    for (const t of e.tags) {
      if (!byTag.has(t)) byTag.set(t, [])
      byTag.get(t).push(e)
    }
  }
  const sortedTags = [...byTag.keys()].sort()
  for (const tag of sortedTags) {
    lines.push(`## Tag: \`${tag}\``)
    lines.push('')
    const tagEntries = byTag
      .get(tag)
      .slice()
      .sort((a, b) => a.slug.localeCompare(b.slug))
    for (const e of tagEntries) {
      lines.push(`- [${e.title}](${e.slug}.md) (status: ${e.status}, updated: ${e.updated})`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function renderIndexJson(entries) {
  const sorted = entries.slice().sort((a, b) => a.slug.localeCompare(b.slug))
  return JSON.stringify({ generatedAt: 'auto', entries: sorted }, null, 2) + '\n'
}

function main() {
  let files
  try {
    files = listMarkdownFiles(ROOT)
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(`docs/knowledge does not exist; nothing to index`)
      process.exit(1)
    }
    throw e
  }
  const entries = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const meta = parseFrontmatter(text, file)
    validate(meta, file)
    entries.push(meta)
  }
  writeFileSync(INDEX_MD, renderIndexMd(entries))
  writeFileSync(INDEX_JSON, renderIndexJson(entries))
  console.log(`indexed ${entries.length} entries; wrote ${INDEX_MD} and ${INDEX_JSON}`)
}

main()
```

- [ ] **Step 3: Make it executable (not strictly required for `node` invocation but conventional)**

Run: `chmod +x scripts/knowledge-index.mjs`

- [ ] **Step 4: Verify the script parses as ESM**

Run: `node --check scripts/knowledge-index.mjs && echo ok`
Expected: `ok`.

---

### Task 15: Add `knowledge:index` to `package.json`

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Read current `package.json` scripts section**

Run: `grep -A 15 '"scripts"' package.json | head -16`

- [ ] **Step 2: Add the script**

Insert a `"knowledge:index": "node scripts/knowledge-index.mjs"` entry in the `scripts` object, immediately after `"test:watch"`.

The resulting block must look like (use Edit to add the single line):

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "knowledge:index": "node scripts/knowledge-index.mjs"
  },
```

- [ ] **Step 3: Verify**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).scripts['knowledge:index'])"`
Expected output: `node scripts/knowledge-index.mjs`.

---

### Task 16: Generate `INDEX.md` and `index.json` for the first time

- [ ] **Step 1: Run the builder**

Run: `pnpm knowledge:index`

Expected output: `indexed 11 entries; wrote docs/knowledge/INDEX.md and docs/knowledge/index.json` (10 ADRs plus the glossary).

If the script reports a schema violation, STOP and report, investigate which entry has malformed frontmatter.

- [ ] **Step 2: Verify INDEX.md exists and is non-empty**

Run: `test -s docs/knowledge/INDEX.md && wc -l docs/knowledge/INDEX.md`
Expected: a line count above 30.

- [ ] **Step 3: Verify index.json exists and is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/knowledge/index.json','utf8')); console.log('ok')"`
Expected output: `ok`.

- [ ] **Step 4: Verify the JSON has the expected entry count**

Run: `node -e "const j=JSON.parse(require('fs').readFileSync('docs/knowledge/index.json','utf8')); console.log(j.entries.length)"`
Expected output: `11`.

---

### Task 17: Add a CI check that the index is in sync

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a `Knowledge index up to date` step**

Insert before the `Build` step the following step. The check works by regenerating the index and verifying `git diff` is empty afterward; if a contributor forgot to regenerate, CI fails.

```yaml
- name: Knowledge index up to date
  run: |
    pnpm knowledge:index
    if ! git diff --quiet docs/knowledge/INDEX.md docs/knowledge/index.json; then
      echo '::error::docs/knowledge/INDEX.md or index.json is out of sync. Run `pnpm knowledge:index` locally and commit the result.'
      git --no-pager diff docs/knowledge/INDEX.md docs/knowledge/index.json
      exit 1
    fi
```

The resulting jobs block should have the steps in this order: Checkout, Set up pnpm, Set up Node, Install dependencies, Typecheck, Lint, Format check, Test, Knowledge index up to date, Build.

- [ ] **Step 2: Verify YAML**

Run: `pnpm dlx js-yaml < .github/workflows/ci.yml > /dev/null && echo ok`
Expected: `ok`.

---

### Task 18: Update CONTRIBUTING.md to mention the knowledge graph

**Files:**

- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Replace the documentation-pointer bullet about knowledge**

Find this line in CONTRIBUTING.md:

```
- **Documentation** changes that affect the architecture should also
  update an entry in `docs/knowledge/` once that directory exists
  (Phase 0c onward).
```

Replace it with:

```
- **Knowledge graph.** Significant architectural or workflow changes
  should land alongside an entry under `docs/knowledge/` (a new ADR
  for a new decision, an updated entry for an evolved one, etc.).
  Run `pnpm knowledge:index` after you add or modify entries so the
  generated `INDEX.md` and `index.json` reflect the change. CI fails
  if these are out of date.
```

- [ ] **Step 2: Verify the substitution landed**

Run: `grep -c "pnpm knowledge:index" CONTRIBUTING.md`
Expected output: `1` or higher.

---

### Task 19: Clean up the Phase 0a plan housekeeping nit

The Phase 0a plan at `docs/plans/2026-06-01-vernacular-phase-0a-build-foundation.md` line 943 contains a `Co-Authored-By: Claude Opus 4.7` line inside a shell heredoc example. The plan itself has never been re-executed since the project setting was switched, so the line is now an artifact rather than an instruction. Remove it.

**Files:**

- Modify: `docs/plans/2026-06-01-vernacular-phase-0a-build-foundation.md`

- [ ] **Step 1: Locate the line**

Run: `grep -n "Co-Authored-By: Claude" docs/plans/2026-06-01-vernacular-phase-0a-build-foundation.md`

Expected: one match, somewhere near line 943. The exact line number may shift slightly because of earlier Prettier formatting changes; that is fine.

- [ ] **Step 2: Remove the line and the blank line directly above it**

Use an Edit operation to replace the surrounding block. The line appears inside a heredoc commit-message body that looks like:

```
   ... (preceding lines of the body) ...

   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
   EOF
   )"
```

Replace those four lines with:

```
   ... (preceding lines of the body) ...
   EOF
   )"
```

That is: delete the blank line and the `Co-Authored-By:` line; keep everything else.

If the exact whitespace context makes the Edit ambiguous, use this Python script that operates blind:

```
python3 - <<'PY'
import pathlib
p = pathlib.Path('docs/plans/2026-06-01-vernacular-phase-0a-build-foundation.md')
text = p.read_text()
lines = text.splitlines(keepends=True)
out = []
i = 0
hit = 0
while i < len(lines):
    if 'Co-Authored-By: Claude' in lines[i]:
        if out and out[-1].strip() == '':
            out.pop()
        i += 1
        hit += 1
        continue
    out.append(lines[i])
    i += 1
p.write_text(''.join(out))
print(f'removed {hit} Co-Authored-By line(s) and any leading blank')
PY
```

- [ ] **Step 3: Verify the line is gone**

Run: `grep -c "Co-Authored-By: Claude" docs/plans/2026-06-01-vernacular-phase-0a-build-foundation.md`
Expected output: `0`.

---

### Task 20: Update ROADMAP to mark Phase 0c.1 status

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Open and inspect ROADMAP**

Run: `head -28 ROADMAP.md`

- [ ] **Step 2: Update the relevant rows**

In ROADMAP.md, change the `Status` cell of the row that currently reads `0c | CLAUDE.md, Claude agents, knowledge graph | next` to `in progress`. Add a new row directly below it that documents Phase 0c.1 as `in progress` and Phase 0c.2 as `next`. Concretely, replace the segment:

```
| 0b.1  | 15-day dependency cooldown (pnpm minimum-release-age)   | in progress |
| 0c    | CLAUDE.md, Claude agents, knowledge graph               | next        |
```

with:

```
| 0b.1  | 15-day dependency cooldown (pnpm minimum-release-age)   | done        |
| 0c.1  | Knowledge graph foundation (docs/knowledge/, ADRs, indexer) | in progress |
| 0c.2  | Claude Code infrastructure (CLAUDE.md, agents, commands) | next        |
```

The status of 0b.1 also moves from `in progress` to `done` because the cooldown PR has already merged.

- [ ] **Step 3: Verify**

Run: `grep -n "0c.1\|0c.2" ROADMAP.md`
Expected: at least two matches.

---

### Task 21: Apply Prettier formatting

- [ ] **Step 1: Run Prettier**

Run: `pnpm format`
Expected: success; some of the new ADRs may get whitespace-normalized.

- [ ] **Step 2: Verify**

Run: `pnpm format:check`
Expected: `All matched files use Prettier code style!`

Important: after formatting, run `pnpm knowledge:index` again to regenerate the index files (which may have been touched by Prettier's normalization of the entry files). Verify the regenerated index files are unchanged by checking `git diff --stat docs/knowledge/INDEX.md docs/knowledge/index.json` shows no changes.

```
pnpm knowledge:index
git diff --stat docs/knowledge/INDEX.md docs/knowledge/index.json
```

If `git diff --stat` shows changes after re-running the indexer, stage those updated index files too.

---

### Task 22: All-checks rehearsal

- [ ] **Step 1: Run the full local check chain**

Run:

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: exits 0.

- [ ] **Step 2: Confirm the new CI step passes locally**

Run the same logic the new CI step uses, locally:

```
pnpm knowledge:index
git diff --quiet docs/knowledge/INDEX.md docs/knowledge/index.json && echo "index in sync" || echo "INDEX OUT OF SYNC"
```

Expected: `index in sync`.

---

### Task 23: Commit the knowledge graph foundation

- [ ] **Step 1: Stage the files**

Run:

```
git add \
  docs/knowledge/INDEX.md \
  docs/knowledge/index.json \
  docs/knowledge/glossary.md \
  docs/knowledge/decisions/ \
  scripts/knowledge-index.mjs \
  package.json \
  .github/workflows/ci.yml \
  CONTRIBUTING.md \
  docs/plans/2026-06-01-vernacular-phase-0a-build-foundation.md \
  ROADMAP.md
```

- [ ] **Step 2: Verify staged set**

Run: `git status --short`

Expected: all entries are `A` (new) or `M` (modified). Specifically the `docs/knowledge/decisions/` directory should contribute 10 new ADR files plus the `INDEX.md`, `index.json`, and `glossary.md`; `scripts/knowledge-index.mjs` is new; `package.json`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`, the Phase 0a plan, and `ROADMAP.md` are modified.

- [ ] **Step 3: Pre-commit verification**

Run:

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: exits 0.

- [ ] **Step 4: Create the commit**

```
git commit -m "$(cat <<'EOF'
feat(knowledge): stand up the knowledge graph foundation (Phase 0c.1)

Adds the docs/knowledge/ directory with ten seed Architecture
Decision Records covering the Phase 0a/0b/0b.1 decisions, a
project glossary, and a small Node script that builds INDEX.md
and index.json from the entries' YAML frontmatter. CI gains a
step that fails if the committed index files are stale. The
CONTRIBUTING document gains a Knowledge graph entry explaining
the contributor workflow.

Files:

* docs/knowledge/decisions/ADR-0001..ADR-0010
* docs/knowledge/glossary.md
* docs/knowledge/INDEX.md (auto-generated)
* docs/knowledge/index.json (auto-generated)
* scripts/knowledge-index.mjs
* package.json: knowledge:index script
* .github/workflows/ci.yml: "Knowledge index up to date" step
* CONTRIBUTING.md: Knowledge graph paragraph
* ROADMAP.md: status updates for 0b.1 (done), 0c.1 (in progress),
  0c.2 (next)
* docs/plans/2026-06-01-vernacular-phase-0a-build-foundation.md:
  housekeeping removal of a stray Co-Authored-By line inside a
  shell heredoc example (not an active git trailer)

Phase 0c.2, coming next, lays the Claude Code infrastructure
(CLAUDE.md, .claude/rules.md, .claude/agents/, .claude/commands/,
.claude/tools/) on top of this knowledge graph.
EOF
)"
```

- [ ] **Step 5: Verify the commit landed**

Run: `git log --oneline -3`
Expected: the new commit is at the top.

Run: `git log -1 --format=%B | grep -c "^Co-Authored-By:"`
Expected: `0`.

---

### Task 24: Push and open the pull request

- [ ] **Step 1: Push the branch**

Run: `git push -u origin feat/phase-0c1-knowledge-graph`

- [ ] **Step 2: Open the PR**

Run:

```
gh pr create --base main --head feat/phase-0c1-knowledge-graph --title "Phase 0c.1: Knowledge graph foundation" --body "$(cat <<'EOF'
## Summary

Phase 0c.1 of the Vernacular implementation per `docs/plans/2026-06-02-vernacular-phase-0c1-knowledge-graph.md`. Stands up the `docs/knowledge/` directory with ten Architecture Decision Records, a project glossary, and a small Node script that builds the index files. Adds a CI gate that fails if the committed index is out of date.

This is the load-bearing foundation that Phase 0c.2 (CLAUDE.md, Claude agents, slash commands) will rely on.

## Files

* `docs/knowledge/decisions/ADR-0001..ADR-0010` (ten seed ADRs)
* `docs/knowledge/glossary.md`
* `docs/knowledge/INDEX.md` and `docs/knowledge/index.json` (auto-generated)
* `scripts/knowledge-index.mjs`
* `package.json`: `knowledge:index` script
* `.github/workflows/ci.yml`: knowledge-index sync check
* `CONTRIBUTING.md`: Knowledge graph workflow paragraph
* `ROADMAP.md`: status updates
* `docs/plans/2026-06-01-vernacular-phase-0a-build-foundation.md`: housekeeping cleanup

## Test plan

- [ ] CI green
- [ ] `pnpm knowledge:index` regenerates INDEX.md and index.json with no diff
- [ ] Review ADR-0001 through ADR-0010 against the spec for accuracy
- [ ] Confirm CONTRIBUTING.md describes the contributor workflow clearly
- [ ] Confirm the knowledge-index-sync CI step fails if you deliberately edit an entry without regenerating the index

## Out of scope

Phase 0c.2 (CLAUDE.md, `.claude/rules.md`, `.claude/agents/`, `.claude/commands/`, `.claude/tools/`), Phase 0d (lint guardrails, Husky, commitlint, release-please), Phase 0e (testing scaffolds), Phase 0f+ (source skeleton).
EOF
)"
```

- [ ] **Step 3: Verify**

Run: `gh pr view --json url,state --jq '"\(.state) \(.url)"'`
Expected: `OPEN https://github.com/drmrd/vernacular/pull/<N>`.

---

## What Phase 0c.1 explicitly does NOT include

Tracked for Phase 0c.2 and later:

- **CLAUDE.md** under 200 lines, with the operating manual format described in the design spec section 8.3.
- **`.claude/rules.md`** with the project hard invariants and the Clean Code section.
- **`.claude/agents/`** subagent definitions: test-author, implementer, refactorer, clean-code-reviewer, pr-reviewer, knowledge-curator, pack-validator, migration-author.
- **`.claude/commands/`** slash commands: `/knowledge`, `/adr`, `/knowledge:update`, `/test-first`, `/implement`, `/refactor`, `/clean-code-review`, `/review`, `/pack:new`, `/migration:new`.
- **`.claude/tools/`** wrappers that enforce file-access boundaries for the test-author and implementer agents.
- Pre-commit hook integration that regenerates `INDEX.md` and `index.json` automatically (Phase 0d).
- Optional graph visualization tooling (`pnpm knowledge:graph` rendering a Mermaid diagram, etc.); not on the critical path.

---

## Self-review notes (planning author only)

Spec coverage of this plan vs. spec section 8.4 (Knowledge graph):

- Directory structure with `decisions/`, `components/`, `patterns/`, etc.: partially implemented. `decisions/` is created and seeded with 10 ADRs; the other subdirectories are intentionally deferred until they have content to hold.
- Frontmatter schema (slug, title, tags, related, sourceFiles, status, updated): implemented and validated by the indexer.
- `INDEX.md` and `index.json` generated by `pnpm knowledge:index`: implemented.
- Reliance from Claude Code: documented in the upcoming Phase 0c.2 plan (CLAUDE.md will reference the index).
- Routinely-updated enforcement: CI step added now; pre-commit hook lands in Phase 0d.

Placeholder scan: zero placeholders. The only deferred items are explicitly noted in "What Phase 0c.1 does NOT include."

Type consistency: each ADR's `slug` matches its path-derived slug, and the indexer enforces this. The `related` lists between ADRs use slugs consistently.

Em-dash audit: ten ADRs and the glossary were composed in long-form prose. Searching the inline content above for em-dash characters returns zero matches, in line with the project convention.
