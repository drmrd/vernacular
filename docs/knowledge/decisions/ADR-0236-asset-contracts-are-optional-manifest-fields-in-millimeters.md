---
slug: decisions/ADR-0236-asset-contracts-are-optional-manifest-fields-in-millimeters
title: 'ADR-0236: Asset contracts are optional fields of the pack manifest, in millimeters, and the pack stays the unit'
type: decision
tags: [architecture, assets, packs, taxonomy, formats, validation, units, schema]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0024-pack-manifest-validation-location,
    decisions/ADR-0027-units-module-targets-millimeter-storage,
    decisions/ADR-0091-pack-integrity-and-build-pipeline,
    decisions/ADR-0095-furniture-3d-mesh-loader,
    decisions/ADR-0139-plan-to-world-orientation,
    decisions/ADR-0181-millimetre-numbers-and-one-tolerance-model,
    decisions/ADR-0219-pack-assets-carry-textures,
    decisions/ADR-0229-one-library-over-a-shared-hash-addressed-asset-store,
    decisions/ADR-0234-assets-are-classified-by-domain-and-tier-and-references-point-down,
    decisions/ADR-0235-a-catalog-identifier-names-an-asset-beside-its-content-hash,
    decisions/ADR-0237-a-layered-assembly-holds-structure-and-the-finish-stays-a-surface-treatment,
  ]
sourceFiles:
  [
    docs/specs/2026-11-23-asset-taxonomy.md,
    core/assets/pack-manifest.ts,
    core/assets/manifest-lengths.ts,
    core/assets/license-policy.ts,
    core/assets/asset-description.ts,
    engine/scene/furniture-model.ts,
    public/packs/vernacular-starter-1.0.0/manifest.json,
  ]
status: current
updated: 2026-11-23
---

# ADR-0236: Asset contracts are optional fields of the pack manifest, in millimeters, and the pack stays the unit

## Status

Current, 2026-11-23. Nothing is built yet. The field names and the state of each contract are in
`docs/specs/2026-11-23-asset-taxonomy.md`. On 2026-11-23 the owner ruled that the store layout of
ADR-0229 is final, that every manifest length is in millimeters, that phase stays out of the
manifest, that a work in the public domain by age is labeled as described under Provenance, that
the first checks are the ones listed under the format version, that further files are
representations on the entry, and that the contract is published as JSON Schema files.

This record depends on ADR-0229 and ADR-0230, and on ADR-0181, ADR-0199, and ADR-0201 to
ADR-0203. All of these records are on `main`.

## Context

ADR-0234 gives an asset a class, and ADR-0235 gives it a name. An asset in the larger library also
needs to describe itself: where a material goes on it, what it accepts in a mount point, how a door
leaf swings, how much room it needs in front of it, what it cuts out of the wall it sits in. The
taxonomy groups those descriptions into ten contracts.

The pack format already has a place for these descriptions. A pack has a manifest, and each asset is
an entry with a content hash, a name, a kind, a media type, a license, and dimensions in millimeters
(`core/assets/pack-manifest.ts`). The validator is hand-written and reads the fields it knows, so an
extra field does not make a pack invalid. ADR-0219 set the rule for the format version: it moves
only when an earlier reader would misread a pack, and a reader refuses a version it does not know.
ADR-0229 publishes packs into one store and keeps the pack as the unit of version and license.

There is also a question of units and names. The pack format writes lengths in millimeters and names
fields in camel case. A model file in binary glTF has meters as its own unit, and the loader scales
each model to the manifest's dimensions (ADR-0095, `engine/scene/furniture-model.ts`).

## Decision

### Contracts are optional fields on a manifest entry

Each contract is a group of optional fields on an asset's entry in the pack manifest. A pack that
carries none of them stays valid. No second manifest format exists, and no manifest file exists for
a single asset.

The validation code stays in `core/assets/`, where the pack tool and the app share it (ADR-0024).
The repository stays one package.

### The pack stays the unit, and the store stays as it is

An asset is authored, versioned, licensed, and published as part of a pack. Published packs go into
the store of ADR-0229 without change: `catalog.json`, manifests named by their hash, blobs named by
their hash with no extension and no subfolders, and a folder of license and notice text for each
pack.

