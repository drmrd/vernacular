---
slug: decisions/ADR-0093-in-app-asset-library
title: 'ADR-0093: In-app asset library, custom import, and 2D placement'
type: decision
tags: [architecture, assets, library, registry, import, placement, schema, tooling]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0024-pack-manifest-validation-location,
    decisions/ADR-0042-bundled-project-asset-cache,
    decisions/ADR-0091-pack-integrity-and-build-pipeline,
    decisions/ADR-0092-furniture-instance-model,
  ]
sourceFiles:
  [
    docs/specs/2026-06-16-asset-library-browser-and-placement.md,
    docs/plans/2026-06-16-asset-library-browser-and-placement.md,
    core/assets/pack-manifest.ts,
    core/assets/license-policy.ts,
    storage/assets/asset-source.ts,
    storage/assets/asset-registry.ts,
    storage/assets/pack-source.ts,
    storage/assets/user-source.ts,
    storage/assets/fetch-pack-reader.ts,
    storage/indexeddb/indexeddb-user-library-index.ts,
    storage/zip/export-project-bundle.ts,
    bridge/react/asset-registry-context.ts,
    bridge/react/user-asset-source-context.ts,
    editor/library/library-panel.tsx,
    editor/library/library-launcher.tsx,
    editor/library/use-furniture-import.ts,
    editor/plan/place-furniture.ts,
    editor/plan/furniture-placement-context.ts,
    editor/plan/hit-test-furniture.ts,
    editor/plan/furniture-inspector.tsx,
    app/create-asset-library-registry.ts,
    public/packs/vernacular-starter-1.0.0/manifest.json,
  ]
status: current
updated: 2026-06-16
---

# ADR-0093: In-app asset library, custom import, and 2D placement

## Status

Accepted, landed. The pack-manifest schema and license policy graduated from the
build-time scripts to TypeScript in `core/assets/`; the toolchain moved to Node 22
so the CLI loads them with native type stripping. A read-only `AssetSource` seam now
has a pack source and a user source behind an `AssetRegistry`, surfaced to React
through context. A docked library browser lists the bundled starter pack and the
user's own imports, a place-furniture tool drops a piece on the plan, and the
inspector edits it. A user-scoped asset is promoted into the project when the
bundle is saved, so a `.building` file stays self-contained.

## Context

ADR-0024 placed the pack-manifest validator in `scripts/pack/` as JSDoc-typed ESM
and named the graduation to `core/` as future work, to happen when an in-app
consumer needed one shared definition. ADR-0091 grew that scaffold into an integrity
and build pipeline but kept it build-time only. The asset cache track (#48) had
already landed a read-only `AssetSource` seam and an `AssetRegistry` with
precedence resolution in `storage/assets/`, anticipating that a wider source surface
"lands with the library browser and custom-import slices." The furniture model
(ADR-0092) gave a placed piece somewhere to live. VFPF bundles (ADR-0042) already
store referenced asset bytes inside the `.building` zip by content hash.

What was missing was the in-app library itself: a way to list assets a pack offers,
to import a model of one's own, to resolve a reference to bytes the renderer can
use, and to drop a piece on the plan. This is the issue where the schema finally has
an in-app consumer, so it is where the graduation happens.

## Decision

**Graduate the schema, and move to Node 22.** `core/assets/pack-manifest.ts` and
`core/assets/license-policy.ts` are now the one definition of the manifest contract,
asset kinds, and the license allowlist, as runtime-self-contained TypeScript that
the in-app loader imports directly. The `scripts/pack/` CLI imports the same
TypeScript by explicit `.ts` specifier, which plain `node` loads through its native
type stripping; `.nvmrc` and the `engines.node` floor move to 22.18, and CI reads
`.nvmrc`, so no workflow file changes. This closes the graduation item ADR-0024 left
open. Thumbnail baking stays deferred, as ADR-0091 recorded.

**Widen the source seam; do not rebuild it.** `AssetSource` gains optional `list`
and `readThumbnail` members and a `LibraryItem` shape (a reference, a display name,
kind, categories, eras, a footprint, and an optional thumbnail reference). A
`PackSource` reads the #173 pack format through a small `PackReader` port and lists
its assets; a `UserSource` pairs the content cache with a `UserLibraryIndex` of the
user's imports and can `put` new bytes. `AssetRegistry.list()` aggregates the sources
with the user before the pack, so a user's own asset shadows a pack asset of the same
hash, matching the resolve precedence the registry already used. An
`IndexedDbUserLibraryIndex` persists the user index; jsdom cannot exercise IndexedDB,
so that adapter is integration-tested rather than unit-tested.

**Ship the starter pack as static files.** The #173 starter fixture is bundled to
`public/packs/vernacular-starter-1.0.0/` and read at runtime by a fetch-backed
`PackReader`, not inlined into the JavaScript bundle. The service worker's real
precache list is still deferred, as the worker scaffold notes; the pack loads over
the network for now.

**Surface it through context and a docked panel.** Bridge contexts provide the
`AssetRegistry` and the user source; both default to safe empties so a bare render
does not throw, and the real ones are assembled once at app boot in
`app/create-asset-library-registry.ts`. A "Furniture" launcher in the tool rail
opens a left-docked browser with search, a sample-versus-yours source toggle, era
chips, a thumbnail-free name grid, and an Import button. The panel is a disclosure
that stays open while the user clicks the canvas to place, unlike the underlay
flyout, because placement is the next click after a pick.

**Place, select, and edit in 2D.** Picking an item arms it and switches to a
place-furniture tool; a click drops a `FurnitureInstance` centered on the cursor and
stays armed for repeats, the R key turns the ghost by a coarse step, and the chosen
asset's footprint follows the cursor as a ghost. Furniture is not in the scene graph
(ADR-0092), so it carries a raw id in the selection set, which the graph paths ignore
because it lacks their node prefix; the furniture select, footprint-drag move,
delete, and draw paths read the floor's array directly and resolve a selected id by
matching it against that array. The inspector edits a selected piece's name, angle,
and footprint through the same unit-aware length field the opening inspector uses.

**Import a model, and keep saved bundles whole.** A custom GLB import checks the
glTF binary signature, hashes the bytes, and stores them in the user source with a
filename-derived name and the editable default footprint. Because a user-scoped
asset lives outside any one project, saving a bundle promotes the bytes of every
referenced user asset into project scope, so the `.building` zip is self-contained
and a reopened project finds its furniture without the original user library.

## Consequences

- The manifest schema, asset kinds, and license policy have one definition the CLI
  and the app share, closing ADR-0024's graduation item; the cost is a Node 22 floor
  that the cooldown-pinned toolchain already supports.
- The library browser and placement reuse the #48 source and registry rather than a
  parallel system, and the #173 pack format is what the app actually loads.
- Furniture placement, selection, and editing work in 2D without a scene-graph node,
  leaving 3D rendering (#175) an additive change.
- A saved bundle stays self-contained because user assets are promoted on save, so a
  project shared as a `.building` file carries its furniture.
- Deferred with reasons recorded here: thumbnail baking and a service-worker precache
  of the starter pack, GLB origin and scale normalization (which needs parsed
  geometry, so it waits for #175), wall-flush snapping, and an overlap warning.

## References

- Feature specification: `docs/specs/2026-06-16-asset-library-browser-and-placement.md`.
- Implementation plan: `docs/plans/2026-06-16-asset-library-browser-and-placement.md`.
- ADR-0007 (content-addressed assets), ADR-0024 (validator location and graduation),
  ADR-0042 (bundled project asset cache), ADR-0091 (pack integrity and build),
  ADR-0092 (the furniture instance model placed here).
