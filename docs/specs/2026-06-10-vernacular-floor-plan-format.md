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
  .house-autosave/        sidecar autosave and pre-migration backups (not part of the format)
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
`schemaVersion`. Reserving the names now keeps the path additive and prevents a third party from
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
promoted to core only by a `schemaVersion` increment and an accompanying ADR.

## 7. Versioning, migration, and compatibility

- **Three independent version surfaces.** `schemaVersion` is the format version and drives the
  schema-migration chain. `appVersion` records the writing application. `registryVersions`
  records vocabulary versions. They move independently.
- **Additive within a major version.** New optional fields, new reserved names, and new
  registry types are additive and do not increment beyond a minor expectation. Removing or
  renaming a field, or changing a field's meaning, requires a new `schemaVersion` and a
  migration step in the chain (`core/migrations/schema/`), layered with per-registry migrations
  (`core/migrations/registries/`). A pre-migration backup is written before applying, and
  migration failure is atomic.
- **Reading rules.** A reader at version N opening a Document at version M < N migrates it up
  the chain. A reader opening a Document at version M > N SHOULD open it read-only or refuse,
  because it cannot safely interpret newer required fields; if it opens the Document it MUST
  obey the preservation rule (section 6.4). Unknown `extensions` are always preserved
  regardless of version.

## 8. Schema generation and validation

- **Generated from the types.** The CORE JSON Schema is generated from the `core/model/`
  TypeScript types by a build step (for example `pnpm schema:generate`) and committed to the
  repository under `schema/<version>/vernacular.schema.json` with a stable `$id`. The
  TypeScript types remain the single source of truth; the generated schema is the published
  artifact. The recommended `$id` base is a versioned, repository-scoped URI; resolvable hosting
  is optional, since a JSON Schema `$id` is an identifier first.
- **Validation.** A validator in `core/` (an Ajv instance over the generated schema) validates
  a Document against a profile (section 3). It is used in continuous integration and tests, and
  MAY run on app load after migration as a development and safety gate; it is not a user-facing
  hard rejection, because migrations are the user-facing compatibility path.
- **Drift guard.** Continuous integration regenerates the schema and fails if the committed
  schema differs from the regenerated one, keeping the published schema in lockstep with the
  types.
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
