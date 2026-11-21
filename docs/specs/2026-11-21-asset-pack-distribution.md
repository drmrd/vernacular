# Asset pack distribution: one library over a shared, hash-addressed store

Status: design, 2026-11-21. ADR-0229 (proposed) and ADR-0230 record the decisions behind it. The "Proposals" section lists what this document adds beyond them, and any of those points can still be corrected. Statements about the code were read from `main` at `e0f0c3a8`.

## What stays free

[ADR-0230](../knowledge/decisions/ADR-0230-vernacular-is-free-software-and-stays-free.md) holds the project's commitment to its users, and it binds this design. Every feature of the software is free. A project always exports in the open `.building` format with no account. Anyone may host every service the app talks to, and the store in this document is such a service. The default library shows no paid item, locked item, price, upsell, or advertisement, and a published asset never loses rights.

## Why

Vernacular has a pack format, a pack tool, and a library panel, but no way to get furniture to a user. On `main`:

- The app knows one pack, holding one chair, at a fixed same-origin address (`STARTER_PACK_URL` in `app/create-asset-library-registry.ts`).
- The pack reader checks only `response.ok` (`storage/assets/fetch-pack-reader.ts`). The app never compares fetched bytes with the hash in the manifest.
- `LibraryItem` drops the license, the attribution, and the source link (`storage/assets/asset-source.ts`). There is no credits view, nothing writes `ATTRIBUTIONS.md`, and the library panel shows no thumbnail.
- A `.building` export leaves out every asset a library pack supplies (`packSuppliesFrom` in `storage/zip/needed-assets.ts`), and a project folder gets no pack assets (`DocumentStore.hashesToCopy`). The user has no say in it.
- The model loader registers no decoder (`engine/loaders/gltf-loader.ts`). Nothing evicts, pins, or measures cached assets, and the service worker caches nothing.
- There is no Settings screen, only a settings port and service (ADR-0180), and no setting says where a deployment's assets come from.

A non-technical person who wants a sofa should not have to learn what a pack is. The project also wants to ship permissively licensed third-party assets beside its own, to let people import packs, and to let anyone deploy the app with a library of their own.

## Goals

- One library. Every furniture model in the catalog shows in it with its thumbnail (textures stay out of the library, as ADR-0219 rules), and nobody installs a pack to get furniture. No text on the catalog path uses the word "pack".
- A model or texture downloads when first placed and then stays on the device. One toggle downloads the whole library for offline use.
- The app checks the sha256 of every downloaded file before it uses the file.
- People can import a pack from a file or an address, after one plain notice.
- The user decides whether a saved project carries its library assets. Either way it never opens with a silent gap.
- Every third-party asset is credited where its license asks: in the app, in saved projects, and on exported images.
- A deployer can point the app at another catalog, or at none, without a rebuild.
- Served assets use open standard formats with published schemas, which other tools can read and write.

## Non-goals

- The asset-preparation pipeline (conversion to binary glTF, scale checks, compression, thumbnails). It gets its own specification.
- A live host. See "Hosting requirements".
- Paid content. Nothing here designs it, and ADR-0230 binds any design that ever does.
- Pack format 2 of ADR-0219. It lands first under its own plan, and this design builds on it.
- A signed catalog, several catalogs at once, and a process for outside contributions to the project's own catalog.
- SPDX expressions with `OR`. An asset has one license identifier.
- Recording which license an asset had when it was placed (design specification section 7.5).
- A configurable name for the app itself.
- Code plugins. A pack holds data only.

## Constraints

- The layer rules of `.claude/rules.md` hold. Browser storage, `fetch`, and Web Crypto are used in `storage/` only and reach `session/` through ports.
- Downloading, caching, importing a pack, and choosing what a save embeds change no project. They dispatch no command and add no undo step.
- Every asset reference stays `(scope, contentHash)` (ADR-0007).
- An asset request carries no cookie, no credential, no query string, and no referrer.
- No new package is expected. The archive reader, the schema validator, and both decoders are already pinned dependencies.

## Design

The design is a pack catalog over one shared store of files named by hash. ADR-0229 records the alternatives that were not taken.

### Words used here

The **store** is the static files at the catalog address. A **blob** is one file in it, named by its sha256: a model, a texture, or a thumbnail. The **catalog** is the `catalog.json` the app is pointed at and the packs it lists. An **imported pack** is one the user added from a file or an address. The **device cache** is the blobs and manifests the app keeps in browser storage. The **default library** is the term of ADR-0230: what a person sees before adding a catalog or a pack, which is the starter set and the catalog the deployment is configured with.

