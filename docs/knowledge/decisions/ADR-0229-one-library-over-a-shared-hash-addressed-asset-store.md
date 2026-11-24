---
slug: decisions/ADR-0229-one-library-over-a-shared-hash-addressed-asset-store
title: 'ADR-0229: One library over a shared hash-addressed asset store'
type: decision
tags: [architecture, assets, packs, distribution, licensing, catalog, deployment, formats]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0047-published-floor-plan-data-format-standard,
    decisions/ADR-0091-pack-integrity-and-build-pipeline,
    decisions/ADR-0093-in-app-asset-library,
    decisions/ADR-0213-an-archive-is-read-as-an-untrusted-file,
    decisions/ADR-0219-pack-assets-carry-textures,
    decisions/ADR-0230-vernacular-is-free-software-and-stays-free,
  ]
sourceFiles:
  [
    docs/specs/2026-11-21-asset-pack-distribution.md,
    app/create-asset-library-registry.ts,
    storage/assets/fetch-pack-reader.ts,
    storage/assets/pack-source.ts,
    storage/assets/asset-source.ts,
    storage/asset-cache.ts,
    storage/zip/needed-assets.ts,
    core/assets/pack-manifest.ts,
    core/assets/license-policy.ts,
    engine/loaders/gltf-loader.ts,
  ]
status: proposed
updated: 2026-11-21
---

# ADR-0229: One library over a shared hash-addressed asset store

## Status

Proposed. The project owner took the decisions below on 2026-11-21. Nothing is built yet. The
design is in `docs/specs/2026-11-21-asset-pack-distribution.md`. That document also makes smaller
proposals of its own, listed in its "Proposals" section. They are not decisions, and this record
does not carry them.

## Context

The application has a pack format (ADR-0091, ADR-0219), a library panel (ADR-0093), and
content-addressed asset references (ADR-0007). It has no way to deliver assets to a user. On
`main`:

- The application knows one pack, at a fixed same-origin address
  (`app/create-asset-library-registry.ts`). The pack holds one chair.
- The reader fetches a pack file by file and checks only that each response succeeded
  (`storage/assets/fetch-pack-reader.ts`). It never compares the bytes with the hash in the
  manifest. ADR-0219 lists that check as open.
- The library item drops the license, the attribution, and the source link
  (`storage/assets/asset-source.ts`). There is no credits view, and no export writes
  `ATTRIBUTIONS.md`.
- A `.building` export leaves out every asset a pack supplies (`storage/zip/needed-assets.ts`),
  and the user has no say in it.
- Nothing pins or evicts cached assets, and no setting says where a deployment's assets come from.

A non-technical person should get furniture with no friction and no knowledge of packs. The project
also wants third-party CC0 and CC-BY assets beside first-party ones, packs that people can import,
and deployments with libraries of their own. All of it sits inside the commitment of ADR-0230.

## Decision

### The commitment of ADR-0230 binds this design

[[ADR-0230-vernacular-is-free-software-and-stays-free]] says what stays free. This record does not
restate it. Two of its points shape the library directly:

- The default library shows no paid item, no price, no locked tile, no upsell, and no
  advertisement.
- Nothing in the default library needs an account.

### One library over a pack catalog and a shared store

- The user sees one library and no packs. Thumbnails show at once. A model or texture downloads
  the first time it is placed, and then stays on the device. A setting, "Keep everything available
  offline", downloads the rest.
- A pack stays the author's unit of authoring, versioning, and license tracking.
- A small `catalog.json` at the catalog address lists packs: the id, the version, the format
  version, the size, and the sha256 of the manifest.
- A manifest is stored under its own hash and never changes. The application caches it for good.
- Every model, texture, and thumbnail is stored once, in a shared store addressed by content hash.
  Pack versions that share a file share one copy.
- A reference names a hash, and the application fetches that hash directly.
- The library merges two sources: the catalog, and packs the user imports from a file or an
  address. Imported items carry a small source label, and the library has a source filter. From
  its manifest onward, an imported pack takes the same code path as a catalog pack.
- Only the project's maintainers add assets to the project's own catalog. There is no contributor
  process yet. Other people share their work as packs to import.

### Every fetched file is checked

- The application checks the sha256 of every file it downloads, from the catalog or from an
  import, against the manifest.
- On import, one plain notice names the source, the item count, and the licenses, and says the
  pack does not come from the catalog. The user clicks Add once.
- HTTPS protects the catalog. It is not signed for now, and signing it is a follow-up.

### What a saved project embeds is the user's choice

- The user chooses whether a saved project carries the library assets it uses. One rule covers
  every library asset, whatever catalog or pack it came from.
- An item that is not embedded is fetched by hash from the recipient's catalog when the catalog
  has it, with no prompt.

### A deployment sets its own catalog, and served files use standard formats

- The default catalog is deployment configuration, so a deployment can serve a library of its own
  under its own name.
- Assets, the catalog, and the manifest use open standard formats that other tools can read and
  write. The specification names them.

