---
slug: decisions/ADR-0235-a-catalog-identifier-names-an-asset-beside-its-content-hash
title: 'ADR-0235: A catalog identifier names an asset beside its content hash and never replaces the reference'
type: decision
tags: [architecture, assets, packs, taxonomy, identifiers, validation, formats]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0091-pack-integrity-and-build-pipeline,
    decisions/ADR-0178-schema-version-and-revision,
    decisions/ADR-0181-millimetre-numbers-and-one-tolerance-model,
    decisions/ADR-0188-project-id-address-and-index-record,
    decisions/ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back,
    decisions/ADR-0219-pack-assets-carry-textures,
    decisions/ADR-0229-one-library-over-a-shared-hash-addressed-asset-store,
    decisions/ADR-0230-vernacular-is-free-software-and-stays-free,
    decisions/ADR-0234-assets-are-classified-by-domain-and-tier-and-references-point-down,
    decisions/ADR-0236-asset-contracts-are-optional-manifest-fields-in-millimeters,
  ]
sourceFiles:
  [
    docs/specs/2026-11-23-asset-taxonomy.md,
    core/model/asset-reference.ts,
    core/model/types.ts,
    core/model/factories.ts,
    core/assets/pack-manifest.ts,
    core/assets/asset-resolution.ts,
    bridge/react/furniture-model-cache.ts,
  ]
status: current
updated: 2026-11-23
---

# ADR-0235: A catalog identifier names an asset beside its content hash and never replaces the reference

## Status

Current, 2026-11-23. Nothing is built yet. The grammar is in `docs/specs/2026-11-23-asset-taxonomy.md`.
On 2026-11-23 the owner ruled that the identifier is metadata and never a key, that an asset keeps
a version of its own, that the `mfr_` namespace is reserved and refused, that the text form of a
sub-resource uses a tilde, that stored element ids keep their form, and that the project id stays
out of the document.

