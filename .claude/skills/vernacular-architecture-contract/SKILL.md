---
name: vernacular-architecture-contract
description: 'Use when deciding where new code lives in the Vernacular layer stack (core, storage, engine, bridge, editor, app), when a boundaries/dependencies lint error fires, or when a change touches undo/redo, scene assembly, the live-view reconciler, schema versions, registries, asset references, or the .building format. Keywords: six-layer DAG, eslint-plugin-boundaries, dispatch(command), scene graph, framed-scene reconciler, WebGPU gate, finishId, y-up, ADR, layer boundaries, Three.js imports.'
---

# Vernacular architecture contract

## Overview

Vernacular is a six-layer DAG with one mutation boundary, one derived intermediate representation, and a small set of load-bearing conventions that lint and tests only partially enforce. This skill states each load-bearing decision, why it holds, where it is enforced, and where the structure is known to be weak, so you do not bend an invariant by accident.

## When to use

- Placing a new module and unsure which layer owns it.
- A `boundaries/dependencies` ESLint error fired, or you are tempted to import `three` outside `engine/`.
- Changing anything about commands, undo/redo, the scene graph, scene assembly, schema versions, registries, asset references, or project persistence.
- Touching `bridge/react/framed-scene-reconciler.ts` or `engine/scene/build-scene.ts` (read the weak-points section first).
- Evaluating whether a proposed change needs an ADR because it moves a load-bearing decision.

## When NOT to use

- Floor-plan geometry math, units, color science, or the file format field by field: see vernacular-domain-reference.
- The history of how a decision got reversed or a dead end got settled: see vernacular-failure-archaeology.
- How to gate, review, and land a change (red-green-blue cycle, ADR gating, PR flow): see vernacular-change-control.
- Baseline tiers, tolerances, and how to add tests: see vernacular-validation-and-qa.

## Quick reference

| Fact                              | Value                                                                       | Where                                               |
| --------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| Layer order (low to high)         | core, storage, engine, bridge, editor, app                                  | `eslint.config.js` lines 9-29                       |
| Lint rule enforcing the DAG       | `boundaries/dependencies`, default disallow                                 | `eslint.config.js` line 119                         |
| Fitness test for the lint rule    | `tests/architecture/layer-boundaries.test.ts`                               | runs real ESLint in Vitest                          |
| Only Three.js value importer      | `engine/` (convention, NOT lint-enforced)                                   | `.claude/rules.md` invariant 1                      |
| Sole mutation point               | `core/commands/dispatcher.ts` via `dispatch(command)`                       | ADR-0005, ADR-0019                                  |
| Derived IR feeding 2D, 3D, export | scene graph, `core/scene/`                                                  | ADR-0018                                            |
| Rooms                             | derived from wall topology, never stored                                    | ADR-0026                                            |
| Element taxonomy                  | data registries, not subclasses                                             | ADR-0006                                            |
| Asset references                  | `(scope, contentHash)` pair                                                 | ADR-0007                                            |
| Project on disk                   | folder with `vernacular.json` + `assets/`; `.building` zip for sharing only | ADR-0047                                            |
| Current schema version            | 16 (`core/model/factories.ts` line 41)                                      | published schemas in `schema/8` through `schema/16` |
| Plan coordinates                  | y-up in the format and the 2D renderer                                      | ADR-0099                                            |
| Period (era) resolution           | `room ?? floor ?? project`, never stored                                    | `core/architecture-era/resolve-period.ts`           |

## The six-layer DAG and its enforcement

Each layer imports only downward. `core` imports nothing from the other layers; `storage` may import `core`; `engine` may import `core` and `storage`; `bridge` adds `engine`; `editor` adds `bridge`; `app` may import all five. `src/` is the bootstrap, not a layer: `src/main.tsx` mounts `App` from `app/` and wires the IndexedDB recent-project store, OPFS crash-recovery snapshots, and the service worker. Files outside the six layer globs (including `src/`, `tests/`, `e2e/`, `scripts/`) are not classified by the boundaries plugin, so the lint rule does not police them.

