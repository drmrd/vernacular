---
slug: decisions/ADR-0007-content-addressed-assets
title: 'ADR-0007: Content-addressed asset references'
type: decision
tags: [architecture, assets, references, integrity, supply-chain]
related:
  [
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0037-image-underlay-and-calibration,
  ]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md, core/model/asset-reference.ts]
status: current
updated: 2026-06-07
---

# ADR-0007: Content-addressed asset references

## Status

Accepted. The `AssetReference` shape and its serialization round-trip are
implemented in `core/model/asset-reference.ts`. The aggregating `AssetRegistry`
and its resolution algorithm are not implemented yet.

## Context

A project references many external pieces (furniture models, underlay images,
paint palettes). Sharing a project should not break references; renaming an
asset, switching pack versions, or moving a custom model between machines should
resolve gracefully. Path-based references fail all three. Hash-based references
(`sha256:...`) work but make project files opaque.

## Decision

Every asset reference is the pair `(scope, contentHash)`:

- `scope` is one of `pack:<id>@<version>` (a curated or community pack), `user`
  (the user's personal library), or `project` (embedded in this project's
  `assets/`).
- `contentHash` is a sha256 over the asset bytes.

The `AssetRegistry` aggregates all sources and resolves a reference with
graceful degradation: exact match first, then hash match in any other source,
then pack-version fallback, then a clearly-labeled placeholder with the correct
footprint so editing continues.

## Current implementation state

`core/model/asset-reference.ts` defines the data shape and its string form:

- `AssetScope` is the template-literal union `` `pack:${string}@${string}` ``,
  `'user'`, or `'project'`, encoding the three scope kinds at the type level.
- `AssetReference` is `{ scope: AssetScope; contentHash: string }`.
- `formatAssetReference(reference)` serializes to `${scope}#${contentHash}`
  using `#` as the separator.
- `parseAssetReference(serialized)` splits on the last `#`, so a `#` appearing
  inside the scope is tolerated and the trailing segment is always the hash. A
  string with no separator throws a "Malformed asset reference" error. The scope
  is validated only structurally at the parse boundary; callers treat the
  result as opaque until it is resolved.

The aggregating `AssetRegistry` and the full resolution-with-fallback algorithm
remain unimplemented; only the reference value object exists today. The image
underlay (ADR-0037) is the first feature to mint and carry an `AssetReference` in
practice: it builds a `(scope: 'project', contentHash)` reference from the SHA-256
of the loaded image bytes. Because the `AssetCache` and the project-store `assets/`
writeback are not yet wired, the underlay holds its decoded bitmap in memory for the
session only and does not yet round-trip through save/open; the content-addressed
reference makes that a storage-side change behind the same reference when the
pipeline lands.

## Consequences

- Renaming a pack does not break projects.
- A user who imports a custom model and shares the project carries that model
  along (it lives in `project` scope), so the recipient gets the same scene.
- Deduplication is automatic. If two packs ship the same hash, the cache stores
  it once. The `storage/` `AssetCache` interface (`has`, `get`, `put` keyed by
  `contentHash`) is the dedup surface.
- License and attribution travel with the source record. The export pipeline can
  audit them without parsing the project.

## References

- Design specification, section 4.2 (Resolution precedence and fallback) and 4.3
  (Asset pack format).
- ADR-0003 (storage providers, where references live and resolve).
- ADR-0037 (the image underlay, the first feature to mint and carry an
  `AssetReference`; its raster-persistence open question waits on the `AssetCache`).
