# Vernacular Floor Plan Format (VFPF)

Status: draft for review. Normative specification of the on-disk data format for a
Vernacular project. This document formalizes and publishes the format that the design
specification already describes informally in sections 3.3 (project file format), 3.4
(versioning and migrations), and 4 (asset and extension system). It is authoritative
alongside the design specification and is introduced by ADR-0047.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used as defined in RFC 2119.

## 1. Purpose

Vernacular stores a project as plain data. This specification turns that implicit,
code-resident shape into a documented, versioned, machine-validated standard so that:

- test fixtures and real projects validate against one published contract,
- the format can grow additively to cover future first-party capabilities, and
- third parties can attach their own data through defined seams without forking the format.

The native model stays the source of truth (ADR-0044). This format is that native model,
published. It is not a separate interchange standard, and it does not replace the heavyweight
building-information-modeling interoperability seam (the Industry Foundation Classes and its
JSON serialization), which remains an exporter and importer concern (ADR-0044).

## 2. Packaging tiers

The format defines three nested forms. A reader that accepts one outer form MUST be able to
obtain the `vernacular.json` Document inside it.

### 2.1 Document (`vernacular.json`)

The canonical artifact is a single JSON object, the project entity tree, stored as a file
named `vernacular.json`. It is plain text, git-diffable, hand-editable, and contains no binary
data; every external resource is an asset reference (section 5.6). The Document is the unit of
schema validation and of test fixtures (section 9).

### 2.2 Folder

The working, incremental-write form is a directory:

```
my-project/
  vernacular.json         the Document
  assets/
    <contentHash>.<ext>   content-addressed bytes (underlay rasters, later models)
  previews/               generated thumbnails (optional)
  ATTRIBUTIONS.md         generated, required attributions for bundled assets
  README.md               generated summary (optional)
  .house-backups/         migration backups (not part of the format)
  .house-autosave/        recovery snapshots (not part of the format)
```

Only `vernacular.json` is required. `assets/` is required when the Document references any
`scope: "project"` asset. Incremental writes touch only changed files, so autosave never
rewrites large binaries.

### 2.3 Archive (`*.building`)

The shareable, single-file form is a ZIP archive of the Folder, with the extension
`.building` (for example `maple-street.building`). Opening a `.building` archive unpacks it to
a working Folder (or to an origin-private file system where direct file access is limited). The
archive MUST contain the Folder layout at its root and MUST include `ATTRIBUTIONS.md` when it
carries any attribution-bearing asset.

Vernacular reads an archive as an untrusted file (ADR-0213). Its reader refuses an archive longer
than 512 MiB, one whose entries declare more than 1 GiB in total once inflated, one with more than
10,000 entries, and one whose `vernacular.json` declares more than 64 MiB. It checks these limits
before it inflates anything, and it holds each entry to its declared size while it inflates. It
takes only two kinds of entry: `vernacular.json` at the root, and `assets/` followed by exactly
the 64 lower-case hexadecimal digits of a content hash, with no extension. It ignores every other
entry, so an asset stored under a name with an extension is not read and is reported as missing.
An asset whose bytes do not hash to its name is not accepted, and the Document still opens without
it. An archive that spans more than one disk is refused. An archive in the ZIP64 form is read: a
ZIP64 value is used for a field only where the classic field holds its marker.

### 2.4 Transition note (non-normative)

The current implementation writes `project.json` and exports `.house.zip`. Adopting
`vernacular.json` and `.building` is a clean rename with no compatibility shim. The project is
pre-1.0 (a 0.x series), so a breaking change to the file names is acceptable: the old names are
deprecated and the change is recorded in the release notes, and readers target only
`vernacular.json` and `.building`. This is an implementation-plan concern, not a change to the
format defined here.

## 3. Conformance

A Document is CORE-conformant when, after migration to the reader's current `schemaVersion`
(section 7), it validates against the CORE schema (section 4). Extension data (sections 6.2 and
6.3) MUST NOT cause CORE validation to fail. A processor MUST preserve extension data and
unknown reserved keys it does not understand across a read-modify-write cycle (section 6.4).

