# Vernacular: Design Specification

**Date:** 2026-06-01
**Status:** Approved for implementation planning
**License of this document:** Apache-2.0

---

## 1. Overview

**Vernacular** is an open-source floor-planning and visualization tool aimed at power users: owners and enthusiasts of homes whose architecture is not well served by mainstream floor planners. The name evokes _vernacular architecture_, the period-native, regional building styles (Victorian, Edwardian, Craftsman, Mid-Century, and earlier) whose vocabulary (pocket doors, transoms, picture windows, plaster wall thickness, period trim) mainstream planners largely ignore. Vernacular treats this vocabulary as first-class.

**Audience.** Power users / hobbyists. Technical enough to import custom 3D models, willing to invest setup time for output the commercial tools won't produce. Old-house owners, historic-preservation enthusiasts, and renovators planning around real (not idealized) architecture are the heaviest initial audience.

**Positioning.** Power user's floor planner with a heavy lean toward old houses. Not the "old-house tool" as exclusive identity, but a tool that respects old houses where others don't. Mainstream/new-construction features land in the roadmap but don't dominate.

**Stack.** Web app: React + Three.js + React-Three-Fiber + WebGPU (WebGL2 fallback as a fast-follow). No desktop wrapper in scope; if desktop ever becomes warranted, evaluated then as a separate decision rather than a default-Tauri shipping path.

**License.** Apache-2.0 throughout the app code, data schemas, and pack manifests. Asset packs declare their own SPDX licenses (CC0 / CC-BY predominant).

**Scope shape.** Six MVP phases (0 to 6) culminating in v1.0; phases 7 to 10 carry the roadmap forward through DXF import, lighting fidelity, pathing critic, and a code-plugin runtime.

---

## 2. Architecture

### 2.1 Layered structure

Six top-level layers with hard boundaries; each depends only on layers below it.

```
┌────────────────────────────────────────────────────────────┐
│  app/         Routes, providers, top-level state           │
├────────────────────────────────────────────────────────────┤
│  editor/      React UI: shell, tools, panels, gizmos       │
├────────────────────────────────────────────────────────────┤
│  bridge/      R3F glue, command dispatch boundary          │
├────────────────────────────────────────────────────────────┤
│  engine/      Three.js scene mgmt, renderers, loaders      │
├────────────────────────────────────────────────────────────┤
│  storage/     Project store, library store, asset cache    │
├────────────────────────────────────────────────────────────┤
│  core/        Pure-TS domain: types, project model,        │
│               registries, commands, units, color, geometry,│
│               import/export interfaces (no React,          │
│               no Three.js)                                 │
└────────────────────────────────────────────────────────────┘
```

**Hard invariants** (enforced by lint + boundaries rules):

- `core/` has zero React, zero Three.js, zero DOM dependencies. Pure TypeScript, testable in Node.
- `engine/` is the only layer that imports Three.js.
- `bridge/` is the only place that touches both React state and Three.js scene state. It owns the command dispatch boundary: UI events → commands → `core/` mutations → engine sync.
- `storage/` is provider-shaped from day one: `ProjectStore`, `LibraryStore`, `AssetCache` interfaces with multiple implementations.

### 2.2 Extension points (designed in, not added later)

- `Importer` interface in `core/import/`: glTF/OBJ/STL at MVP; DXF, IFC, competitor formats drop in later.
- `Exporter` interface in `core/export/`: PDF/SVG/PNG at MVP; glTF, DXF later.
- `AssetSource` interface in `storage/`: bundled, pack, user-filesystem, project-embedded, future cloud-sync.
- `Registry` pattern in `core/registries/`: element types, eras, categories, finishes, palettes, trim profiles, room purposes. All JSON-driven, mergeable, versioned.
- `PlanRenderer` (2D) and `SceneRenderer` (3D) are distinct plug points. The phase-8 lighting fidelity renderer replaces only `SceneRenderer`.
- `Critic` interface in `core/`: stubbed in MVP; the phase-9 pathing critic and any future analysis (lighting, structural) conform to it.

### 2.3 Deliberately deferred

- No code plugin runtime in MVP (data-driven extensions only).
- No multi-user / real-time collaboration in MVP (data model is structurally CRDT-friendly for later).
- No cloud sync in MVP (storage interfaces designed for it as an additive implementation).
- No telemetry by default. When added later, opt-in with published schema and self-hostable endpoint.

### 2.4 Future-direction seams (historic forms and building systems)

Several capabilities, valuable to the historic and old-house audience but out of MVP scope, are deferred as features while the cheap seams that keep them additive are protected now. The deciding test is not whether each is valuable but whether adding it later forces a pervasive retrofit: the schema-and-registry migration framework (section 3.4), scene-graph derivation (section 6.1), and the registry pattern (section 4.4) make each additive later, provided the seams below are not foreclosed by an unexamined assumption. See ADR-0034.

Already accommodated by the typed-element, registry, trim, and feature models (recorded so future work does not mistake them for gaps):

- **Non-rectangular and curved openings** (arched, half-round, ovular, bay and bow windows, casement variants). Section 3.2 types the building shell at the element level: an opening is an `Opening` record whose `type` points to the `ElementTypeRegistry`, with shape and parameters in the registry, so a half-round or ovular window is a registry addition, not a schema change (the full vocabulary is a Phase-4 milestone item). The only discipline this imposes: opening geometry derivation and rendering must read shape from the element type, never hardcode width-by-height rectangles.
- **Arches, columns, and alcoves** are `wallFeatures[]`; **window and door casing, aprons, and stools** are path-based trim with a `TrimProfileRegistry` cross-section; **wall construction profiles** (plaster, lath-and-plaster, brick, stone) are a Phase-4 milestone item.

Deferred as features, with their additive seams protected now:

- **Turrets and bay windows (footprint bump-outs).** Model wall-hosted elements (openings first, section 6.9 and the entity tree) as a general host relationship (host wall, position along the wall, perpendicular offset) rather than a door/window special case, so a bay or turret that also bumps out the floor footprint reuses the same attachment. The footprint change feeds room-polygon and area derivation; turrets that span floors are multi-floor work.
- **Curved and non-straight walls.** This is the one item with real retrofit cost rather than a free additive seam: a wall is currently a straight segment, and the wall-graph topology, room derivation, hit-testing, and snapping all assume straight segments. The seam is to treat a wall centerline as a path (a segment today, an arc or polyline later) and to route new wall-geometry consumers through an accessor, accepting that the topology layer will need genuine extension when curved walls land. Recorded so the assumption is consciously managed, not silently deepened.
- **Variable and sloped wall heights.** Knee walls, sloped attic ceilings, and settled framing mean a wall height must not be assumed equal to the floor ceiling height. When 3D derivation lands, model height as a per-wall property defaulting to the floor ceiling height and read through an accessor returning a height profile, not a scalar, so flat tops work immediately and sloped tops stay additive. Plan geometry is already arbitrary (rooms derive from any wall graph); only the vertical assumption needs the seam.
- **Penetrations and geometry modifiers.** Walls, floors, and (later) structural members need holes where ducts, pipes, and conduit pass through them and the building envelope, and notches and bored holes where runs pass through studs and joists. When 3D wall and floor derivation lands, structure the mesh builders to apply additive geometry modifiers (penetrations now; niches and chases later) rather than hardcoding clean extruded solids, and let the affected elements carry their modifiers additively. Member-level notches and bores should carry code-limit metadata (allowed depth and zones) for a future structural critic.
- **Building systems (MEP), including HVAC.** Defer the whole domain (electrical, plumbing, mechanical including HVAC ductwork, and structural; panels; mains), but keep a layer-and-discipline notion (architectural, electrical, plumbing, mechanical, structural, sensors) in the scene, selection, and visibility model so nothing hardcodes that the scene is architecture only. HVAC ducts are large-volume runs that additionally need chases, soffits, and dropped-ceiling zones (kin to `wallFeatures` and `ceilingFeatures`) and the large penetrations of the seam above. The scene graph is already hierarchical, so sibling systems slot in as additive node kinds with their own element types and a visibility layer; domain logic stays in `core/`, rendering in `engine/`, tools in `editor/`, delivered as its own phase.
- **Structural framing (studs and joists).** Model framing as a derived, parametric layer (generated from the wall or floor plus a framing spec of member size, spacing, and direction), the way rooms derive from the wall graph today, rather than hand-placed geometry. The framing spec must be era- and registry-aware: true-dimension lumber, balloon versus platform framing, and the irregular historic spacing of real old houses. Its penetrations reuse the modifier seam above.
- **Sensor coverage (IoT).** Placing a sensor is another element type with a 3D pose and parametric metadata (field of view, range) served by the registry and the phase-2 furniture-placement tooling; coverage (what a sensor sees given the furnishings) is a visibility and occlusion computation built on the phase-8 lighting occlusion primitives, since a coverage cone is a visibility volume through the furnished scene rather than bespoke machinery.

