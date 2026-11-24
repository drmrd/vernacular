# Asset Pack Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository a task is one red-green-blue cycle: the `test-author` role commits one failing test, the `implementer` role commits the minimal code, and the `refactorer` role commits a refactor or an empty marker after the clean-code review.

**Goal:** One library over a pack catalog and a shared store of files named by hash: items download when first placed, every downloaded file is checked, people can import packs, a save can carry its library assets, and every asset is credited.

**Architecture:** Pure contracts (catalog, deployment file, version choice, license moves, cache policy, attribution text) live in `core/assets/`. `storage/` owns every `fetch`, Web Crypto digest, and browser store: a verified fetch, a store reader, a library ledger in IndexedDB, and the existing asset pool. `session/library/` holds one library service over ports (merged list, download queue, import, offline job, save plan), which `bridge/` hands to `editor/` and `app/` wires at boot. The registry keeps its `resolve` contract and gains one fallback seam for the network step.

**Tech Stack:** TypeScript, React, Three.js 0.184.0 (its bundled meshopt decoder, `KTX2Loader`, and Basis transcoder), `fflate` 0.8.3, `ajv` 8.20.0, `ts-json-schema-generator` 2.9.0, IndexedDB, the origin-private file system, Web Crypto, Vitest, Playwright, MSW. No new package.

**Spec:** `docs/specs/2026-11-21-asset-pack-distribution.md` (the contract; its 28 proposals are confirmed as written). Decision records: ADR-0229 and ADR-0230. Prerequisite: ADR-0219 and `docs/plans/2026-11-19-texture-assets-in-packs.md`.

- Base: branch `docs/asset-pack-distribution` at `740f3056`. Paths and signatures were read there.
- This plan starts from the end state of the texture assets plan (pack format 2). It does not build any of that plan. "What this plan consumes" lists the names it relies on.

## Global Constraints

- Layer rules of `.claude/rules.md` hold. `fetch`, Web Crypto, IndexedDB, the origin-private file system, and `navigator.storage` are used in `storage/` only and reach `session/` through ports. `session/` imports no React, no Three.js, and no DOM global. `engine/` is the only Three.js importer.
- Downloading, caching, importing a pack, and choosing what a save embeds dispatch no command and add no undo step.
- Every asset reference stays `(scope, contentHash)`. A digest is sha256 as 64 lower-case hex characters, computed with Web Crypto. The `integrity` option of `fetch` is not used.
- An asset request carries no cookie, no credential, no query string, and no referrer.
- No text on the catalog path uses the word "pack". New text says "this app" where it means the app.
- The default library shows no paid item, locked item, price, upsell, or advertisement, and nothing in it needs an account (ADR-0230).
- No new package. If one proves unavoidable, stop and ask: the 30-day cooldown and exact pins apply.
- ESLint limits: functions of at most 40 lines, files of at most 300 lines, at most 3 parameters, no magic numbers.
- Text rules: no em dashes or en dashes, no names of other products, no internal shorthand, Conventional Commit subjects of at most 100 characters, no `Co-Authored-By` and no session trailer.
- The design specification under `docs/specs/2026-06-01-vernacular-design.md` is not edited by this plan.
- Store paths: `catalog.json`, `manifests/sha256/<manifestHash>.json`, `blobs/sha256/<contentHash>`, `packs/<packId>-<version>/{LICENSE,NOTICE,CHANGELOG.md}`.
- Thresholds: evict above 95 percent of the quota, warn at 80 percent. Catalog names are cut at 40 characters.

## Review Focus

The five conditions the specification implies but does not spell out, most likely first. Each has a test in the cycle named.

1. A static host answers a missing `deployment.json`, `catalog.json`, or blob with the app's own HTML page and status 200. A person expects the app to start as if the file were absent, to keep its last library, and never to use the page as an asset. Pull request 2 cycle 5 and pull request 3 cycle 13.
2. A pack file made by zipping the folder itself, so every entry sits under one top folder, or one that holds entries the manifest does not name. A person expects it to import. Pull request 7 cycle 1.
3. The browser gives no storage estimate, or a quota of 0. A person expects downloads to work, with no eviction and no false "out of space". Pull request 6 cycles 2 and 3.
4. The library address changes, by the user or by the deployment. A person expects the old catalog's items to leave the library while placed pieces and saved projects keep their models. Pull request 3 cycle 10.
5. A piece was placed a moment ago and its project has not saved yet when the cache evicts or an added pack is removed. A person expects the piece to keep its model. Pull request 6 cycle 4 and pull request 7 cycle 9.

---

## Facts this plan rests on

At `740f3056`:

- `AssetRegistry` (`storage/assets/asset-registry.ts`) takes a fixed list of `ScopedAssetSource` and an `AssetRegistryOptions` with `footprintFor` only. `resolve(reference)` walks scope kinds by `orderScopesByPrecedence`. `list()` walks `SCOPE_PRECEDENCE` and does not remove duplicates.
- `UserSource.read(contentHash)` returns `cache.get(contentHash)`, so any blob in the shared asset pool already resolves by hash on the device.
- `LibraryItem` (`storage/assets/asset-source.ts`) has `reference, name, kind, categories, eras, styles?, footprint, height, thumbnail?`. `PackSource` keeps its manifest type private, and `core/` exports no manifest type.
- `AssetCache` (`storage/asset-cache.ts`) has `has`, `get`, and `put`, and no `delete`. `DirectoryAssetCache` stores `assets/<hash>` through a `DirectoryPort` that has `removeFile`.
- `ProjectIndex` (`storage/project-index/project-index.ts`) records `assetHashes` and `assetListComplete` for each project, with an IndexedDB implementation, a memory fallback, and a contract test kit.
- `probeStorageCapabilities(host)` reads only the quota from `storage.estimate()`.
- `DocumentStore.save(id, project)` calls `files.prepareAssets(id, hashesToCopy(project))`, and `hashesToCopy` drops every `pack:` scope. `WorkspaceFiles.prepareAssets` does nothing.
- `exportArchive(handle, options)` passes `packSupplies` to `exportProjectBundle`. `neededAssetHashes(project, packSupplies?)` has both behaviors.
- `readArchive(bytes, limits = ARCHIVE_LIMITS)` reads a `.building` archive only. The zip primitives are in `storage/zip/zip-directory.ts` and `storage/zip/inflate-entry.ts`.
- `SettingsService` has `get`, `set`, and `subscribe` over `SettingKey<T>` (`name`, `defaultValue`, `parse`). There is no Settings screen.
- `runPackCli(argv, deps)` (`scripts/pack/vernacular-pack.mjs`) knows `validate` and `build`. `build` writes a report.
- `parseGltfBytes(buffer: ArrayBuffer): Promise<THREE.Object3D>` registers no decoder. `three` 0.184.0 ships `examples/jsm/libs/meshopt_decoder.module.js`, `examples/jsm/loaders/KTX2Loader.js`, and `examples/jsm/libs/basis/basis_transcoder.{js,wasm}` (the `.wasm` is 527,333 bytes).
- `src/service-worker.ts` handles its lifecycle only. `storage/service-worker/shell-cache.ts` names and purges shell caches and caches nothing.
- `Project` (`core/model/types.ts`) has no `assetIndex`. The floor-plan format specification reserves the name (section 6.5) and requires `ATTRIBUTIONS.md` (sections 2.2 and 2.3). `CURRENT_SCHEMA_VERSION` is 17 and `CURRENT_SCHEMA_REVISION` is 1.
- `e2e/fixtures/cube.glb` is a real binary glTF. The starter chair is placeholder bytes, also after the texture assets plan.
- No Content-Security-Policy is set anywhere.

### What this plan consumes from the texture assets plan

`PACK_FORMAT_VERSIONS` (`[1, 2]`), `MEDIA_TYPE_EXTENSIONS`, the types of `core/assets/asset-description.ts`, `TEXTURE_LIMITS`, `validateTextureFields(asset, label, errors)`, `readImageHeader(bytes)`, `PackReader.readAsset(contentHash, mediaType)`, the optional `describe` of `AssetSource` and `AssetRegistry`, `decodeImageTexture(bytes, { mediaType, colorSpace }, decode?)`, the integrity reader port (`dirName`, `listDir`, `exists`, `sha256`, `readBytes`, `size`), `scripts/pack/starter/build-starter-pack.mjs` with `pnpm pack:starter`, `public/packs/vernacular-starter-1.1.0/` beside the kept `public/packs/vernacular-starter-1.0.0/`, `createStarterPackSource(fetch)` (lists 1.1.0 only and still resolves the 1.0.0 chair), `createHarnessAssetRegistry(fetch)`, and the `.prettierignore` entries for pack folders. The integrity check already requires a thumbnail file for every model and none for a texture.

If one of these names differs when this work starts, the first RED brief of the affected pull request names the real one. Nothing else changes.

## Decisions left to the builder

Each is made once, here.

1. **Pack file.** `<packId>-<version>.zip`, written by `build <pack-dir> --zip <out-dir>`. Entries are sorted and carry a fixed date, so two builds give equal bytes.
2. **Pack tool commands.** `publish <pack-dir> --store <dir> [--name <text>]` (`pnpm pack:publish`), `mirror <source> --to <dir>` (`pnpm pack:mirror`), and `reuse <pack-dir> [--check]` (`pnpm pack:reuse`).
3. **Setting names.** `VITE_CATALOG_URL`, `VITE_CATALOG_NAME`, and `deployment.json` at the app's base address. The user's address is the settings key `library.address`. For local work, `pnpm pack:publish <pack-dir> --store public/library` with `VITE_CATALOG_URL=/library/` serves a store from the development server. `public/library/` is ignored by git (pull request 13 adds the entry and the guide says so).
4. **Cache records.** Sizes, last-use times, and origins are records in a library ledger, an IndexedDB database named `vernacular-library` with a memory fallback. Blob bytes stay in the existing asset pool. Pins are not stored. They are computed from `ProjectIndex.all()` plus the open documents. When any record has `assetListComplete === false`, nothing is evicted.
5. **Folder projects.** A project in a folder counts toward pins through its index record. The embedding choice for a folder is asked when the folder is chosen and offered again as "What this folder includes" in the Project menu.
6. **Downloads.** 4 in parallel. A mismatch is retried once at once, past the HTTP cache. An unreachable item is tried again when the browser reports a connection, when the user clicks Retry, and at the next start. A tile shows received bytes over `byteLength` as a whole percent, and no number when the length is unknown.
7. **Fetching again.** `catalog.json` is fetched at start, when the connection returns, and when the library panel opens more than 1 hour after the last fetch. `deployment.json` is read at start only, and a change applies at the next start.
8. **Starter set budget.** The newest starter version is at most 2 MiB (2,097,152 bytes) in total.
9. **Schemas.** Generated from the types in `core/assets/` by the existing generator and guarded by `pnpm schema:check`. One test gives every fixture manifest to both the schema and `validatePackManifest` and expects the same verdict. The manifest schemas are open, as the specification says: the manifest, each asset, and each nested object of a checked field accept unknown keys. The generator's `additionalProperties: false` is not kept in them, and an optional field changes a schema in place.
10. **Publish and compression.** The publish step writes bytes as they are. A host may compress in transit.
11. **Wording.** The specification's text is used as written. Text this plan adds is given where it is used.
12. **Order of work.** The contract and the publish step come first, because every later test reads a store that the publish step wrote. See "Order and parallel work".
13. **Precache.** The service worker precaches the files of the bundled starter folders and the decoder files, and serves only those from its cache. It caches no application shell.
14. **Named files.** `namedFiles(asset)` in `core/assets/pack-manifest-shape.ts` lists every `{ contentHash, byteLength? }` pair an asset names: today its file and its thumbnail. The verified fetch, the pins, the offline size, the catalog `byteLength`, the publish step, the import check, and the mirror command use it, so a later field that names a file needs no change there.

## Owner rulings

These go beyond the specification or settle a point it leaves open. The owner approved all 13 as written on 2026-11-22, and approved subagent-driven execution from the main thread.

1. **The starter pack 1.1.0 manifest is amended in place** with `byteLength`, `thumbnail`, and `copyright` (pull request 1). No store has published it and no reference names a manifest hash, and the specification's example catalog lists 1.1.0 as a publishable format 2 pack. If an app release has shipped 1.1.0 by then, the same change ships as 1.1.1.
2. **The bundled starter pack id is refused on import too**, with every catalog pack id, so an import cannot shadow the starter set when no catalog is set.
3. **A blob with no declared length is refused past 64 MiB** (67,108,864 bytes). Web Crypto hashes a whole buffer, so a ceiling is needed.
4. **A catalog address is `https:`, a same-origin path, or `http://localhost`.** The last two let the tests and the development server read a local store.
5. **The credit record is derived at each save and written by the save path.** No command sets it. It also carries an optional `notice` beyond the eight fields of the specification, so the `NOTICE` of an Apache-2.0 asset survives a second save by someone who lacks the pack. A record is written for every library asset the project uses, first-party ones too, embedded or not.
6. **The pack tool checks a model's required extensions and that it refers to no outside file.** It also checks that each image inside a model is PNG, JPEG, WebP, or KTX 2.0. Full glTF validation would need a new package and waits for the preparation pipeline.
7. **The Settings entry is "Settings" in the Project menu**, opening a dialog with the two parts.
8. **The "storage is full" placeholder label is "No space on this device".** The specification gives the notice but no label for that state.
9. **The credit line for exports is built and tested with no caller**, because no export pictures a model yet. An issue records the call site.
10. **No shell precache.** A first launch with no connection still needs the browser to have the app, so the "offline at first launch" line is reachable only once a shell precache exists. An issue records it.
11. **`ATTRIBUTIONS.md` is written only when the project uses a library asset**, by both save choices, and a folder save removes one that no longer applies. The floor-plan format specification requires the file only for a file that bundles attributed assets.
12. **No test decodes a really compressed model or KTX 2.0 texture.** Pull request 11 proves that the right decoder is asked for and that the decoder files ship. A compressed fixture needs an encoder, which would be a new package. An issue records it.
13. **The credit record is revision 2 of schema version 17**, an additive change with its own decision record and an amendment to the floor-plan format specification (pull request 8). Pack format 3 also gets a decision record (pull request 11), and pull request 13 moves ADR-0229 to `current`.

## Rules every pull request keeps