The taxonomy adds no directory layout. A path that sorts assets by namespace, tier, or domain would
have to change whenever an asset is reclassified, and the catalog already answers "what is in this
store". The owner confirmed on 2026-11-23 that the layout of ADR-0229 is final: blobs stay flat and
carry no extension. ADR-0229 gets a note that sharding and extensions were considered and not taken.

### The format version moves by the rule of ADR-0219

Adding an optional field does not move `formatVersion`. The version moves only when a reader that
exists would misread a pack, for example when a required field changes meaning.

A field has one of two states:

- **Checked.** The pack tool validates it, and at least one reader uses it.
- **Reserved.** The name and the meaning are fixed in the specification. The exact shape is settled
  in the pull request that adds the first reader, and a pack should leave the field out until then.

The first fields to be checked are the ones that need no new reader in the app: `catalogId`, the
category inside it, `references` with the rank rule of ADR-0234, `provenance`, and `lifecycle`.

A pack must pass the format's required fields and these checked fields to be published as
first-party. Entries in the `SUB` (substrates) and `COT` (coatings) domains also carry baseline
physical properties, as reserved data that no reader uses yet. The pack tool does not check the
other contracts until each gets its reader.

### Lengths are millimeters and angles are degrees

Every length in a manifest is a number of millimeters. Two rules in `core/assets/manifest-lengths.ts`
check them, one for sizes and one for positions.

A size must be positive: dimensions, tile sizes, spacings, thicknesses, size limits, and the sizes of
volumes. That is what `isPositiveLengthMm` checks today: a finite number above zero and no more than
`MAX_LENGTH_MM`. A position is measured from the origin of the model's own frame, so zero and
negative values are ordinary: the positions of sockets, ports, and volumes, and a pivot. A signed rule
checks those, a finite number with an absolute value of at most `MAX_LENGTH_MM`. A single rule would
either refuse a pivot at the origin or accept a model with no width. The first pull request that
checks a position adds the signed rule. Angles are degrees.

The model file keeps its own unit. The manifest's dimensions decide the size of a placed model, as
they do today.

### Names follow the format that exists

Field names are camel case, like `contentHash`. Enumerated values are lower case with hyphens, like
the values of `kind`. Subcategories, slugs, and sub-resource names use underscores, because they
belong to the grammar of ADR-0235.

### Provenance is neutral and small

`license`, `attribution`, and `sourceUrl` stay on the entry, where the format puts them, and
`copyright` where the distribution specification adds it. The license is one SPDX identifier from
the allowlist in `core/assets/license-policy.ts`. `provenance` adds two optional fields: `author`, a
name, and `method`, a free text value that the app shows and does not interpret.

A work that is in the public domain by age is labeled as follows. A first-party file made from it
carries the first-party license of ADR-0229, CC-BY-4.0, with the source in `sourceUrl` and a note in
the pack's NOTICE. A file redistributed unchanged is CC0-1.0 only when the source institution
states CC0. The allowlist gains no new class.

### Further files are named by hash

An entry has one `contentHash`, the file the app loads first. An asset with more files, such as
lower levels of detail or a plan symbol, lists each as a representation with a name, a content hash,
a byte length, and a media type. Each is a blob in the store like any other. This follows a pattern
like the one ADR-0229 uses for a thumbnail. The entry's `contentHash` stays the file loaded first.

### A declared pivot is optional, and the box fit stays the default

The placement contract lets an entry declare its pivot as a point in the model's own frame. An entry
that declares none is placed as it is today: the loader fits the model into the box of its
dimensions and centers it on the footprint.

### A void that goes part of the way is refused for now

The cutout contract has two values, `through-cutout` and `partial-depth-recess`. Every opening is
cut through the whole wall today. The pack tool refuses `partial-depth-recess` until walls can carry
a recess, so that no pack promises a shape the app cannot draw.

### Phase is not in the manifest

Whether a placed element exists, was removed, or is proposed is a fact about a project. No manifest
field records it. The taxonomy's phase contract waits for the renovation comparison design.

## Alternatives considered

None of these was taken.