This record depends on ADR-0229 and ADR-0230, which are in an open pull request (#1054), and on
ADR-0181, ADR-0199, and ADR-0201 to ADR-0203, which are on `main`. The decisions here that build on
ADR-0229 and ADR-0230 take effect when those records land.

## Context

A project refers to an asset by `(scope, contentHash)` (ADR-0007). The type is in
`core/model/asset-reference.ts`: the scope is `pack:<packId>@<version>`, `user`, or `project`, the
written form is `scope#contentHash`, and the reader splits it at the last number sign. Resolution
walks the scopes in order of precedence and falls back to a placeholder when the bytes are missing.
A project that names a hash in one pack version still finds the asset in a later version that
carries the same bytes, and the library shows one tile for one hash (ADR-0229).

A hash works as a key, but nobody can read it or remember it. The taxonomy of ADR-0234 needs a name
in four places:

- a socket says which assets it accepts;
- a deprecated asset says what replaces it;
- an asset lists the assets it depends on, and the pack tool checks their ranks;
- a message tells an author which entry is wrong.

A readable name with a version, in the shape `namespace:DOMAIN.subcategory/slug@version`, covers all
four. The risk is that the name becomes a second identity. If a project stored it, or the app
resolved bytes by it, the name and the hash could disagree, and every guarantee of ADR-0007 would
need a second proof.

The same question comes up for the ids of placed elements. Every element id in a project is a random
UUID with no prefix (`core/model/factories.ts`), and the kind of an element is known from where it
sits in the document. Ids are held by `Opening.hostWallId`, by the keys of the paint map and the
room overrides, and by stair connections (`core/model/types.ts`, `core/model/paint.ts`). ADR-0188
keeps the project id out of the document on purpose, so that one file imported twice makes two
projects.

## Decision

### The identifier is metadata

A manifest entry may carry a catalog identifier in an optional field, `catalogId`. The identifier is
used to name, group, search, and check assets. It is never a key:

- a project does not store it as a reference;
- the app does not resolve bytes by it;
- no cache is keyed by it.

The reference stays `(scope, contentHash)`, unchanged in type and in written form. ADR-0007 gains a
note that points here. Its decision does not change.

### The grammar

```text
<namespace>:<DOMAIN>.<subcategory>/<slug>@<version>
```

The domain and subcategory are those of ADR-0234. The slug names the fixed form of the thing. The
version is Semantic Versioning 2.0.0 without build metadata. The specification has the exact pattern
and the limits on each part.

A slug holds no paint color, no run length, no host depth, and no phase of the building. Those
belong to the place where the asset is used, and a slug that held them would multiply entries for
one shape.

### An asset has a version of its own

The version in the identifier is the asset's. The pack that carries it has a separate version. One
identifier, version included, names one content hash in every pack and every store. The rest of the
entry can differ, because a new pack version may change the license or the credit of a file whose
bytes stay the same (ADR-0229). The pack tool refuses a pack that uses one identifier twice,
and the publish step refuses a pack whose identifier is already in the store with another
hash.

A major version changes when a user of the asset could be broken: its pivot, its bounding
dimensions, a texture's tile size, its set of slots, sockets, ports, or articulation axes, or the
thickness of a layered assembly. An asset that replaces another names it with a higher version or
another slug in the same domain.

### Namespaces

The namespace says who names the asset: `core` for the project, `org_<name>` for an organization,
`usr_<name>` for a person, and `pkg_<name>` for a pack that names no organization. It does not say
where the bytes come from, which is the scope's job.

The prefix `mfr_`, for the maker of the real product an asset depicts, is reserved and refused. A
later decision has to say what such a pack may contain under ADR-0230 before any pack uses it. The
likely rule is that it is free, carries no price, no promotion, and no link whose purpose is a sale.

### A sub-resource is stored as fields and written with a tilde

An asset has named parts: sockets, material slots, ports, volumes, and eight other kinds. Where a
manifest or a project points at one, it stores a kind and a name as two fields beside the asset.

In text, a sub-resource is the catalog identifier followed by a tilde, the kind, a colon, and the
name: `...@1.0.0~socket:strike_plate`. The number sign is not used, because it already separates the
scope from the hash in a serialized reference. A sub-resource is never appended to a serialized
reference.

### The ids of placed elements keep their form

An element id stays an opaque string. No prefix that names its type is stored, and no existing id is
rewritten. Code that needs a typed handle on an element uses the pair of its kind and its id, which
the architecture refactor introduces as one element reference
(`docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.5).

The project id stays out of the document, as ADR-0188 rules. A later record could mint new ids in
another opaque form without a migration. None is planned.

### A key for derived geometry starts from the content hash

When a cache for geometry built from a base asset and parameters exists, its key starts from the
base asset's content hash and the manifest fields that change the geometry, such as a declared
pivot, not from the catalog identifier. Two versions with the same bytes and the same such fields
then share cached geometry. The key is not stored in a project, and it is not used for walls or for
placing elements. Meshes loaded from a file stay keyed by content hash, as in
`bridge/react/furniture-model-cache.ts`.

Before hashing, lengths are integer counts of the derived coordinate grid of ADR-0199 (1e-6 mm,
`DERIVED_COORDINATE_GRID_MM`), rounded half away from zero, and angles are integer counts of 1e-9
degree. The manifest fields that change the geometry, such as the pivot, are rounded by the same
rule, and the cache builds from the rounded values. No rounded value is ever stored. Equal keys mean
every parameter is less than one step apart, so the shapes are the same to the kernel. The converse
cannot hold for any key, because two values within the length tolerance can straddle a grid
boundary. Such a miss costs one rebuild and never a wrong shape. The specification gives the full
contract.

## Alternatives considered

None of these was taken.

- **Make the catalog identifier the reference.** A saved project would read more clearly. But every
  project and every `.building` file would need a migration, the app would need an index from names
  to bytes before it could draw anything, and the fallback that finds a hash in a newer pack version
  would be lost.
- **Store both in the project.** A reader could use either. But two fields that should agree will
  one day disagree, and the format would have to say which one wins.
- **No readable name.** There would be nothing to build. But sockets, replacements, the rank check,
  and error messages would have to name assets by hash, and a hash changes with every edit to a
  file.
- **Keep the number sign for sub-resources.** It matches how a URL names a fragment. But a reference
  is split at the last number sign, so a suffix would be read as a hash.
- **Prefix stored ids with their type.** An id would say what it is. But that is a breaking schema
  version that rewrites every id and every field that holds one, and the kind is already known from
  the array an element sits in.
- **The pack version only.** The identifier would lose `@<version>`, and a changed file would be a
  new hash anyway. But replacement would need another slug, and the library could not relate two
  versions of one asset except by slug.
- **Accept `mfr_` now, or remove it for good.** Accepting it needs a rule that no real pack has
  tested, and raises questions about trademarks. Removing it leaves no way to say that an asset
  depicts a real product by its maker.
- **Another separator for sub-resources.** `!` or `::` would be as safe, but `::` reads oddly beside
  the colon in `kind:name`. No text form at all would leave messages and logs without a compact
  way to name a socket.
- **Mint UUIDv7 ids for new elements now.** Ids would sort by time, but no reader needs that yet.

## Consequences

- Nothing in the project schema changes, and no project needs a migration.
- The pack tool gains checks: the grammar, uniqueness within a pack, agreement between the
  identifier's category and the `categories` list, and one hash for one identifier at publish time.
- The library can group the versions of one asset and can tell a user that a placed asset has a
  newer version in the store.
- An author keeps two versions, the asset's and the pack's.
- A project gets no file that pins catalog versions. The scope already names the pack version, and
  the hash already pins the bytes.
- ADR-0007 gets a pointer note and nothing more. The publish step of ADR-0229 gains the check of one
  hash for one identifier, and ADR-0229 gets a note when that check lands.
- A tool that reads an identifier from a log cannot fetch anything with it. It has to look the
  identifier up in a manifest to get the hash.

## What stays open

- The check of one hash for one identifier across a whole store needs the catalog and the publish
  step of ADR-0229. The adoption plan builds it in pull request 3, after that publish step lands.

## References

- `docs/specs/2026-11-23-asset-taxonomy.md`
- `docs/plans/2026-11-23-asset-taxonomy-adoption.md`
- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.5
- `docs/specs/2026-11-21-asset-pack-distribution.md`
- [[ADR-0007-content-addressed-assets]]
- [[ADR-0091-pack-integrity-and-build-pipeline]]
- [[ADR-0178-schema-version-and-revision]]
- [[ADR-0181-millimetre-numbers-and-one-tolerance-model]]
- [[ADR-0188-project-id-address-and-index-record]]
- [[ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back]]
- [[ADR-0219-pack-assets-carry-textures]]
- [[ADR-0229-one-library-over-a-shared-hash-addressed-asset-store]]
- [[ADR-0230-vernacular-is-free-software-and-stays-free]]
- [[ADR-0234-assets-are-classified-by-domain-and-tier-and-references-point-down]]
- [[ADR-0236-asset-contracts-are-optional-manifest-fields-in-millimeters]]