### What the user sees

The user opens the library and sees every catalog item with its picture. They pick one and click the plan, and the piece is there. If its model was not on the device, the 3D view shows a plain box of the right size for a moment, and then the model.

```
+----------+  +----------+  +----------+  +----------+  +----------+
| [image]  |  | [image]  |  | [image]  |  | [image]  |  | [image]  |
|          |  |   38%    |  |    !     |  | offline  |  |          |
| Armchair |  | Sofa     |  | Lamp     |  | Dresser  |  | Settee   |
|          |  |          |  |          |  |          |  | J. Roe   |
+----------+  +----------+  +----------+  +----------+  +----------+
  ready, or     downloading   download      not on this   from an
  not yet                     failed;       device, and   imported
  downloaded                  click to      no connection pack
                              retry
```

- Online, a tile looks the same whether its model is on the device or not.
- Offline, a tile whose model is not on the device is dimmed. It can still be placed, and the piece shows its placeholder until a connection returns.
- A tile from an imported pack carries the pack's attribution name. A share-alike tile carries a "Share-alike" label. A tile with no thumbnail shows its name only.
- These are all the tile states. Every tile in the library can be placed.

The detail panel shows an item's name, size, license, author, source link, and origin (the catalog name or an imported pack's name).

The source filter today has All, Sample, and Yours (`editor/library/library-filter.ts`). It becomes All, the catalog name, Added, and Yours. The catalog name covers the catalog and the starter set, and reads "Built in" when no catalog is set. "Added" is imported packs. A license filter hides share-alike items. An item's source comes from where the app got its manifest, never from the pack id.

### The Settings screen

This plan builds a small Settings screen with two parts, Storage and Credits, on the existing settings port and service (ADR-0180). Where its entry sits in the shell follows the design language of ADR-0154.

```
Settings > Storage

Used on this device       1.2 GB of about 12 GB
  Your projects              40 MB
  Library items             1.1 GB   310 of 2,140 items
  Added packs                31 MB

[x] Keep everything available offline
    Downloading 412 of 2,140 items, about 3.4 GB more     [ Pause ]

Added packs
  parlor-furniture 1.2.0    Jane Roe    48 items   31 MB  [ Remove ]

Library address
  https://assets.example.org/   (Example Library)         [ Change ]
```

Remove takes an imported pack out of the library and deletes its blobs, except those a saved project uses.

### Deployment configuration

A deployment says where its catalog is and what to call it. The first of three levels that has a value wins:

1. The user's own "Library address" in Settings > Storage. This is how one person uses a mirror.
2. `deployment.json`, served beside the app's `index.html`. This is how a deployer sets the default.
3. Build-time values from `VITE_CATALOG_URL` and `VITE_CATALOG_NAME`.

```json
{
  "deploymentVersion": 1,
  "catalog": {
    "url": "https://assets.example.org/",
    "name": "Example Library"
  }
}
```

- The file comes first so that one built copy of the app serves any deployment. The build-time values let the development server and the tests run without it.
- The app fetches the file from its own origin at start, revalidates it each time, and keeps the last copy for offline starts. A missing file is normal. A missing `deploymentVersion` means 1.
- `"catalog": null` turns the catalog off, even when the build has a default.
- With no catalog at any level the app still works. The library holds the starter set, imported packs, and the user's own models, and the app makes no asset request. The library address still shows, so a user can add a catalog.

The catalog name is `catalog.name` from the deployment setting. When that is absent, or when the user set an address of their own, it is the optional `name` field of `catalog.json`, and failing that the host name of the address. It is shown as plain text, cut at 40 characters. The source filter, the detail panel, the Credits screen, and the import notice use it, and new text says "this app" where it means the app.

The app's own name is fixed in code today (`editor/shell/editor-shell.tsx`, `public/manifest.webmanifest`). Whatever a deployment is called, it keeps the app's license notices and every asset's credits.

### The store layout

```
<catalog address>/
  catalog.json
  manifests/sha256/<manifestHash>.json
  blobs/sha256/<contentHash>
  packs/<packId>-<version>/LICENSE
  packs/<packId>-<version>/NOTICE
  packs/<packId>-<version>/CHANGELOG.md
```

- `catalog.json` is the only file that ever changes.
- A manifest is the pack's `manifest.json`, byte for byte, stored under the sha256 of its bytes.
- A blob is stored under the sha256 of its bytes, with no extension. The algorithm is a path segment, so another can sit beside it later.
- `packs/` holds each pack version's three text files. The Credits screen links to them, and a save reads a `NOTICE` from there when a license asks for it to travel.
- A published file is never removed or replaced, except for a legal reason or a defect.

