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
position in millimeters, a rotation in degrees, an `elevationZ` height above the
floor in millimeters, a footprint of width and depth in millimeters used to draw
the 2D symbol and the placement ghost, an optional display name, and a reserved
`customizations` field for the parametric hook the specification keeps open
(section 4.11). It carries an id like the other entities. A floor gains a
`furniture: FurnitureInstance[]` array, shaped like its existing `walls`,
`openings`, and `dimensions`.

The rotation is a free angle, not a snapped one. Vernacular homes are rarely
square, and a planner for them has to let a piece sit at any angle, the same way
wall endpoints already take free angles. The data model stores the exact degrees;
the tool and the Inspector give a person both a fast way to spin a piece and an
exact way to type an angle (slice 6).

`elevationZ` defaults to 0, a piece on the floor. It is in the schema now even
though the 2D plan does not use it, because the next things a person places are
wall cabinets, shelves, and pendants that hang above the floor, and a placed-onto
schema is the wrong place to discover a missing field. A piece's intrinsic height
comes from its asset dimensions (the manifest carries width, depth, and height);
a per-instance height override, when one is needed, rides the reserved
`customizations` field rather than its own column, so it needs no further
migration.

This is a schema change, so it bumps `CURRENT_SCHEMA_VERSION` and adds a forward
migration that gives every existing floor an empty `furniture` array. The
factories produce floors with the new array. A new ADR records the furniture
instance model and the migration, since the project's rule is that a schema
change is documented in an ADR rather than by editing the design specification.

### 3. Asset sources and the registry

The `AssetSource` interface and the `AssetRegistry` already exist in
`storage/assets/` from the asset-cache track, and they were written for this
moment: the source today carries only `id` and `read`, with a note that "the
wider source surface (manifest, thumbnail, write, delete) lands with the library
browser and custom-import slices," and the registry already resolves a reference
through the section 4.2 precedence with a missing-asset placeholder hook. This
slice widens that source surface and adds a listing the browser can render,
rather than starting fresh.

Widen `AssetSource` with the manifest, thumbnail, and listing surface the browser
needs, and add a registry listing that gathers `LibraryItem` summaries across
sources (reference, name, kind, categories, eras, footprint, and an optional
thumbnail reference). Resolution stays the registry's existing precedence walk.

Two sources at MVP:

- A `PackSource` that reads the #173 pack format: a manifest validated by the
  graduated schema, asset bytes under `assets/<hash>.glb`, and thumbnails under
  `thumbnails/<hash>.webp`. A small starter pack ships as static files in the
  build output, not inlined into the JavaScript bundle. The `PackSource` fetches
  its manifest and files and the content-addressed cache holds them, so the
  bundle stays lean. The service worker precaches the starter pack manifest and
  thumbnails so the browser has content on first run and offline (section 4.10).
  The starter pack reuses the format and shape of the `vernacular-starter`
  fixture from #173.
- A `UserSource` backed by the asset cache and a metadata index, holding the
  models a person imports.

Pack-version fallback and the missing-asset placeholder are the registry
behaviors the asset-cache track left for a later slice, the runtime part #173
deliberately kept out of the build tool.

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

Imported models carry no reliable origin or scale: one model's origin sits at its
center, another's a meter off the mesh, and units range from meters to arbitrary.
Normalizing that, re-centering the origin to the footprint and confirming the
physical scale, needs the model geometry, which only the #175 loader reads. This
slice does not parse geometry at all. Reading a bounding box from the glTF
position accessors without applying the node transform hierarchy gives a
confident wrong answer more often than a useful one, so an editable footprint
default is the honest bridge until the loader lands. Scale correction is a
property of the asset, not of a single placement, so it will live on the user
library record (which is plain stored data, not the migrated document schema) and
costs no migration to add in #175.

Because asset references are content-addressed and a project saves as a
`.building` bundle that holds its assets at `assets/<hash>` (ADR-0042, the path
underlay rasters already take), a custom model does not bloat the project JSON;
the JSON holds the reference and the bytes live beside it. The one wiring this
slice owns is promotion: when a user-scoped model is placed and the project is
saved, its bytes copy into the project scope so the downloaded bundle is
self-contained and opens on another machine without the original import.