- **A manifest file for each asset in a catalog tree.** Each asset could be published alone. But the
  pack would stop being the unit of license and version, the store of ADR-0229 would need a second
  layout, and a client would fetch one small file for each asset to draw the library.
- **Blobs in subfolders with file extensions.** A folder listing stays short, and a file opens in a
  desktop tool. But the extension repeats the media type that the manifest already holds, a static
  host serves a flat folder as well as a split one, and two layouts would need two readers.
- **A new format version for every contract.** Each step would be explicit. But every reader in use
  would refuse every new pack, although it could have shown the asset with the fields it knows.
- **Meters in the manifest, to match the model file.** A pack would then use one unit throughout.
  But the project, the manifest dimensions, and the tile sizes are all millimeters, and a pack with
  both units invites the error of a factor of one thousand. The app also reads the manifest as
  published, with no import step in which to convert.
- **A workspace of packages for the schema and the app.** The schema could be released on its own.
  But the repository is one package, the pack tool already imports the validator from
  `core/assets/`, and the published JSON Schema files give another project the same contract.
- **One manifest entry for each file of an asset.** The identifier could link them. But the library
  would show a tile for each unless it filtered. One container file for all levels would make a
  client download every level to show one.
- **A phase field on each element now.** It would pre-empt the renovation comparison design, and
  furniture has no `extensions` field to trial it in.
- **Publish the shape of all ten contracts now.** Authors would know everything at once. But a shape
  with no reader is untested, and changing it later would break the packs that used it.

## Consequences

- A pack of format 1 or 2 stays valid, and a reader that exists today reads a pack that carries the
  new fields.
- Any tool that writes packs, including the pack tool, has to write what the repository accepts:
  millimeters, the field names of the specification, one license identifier from the allowlist, and
  the required fields of the format. The JSON Schema files under `schema/pack-manifest/` are the
  reference once the distribution work publishes them, and a tool runs `pnpm pack:validate` on its
  output before publishing.
- Amends: ADR-0219 gets a note that optional taxonomy fields move no format version, and ADR-0095
  gets a note about the declared pivot beside the box fit. ADR-0229 gets a note about the optional
  fields and the check of one hash for one identifier. These are pointer notes, and the decisions
  they point at do not change.
- A reserved field gives an author nothing yet. A pack that fills one in takes the risk that the
  shape changes.
- The pack tool grows with each contract that becomes checked.
- The app has no reader for sockets, ports, articulation, volumes, or cutouts. Each needs work in
  the scene and the model that this decision does not schedule.

## What stays open

- The exact shape of each reserved contract.
- Whether the schema lists every reserved field by name. The owner ruled on 2026-11-23 that the
  manifest schemas allow unknown fields, so the validator and the schema agree, and that an optional
  field is added to a schema in place, with the same `$id` and no new format version. The schema
  names only the fields that are checked.
- Whether a declared pivot replaces the box fit or only adjusts it. The check of how the loader maps
  a model into the world frame (ADR-0139) is done: it found a defect, which #1148 fixed. Pull
  request 7 of the adoption plan settles the question.

## References

- `docs/specs/2026-11-23-asset-taxonomy.md`
- `docs/plans/2026-11-23-asset-taxonomy-adoption.md`
- `docs/specs/2026-11-21-asset-pack-distribution.md`
- [[ADR-0001-six-layer-architecture]]
- [[ADR-0007-content-addressed-assets]]
- [[ADR-0024-pack-manifest-validation-location]]
- [[ADR-0027-units-module-targets-millimeter-storage]]
- [[ADR-0091-pack-integrity-and-build-pipeline]]
- [[ADR-0095-furniture-3d-mesh-loader]]
- [[ADR-0139-plan-to-world-orientation]]
- [[ADR-0181-millimetre-numbers-and-one-tolerance-model]]
- [[ADR-0219-pack-assets-carry-textures]]
- [[ADR-0229-one-library-over-a-shared-hash-addressed-asset-store]]
- [[ADR-0234-assets-are-classified-by-domain-and-tier-and-references-point-down]]
- [[ADR-0235-a-catalog-identifier-names-an-asset-beside-its-content-hash]]
- [[ADR-0237-a-layered-assembly-holds-structure-and-the-finish-stays-a-surface-treatment]]