### `catalog.json`

```json
{
  "$schema": "https://drmrd.github.io/vernacular/schema/catalog/1/catalog.schema.json",
  "catalogVersion": 1,
  "name": "Vernacular",
  "packs": [
    {
      "packId": "vernacular-starter",
      "version": "1.1.0",
      "formatVersion": 2,
      "manifest": {
        "sha256": "5b1f0c9e7a3d4c2b8e6f1a0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b",
        "byteLength": 1836
      },
      "byteLength": 412672,
      "itemCount": 2
    },
    {
      "packId": "vernacular-starter",
      "version": "1.0.0",
      "formatVersion": 1,
      "manifest": {
        "sha256": "36275a9822b56a305e4fe4127b751ca382328ff29f4290edb00be28fc2af4b37",
        "byteLength": 663
      },
      "byteLength": 53,
      "itemCount": 1
    }
  ]
}
```

| Field               | Meaning                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `catalogVersion`    | Integer version of this file's layout. This document defines version 1.                                             |
| `packId`, `version` | As in the manifest. The version follows Semantic Versioning 2.0.0. Together they are the pack scope of ADR-0007.    |
| `formatVersion`     | The manifest's format version (ADR-0219). A manifest with none is format 1.                                         |
| `manifest`          | The manifest file's lower-case hex sha256 and its length in bytes. The file is at `manifests/sha256/<sha256>.json`. |
| `byteLength`        | Total length of the version's models, textures, and thumbnails. An upper bound, since pack versions share files.    |
| `itemCount`         | The number of assets in the version's manifest.                                                                     |

- `$schema` and `name` are optional. `catalogVersion` moves only when a reader of the earlier version would misread the file, and a reader ignores fields it does not know.
- A reader that meets an unknown `catalogVersion` keeps the last catalog it cached, or the starter set if it has none, and shows "A newer version of this app is available. Reload to update."
- A reader skips an entry whose `formatVersion` it does not know. For each pack id the library lists the newest version the reader can read. When it skipped any entry, the library shows "More items are available in a newer version of this app."
- A pack is read whole or not at all, as ADR-0219 rules.

### Manifests

The manifest is that of ADR-0219, with four optional fields on each asset: `byteLength`, `thumbnail`, `copyright`, and `changes`.

```json
{
  "contentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "byteLength": 19512,
  "thumbnail": {
    "contentHash": "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    "byteLength": 4096
  },
  "name": "Example armchair",
  "kind": "furniture",
  "mediaType": "model/gltf-binary",
  "license": "CC-BY-4.0",
  "attribution": "The Vernacular Contributors",
  "copyright": "Copyright 2026 The Vernacular Contributors",
  "sourceUrl": "https://example.org/vernacular/example-armchair",
  "eras": ["mid-century"],
  "categories": ["seating"],
  "dimensions": { "width": 760, "depth": 820, "height": 900 }
}
```

- `byteLength` is the length of the asset's file. The app uses it for size estimates and refuses a longer download.
- `thumbnail.contentHash` is the sha256 of the thumbnail file. In the pack folder the thumbnail stays at `thumbnails/<asset contentHash>.webp`, and in the store it is a blob under its own hash. Without this field the app has nothing to check a thumbnail against, so it shows none.
- `copyright` is the asset's copyright notice, shown in credits as given. `changes` says what the pack's author changed in someone else's work.
- Optional fields do not move the format version under the rule of ADR-0219. The pack tool checks `byteLength` and `thumbnail` against the files, and the publish step requires them for format 2 and later. A format 1 pack, such as starter pack 1.0.0, has neither field, so its items show no thumbnail.
- The app fetches a manifest once, checks its sha256 against the catalog entry, validates it with `validatePackManifest`, and keeps it for good. A manifest that fails either check is not used.

### What a served asset must be

How a file gets this way belongs to the preparation pipeline.

| Subject              | Rule                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models               | glTF 2.0 binary, `model/gltf-binary`: one self-contained `.glb` that refers to no outside file and passes glTF validation with no error.                                                           |
| Required extensions  | `extensionsRequired` may name only `EXT_meshopt_compression`, `EXT_texture_webp`, `KHR_mesh_quantization`, `KHR_texture_basisu`, and `KHR_texture_transform`. The pack tool refuses anything else. |
| Optional extensions  | Any ratified `KHR_materials_*` extension. A reader that does not know one still draws the base material.                                                                                           |
| Geometry compression | `EXT_meshopt_compression` with `KHR_mesh_quantization`, or none. The app does not read `KHR_draco_mesh_compression` from a pack, so it ships and tests one decoder.                                |
| Textures in a model  | KTX 2.0 through `KHR_texture_basisu`, WebP through `EXT_texture_webp`, or PNG and JPEG, the two images core glTF allows.                                                                           |
| Standalone textures  | `image/ktx2`, `image/png`, or `image/webp`, under the size rules of ADR-0219: each side a power of two from 64 to 2048 pixels, at most 8 MiB.                                                      |
| Thumbnails           | WebP, `image/webp`.                                                                                                                                                                                |