Two validation profiles are defined:

- **Core profile** (required): validates the CORE schema only and treats every `extensions`
  payload as an opaque open object.
- **Strict profile** (optional): additionally validates registered vendor namespaces against
  their published schemas (section 6.3).

## 4. The CORE schema

The CORE schema is generated from the TypeScript domain types in `core/model/` (section 8) and
covers exactly the entities Vernacular implements today. It is the small, honest, validated
surface of the format.

### 4.1 Entities

- **Project**: `meta`, `floors[]`, optional `roomOverrides` (a map keyed by room key).
- **ProjectMeta**: `name`, `units` (`imperial` or `metric`), `period` (a registry id),
  optional `style` (a registry id with an optional vernacular modifier), `schemaVersion`,
  `appVersion`, and `registryVersions` (a map of registry name to the version the project was
  written against).
- **Floor**: `id`, `name`, `elevation`, `defaultCeilingHeight`, optional `periodOverride` and
  `styleOverride`, and the arrays `walls[]`, `openings[]`, `dimensions[]`, `underlays[]`.
- **Wall**: `id`, `start`, `end`, `thickness`. A wall centerline is a straight segment in
  this version (section 6.1 reserves the path generalization).
- **Opening**: `id`, `type` (an `ElementTypeRegistry` id), `hostWallId`, `position` along the
  host wall, `width`, `height`, `sillHeight`, and `orientation` (hinge end and facing). An
  opening is typed at the element level; new opening kinds are registry additions, not schema
  changes.
- **Underlay**: `id`, `image` (an asset reference), source `width` and `height` in pixels,
  `placement` (`offset`, `millimetersPerPixel`, `rotation`), `opacity`, `visible`.
- **Dimension**: `id`, `start`, `end`, `offset`.
- **RoomOverride**: optional `name`, `customPolygon`, `purpose` (a registry id), `subPurpose`,
  `periodOverride`, `styleOverride`. Held in `Project.roomOverrides`, keyed by room key.

### 4.2 Normative invariants

- **Geometry is millimeters.** Every coordinate and length is an integer or real number of
  millimeters. A `Point` is `{ x, y }` with x increasing rightward and y increasing upward.
- **Rooms are derived, not stored.** A Document never contains room polygons. Rooms are
  computed from wall topology by the reader; only user metadata for a room persists, in
  `roomOverrides`, keyed by the sorted bounding-wall-id string the derivation assigns as the
  room key. A `customPolygon` supplies a boundary where wall topology cannot infer a room.
- **Openings are wall-hosted.** An opening's geometry derives from its host wall, its position
  along that wall, and its orientation. An opening MUST reference an existing wall id on the
  same floor.
- **Identifiers are opaque within the Document.** `id` values are unique within their floor
  (walls, openings, dimensions, underlays) and are referenced by id (for example
  `Opening.hostWallId`). Registry ids (`period`, `style`, `type`, `purpose`) are validated as
  well-formed strings only; their meaning is resolved against registries (section 5).

## 5. Identifiers, registries, and assets

- **Registry references.** Period, style, room purpose, and element type are opaque ids into
  the corresponding registry. The CORE schema validates their string shape, not their
  membership. `registryVersions` records the version each registry was written against so a
  reader knows which vocabularies a Document needs. Registry-level migrations reconcile renamed
  or deprecated ids on open.
- **Asset references are content-addressed.** Every external resource (an underlay raster
  today; furniture and models later) is an `AssetReference` of `{ scope, contentHash }`, where
  scope is `pack:<id>@<version>`, `user`, or `project`. The serialized string form is
  `<scope>#<contentHash>`. Project-scoped bytes live in the Folder's `assets/` directory under
  their content hash.
- **Attribution travels with assets.** Every attribution-bearing asset carries its license and
  attribution; the Archive form regenerates `ATTRIBUTIONS.md` from those records. A bundle that
  cannot satisfy an asset's license terms MUST surface the conflict rather than silently ship.