- A RED commit holds one failing test and the fixtures and fakes it needs. Its message is `test: ...`. GREEN is `feat: ...` or `fix: ...`. BLUE is `refactor: ...`, empty when the review finds nothing. Documents, build files, and end-to-end specs go in `docs:`, `build:`, and `test(e2e):` commits.
- RED proof: `pnpm exec vitest run <test file>` fails for the reason the cycle states. GREEN proof: the same command passes. Before a push: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` and `pnpm rgb:audit`.
- A RED brief that changes a public type also updates the fakes and fixtures that build it. New fields on shared types are optional unless a cycle says otherwise.
- Types that `bridge/` and `editor/` see are pure types from `core/` or service types from `session/`. No new file under `bridge/` or `editor/` imports `storage/`. If a lint exception looks needed, stop and ask.
- A script that plain `node` runs imports `core/` files through explicit `.ts` paths.
- Generated files that a test compares byte for byte are listed in `.prettierignore` with a comment.
- Each new component has a story. Story baselines are captured on CI.
- Shared configuration (`package.json` scripts, `.prettierignore`, `.gitignore`, `vite.config.ts`, `tsconfig.node.json`, `eslint.config.js`) changes only where a file fence names it.
- New decision records take the numbers assigned at dispatch and are checked against `origin/main` before landing. This branch ends at ADR-0230 and `origin/main` already has ADR-0231.

## File Structure

| Area                       | Files                                                                                                        | Responsibility                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `core/assets/`             | `catalog.ts`, `catalog-selection.ts`, `pack-version.ts`, `store-paths.ts`                                    | The catalog type and validator, the newest readable version, version order, store paths.                   |
| `core/assets/`             | `distribution-fields.ts`, `pack-manifest-shape.ts`, `license-moves.ts`, `license-facts.ts`                   | The four manifest fields, a typed manifest read, allowed license moves, license names and addresses.       |
| `core/assets/`             | `deployment-config.ts`, `library-item.ts`, `library-merge.ts`, `library-text.ts`                             | The deployment file, the three levels, the catalog name, the library item, one tile per hash, notice text. |
| `core/assets/`             | `item-availability.ts`, `media-signature.ts`, `cache-policy.ts`, `glb-extensions.ts`                         | Item states and labels, file signatures, the eviction plan, required extensions of a model.                |
| `core/assets/`             | `asset-credit.ts`, `attribution-text.ts`, `credit-line.ts`                                                   | The credit record, `ATTRIBUTIONS.md` text, the export credit line.                                         |
| `storage/assets/`          | `verified-fetch.ts`, `store-reader.ts`, `stored-packs-source.ts`                                             | Checked downloads, the store's four file kinds, a registry source over stored packs.                       |
| `storage/library-ledger/`  | `library-ledger.ts`, `memory-library-ledger.ts`, `indexeddb-library-ledger.ts`, `library-ledger-contract.ts` | Pack records, manifests, blob records, and kept documents.                                                 |
| `storage/deployment/`      | `read-deployment.ts`                                                                                         | Reads and keeps `deployment.json`.                                                                         |
| `storage/zip/`             | `read-pack-file.ts`, `archive-kind.ts`                                                                       | Reads a pack file as an untrusted archive and tells it from a project file.                                |
| `session/library/`         | `library-ports.ts`, `library-service.ts`, `catalog-sync.ts`, `download-queue.ts`, `project-assets.ts`        | The service, the list, the downloads.                                                                      |
| `session/library/`         | `pins.ts`, `storage-summary.ts`, `offline-job.ts`, `pack-import.ts`, `save-plan.ts`                          | Cache rules, the offline job, import, what a save embeds.                                                  |
| `bridge/react/`            | `library-service-context.ts`, `placeholder-tags.tsx`                                                         | The service for React, and the 3D tag.                                                                     |
| `editor/library/`          | `library-tile.tsx`, `library-item-detail.tsx`, `add-pack-dialog.tsx`, `pack-notice-dialog.tsx`               | Tiles, the detail panel, import.                                                                           |
| `editor/settings/`         | `settings-dialog.tsx`, `storage-settings.tsx`, `credits-settings.tsx`                                        | The Settings screen.                                                                                       |
| `editor/shell/`            | `save-file-dialog.tsx`                                                                                       | The save choice.                                                                                           |
| `engine/loaders/`          | `model-decoders.ts`                                                                                          | Loads each decoder when the first file needs it.                                                           |
| `scripts/pack/`            | `publish-store.mjs`, `mirror-store.mjs`, `reuse-toml.mjs`, `pack-zip.mjs`                                    | The new pack tool commands.                                                                                |
| `scripts/schema/`          | `build-asset-schemas.mjs`                                                                                    | The three schema families under `schema/`.                                                                 |
| `scripts/build/`           | `decoder-files.mjs`, `precache-list.mjs`                                                                     | Build plugins: the transcoder files and the precache list.                                                 |
| `core/assets/`             | `byte-size.ts`, `pack-manifest-file.ts`                                                                      | Size text, and the file types the schemas are generated from.                                              |
| `storage/`                 | `assets/fetch-pack-file.ts`, `service-worker/precache.ts`                                                    | A pack file from an address, and the precache.                                                             |
| `session/library/`, `app/` | `credits.ts`, `license-texts.ts`                                                                             | Credit groups, and the license texts the app ships.                                                        |
| Repository root            | `LICENSES/`, `REUSE.toml`, `docs/asset-store-deployment.md`                                                  | License texts, the starter set's license statement, the deployment guide.                                  |

## Pull request 1: the store contract and the publish step

Branch `feat/asset-store-contract-and-publish`. Depends on the texture assets plan.

**Goal.** The catalog, the store layout, the four manifest fields, and the license moves are defined in `core/`, and the pack tool writes a store that later tests read.

**What a user sees.** Nothing. A pack author gets `pnpm pack:publish` and new checks from `pnpm pack:validate`.

**File fence.**

- `core/assets/`: `catalog.ts`, `catalog-selection.ts`, `pack-version.ts`, `store-paths.ts`, `distribution-fields.ts`, `pack-manifest-shape.ts`, `license-moves.ts` (new, each with its test), `pack-manifest.ts`, `pack-manifest.test.ts`. `core/index.ts` (exports only).
- `scripts/pack/`: `publish-store.mjs`, `publish-store.test.mjs` (new), `pack-integrity.mjs`, `vernacular-pack.mjs`, `generate-fixtures.mjs`, their tests, and `starter/build-starter-pack.mjs` with its test.
- `public/packs/vernacular-starter-1.1.0/manifest.json` and its fixture copy (regenerated).
- `tests/fixtures/packs/example-furniture-1.0.0/` and `tests/fixtures/store/` (new, generated).
- Shared configuration: `package.json` (the `pack:publish` script), `.prettierignore` (`tests/fixtures/store/`).

**Interfaces.**

- Consumes: `validatePackManifest`, `PACK_FORMAT_VERSIONS`, `MEDIA_TYPE_EXTENSIONS`, `RECOGNIZED_LICENSES`, `isShareAlike`, the integrity reader port, `runPackCli(argv, deps)`.
- Produces:
  - `catalog.ts`: `CATALOG_VERSION = 1`; `CatalogPackEntry { packId, version, formatVersion, manifest: { sha256, byteLength }, byteLength, itemCount }`; `Catalog { catalogVersion: 1, name?: string, packs: CatalogPackEntry[] }`; `validateCatalog(value: unknown): CatalogValidation`, where `CatalogValidation` is `{ outcome: 'valid'; catalog: Catalog } | { outcome: 'newer-version' } | { outcome: 'invalid'; errors: string[] }`.
  - `pack-version.ts`: `comparePackVersions(a: string, b: string): number`.
  - `catalog-selection.ts`: `selectReadablePacks(catalog: Catalog, readableFormats: readonly number[]): { packs: CatalogPackEntry[]; skipped: number }`.
  - `store-paths.ts`: `CATALOG_FILE = 'catalog.json'`, `manifestPath(sha256)`, `blobPath(contentHash)`, `packTextPath(packId, version, file)`, with `PackTextFile = 'LICENSE' | 'NOTICE' | 'CHANGELOG.md'`.
  - `distribution-fields.ts`: `validateDistributionFields(asset, label, errors)`, the shape of `validateTextureFields`.
  - `pack-manifest-shape.ts`: `ReadablePackAsset`, `ReadablePackManifest` (with `formatVersion`, 1 when the file has none), `readPackManifest(value: unknown): ReadablePackManifest | undefined`, `namedFiles(asset: ReadablePackAsset): readonly { contentHash: string; byteLength?: number }[]`.
  - `license-moves.ts`: `isAllowedLicenseMove(from: string, to: string): boolean`, `mostPermissiveLicense(licenses: readonly string[]): string`.
  - `publish-store.mjs`: `publishPack(request, io)`, with `request = { packDir, storeDir, name? }` and `io` an in-memory or disk file sink.

### Cycles

- [ ] **Cycle 1.** `core/assets/catalog.test.ts`: "validates the catalog of the specification and tells a newer catalog version from an invalid file". Setup: the example of the specification. Assert `outcome: 'valid'`, two packs, the first with `formatVersion` 2 and `manifest.byteLength` 1836. `catalogVersion: 2` gives `newer-version`. One `invalid` error each, naming the path (for example `packs[0].manifest.sha256`), for: no `packs`, a hash of 63 characters, an upper-case hash, a negative `byteLength`, an `itemCount` of 1.5, no `formatVersion`. Unknown fields are ignored, and `$schema` and `name` are optional. Fails today: no validator. Implementation: `catalog.ts`.
- [ ] **Cycle 2.** `core/assets/pack-version.test.ts`: "orders versions by Semantic Versioning 2.0.0 precedence". Assert `1.0.0 < 1.1.0 < 1.10.0`, `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-beta < 1.0.0`, and `1.0.0+build` equal to `1.0.0`. Fails today: no comparison exists in the repository. Implementation: `pack-version.ts`.
- [ ] **Cycle 3.** `core/assets/catalog-selection.test.ts`: "lists the newest readable version of each pack and counts the entries it skipped". Setup: `vernacular-starter` 1.1.0 (format 2) and 1.0.0 (format 1), `parlor-furniture` 2.0.0 (format 9) and 1.2.0 (format 2), `garden` 1.0.0 (format 9), with `readableFormats` `[1, 2]`. Assert the packs are starter 1.1.0 and parlor 1.2.0, and `skipped` is 2. Fails today: no function. Implementation: `catalog-selection.ts`.
- [ ] **Cycle 4.** `core/assets/pack-manifest.test.ts`: "accepts the four optional distribution fields and refuses malformed ones". Setup: the example asset of the specification in a format 2 manifest. Assert valid. One error each, labelled `assets[0].byteLength`, `assets[0].thumbnail.contentHash`, `assets[0].thumbnail.byteLength`, `assets[0].copyright`, `assets[0].changes`, for: `byteLength` of 0, 1.5, and `'12'`; a thumbnail hash of 63 characters; a thumbnail with no `byteLength`; an empty `copyright`; a numeric `changes`. A format 1 manifest with the fields stays valid. Fails today: the fields are ignored. Implementation: `distribution-fields.ts`, called from `pack-manifest.ts`.
- [ ] **Cycle 5.** `core/assets/pack-manifest-shape.test.ts`: "reads a valid manifest into typed assets and gives nothing for an invalid one". Assert the example reads with `byteLength` 19512 and `thumbnail.byteLength` 4096, a manifest with no `formatVersion` reads as format 1, and an invalid manifest gives `undefined`. `namedFiles` of the example gives the model's pair and the thumbnail's pair, and of an asset with no thumbnail gives one pair. Fails today: no exported manifest type. Implementation: `pack-manifest-shape.ts`.
- [ ] **Cycle 6.** `core/assets/license-moves.test.ts`: "a license move may only grant more rights". Allowed: a license to itself, `CC-BY-4.0` to `CC0-1.0`, `MIT` to `CC0-1.0`, `CC-BY-SA-4.0` to `CC-BY-4.0`, `CC-BY-SA-3.0` to `CC-BY-3.0`. Refused: `CC0-1.0` to `CC-BY-4.0`, `CC-BY-SA-4.0` to `CC-BY-3.0`, `CC-BY-4.0` to `CC-BY-SA-4.0`, `CC-BY-4.0` to `MIT`, `CC-BY-3.0` to `CC-BY-4.0`. `mostPermissiveLicense(['CC-BY-SA-4.0', 'CC-BY-4.0'])` is `CC-BY-4.0`, with `CC0-1.0` added it is `CC0-1.0`, and two unrelated licenses give the first. Fails today: no module. Implementation: `license-moves.ts`.
- [ ] **Cycle 7.** `scripts/pack/pack-integrity.test.mjs`: "a stated length and thumbnail hash must match the files". Assert one error each when `byteLength` differs from the file's size, when `thumbnail.contentHash` differs from the sha256 of `thumbnails/<asset hash>.webp`, and when `thumbnail.byteLength` differs from its size. Equal values and absent fields pass. Fails today: the fields are not read. Implementation: `pack-integrity.mjs`.
- [ ] **Cycle 8.** `scripts/pack/starter/build-starter-pack.test.mjs`: "starter pack 1.1.0 states each file's length, the chair's thumbnail hash, and the copyright, and the committed tree is the builder's output". Assert each asset's `byteLength` is its file's size, the chair's `thumbnail` matches its file, the grass has no `thumbnail`, and both assets carry `copyright: 'Copyright 2026 The Vernacular Contributors'`. Fails today: the builder writes none of the fields. Implementation: `build-starter-pack.mjs`, then `pnpm pack:starter`. No asset hash changes.
- [ ] **Cycle 9.** `scripts/pack/publish-store.test.mjs`: "publishing a pack writes each file under its hash, the manifest under its hash, the three text files, and a catalog entry, in that order". Setup: the `example-furniture-1.0.0` fixture and an in-memory sink. Assert the paths of `store-paths.ts`; the manifest bytes equal `manifest.json` byte for byte; the entry's `byteLength` is the sum over `namedFiles` of every asset and `itemCount` is 3; the catalog has `catalogVersion: 1` and the `$schema` of the specification, sorted by pack id and then newest version first; `catalog.json` is the last write, after blobs, then manifests, then text files. Fails today: no publish step. Implementation: `publish-store.mjs`. The fixture pack is new in this commit: format 2, attribution "Jane Roe", "Example sofa" (CC0-1.0, the bytes of `e2e/fixtures/cube.glb`), "Example lamp" (CC-BY-4.0, with `copyright` and `sourceUrl`), "Example settee" (CC-BY-SA-4.0, with `changes`).
- [ ] **Cycle 10.** "two versions that share a file store one blob, and publishing a version again changes nothing". Setup: publish the starter fixtures 1.0.0 and 1.1.0, then 1.1.0 again. Assert the format 1 pack publishes with neither field, one blob per distinct hash, and a sink equal to the one before the third publish. Fails today: an existing entry is added twice. Implementation: `publish-store.mjs`.
- [ ] **Cycle 11.** "publish refuses a pack it must not publish, and writes nothing". Three cases, each with an untouched sink and an error that names the asset: a format 2 pack with no `byteLength`, or with a model that has no `thumbnail` field; a version already in the catalog with another manifest hash; a hash the store lists under `CC0-1.0` that the new version lists under `CC-BY-4.0`. The reverse move publishes. Fails today: none is checked. Implementation: `publish-store.mjs` with `isAllowedLicenseMove`, reading every manifest the catalog lists.
- [ ] **Cycle 12.** `scripts/pack/vernacular-pack.test.mjs`: "the publish command validates the pack, publishes it, and exits non-zero on a refusal". Assert `runPackCli(['publish', dir, '--store', out], deps)` returns the valid exit code and calls the publish once, an invalid pack never reaches it, and a missing `--store` prints the usage. Fails today: `publish` is not a command. Implementation: one branch in `runPackCli`, and the `pack:publish` script.
- [ ] **Cycle 13.** `scripts/pack/generate-fixtures.test.mjs`: "the committed fixture store is the publish of the fixture packs". Assert `tests/fixtures/store/` equals the publish of starter 1.0.0, starter 1.1.0, and `example-furniture-1.0.0` with the name "Example Library", file by file. Fails today: no fixture store. Implementation: `generate-fixtures.mjs` writes it, and `.prettierignore` gains the folder.

**What it leaves.** The app reads none of it yet.

## Pull request 2: the verified fetch, the store reader, and the library ledger

Branch `feat/verified-store-reader`. Depends on pull request 1.

**Goal.** `storage/` can read a store with every file checked, and can keep what it read.

**What a user sees.** Nothing.

**File fence.** `storage/assets/verified-fetch.ts`, `storage/assets/store-reader.ts`, `storage/library-ledger/` (four files), their tests; `storage/asset-cache.ts`, `storage/directory-asset-cache.ts`, every other `AssetCache` that `createDefaultProjectStorage()` can return, `storage/project-storage.ts`, their tests and fakes; `storage/index.ts` (exports only).

**Interfaces.**

- Consumes: `contentHashOf(bytes)`, `validateCatalog`, `readPackManifest`, `manifestPath`, `blobPath`, `packTextPath`, `CatalogPackEntry`.
- Produces:
  - `verified-fetch.ts`: `UNDECLARED_BLOB_LIMIT_BYTES = 67_108_864`; `VerifiedRequest { url: string; sha256: string; maxBytes?: number; onProgress?: (receivedBytes: number) => void; signal?: AbortSignal }`; `VerifiedFetchResult` is `{ outcome: 'ok'; bytes: Uint8Array } | { outcome: 'mismatch' } | { outcome: 'too-long' } | { outcome: 'absent' } | { outcome: 'unreachable' }`; `fetchVerified(fetchFn: typeof fetch, request: VerifiedRequest): Promise<VerifiedFetchResult>`.
  - `store-reader.ts`: `createStoreReader(address: string, fetchFn: typeof fetch): StoreReader`, with `catalog(): Promise<CatalogRead>`, `manifest(entry: CatalogPackEntry): Promise<ManifestRead>`, `blob(contentHash: string, options?: { maxBytes?: number; onProgress?: (receivedBytes: number) => void }): Promise<VerifiedFetchResult>`, and `packText(packId, version, file): Promise<string | undefined>`. `CatalogRead` is `{ outcome: 'ok'; catalog: Catalog } | { outcome: 'newer-version' } | { outcome: 'invalid' } | { outcome: 'unreachable' }`. `ManifestRead` is `{ outcome: 'ok'; manifest: ReadablePackManifest; bytes: Uint8Array } | { outcome: 'rejected' } | { outcome: 'unreachable' }`.
  - `library-ledger.ts`: `PackOrigin = 'catalog' | 'imported'`; `StoredPackRecord { packId, version, formatVersion, manifestHash, origin, from, addedAt }`; `BlobRecord { contentHash, byteLength, lastUsedAt, resuppliable: boolean, kind: 'asset' | 'thumbnail' }`; `LedgerDocumentName = 'catalog' | 'deployment' | 'offline-job'`; `LibraryLedger` with `packs()`, `putPack(record, manifestBytes)`, `removePack(packId, version)`, `manifest(manifestHash)`, `packNotice(packId, version)`, `putPackNotice(packId, version, text)`, `blobs()`, `putBlob(record)`, `touchBlob(contentHash, usedAt)`, `removeBlob(contentHash)`, `document(name)`, `putDocument(name, value)`. Every method returns a promise.
  - `asset-cache.ts`: `RemovableAssetCache extends AssetCache { delete(contentHash: string): Promise<void> }`. `ProjectStorage.assets` takes this type.

### Cycles

- [ ] **Cycle 1.** `storage/assets/verified-fetch.test.ts`: "returns the bytes when their sha256 is the expected hash, and asks with no credentials and no referrer". Assert `outcome: 'ok'` with the bytes; the request init has `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, and `mode: 'cors'`; the address is passed unchanged; `onProgress` receives the running byte count. Fails today: no module. Implementation: `verified-fetch.ts`.
- [ ] **Cycle 2.** "a mismatch is tried once more past the HTTP cache, and a second mismatch gives no bytes". Assert wrong then right bytes give `ok` and the second init has `cache: 'reload'`; wrong twice gives `mismatch` after exactly 2 requests. Fails today: no retry. Implementation: `verified-fetch.ts`.
- [ ] **Cycle 3.** "a response longer than the declared length is cut off and never hashed". Assert `maxBytes: 10` with an 11-byte body in two chunks gives `too-long`, cancels the body, and makes 1 request; a `Content-Length` of 11 gives `too-long` before the body is read; with no `maxBytes` the limit is `UNDECLARED_BLOB_LIMIT_BYTES`. Fails today: no limit. Implementation: `verified-fetch.ts`.
- [ ] **Cycle 4.** "tells a lost connection from a file the host does not have". Assert a rejected fetch and a status of 503 give `unreachable`, statuses 404 and 410 give `absent`, and an aborted signal gives `unreachable`. Fails today: no such outcomes. Implementation: `verified-fetch.ts`.
- [ ] **Cycle 5.** `storage/assets/store-reader.test.ts`: "reads catalog.json with revalidation and reports valid, newer, invalid, and unreachable". Assert the address is `<address>catalog.json` whether or not the address ends in a slash, and the init has `cache: 'no-cache'` and the fields of cycle 1. A status 200 body that is an HTML page gives `invalid` (Review Focus 1), as does valid JSON that fails `validateCatalog`. A body past 4 MiB (4,194,304 bytes) gives `invalid`. Fails today: no reader. Implementation: `store-reader.ts`.
- [ ] **Cycle 6.** "fetches a manifest from its hash path, checks it against the catalog entry, and validates it". Assert the address is `manifests/sha256/<sha256>.json` with `maxBytes` equal to `entry.manifest.byteLength`. `rejected` for: bytes with another hash, a manifest with a license outside the allowlist, and a manifest whose `packId` or `version` differs from the entry. Fails today: no reader. Implementation: `store-reader.ts`.
- [ ] **Cycle 7.** "fetches a blob from blobs/sha256 and a text file from packs/". Assert the blob address has no extension and no query, and passes `maxBytes` and `onProgress` on. `packText('parlor-furniture', '1.2.0', 'NOTICE')` reads `packs/parlor-furniture-1.2.0/NOTICE`, and gives `undefined` for a 404. Fails today: no reader. Implementation: `store-reader.ts`.
- [ ] **Cycle 8.** `storage/library-ledger/memory-library-ledger.test.ts`, through `library-ledger-contract.ts`: "keeps pack records with their manifest bytes, blob records, pack notices, and named documents". Assert a pack put twice with one id and version leaves one record, `manifest(hash)` returns the bytes, `removePack` removes the record and its notice, `touchBlob` moves `lastUsedAt` only, `removeBlob` removes one record, and a document reads back equal. Fails today: no ledger. Implementation: the port and the memory ledger.
- [ ] **Cycle 9.** `storage/library-ledger/indexeddb-library-ledger.test.ts`: "the IndexedDB ledger passes the contract, survives a reopen, and falls back to memory when IndexedDB is absent". The database is `vernacular-library`, version 1. Fails today: no implementation. Implementation: `indexeddb-library-ledger.ts`, after the pattern of `storage/project-index/`.
- [ ] **Cycle 10.** `storage/directory-asset-cache.test.ts`: "delete removes a cached blob, and a later get finds nothing". Assert the same for each other cache implementation, and that deleting an absent hash does not throw. Fails today: no `delete`. Implementation: `RemovableAssetCache` and each cache.