- A format 2 reader cannot draw a compressed model and would refuse `image/ktx2`. Under the rule of ADR-0219, compressed models and KTX 2.0 textures are therefore format 3: format 2 plus the rules above. Uncompressed models stay valid, so a pack made with simple tools still works.
- A digest is sha256 as 64 lower-case hex characters, as asset references and `.building` archives already use. The app computes each one with Web Crypto. It does not use the `integrity` option of `fetch`, which fails with a plain network error, because the app must tell a damaged file from a lost connection.
- Both decoders ship inside the pinned `three` package. The app serves them from its own origin, loads each when the first file needs it, and precaches them.
- JSON Schemas will be published as the project format's is today, under `schema/catalog/<catalogVersion>/`, `schema/pack-manifest/<formatVersion>/`, and `schema/deployment/1/`, guarded by `pnpm schema:check`. The types in `core/assets/` stay the source of truth, and the copy in the repository is the canonical one. The schemas carry the code's license, Apache-2.0. Each schema's `$id` uses the public base of the project format's schemas, for example `https://drmrd.github.io/vernacular/schema/catalog/1/catalog.schema.json`, and the address is the same for every deployment.

### How the app builds the library

1. At start, the app lists the starter set from the files bundled with it. This needs no network.
2. It loads the last catalog it cached and the manifests it holds, and lists their items.
3. Online with a catalog set, it fetches `catalog.json` and any manifest it lacks, and updates the list.
4. It adds the items of imported packs, from the manifests kept at import.
5. Thumbnails load as tiles come into view. Each is checked against its hash and then kept.

The library shows one tile for each content hash, from the first source in this order: the user's own models, imported packs, the catalog, the starter set. This extends the order `AssetRegistry.list()` uses today. `LibraryItem` gains license, attribution, copyright, changes, source link, origin, and whether the license is share-alike.

### Download on demand

- When the user picks a tile, the app starts to download the model if the device lacks it.
- Placement never waits. The footprint and height come from the manifest, so the place-furniture tool and the `placeFurniture` command work as today. The engine already draws a box for a piece whose model has not loaded (`buildFurnitureMassing` in `engine/scene/furniture-builder.ts`) and swaps in the model when it arrives.
- A texture downloads the first time a surface uses it.
- Opening a project downloads what it uses and the device lacks, with no prompt.

### Hash verification

Every file from the network is checked before anything else sees it. A manifest is checked against `manifest.sha256` of its catalog entry, a model or texture against the `contentHash` that named the request, a thumbnail against `thumbnail.contentHash` in the manifest, and each file of an imported pack against the hash that pack's manifest gives for it.

- The check is over the bytes as stored, after any transfer encoding is undone.
- A file that fails is thrown away. It is not written to the device cache, and no loader receives it. The app tries once more, asking the network to skip its cache. A second failure puts the item in the "could not be checked" state.
- `catalog.json` and `deployment.json` have no hash above them. HTTPS and the host protect them.
- A blob read from the device cache is trusted by its name, since it was checked when written.

### Resolving a reference

This extends design specification section 4.2 with one network step:

1. The exact scope, when a source on the device holds the hash.
2. The same hash in any other source on the device, in the order user, project, pack, bundled.
3. The store: `blobs/sha256/<contentHash>`, checked, then kept in the device cache. Skipped when no catalog is set.
4. The placeholder.

Step 3 of section 4.2, the same hash in another version of the same pack, is part of step 2 here, since each pack version is a source on the device.

The media type of fetched bytes comes from any manifest the app can read that lists the hash, and otherwise from the file's signature. One guard keeps the rule of ADR-0219: when the catalog lists the reference's exact pack version in a format the app cannot read, and no readable manifest lists the hash, the app does not use the bytes. The placeholder then says the item needs a newer app.

### The device cache

The cache keys blobs by content hash, as `AssetCache` does today. It also records each blob's size, when it was last used, and whether the store can supply it again.