Hidden construction details (for example sash-weight pockets in historic double-hung windows) are deferred as additive per-element metadata; they carry near-zero retrofit risk and are out of scope until a detailed section or renovation view needs them.

---

## 3. Core Domain Model

### 3.1 Entity tree

```
Project
├── meta (name, units, era, schemaVersion, appVersion,
│         registryVersions, packsRequired[], writeHistory[])
├── site (optional: latLong, northBearing, obstructions[])
├── floors[]
│   ├── meta (name, elevation, defaultCeilingHeight, eraOverride?)
│   ├── walls[]
│   ├── openings[]            (doors, windows, transoms, sidelights)
│   ├── rooms[]               (derived polygons; purpose, eraOverride?, subPurpose?)
│   ├── trim[]                (paths along walls/ceilings; profile reference)
│   ├── wallFeatures[]        (built-ins, columns, arches, half-walls, alcoves)
│   ├── ceilingFeatures[]     (medallions, beams, tin ceiling zones)
│   ├── floorFeatures[]       (per-zone floor materials, rugs)
│   ├── furniture[]           (placed instances)
│   └── underlays[]           (calibrated image/PDF/scene references)
├── stairs[]                  (top-level: spans floors)
├── palettes[]                (project-local; user/global palettes live in LibraryStore)
├── assetIndex                (every assetRef used → source, hash, license, attribution)
└── history (transient; persisted with autosave)
```

### 3.2 Key modeling decisions

**Era resolution is a hierarchy with explicit overrides.** Effective era for any element = `room.eraOverride ?? floor.eraOverride ?? project.era`. The data model never stores effective era; only the explicit value at each level.

**Rooms are derived, not authored.** A room's polygon is computed from wall topology. Users name and tag rooms; geometry comes from walls. A `customPolygon` override exists for cases where wall topology can't infer a room (porch, L-shaped sub-zone).

**All third-party content is referenced, not embedded inline.** Furniture, custom 3D models, underlays: every external thing is an `AssetReference`. References resolve through the `AssetRegistry` to concrete sources.

**`AssetReference` is content-addressed.** Format: `(scope, contentHash)`. Scope is `pack:<id>@<version>`, `user`, or `project`.

**Building shell is _typed_ at the element level, not subclassed.** A door, transom, pocket door are all `Opening` records with a `type` field pointing to `ElementTypeRegistry`. Rendering rules and parameters live in the registry, not the data. Adding a new opening type is a registry addition, not a schema change.

**Trim is path-based.** A crown molding instance is a path along walls/ceilings with a reference to a `TrimProfile` (cross-section shape, also in a registry).

**Stairs are NOT openings.** They are a distinct top-level entity that spans two floors with parametric geometry (treads, risers, runs, landings, railings, balusters, newels). Wall openings around a stairwell remain regular openings; the stair itself is its own entity.