Three enforcement mechanisms, in order of strength:

1. **eslint-plugin-boundaries** (`eslint.config.js`): `layerElements` maps each layer to a `<layer>/**` glob, `layerRules` encodes the allow lists, and `boundaries/dependencies` runs with `default: 'disallow'`. `settings['boundaries/include']` restricts classification to the six layer globs, and `import/resolver` is configured for TypeScript extensions. All three details are load-bearing: ADR-0017 records that the original ADR-0012 config was a silent no-op for months because the globs matched one directory level too shallow (`core/*`), no import resolver was set, and the rule used the removed v5 form (`boundaries/element-types`). An illegal `core -> storage` import passed lint cleanly the whole time.
2. **The architecture fitness test** (`tests/architecture/layer-boundaries.test.ts`): runs ESLint programmatically against two synthetic samples, asserting a `core/` file importing `../storage` produces a `boundaries/dependencies` message and a `storage/` file importing `../core` does not. This exists precisely because of the ADR-0017 incident: a configured guard with no test can regress silently. The test is coupled to the exact rule id; a plugin upgrade that renames the rule must update config and test together.
3. **Convention, enforced only by review**: `engine/` is the only layer that value-imports `three`. The package `three` is not a boundaries element, so no lint rule fires on a stray import. Verified 2026-07-05: production source outside `engine/` contains zero `from 'three'` imports (two bridge test files value-import it for assertions). React Three Fiber usage lives in `bridge/react/`; `bridge` is the only layer that touches both React state and Three.js scene state (rules.md invariant 1). `engine/loaders/` is the only consumer of Three.js loaders. Additionally, `three/webgpu` must stay off the app startup path: `engine/testing/import-guards.ts` backs source-scan tests that keep it behind dynamic import (the ADR-0148 bundling regression).

Placement heuristic: if it needs neither React nor Three.js nor a browser API, it belongs in `core/`. Browser storage APIs only inside `storage/`. Three.js objects only inside `engine/`. Code that holds a Three.js object and a React hook in the same file belongs in `bridge/`. Widgets and tools in `editor/`. Providers and top-level wiring in `app/`.

## Load-bearing decisions and why they hold

### Command dispatch with framework-captured inverse (ADR-0005)

Every model mutation flows through `dispatch(command)`; `core/commands/dispatcher.ts` is the only place the model mutates, and `bridge/session/editor-session.ts` is the only bridge-layer entry point to it (ADR-0019). Handlers author only the forward edit; `core/commands/inverse-capture.ts` wraps the state root in a shallow recording `Proxy` and captures the inverse automatically. History is linear and bounded (`DEFAULT_MAX_HISTORY = 200`), gestures collapse through `coalesceWith`, and a throwing handler is rolled back atomically.

The proxy is deliberately root-level, not deep. It only works because of the paired convention: **handlers reassign whole top-level slices immutably** (`state.floors = [...state.floors, floor]`), never mutate nested objects in place. A deep proxy would leak proxy objects into stored state during spreads; the shallow proxy plus immutable updates makes that impossible. The same convention preserves referential identity for untouched entities, which is exactly the dirty signal the scene-graph memoization keys on. One discipline, two invariants. It is not type-checked: an in-place nested mutation compiles fine, silently breaks undo, and silently breaks memoization. This is the highest-consequence convention in the codebase.

### Scene graph as memoized intermediate representation (ADR-0018)

Renderers and exporters never read the project model directly. `core/scene/scene-graph.ts` defines a pure-data projection (sibling arrays: `nodes` for floors, plus `walls`, `rooms`, `openings`, `furniture`, `underlays`), and `core/scene/scene-graph-deriver.ts` memoizes per entity in `WeakMap`s keyed by source object reference. One derivation feeds three consumers: the 2D plan (`editor/plan/draw-plan.ts`), the 3D scene (`engine/scene/build-scene.ts`), and export (`core/export/`). New entity kinds are added as new sibling arrays so existing consumers keep working untouched. The bridge wraps the deriver in a version-memoized `getSceneGraph()` safe for `useSyncExternalStore`.