- Every blob that a project saved in this browser uses is pinned and never evicted.
- A catalog blob that no saved project uses is evictable. When space runs short, the least recently used goes first.
- Blobs from imported packs, the user's own models, and assets embedded in projects are never evicted, because the device may hold the only copy.
- Manifests and thumbnails are small and are kept.

These rules change design specification section 5.8, which lets the cache evict cold custom assets first. Its thresholds stay. Before a download the app reads `navigator.storage.estimate()`. If the download would take usage past 95 percent of the quota, the app evicts until it fits, and if it still does not fit the item stays a placeholder with the "storage is full" notice. At 80 percent the app warns once in Settings > Storage. An import that would pass 95 percent is refused. The browser may clear the cache on its own, and the app treats a missing blob as not yet downloaded.

### Keep everything available offline

- The toggle first states the size: the sum of `byteLength` over the newest readable version of each pack, less what the device holds.
- Turning it on asks the browser for persistent storage, then downloads every catalog blob in the background. A reload continues where it stopped.
- While it is on, every catalog blob counts as pinned, and new catalog items download at the next online start.
- If space runs out, the download pauses and says how much more it needs.
- Turning it off deletes nothing. The blobs become evictable again.
- With no catalog set, the toggle is not shown.

### The starter set

A small pack stays in the app build, as `public/packs/vernacular-starter-<version>/` is today, and the service worker precaches it. It holds what the default scene needs and a small core of furniture. A catalog may list the starter pack too, and the hashes match, so the device keeps one copy. When the catalog has a newer starter version than the build, the library shows the catalog's.

### Importing a pack

A pack file is a zip archive of the pack folder of ADR-0219: `manifest.json`, `assets/`, `thumbnails/`, `LICENSE`, `NOTICE`, `CHANGELOG.md`. The pack tool's `build` command writes it. Two ways in:

- Drop a pack file on the app window. The drop target (`editor/shell/import-drop-target.tsx`) tells a pack file from a project file by its content.
- "Add a pack" in the library panel, with a file chooser and a field for an HTTPS address that names a pack file.

Steps:

1. The app reads the archive as an untrusted file, with the limits of ADR-0213.
2. It validates the manifest with `validatePackManifest`. An unknown format version, or a license outside `core/assets/license-policy.ts`, refuses the pack.
3. It checks the sha256 of every file the manifest names. One failure refuses the whole pack.
4. It refuses a pack whose id is the id of a catalog pack.
5. It shows the notice. Nothing is stored before the user clicks Add.
6. On Add, it stores the manifest and the blobs, and records the pack's id, version, manifest hash, origin, and date.

The notice, where the catalog name is "Example Library":

```
+----------------------------------------------------------------+
| Add these items to your library?                               |
|                                                                |
| Pack      parlor-furniture 1.2.0                               |
| From      parlor-furniture-1.2.0.zip, a file on this device    |
| By        Jane Roe                                             |
| Items     48 (31 MB)                                           |
| Licenses  CC0-1.0 (40 items)                                   |
|           CC-BY-SA-4.0 (8 items, share-alike)                  |
|                                                                |
| This pack is not from Example Library.                         |
|                                                                |
|                                         [ Cancel ]   [ Add ]   |
+----------------------------------------------------------------+
```

- With no catalog set the sentence reads "This pack comes from outside this app."
- The same pack version added twice does nothing the second time. A newer version is added beside the older one, and the library shows the newer.
- An imported pack is complete on the device once added. From the manifest onward it uses the same validator, library merge, cache, and resolution as a catalog pack.

### Saving a project: the user chooses what travels

A saved project can carry the library assets it uses or leave them out. One rule covers every library asset, whatever catalog or pack it came from, and every save that leaves browser storage: a `.building` file and a project folder on disk.

```
+----------------------------------------------------------------+
| Save a project file                                            |
|                                                                |
| (o) Include everything                               18.4 MB   |
|     The file opens on any device, with or without a            |
|     connection.                                                |
|                                                                |
| ( ) Keep the file small                               0.3 MB   |
|     Furniture and textures from the library are left out.      |
|     The other person's app downloads them when it opens        |
|     the file.                                                  |
|     6 items come from a pack you added. They show as           |
|     placeholders unless the other person adds that pack too.   |
|                                                                |
| Credits: 14 items by 3 authors.            [ See the list ]    |
|                                                                |
|                                  [ Cancel ]   [ Save file ]    |
+----------------------------------------------------------------+
```

The user's own models and the project's own assets are always embedded.

The default is "Include everything". Such a file opens complete offline, on a deployment with another catalog or none, and after a host is gone. The cost is size, so the dialog shows both sizes.