**What it leaves.** Nothing calls the reader or the ledger yet.

## Pull request 3: the deployment setting and the catalog library service

Branch `feat/catalog-library-service`. Depends on pull request 2.

**Goal.** The app knows where its catalog is, and one library service lists the starter set, the catalog, and the user's models as one list.

**What a user sees.** With a catalog set, the library panel lists the catalog's items, with today's tiles. With none, the app is as today and makes no asset request. The project's own build sets no catalog.

**File fence.**

- `core/assets/`: `deployment-config.ts`, `library-item.ts`, `library-merge.ts`, `library-text.ts` (new, with tests). `core/index.ts`.
- `storage/`: `assets/asset-source.ts` (re-exports `LibraryItem` from `core/`), `assets/pack-source.ts`, `assets/stored-packs-source.ts` (new), `assets/asset-registry.ts`, `deployment/read-deployment.ts` (new), their tests, `storage/index.ts`.
- `session/library/`: `library-ports.ts`, `library-service.ts`, `catalog-sync.ts` (new, with tests), `session/index.ts`, `session/testing/index.ts` (a fake `LibraryPorts`).
- `bridge/react/library-service-context.ts` (new), `bridge/index.ts`.
- `app/`: `create-asset-library-registry.ts`, `build-catalog-setting.ts`, `browser-connectivity.ts` (new), `app-settings.tsx`, the boot file that calls `createAssetLibrary`, their tests. `src/vite-env.d.ts` (types for the two build values).
- `editor/library/library-panel.tsx`, `editor/library/library-test-support.ts`, their tests (the list comes from the service).
- `e2e/tests/library-store-support.ts`, `e2e/tests/library-catalog.spec.ts` (new).

**Interfaces.**

- Consumes: `StoreReader`, `LibraryLedger`, `RemovableAssetCache`, `selectReadablePacks`, `comparePackVersions`, `readPackManifest`, `createStarterPackSource(fetch)`, `SettingsService`.
- Produces:
  - `deployment-config.ts`: `CATALOG_NAME_MAX_LENGTH = 40`; `CatalogSetting { url: string; name?: string }`; `validateDeployment(value: unknown): DeploymentValidation`, which is `{ outcome: 'valid'; catalog: CatalogSetting | null | undefined } | { outcome: 'newer-version' } | { outcome: 'invalid' }`; `CatalogLevels { userAddress?: string; deployment?: { catalog: CatalogSetting | null | undefined }; build?: CatalogSetting }`; `CatalogChoice { url: string; name?: string; source: 'user' | 'deployment' | 'build' }`; `chooseCatalog(levels: CatalogLevels): CatalogChoice | undefined`; `normalizeCatalogAddress(input: string, appOrigin: string): string | undefined`; `catalogDisplayName(choice: CatalogChoice | undefined, catalogFileName?: string): string`.
  - `library-item.ts`: `LibraryItem` (moved here) with new optional fields `license`, `attribution`, `copyright`, `changes`, `sourceUrl`, `shareAlike: boolean`, `byteLength`, `thumbnailBlob: { contentHash; byteLength }`, and `origin: LibraryOrigin`, which is `{ kind: 'yours' } | { kind: 'added'; packId: string; attribution: string } | { kind: 'catalog' } | { kind: 'starter' }`. `libraryItemFromAsset(asset: ReadablePackAsset, context: { scope: string; origin: LibraryOrigin }): LibraryItem`.
  - `library-merge.ts`: `mergeLibraryItems(groups: { yours; added; catalog; starter }): LibraryItem[]`, each group a `readonly LibraryItem[]`; `selectListedVersions(records: readonly { packId; version; formatVersion; origin }[], readableFormats): typeof records`.
  - `library-text.ts`: `LIBRARY_NOTICE_TEXT`, keyed by `LibraryNotice = 'newer-app-available' | 'more-items-in-newer-app' | 'connect-for-full-library'`, and `BUILT_IN_LABEL = 'Built in'`.
  - `asset-registry.ts`: `AssetRegistryOptions.fallback?: (reference: AssetReference) => Promise<AssetResolution | undefined>`.
  - `stored-packs-source.ts`: `StoredPacksSource implements AssetSource`, built from `{ ledger, blobs, currentAddress: () => string | undefined }`.
  - `read-deployment.ts`: `readDeployment(fetchFn, request: { baseUrl: string; ledger: LibraryLedger }): Promise<{ catalog: CatalogSetting | null | undefined } | undefined>`.
  - `library-ports.ts`: `LibraryPorts { ledger; blobs; store: (address: string) => StoreReader; starter: AssetSource; yours: AssetSource; index: ProjectIndex; connectivity: Connectivity; now: () => Date }`, with `Connectivity { isOnline(): boolean; onOnline(listener: () => void): () => void }`.
  - `library-service.ts`: `createLibraryService(ports: LibraryPorts): LibraryService`. `LibraryService` has `snapshot(): LibrarySnapshot`, `subscribe(listener): () => void`, `start(choice: CatalogChoice | undefined): Promise<void>`, and `refresh(reason: 'opened' | 'online'): Promise<void>`. `LibrarySnapshot { items: readonly LibraryItem[]; catalog: { address: string; name: string } | undefined; sourceLabel: string; notices: readonly LibraryNotice[]; online: boolean }`. Later pull requests add members and do not rename these.
  - `library-service-context.ts`: `LibraryServiceProvider`, `useLibraryService()`, `useLibrarySnapshot()`.
  - `create-asset-library-registry.ts`: `createAssetLibrary(deps: { assets: RemovableAssetCache; ledger: LibraryLedger; fetchFn: typeof fetch })` returns `{ registry, userSource, library }`. `LIBRARY_ADDRESS_KEY`, a `SettingKey<string>` named `library.address` with the default `''`.

### Cycles