## 6. Extensibility

The format grows along three layered seams. None of the three requires a CORE schema change to
add a value, and each is independently versioned.

### 6.1 Registry-typed elements (data-driven)

New building-element kinds (opening shapes, trim profiles, eras, styles, room purposes, and
later wall features, ceiling features, and stair components) are registry entries referenced by
opaque id from the Document. A community member contributes them as a versioned registry or
asset pack (design specification section 4.6), published as a release and installed by URL with
consent. The Document records `registryVersions` and, in a future version, the packs it
requires. Most near-term growth (period window and door shapes, wall construction profiles)
lands here without touching the schema.

### 6.2 Reserved first-party namespaces

The format reserves names for first-party entities the design specification anticipates
(section 3.1 entity tree) but that are not yet implemented, and for the modeling concepts the
floor-plan test corpus surfaced as gaps. A reserved name is owned by the format, documented as
reserved and not yet defined, and becomes part of the CORE schema additively in a later
schema revision (section 7). Reserving the names now keeps the path additive and prevents a third party from
colonizing a name the project intends to define. The reserved-namespace registry is section 6.5.

### 6.3 Third-party vendor extensions

Any object in the entity tree (the project, a floor, a wall, an opening, a room override, and so
on) MAY carry an `extensions` member: a JSON object whose keys are reverse-DNS-namespaced
identifiers and whose values are arbitrary JSON owned by that namespace. Example:

```json
"extensions": {
  "com.example.solar": { "panelKilowatts": 6.4 },
  "org.example.survey": { "instrument": "total-station" }
}
```

The Core profile validates `extensions` as an open object: any namespaced payload is allowed.
A vendor MAY publish a JSON Schema for its namespace and register it (section 6.5); the Strict
profile then validates that namespace's payloads against the published schema. Reverse-DNS keys
are collision-safe without a central registry and map cleanly to JSON Schema `patternProperties`.

### 6.4 Forward compatibility (preservation rule)

A processor MUST preserve, byte-for-value, any `extensions` payload and any reserved key it does
not understand, across a read-modify-write cycle. A reader MUST NOT drop data it cannot
interpret. This makes third-party data and forward-version data safe to carry through editing
and saving.

### 6.5 Reserved-namespace registry

The following names are reserved. Status is one of reserved (named, not yet defined), draft
(shape proposed), or core (defined in the current CORE schema). Each row links the concept to
the design-specification section, ADR, or floor-plan corpus gap that motivates it.

| Reserved name           | Status   | Motivated by                                                     |
| ----------------------- | -------- | ---------------------------------------------------------------- |
| `site`                  | reserved | design spec 3.1; corpus gap `site-and-landscape-plan`            |
| `floor.trim`            | reserved | design spec 3.1, ADR-0034 (path-based trim)                      |
| `floor.wallFeatures`    | reserved | design spec 3.1, ADR-0034                                        |
| `floor.ceilingFeatures` | reserved | design spec 3.1                                                  |
| `floor.floorFeatures`   | reserved | design spec 3.1                                                  |
| `floor.furniture`       | reserved | design spec 3.1 (assets and furniture track)                     |
| `stairs`                | reserved | design spec 3.1, 3.2 (top-level, spans floors)                   |
| `palettes`              | reserved | design spec 3.1 (paint and metadata track)                       |
| `assetIndex`            | reserved | design spec 3.1, 4.8 (license and provenance)                    |
| `building`              | reserved | corpus gap `multi-building-properties` (multiple structures)     |
| `wall.curve`            | reserved | ADR-0034 (curved walls), corpus gap `curved-and-nonlinear-walls` |
| `wall.heightProfile`    | reserved | ADR-0034 (variable and sloped wall heights)                      |
| `roof`                  | reserved | corpus gap `roof-and-sloped-ceiling-geometry`                    |
| `room.coveredOutdoor`   | reserved | corpus gap `covered-outdoor-rooms`                               |
| `room.holes`            | reserved | corpus gap `courtyard-and-atrium-spaces`                         |
| `accessibility`         | reserved | corpus gap `accessibility-clearances-and-turning-spaces`         |
| `room.schedule`         | reserved | corpus gap `room-schedule-and-legend`                            |
| `annotations`           | reserved | corpus gap `plan-annotations-north-arrow-scale-bar`              |
| `verticalCirculation`   | reserved | corpus gap `vertical-circulation-beyond-stairs`                  |
| `level.partial`         | reserved | corpus gap `split-level-and-mezzanine`                           |