- The dialog appears on each `.building` export and opens on the project's last choice. A project folder asks once, when the folder is chosen, and the user can change it later. The choice is a device preference in the settings service, not part of the document.
- `neededAssetHashes(project, packSupplies?)` already has both behaviors. "Include everything" passes no `packSupplies`, and "Keep the file small" passes it as today's export does. The folder save follows the same rule in place of today's copy of non-pack assets only.
- "Include everything" first downloads any blob the device lacks, with progress.
- "Keep the file small" states how many items no catalog pack lists, since the recipient's app cannot download those.
- References keep their `pack:<id>@<version>` scope either way. Embedded bytes sit at `assets/<hash>`, with no extension, as today.
- Embedding an asset shares it, so the save writes `ATTRIBUTIONS.md`, and a save that embeds a share-alike asset asks for the confirmation of design specification section 4.8.
- The saved project carries a credit record for each third-party asset it embeds: name, license, attribution, copyright, changes, source link, pack id, and version. Without it a second save would lose the credit that CC-BY requires. The record is the `assetIndex` name that the floor-plan format specification reserves (its section 6.5). Defining it changes the published format, so the format specification, its schema, and an ADR change before this save ships.

The recipient's app resolves each item as "Resolving a reference" describes: from the file, then from the device, then from its own catalog by hash with no prompt. An item it cannot get shows a labeled placeholder. Opening a file adds no pack to the recipient's library. Embedded assets belong to that project.

The placeholder keeps the item's footprint in the plan and its box in 3D, and carries a label:

```
Plan                          3D
+ - - - - - - - - - +         a plain box of the item's width, depth, and
|  Sofa             |         height, with the same label on a tag
|  downloading      |
+ - - - - - - - - - +
```

| State                                | Label                               | What the user can do          |
| ------------------------------------ | ----------------------------------- | ----------------------------- |
| On its way                           | "Downloading"                       | Wait                          |
| No connection                        | "Will download when you are online" | Reconnect                     |
| Hash mismatch, twice                 | "Could not be checked"              | Retry                         |
| Not in the file and not in the store | "Not included in this file"         | Ask the sender, or replace it |
| The pack needs a newer app           | "Needs a newer version of this app" | Reload to update              |

When a project opens with any placeholder, one notice gives the count and the reason. Today's missing-assets warning (`importMissingAssetsText`) no longer counts catalog items that are on their way.

### Attribution

- The detail panel shows each item's license, author, and source link.
- The Credits screen, the second part of Settings, lists every third-party asset in the library by author and license, and first-party assets as one group. It reads cached manifests, so it works offline.
- Every `.building` file and project folder gets an `ATTRIBUTIONS.md` for the assets the project uses, embedded or not. Each entry gives the title, the creator, the copyright notice, the source link, the license with its address, the license's notice that disclaims warranties, and any changes. When a license asks for its text or a notice to travel with a copy (MIT, the BSD licenses, Apache-2.0), the file carries that text, and for Apache-2.0 the pack's `NOTICE`. The floor-plan format specification already requires this file, and nothing writes it today.
- An image or PDF export that pictures a CC-BY or CC-BY-SA asset gets one small credit line that points to the full credits, such as `Furniture: The Vernacular Contributors, Jane Roe (CC BY 4.0). Full credits: ATTRIBUTIONS.md in the project file.` Today's exports draw footprint outlines only, so they carry no line yet.
- A change of file format or compression alone needs no `changes` entry. A change to the shape or look of a work does.
- CC0 assets are listed in Credits and in `ATTRIBUTIONS.md`, and never in a credit line.

### Licenses

- First-party assets, and assets that code in the repository generates, are CC-BY-4.0 and not dual licensed. Their licensor is "The Vernacular Contributors", as in the repository's `NOTICE`. Starter pack 1.0.0 says "Vernacular project" and cannot change.
- Generated assets are CC-BY-4.0 to the extent copyright applies to them. The generator's code stays under Apache-2.0, and running it yourself places no license condition on its output.
- ADR-0219 gave the generated grass of starter pack 1.1.0 the license CC0-1.0. The grass has not shipped, and it ships as CC-BY-4.0. The chair of starter pack 1.0.0 was published as CC0-1.0 and stays CC0.
- The license is manifest metadata, and the content hash covers the file's bytes only. A new pack version can name a new license. The store gains one manifest, and no device downloads a file again.
- A license change only grants more rights (ADR-0230). The allowed moves are any license to CC0-1.0, and a share-alike license to the attribution license of the same version. The publish step refuses any other change to the license of a published hash.
- When published manifests list one hash under different licenses, credits show the most permissive of them, so an asset keeps every right it was ever published with.
- Share-alike applies to the asset and to changes made to it. A share-alike item does not change the license of the plan it sits in. A saved file that embeds the item carries it under its share-alike terms.
- The app reads only packs whose every asset names one license on the allowlist of `core/assets/license-policy.ts`, and the catalog format has no field for content under other terms. Every license on the allowlist lets a person embed the asset in a project and share it with anyone for any purpose, and lets each recipient open, edit, and share it again. The embedding choice relies on that.
- A pack's own `license` and `attribution` fields cover its manifest and text files. Each asset's own fields govern that asset, so one pack can mix licenses, as starter pack 1.1.0 does with a CC0-1.0 chair and CC-BY-4.0 grass.
- For the starter set, the pack tool writes a `REUSE.toml` from the manifest and checks that the two agree. License texts sit in `LICENSES/` at the repository root, and a pack's `LICENSE` file holds the full text of every license its assets use. The repository as a whole does not yet pass a REUSE check.

