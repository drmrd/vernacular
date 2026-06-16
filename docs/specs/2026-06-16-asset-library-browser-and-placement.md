# Asset library browser, custom import, and 2D placement

Date: 2026-06-16

## Problem

A plan can hold walls, openings, dimensions, and underlays, but nothing a person
would call furniture. There is no way to see what assets exist, bring in your
own, or put a chair into a room. The pieces that should sit underneath that
workflow are partly built and partly missing.

What exists: a content-addressed asset cache (`storage/AssetCache`, keyed by
sha256, with a React provider in `bridge/`), the resolution primitives in
`core/assets/` (source precedence of user over project over pack over bundled,
and a missing-asset placeholder), and, with #173, a pack format whose integrity a
build can verify. What is missing: the schema that defines a valid pack still
lives as build-time ESM under `scripts/pack/`, with no in-app consumer; there is
no aggregated `AssetRegistry` over the asset sources the design specification
describes (section 4.1); there is no library browser (section 4.9); a person
cannot import their own model; and the document model has no furniture instance
to place.

The design specification is explicit about all four. Section 3 lists
`floors[].furniture[]` as placed instances in the project model. Section 4.1
defines the `AssetSource` provider interface and names `PackSource` and
`UserFilesystemSource` among its implementations, aggregated by an
`AssetRegistry` that consumers talk to instead of individual sources. Section 4.9
describes a library browser that queries the registry with filters and text
search. ADR-0024 records that the pack schema graduates to `core/` as shared
TypeScript when the in-app loader is the consumer that needs one shared
definition. The loader this issue builds is that consumer.

This is issue #174, the second of three asset-track pieces. It builds on the pack
format from #173 and prepares the ground for furniture in the 3D preview (#175).

## Approach

Build on #173 rather than alongside it. This branch is stacked on the #173 branch
so the graduated schema is the same one #173's integrity and build pipeline
already exercises, and the two land in order.

The work splits into units that each have one job and a clear seam, in the order
a reader would build them.

### 1. Graduate the manifest schema to `core/`

Port the pure manifest schema and validator from `scripts/pack/` to `core/` as
shared TypeScript, the graduation ADR-0024 planned. The validator's shape is
already loader-friendly: a pure function over a parsed object returning a flat
error list, with a frozen `ASSET_KINDS` enumeration and a curated license policy.
Graduation is a port and a type translation, not a redesign. The
`vernacular-pack` CLI imports the graduated module instead of its local copy, so
the CLI and the in-app loader share one definition of a valid manifest. Behavior
stays identical: the same fields, the same license outcomes, the same errors.

### 2. Furniture instance in the document model

Add a `FurnitureInstance` to `core/`: a content-addressed `assetRef`, a plan
position in millimeters, a rotation in degrees, a footprint of width and depth in
millimeters used to draw the 2D symbol and the placement ghost, an optional
display name, and a reserved `customizations` field for the parametric hook the
specification keeps open (section 4.11). It carries an id like the other
entities. A floor gains a `furniture: FurnitureInstance[]` array, shaped like its
existing `walls`, `openings`, and `dimensions`.

This is a schema change, so it bumps `CURRENT_SCHEMA_VERSION` and adds a forward
migration that gives every existing floor an empty `furniture` array. The
factories produce floors with the new array. A new ADR records the furniture
instance model and the migration, since the project's rule is that a schema
change is documented in an ADR rather than by editing the design specification.

### 3. Asset sources and the registry

Introduce the `AssetSource` provider interface from section 4.1 and the
`AssetRegistry` that aggregates sources. The registry is what the browser and the
placement tool talk to. It lists the assets available across its sources as
`LibraryItem` summaries (reference, name, kind, categories, eras, footprint, and
an optional thumbnail reference) and resolves an asset's bytes or thumbnail
through the precedence already encoded in `core/assets/`.

Two sources at MVP:

- A `PackSource` that reads the #173 pack format: a manifest validated by the
  graduated schema, asset bytes under `assets/<hash>.glb`, and thumbnails under
  `thumbnails/<hash>.webp`. A small starter pack ships with the application build
  so the browser has content on first run and works offline (section 4.10). The
  starter pack reuses the format and shape of the `vernacular-starter` fixture
  from #173.
- A `UserSource` backed by the asset cache and a metadata index, holding the
  models a person imports.

The aggregating registry, resolution with fallback, and the missing-asset
placeholder are runtime concerns that belong here, the part #173 deliberately
left out of the build tool.

### 4. The library browser