This table is normative for name ownership and informative for shape. A reserved name is
promoted to core only by a `schemaRevision` or `schemaVersion` increment (section 7) and an
accompanying ADR.

## 7. Versioning, migration, and compatibility

- **Three independent version surfaces.** `schemaVersion` is the format version and drives the
  schema-migration chain. `appVersion` records the writing application. `registryVersions`
  records vocabulary versions. They move independently.
- **Version and revision.** `schemaVersion` counts breaking changes. `schemaRevision` is an
  OPTIONAL non-negative integer beside it in `ProjectMeta` that counts additive changes to the
  CORE schema within one `schemaVersion` (ADR-0178). A Document without `schemaRevision` is at
  revision 0. The revision returns to 0 when `schemaVersion` increments.
- **Additive changes increment the revision.** A new optional field is additive, and so is the
  promotion of a reserved name to a defined optional field. Each increments `schemaRevision` and
  needs no migration step. Reserving a name, or adding a registry type, changes no schema, so
  the revision stays. Removing
  or renaming a field, or changing a field's meaning, requires a new `schemaVersion` and a
  migration step in the chain (`core/migrations/schema/`), layered with per-registry migrations
  (`core/migrations/registries/`). Migration runs in memory, so a failed migration leaves the
  stored file as it was. After a decode that migrated and succeeded, and before the Document
  reaches the caller, the application copies the stored bytes to `.house-backups/` (ADR-0182,
  ADR-0190). A backup is never replaced by different bytes, and it lasts until its project is
  deleted.
- **Published schemas are immutable.** A schema is fixed once it is released. The schema for
  a revision above 0 is published at `schema/<version>/revision-<revision>/vernacular.schema.json`,
  with the `$id`
  `https://drmrd.github.io/vernacular/schema/<version>/revision-<revision>/vernacular.schema.json`.
  Each existing `schema/<version>/vernacular.schema.json` and its `$id` is revision 0 of that
  version and does not change (ADR-0178). If the generated schema differs from the latest
  committed one and neither `schemaVersion` nor `schemaRevision` has incremented, the drift
  check fails (section 8).
- **Reading rules.** A reader at version N and revision R opening a Document at version M and
  revision Q does one of four things.
  - M < N: it migrates the Document up the chain.
  - M = N and Q ≤ R: it validates the Document with no tolerance for unknown fields. A field the
    schema does not define, outside `extensions`, is a validation error. The error is reported,
    and the field is still preserved (section 6.4).
  - M = N and Q > R: a newer build wrote the Document with additive fields this reader does not
    know. The reader reads it tolerantly, MUST obey the preservation rule (section 6.4), and
    SHOULD tell the user that a newer build wrote it.
  - M > N: it SHOULD open the Document read-only or refuse, because it cannot safely interpret
    newer required fields; if it opens the Document it MUST obey the preservation rule
    (section 6.4).

  Unknown `extensions` are always preserved regardless of version or revision.

- **Adoption (non-normative).** Versions 8 through 17 predate the revision and each incremented
  `schemaVersion`, including for additive changes. The application writes `schemaRevision` on
  every save, as the highest of the Document's revision, the revision of the previous stored file
  when that file is at the same `schemaVersion`, and its own. Unknown fields that the save keeps
  from a file a newer build wrote stay under that file's revision, so the next read checks them
  tolerantly. The application reads a Document without `schemaRevision`, or with a value that is
  not a non-negative integer, as revision 0. A Document migrated from an older version carries
  no revision until its next save. The document codec work described in
  `2026-11-14-architecture-refactor-round.md` decides how a validation error is reported
  (section 8 still rules out a user-facing hard rejection).