### Hosting requirements

This plan sets up no host. The publish step writes a store directory, and the development server and the tests serve it from the app's own origin. Until a host exists, the project's own build sets no catalog address. The provider, the domain, upload automation, and the first published catalog come later, with the first deployment of the app.

Any host of a store must:

- Serve over HTTPS only.
- Send `Access-Control-Allow-Origin: *` for `GET` and `HEAD` on every path. This lets a deployment on another origin, a mirror, and a local build read the store.
- Send `Cache-Control: public, max-age=31536000, immutable` for manifests, blobs, and the `packs/` text files.
- Send `Cache-Control: no-cache` with an `ETag` for `catalog.json`.
- Send the manifest's media type as `Content-Type` (`model/gltf-binary`, `image/ktx2`, `image/webp`, `image/png`, and `application/json` for manifests and the catalog), with `X-Content-Type-Options: nosniff`.
- Leave file bytes unchanged. Compression in transit is fine.
- Set no cookies, and let request logs be turned off.

This plan also writes a short deployment guide under `docs/`. It covers the store layout, the headers above, the upload order, `deployment.json`, and how to mirror a store.

### Publishing and mirroring

- The pack tool gains a publish step. It validates each pack, copies each file to its hash path, writes the manifest under its hash, and adds the entry to `catalog.json`, all in a local directory. Anyone can run it to build a store of their own.
- The upload order is blobs, then manifests, then `catalog.json`, so a catalog never names a file that is not there yet.
- The pack tool also gains a mirror command. It reads a store's catalog, manifests, and blobs, checks every hash, and writes a complete copy.

### What the user sees when something fails

| Situation                                           | What the user sees                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Offline at first placement, or store unreachable    | The piece is placed. Its placeholder says "Will download when you are online", and one notice says the same. The download starts later. |
| Offline at first launch, no catalog cached          | The starter set, and one line: "Connect to the internet to see the full library."                                                       |
| Hash mismatch on a model or texture                 | After one silent retry: "This item did not download correctly, so it was not used." The tile and the placeholder offer Retry.           |
| Hash mismatch in an imported pack                   | "This pack file is damaged or was changed. Nothing was added."                                                                          |
| Storage is full                                     | "This device is out of space for more library items." The notice links to Settings > Storage.                                           |
| A catalog pack needs a newer app                    | The pack is not listed. The library shows "More items are available in a newer version of this app."                                    |
| An imported pack needs a newer app                  | "This pack needs a newer version of this app. Nothing was added."                                                                       |
| An import with a license outside the policy         | "This pack has items under a license this app cannot share." The message names the license. Nothing is added.                           |
| The address cannot be read                          | "That address could not be downloaded. Download the file yourself and drop it here."                                                    |
| "Include everything" while items are not downloaded | "3 items are not on this device yet. Connect to the internet to include them, or save the small file."                                  |

### Where the code lives

- `core/`: catalog and deployment validators, the newest-readable-version rule, format 3, the new manifest fields, attribution text.
- `storage/`: the verified fetch of catalogs, manifests, and blobs, the device cache with pins and eviction, quota reads, the pack file reader, the precache.
- `session/`: a library service over ports, with the merged list, download states, import, the offline job, and the save choice.
- `engine/`: the two decoders and the placeholder's labeled states.
- `bridge/` and `editor/`: React adapters, tiles, the detail panel, the import notice, the save dialog, the Settings screen.
- `app/`: reads `deployment.json` and the build values, and wires the catalog into the registry.
- `scripts/` and `docs/`: the pack tool's new commands, schema generation, the deployment guide, and the `assetIndex` format change with its ADR.