### Rooms derived from wall topology, never stored (ADR-0026)

The model stores walls; rooms are computed on demand: `core/topology/wall-graph.ts` nodes the arrangement (endpoint merge at 1 mm junction tolerance, X-crossing registration, T-junction splitting), then `core/topology/rooms.ts` enumerates bounded faces with the standard half-edge walk and keeps positive-signed-area faces. Room ids derive from the sorted bounding wall ids, so they are stable across re-derivations. Why: stored room polygons drift out of sync with the walls that define them. The spec (section 3.2) reserves a `customPolygon` override as the escape hatch for shapes wall topology cannot infer; users name and tag rooms via `roomOverrides`, but geometry always comes from walls.

### Registries over subclasses for element types (ADR-0006)

Element types, periods, styles, finishes, palettes, trim profiles, room purposes: all are versioned data registries under `core/registries/`, mergeable across sources (built-in, user, pack) with overlay-wins semantics. A new opening type or finish is a registry entry, not a schema change or a class. `ProjectMeta.registryVersions` records what a project was saved against, which is what registry-aware migration keys on. `no-magic-numbers` is off under `**/registries/**` because entries are data tables.

### Content-addressed asset references (ADR-0007)

Every asset reference is `(scope, contentHash)` where scope is `pack:<id>@<version>`, `user`, or `project`, serialized as `scope#hash`. Path references would break on rename, share, and pack upgrade; the hash pair survives all three and dedupes storage for free. Resolution degrades gracefully down to a labeled placeholder with the correct footprint so editing continues. Note the ADR's "Current implementation state" section is dated 2026-06-07 and predates the actual aggregator, which now lives at `storage/assets/asset-registry.ts`; the decision itself is unchanged.

### Project as folder, `.building` only for sharing (ADR-0047)

A project on disk is a folder: `vernacular.json` at the root (`storage/folder/folder-project-store.ts`, `PROJECT_FILE`) plus `assets/`. The `.building` file is a zip of that folder (`storage/zip/`) produced for sharing and import, never the working representation. Published JSON Schemas live in `schema/8/` through `schema/16/`, one `vernacular.schema.json` each; `pnpm schema:check` verifies the generated schema matches the model.

### Layered migrations (ADR-0029)

Two chains run on load: `SCHEMA_MIGRATIONS` (`core/migrations/schema/index.ts`), a continuous forward chain of 15 steps covering `from: 1` through `from: 15` up to the current version 16, then `REGISTRY_MIGRATIONS` (`core/migrations/registries/index.ts`), which as of 2026-07-05 is an empty array: the registry-migration framework is shipped and orchestrated, but no registry migration has been needed yet. A migration transforms data only; the orchestrator advances `meta.schemaVersion` and `meta.registryVersions` itself. Adding a field means: a migration step, a `CURRENT_SCHEMA_VERSION` bump in `core/model/factories.ts`, and a new `schema/<n>/` directory.

### y-up coordinates (ADR-0099) and period resolution

The format defines plan `Point` y increasing upward, and since ADR-0099 the interactive 2D renderer honors it too; the y-flip happens once at the SVG/canvas boundary. In 3D, world units are millimetres with no scale factor and a floor group's `position.y` is its elevation. Do not introduce a second flip anywhere else. The effective architectural period is computed, never stored: `core/architecture-era/resolve-period.ts` resolves `room.periodOverride ?? floor.periodOverride ?? project.meta.period`, falling through on unknown keys. Storing an "effective" value at any level would violate the same derive-not-store principle as rooms.

## Extension points and protected seams