### 6. The 2D placement tool

A `place-furniture` tool arms when you pick a thumbnail. A ghost footprint at the
asset's dimensions follows the cursor over the plan and respects the existing
snapping, the grid and vertex snaps the wall and opening tools already use. The
`R` key spins the ghost in coarse steps for quick squaring-up, and the Inspector
takes an exact angle for a piece that has to sit at, say, 42 degrees against an
out-of-square wall. A click drops a `FurnitureInstance` through a `placeFurniture`
command, and the tool stays armed so you can place several in a row. Escape
cancels.

A placed instance is an ordinary entity from then on. It draws in the 2D plan as
a footprint rectangle at its position and rotation with its name as a label, and
it joins selection, movement, deletion, and undo through the same paths walls and
openings already use. The Inspector edits its angle, footprint, and name.
Rendering the asset's actual geometry in the 3D preview is #175; this piece shows
the footprint and the thumbnail.

Snapping a piece flush against a wall and rotating it to match that wall's run is
a natural next step, and so is warning when two pieces overlap. Both read the
wall vectors and the other instances rather than just the cursor, and neither is
needed to place furniture, so they are fast-follow candidates rather than MVP.
Forced collision avoidance is deliberately out: a planner should let a person put
a rug under a table.

## Scope

- Move the manifest schema, the `ASSET_KINDS` enumeration, and the license policy
  to `core/` as TypeScript; repoint the `vernacular-pack` CLI at the graduated
  module; keep its behavior and tests green.
- Add `FurnitureInstance` (with `elevationZ` defaulting to 0) and
  `Floor.furniture[]` to the model, with factories, a `CURRENT_SCHEMA_VERSION`
  bump, a forward migration, and an ADR.
- Widen the existing `storage/assets/` `AssetSource` with the manifest, thumbnail,
  and listing surface; add a `PackSource` and a `UserSource`; add a registry
  listing of `LibraryItem` summaries; expose the registry to React through a
  bridge context. The existing precedence resolution stays.
- Ship a small starter pack as static build files, read it through the
  `PackSource`, and precache it in the service worker for offline first run.
- Add the library browser panel and its tool-rail launcher, with search, source
  toggle, category and era filters, the thumbnail grid, and the import entry,
  meeting the accessibility bar.
- Add custom GLB import: signature check, hashing, cache storage, and a persisted
  user metadata index; promote a placed user asset into the project scope on save
  so the `.building` bundle is self-contained.
- Add the `place-furniture` tool, the `placeFurniture` command, the 2D footprint
  symbol, the Inspector editors for angle, footprint, and name, and selection,
  movement, deletion, and undo for placed furniture.

## Deferred, by design

- Rendering furniture geometry in the 3D preview. That is #175, with the model
  loader that also yields true footprints and a path to real thumbnails.
- Normalizing imported model origin and scale (re-centering to the footprint,
  confirming physical units). Needs the #175 loader's geometry; an editable
  footprint default bridges until then, and asset scale correction lands on the
  user library record without a migration.
- Baking thumbnails from models. Needs a headless renderer and a heavy
  dependency, a later phase per the specification.
- Snapping a piece flush to a wall, rotating it to the wall's run, and warning on
  overlap. Fast-follow once placement is in; forced collision avoidance stays out.
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
- A serialization test places an imported model, saves to a `.building` bundle,
  and reopens it from the bundle bytes alone with the asset resolving, confirming
  the model travels with the project rather than living only in the local import.
- Placement tests cover arming from a thumbnail, the ghost following the cursor,
  rotation, a drop that adds a `FurnitureInstance` through the command, and the
  instance taking part in selection, movement, deletion, and undo.
- An end-to-end journey opens the library, places a starter piece, and sees it in
  the plan, with the accessibility checks passing.
- The full check chain stays green: typecheck, lint, format, the unit suite, the
  build, and the relevant end-to-end tests.