A `Furniture` launcher in the tool rail, alongside the existing underlay
launcher, opens the library as a panel docked on the left. Docking on the left
keeps the right-hand Inspector free, so a piece you just placed shows its
properties on the right while the library stays open: browse on the left, place
in the middle, adjust on the right.

The panel holds a text search box, a source toggle between the starter pack and
your own imports, filter chips for category and era, and a thumbnail grid with
names. An import button sits in the panel, and the empty state for your
own imports points straight at it. Search and filtering run locally over the
registry's listing (section 4.9). The panel meets the same keyboard and
screen-reader bar the rest of the shell holds, the bar the axe-core checks
enforce.

### 5. Custom import

An import action takes a `.glb` file, confirms its glTF signature, hashes its
bytes, stores them in the asset cache under that hash, and records a library
entry in the user metadata index so the asset survives a reload. The display name
comes from the file name and stays editable. The footprint takes a sensible
default that the Inspector can change, because reading true bounds from a model
needs the loader that arrives with the 3D preview in #175. Imported assets show a
placeholder thumbnail for the same reason: baking a thumbnail from a model needs
a headless render step the specification places in a later phase, the same
deferral #173 made for pack thumbnails.

### 6. The 2D placement tool

A `place-furniture` tool arms when you pick a thumbnail. A ghost footprint at the
asset's dimensions follows the cursor over the plan and respects the existing
snapping. A key rotates the ghost in fixed increments. A click drops a
`FurnitureInstance` through a `placeFurniture` command, and the tool stays armed
so you can place several in a row. Escape cancels.

A placed instance is an ordinary entity from then on. It draws in the 2D plan as
a footprint rectangle at its position and rotation with its name as a label, and
it joins selection, movement, deletion, and undo through the same paths walls and
openings already use. Rendering the asset's actual geometry in the 3D preview is
#175; this piece shows the footprint and the thumbnail.

## Scope

- Move the manifest schema, the `ASSET_KINDS` enumeration, and the license policy
  to `core/` as TypeScript; repoint the `vernacular-pack` CLI at the graduated
  module; keep its behavior and tests green.
- Add `FurnitureInstance` and `Floor.furniture[]` to the model, with factories, a
  `CURRENT_SCHEMA_VERSION` bump, a forward migration, and an ADR.
- Add the `AssetSource` interface, a `PackSource`, a `UserSource`, and the
  aggregating `AssetRegistry` with listing and resolution; expose the registry to
  React through a bridge context.
- Ship a small bundled starter pack and read it through the `PackSource`.
- Add the library browser panel and its tool-rail launcher, with search, source
  toggle, category and era filters, the thumbnail grid, and the import entry,
  meeting the accessibility bar.
- Add custom GLB import: signature check, hashing, cache storage, and a persisted
  user metadata index.
- Add the `place-furniture` tool, the `placeFurniture` command, the 2D footprint
  symbol, and selection, movement, deletion, and undo for placed furniture.

## Deferred, by design

- Rendering furniture geometry in the 3D preview. That is #175, with the model
  loader that also yields true footprints and a path to real thumbnails.
- Baking thumbnails from models. Needs a headless renderer and a heavy
  dependency, a later phase per the specification.
- Installing packs by URL with consent (section 4.6) and fetching packs from a
  remote source. MVP bundles one starter pack.
- LRU cache eviction and quota handling under pressure (section 4.10).
- Parametric asset variants. The `customizations` field is reserved so no later
  migration is needed, but nothing reads it yet (section 4.11).
- The export-bundle license summary and attribution file. Provenance enforcement
  at export is its own piece (section 4.8).

## Verification

- The graduated schema keeps the #173 CLI tests green, and the same manifest
  fixtures validate the same way through the `core/` module.
- The migration test loads a pre-furniture project and confirms every floor gains
  an empty `furniture` array with no other change.
- Registry tests cover listing across sources, resolution precedence, and the
  missing-asset placeholder, over injected sources with no real filesystem.
- Import tests cover a valid GLB stored under its hash and surfaced in the user
  source, and a non-GLB file rejected at the signature check.
- Placement tests cover arming from a thumbnail, the ghost following the cursor,
  rotation, a drop that adds a `FurnitureInstance` through the command, and the
  instance taking part in selection, movement, deletion, and undo.
- An end-to-end journey opens the library, places a starter piece, and sees it in
  the plan, with the accessibility checks passing.
- The full check chain stays green: typecheck, lint, format, the unit suite, the
  build, and the relevant end-to-end tests.