- [ ] **Cycle 1.** `core/assets/deployment-config.test.ts`: "validates deployment.json: version 1 or none, and a catalog with an address and an optional name, or null". Assert the example is valid; no `deploymentVersion` is valid; `catalog: null` gives `null`; no `catalog` key gives `undefined`; `deploymentVersion: 2` gives `newer-version`; a numeric `catalog.url` gives `invalid`. Fails today: no module. Implementation: `deployment-config.ts`.
- [ ] **Cycle 2.** "the first level with a value wins, and null in the deployment file turns the build default off". A table: the user's address beats both and has the source `user`; the deployment beats the build; deployment `null` with a build value gives `undefined`; deployment `null` with a user address gives the user's; a deployment file with no `catalog` and a build value gives the build's; nothing gives `undefined`. Fails today: no function. Implementation: `chooseCatalog`.
- [ ] **Cycle 3.** "normalizes a catalog address and refuses one that could carry a secret or leave HTTPS". Assert `https://assets.example.org` becomes `https://assets.example.org/`, `/test-store` becomes `<appOrigin>/test-store/`, and `http://localhost:4173/store/` is kept. `undefined` for `http://assets.example.org/`, an address with a user name, with `?a=1`, with `#part`, `ftp://x.org/`, and an empty string. Fails today: no function. Implementation: `normalizeCatalogAddress`.
- [ ] **Cycle 4.** "names the catalog from the deployment setting, then catalog.json, then the host, cut at 40 characters". Assert a deployment name wins; a user address ignores the deployment's name and takes the `name` of `catalog.json`, then `assets.example.org`; a name of 41 characters gives its first 40; no catalog gives "Built in". Fails today: no function. Implementation: `catalogDisplayName`.
- [ ] **Cycle 5.** `core/assets/library-merge.test.ts`: "one tile for each content hash, from the first source in the order yours, added, catalog, starter". Setup: one hash in all four groups and one in the last two. Assert two items, with the origins `yours` and `catalog`. Fails today: no function. Implementation: `mergeLibraryItems`.
- [ ] **Cycle 6.** "a pack id is listed in its newest readable version, across the starter set and the catalog". Assert a bundled `vernacular-starter` 1.1.0 and a catalog 1.2.0 list only 1.2.0, equal versions list the catalog's, and an added `parlor-furniture` 1.2.0 beside 1.1.0 lists 1.2.0. Fails today: no function. Implementation: `selectListedVersions`.
- [ ] **Cycle 7.** `storage/assets/stored-packs-source.test.ts`: "lists the items of stored packs with their license, attribution, copyright, changes, source link, origin, share-alike flag, size, and thumbnail hash". Setup: a ledger with the fixture manifests. Assert the settee has `shareAlike: true` and its `changes`; the lamp has `sourceUrl` and `copyright`; a format 1 item has no `thumbnailBlob`; a texture is not listed; `read(hash)` returns the pool's bytes; `describe(hash)` comes from the manifest. `PackSource` gives the starter chair the same fields with the origin `starter`. Fails today: no source, and `LibraryItem` has none of the fields. Implementation: `library-item.ts`, `stored-packs-source.ts`, `pack-source.ts`.
- [ ] **Cycle 8.** `storage/assets/asset-registry.test.ts`: "when no source on the device holds the hash, resolve asks the fallback once and returns its answer". Assert the fallback is not asked when a source has the bytes, is asked once otherwise, and that `undefined` from it gives today's missing result. With no fallback the registry behaves as today. Fails today: no option. Implementation: `asset-registry.ts`.
- [ ] **Cycle 9.** `session/library/catalog-sync.test.ts`: "at start the library lists the starter set and the kept catalog with no network, then updates from the store". Setup: a ledger with a kept catalog and its manifests, and a store whose catalog adds one pack. Assert the first snapshot holds the starter and kept items before any store call resolves; then exactly 1 `manifest` call; the new pack is stored with the origin `catalog` and `from` equal to the address; the catalog document is replaced; listeners are told. Fails today: no service. Implementation: `library-service.ts`, `catalog-sync.ts`.
- [ ] **Cycle 10.** "only packs from the current address are listed, and with no catalog the service asks no store". Assert that after `start` with another address the old address's items are gone from `items` while their ledger records and blobs remain (Review Focus 4); with `undefined` the `store` factory is never called, `catalog` is `undefined`, `sourceLabel` is "Built in", and the list holds the starter set and the user's models. Fails today: no service. Implementation: `catalog-sync.ts`.
- [ ] **Cycle 11.** "each catalog failure has its notice and never empties the library". Assert `newer-version` keeps the kept catalog's items and adds `newer-app-available` ("A newer version of this app is available. Reload to update."); a skipped entry adds `more-items-in-newer-app` ("More items are available in a newer version of this app."); `unreachable` with no kept catalog adds `connect-for-full-library` ("Connect to the internet to see the full library."); `invalid` keeps the kept catalog and adds none; a `rejected` manifest leaves that pack out and lists the others. Fails today: no service. Implementation: `catalog-sync.ts`, `library-text.ts`.
- [ ] **Cycle 12.** "the catalog is fetched again when the connection returns, and on opening the library only after an hour". Assert `refresh('opened')` within 3,600,000 ms of the last fetch asks nothing, after it asks once, and the `onOnline` listener asks at once. Fails today: no refresh. Implementation: `catalog-sync.ts`.
- [ ] **Cycle 13.** `storage/deployment/read-deployment.test.ts`: "reads deployment.json beside index.html with revalidation, keeps the last copy for an offline start, and treats a missing file as normal". Assert the address is `deployment.json` resolved against `baseUrl`, with `cache: 'no-cache'`; a 404 gives `undefined` and clears the kept copy; a rejected fetch gives the kept copy; a status 200 HTML body gives `undefined` and keeps the kept copy unchanged (Review Focus 1); `deploymentVersion: 2` is treated as a missing file. Fails today: no reader. Implementation: `read-deployment.ts`, with the ledger document `deployment`.
- [ ] **Cycle 14.** `app/create-asset-library-registry.test.ts`: "the registry lists the user's models, then stored packs, then the starter set, and the service is started with the chosen catalog". Setup: a fake fetch that serves `tests/fixtures/store/` and a `deployment.json`. Assert `library.snapshot().items` names "Example sofa", and `registry.list()` holds it. With `VITE_CATALOG_URL` unset and no file, no request names `catalog.json`. Fails today: `createAssetLibrary(assets)` knows one pack. Implementation: the `app/` files of the fence. `build-catalog-setting.ts` reads `import.meta.env.VITE_CATALOG_URL` and `VITE_CATALOG_NAME`.
- [ ] **Cycle 15.** `editor/library/library-panel.test.tsx`: "the panel lists the items of the library service and reads again when the service changes". Assert a service fake with two items shows two tiles, and a third after a change. Fails today: the panel reads `registry.list()`. Implementation: `library-panel.tsx`, `library-service-context.ts`, and the retrofit of `library-test-support.ts`.

After the cycles, one `test(e2e):` commit: `library-store-support.ts` exports `serveFixtureStore(page, options?)`, which answers `**/deployment.json` and `**/test-store/**` from `tests/fixtures/store/` and counts requests. `library-catalog.spec.ts` asserts the panel lists "Example sofa" with the store, and that no request names `catalog.json` without it.

**What it leaves.** A catalog item can be placed, but its model does not download yet, so it draws as a box. Tiles show no picture.

## Pull request 4: download on demand and labelled placeholders

Branch `feat/library-download-on-demand`. Depends on pull request 3.

**Goal.** A library file downloads the first time it is used, is checked, and stays on the device. A piece whose model is not there says why.

**What a user sees.** A placed catalog piece shows its box at once and its model when the download ends. With no connection the piece carries "Will download when you are online" and loads by itself later. Opening a project downloads what it lacks, with no prompt.

**File fence.**

- `core/assets/item-availability.ts`, `core/assets/media-signature.ts` (new, with tests), `core/index.ts`.
- `storage/library-ledger/library-ledger.ts` (one optional field), `storage/assets/stored-packs-source.ts`, their tests.
- `session/library/download-queue.ts`, `session/library/project-assets.ts` (new, with tests), `session/library/library-service.ts`.
- `bridge/react/furniture-model-cache.ts`, `bridge/react/use-furniture-model-cache.ts`, `bridge/react/placeholder-tags.tsx` (new), `bridge/react/scene-proxies.tsx`, their tests.
- `editor/plan/draw-furniture.ts`, `editor/plan/drawable-furniture.ts`, their tests.
- `app/create-asset-library-registry.ts`, `app/asset-report-text.ts`, `app/use-open-file-action.ts`, their tests.

**Interfaces.**

- Consumes: `StoreReader.blob`, `LibraryLedger`, `RemovableAssetCache`, `AssetRegistryOptions.fallback`, `resolvedAsset(bytes, resolvedScope)`, `Connectivity`, `entityScreenPositions`.
- Produces:
  - `item-availability.ts`: `ItemAvailability`, a union on `state`: `'on-device'`, `'not-downloaded'`, `'downloading'` (with `receivedBytes` and an optional `totalBytes`), `'waiting-for-connection'`, `'unchecked'`, `'not-included'`, `'needs-newer-app'`, `'storage-full'`. `placeholderLabel(availability: ItemAvailability): string | undefined`. `downloadPercent(availability: ItemAvailability): number | undefined`.
  - `media-signature.ts`: `sniffMediaType(bytes: Uint8Array): MediaType | undefined`.
  - `BlobRecord.mediaType?: MediaType`, written for a blob no manifest lists.
  - `download-queue.ts`: `MAX_PARALLEL_DOWNLOADS = 4`.
  - `LibraryService` gains `ensure(reference: AssetReference): Promise<AssetResolution | undefined>`, `availability(contentHash: string): ItemAvailability`, `retry(contentHash: string): void`, `thumbnail(item: LibraryItem): Promise<Uint8Array | undefined>`, and `ensureProject(references: readonly AssetReference[]): Promise<ProjectAssetReport>`. `LibrarySnapshot` gains `availability: ReadonlyMap<string, ItemAvailability>` and the notice `'item-not-used'`.
  - `project-assets.ts`: `ProjectAssetReport { waitingForConnection: number; unchecked: number; notIncluded: number; needsNewerApp: number }`.
  - `FurnitureModelCache.retry(contentHash: string): void`.
  - `asset-report-text.ts`: `openPlaceholderNoticeText(report: ProjectAssetReport): string | undefined`.

### Cycles

- [ ] **Cycle 1.** `core/assets/item-availability.test.ts`: "each state that leaves a placeholder has its label". Assert "Downloading", "Will download when you are online", "Could not be checked", "Not included in this file", "Needs a newer version of this app", and "No space on this device" for `storage-full`; `on-device` and `not-downloaded` give none; 380 of 1,000 bytes is 38, and no `totalBytes` gives no percent. Fails today: no module. Implementation: `item-availability.ts`.
- [ ] **Cycle 2.** `core/assets/media-signature.test.ts`: "names a file's type from its first bytes". Assert the bytes of `e2e/fixtures/cube.glb` give `model/gltf-binary`, a PNG header `image/png`, a WebP header `image/webp`, and an HTML page nothing. Fails today: no module. Implementation: `media-signature.ts`.
- [ ] **Cycle 3.** `session/library/download-queue.test.ts`: "ensure downloads a file by its hash, keeps it, and answers the reference". Setup: the fixture catalog started, an empty pool. Assert 1 `blob` call with `maxBytes` equal to the manifest's `byteLength`; the state goes `not-downloaded`, `downloading`, `on-device`; the pool holds the bytes; the ledger has a blob record with `resuppliable: true` and the kind `asset`; the answer is a resolved asset in the reference's scope. Two calls for one hash share 1 request, and a later call makes none. Fails today: no queue. Implementation: `download-queue.ts`.
- [ ] **Cycle 4.** "a file that fails its check is not kept and not used". Assert `mismatch` leaves the pool and the ledger unchanged, the state `unchecked`, the answer `undefined`, and the notice `item-not-used` ("This item did not download correctly, so it was not used."). `retry(hash)` asks again, and good bytes give `on-device`. `too-long` is handled the same way. Fails today: no queue. Implementation: `download-queue.ts`.
- [ ] **Cycle 5.** "with no connection the item waits and downloads when the connection returns". Assert that offline, no `blob` call is made and the state is `waiting-for-connection`; `unreachable` gives the same state; the `onOnline` listener starts every waiting download once. Fails today: no queue. Implementation: `download-queue.ts`.
- [ ] **Cycle 6.** "at most 4 downloads run at once". Setup: 6 `ensure` calls over a store whose blobs resolve by hand. Assert 4 calls in flight, and a fifth only after one settles. Fails today: no limit. Implementation: `download-queue.ts`.
- [ ] **Cycle 7.** "a hash no manifest lists is asked from the store and kept only when it is a model or texture type". Assert the bytes of `cube.glb` are kept with `mediaType: 'model/gltf-binary'` on the blob record; an HTML body that matches its hash is not kept and gives `not-included`; `absent` gives `not-included`; with no catalog no request is made and the state is `not-included`. Fails today: no queue. Implementation: `download-queue.ts`, `stored-packs-source.ts` (`describe` falls back to the record).
- [ ] **Cycle 8.** "bytes are not used when the catalog lists the exact pack version in a format this app cannot read". Setup: a reference `pack:garden@1.0.0`, a catalog entry for it in format 9, and no readable manifest with the hash. Assert no `blob` call and the state `needs-newer-app`. When a readable manifest lists the hash, the file downloads. Fails today: no guard. Implementation: `download-queue.ts`.
- [ ] **Cycle 9.** "a thumbnail is read from the device or downloaded and checked under its own hash". Assert `thumbnail(item)` asks `blob(item.thumbnailBlob.contentHash)` once and records the kind `thumbnail`; a second call makes no request; a starter item reads through `readThumbnail`; an item with no `thumbnailBlob` gives `undefined` with no request. Fails today: no method. Implementation: `library-service.ts`.
- [ ] **Cycle 10.** `app/create-asset-library-registry.test.ts`: "resolving a model or a texture that is not on the device downloads it through the library service". Assert `registry.resolve` of "Example sofa" and of the starter grass under a catalog scope each make 1 blob request and resolve, and a second resolve makes none. Fails today: no fallback is wired. Implementation: `fallback: (reference) => library.ensure(reference)`.
- [ ] **Cycle 11.** `bridge/react/use-furniture-model-cache.test.tsx`: "a model that failed to load loads again when the library reports its hash on the device". Setup: a structural fake registry and a service fake. Assert the status goes `failed`, then `loading`, then `ready` after the fake reports `on-device`. Fails today: a failed entry stays failed. Implementation: `FurnitureModelCache.retry`, and a subscription in the hook.
- [ ] **Cycle 12.** `bridge/react/placeholder-tags.test.tsx`: "a placed piece whose model is not on the device carries its label at its screen position". Assert a tag with "Will download when you are online" for a waiting hash, "Downloading" while it downloads, and none once it is on the device. Fails today: no component. Implementation: `placeholder-tags.tsx`, mounted in `scene-proxies.tsx`. `FurnitureBuildKind` does not change.
- [ ] **Cycle 13.** `editor/plan/draw-furniture.test.ts`: "a piece without its model draws a dashed outline with its name and its state label". Assert the dash, the name, and the label for a `DrawableFurniture` with `placeholderLabel`, and today's drawing without it. Fails today: no such field. Implementation: `draw-furniture.ts`, `drawable-furniture.ts`.
- [ ] **Cycle 14.** `app/use-open-file-action-asset-report.test.ts`: "opening a project downloads what it lacks with no prompt, and one notice gives the count and the reason for the rest". Assert `ensureProject` is called with the project's references; a project whose files all arrive shows no notice; the report `{ waitingForConnection: 3 }` gives "3 items will download when you are online."; `notIncluded: 2` gives "2 items are not included in this file."; `needsNewerApp: 1` gives "1 item needs a newer version of this app."; `unchecked: 1` gives "1 item could not be checked."; two reasons give one notice with both sentences. `importMissingAssetsText` is no longer called for a library reference. Fails today: every unsupplied hash is counted as missing. Implementation: `project-assets.ts`, `asset-report-text.ts`, `use-open-file-action.ts`.