- **`Exporter` interface** (`core/export/exporter.ts`; SVG implemented under `core/export/svg/`): open media-type union; new formats extend rather than reshape the model. The interoperability posture (ADR-0044) keeps the native model and plans an `ifcJSON` exporter behind this exact seam for standards credibility, plus an `Importer` counterpart under `core/import/`; as of 2026-07-05 neither the `Importer` interface nor `core/import/` exists in code. Do not let a new export format grow its own model-reading path.
- **Curved-wall centerline accessor** (ADR-0034, spec section 2.4): the one deferred capability with real retrofit cost. A wall is currently a straight segment and wall-graph topology, room derivation, hit-testing, and snapping all assume it. The protected discipline: treat a wall centerline as a path (segment today, arc or polyline later) and route every NEW wall-geometry consumer through an accessor rather than reading endpoints directly. Never deepen the straight-segment assumption in new code without noting it.
- **Other ADR-0034 seams**: wall height read through a profile-capable accessor (not a scalar); 3D mesh builders structured to accept additive geometry modifiers (penetrations, niches) rather than hardcoding clean solids; a layer-and-discipline notion kept in scene/selection/visibility so the scene is not hardcoded as architecture-only (future MEP); framing as a derived parametric layer; opening shape always read from the element type, never hardcoded width-by-height rectangles.
- **`PlanRenderer` and `SceneRenderer` are distinct plug points** (spec section 2.2); a future fidelity renderer replaces only the latter. The design spec (section 2.2) reserves a `Critic` interface in `core/` for future analysis passes and calls it "stubbed in MVP", but no stub was ever written: as of 2026-07-05 no Critic code exists anywhere (`grep -rn Critic core/` returns nothing).

## Known-weak points, stated plainly (as of 2026-07-05)