### First-party assets are CC-BY-4.0

- First-party assets, and assets that code in the repository generates, carry CC-BY-4.0. They
  are not dual licensed.
- ADR-0219 gave the generated grass of starter pack 1.1.0 the license CC0-1.0. This record
  replaces that one rule. ADR-0219 is still proposed and the grass has not shipped, so it ships as
  CC-BY-4.0. ADR-0219 and its plan now point here, and the rest of ADR-0219 stands.
- The license is manifest metadata, and the content hash covers the file's bytes only. A new pack
  version can name a new license while every file keeps its hash. A license change may only grant
  more rights (ADR-0230).
- The chair of starter pack 1.0.0 was published as CC0-1.0, and that hash stays CC0 for good.
  Starter pack 1.1.0 does not carry it. A new chair from the generator in the repository, with
  new bytes and a new hash, takes its place under CC-BY-4.0, so the starter set has one license.
  ADR-0219 said that 1.1.0 keeps the old chair, and this record replaces that one rule.
- The old chair stays published in starter pack 1.0.0, and the app build keeps its file, so a
  project that uses it still opens with no network. The library lists only the newest starter
  version, so the old chair no longer shows there. It was a placeholder, and it stays free under
  CC0-1.0.
- The source files of every first-party catalog asset are public in a repository, under the
  asset's license: the modeling file, the original textures, and any generator input. The served
  files are public there too, so the library does not depend on one host. Which repository is still open.
- SPDX expressions with `OR` are not supported for now.

### Hosting

- The store is static files, and it must send CORS headers.
- A live host is not part of the first plan. The work is built and tested against a local store
  and same-origin test files, and it includes a deployment guide. Host setup comes later, with the
  first deployment of the application.

### Scope

- This decision covers distribution only. The asset-preparation pipeline gets its own
  specification.
- Pack format 2 of ADR-0219 lands first under its own plan. This design builds on it.

### How the design specification reads from now on

This change does not edit the design specification. This record carries the decision until a
later change amends the text.

- Section 4.1 says `PackSource` reads "versioned asset packs from a CDN". In practice it reads
  pack manifests from the catalog or from an import, and files from the shared store by hash.
- Section 4.2 gains the network step.
- Section 4.3 rests trust on the user's choice to install a pack. The run-time hash check now
  stands beside it.
- Section 4.8 gains the user's choice of what a saved project embeds.
- Section 5.8 lets the cache evict cold custom assets first. Assets from imported packs, the
  user's own models, and assets embedded in projects are now never evicted, because the device
  may hold the only copy.

## Alternatives considered

None of these was taken.

- **One flat merged index of all items.** One request would fill the library, so the first paint
  is the fastest. But an imported pack does not fit a merged index and would need a second code
  path, and a pack's version, which license tracking hangs on, would be harder to see.
- **One folder for each pack version, as today.** No new layout. But a reference names a hash,
  not a folder, so the application would search every pack for it, and each version would store
  and serve its unchanged files again.
- **Decide embedding by where an asset came from.** Catalog assets would stay out of the file and
  imported ones would be embedded, with no question to the user. But such a file depends on a host
  the recipient may not reach, and a deployment with another catalog would open it with
  placeholders.
- **Keep CC0 for generated assets.** ADR-0219 chose it. One license for all first-party assets is
  simpler to state and to credit.

## Consequences

- The fixed starter address in `app/` gives way to a catalog. The library, the cache, and the
  export all change.
- `LibraryItem` must carry the license, the attribution, and the source link.
- The asset cache must know which assets a saved project uses, and the application must read the
  storage quota.
- Saving a project gains a choice, and a save that embeds everything may download first.
- A published file stays in the store unless a legal reason or a defect removes it, so the store
  only grows.
- The host sees the address of each request, as any web server does.

## What stays open

- Signing the catalog with Ed25519 and refusing a bad signature.
- The asset-preparation pipeline, which gets its own specification.
- The host: where the store lives, and its setup.
- The public repository for the source files and served files of first-party catalog assets.
- The proposals of the specification, which the owner may still correct.
- The text of the design specification, sections 4.1, 4.2, 4.3, 4.8, and 5.8.

## References

- `docs/specs/2026-11-21-asset-pack-distribution.md`
- `docs/specs/2026-06-01-vernacular-design.md`, sections 4.1, 4.2, 4.3, 4.8, and 5.8
- `docs/specs/2026-06-10-vernacular-floor-plan-format.md`
- [[ADR-0007-content-addressed-assets]]
- [[ADR-0047-published-floor-plan-data-format-standard]]
- [[ADR-0091-pack-integrity-and-build-pipeline]]
- [[ADR-0093-in-app-asset-library]]
- [[ADR-0213-an-archive-is-read-as-an-untrusted-file]]
- [[ADR-0219-pack-assets-carry-textures]]
- [[ADR-0230-vernacular-is-free-software-and-stays-free]]