**What it leaves.** Tiles still show no picture and no state. Nothing is ever evicted.

## Pull request 5: the library panel

Branch `feat/library-tiles-and-filters`. Depends on pull request 4.

**Goal.** The panel shows one library: pictures, states, filters, and a detail panel with the credit.

**What a user sees.** Tiles with thumbnails, a source filter (All, the catalog's name, Added, Yours), a license filter, a "Share-alike" label, a percent while a file downloads, and a detail panel.

**File fence.** `core/assets/byte-size.ts` (new, with test); `editor/library/library-filter.ts`, `library-panel.tsx`, `library-tile.tsx` (new), `library-item-detail.tsx` (new), `library-test-support.ts`, their tests and stories; `e2e/tests/library-download.spec.ts` (new).

**Interfaces.**

- Consumes: `LibrarySnapshot`, `LibraryService.thumbnail`, `retry`, `ItemAvailability`, `downloadPercent`, `LIBRARY_NOTICE_TEXT`.
- Produces: `formatByteSize(bytes: number): string`; `SourceFilter = 'all' | 'catalog' | 'added' | 'yours'`; `LibraryFilter.hideShareAlike: boolean`; `TileState = 'ready' | 'downloading' | 'failed' | 'offline'` with `tileState(availability: ItemAvailability, online: boolean): TileState`; the components `LibraryTile` and `LibraryItemDetail`.

### Cycles

- [ ] **Cycle 1.** `core/assets/byte-size.test.ts`: "writes a size as whole KB, whole MB, or GB with one decimal". Assert 19,512 gives "19 KB", 32,505,856 gives "31 MB", 1,288,490,189 gives "1.2 GB", and 0 gives "0 KB". Fails today: no function. Implementation: `byte-size.ts`, in units of 1,024.
- [ ] **Cycle 2.** `editor/library/library-filter.test.ts`: "the source filter separates the catalog, added packs, and the user's models, and the license filter hides share-alike items". Assert `catalog` keeps the origins `catalog` and `starter`, `added` keeps `added`, `yours` keeps `yours`, and `hideShareAlike` drops the settee in every source. Fails today: the filter is `'all' | 'sample' | 'yours'`. Implementation: `library-filter.ts`, with the retrofit of `library-test-support.ts` in the RED commit.
- [ ] **Cycle 3.** `editor/library/library-panel.test.tsx`: "the source filter is labelled All, the catalog's name, Added, and Yours". Assert "Example Library" with the fixture catalog and "Built in" with none, and that no label holds the word "pack". Fails today: the labels differ. Implementation: `library-panel.tsx`.
- [ ] **Cycle 4.** `editor/library/library-tile.test.tsx`: "a tile shows its thumbnail, or its name alone when it has none, with the share-alike label and the name of an added item's author". Assert an image for the lamp; no image element for a format 1 item; "Share-alike" on the settee only; "Jane Roe" on an item with the origin `added` and on no catalog item. Fails today: no component. Implementation: `library-tile.tsx`.
- [ ] **Cycle 5.** "a tile shows whether its file is ready, downloading, failed, or out of reach, and can be placed in every state". Assert `data-tile-state` is `ready` for `on-device` and `not-downloaded`, `downloading` with "38%", `failed` for `unchecked` with a click that calls `retry`, and `offline` (dimmed) for an item that is not on the device with no connection. A click on a ready, downloading, or offline tile starts placement. Fails today: no states. Implementation: `library-tile.tsx`.
- [ ] **Cycle 6.** `editor/library/library-item-detail.test.tsx`: "the detail panel gives the name, size, license, author, source link, and origin". Assert "Example lamp", its size, "CC-BY-4.0", "Jane Roe", a link to `sourceUrl` with `rel="noopener noreferrer"`, and the origin line: "From Example Library" for a catalog item, "From the pack example-furniture" for an added one, "Yours", and "Built in". The `changes` text shows when present. Fails today: no component. Implementation: `library-item-detail.tsx`.
- [ ] **Cycle 7.** `editor/library/library-panel.test.tsx`: "the panel shows each library notice in one line". Assert the three sentences of pull request 3 cycle 11 and the sentence of pull request 4 cycle 4, one line each, and no line with no notice. Fails today: no notice area. Implementation: `library-panel.tsx`.

After the cycles, one `test(e2e):` commit: `library-download.spec.ts` places "Example sofa" from the fixture store, expects exactly 1 request for its blob path, places it again and expects no second request, then serves wrong bytes for the lamp and expects the tile state `failed`.

**Baselines.** New stories for the tile states and the detail panel. The panel stories change.

**What it leaves.** The device cache has no limit and no screen.

## Pull request 6: the device cache rules and Settings > Storage

Branch `feat/library-cache-and-storage-settings`. Depends on pull request 5.

**Goal.** The cache keeps what projects need, evicts what the catalog can supply again, and the user can see and steer it.

**What a user sees.** "Settings" in the Project menu, with a Storage part: what is used, "Keep everything available offline", and the library address.

**File fence.**

- `core/assets/cache-policy.ts` (new, with test).
- `storage/storage-capabilities.ts` and its test.
- `session/library/pins.ts`, `storage-summary.ts`, `offline-job.ts` (new, with tests), `library-ports.ts`, `library-service.ts`, `download-queue.ts`, `session/testing/index.ts`.
- `editor/settings/settings-dialog.tsx`, `storage-settings.tsx` (new, with tests and stories), `editor/shell/project-menu.tsx`, `editor/library/library-panel.tsx`, their tests.
- `app/create-asset-library-registry.ts`, `app/app-settings.tsx`, and the file that mounts the shell, with tests.

**Interfaces.**

- Consumes: `LibraryLedger`, `RemovableAssetCache.delete`, `ProjectIndex.all()`, `ProjectRecord.assetHashes` and `assetListComplete`, `StorageProbeHost`, `normalizeCatalogAddress`, `chooseCatalog`, `LIBRARY_ADDRESS_KEY`, `formatByteSize`.
- Produces:
  - `cache-policy.ts`: `EVICT_ABOVE_FRACTION = 0.95`, `WARN_AT_FRACTION = 0.8`; `BlobFacts { contentHash; byteLength; lastUsedAt; resuppliable; kind }`; `planEviction(input: { blobs: readonly BlobFacts[]; pinned: ReadonlySet<string>; usageBytes: number; quotaBytes: number; incomingBytes: number }): { evict: string[]; fits: boolean }`; `storageLevel(usageBytes: number, quotaBytes: number): 'ok' | 'warn' | 'full'`.
  - `storage-capabilities.ts`: `readStorageUsage(host?: StorageProbeHost): Promise<{ usageBytes: number; quotaBytes: number } | undefined>`, `requestPersistentStorage(host?: StorageProbeHost): Promise<boolean>`.
  - `LibraryPorts` gains `usage: { read(): Promise<{ usageBytes: number; quotaBytes: number } | undefined>; persist(): Promise<boolean> }` and `openHashes: () => readonly string[]`.
  - `pins.ts`: `pinnedHashes(input: { records: readonly ProjectRecord[]; openHashes: readonly string[] }): { hashes: ReadonlySet<string>; complete: boolean }`.
  - `LibraryService` gains `storage(): Promise<StorageSummary>`, `setKeepOffline(on: boolean): Promise<void>`, `pauseOffline(): void`, `resumeOffline(): void`, and `setAddress(input: string): Promise<'changed' | 'invalid'>`. `LibrarySnapshot` gains `offline: OfflineJobState | undefined` and the notice `'out-of-space'`.
  - `StorageSummary { usedBytes?: number; quotaBytes?: number; projectsBytes?: number; libraryBytes: number; libraryItemsOnDevice: number; libraryItemsTotal: number; addedPacksBytes: number; level: 'ok' | 'warn' | 'full' }`.
  - `OfflineJobState { on: boolean; state: 'idle' | 'downloading' | 'paused' | 'out-of-space' | 'done'; doneItems: number; totalItems: number; remainingBytes: number }`.

### Cycles

- [ ] **Cycle 1.** `core/assets/cache-policy.test.ts`: "eviction takes the least recently used files the catalog can supply again, until the new file fits under 95 percent". Setup: a quota of 1,000, usage of 940, an incoming file of 100, and blobs of 50 each. Assert the 2 oldest re-suppliable asset blobs are named and `fits` is true; a pinned blob, a thumbnail, and a blob with `resuppliable: false` are never named; when too little can go, `fits` is false. `storageLevel` gives `warn` at 800 of 1,000 and `full` above 950. Fails today: no module. Implementation: `cache-policy.ts`.
- [ ] **Cycle 2.** `storage/storage-capabilities.test.ts`: "reports usage and quota, and reports nothing when the browser gives no estimate or a quota of 0". Assert the pair for a full estimate, and `undefined` for a host with no `navigator.storage`, a rejected estimate, a missing `usage`, and `quota: 0`. `requestPersistentStorage` gives `false` with no `persist`. Fails today: no function. Implementation: `storage-capabilities.ts`.
- [ ] **Cycle 3.** `session/library/download-queue.test.ts`: "before a download that would pass 95 percent the queue evicts, and when nothing more can go it says the device is out of space". Assert the planned blobs leave the pool and the ledger before the request; with `fits: false` no request is made, the state is `storage-full`, and the notice is `out-of-space` ("This device is out of space for more library items."). With a usage port that gives `undefined`, the file downloads and nothing is evicted or refused (Review Focus 3). Fails today: no eviction. Implementation: `download-queue.ts`.
- [ ] **Cycle 4.** `session/library/pins.test.ts`: "a blob is pinned while a saved project or an open document uses it, and nothing is evicted when a project's asset list is not complete". Assert the union of `assetHashes` over the records and `openHashes`; a hash placed in an open document that has not saved yet is pinned (Review Focus 5); one record with `assetListComplete: false` gives `complete: false`, and the queue then evicts nothing. Fails today: no module. Implementation: `pins.ts`, and `openHashes` wired in `app/`.
- [ ] **Cycle 5.** `session/library/download-queue.test.ts`: "using a file marks it used, and a file the browser dropped downloads again". Assert `ensure` of a file on the device calls `touchBlob` with `now()`; a blob the ledger lists and the pool lacks has its record removed and is downloaded as new. Fails today: neither is handled. Implementation: `download-queue.ts`.
- [ ] **Cycle 6.** `session/library/storage-summary.test.ts`: "the summary gives the sizes and counts of Settings > Storage". Setup: 310 catalog asset blobs on the device of 2,140 distinct hashes, and an added pack of 31 MiB. Assert `libraryItemsOnDevice` 310, `libraryItemsTotal` 2,140, `addedPacksBytes`, `projectsBytes` equal to the usage less the two library sums and never below 0, `level: 'warn'` at 80 percent, and no `usedBytes`, `quotaBytes`, or `projectsBytes` with no estimate. Fails today: no module. Implementation: `storage-summary.ts`.
- [ ] **Cycle 7.** `session/library/offline-job.test.ts`: "keeping everything offline states its size, asks for persistent storage, downloads every file, and pins it". Assert `remainingBytes` is the sum of `byteLength` over the distinct hashes of the newest readable version of each pack, less what the device holds; `persist()` is called once; every file is asked through the queue; while it is on, `planEviction` receives every catalog hash as pinned. Fails today: no job. Implementation: `offline-job.ts`.
- [ ] **Cycle 8.** "the job continues after a reload, pauses, stops when the device is full, and turning it off deletes nothing". Assert the ledger document `offline-job` holds `{ on, paused }`; a new service over the same ledger continues with only the files it lacks; a catalog with a new pack downloads it at the next start with a connection; `pauseOffline` stops new requests; `storage-full` gives the state `out-of-space` with `remainingBytes`; `setKeepOffline(false)` removes no blob; with no catalog `offline` is `undefined`. Fails today: no job. Implementation: `offline-job.ts`.
- [ ] **Cycle 9.** `editor/settings/settings-dialog.test.tsx`: "Settings opens from the Project menu and shows the Storage part". Assert the menu item "Settings", a dialog titled "Settings", and the part "Storage". Fails today: no screen. Implementation: `settings-dialog.tsx`, `project-menu.tsx`.
- [ ] **Cycle 10.** `editor/settings/storage-settings.test.tsx`: "the Storage part shows what is used, the offline setting, and its progress". Assert "Used on this device 1.2 GB of about 12 GB", the rows "Your projects", "Library items" with "310 of 2,140 items", and "Added packs"; the checkbox "Keep everything available offline"; "Downloading 412 of 2,140 items, about 3.4 GB more" with "Pause"; "Storage on this device is almost full." at the level `warn`; no "of about" with no estimate; no offline checkbox with no catalog. Fails today: no component. Implementation: `storage-settings.tsx`.
- [ ] **Cycle 11.** "the library address shows and can be changed". Assert the row "Library address" with the address and "Change", and "None" with no catalog; "Change" opens a field; `http://assets.example.org/` shows "Enter an address that starts with https://."; a valid address is written to `LIBRARY_ADDRESS_KEY` and the service starts again with the choice of `chooseCatalog`; an empty field clears the user's level. Fails today: no row. Implementation: `storage-settings.tsx`, `library-service.ts`.
- [ ] **Cycle 12.** `editor/library/library-panel.test.tsx`: "the out-of-space notice opens Settings > Storage". Assert the notice line has a control that opens the dialog on the Storage part. Fails today: no such notice. Implementation: `library-panel.tsx`.

**Baselines.** New stories for the dialog and the Storage part in its states.

**What it leaves.** The "Added packs" list is empty, because nothing imports a pack yet.

## Pull request 7: importing a pack

Branch `feat/import-a-pack`. Depends on pull request 6.

**Goal.** A person adds a pack from a file or an HTTPS address after one plain notice, and can remove it.

**What a user sees.** "Add a pack" in the library panel, a pack file dropped on the window, the notice "Add these items to your library?", and the "Added packs" list in Settings > Storage with "Remove".

**File fence.**

- `storage/zip/read-pack-file.ts`, `storage/zip/archive-kind.ts` (new, with tests), `storage/assets/fetch-pack-file.ts` (new, with test), `storage/index.ts`.
- `session/library/pack-import.ts` (new, with test), `library-ports.ts`, `library-service.ts`, `core/assets/library-text.ts`.
- `editor/library/add-pack-dialog.tsx`, `pack-notice-dialog.tsx` (new, with tests and stories), `library-panel.tsx`, `editor/settings/storage-settings.tsx`.
- `app/use-open-file-action.ts`, `app/use-page-actions.ts`, their tests.
- `scripts/pack/pack-zip.mjs` (new, with test), `scripts/pack/vernacular-pack.mjs`, `package.json` (no new script; `pack:build` passes the flag through).
- `e2e/tests/library-import.spec.ts` (new).

**Interfaces.**

- Consumes: `readEndRecord`, `readCentralDirectory`, `inflateEntry`, `ARCHIVE_LIMITS`, `ArchiveFailure`, `contentHashOf`, `validatePackManifest`, `readPackManifest`, `licenseProblems`, `PACK_FORMAT_VERSIONS`, `pinnedHashes`, `storageLevel`, `zipFolder`.
- Produces:
  - `archive-kind.ts`: `archiveKind(bytes: Uint8Array): 'project' | 'pack' | 'unknown'`.
  - `read-pack-file.ts`: `readPackFile(bytes: Uint8Array, limits: ArchiveLimits = ARCHIVE_LIMITS): Promise<PackFileRead>`. `PackFileRead` is `{ ok: true; manifestBytes: Uint8Array; assets: ReadonlyMap<string, Uint8Array>; thumbnails: ReadonlyMap<string, Uint8Array>; notice?: string } | { ok: false; failure: ArchiveFailure | { kind: 'no-manifest' } }`.
  - `fetch-pack-file.ts`: `fetchPackFile(fetchFn: typeof fetch, address: string): Promise<Uint8Array | undefined>`. `LibraryPorts` gains `fetchPackFile: (address: string) => Promise<Uint8Array | undefined>`.
  - `pack-import.ts`: `PackRefusal`, a union on `kind`: `'damaged'`, `'needs-newer-app'`, `'license'` (with `license`), `'library-pack'`, `'too-large'`, `'out-of-space'`, `'address'`. `PackSummary { packId; version; name; from; attribution; itemCount; byteLength; licenses: { license: string; items: number; shareAlike: boolean }[] }`. `PackInspection` is `{ outcome: 'ready'; summary: PackSummary; pack: InspectedPack } | { outcome: 'already-added' } | { outcome: 'refused'; refusal: PackRefusal }`.
  - `LibraryService` gains `inspectPackFile(file: { name: string; bytes: Uint8Array }): Promise<PackInspection>`, `inspectPackAddress(address: string): Promise<PackInspection>`, `addPack(pack: InspectedPack): Promise<void>`, `removePack(packId: string, version: string): Promise<void>`, and `addedPacks(): Promise<readonly AddedPack[]>` with `AddedPack { packId; version; name; from; addedAt; byteLength; itemCount }`.
  - `library-text.ts`: `packRefusalText(refusal: PackRefusal): string`.

### Cycles

- [ ] **Cycle 1.** `storage/zip/read-pack-file.test.ts`: "reads a pack file as an untrusted archive: the manifest, each file the manifest names, and nothing else". Setup: zips built with `zipFolder`. Assert the manifest bytes, the assets and thumbnails keyed by content hash, and the `NOTICE` text. A zip whose every entry sits under one top folder reads the same, and an entry the manifest does not name is left out (Review Focus 2). An entry named `../x` or `/x` is never read. `too-large` for a file past a limit of `ARCHIVE_LIMITS`, `not-an-archive` for other bytes, and `no-manifest`. Fails today: no reader. Implementation: `read-pack-file.ts`.
- [ ] **Cycle 2.** `storage/zip/archive-kind.test.ts`: "tells a pack file from a project file by what it holds". Assert `project` for an archive with `vernacular.json` at its root, `pack` for one with `manifest.json` at its root or under one top folder and no `vernacular.json`, and `unknown` for other zips and other bytes. The file name is not read. Fails today: no function. Implementation: `archive-kind.ts`.
- [ ] **Cycle 3.** `session/library/pack-import.test.ts`: "a pack file whose manifest is invalid or whose files do not match their hashes is refused whole". Assert `damaged` for an invalid manifest, for one asset with other bytes, for a missing asset, and for a thumbnail with other bytes; the text is "This pack file is damaged or was changed. Nothing was added."; the pool and the ledger are unchanged. Fails today: no import. Implementation: `pack-import.ts`.
- [ ] **Cycle 4.** "a pack this app cannot read, cannot share, or already lists is refused with its reason". Assert `formatVersion: 9` gives "This pack needs a newer version of this app. Nothing was added."; a license outside the allowlist gives "This pack has items under a license this app cannot share." with the license named after it; a pack id the catalog lists, or the bundled starter id, gives "This pack has the same name as one in the library. Nothing was added."; a pack that would pass 95 percent gives "This device is out of space for more library items.". Fails today: no import. Implementation: `pack-import.ts`.
- [ ] **Cycle 5.** "the inspection of a good pack states what the notice needs". Setup: `example-furniture-1.0.0` from the file `example-furniture-1.0.0.zip`. Assert `from` is "example-furniture-1.0.0.zip, a file on this device", `attribution` is "Jane Roe", `itemCount` 3, `byteLength` the sum of its files, and the license rows CC0-1.0 with 1 item, CC-BY-4.0 with 1 item, and CC-BY-SA-4.0 with 1 item and `shareAlike: true`. Nothing is stored. Fails today: no import. Implementation: `pack-import.ts`.
- [ ] **Cycle 6.** "Add stores the pack, and its items join the library". Assert the ledger holds the record (`origin: 'imported'`, `from`, `addedAt` from `now()`, the manifest hash) and the manifest bytes; each blob is in the pool with `resuppliable: false`; the items have the origin `added`; the same version again gives `already-added`; version 1.1.0 is stored beside 1.0.0 and the library lists 1.1.0 only; the session's dispatch is never called. Fails today: no import. Implementation: `pack-import.ts`.
- [ ] **Cycle 7.** "a pack is fetched from an HTTPS address, and a failure tells the person to download it". Assert `fetchPackFile` refuses an address that is not `https:`, asks with no credentials and no referrer, and stops past the total limit of `ARCHIVE_LIMITS`; `from` is the address; a failure gives the refusal `address` with "That address could not be downloaded. Download the file yourself and drop it here.". Fails today: no fetch. Implementation: `fetch-pack-file.ts`, `pack-import.ts`.
- [ ] **Cycle 8.** `editor/library/pack-notice-dialog.test.tsx`: "the notice names the pack, its source, author, items, and licenses, and adds only on Add". Assert the title "Add these items to your library?"; the rows Pack, From, By, Items ("3 (" then the size then ")"), and Licenses ("CC0-1.0 (1 item)", "CC-BY-SA-4.0 (1 item, share-alike)"); "This pack is not from Example Library." with a catalog and "This pack comes from outside this app." with none; Cancel calls nothing; Add calls `addPack` once. Fails today: no dialog. Implementation: `pack-notice-dialog.tsx`.
- [ ] **Cycle 9.** `session/library/pack-import.test.ts`: "Remove deletes the pack and its files, except the files a project or another pack still uses". Assert the record and the manifest go; a blob in the pinned set stays, also for an open document that has not saved (Review Focus 5); a blob that another stored pack lists stays; the others leave the pool and the ledger. Fails today: no removal. Implementation: `pack-import.ts`.
- [ ] **Cycle 10.** `editor/library/add-pack-dialog.test.tsx`: "Add a pack offers a file chooser and an address field". Assert the button "Add a pack" in the panel, a chooser that accepts `.zip`, a field that takes an address, the notice dialog after a good inspection, and the refusal text after a refused one. Fails today: no dialog. Implementation: `add-pack-dialog.tsx`, `library-panel.tsx`.
- [ ] **Cycle 11.** `app/use-open-file-action.test.ts`: "a dropped file opens as a project or as a pack by what it holds". Assert a pack zip dropped on the window opens the notice and opens no project; a `.building` file opens as today; a zip that is neither gives today's unsupported-file message. Fails today: every dropped file goes to `importFile`. Implementation: `use-open-file-action.ts` with `archiveKind`.
- [ ] **Cycle 12.** `editor/settings/storage-settings.test.tsx`: "the Added packs list names each pack with its size and a Remove control". Assert one row for each `AddedPack`, and that "Remove" calls `removePack` and the row goes. Fails today: no list. Implementation: `storage-settings.tsx`.
- [ ] **Cycle 13.** `scripts/pack/pack-zip.test.mjs`: "build writes the pack as one zip file with a name from its id and version, and two builds give equal bytes". Assert `runPackCli(['build', dir, '--zip', out], deps)` writes `example-furniture-1.0.0.zip` with `manifest.json`, `assets/`, `thumbnails/`, `LICENSE`, `NOTICE`, and `CHANGELOG.md` at its root, in sorted order with one fixed date, and nothing for an invalid pack. Fails today: no flag. Implementation: `pack-zip.mjs` with `fflate`.

After the cycles, one `test(e2e):` commit: `library-import.spec.ts` drops a pack zip built in the test, clicks Add, places an added item, removes the pack in Settings, and expects the placed piece to keep its model.

**What it leaves.** A saved file still leaves out every pack asset.

## Pull request 8: the credit record and the license texts

Branch `feat/asset-credit-record`. Depends on pull request 1. It must merge before pull request 9.

**Goal.** The project format defines `assetIndex`, the repository holds the text of every allowed license, and `core/` can build a project's credit list.

**What a user sees.** Nothing.

**File fence.**

- `docs/specs/2026-06-10-vernacular-floor-plan-format.md` (sections 5 and 6.5, and a new subsection for the record) and a new decision record for the change.
- `core/model/types.ts`, `core/model/factories.ts` (the next `CURRENT_SCHEMA_REVISION`, 2 at this base), the generated schema `schema/17/revision-2/vernacular.schema.json`, the generated validator and known-key files of `pnpm schema:generate`, and `core/format/codec/asset-index.test.ts` (new).
- `core/assets/asset-credit.ts`, `core/assets/license-facts.ts` (new, with tests), `core/index.ts`.
- `LICENSES/<SPDX id>.txt` for the nine licenses of `RECOGNIZED_LICENSES` (canonical text, not reworded), `scripts/pack/license-texts.test.mjs` (new), `.prettierignore` (`LICENSES/`).

**Interfaces.**

- Consumes: `ReadablePackManifest`, `mostPermissiveLicense`, `RECOGNIZED_LICENSES`, `isShareAlike`.
- Produces:
  - `asset-credit.ts`: `AssetCredit { contentHash: string; name: string; license: string; attribution: string; copyright?: string; changes?: string; sourceUrl?: string; packId: string; version: string; notice?: string }`; `creditsFor(input: { hashes: readonly string[]; manifests: readonly ReadablePackManifest[]; carried: readonly AssetCredit[]; noticeOf: (packId: string, version: string) => string | undefined }): AssetCredit[]`.
  - `types.ts`: `Project.assetIndex?: AssetCredit[]`.
  - `license-facts.ts`: `LicenseFacts { name: string; creditName: string; url: string; attributionRequired: boolean; includeText: boolean }`, `LICENSE_FACTS`, keyed by the nine license ids, and `FIRST_PARTY_ATTRIBUTION = 'The Vernacular Contributors'`.

The first commit is `docs:`: the decision record and the format text. They say that the record is derived at each save from the manifests on the device, that a reader keeps a record it cannot derive again, that the promotion of the reserved name is an additive change (ADR-0178), and that `ATTRIBUTIONS.md` is written from these records.

### Cycles

- [ ] **Cycle 1.** `core/format/codec/asset-index.test.ts`: "a document with a credit list is valid at the new revision, survives an encode and a decode, and a malformed record is refused". Assert through `encodeDocument` and `decodeDocument`: a record with the six required fields gives an equal list after the round trip; one with no `license`, with a `contentHash` of 63 characters, or with a numeric `name` is refused; a revision 1 fixture with no `assetIndex` decodes as before. Fails today: the name is reserved and has no shape. Implementation: the type, the revision, `pnpm schema:generate`, and the codec's known keys.
- [ ] **Cycle 2.** `core/assets/asset-credit.test.ts`: "builds one credit for each library asset a project uses". Setup: the fixture manifests, the hashes of the lamp and the settee, one hash no manifest lists that has a carried record, and one with neither. Assert the lamp's record has `name`, `license: 'CC-BY-4.0'`, `attribution: 'Jane Roe'`, `copyright`, `sourceUrl`, `packId`, and `version`; the settee's has `changes`; the carried record is kept as it is; the fourth hash has none; a hash two manifests list under `CC-BY-SA-4.0` and `CC-BY-4.0` is credited under `CC-BY-4.0`; an Apache-2.0 asset carries `notice` from `noticeOf`; the list is sorted by `contentHash`. Fails today: no function. Implementation: `asset-credit.ts`.
- [ ] **Cycle 3.** `core/assets/license-facts.test.ts`: "every allowed license has a name, a credit name, an address, and its two rules". Assert `CC-BY-4.0` has the credit name "CC BY 4.0" and the address `https://creativecommons.org/licenses/by/4.0/`; `CC0-1.0` has `attributionRequired: false`; `includeText` is true for exactly `MIT`, `BSD-2-Clause`, `BSD-3-Clause`, and `Apache-2.0`; every id of `RECOGNIZED_LICENSES` has an entry. Fails today: no module. Implementation: `license-facts.ts`.
- [ ] **Cycle 4.** `scripts/pack/license-texts.test.mjs`: "LICENSES holds the text of every allowed license". Assert `LICENSES/<id>.txt` exists and is not empty for each id of `RECOGNIZED_LICENSES`, and that no other file is there. Fails today: no folder. Implementation: the nine files.

**What it leaves.** Nothing writes a credit list yet.

## Pull request 9: the save choice and ATTRIBUTIONS.md

Branch `feat/save-choice-and-attributions`. Depends on pull requests 7 and 8.

**Goal.** The user chooses whether a saved file carries its library assets. Every save writes the credit list, and a file or folder that uses a library asset carries `ATTRIBUTIONS.md`.

**What a user sees.** The dialog "Save a project file" on each `.building` export, with "Include everything" as the default.

**File fence.**

- `core/assets/attribution-text.ts` (new, with test), `core/index.ts`.
- `storage/zip/export-project-bundle.ts`, `storage/documents/document-store.ts`, `storage/project-files/folder-files.ts`, their tests.
- `session/ports.ts`, `session/handle/find-document-store.ts`, `app/create-session-ports.ts`, their tests.
- `session/library/save-plan.ts` (new, with test), `library-service.ts`, `session/flows/export-archive.ts` and its test.
- `editor/shell/save-file-dialog.tsx` (new, with test and stories), `export-menu.tsx`, `project-menu.tsx`, their tests.
- `app/use-export-actions.ts`, `app/license-texts.ts` (new), `app/app-settings.tsx`, `app/pack-supplies.ts`, their tests.
- `e2e/tests/library-save-choice.spec.ts` (new).

**Interfaces.**

- Consumes: `creditsFor`, `AssetCredit`, `LICENSE_FACTS`, `neededAssetHashes(project, packSupplies?)`, `packSuppliesFrom(items)`, `exportArchive(handle, options)`, `LibraryService.ensureProject`, `shareAlikeWarning(licenseIds)`, `SettingsService`, `formatByteSize`.
- Produces:
  - `attribution-text.ts`: `LicenseTexts = Readonly<Record<string, string>>`; `attributionsMarkdown(credits: readonly AssetCredit[], texts: LicenseTexts): string | undefined`.
  - `save-plan.ts`: `EmbedChoice = 'everything' | 'small'`; `SavePlan { embed: readonly string[]; notOnDevice: number; fromAddedPacks: number; byteLength: number; credits: readonly AssetCredit[]; creditedItems: number; authors: number; shareAlikeLicenses: readonly string[] }`; `LibraryService.planSave(project: Project, choice: EmbedChoice): Promise<SavePlan>`.
  - `export-project-bundle.ts`: `ExportProjectBundleOptions` gains `credits?: readonly AssetCredit[]` and `attributions?: string`. `ExportArchiveOptions` gains the same two.
  - `document-store.ts`: the second constructor parameter becomes `DocumentStoreOptions extends CodecOptions` with `saveExtras?: SaveExtrasFor`, where `SaveExtrasFor = (id: string, project: Project) => Promise<SaveExtras | undefined>` and `SaveExtras { embedHashes?: readonly string[]; credits?: readonly AssetCredit[]; attributions?: string }`.
  - `ports.ts`: `SessionPorts.saveExtras?: SaveExtrasFor`, optional, so existing fakes stay valid. `findFolderStore` passes it to the folder's `DocumentStore`. The workspace store does not use it.
  - `app-settings.tsx`: `EMBED_CHOICE_BY_PROJECT_KEY`, a `SettingKey<Record<string, EmbedChoice>>` named `library.embedChoiceByProject`, default `{}`. A project with no entry uses `everything`.
  - `license-texts.ts`: `LICENSE_TEXTS: LicenseTexts`, from `LICENSES/*.txt` through `?raw` imports.

### Cycles

- [ ] **Cycle 1.** `core/assets/attribution-text.test.ts`: "writes one entry for each credited asset with what its license asks for". Assert for the lamp: its title, "Jane Roe", its copyright notice, its source link, "CC BY 4.0" with the license address, and the license's warranty disclaimer notice; the settee's entry states its `changes`; an MIT asset's entry is followed by the MIT text once for the file; an Apache-2.0 asset adds the text and its `notice`; the order follows the credit list; an empty list gives `undefined`; the output has no em dash. Fails today: nothing writes the file. Implementation: `attribution-text.ts`.
- [ ] **Cycle 2.** `session/library/save-plan.test.ts`: "the plan for each choice says what goes in the file, what is missing, and whom it credits". Setup: a project with 14 library items by 3 authors, 6 of them from an added pack, and 3 not on the device. Assert `everything`: `embed` holds all 14 hashes, `notOnDevice` is 3, and `byteLength` is their sum. `small`: `embed` holds none of them and `fromAddedPacks` is 6. Both: 14 credits, `creditedItems` 14, `authors` 3, and `shareAlikeLicenses` names `CC-BY-SA-4.0` when the settee is used. Fails today: no plan. Implementation: `save-plan.ts`.
- [ ] **Cycle 3.** `storage/zip/export-project-bundle.test.ts`: "an archive carries its credit list and ATTRIBUTIONS.md, and embedded library files sit under assets/ by hash". Assert with no `packSupplies`: the entry `assets/<hash>` for a pack-scoped reference, the reference still in the scope `pack:example-furniture@1.0.0`, `assetIndex` in `vernacular.json`, and `ATTRIBUTIONS.md` at the root with the given text. With `packSupplies`: no asset entry for it, and the same two credit outputs. With neither option given: today's archive, byte for byte. Fails today: neither is written. Implementation: `export-project-bundle.ts`, `export-archive.ts`.
- [ ] **Cycle 4.** `session/library/save-plan.test.ts`: "a person who lacks the pack saves again and the credits stay". Setup: a project opened from a file with embedded pack assets and an `assetIndex` of 2 records, and a ledger with no pack. Assert `planSave(project, 'everything')` gives `embed` with both hashes, `notOnDevice` 0, and `credits` equal to the carried records; `library.snapshot().items` and the ledger's pack list are as before the file opened. Fails today: the plan reads no carried record. Implementation: `save-plan.ts`.
- [ ] **Cycle 5.** `storage/documents/document-store-assets.test.ts`: "a folder save copies the files the choice embeds, writes the credit list, and writes ATTRIBUTIONS.md". Assert with `saveExtras`: `prepareAssets` receives the hashes of `hashesToCopy(project)` and `embedHashes`, the saved document carries `assetIndex`, and the project directory holds `ATTRIBUTIONS.md`; when `attributions` is absent an existing `ATTRIBUTIONS.md` is removed; with no `saveExtras` the save is as today. Fails today: no option. Implementation: `document-store.ts`, `folder-files.ts`.
- [ ] **Cycle 6.** `app/license-texts.test.ts`: "the app holds the text of every license whose text a credit file must carry". Assert a non-empty text for each id whose `includeText` is true. Fails today: no module. Implementation: `license-texts.ts`.
- [ ] **Cycle 7.** `editor/shell/save-file-dialog.test.tsx`: "the save dialog offers the two choices with their consequences and the credit count". Assert the title "Save a project file"; "Include everything" selected by default with "The file opens on any device, with or without a connection." and its size; "Keep the file small" with "Furniture and textures from the library are left out. The other person's app downloads them when it opens the file."; "6 items come from a pack you added. They show as placeholders unless the other person adds that pack too." only when the count is above 0; "Credits: 14 items by 3 authors." with "See the list"; the buttons Cancel and "Save file"; the dialog opens on the choice it is given. Fails today: no dialog. Implementation: `save-file-dialog.tsx`.
- [ ] **Cycle 8.** `app/use-export-actions.test.tsx`: "each export asks, remembers the answer for the project, and embeds or leaves out as chosen". Assert the dialog opens on every `.building` export, on the project's last choice. "Include everything" calls `ensureProject` first, shows its progress, and then calls `exportArchive` with no `packSupplies`; with 3 files that cannot arrive it writes no file and shows "3 items are not on this device yet. Connect to the internet to include them, or save the small file.". "Keep the file small" passes `packSupplies`. Both pass `credits` and `attributions`. The choice is written under the project id in `EMBED_CHOICE_BY_PROJECT_KEY`. Fails today: the export never asks. Implementation: `use-export-actions.ts`, `export-menu.tsx`.
- [ ] **Cycle 9.** "a save that would carry a share-alike asset asks for the confirmation first". Assert the text of `shareAlikeWarning` shows before the file is written when `shareAlikeLicenses` is not empty, declining writes no file, and a plan with none shows no question. Fails today: no confirmation on this path. Implementation: `use-export-actions.ts`.
- [ ] **Cycle 10.** `editor/shell/project-menu.test.tsx`: "a folder asks once what it includes, and the Project menu can change it". Assert the dialog opens when a folder is chosen for a project and not on later saves, and that "What this folder includes" opens it again and the next save uses the new choice through `saveExtras`. Fails today: no such item. Implementation: `project-menu.tsx`, `ports.ts`, `find-document-store.ts`, and the `saveExtras` wiring in `app/create-session-ports.ts`.

After the cycles, one `test(e2e):` commit: `library-save-choice.spec.ts` saves with "Include everything", opens the file in a context with no catalog and no network, and expects the model and no new item in the library. It then saves with "Keep the file small" and expects the label "Not included in this file" in that context.

**Baselines.** New stories for the dialog in both choices.

**What it leaves.** The credits show only in the detail panel and in saved files.

## Pull request 10: the Credits screen and the credit line

Branch `feat/credits-screen`. Depends on pull request 9.

**Goal.** Settings lists every credit in the library, and `core/` can write the credit line of an export.

**File fence.** `core/assets/credit-line.ts` (new, with test); `session/library/library-service.ts` and a new `credits.ts` with its test; `editor/settings/credits-settings.tsx` (new, with test and story), `settings-dialog.tsx`, `editor/shell/save-file-dialog.tsx`.

**Interfaces.**

- Consumes: `AssetCredit`, `LICENSE_FACTS`, `FIRST_PARTY_ATTRIBUTION`, `mostPermissiveLicense`, the kept manifests of the ledger.
- Produces: `LibraryService.credits(): Promise<CreditGroups>` with `CreditGroups { firstParty: CreditGroup | undefined; thirdParty: readonly CreditGroup[] }` and `CreditGroup { attribution: string; license: string; items: readonly { name: string; sourceUrl?: string; copyright?: string }[] }`; `creditLine(credits: readonly AssetCredit[]): string | undefined`.

### Cycles

- [ ] **Cycle 1.** `session/library/credits.test.ts`: "credits group third-party items by author and license and first-party items as one group, from kept manifests". Assert one first-party group for "The Vernacular Contributors"; a "Jane Roe" group for each of her licenses; an item listed by two manifests appears once, under the most permissive license; no store call is made. Fails today: no method. Implementation: `credits.ts`.
- [ ] **Cycle 2.** `editor/settings/credits-settings.test.tsx`: "Settings shows the Credits part with each group, license, and source link". Assert the two parts "Storage" and "Credits", each group's author and license name with the license address, each item's name and link, and that "See the list" in the save dialog opens this part. Fails today: no part. Implementation: `credits-settings.tsx`, `settings-dialog.tsx`.
- [ ] **Cycle 3.** `core/assets/credit-line.test.ts`: "the credit line names the authors a license requires and never a CC0 asset". Assert `Furniture: The Vernacular Contributors, Jane Roe (CC BY 4.0). Full credits: ATTRIBUTIONS.md in the project file.` for two CC-BY-4.0 authors; authors under a second license follow after a semicolon with their own license name; CC0 credits alone give `undefined`. Fails today: no function. Implementation: `credit-line.ts`. No export calls it yet.

**What it leaves.** `creditLine` has no caller until an export pictures a model.

## Pull request 11: the decoders and pack format 3

Branch `feat/pack-format-3-and-decoders`. Depends on pull request 1. Tools lane.

**Goal.** The app loads compressed models and `image/ktx2` textures with decoders from the pinned `three` package, served from its own origin and loaded on first need. The pack tool accepts format 3 and checks a model's required extensions.

**What a user sees.** Nothing until a format 3 pack exists.

**File fence.**

- `core/assets/glb-extensions.ts` (new, with test), `pack-manifest.ts`, the header reader and texture rules of the texture assets plan, their tests, `core/index.ts`.
- `engine/loaders/model-decoders.ts` (new, with test), `engine/loaders/gltf-loader.ts`, the file of `decodeImageTexture`, their tests, `engine/index.ts`.
- `bridge/react/use-furniture-model-cache.ts` (passes the decoders to the parse step).
- `scripts/pack/pack-integrity.mjs`, `scripts/pack/generate-fixtures.mjs`, their tests; `tests/fixtures/packs/example-compressed-1.0.0/` (new, generated).
- `scripts/build/decoder-files.mjs` (new, with test), `vite.config.ts`, `tsconfig.node.json` if the new file needs it.
- A new decision record for pack format 3.

**Interfaces.**

- Consumes: `PACK_FORMAT_VERSIONS`, `MEDIA_TYPE_EXTENSIONS`, `TEXTURE_LIMITS`, `readImageHeader(bytes)`, `parseGltfBytes(buffer)`, `decodeImageTexture`.
- Produces:
  - `glb-extensions.ts`: `readGlbJson(bytes: Uint8Array): unknown`; `readGlbRequiredExtensions(bytes: Uint8Array): readonly string[] | undefined`; `glbExternalUris(bytes: Uint8Array): readonly string[]`; `glbImageMediaTypes(bytes: Uint8Array): readonly string[]`; `allowedRequiredExtensions(formatVersion: number): readonly string[]`.
  - `pack-manifest.ts`: `PACK_FORMAT_VERSIONS` is `[1, 2, 3]`, and `MEDIA_TYPE_EXTENSIONS` gains `'image/ktx2': 'ktx2'`.
  - `model-decoders.ts`: `DECODER_PATH = 'decoders/'`; `ModelDecoders { meshopt(): Promise<unknown>; ktx2(): Promise<unknown> }`; `createModelDecoders(options: { transcoderPath: string; renderer: THREE.WebGLRenderer }): ModelDecoders`.
  - `gltf-loader.ts`: `parseGltfBytes(buffer: ArrayBuffer, decoders?: ModelDecoders): Promise<THREE.Object3D>`.
  - `decoder-files.mjs`: `decoderFiles()`, a build plugin that emits `decoders/basis_transcoder.js` and `decoders/basis_transcoder.wasm` and serves them in development.

### Cycles

- [ ] **Cycle 1.** `core/assets/glb-extensions.test.ts`: "reads the required extensions and outside addresses of a binary glTF file". Assert `cube.glb` gives an empty list; a hand-built file gives its `extensionsRequired`; a buffer or image with a `uri` is listed, and one with a `bufferView` is not; the `mimeType` of each image is listed; other bytes give `undefined`. `allowedRequiredExtensions(2)` is `EXT_texture_webp`, `KHR_mesh_quantization`, `KHR_texture_transform`, and format 3 adds `EXT_meshopt_compression` and `KHR_texture_basisu`. Fails today: no module. Implementation: `glb-extensions.ts`.
- [ ] **Cycle 2.** `core/assets/pack-manifest.test.ts`: "format 3 is format 2 with compressed models and image/ktx2 textures". Assert a format 3 manifest with an `image/ktx2` texture is valid, the same texture in format 2 is refused with one error at `assets[0].mediaType`, and format 4 is unknown. Fails today: format 3 is unknown. Implementation: `pack-manifest.ts`.
- [ ] **Cycle 3.** The header reader's test: "reads the size of a KTX2 file, and the texture rules apply to it". Assert the width and height from a hand-built KTX2 header, and the rules of the specification: a power of two from 64 to 2048 and at most 8 MiB. Fails today: the type is unknown. Implementation: the header reader.
- [ ] **Cycle 4.** `scripts/pack/pack-integrity.test.mjs`: "a model may require only the extensions its pack format allows, and may refer to no outside file". Assert one error naming the asset and the extension for `EXT_meshopt_compression` in a format 2 pack, for `KHR_draco_mesh_compression` in every format, for a buffer with a `uri`, and for an image that is not `image/png`, `image/jpeg`, `image/webp`, or `image/ktx2`; a format 3 model must be a binary glTF file; a format 1 or 2 model that is not one passes as today. Fails today: no check. Implementation: `pack-integrity.mjs`, and the fixture pack `example-compressed-1.0.0` (format 3, hand-built files) in `generate-fixtures.mjs`.
- [ ] **Cycle 5.** `engine/loaders/gltf-loader.test.ts`: "a model that requires an extension outside the allowed list is refused before it is parsed". Assert a rejection that names `KHR_draco_mesh_compression`, and that `cube.glb` parses as today with no decoder call. Fails today: the loader tries to parse it. Implementation: `gltf-loader.ts`.
- [ ] **Cycle 6.** `engine/loaders/model-decoders.test.ts`: "each decoder is loaded once, and only when a file requires it". Setup: counting fake decoders, and hand-built files with an empty scene that require one extension each. Assert `meshopt()` is called once over two meshopt files and never for `cube.glb`; `ktx2()` is called once for a file that requires `KHR_texture_basisu`; the transcoder path is `DECODER_PATH` under the app's base address. Fails today: no decoder is registered. Implementation: `model-decoders.ts`, `gltf-loader.ts`.
- [ ] **Cycle 7.** The test of `decodeImageTexture`: "an image/ktx2 texture is decoded through the KTX2 decoder with the color space of its description". Assert with a fake decoder that it receives the bytes and that the result carries the color space; PNG and WebP go the old way. Fails today: the type is refused. Implementation: the file of `decodeImageTexture`.
- [ ] **Cycle 8.** `scripts/build/decoder-files.test.mjs`: "the build emits the Basis transcoder at decoders/ with the bytes of the pinned three package". Assert the two emitted files equal `node_modules/three/examples/jsm/libs/basis/basis_transcoder.js` and `.wasm` byte for byte, with those fixed names. Fails today: no plugin. Implementation: `decoder-files.mjs`, `vite.config.ts`.

One `docs:` commit holds the decision record for format 3.

**What it leaves.** No test decodes a really compressed file, because no encoder is in the repository. See "Risks".

## Pull request 12: the service worker precache

Branch `feat/precache-starter-set-and-decoders`. Depends on pull request 11.

**Goal.** The starter set and the decoder files answer with no connection, and the starter set has a size budget.

**File fence.** `storage/service-worker/precache.ts` (new, with test), `src/service-worker.ts`, `scripts/build/precache-list.mjs` (new, with test), `vite.config.ts`, `scripts/pack/starter/build-starter-pack.mjs` and its test, `e2e/tests/library-offline-starter.spec.ts` (new).

**Interfaces.**

- Consumes: `CacheStorageLike`, the starter folders under `public/packs/`, `decoderFiles()`.
- Produces: `STARTER_SET_BUDGET_BYTES = 2_097_152` and `starterSetBytes(packDir)` in the starter builder; `precacheList()`, a build plugin that writes `precache-manifest.json` (`{ version: string; files: string[] }`); in `precache.ts`: `PRECACHE_PREFIX = 'vernacular-precache-'`, `installPrecache(caches, manifest, fetchFn)`, `purgeStalePrecaches(caches, version)`, and `precachedResponse(caches, request, manifest): Promise<Response | undefined>`.

### Cycles

- [ ] **Cycle 1.** `scripts/pack/starter/build-starter-pack.test.mjs`: "the newest starter version stays within its size budget". Assert `starterSetBytes` of 1.1.0 is at most `STARTER_SET_BUDGET_BYTES`, and that the builder throws past it. Fails today: no budget. Implementation: the builder.
- [ ] **Cycle 2.** `scripts/build/precache-list.test.mjs`: "the build lists every starter file and every decoder file, and nothing else". Assert the list holds each file under `packs/`, the two transcoder files, and the emitted chunks of the meshopt decoder and the KTX2 loader; it holds no `index.html` and no application chunk; `version` is a hash of the list and of the files' contents. Fails today: no list. Implementation: `precache-list.mjs`, `vite.config.ts`.
- [ ] **Cycle 3.** `storage/service-worker/precache.test.ts`: "listed files are cached at install and served from the cache, and every other request goes to the network untouched". Assert install stores each listed file and fails as a whole when one is missing; a listed request is answered from the cache with no fetch; an unlisted request gives `undefined`; `purgeStalePrecaches` removes other versions and no shell cache. Fails today: no precache. Implementation: `precache.ts`, wired in `src/service-worker.ts`.

After the cycles, one `test(e2e):` commit: after one visit, with the network off, the request for the starter chair's file is answered by the service worker.

**What it leaves.** The application shell is not cached. A first launch with no connection still depends on the browser's own cache.

## Pull request 13: the mirror command, the schemas, REUSE, and the deployment guide

Branch `feat/store-mirror-schemas-and-guide`. Depends on pull requests 8 and 11.

**Goal.** Anyone can copy a store and check it, other tools can read the three file formats from published schemas, and a guide says how to host a store.

**File fence.**

- `scripts/pack/mirror-store.mjs`, `scripts/pack/reuse-toml.mjs` (new, with tests), `vernacular-pack.mjs`, `pack-integrity.mjs`, their tests; `REUSE.toml` (new, generated).
- `core/assets/pack-manifest-file.ts` (new: the file types `PackManifestFormat1`, `PackManifestFormat2`, `PackManifestFormat3`, and `DeploymentFile`), `scripts/schema/build-asset-schemas.mjs` (new, with test), `schema/catalog/1/`, `schema/pack-manifest/{1,2,3}/`, `schema/deployment/1/` (generated).
- `package.json` (`pack:mirror`, `pack:reuse`, and the new step in `schema:generate` and `schema:check`), `.prettierignore` if the generated files need it, `.gitignore` (`public/library/`).
- `docs/asset-store-deployment.md` (new), ADR-0229 (status and text).

**Interfaces.**

- Consumes: `publishPack`'s file sink, the paths of `store-paths.ts`, `validateCatalog`, `validatePackManifest`, `validateDeployment`, `LICENSES/`, the existing schema generator.
- Produces: `mirrorStore(request: { source: string; to: string }, io)`; `reuseToml(packs)`; the commands `mirror <source> --to <dir>` and `reuse <pack-dir> [--check]`.

### Cycles

- [ ] **Cycle 1.** `scripts/pack/mirror-store.test.mjs`: "mirror copies a whole store, checks every hash, and writes the catalog last". Setup: the fixture store as the source, from a directory and through a fake fetch. Assert the copy equals the source file by file, `catalog.json` is the last write, and one blob or manifest with other bytes stops the run with an error that names its path, before any catalog is written. Fails today: no command. Implementation: `mirror-store.mjs`.
- [ ] **Cycle 2.** `scripts/pack/vernacular-pack.test.mjs`: "the mirror and reuse commands run and exit non-zero on a failure". Assert the two branches of `runPackCli` and their usage text. Fails today: unknown commands. Implementation: `vernacular-pack.mjs`, `package.json`.
- [ ] **Cycle 3.** `scripts/pack/reuse-toml.test.mjs`: "REUSE.toml states the license and copyright of every starter file, and the committed file is the tool's output". Assert one annotation for each asset and thumbnail of both starter versions with its SPDX id and copyright text, and that `reuse --check` fails after a manifest's license changes. Fails today: no file. Implementation: `reuse-toml.mjs`, `REUSE.toml`.
- [ ] **Cycle 4.** `scripts/pack/pack-integrity.test.mjs`: "a pack's LICENSE holds the full text of every license its assets use". Assert an error that names the missing license when the text of `LICENSES/CC-BY-4.0.txt` is not in the pack's `LICENSE`, and none for the starter and fixture packs. Fails today: the file is only required to exist. Implementation: `pack-integrity.mjs`, and the builders of the starter and fixture packs.
- [ ] **Cycle 5.** `scripts/schema/build-asset-schemas.test.mjs`: "the committed schemas are generated from the types and carry their published address". Assert each file equals the generator's output, the catalog schema's `$id` is `https://drmrd.github.io/vernacular/schema/catalog/1/catalog.schema.json`, the others follow the same pattern, and each names Apache-2.0. Fails today: no schema. Implementation: `pack-manifest-file.ts`, `build-asset-schemas.mjs`, the `schema:generate` and `schema:check` steps.
- [ ] **Cycle 6.** "a schema and its validator give the same verdict on every fixture". Assert with `ajv` that each fixture manifest (the broken ones too), the fixture catalog, the examples of the specification, a manifest whose asset and thumbnail carry a key no schema names, and a malformed case for each are valid under the schema exactly when the validator of `core/assets/` accepts them. Fails today: no schema. Implementation: corrections to the types until the verdicts agree.

Two `docs:` commits follow. The guide covers the store layout, the headers of the specification (HTTPS only; `Access-Control-Allow-Origin: *` for GET and HEAD; `Cache-Control: public, max-age=31536000, immutable` for manifests, blobs, and `packs/` text; `Cache-Control: no-cache` with an `ETag` for `catalog.json`; the `Content-Type` of each media type with `X-Content-Type-Options: nosniff`; unchanged bytes; no cookies; request logs that can be turned off), the upload order (blobs, manifests, then `catalog.json`), `deployment.json`, a local store under `public/library/` for development, mirroring, and the rule that a change of file format or compression alone needs no `changes` entry. It passes the `humanizer` skill. ADR-0229 moves to `current` and its "What stays open" list is brought up to date.

**What it leaves.** A live host, the public repository of issue #1092, and catalog signing.

## Order and parallel work

- **App lane, in order:** 1, 2, 3, 4, 5, 6, 7, 9, 10. Each step edits `session/library/library-service.ts` or the library panel, so they do not run side by side.
- **Tools lane:** 11 after 1, then 12 and 13. This lane edits `scripts/`, `engine/loaders/`, `schema/`, and `core/assets/pack-manifest.ts`, which the app lane does not edit after pull request 1.
- **Format lane:** 8 after 1, at any time before 9.
- 11 and 8 can start on the day 1 merges, beside 2. 12 and 13 can run side by side once their parents merge.
- Merge order when all lanes are ready: 1, 2, 8, 11, 3, 4, 5, 6, 7, 12, 13, 9, 10.

## Files shared with other efforts

- `scripts/pack/vernacular-pack.mjs`: pull requests 1, 7, and 13 each add one branch to `runPackCli`. Each command's logic is in its own module, so a rebase touches one line.
- `core/index.ts`, `storage/index.ts`, `session/index.ts`: exports only.
- `package.json` scripts: pull requests 1 and 13.
- `vite.config.ts`: pull requests 11 and 12, in that order. Edit the `.ts` file, not the compiled `.js`.
- `core/assets/pack-manifest.ts` and `scripts/pack/pack-integrity.mjs` are also edited by the texture assets plan, which lands first.
- The app lane's `LibraryService` grows by pull request. A later pull request adds members and renames none.

## Size

| Pull request                                    | Cycles |
| ----------------------------------------------- | ------ |
| 1. Store contract and publish step              | 13     |
| 2. Verified fetch, store reader, library ledger | 10     |
| 3. Deployment setting and library service       | 15     |
| 4. Download on demand and placeholders          | 14     |
| 5. Library panel                                | 7      |
| 6. Device cache rules and Settings > Storage    | 12     |
| 7. Importing a pack                             | 13     |
| 8. Credit record and license texts              | 4      |
| 9. Save choice and ATTRIBUTIONS.md              | 10     |
| 10. Credits screen and credit line              | 3      |
| 11. Decoders and pack format 3                  | 8      |
| 12. Service worker precache                     | 3      |
| 13. Mirror, schemas, REUSE, deployment guide    | 6      |
| Total                                           | 118    |

## Issues to file when the work starts

Each goes to the `1.0` milestone unless the owner rules that it blocks the beta.

- A shell precache, so a first launch with no connection works.
- The call site of `creditLine`, for the first export that pictures a model.
- A test that decodes a really compressed model and a real KTX2 texture, once the preparation pipeline can make one.
- The amendments to the design specification that ADR-0229 lists (sections 4.1, 4.2, 4.3, 4.8, and 5.8).
- Each point of the specification's "Follow-ups to file" that has no issue yet. Issue #1092 already covers the public repository.

## Risks

- **No really compressed fixture.** Pull request 11 proves that the right decoder is asked for and that the transcoder files ship. It cannot prove a decode, because the repository has no encoder and a new package is out of bounds. The first format 3 asset must come with a `scene-webgl` test.
- **The Basis transcoder is WebAssembly.** No Content-Security-Policy exists today. One added later must allow WebAssembly from the app's own origin, and the deployment guide says so.
- **Web Crypto hashes a whole buffer.** A file is held in memory once while it is checked. The texture limit is 8 MiB, a model is bounded by its `byteLength`, and a file with no stated length by 64 MiB.
- **Two tabs.** Both may download one hash. Both writes hold the same bytes under the same name, and the ledger write is a replace, so the result is correct and one download is wasted. The offline job has no lock across tabs, and two tabs with the setting on share the work unevenly but end in the same state.
- **Storage estimates are rough.** Browsers pad `usage` and round `quota`. The thresholds are compared with the estimate as given, so eviction may start a little early.
- **The starter chair is placeholder bytes.** End-to-end tests that need a real model use the fixture pack's "Example sofa".
- **`session/library/library-service.ts` grows in seven pull requests.** Each BLUE review keeps it under 300 lines by moving a concern to its own file, as the file fences already do.
- **ADR numbers.** Pull requests 8 and 11 each add a record. Numbers are assigned at dispatch and checked before landing.

## Execution

Run this plan with superpowers:subagent-driven-development from the main thread: one `test-author`, one `implementer`, and one `refactorer` dispatch for each cycle, the clean-code review before each BLUE commit, and the pull request review before each landing. A background agent cannot dispatch those roles, so the main thread orchestrates. Start a fresh session for each pull request, and brief each role with the pull request's file fence and Interfaces block only.