The design specification is not edited in this change. ADR-0229 lists how its sections 4.1, 4.2, 4.3, 4.8, and 5.8 read after this design.

## Proposals

ADR-0229 and ADR-0230 record what is decided. The points below are this document's own. The plan builds them as written unless one is corrected first.

| #   | Proposal                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Four attribution surfaces: the detail panel, the Credits screen, `ATTRIBUTIONS.md`, and a credit line on exports that picture an asset. |
| 2   | The library address is also a user setting.                                                                                             |
| 3   | A small starter set stays bundled and precached.                                                                                        |
| 4   | Assets of saved projects are pinned. Other catalog blobs are evicted, least recently used first.                                        |
| 5   | Share-alike is an item label and a library filter, with no global setting.                                                              |
| 6   | The catalog lists every published pack version. The library shows the newest readable one and says when it skipped any.                 |
| 7   | The project counts no downloads and keeps request logs off.                                                                             |
| 8   | Four optional manifest fields: `byteLength`, `thumbnail`, `copyright`, `changes`.                                                       |
| 9   | A pack file is one zip archive. A pack with a catalog pack's id is refused.                                                             |
| 10  | Saved projects carry a credit record in the reserved `assetIndex`.                                                                      |
| 11  | Placing an item does not wait for its download.                                                                                         |
| 12  | The allowed license moves, the publish step's check, and credits that show the most permissive license.                                 |
| 13  | Settings > Storage lists imported packs with a Remove button.                                                                           |
| 14  | Offline, a tile whose model is not on the device is dimmed.                                                                             |
| 15  | `deployment.json` comes before the build-time values.                                                                                   |
| 16  | The catalog name comes from the deployment setting, then `catalog.json`, then the address.                                              |
| 17  | "Include everything" is the default, remembered for each project.                                                                       |
| 18  | "Keep the file small" counts the items the recipient cannot download.                                                                   |
| 19  | One geometry compression: `EXT_meshopt_compression` with `KHR_mesh_quantization`.                                                       |
| 20  | Compressed models and KTX 2.0 textures are pack format 3.                                                                               |
| 21  | Digests stay lower-case hex, and thumbnails stay WebP.                                                                                  |
| 22  | Schemas for the catalog, the manifest, and the deployment file under `schema/`.                                                         |
| 23  | A generated `REUSE.toml` for the starter set, with license texts in `LICENSES/`.                                                        |
| 24  | The licensor name "The Vernacular Contributors". Generated assets are CC-BY-4.0 to the extent copyright applies.                        |
| 25  | A mirror command in the pack tool.                                                                                                      |
| 26  | A format or compression change alone needs no `changes` entry.                                                                          |
| 27  | A model may carry JPEG and WebP images as well as PNG and KTX 2.0.                                                                      |
| 28  | A pack's own license covers its metadata, and each asset's license governs that asset.                                                  |

## Follow-ups to file

ADR-0229 lists what stays open. These points come on top of that list.

- The host, with the first deployment of the app. Before a store holds third-party assets, the project publishes a contact for license complaints and a rule for taking a file down.
- Amend sections 4.1, 4.2, 4.3, 4.8, and 5.8 of the design specification as ADR-0229 describes.
- `CONTRIBUTING.md` gains a clause for contributed assets, and the license section of `README.md` names the asset licenses beside Apache-2.0.
- A configurable app name, a policy on what a renamed deployment may call itself, and an About entry with the app's license notices.
- A REUSE check that the whole repository passes.
- Publish what the project's catalog accepts and how to suggest an asset.

## Left to the builder

- The name and extension of the pack file, the names of the pack tool's new commands, and the exact names of the build-time variables and the deployment file.
- Where the device cache keeps sizes, last-use times, and pins, and whether pins are stored or computed from saved projects.
- How projects kept in a folder on disk count toward pins, and where the folder choice is offered again.
- The number of parallel downloads, the retry timing, and how progress is drawn.
- When the catalog and `deployment.json` are fetched again during a long session.
- The size budget of the starter set.
- Whether the schemas are generated from the types or checked against the hand-written validator.
- Whether the publish step writes files already compressed for transfer.
- The wording of every label and notice above. The sketches show intent, not final text.
- The order of work. One workable order: the verified fetch and the store reader; the catalog, the deployment setting, and the merged library; tile states and thumbnails; the cache rules and the Settings screen; the save choice and placeholders; import; attribution surfaces; the decoders and format 3; the publish step, the mirror command, the schemas, and the deployment guide.
- If the service worker's shell precache is not built when this work starts, the smallest precache that serves the starter set and the decoders.