## 8. Schema generation and validation

- **Generated from the types.** The CORE JSON Schema is generated from the `core/model/`
  TypeScript types by a build step (for example `pnpm schema:generate`) and committed to the
  repository at the path of the current version and revision, with a stable `$id`:
  `schema/<version>/vernacular.schema.json` for revision 0 and
  `schema/<version>/revision-<revision>/vernacular.schema.json` above it (section 7, ADR-0178).
  Two validators are generated from that schema into `core/format/generated/`: a strict one, and
  a tolerant one with every `additionalProperties: false` removed. The TypeScript types remain
  the single source of truth; the generated schema is the published artifact. The recommended
  `$id` base is a versioned, repository-scoped URI; resolvable hosting is optional, since a JSON
  Schema `$id` is an identifier first.
- **Validation.** A validator in `core/` validates a Document against a profile (section 3).
  The generated strict validator checks a Document on every read, after migration, and on every
  write, in every build. A Document at a higher `schemaRevision` than the application's is checked
  with the tolerant one (section 7, ADR-0178). Both run as generated code, so the application
  carries no schema compiler. The validators are also used in continuous integration and tests;
  a failed check is not a user-facing hard rejection, because migrations are the user-facing
  compatibility path.
- **Drift guard.** Continuous integration regenerates the schema and both validators and fails if
  a committed file differs from the regenerated one, keeping the published schema and the
  validators in lockstep with the types. The guard also fails when the generated schema changes
  and neither `schemaVersion` nor `schemaRevision` increments (ADR-0178).
- **Layering.** Generation and validation live in `core/` and `scripts/` only; they import no
  React and no Three.js, consistent with the layer boundaries (ADR-0001). New dependencies (the
  generator and the validator) honor the dependency cooldown and exact-version pinning.

## 9. Test fixtures as conformant Documents

This format is the contract for the project test-fixture corpus.

- Every fixture is a `vernacular.json` Document that MUST validate against the Core profile in
  continuous integration.
- The **minimal valid Document** is `meta` plus one `Floor`, optionally with a single calibrated
  `Underlay`. This is exactly the smallest fixture the floor-plan corpus needs (a scanned plan
  loaded as a calibrated background to trace over), so the format defines the floor of "a valid
  floor plan."
- Richer fixtures add walls, openings, dimensions, and room overrides, across one or more
  floors. Multi-floor and staggered-elevation states are expressible today (a Document may carry
  several `Floor` entries at different elevations).
- A fixture that needs the actual raster ships as a `.building` Archive carrying the underlay as
  a content-addressed asset, so the corpus's license and attribution data flows into the
  bundle's `ATTRIBUTIONS.md`. The floor-plan corpus metadata can record calibration and a
  representability tier and emit conformant fixture Documents, sharing one provenance chain with
  the source images.

## 10. Non-goals

- Adopting the Industry Foundation Classes (or its JSON serialization) as the native format. It
  remains an exporter and importer seam (ADR-0044).
- Schematizing entities that are not implemented. Reserved names (section 6.5) are named, not
  defined.
- Cryptographic signing of project Documents. Asset-pack signing is already a later hardening
  item (design specification section 4.3); project-file signing is out of scope here.
- A code-plugin runtime. Extensions are data only (design specification sections 2.3 and 4.6).
- A new container technology. The Folder and the ZIP-based `.building` Archive are reused.

## 11. Open questions

- The canonical `$id` host (a published, resolvable schema URL) versus a repository-scoped
  identifier only. The format works with either; hosting is a publication decision for the
  maintainer.
- Whether `packsRequired` (design specification section 3.4) lands in the same `schemaVersion`
  that publishes the schema or a later one. It is a coordinated shared-schema field and is
  reserved here either way.
- Whether the Strict profile ships in the first implementation or follows once a first vendor
  namespace exists.