1. **Two scene-assembly paths exist and have repeatedly diverged.** The reference path is `engine/scene/build-scene.ts` (full rebuild from the scene graph; used by the deterministic harness via `bridge/react/framed-scene.ts`, and pixel-covered by the scene baselines). The live 3D pane instead uses `bridge/react/framed-scene-reconciler.ts` (via `use-framed-scene.ts`): an incremental cache keyed on the active floor node, paint set, and furniture readiness. The divergence cluster's current status and per-issue fix sketches have one maintained home: vernacular-rendering-defect-campaign, references/worked-examples.md (the live-view parity cluster); re-verify issue states with the gh one-liner in Provenance below. Rule: any visual behavior added to `build-scene.ts` must be propagated to the reconciler in the same change, and vice versa; when they disagree, `build-scene.ts` is the reference.
2. **Scene-baseline CI coverage is new and partial.** Until 2026-07-05 the scene WebGL baselines were darwin-only Metal renders from the development Mac and CI never checked them. ADR-0152 (PR #478, baselines seeded by PR #482, both merged 2026-07-05) added a `-linux` SwiftShader family rendered and gated on the ubuntu runner (`scene-visual` job in `ci.yml`, dispatch refresh via `refresh-scene-baselines.yml`). The `-darwin` family remains the authoritative development render and is still never verified by CI; a harness change must regenerate both families. The live WebGPU render path still has no pixel coverage anywhere.
3. **The live 3D pane hard-gates on WebGPU.** `editor/shell/scene-pane.tsx` and `bridge/react/scene-canvas.tsx` refuse to render when `detectRenderBackend() !== 'webgpu'` (a `navigator.gpu` probe), even though `engine/renderer/create-renderer.ts` wraps a renderer that auto-falls back to WebGL 2 (and pins it via `forceWebGL` for the harness). Users on WebGL2-only browsers get an unsupported message they should not get. Tracked as #476 (open); the missing live-view pixel coverage (#469) blocks it.
4. **`finishId` is stored but read by nothing in `engine/`.** A solid `SurfaceTreatment` carries `finishId` (`core/model/paint.ts`) and the finishes registry maps each finish to roughness, sheen, and specular parameters, but `engine/materials/paint-material-provider.ts` uses only the tint color (plus pattern roughness for pattern treatments). `grep -rn finishId engine/` returns nothing. The physically based material provider (#449, open) owns wiring it. Until then, do not fake finish differences by tweaking colors, and do not delete the field: it is live persisted data awaiting its consumer.

## Stale committed docs (do not trust these lines)

| Doc                                               | Stale claim                                                            | Reality (2026-07-05)                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/rules.md`, `ARCHITECTURE.md` (citations) | Cite ADR-0002, ADR-0009, ADR-0010, ADR-0011, ADR-0013                  | Those files are absent from `docs/knowledge/decisions/` (as are 0008, 0014, 0015), and ADR-0076 and ADR-0081 each exist twice under different slugs. See vernacular-failure-archaeology for the collision history and vernacular-docs-and-writing for numbering practice. |
| ADR-0007, "Current implementation state"          | "The aggregating `AssetRegistry` ... not implemented yet"              | Implemented at `storage/assets/asset-registry.ts`; the decision is unchanged, the status section predates it.                                                                                                                                                             |
| ADR-0012                                          | Boundaries lint "starts enforcing as soon as core/ and friends appear" | Superseded by ADR-0017: the config was a broken no-op until repaired and guarded by the fitness test.                                                                                                                                                                     |

## Common mistakes

- **Mutating nested model state in place inside a command handler.** Compiles cleanly, breaks undo capture AND scene-graph memoization with no error. Always reassign the whole top-level slice.
- **Importing `three` outside `engine/` and expecting lint to object.** It will not; the Three.js rule is convention plus review only. The layer DAG is linted; the Three.js rule is not.
- **Changing `engine/scene/build-scene.ts` without touching the reconciler** (or vice versa). This exact gap produced #477, #479, and #437. Check both paths in every scene-visual change.
- **Storing derived data**: rooms, effective period, scene-graph nodes, or a "resolved" anything. Derive on read; the model stores only authored facts.
- **Bumping the schema without the full triple**: migration step, `CURRENT_SCHEMA_VERSION` bump, new `schema/<n>/` directory (`pnpm schema:check` catches drift).
- **Treating `-darwin` scene baselines as CI-verified.** Only the `-linux` family gates on CI, and only since 2026-07-05.
- **Modifying `docs/specs/` without a corresponding ADR.** Repo rule; the spec is the source of truth and every change to it carries its reasoning.
- **Adding a static `three/webgpu` import in `engine/`.** It belongs behind dynamic import; the import-guard tests will fail, and if you route around them you regress startup bundling (ADR-0148).
- **Assuming the boundaries rule protects non-layer directories.** `boundaries/include` covers only the six layer globs; `src/`, `scripts/`, and test trees are unclassified.

## Provenance and maintenance

Verified against the repo at commit 6b7d74c6 on 2026-07-05. Issue and PR states checked read-only via `gh` the same day. Re-verify facts that can drift:

- Layer rules and globs: `sed -n '9,29p' eslint.config.js`
- Fitness test still passes: `pnpm exec vitest run --project unit tests/architecture/layer-boundaries.test.ts`
- No Three.js value imports outside engine: `grep -rn "from 'three'" core storage bridge editor app src --include='*.ts' --include='*.tsx' | grep -v '.test.'` (expect empty)
- Current schema version: `grep -n CURRENT_SCHEMA_VERSION core/model/factories.ts`
- Schema migration chain coverage: `grep -h 'from: ' core/migrations/schema/*.ts | sort -n`
- Registry migrations still empty: `cat core/migrations/registries/index.ts`
- finishId still unread in engine: `grep -rn finishId engine/` (expect empty; if it hits, #449 landed and weak point 4 is closed)
- Critic still spec-only: `grep -rn Critic core/` (expect empty)
- Importer and core/import still absent: `ls core/import` (expect "No such file or directory") and `grep -rn Importer core/` (expect empty outside tests)
- WebGPU hard gate still present: `grep -n detectRenderBackend editor/shell/scene-pane.tsx bridge/react/scene-canvas.tsx`
- Reconciler parity issues: `for n in 434 437 449 469 476 479; do gh issue view $n --json number,state -q '"\(.number) \(.state)"'; done`
- Scene baseline families on disk: `ls e2e/tests/scene-visual-regression.spec.ts-snapshots/`
- Period resolution chain: `cat core/architecture-era/resolve-period.ts`
- Absent-ADR citations still absent: `ls docs/knowledge/decisions/ | grep -E "0002|0009|0010|0011|0013"` (expect empty)