**Underlays are first-class on each floor.** Calibrated images/PDFs/glTF scenes pinned with transform and two-point calibration. Persisted with the project (content-addressed in the project's `assets/`) so the migration audit trail is preserved.

### 3.3 Project file format

The project is a **folder** with a defined layout. Not a zip blob during editing.

```
my-house/
  project.json            ← entire entity tree, plain text, git-diffable
  assets/
    <contentHash>.glb     ← embedded furniture, custom models, underlays
    <contentHash>.png
    ...
  previews/
    thumbnail.png
    floor-1.png
    floor-2.png
  README.md               ← auto-generated; era summary, license attributions
  ATTRIBUTIONS.md         ← auto-generated; required attributions
  .house-autosave/        ← sidecar snapshots (gitignored by convention)
```

For sharing/export: the folder is zipped as `.house.zip`. Re-opening a `.house.zip` unpacks to a working folder (or to OPFS where filesystem access is limited).

**Reasons for this shape:**

- Plain-text `project.json` diffs cleanly in git; async collaboration via version control is realistic for power users.
- Incremental writes only touch the changed files; autosave doesn't rewrite multi-MB binaries.
- Hand-editable by power users.
- License compliance is auditable (assetIndex + auto-generated ATTRIBUTIONS.md).

### 3.4 Versioning and migrations

Captured at project level:

- `schemaVersion`: project schema version; drives the migration chain.
- `appVersion`: app that wrote the file; for bug-trail.
- `registryVersions`: map of each registry to its version at write time.
- `packsRequired`: `{ packId, minVersion, contentHashesUsed }[]`.
- `writeHistory`: short rolling log of the last ~10 saves.

Explicitly **not captured**: OS, browser, user identity, machine UUID. A user-toggleable diagnostic flag can add browser info to the file if desired.

**Migration layering:**

- Schema migrations chain in `core/migrations/schema/`.
- Per-registry migrations (renames, deprecations) in `core/migrations/registries/<registry>/`.
- Both run on open, layered.
- Pre-migration backup saved to `.house-autosave/pre-migration-v<n>.json` before applying.
- Failure is atomic; the original is never partially written.

---

## 4. Asset & Extension System

### 4.1 Asset sources (provider pattern)

```ts
interface AssetSource {
  id: string // 'pack:vernacular-starter@2.0' | 'user' | 'project' | 'bundled'
  manifest(): Promise<SourceManifest>
  fetch(ref: AssetReference): Promise<Blob>
  getThumbnail(ref: AssetReference): Promise<Blob | null>
  canWrite: boolean
  put?(blob: Blob, kind: AssetKind): Promise<AssetReference>
  delete?(ref: AssetReference): Promise<void>
}
```

MVP implementations:

- **`BundledSource`**: tiny set shipped with the app build (registries, fonts, placeholder model, missing-asset glyph).
- **`PackSource`**: versioned asset packs from a CDN. The curated starter library is `pack:vernacular-starter@1.x.y`.
- **`UserFilesystemSource`**: user-imported assets in OPFS + IndexedDB metadata index; FileSystemAccess handles where the user opts in.
- **`ProjectEmbeddedSource`**: assets in the current project's `assets/`.

Consumers interact only with the `AssetRegistry`, which aggregates all sources.

### 4.2 Resolution precedence and fallback

When resolving `(scope, contentHash)`:

1. **Exact match**: return from the named scope.
2. **Hash match in another source**: content addressing means substitution is safe. Precedence: `user > project > pack > bundled`.
3. **Pack version fallback**: same hash in a different version of the same pack.
4. **Missing-asset placeholder**: visible, clearly labeled placeholder with correct footprint dimensions. User can keep editing; asset panel surfaces the gap with a recovery path.

Loaders (which produce Three.js scene graphs from Blobs) are a separate concern in `engine/loaders/`. Sources do not know about Three.js.

### 4.3 Asset pack format

```
<packid>-<version>/
  manifest.json
    { packId, version, license, attribution, eras[],
      categories[], assets[ { contentHash, name, kind,
      dimensions, eras[], categories[], license, attribution } ] }
  assets/
    <contentHash>.glb
    ...
  thumbnails/
    <contentHash>.webp    ← precomputed at pack-build time
  CHANGELOG.md
  LICENSE
  NOTICE
```

- Packs are immutable per version. Versioned with SemVer.
- Integrity via sha256 content hashes for MVP (manifest claims must match file reality).
- Ed25519 cryptographic signing is a phase-2 hardening; the MVP trust model is "the user opted to install this pack from this URL."
- Thumbnails baked at pack-build time so library browsing is instant.

### 4.4 Registries

Seven typed registries, each with the same shape (versioned JSON, mergeable across sources, append-only by convention, with per-registry migration tables):

- **`ElementTypeRegistry`**: door/window/wall-feature/ceiling-feature/stair-component types. Each entry includes `plan2D` rendering rules AND `scene3D` reference (assetRef or parameters). 2D plan symbols are first-class.
- **`EraRegistry`**: Victorian, Edwardian, Craftsman, Mid-Century, Contemporary, Mixed/Uncertain at MVP. Locale-aware display names; per-locale default vocabularies.
- **`CategoryRegistry`**: hierarchical furniture and feature categories.
- **`TrimProfileRegistry`**: cross-section shapes for moldings.
- **`FinishRegistry`**: paint finishes (flat, matte, eggshell, satin, semi-gloss, gloss) and other surface finishes; map to material parameter presets.
- **`PaletteRegistry`**: color palettes (bundled CC0, user-defined, future community/brand).
- **`RoomPurposeRegistry`**: kitchen, bedroom, dining, parlor, sitting room, etc. Era-aware vocabulary. Drives library biasing and future pathing critic.

### 4.5 Asset `kind` enumeration

```
kind: 'furniture'
    | 'architectural-element'
    | 'trim-profile'
    | 'stair-component'
    | 'material'
    | 'texture'
    | 'underlay-image'
    | 'palette'
    | 'preview-only'
```

Each tool sees only the kinds it can use.

### 4.6 Data-driven extension model (MVP)

Everything a community member can contribute in MVP is data, not code:

- Asset packs (themed collections)
- Registry packs (new element types, trim profiles, eras, finishes, room purposes)
- Palette packs
- Locale packs (translations)

A contributor publishes a pack as a GitHub release; users install by URL with explicit consent. **Code-plugin runtime is deferred to phase 10.**

### 4.7 Phase-2+ furniture pipelines

Image-to-3D and website-to-3D pipelines plug in as additional `Importer` implementations. They produce normalized internal assets that flow through the standard "save to library" path. The asset & extension system does not change; only the front door of import does.

### 4.8 License and provenance enforcement

- Every asset record carries `license` (SPDX) + `attribution` + `sourceUrl`.
- The "Export Bundle" flow surfaces a license summary, generates `ATTRIBUTIONS.md`, **refuses for clear conflicts** (no-redistribution assets) and **warns loudly for nuanced cases** (CC-BY-SA mixing, etc.) with a user-affirmation gate.
- The build pipeline for asset packs refuses to publish packs with assets lacking a recognized SPDX license + attribution string.

### 4.9 Search and library browsing

- The library browser queries the aggregated `AssetRegistry` with structured filters (category, era, source pack, license, dimensions, tags) plus fuzzy text search across name/description/tags.
- All search is local; indexes built per source and merged on load.

### 4.10 Caching, offline, and quota

- Asset cache is **content-hash keyed** (deduplicated across packs automatically).
- LRU eviction under quota pressure; "pinned" assets are protected.
- Service worker caches app shell + bundled registries + starter pack manifest/thumbnails for offline use after first run.
- `navigator.storage.persist()` requested on first save; `navigator.storage.estimate()` polled before large operations.

### 4.11 Asset variants

MVP uses **discrete variants**: each size/option is a separate asset with its own content hash. **Parametric assets** (one model with parameters) are reserved as a phase-3 hook via an optional `parameters: AssetParameterSet` on `FurnitureInstance.customizations`. The field is reserved so a future migration is unnecessary.

---

## 5. Storage & Persistence

### 5.1 Three interfaces

```ts
interface ProjectStore {
  open(handle: ProjectHandle): Promise<Project>
  save(project: Project, handle: ProjectHandle): Promise<void>
  listRecent(): Promise<RecentProject[]>
  acquireLock(handle: ProjectHandle): Promise<Lock>
  watchForExternalChanges(handle: ProjectHandle, cb: Callback): Unsubscribe
}

interface LibraryStore {
  put(asset: Asset): Promise<AssetReference>
  list(filter?: LibraryFilter): AsyncIterator<LibraryEntry>
  getSettings(): Promise<UserSettings>
  saveSettings(settings: UserSettings): Promise<void>
}

interface AssetCache {
  has(contentHash: string): Promise<boolean>
  get(contentHash: string): Promise<Blob | null>
  put(contentHash: string, blob: Blob, sourceHint: SourceId): Promise<void>
  evictIfNeeded(targetUtilization: number): Promise<EvictionResult>
}
```

Adding a future `CloudSyncProjectStore` is purely additive.

### 5.2 Storage primitives by job

| Need                                  | Primitive                                  | Why                                                                 |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Project folder (user-chosen location) | File System Access API                     | Real on-disk folder; git-friendly; hand-editable                    |
| Project folder (fallback)             | OPFS                                       | Sandboxed virtual filesystem; no permission prompt; fast for binary |
| Asset cache                           | OPFS                                       | Better than IndexedDB for binary; origin-isolated                   |
| User library                          | OPFS (binary) + IndexedDB (metadata index) | Binary in OPFS; queryable index in IndexedDB                        |
| User settings, recent list            | IndexedDB                                  | Small, queryable                                                    |
| App shell + bundled registries        | Service worker cache                       | Offline app shell                                                   |
| Multi-tab coordination                | Web Locks API                              | Standard mutual exclusion                                           |
| Quota observability                   | navigator.storage.estimate                 | Approaching-limits surfacing                                        |

### 5.3 ProjectStore implementations

- **`FileSystemFolderProjectStore`**: Chromium-family browsers; FileSystemDirectoryHandle persisted in IndexedDB; permission re-prompted at session start.
- **`OPFSProjectStore`**: universal; logical model identical, persistence backend differs.
- **`ZipBundleProjectStore`**: universal `.house.zip` import/export; contents expand to OPFS during editing.

User picks a backend per project at creation time; choice is remembered with the recent-project entry. Switching backends is supported.

### 5.4 Autosave and crash recovery

- Debounced autosave: 1.5s of edit inactivity OR 30s of continuous editing.
- Sidecar snapshots in `.house-autosave/` (last 5 + a session-start snapshot).
- On open: if autosave is newer than `project.json`, prompt to restore or discard.
- Explicit save writes canonical `project.json` and prunes old autosaves.
- No journaling system; snapshot frequency bounds recoverable loss to under 30 seconds.

### 5.5 Migrations

Layered: schema-level (in `core/migrations/schema/`) and per-registry (in `core/migrations/registries/`). Both run on open.

- Pre-migration backup to `.house-autosave/pre-migration-v<n>.json` before applying.
- Sync for fast migrations; async with progress UI for slow ones (> 1000 entities or > 1MB of JSON).
- Atomic; the original is never partially written. Migration throws → restore from backup, surface error with "report bug" prompt.

### 5.6 Multi-tab safety

Web Locks-based exclusive ownership. First tab to open holds the lock; second tab gets a prompt: "open read-only here, or take ownership and force the other tab to read-only?" Read-only mode disables all mutation commands with a clear banner.

### 5.7 File System Access permission lifecycle

- Directory handle stored in IndexedDB after first open.
- `handle.requestPermission()` on reopen; most browsers re-prompt at session start.
- Mid-session permission revocation triggers a recovery flow: "save copy to OPFS, or re-grant access." Never silently fails.

### 5.8 Quota and eviction

- `navigator.storage.persist()` requested on first save.
- `navigator.storage.estimate()` polled before large operations; warn at 80%, refuse new imports at 95%.
- Asset cache LRU evicts cold custom assets first; bundled and pinned assets are protected.

### 5.9 Service worker scope

- Caches app shell, bundled registries, starter pack manifest + thumbnails.
- Does not cache project data or custom assets (those live in OPFS/FS handles).
- Versioned with the app; updates on each release; old caches purged.

### 5.10 Browser-platform notes

- **Safari private browsing** gives ephemeral storage. Detect and warn.
- **iOS Safari** has limited WebGPU and tighter OPFS quotas. Documented as a reduced-capability environment.
- **Drag-and-drop** of files surfaces a destination chooser (one-shot scene reference, library import, or underlay).

### 5.11 Future cloud sync

A `CloudSyncProjectStore` would implement the existing interface with internal sync state, operate on a CRDT representation derived from the entity tree (structurally CRDT-friendly), and layer on top of, not replace, local storage. Not built in MVP.

---

## 6. Rendering & Engine

### 6.1 Scene graph as the intermediate representation

```
Project model         derive (pure, memoized,        Scene graph
(authoritative   ──▶  entity-keyed dirty           (normalized,
state)                tracking)                     stable IDs)
                                                         │
                                  ┌──────────────────────┼──────────────────────┐
                                  ▼                      ▼                      ▼
                          2D plan renderer        3D scene renderer      Export pipeline
                          (Canvas + DOM)          (Three.js + R3F)       (SVG/PDF/PNG/glTF)
```

The scene graph in `core/scene/` is pure data, no Three.js or DOM dependencies. It is a memoized projection of the project model. Both renderers consume the same scene graph; the phase-8 lighting fidelity renderer replaces the 3D renderer at this seam.

### 6.2 2D plan renderer

- **Canvas (2D context) for the bulk**: walls, floors, openings, trim paths, furniture footprints, underlay images. Custom transform, batched draws, dirty-region re-render.
- **DOM overlay (React) for interactive UI**: selection rings, dimension chips, snap indicators, hover tooltips. CSS transforms mirror the Canvas world matrix. Gives accessibility + easy styling.
- **No SVG for live rendering.** SVG is the **export** output for vector floor plans.
- **Hit testing** via a quadtree spatial index over scene entities.

### 6.3 3D scene renderer

- **Three.js + React-Three-Fiber + WebGPURenderer** primary; WebGL2 fallback as a post-MVP fast-follow (the renderer detects backend at startup).
- **R3F for declarative composition.** Imperative Three.js access via refs is allowed for hot paths (e.g., wall drag).
- **Custom GLSL/WGSL materials** where needed: walls, floors, ceilings use the custom `PaintMaterial`. Furniture uses Three.js `MeshPhysicalMaterial` defaults from imported glTF.

### 6.4 Data flow

```
User interaction → Command (apply/revert) → Project model mutation
                       (undo system intercept)         │
                                                       ▼
                                        Entity-keyed dirty markers
                                                       │
                                                       ▼
                                  Scene graph re-derives (only dirty entities)
                                                       │
                                                       ▼
                              Both renderers update incrementally (subscribers)
```

Renderers observe; they never mutate. This is what keeps undo/redo consistent and lets export pipelines reuse the same derivation logic.

### 6.5 2D ↔ 3D synchronization

Both views observe the same scene graph and dispatch the same commands.

- Selection state is shared (lives in `bridge/`).
- Camera state is per-view.
- Some tools are 2D-native (wall drawing, dimension placement, room labeling, trim painting).
- Some are 3D-native (walk mode, camera-from-door, sun-angle preview).
- Some are dual-mode (move furniture, change paint).
- Split-pane UI by default; either pane can be maximized.

### 6.6 Camera and navigation

- **2D:** smooth (non-stepped) pan and zoom, infinite canvas, snap-to-fit, snap-to-selection. Middle-mouse pan, scroll zoom, trackpad gestures, spacebar+drag.
- **3D orbit:** left-drag orbit, middle-drag pan, scroll zoom, configurable orbit pivot.
- **3D walk mode:** WASD + mouse-look at standing eye-height. Essential for the audience.
- **Camera presets:** top-down, four elevations, from-door, from-window.

### 6.7 Lighting in MVP and the phase-8 seam

MVP lighting (`BasicLightingProvider`):

- One directional "sun" at a fixed default angle.
- One hemisphere fill light.
- One scene-wide color temperature slider (2700K → 6500K with named presets).
- PCF soft shadow maps, quality-tunable.
- No GI, no IBL, no solar simulation, no obstruction shadows.

The seam: the entire lighting setup lives behind a `LightingProvider` interface in `engine/`. The phase-8 `SolarLightingProvider` consumes site lat-long + obstructions + time-of-year/day to produce sun direction, sky IBL, and obstruction shadow casters. Material parameters stay consistent across both providers.

### 6.8 Materials and paint preview

Walls, floors, ceilings use the custom `PaintMaterial`:

- Base color in OKLab internally; converted to linear sRGB then gamma-corrected at render.
- Finish parameter from `FinishRegistry` (flat/matte/eggshell/satin/semi-gloss/gloss) → roughness + sheen + specular intensity preset.
- Multiplied by scene-light color temperature so the same paint visibly shifts under warm vs. cool light. This is the MVP fidelity hook.

Furniture uses Three.js `MeshPhysicalMaterial` defaults. Per-instance overrides live in `FurnitureInstance.customizations.materialOverrides`.

Color science is centralized in `core/color/`. OKLab is the internal representation; conversions happen at the renderer boundary.

### 6.9 Selection, gizmos, hit testing

- **2D hit testing:** quadtree spatial index over scene entities.
- **3D hit testing:** Three.js raycaster; meshes carry their scene-graph entity ID in `userData`.
- **Selection state:** shared across views, persisted with autosave.
- **Gizmos:** translation (X/Y/Z arrows + plane handles), rotation (Y-axis wheel for floor-bound; full XYZ for free-floating), wall thickness (perpendicular drag), opening width/height (along-wall and along-jamb handles), multi-select group transform.

### 6.10 Performance budgets

- **Target:** 60 fps interactive on integrated GPUs (Intel Iris-class, Apple M1+, recent AMD APUs) with 4 floors, ~200 furniture instances, ~50 architectural elements, paint preview enabled.
- **Instancing** for repeated furniture (`InstancedMesh`).
- **Dirty tracking** ensures only changed entities re-derive scene graph nodes.
- **Frame budget enforcement:** continuous editing operations target 8 ms scene update + 8 ms render. Profiling harness in `engine/profiling/` measures both per-command.
- LOD for distant furniture is post-MVP.

### 6.11 Text rendering

- 2D plan: Canvas `fillText` for dimensions and labels.
- 3D scene: no in-world text in MVP. If needed later: signed-distance-field text.

### 6.12 Export pipeline

In `core/export/`, separate from `engine/`. Generates output directly from project model + scene graph derivation. SVG (vector 2D plan), PDF (multi-page document with title block and per-floor pages), PNG (2D and 3D snapshots at configurable resolution), glTF scene export (phase 2). Shares geometry derivation with rendering but emits different formats.

### 6.13 Accessibility

- 2D plan editor: DOM overlays carry ARIA labels, focus management, keyboard navigation.
- 3D view: keyboard navigation of camera + selection, screen reader announcements for selection changes, color-blind-safe selection highlights.
- Full audio scene descriptions and keyboard-only modeling: post-MVP. Semantic UI structure and ARIA from day one.

---

## 7. Cross-cutting Concerns

### 7.1 Commands and undo/redo

Single mutation boundary. Every state change flows through it.

```ts
interface Command<P = unknown> {
  type: string
  params: P
  description: string
  coalesceWith?(prev: Command): Command | null
}

interface CommandHandler<P> {
  apply(state: ProjectState, params: P, captureInverse: InverseCapture): void
  customRevert?(state: ProjectState, inverse: CapturedInverse): void
}
```

- **Framework captures the inverse** automatically via an `InverseCapture` proxy that records mutations. Less error-prone than hand-written reverts.
- **Coalescing** via `coalesceWith(prev)` for continuous actions; drag operations produce one undo entry, not many.
- **Selection is NOT in undo history.** Selection state lives in `bridge/`, persists with autosave separately.
- **Linear history.** New edit after undo discards the redo branch.
- **Persisted with project.** History is part of autosave snapshots, bounded to ~200 most recent commands.
- **Atomic on error.** Command throws → inverse is replayed → command rejected with a clear error.

Commands live in `core/commands/handlers/`, grouped by domain. Single dispatcher in `core/commands/dispatch.ts`. The `bridge/` is the only place outside `core/commands/` that calls `dispatch`.

### 7.2 i18n

- Every user-visible string through `t('namespace.key', params)` from day one; linted.
- Locale files as JSON in `i18n/locales/<locale>.json`; community-contributable.
- ICU MessageFormat for plurals/gender/ordinals.
- Locale-aware formatters for numbers, dates, lists.
- **Era vocabulary is locale-aware.** `EraRegistry` entries carry `displayName: Record<Locale, string>`; locale-default vocabularies live in locale-specific registry packs.
- Units default by locale but are user-overridable.
- RTL: CSS logical properties throughout; MVP ships LTR.
- MVP ships en-US; other locales as community contributions.

### 7.3 Units

- **Internal storage is always SI** (meters, square meters, cubic meters).
- **Display conversion at the UI boundary** in `core/units/`. Per-project setting, defaulted by locale.
- Multiple imperial display forms (`6'8"`, `6.667'`, `80"`).
- Tolerant input parsers (`6'8"`, `6 ft 8 in`, `6.667 ft`, `80 in`, `2.03 m`, `2030 mm`).
- Display precision configurable per category.
- No round-trip drift; the parser/formatter pair preserves precision against the stored value.

### 7.4 Color science

- OKLab internal representation for all paint operations (mixing, comparing, interpolating, perceptual distance).
- sRGB conversion at the renderer boundary with proper gamma. Three.js configured for linear-space rendering with `SRGBColorSpace` output.
- Palette entries store color in **three forms**: OKLab (canonical), sRGB hex (display/serialization), and `originalSpec` (source identifier, e.g., brand color code).
- Color temperature applied as scene-light parameter; the paint shader receives both surface color and light color.
- Display P3 used where supported for wider color reproduction.
- Color-blind accessibility: every paint chip carries its color name as accessible text; optional simulation toggle.

### 7.5 License and provenance: runtime view

Architecturally covered in §4.8. Cross-cutting commitments:

- Every asset record carries SPDX license + attribution + sourceUrl.
- `Project.assetIndex` is the project's aggregated view.
- Export bundling validates, surfaces required attribution, refuses for clear conflicts, warns loudly for nuanced cases.
- License changes are versioned; the project records the license-at-time-of-use, and reopening surfaces the change.

### 7.6 Errors, logging, diagnostics

- Errors at the command boundary caught and rolled back atomically. User sees plain-language message with a "view details" expander.
- I/O errors shown with concrete recovery actions ("retry", "open read-only", "import from backup").
- **Diagnostic export**: one-click "copy diagnostic info to clipboard" generates a JSON payload (app version, browser, WebGPU capabilities, project metadata summary, last 50 anonymized command-history entries, recent error logs). No automatic transmission.
- Structured logging in dev/debug. Production strips verbose logs; warnings and errors retained.
- **Zero telemetry by default.**

### 7.7 Settings and theming

User settings persisted in `LibraryStore`:

- Default units (per category)
- Locale override
- Theme (light / dark / system) + high-contrast mode
- Editor preferences (grid spacing, snap thresholds, default ceiling height, default wall thickness/construction)
- Asset pack subscriptions
- Diagnostic flag
- Privacy preferences

Theming via CSS custom properties. System theme follows `prefers-color-scheme`.

No cloud sync of settings in MVP. Export/import as JSON for portability.

### 7.8 Keyboard shortcuts

- Standard editing shortcuts (`Ctrl/Cmd-Z`, `Ctrl/Cmd-Shift-Z`, `Ctrl/Cmd-S`, etc.).
- Tool shortcuts (single-letter keys).
- Customizable in settings with inline conflict surfacing.
- Cheat sheet panel (`?` to open).
- OS-aware (Cmd on macOS, Ctrl elsewhere).

### 7.9 Accessibility: cross-cutting commitments

- Semantic UI throughout (roles, labels, focus management, ARIA states).
- Keyboard navigation for every editor function.
- Screen reader announcements for selection changes and major state transitions.
- Color-blind-safe selection highlighting.
- `prefers-reduced-motion` respected.
- MVP: 2D editor and chrome UI are fully accessible. 3D view is keyboard-navigable with selection announcements. Full audio scene descriptions: post-MVP.

---

## 8. Engineering Norms & Developer Workflow

### 8.1 Documentation surface

```
README.md, LICENSE, NOTICE, CHANGELOG.md, CONTRIBUTING.md,
CODE_OF_CONDUCT.md, SECURITY.md, ARCHITECTURE.md, ROADMAP.md,
CLAUDE.md, .claude/rules.md, .claude/agents/, .claude/commands/
docs/
  user/                  ← user guides
  contributor/
    architecture/        ← per-layer deep dives
    subsystems/          ← per-subsystem docs
    recipes/             ← how-tos
    guides/              ← asset-pack authoring, registry-pack authoring, locale contribution
    clean-code.md        ← Clean Code principles with project-specific examples
  knowledge/             ← indexed knowledge graph (§8.4)
```

### 8.2 Changelog and release engineering

- Conventional Commits enforced via `commitlint` + Husky.
- Automated changelog via `release-please`.
- SemVer strictly.
- Release branches `release/v<major>.<minor>.x` for back-porting.
- Tags on every release; release notes mirrored to GitHub Releases.

### 8.3 CLAUDE.md: operating manual

Under 200 lines; read at every Claude Code conversation start.

Sections:

1. Mission statement
2. Repo layout (6-layer architecture diagram)
3. Hard invariants (the lint-enforced rules)
4. Workflow: brainstorm → spec → plan → test → implement → refactor → review
5. Knowledge graph reliance: consult `docs/knowledge/INDEX.md` before exploring; update after meaningful changes
6. Subagent inventory
7. Slash command inventory
8. Common shell commands
9. Things to never do
10. Pointers to other docs

### 8.4 The knowledge graph: `docs/knowledge/`

Indexed, ever-expanding, Claude-Code-reliant, routinely updated.

**Structure:**

```
docs/knowledge/
  INDEX.md, index.json   ← auto-generated
  decisions/             ← ADRs (Michael Nygard format)
  components/<component>/<topic>.md
  patterns/<name>.md
  anti-patterns/<name>.md
  incidents/<date>-<slug>.md
  glossary.md
  runbooks/<task>.md
```

**Entry frontmatter:**

```yaml
---
title: '...'
slug: components/.../...
tags: [...]
related: [...]
sourceFiles: [...]
status: current | superseded | deprecated
updated: YYYY-MM-DD
---
```

**Indexing (`pnpm knowledge:index`)** scans, validates frontmatter, regenerates `INDEX.md` and `index.json`. Runs in pre-commit and CI.

**Reliance from Claude Code:**

- CLAUDE.md mandates consultation before exploration and update after meaningful changes.
- Custom slash commands `/knowledge`, `/adr`, `/knowledge:update`.
- Subagent `knowledge-curator` proposes updates at end of significant changes.

**Routinely-updated enforcement:**

- Pre-commit hook: architectural-file changes trigger a "knowledge update?" warning.
- CI check: architecturally significant files modified without corresponding knowledge updates fail PR with a clear message; override requires `[no-knowledge-update]` tag and maintainer approval.
- Weekly scheduled GitHub Action surfaces stale entries as a tracking issue.
- PR template includes a knowledge-update checkbox.

### 8.5 Pre-commit hooks (Husky)

Fast checks (must stay fast):

- Lint (only changed files)
- Typecheck (incremental)
- Format check (Prettier)
- Conventional commit message format
- Knowledge-graph update warning
- Test affected paths (`vitest run --changed`)
- Asset-pack manifest validation
- Clean-code-reviewer warnings for `feat:`/`fix:`/`refactor:` commits (non-blocking locally; mandatory at PR time)

Heavy checks (full E2E, visual regression, perf benchmarks) run in CI only.

### 8.5b Dependency cooldown

To reduce supply-chain risk from compromised package releases and typosquatting, the repository enforces a **15-day minimum release age** on every direct and transitive dependency. pnpm refuses to install any package version younger than this threshold; the older version satisfying the requested range is selected instead.

- Configured in `.npmrc` as `minimum-release-age=21600` (minutes; equals 15 days).
- Requires pnpm 10 or newer, pinned via the `packageManager` field in `package.json`.
- Applies in local installs, CI installs, and on the install side of any future automated dependency update (e.g., Dependabot or Renovate); those tools may need their bump cadence aligned to the cooldown.
- A short list of exclusions can be added via `minimum-release-age-exclude` if a specific trusted package needs to bypass the cooldown. We do not maintain any exclusions today.

### 8.6 Branching and release strategy

- `main` is always releasable.
- Feature branches from `main`; PRs into `main`.
- `release/v<X>.<Y>.x` long-lived for back-porting.
- Tags on releases.
- `next` (optional) for queueing breaking changes between majors.
- All merges via PR + green CI.

### 8.7 CI/CD pipeline (GitHub Actions)

Sequential phases, each gating the next:

1. **Fast feedback** (every commit): lint, typecheck, format, unit, property-based, knowledge audit, asset-pack manifest validation.
2. **PR** (every PR): + integration, component, accessibility, ping-pong compliance, `clean-code-pr`.
3. **PR + main**: + E2E (Chromium), visual regression, bundle-size budget, 3D scene snapshots.
4. **Main + tagged PRs**: + E2E (Firefox + WebKit), performance benchmarks, Lighthouse CI.
5. **Build + deploy preview** (every PR): static build, per-PR preview URL.
6. **Release** (manual or release-please PR merge): tag, GitHub release with changelog, deploy.
7. **Weekly** (overnight): mutation testing (Stryker), software-rasterizer 3D snapshots, docs link check.

### 8.8 Subagents (`.claude/agents/`)

- **`test-author`**: writes failing tests against spec/knowledge/type signatures; **cannot read implementation source**. Allowed paths: `tests/**`, `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`.
- **`implementer`**: writes minimal code to pass failing tests; receives only test-runner output, not test source; **cannot modify test files**.
- **`refactorer`**: improves code while keeping tests green.
- **`clean-code-reviewer`**: read-only; invoked during blue phase and at PR time. Produces structured Clean Code reports with must-fix / should-fix / consider severities.
- **`pr-reviewer`**: read-only; verifies ping-pong adherence, knowledge graph updates, acceptance criteria, blue-phase presence.
- **`knowledge-curator`**: read repo / write `docs/knowledge/` only; proposes updates after significant changes.
- **`pack-validator`**: invoked when asset/registry packs change.
- **`migration-author`**: invoked when registry or schema changes require migrations.

Access controls enforced via tool wrappers in `.claude/tools/`.

### 8.9 Custom slash commands (`.claude/commands/`)

- `/knowledge [query]`: list/search/open knowledge graph entries
- `/adr <slug> "title"`: scaffold a new ADR
- `/knowledge:update <slug>`: open an entry with changelist prompt
- `/test-first <feature>`: invoke `test-author`
- `/implement`: invoke `implementer` against most recent failing test
- `/refactor`: invoke `refactorer`
- `/clean-code-review [files]`: ad-hoc Clean Code review
- `/review`: invoke `pr-reviewer`
- `/pack:new <kind>`: scaffold pack source
- `/migration:new <registry> <fromVersion>`: scaffold a migration

---

## 9. Testing Strategy

### 9.1 The pyramid

Layered from broad-and-fast to narrow-and-expensive. No upper bounds on test counts; the **shape** (more at the base) and **intentionality at higher layers** (E2E and acceptance tests cover distinct journeys, not multiplied variations) are what matters.

```
            ┌─────────────────────────────┐
            │  Acceptance / user journey  │   Playwright, BDD-style
            ├─────────────────────────────┤
            │  E2E + visual regression    │   Playwright, axe, screenshots
            ├─────────────────────────────┤
            │  3D scene snapshot tests    │   Custom Three.js harness
            ├─────────────────────────────┤
            │  Component tests            │   RTL + Storybook play functions
            ├─────────────────────────────┤
            │  Integration tests          │   Vitest, no DOM
            ├─────────────────────────────┤
            │  Property-based tests       │   fast-check + Vitest
            ├─────────────────────────────┤
            │  Unit tests                 │   Vitest
            └─────────────────────────────┘
```

### 9.2 Tooling stack

| Layer             | Primary tool                                                 | Why                                                                |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Unit              | Vitest                                                       | ESM-native, Vite-integrated; same runtime as the app               |
| Property-based    | fast-check (+ Vitest)                                        | Catches edge cases; great for geometry, color, parsers, migrations |
| Component         | React Testing Library + Storybook play functions             | User-perspective component contracts                               |
| Integration       | Vitest                                                       | Multi-module flows, no DOM                                         |
| 3D scene snapshot | Custom Three.js harness (offscreen-canvas) + perceptual diff | Three.js output is GPU-sensitive; perceptual diff is reliable      |
| E2E               | Playwright                                                   | Multi-browser, parallel, trace built-in                            |
| Visual regression | Playwright `toHaveScreenshot` + per-browser baselines        | First-class; no extra service                                      |
| Accessibility     | @axe-core/playwright + manual checklists                     | Automated for major rules; manual for nuance                       |
| Performance       | Three.js bench harness + Lighthouse CI + bundle-size budget  | Regression tracking over time                                      |
| Mutation          | Stryker (Vitest runner), weekly                              | Measures test _quality_, not just coverage                         |

### 9.3 Test layer details

**Unit tests** cover every pure function, command handler, registry resolver, parser, geometry primitive in `core/`. Coverage target ≥ 90% on `core/`. No mocks for owned code; mocks only at I/O boundaries.

**Property-based tests** cover geometry under random configurations, units round-trip, color round-trip, file format migrations, command coalescing. Failing seeds logged for reproducibility.

**Integration tests** cover `core/` end-to-end flows: scene graph derivation, asset registry resolution, command dispatch with undo across entities, importer wiring. Pure TS.

**Component tests** use React Testing Library; Storybook play functions double as visual documentation. Real components with real bridge layer where feasible.

**E2E tests** run with Playwright across Chromium (WebGPU), Firefox, WebKit. Categories: smoke, editor flows, asset workflows, multi-floor + stairs, paint + export, migration + bundle. Traces saved on failure.

**3D scene snapshot tests** render known scenes (project JSON fixtures) with fixed camera and lighting. Perceptual diff (pHash / SSIM with tolerance) primary; bit-exact via software-rasterizer in nightly. Per-renderer baselines (WebGPU vs WebGL2).

**Visual regression** uses Playwright `toHaveScreenshot` with per-browser baselines for chrome UI. Volatile regions masked. Storybook stories doubled as visual baselines.

**Accessibility** runs @axe-core/playwright on every page transition. Color contrast across themes. Keyboard-only navigation tests. Screen reader checklist (manual, documented).

**Performance** uses a render benchmark harness in `engine/profiling/` (p50/p95/p99 frame times at known scene complexities). Bundle-size budget. Lighthouse CI. Memory leak detection via repeated render + GC.

**Acceptance tests** cover user journeys from the spec. BDD-style names traceable to AC IDs (e.g., "AC5.4: ...").

### 9.4 Ping-pong TDD: red → green → blue

The cycle:

```
   ┌──────────────────────────┐
   │  RED (test-author)       │
   │  - write failing test    │
   │  - commit: test:         │
   └──────────────────────────┘
                │
                ▼
   ┌──────────────────────────┐
   │  GREEN (implementer)     │
   │  - minimal code to pass  │
   │  - commit: feat:/fix:    │
   └──────────────────────────┘
                │
                ▼
   ┌──────────────────────────┐
   │  BLUE                    │
   │  - clean-code-reviewer   │
   │    audits the diff       │
   │  - refactorer applies    │
   │    improvements          │
   │  - tests stay green      │
   │  - commit: refactor:     │
   │    (empty marker if no   │
   │    changes needed)       │
   └──────────────────────────┘
                │
                ▼
        ┌───────────────┐
        │  Loop or done │
        └───────────────┘
```

**Blue is non-optional.** Every cycle includes it. If `clean-code-reviewer` finds no actionable issues, the cycle still produces an empty `refactor: clean-code-review pass, no changes needed (cycle <n>)` commit. This preserves cycle traceability in commit history without amending the green commit.

### 9.5 Independence enforcement

Three layers, increasingly strict:

1. **Agent-level access control**: subagent definitions declare file-access rules; custom tool wrappers in `.claude/tools/` filter reads by path and produce structured test-runner output for `implementer`.
2. **Commit-history CI check**: verifies test commits precede impl commits, test files unchanged in impl commits (with legitimate test-refactor exceptions), each impl commit makes a previously-failing test pass.
3. **`pr-reviewer` agent**: read-only repo audit; surfaces violations the CI didn't catch; flags tests that look written _after_ implementation.

### 9.6 Clean Code review during blue phase

`clean-code-reviewer` reviews each blue-phase diff against:

- **Naming** (reveal intent, no abbreviations beyond accepted, pronounceable)
- **Functions** (small, one thing, one level of abstraction, ≤3 params ideally, no flags)
- **Comments** (only for _why_; code is the _what_; no commented-out code)
- **Formatting** (consistent; vertical proximity; newspaper-style)
- **Objects & data** (classes hide implementation; pure data is explicit)
- **Error handling** (exceptions over codes; no null pass/return; one level per try)
- **Boundaries** (external deps wrapped at clear seams)
- **DRY** (real duplication eliminated; coincidental duplication left)
- **Cyclomatic complexity** (flag >10; investigate >5)
- **SRP** (one reason to change)
- **Dependency direction** (higher → lower; never reversed)
- **SOLID** violations with concrete locations
- **FIRST for tests** (Fast, Independent, Repeatable, Self-validating, Timely)

Severity:

- **must-fix**: clearly misleading names, function with 5+ responsibilities, cyclomatic complexity >15, hidden mutation in a "pure" function. Gates PR.
- **should-fix**: function modestly oversized, mild abstraction-level mixing, missed extraction. Strongly encouraged; passes with maintainer approval logged to `docs/knowledge/exceptions/`.
- **consider**: stylistic notes. Informational.

### 9.7 PR-level Clean Code assessment

At PR completion, `clean-code-reviewer` runs once over the full PR diff. Report posted as PR comment, stored as CI artifact, must-fix issues fail the `clean-code-pr` gate.

### 9.8 Automated guardrails (lint level)

Configured in `eslint.config.js`:

- `max-lines-per-function`: 40 warn, 80 error
- `max-lines`: 300 warn, 500 error
- `max-params`: 3 warn, 5 error
- `complexity`: 10 warn, 15 error
- `max-depth`: 3 warn, 4 error
- `@typescript-eslint/naming-convention` strict
- `no-magic-numbers` with allowlist
- `no-nested-ternary`, `no-console`, `import/no-cycle`
- `import/no-internal-modules` for layer-boundary enforcement
- `boundaries/element-types` (eslint-plugin-boundaries): enforces `core/` cannot import React/Three.js
- Custom `no-direct-three-imports-outside-engine`
- Custom `no-direct-storage-API-outside-storage`
- `jsdoc/require-jsdoc` on public APIs
- `unused-imports`
- `jscpd` for duplicate detection at build level

Pre-commit (incremental) and CI (full).

### 9.9 Mutation testing

Stryker runs weekly on main against `core/`. New code cannot lower the mutation score below a threshold. Surfaced mutations are actionable signal: "this code was edited but no test catches the breakage."

### 9.10 Fixtures and test data

- `tests/fixtures/projects/`: reusable project JSONs.
- `tests/fixtures/assets/`: small CC0 test assets, license-tagged.
- `tests/fixtures/registries/`: frozen registry versions for migration testing.
- `tests/factories/`: `makeWall`, `makeProject`, etc.
- No shared mutable test state; each test gets fresh data.
- Deterministic random seeds where randomness is unavoidable.

### 9.11 CI gates summary

| Gate            | When              | Layers                                                                                          |
| --------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| **Fast**        | every commit + PR | Lint, typecheck, format, unit, property-based                                                   |
| **PR**          | every PR          | + Integration, component, accessibility, knowledge audit, ping-pong compliance, `clean-code-pr` |
| **PR + main**   | PR + main         | + E2E (Chromium), visual regression, bundle size, 3D scene snapshots                            |
| **Main + tags** | main + tagged     | + E2E (Firefox + WebKit), performance, Lighthouse CI                                            |
| **Weekly**      | overnight         | + Mutation testing, software-rasterizer 3D snapshots, docs link check                           |

### 9.12 Anti-patterns (codified in `.claude/rules.md`)

- Tests that mock the system under test instead of exercising it
- Tests modified to make them pass instead of fixing implementation
- Test names like "test wall move"; names describe _behaviors_, not method names
- Commenting out failing tests (CI rejects `// skip` / `xtest` without ADR linking to a tracked issue)
- E2E tests that depend on timing (`sleep(500)` forbidden; use explicit wait-for-condition)
- Snapshot baselines committed without diff review
- Skipping blue phase

---

## 10. MVP Phasing

Phased delivery with public alpha at phase 3 and public beta at phase 5. Each phase has explicit deliverables, acceptance criteria, and out-of-scope reminders.

### Phase 0: Bootstrap (2 to 3 weeks)

**Goal:** Architecturally correct skeleton. CI green. Foundations of engineering norms and TDD workflow operational.

**Deliverables:**

- Repo layout matching the 6-layer architecture
- License: Apache-2.0; all documentation files populated with substantive content
- Build tooling: Vite (app), `vernacular-pack` CLI scaffold
- TypeScript strict mode; CI (typecheck, lint, test, build, preview deploy)
- Vitest + integration scaffolds; Playwright scaffold; visual regression scaffold; Lighthouse CI scaffold; axe-core integration
- Static deploy to canonical URL
- Service worker scaffold (no real caching yet)
- OPFS and IndexedDB verified accessible across target browsers
- Command dispatcher skeleton; scene graph + 3D renderer skeleton renders an empty scene
- React app shell with placeholder panels
- i18n with en-US bootstrapped
- Initial registries: minimal `ElementTypeRegistry`, minimal `FinishRegistry`
- Wall-drawing proof of life
- CLAUDE.md populated; `.claude/rules.md` (incl. Clean Code section); `.claude/agents/` (test-author, implementer, refactorer, clean-code-reviewer, pr-reviewer, knowledge-curator, pack-validator, migration-author); `.claude/commands/` (knowledge, adr, test-first, implement, refactor, clean-code-review, review)
- `docs/knowledge/` scaffold with ~10 starter ADRs
- `docs/knowledge/INDEX.md` and `index.json` build script
- Pre-commit hooks (Husky), commit-message lint, knowledge-update warning, clean-code warning
- `release-please` config; Conventional Commits enforcement
- ESLint config with all guardrail rules
- Issue templates, PR template with knowledge-update checkbox
- `pnpm knowledge:index`, `pnpm pack:build`, `pnpm rgb:audit` scripts

**Acceptance:**

- CI green on PRs
- Wall drawing works, persists via IndexedDB autosave; reload preserves last-drawn wall
- A "Hello, wall" PR demonstrates the full red → green → blue cycle end-to-end with the clean-code-reviewer producing at least one actionable finding
- ESLint passes with zero violations across the scaffold
- `clean-code-pr` CI check passes on the bootstrap PR
- All public functions in `core/` have unit tests

**Out of scope:** snapping, dimensions, openings, 3D rendering, persistence to user filesystem.

### Phase 1: 2D core (4 to 6 weeks)

**Goal:** The 2D plan editor is genuinely useful for single-floor planning.

**Deliverables:**

- Wall topology (junction detection, connection, room polygon derivation)
- Wall drawing with snapping (endpoint, midpoint, perpendicular, parallel, grid)
- Wall editing (endpoint move, thickness, construction type)
- Opening placement (standard swing door single/double, standard double-hung window, picture, casement)
- Opening editing (position, width, height, sill height, swing)
- Room detection + manual `customPolygon` override
- Room naming and labeling
- Live + persisted dimensions
- Pan/zoom Canvas + DOM overlay; grid + rulers
- Selection (click, marquee, multi-select)
- Copy/paste/delete/move/rotate
- System-level undo/redo with coalescing, persisted with autosave
- Units (imperial + metric, multi-format, tolerant parsing)
- `FileSystemFolderProjectStore` + `OPFSProjectStore` + `ZipBundleProjectStore`
- Save/open/recent projects
- Autosave (debounced) with sidecar snapshots
- Schema migration framework scaffold
- Multi-tab safety via Web Locks
- Image underlay with calibration

**Acceptance:**

- Typical single-floor plan (kitchen + living + bedroom + bath) accurate to within 1mm at all zoom levels
- 100+ undo/redo operations behave correctly
- Project survives close/reopen with zero state loss
- Multi-tab open shows the lock prompt
- Migration framework round-trips correctly (load → save → load identical)

**Out of scope:** 3D, furniture, old-house elements, multi-floor, paint.

### Phase 2: 3D preview + light slider (2 to 3 weeks)

**Goal:** 3D companion view with basic feel and the color-temperature hook.

**Deliverables:**

- 3D scene renderer (Three.js + R3F + WebGPU; WebGL2 detected with informative degradation)
- Scene graph derivation for walls/floors/ceilings/openings (no furniture)
- Default neutral materials for shell surfaces
- Camera controls (orbit, pan, zoom, walk mode WASD + mouse-look)
- Camera presets (top-down, four elevations, from-door, from-window)
- `BasicLightingProvider` (sun + hemisphere fill)
- Color temperature slider (2700K → 6500K)
- PCF soft shadow maps
- Split-pane UI with resizable divider; either pane maximizable
- Selection sync between 2D and 3D
- Custom `PaintMaterial` stubbed (no paint yet; shader exists and responds to color temperature)

**Acceptance:**

- 60 fps on Apple M1 / Intel Iris with typical single-floor plan
- 3D view updates within 50ms of 2D edits
- Walk mode comfortable (no flips, no jitter)
- Color temperature changes immediately visible in preview
- 2D ↔ 3D selection sync works

**Out of scope:** furniture, painted walls, solar position, full WebGL2 rendering fallback.

### Phase 3: Furniture (3 to 4 weeks), **public alpha release**

**Goal:** Power users can add furniture. First version with a real identity people can try.

**Deliverables:**

- Asset pack system (manifest format, sha256 integrity, lazy fetch)
- `vernacular-pack` CLI (build, validate, publish; license + dimension sanity checks)
- `pack:vernacular-starter@1.0`: curated ~30 to 50 essential furniture pieces, license-audited
- Library browser (categories, era filter, dimension filter, source pack filter, fuzzy search)
- Furniture placement tool (drag-from-library, snap-to-floor, align-to-wall, rotation gizmo)
- Custom asset import (glTF/GLB/OBJ/STL with sidecar textures)
- Dimension calibration UI (drag-to-scale, type-known-measurement, unit-override)
- `UserFilesystemSource` + `UserLibraryStore`
- License/provenance metadata required at import; surfaced in browser
- Asset cache (content-hash keyed, LRU, OPFS-backed; 80% quota warning)
- `AssetRegistry` resolution algorithm with full fallback
- Public alpha release (docs, canonical URL, GitHub issues active, ROADMAP updated)

**Acceptance:**

- Library browser scrolls smoothly at 500+ assets
- Custom import works for typical Sketchfab/Polyhaven glTF, plus OBJ/STL
- Dimension calibration accurate to within 1%
- Asset cache evicts correctly under simulated quota pressure
- License export blocks/warns appropriately
- Alpha announcement; first community issues triaged

**Out of scope:** old-house elements, multi-floor, paint, parametric variants, image→3D.

### Phase 4: Old-house shell (3 to 4 weeks)

**Goal:** Architectural vocabulary the target audience needs.

**Deliverables:**

- Full opening type vocabulary in `ElementTypeRegistry`: pocket, sliding, French, dutch, bifold, barn doors; transoms; sidelights; bay/bow windows; arched/half-round windows; casement variants
- 2D plan rendering rules per opening type (correct architectural plan symbols)
- Trim system (path-based, multi-segment)
- `TrimProfileRegistry` starter set: crown (3), baseboard (3), chair rail (2), picture rail (1), plate rail (1), wainscoting cap (1), beadboard panel (1), cornice (2)
- Wall features (archways, half-walls, columns, alcoves, built-in shelving; atomic in MVP)
- Ceiling features (medallions x3, decorative beam paths, coved ceiling zones, tin ceiling zones)
- Wall construction profiles (plaster 6", lath-plaster 5", drywall 4.5", brick variants, stone)
- `EraRegistry` populated: Victorian, Edwardian, Craftsman, Mid-Century, Contemporary, Mixed/Uncertain
- Era tagging (project default + per-floor override + per-room override)
- Library era filtering and biasing
- `RoomPurposeRegistry` with era-aware vocabulary
- Per-project notes field

**Acceptance:**

- A Victorian-era house with parlor, dining, kitchen, sitting room, primary bedroom drawn correctly
- All opening types render correctly in 2D AND 3D
- Trim paths follow walls correctly through corners (mitered properly)
- Era filtering surfaces era-appropriate elements first
- Community feedback validates "this represents my house type correctly"

**Out of scope:** multi-floor, paint, solar position.

### Phase 5: Multi-floor + stairs (3 to 4 weeks), **public beta release**

**Goal:** Multi-floor support. First version that meaningfully serves the target audience.

**Deliverables:**

- Multiple floors (add/remove/reorder/name, elevation entry, default ceiling height per floor)
- Stair entities (straight run, L-turn, U-turn, winder, spiral)
- Stair geometry (treads, risers, runs, landings, railings, balusters, newels; parametric)
- Stair placement (connect two floors, position on each plan)
- Floor-by-floor view in 2D and 3D
- Cutaway preview with adjustable transparency on floors above
- Vertical relationships (stair wells punch openings in floors above)
- Per-room ceiling height override
- Complete underlay layer (image, PDF via pdf.js, glTF/glb scene; all calibrated)
- Trace mode (wall tool snaps to underlay features; basic; no auto-trace)
- Public beta release (refined docs, contribution guide, opt-in error reporting)
- First community asset/registry pack accepted; proves contribution pipeline end-to-end

**Acceptance:**

- 4-story old house (basement + 3 floors + attic) drawn with stairs connecting all levels
- Floor-by-floor view performance smooth
- Cutaway preview visually intelligible
- Underlay calibration sub-1% accuracy
- An externally-exported glTF loads as an underlay and supports trace mode
- Beta announcement; community channels active

**Out of scope:** paint, DXF, solar position, auto-trace.

### Phase 6: Paint, export, metadata (2 to 3 weeks), **MVP 1.0**

**Goal:** Visual identity for rooms, export workflows complete, site metadata for phase-8 lighting prep.

**Deliverables:**

- Paint application (surface-by-surface) via dedicated paint tool
- Complete `PaintMaterial` shader (base color + finish + color-temperature responsive)
- `pack:vernacular-historic-palettes@1.0`: bundled CC0 historic palette, ~50 to 100 colors, thoroughly provenance-audited, era-tagged
- User palette UI (create/name/describe/name colors, import/export as JSON)
- Color picker (OKLab-aware, palette browser, recent, fuzzy name search)
- Finish picker (visually distinguishable in preview)
- Site metadata UI (lat/long, north bearing, outdoor obstructions as top-down massing with height; non-rendering placeholder)
- Export to PDF (multi-page, title block, per-floor 2D, optional 3D snapshot pages)
- Export to SVG (vector 2D plan)
- Export to PNG (2D + 3D at configurable resolution)
- Project bundle export/import (`.house.zip` with auto-generated ATTRIBUTIONS.md and README)
- Polish pass (keyboard shortcut completeness, error message clarity, asset-placeholder visuals, accessibility audit, loading-state polish, empty-state copy)
- MVP 1.0 release (versioned, announced, docs)

**Acceptance:**

- Walls take paint cleanly (no z-fighting or texture seams)
- Color temperature slider visibly shifts paint perception in real time
- PDF export print-quality
- Project bundle round-trips faithfully on a different machine/browser
- Bundled historic palette provenance audit trail clean
- 1.0 release notes published; phase 7+ roadmap clear

**Out of scope:** solar position, brand catalogs, DXF, pathing critic.

### Beyond MVP 1.0

**Phase 7 (~v1.1, 3 to 4 weeks):** DXF import (structured + trace modes), opt-in importers for competitor exports via underlay path, additional era packs (Georgian, Federalist; 1960s to contemporary detail).

**Phase 8 (v2, 8 to 12 weeks, high priority):** Lighting fidelity. Solar position from lat/long + datetime, outdoor obstruction shadow casters (consumes phase 6 metadata), HDR sky IBL, day-of-year sliders with sun-path visualization, optional baked GI / light maps, physically-based paint BRDFs aligned with finish definitions, brand catalog opt-in fetch mechanism (legally distinct distribution).

**Phase 9 (v2.x, 6 to 10 weeks):** Pathing + ergonomic critic. Geodesic path computation, path visualization toggle, expanded door-swing collision, room-purpose-specific ergonomic rules (kitchen aisle widths, dining clearances, bedroom walkways), sub-purpose vocabulary expansion, critic-surface UX, customizable rule sets via registry packs.

**Phase 10 (v3+):** Code-plugin runtime (sandboxed, capability-permissioned), image→3D pipeline, website→3D pipeline, cloud sync service (opt-in), async collaboration beyond git, asset hierarchies / parametric variants, mobile/tablet polish, full screen-reader 3D-scene descriptions.

---

## 11. Open Questions and Items Deferred to the Implementation Plan

These are intentionally deferred to the writing-plans skill, not unresolved:

- Specific i18n library (`react-intl` vs `@lingui/react`)
- Specific CSS theming approach (custom properties + CSS modules vs Tailwind + CSS vars)
- Specific spatial-index implementation (rbush vs custom quadtree)
- Specific PDF library
- Specific Stryker config and mutation-score thresholds
- Specific Lighthouse CI thresholds
- Exact baseline-approval UI flow
- Detailed Storybook taxonomy
- Per-phase team-size assumptions
- Specific milestone branch and tag naming conventions
- CRDT design specifics for future cloud sync
- Specific service worker caching strategy
- Service worker versioning approach
- Exact debounce thresholds for autosave
- Specific IndexedDB schema versioning

---

## 12. Glossary

- **AC**: Acceptance Criterion
- **ADR**: Architecture Decision Record
- **AssetReference**: content-addressed identifier `(scope, contentHash)` resolving via `AssetRegistry`
- **BIM**: Building Information Modeling (the IFC ecosystem)
- **Blue (phase)**: the Clean Code review + refactor step in the red-green-blue TDD cycle
- **CRDT**: Conflict-free Replicated Data Type
- **DXF**: Drawing Exchange Format (AutoCAD 2D interchange)
- **Era**: historical period associated with architectural style (Victorian, etc.)
- **FIRST**: Fast / Independent / Repeatable / Self-validating / Timely (test principles)
- **glTF / GLB**: open 3D asset format; binary form is GLB
- **IBL**: Image-Based Lighting
- **IFC**: Industry Foundation Classes (BIM interchange format)
- **MVP**: Minimum Viable Product (here, v1.0)
- **OKLab**: perceptually uniform color space; the internal color representation
- **OPFS**: Origin Private File System (browser sandboxed filesystem)
- **PBR**: Physically Based Rendering
- **R3F**: React-Three-Fiber
- **Red/Green/Blue**: TDD cycle phases: failing test / passing implementation / Clean Code review + refactor
- **SDF**: Signed Distance Field (text rendering technique)
- **SPDX**: Software Package Data Exchange (license identifier registry)
- **Underlay**: a calibrated reference image/PDF/scene pinned to a floor

---

_Document approved 2026-06-01. Updates after implementation begins are tracked via ADRs in `docs/knowledge/decisions/`._
