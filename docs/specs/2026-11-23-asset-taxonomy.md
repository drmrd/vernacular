# Asset taxonomy: domains, tiers, identifiers, and manifest contracts

Status: design, 2026-11-23. The owner ruled on its decisions on 2026-11-23, and ADR-0234, ADR-0235, ADR-0236, and ADR-0237 (all current) record them. They depend on ADR-0229 and ADR-0230, which are in an open pull request (#1054) and not yet on `main`, and ADR-0235 and ADR-0236 also build on ADR-0181 and ADR-0199, which are on `main`. Statements about the code were read from `main` at `d248d503b`. The "Open points" section lists what stays open.

## Why

The library on `main` holds one chair. A pack asset has one of nine kinds and a free list of category strings (`core/assets/pack-manifest.ts`), and no registry gives those strings a meaning. The design specification names a hierarchical category registry in section 4.4, and nobody has built it. The library filters by name, source, era, and style, and shows furniture only.

One chair needs no more than that. A library that also holds wall assemblies, windows, hardware, trim profiles, plants, and plan symbols does, and it needs three things that packs from different authors can share:

- a vocabulary that says what each asset is;
- a rule that says what an asset may depend on, so that no chain of dependencies loops;
- a readable name for an asset that stays the same when its bytes change.

This document defines all three, and it lists the descriptive fields ("contracts") that a manifest entry may carry.

## Goals

- One classification for every asset: a domain and a subcategory.
- One dependency rule that a tool can check from manifests alone.
- One identifier grammar for naming an asset and the parts inside it.
- Contract fields that extend the pack format without breaking a pack or a reader that exists today.
- Units, frames, and names that match the repository.

## Non-goals

- The store, the catalog, downloads, and credits. ADR-0229 and `docs/specs/2026-11-21-asset-pack-distribution.md` own them.
- A reader for each domain. A domain gets a reader when a feature needs one.
- Any change to how a project refers to an asset.

## What does not change

- **The reference.** A project refers to an asset by `(scope, contentHash)` (ADR-0007). The scope is `pack:<packId>@<version>`, `user`, or `project`, and the written form is `scope#contentHash`. Nothing in this document becomes a key for finding bytes.
- **The pack.** A pack stays the unit that is authored, versioned, and licensed. Its manifest lists its assets (ADR-0091, ADR-0219, ADR-0229).
- **The store.** Published packs go into the store of ADR-0229, in the layout of the distribution specification: `catalog.json`, `manifests/sha256/<manifestHash>.json`, `blobs/sha256/<contentHash>`, and `packs/<packId>-<version>/`. Blobs stay flat and carry no extension, because the manifest holds the media type. Sharded folders and extensions were considered and not taken.
- **The units.** Lengths in a manifest are millimeters (ADR-0027, ADR-0181, ADR-0219).
- **The ids in a project.** An element id is an opaque string. This document adds no prefix to it.
- **The licenses.** Each asset names one SPDX identifier from the allowlist in `core/assets/license-policy.ts`.

## Terms

- **Asset**: one entry in a pack manifest, with the file it names by `contentHash`.
- **Domain**: one of thirty classes of asset, written as a three-letter code such as `FFE`.
- **Subcategory**: a class inside a domain, such as `seating` inside `FFE`.
- **Category**: a domain and a subcategory together, written `FFE.seating`.
- **Tier** and **rank**: a domain's level in the dependency order. The rank is the number a tool compares.
- **Catalog identifier**: the readable name of an asset, such as `core:FFE.seating/windsor_side_chair@1.0.0`.
- **Sub-resource**: a named part inside an asset, such as a mount point or a material slot.
- **Contract**: a group of optional manifest fields that describes one aspect of an asset.

## Domains and tiers

There are thirty domains in four tiers. Each domain has a rank. Tier 2 and tier 4 split into steps, so the ranks are 10, 20, 25, 30, 40, 45, and 48.

| Code  | Domain                                        | Tier | Rank | What it holds                                                                   |
| ----- | --------------------------------------------- | ---- | ---- | ------------------------------------------------------------------------------- |
| `SUB` | Substrates                                    | 1    | 10   | The base matter of a surface: plaster, stone, timber, metal, soil.              |
| `COT` | Coatings                                      | 1    | 10   | Paints, stains, glazes, clear coats, and their surface texture.                 |
| `CLR` | Colors                                        | 1    | 10   | Named sets of colors.                                                           |
| `GLZ` | Glazing                                       | 1    | 10   | Glass and other media that pass light.                                          |
| `PAT` | Patterns                                      | 1    | 10   | Repeat layouts: masonry bonds, tile grids, weaves, wallpaper repeats.           |
| `RLF` | Relief                                        | 1    | 10   | Raised and cut surface detail: moldings in strip form, pressed metal, carving.  |
| `WTH` | Weathering                                    | 1    | 10   | Wear, decay, staining, and repair marks laid over a surface.                    |
| `LGT` | Light                                         | 1    | 10   | Emitters, light distributions, and sky maps.                                    |
| `VFX` | Effects                                       | 1    | 10   | Moving effects: flame, water, vapor, precipitation.                             |
| `SYM` | Symbols                                       | 1    | 10   | Drawing symbols and section hatches.                                            |
| `MAT` | Materials                                     | 2    | 20   | Finished materials composed from a substrate, coatings, colors, and weathering. |
| `PRF` | Profiles                                      | 2    | 20   | Cross-sections for swept and extruded shapes.                                   |
| `KIT` | Kit parts                                     | 2    | 20   | Parts that larger objects are assembled from.                                   |
| `BOT` | Botanical parts                               | 2    | 20   | The building blocks of plants: trunks, foliage, growth curves.                  |
| `LYR` | Layered assemblies                            | 2    | 25   | Ordered stacks of layers for walls, floors, roofs, paving, and ground.          |
| `STR` | Structure                                     | 3    | 30   | Footings, framing, beams, sheathing, and other concealed structure.             |
| `ENV` | Envelope                                      | 3    | 30   | The outer shell: cladding, roof coverings, exterior doors and windows, porches. |
| `INT` | Interior fixed elements                       | 3    | 30   | Ceilings, paneling, interior doors, trim, stairs, and built-ins.                |
| `HDW` | Hardware                                      | 3    | 30   | Locks, hinges, pulls, sash and shutter fittings.                                |
| `MEP` | Mechanical, electrical, and plumbing fixtures | 3    | 30   | Hard-wired lights, panels, radiators, sinks, tubs, valves.                      |
| `NET` | Network and low-voltage devices               | 3    | 30   | Network equipment, sensors, intercoms, and control panels.                      |
| `RGH` | Rough-in runs                                 | 3    | 30   | Cable, conduit, pipe, and duct runs.                                            |
| `APP` | Appliances                                    | 3    | 30   | Cooking, cold storage, laundry, and smaller powered equipment.                  |
| `FFE` | Furniture, furnishings, and equipment         | 3    | 30   | Movable furniture and room contents.                                            |
| `SIT` | Site elements                                 | 3    | 30   | Terrain, paving, fences, outbuildings, and garden structures.                   |
| `LND` | Landscape planting                            | 3    | 30   | Trees, shrubs, vines, flowers, grasses, and houseplants.                        |
| `CTX` | Site context                                  | 4    | 40   | Location, parcel, climate, and neighborhood data.                               |
| `STY` | Styles                                        | 4    | 45   | Period and regional style definitions and their rules.                          |
| `SCT` | Arrangement sets                              | 4    | 48   | Groups and layouts of objects: a shelf of books, a set table, a planting bed.   |
| `SYS` | Systems                                       | 4    | 48   | Networks that connect objects: circuits, piping trees, load paths, zones.       |

Tier 1 holds primitives that depend on nothing. Tier 2 holds things composed from primitives. Tier 3 holds the objects a person places. Tier 4 holds data about a site, a style, or a group of objects. The full list of 410 subcategories is in the "Inventory" section.

## The dependency rule

An asset may name other assets in its manifest entry: a material names its substrate, a door names the profile of its casing. The rule for those references is one comparison:

> An asset may reference another asset only when the rank of its own domain is greater than the rank of the other's domain.

The rule has these consequences:

- No tier 1 asset references another asset.
- `MAT`, `PRF`, `KIT`, and `BOT` reference tier 1 only. A material cannot reference a profile.
- `LYR` references tier 1 and the rank 20 domains.
- A tier 3 object references tiers 1 and 2. It never references another tier 3 object.
- `CTX` references tiers 1 to 3. `STY` references those and `CTX`. `SCT` and `SYS` reference those and `STY`.

Because a reference always points to a lower rank, no chain of references can return to where it started. A tool can check that from the manifests, with no payload open.

Three cases look as if they need a reference that points up or sideways. Each is handled another way.

1. **A layered assembly with framing.** A framed wall has studs in its cavity. The `LYR` asset describes them as a `PRF` profile and a spacing in millimeters. It does not reference a `STR` object.
2. **Assets that react to the site.** A sky emitter depends on the sun's position, and foliage depends on the season and the wind. `LGT` and `BOT` assets do not reference `CTX`. They declare named inputs (sun azimuth, day of the year, chill hours, wind vector), and the app supplies the values from the open project when it draws.
3. **Objects that hold other objects.** A window holds a sash lock, and an outlet box holds a device. The window does not reference the lock. It declares a socket, and the socket lists what it accepts as predicates over categories (see "Socket predicates"). Which lock sits in which window is a fact about a project, not about the catalog.

### Socket predicates

A predicate names a set of assets by category. It has three forms:

- `HDW.*`: every asset in the domain.
- `HDW.window_sash_casement/*`: every asset in the category.
- `HDW.window_sash_casement/brass_sash_lock`: every version of one named asset, in any namespace.

```text
^(SUB|COT|CLR|GLZ|PAT|RLF|WTH|LGT|VFX|SYM|MAT|PRF|KIT|BOT|LYR|STR|ENV|INT|HDW|MEP|NET|RGH|APP|FFE|SIT|LND|CTX|STY|SCT|SYS)\.(?:\*|([a-z][a-z0-9_]{2,47})\/(?:\*|([a-z][a-z0-9_]{1,63})))$
```

A predicate is not a reference, so the dependency rule does not apply to it. A tier 3 socket may accept tier 3 assets.

## Identifier grammar

A catalog identifier is the readable name of an asset.

```text
<namespace>:<DOMAIN>.<subcategory>/<slug>@<version>
```

For example: `core:FFE.seating/windsor_side_chair@1.0.0`.

| Part          | Rule                                                                  | Meaning                                  |
| ------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| `namespace`   | `core`, or `org_`, `usr_`, or `pkg_` followed by 1 to 31 characters   | Who names the asset.                     |
| `DOMAIN`      | One of the thirty codes                                               | The domain.                              |
| `subcategory` | 3 to 48 characters: lower-case letters, digits, underscores           | The subcategory, from the inventory.     |
| `slug`        | 2 to 64 characters: lower-case letters, digits, underscores           | The asset's name inside its subcategory. |
| `version`     | Semantic Versioning 2.0.0 without build metadata, for example `1.0.0` | The version of this asset.               |

```text
^(core|(?:org|usr|pkg)_[a-z0-9][a-z0-9-]{0,30}):(SUB|COT|CLR|GLZ|PAT|RLF|WTH|LGT|VFX|SYM|MAT|PRF|KIT|BOT|LYR|STR|ENV|INT|HDW|MEP|NET|RGH|APP|FFE|SIT|LND|CTX|STY|SCT|SYS)\.([a-z][a-z0-9_]{2,47})\/([a-z][a-z0-9_]{1,63})@(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?$
```

### Namespaces

- `core`: assets the Vernacular project publishes.
- `org_<name>`: assets an organization publishes.
- `usr_<name>`: a person's own assets.
- `pkg_<name>`: assets of a pack that names no organization.

The prefix `mfr_` is reserved for the maker of the real product an asset depicts, and a pack that uses it is refused. A later decision states what such a pack may contain under ADR-0230. The likely rule is that it is free, carries no price, no promotion, and no link whose purpose is a sale.

The namespace says who names the asset. It does not say where the bytes come from: that is the scope of the reference. A `usr_` asset usually sits in the `user` scope, and the others usually arrive in a pack, but nothing reads one from the other.

### What a slug holds

A slug names the fixed form of the thing, with its trade size when that is part of the form: `picture_rail_ogee_45x22mm`, `quercus_alba_white_oak`. It does not hold a paint color, the length of a run, the depth of the wall it sits in, or a phase of the building. Those belong to the place where the asset is used.

### Versions

The version in a catalog identifier is the asset's own. The pack that carries the asset has a separate version (ADR-0091).

- A published identifier never changes meaning. One identifier, version included, names one content hash in every pack and store that carries it. The rest of the entry can differ between packs: a new pack version may change the license or the credit of a file whose bytes stay the same (ADR-0229).
- A major version changes when a user of the asset could be broken: the pivot, the bounding dimensions, the tile size of a texture, the set of slots, sockets, ports, or articulation axes, or the thickness of a layered assembly.
- A minor or patch version changes for anything else.

### What the identifier is not

The identifier is metadata in a manifest entry. A project does not store it as its reference, the app does not resolve bytes by it, and no cache is keyed by it. Two versions with equal bytes share one content hash and one blob, and a project that names the hash finds either.

## Sub-resources

A sub-resource is a named part inside one asset. There are twelve kinds.

| Kind     | What it names                                                             |
| -------- | ------------------------------------------------------------------------- |
| `slot`   | A place where a material is bound.                                        |
| `socket` | A mount point that accepts another asset.                                 |
| `port`   | A typed connection point, such as a supply inlet or a cable terminal.     |
| `lod`    | One representation of the asset: a level of detail or a drawing symbol.   |
| `layer`  | One layer of a layered assembly.                                          |
| `node`   | A named node inside a model.                                              |
| `zone`   | A named region of the asset.                                              |
| `volume` | A named box, cylinder, or frustum around the asset, such as a door swing. |
| `morph`  | An articulation axis or a blend shape.                                    |
| `rule`   | One rule of a style or a system.                                          |
| `stream` | A named series of values the asset reads or writes.                       |
| `void`   | A cutout the asset makes in its host.                                     |

A sub-resource name is 2 to 48 characters: a lower-case letter followed by lower-case letters, digits, and underscores. The representations of an asset use the names `lod0`, `lod1`, `lod2`, `plan_symbol`, and `ceiling_plan_symbol`.

### Stored form

Where a manifest or a project needs to point at a sub-resource, it stores two fields beside the asset it belongs to:

```json
{ "kind": "socket", "name": "strike_plate" }
```

### Text form

Logs, messages, and tools write a sub-resource as the catalog identifier, a tilde, the kind, a colon, and the name:

```text
core:ENV.exterior_doors_entries/four_panel_door_813x2032mm@1.0.0~socket:strike_plate
```

```text
~(slot|socket|port|lod|layer|node|zone|volume|morph|rule|stream|void):([a-z][a-z0-9_]{1,47})$
```

The separator is a tilde because the number sign already has a meaning: a serialized asset reference is `scope#contentHash`, and the reader splits it at the last number sign (`core/model/asset-reference.ts`). A sub-resource is never appended to a serialized reference. The tilde appears in no catalog identifier, version, or hash, and a URL may carry it without escaping.

## How a manifest entry carries the taxonomy

Every field below is optional. A pack that has none of them stays valid, and a reader that knows none of them still reads the pack.

```json
{
  "contentHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "name": "Windsor side chair",
  "kind": "furniture",
  "mediaType": "model/gltf-binary",
  "license": "CC-BY-4.0",
  "attribution": "The Vernacular Contributors",
  "eras": ["victorian"],
  "categories": ["FFE.seating"],
  "dimensions": { "width": 500, "depth": 520, "height": 900 },
  "catalogId": "core:FFE.seating/windsor_side_chair@1.0.0",
  "references": ["core:MAT.millwork_cabinetry/oiled_ash@1.0.0"],
  "lifecycle": { "status": "active" }
}
```

The hash in the example is a placeholder.

- `catalogId` is the catalog identifier. It is unique within a pack.
- `categories` keeps its place and its type. A category from this taxonomy is written `<DOMAIN>.<subcategory>`. When an entry has a `catalogId`, the category inside it must be in `categories`. A string that starts with three capital letters and a full stop is read as a taxonomy category. The app checks that it is well formed and nothing more. The pack tool also checks that the registry lists it, and refuses the pack if not. Because the app does not read the registry, a pack built for a newer registry still opens in an older app, which shows the unknown category as a plain label. Any other string is a plain label and stays valid, so the starter pack's `seating` keeps working.
- `references` lists the catalog identifiers the entry depends on. The pack tool checks each against the dependency rule.
- `eras` and `styles` keep using the ids of the period and style registries. The `STY` domain classifies style assets. It is not a second list of eras.
- `lifecycle.status` is `active`, `deprecated`, or `withdrawn`. `lifecycle.replacedBy` names a catalog identifier in the same domain with a higher version or another slug. A `deprecated` or `withdrawn` asset changes how the library lists it. Neither removes a blob: a published file leaves the store only for a legal reason or a defect (ADR-0229).

Field names in a manifest are camel case, like `contentHash` and `mediaType`. Enumerated values are lower case with hyphens, like the values of `kind`. Subcategories, slugs, and sub-resource names use underscores, because they are parts of an identifier.

### More than one file for one asset

An entry has one `contentHash`: the file the app loads first. An asset with further files (lower levels of detail, a plan symbol) names each as a representation with its own hash, the way the distribution specification names a thumbnail, with a name and a media type added:

```json
"representations": [
  { "name": "lod1", "contentHash": "5f2c1d0e9b8a7f6e5d4c3b2a1908f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5", "byteLength": 48211, "mediaType": "model/gltf-binary" }
]
```

Each of those files is a blob in the store like any other. No reader uses `representations` yet (see "Contracts"), and the field stays reserved. The pack tool reads a file in `assets/` that no entry names as an orphan, so a pack folder that holds a representation file fails its integrity check today, and publishing leaves such files out. The change that makes the field checked also teaches the pack tool and the publish step where these files live.

## Contracts

A contract is a group of optional fields on a manifest entry. Ten are defined. The table says what each describes and where it stands.

"Checked" means the pack tool validates the fields once the adoption plan's manifest work lands. "Reserved" means the name and meaning are fixed here, the exact shape is settled in the pull request that adds the first reader, and until then a pack should leave the field out.

| #   | Contract                                     | Fields                                                     | What it describes                                                                                                                                                                                             | State                                               |
| --- | -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Representation                               | `representation`, `representations`                        | How the asset is drawn: a mesh, a profile swept along a path, an assembly built from parameters, a run along a spline, a plant. Its other files.                                                              | Reserved                                            |
| 2   | Material slots                               | `materialSlots`                                            | Named slots and what each accepts, as predicates over `MAT`, `GLZ`, and `SUB`. The real-world size of one texture repeat.                                                                                     | Reserved                                            |
| 3   | Sockets and ports                            | `sockets`, `ports`                                         | Mount points with their predicates and size limits, and typed connection points.                                                                                                                              | Reserved                                            |
| 4   | Articulation                                 | `articulation`                                             | Named sliding and turning axes with their limits, and blend shapes.                                                                                                                                           | Reserved                                            |
| 5   | Physical properties                          | `physical`                                                 | Thermal, moisture, acoustic, and radio properties of a substrate, a coating, or an object, and how a run is routed.                                                                                           | Reserved                                            |
| 6   | Connected device                             | `connectedDevice`                                          | The protocols a device speaks, its power source, and its endpoints. Any tier 3 object may carry it.                                                                                                           | Reserved                                            |
| 7   | Spatial volumes                              | `volumes`                                                  | Named volumes for clearance, swing, egress, and field of view, each marked `hard-clash`, `code-violation`, or `advisory`.                                                                                     | Reserved                                            |
| 8   | Phase                                        | none in the manifest                                       | When a placed element was installed and whether it exists, was removed, or is proposed. It belongs to the project, not the catalog. If it becomes a field on each element, one enumeration covers its values. | Decided with the renovation comparison design       |
| 9   | Bill of materials, provenance, and lifecycle | `billOfMaterials`, `provenance`, `lifecycle`, `references` | What the asset is made of, who made the file, and whether it has been replaced.                                                                                                                               | `provenance`, `lifecycle`, and `references` checked |
| 10  | Placement and cutouts                        | `placement`, `voids`                                       | What the asset sits on or in, where its pivot is, and the cutouts it makes in its host.                                                                                                                       | Reserved                                            |

Notes on individual contracts:

- **Provenance.** `license`, `attribution`, and `sourceUrl` stay where the pack format has them, and `copyright` where the distribution specification adds it. `provenance` adds `author` (a name) and `method` (a free text value). Both are optional. Credits show `attribution`, because that field carries the credit a license such as CC-BY-4.0 asks for. `provenance.author` records who made the file and is never shown in its place. A work that is in the public domain by age is labeled by the first-party rule: a first-party file made from it carries the first-party license of ADR-0229, CC-BY-4.0, with the source in `sourceUrl` and a note in the pack's NOTICE. A file redistributed unchanged is CC0-1.0 only when the source institution states CC0. The allowlist gains no new class.
- **Material slots.** One texture repeat is given in millimeters, the same quantity as `tileSize` in ADR-0219.
- **Placement.** A declared pivot is a point in the model's own frame, in millimeters, and it can be zero or negative, so it is checked by the signed length rule (see "Units and frames"). Today the loader fits each model into the box of its manifest dimensions and ignores the model's own origin (ADR-0095). That stays the behavior for an entry that declares no pivot.
- **Cutouts.** A void is `through-cutout` or `partial-depth-recess`. The wall builder cuts every opening through the whole wall today, so the pack tool refuses `partial-depth-recess` until walls support it.
- **Layered assemblies.** A `LYR` asset describes structural layers only. The visible finish of a wall face stays a surface treatment in the project (ADR-0237). An assembly may suggest a default finish for each face. The app copies it into the project's paint map one time, when the assembly is applied, and keeps no link back. The shape of a suggestion is reserved.
- **Physical properties.** The renderer ignores what it cannot use. Each quantity has one unit, named in the schema. Entries in `SUB` (substrates) and `COT` (coatings) of a first-party pack carry baseline properties as reserved data that nothing reads yet.
- **Representations.** An entry's `contentHash` stays the file the app loads first. Each further file is a blob like any other, with a name, a hash, a byte length, and a media type.

A contract field that no reader uses is not validated beyond its place in the schema. A field moves from "reserved" to "checked" in the pull request that adds its first reader.

## Units and frames

- Every length in a manifest is a number of millimeters. A size must be positive and at most 100,000 millimeters: dimensions, tile sizes, spacings, thicknesses, size limits, and the sizes of volumes. A position is measured from the origin of the model's own frame, so it can be zero or negative: the positions of sockets, ports, and volumes, and a pivot. A signed rule checks those: a finite number with an absolute value of at most 100,000 millimeters.
- Angles in a manifest are degrees.
- A model file is binary glTF: right-handed, Y up, with its own unit of meters. The app scales the model to the manifest's millimeter dimensions when it places it, so the manifest dimensions are the authority on size.
- The plan frame has x to the right and y up the page. The world frame is right-handed with Y up, in millimeters, and plan y maps to world -Z (ADR-0139).
- The vertical datum is the project datum: world Y = 0, the level that floor elevations are measured from. Ground level is `Site.gradeElevation` relative to it (ADR-0131, ADR-0138). Terrain data, when it arrives, is measured from the same datum.

### A key for derived geometry

Some assets will be built from a base asset and parameters, such as a profile swept to a length. When a cache for such geometry exists, its key is the SHA-256 of the base asset's content hash, a zero byte, and the parameters as canonical JSON (RFC 8785) after rounding. The key is never stored in a project, and it is never used for walls or for placing an element. The parameters include the manifest fields that change the geometry, such as a declared pivot, and the dimensions when the cache holds geometry built at that size. Before hashing, each length is written as an integer count of `DERIVED_COORDINATE_GRID_MM` (1e-6 mm), the grid the kernel rounds derived coordinates to, rounded half away from zero. Each angle is written as an integer count of 1e-9 degree, and counts and names are written as they are. Any other real parameter gets a step small enough that one step moves no vertex more than 1e-6 mm. The steps are named entries of the tolerance module, and the cache imports them. The cache builds the geometry from the rounded values, so its output depends only on the key. No rounded value is ever stored.

What this guarantees: two equal keys come from parameters less than one step apart, a thousandth of the length tolerance, so a cache never gives one shape the geometry of a shape the kernel tells apart. Values already on the grid, which includes every multiple of 0.1 mm and of 1/64 inch, keep their value, so for them the keys are equal exactly when the values are. What it does not guarantee: two values within the length tolerance can still get two keys, for instance when they straddle a grid boundary. No key can do better, because "closer than 0.001 mm" is not transitive and key equality is. Such a miss costs one more build and never a wrong shape. A coarser step, the length tolerance itself, was rejected because every odd multiple of 1/16 inch lies exactly on its cell boundaries.

No such cache exists today. Meshes loaded from a file stay keyed by content hash.

## How domains meet kinds and registries

`kind` and domain answer different questions. `kind` tells the reader how to load and place a file: a `furniture` entry is a model with dimensions, and a `texture` entry is a tiled image. The domain says what the thing is. Both stay.

| State on `main`                                        | Kind                    | Domains                                                                     |
| ------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------- |
| Validates, loads, and shows in the library             | `furniture`             | `FFE`, `APP`                                                                |
| Validates and loads as a tiled image (ADR-0219)        | `texture`               | `SUB`, `COT`, `GLZ`, `PAT`, `RLF`, `WTH`, where the file is an image        |
| Validates as a model, and the library does not show it | `architectural-element` | `STR`, `ENV`, `INT`, `HDW`, `MEP`, `NET`, `KIT`, `SIT`                      |
| Validates as a model, and nothing reads it             | `trim-profile`          | `PRF`                                                                       |
| Validates as a model, and nothing reads it             | `stair-component`       | The stair subcategories of `KIT` and `INT`                                  |
| Validates as a model, which does not suit the content  | `material`, `palette`   | `MAT`, `COT`, `GLZ`, `CLR`                                                  |
| Validates only as a model, so an image is refused      | `underlay-image`        | No domain                                                                   |
| Validates only as a model, so an image is refused      | `preview-only`          | No domain                                                                   |
| No kind and no reader                                  | none                    | `LGT`, `VFX`, `SYM`, `BOT`, `LYR`, `RGH`, `LND`, `CTX`, `STY`, `SCT`, `SYS` |

The taxonomy does not classify the `underlay-image` and `preview-only` kinds. Both validate today only as a model with dimensions (`core/assets/pack-manifest.ts`), so the validator refuses an underlay stored as an image. The trim-profile, stair-component, material and palette, and no-kind rows are work to do, because no reader uses those kinds well or at all, and this document does not schedule it. A domain becomes publishable when a pull request adds its reader and says which kind and media type it uses. Until the skip rule of pack format 3 lands (#1125), that new kind or media type takes a pack format version, because a reader today refuses a kind or media type it does not know. The skip rule makes this additive: a reader skips an asset whose kind or media type it does not know and shows it as needing a newer app. Kinds and media types added after it then move no format version.

Several domains overlap a registry the app already has:

| Domain | Registry in `core/registries/` |
| ------ | ------------------------------ |
| `CLR`  | Palettes                       |
| `COT`  | Finishes                       |
| `PAT`  | Floor patterns                 |
| `PRF`  | Trim profiles                  |
| `LYR`  | Construction profiles          |
| `STY`  | Styles and periods             |

The registry stays the place the app reads from. A pack asset in one of these domains adds entries to that registry, as ADR-0006 describes for packs. It does not create a second source for the same data. The registries are constants in the code today, and the architecture refactor makes them resolvable at run time (`docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.5), so this part waits for that work.

The taxonomy itself becomes two registries: the thirty domains with their tiers and ranks, and the categories with a display name for each. The second is the category registry of design specification section 4.4. All 410 categories enter it at once: an author needs the word before the first asset exists, the data costs a few kilobytes, and the library shows a chip only for a category that an item carries.

## Inventory

The 410 subcategories, by domain. Tier 1 has 114, tier 2 has 64, tier 3 has 158, and tier 4 has 74. A subcategory id is unique within its domain.

### Tier 1: primitives

#### `SUB`: Substrates (21)

`polymer_rubber_jacket`, `composites_laminates_shells`, `sealants_adhesives_firestop`, `plaster_cement`, `concrete_asphalt_paving`, `clay_masonry_unit`, `mortar_grout`, `natural_stone`, `hardwood_timber`, `softwood_timber`, `engineered_wood_board`, `ceramic_terrazzo_body`, `bare_metal`, `paper_wallcovering_base`, `textile_leather`, `roofing_cladding_sheet`, `insulation_core_media`, `soil_mineral_ground`, `organic_bark_foliage`, `lath_backer_sheathing`, `specialty_interior_organics`.

#### `COT`: Coatings (14)

`mineral_silicate`, `lime_calcimine_milk`, `oil_alkyd_enamel`, `latex_acrylic_paint`, `wood_stain_dye`, `clearcoat_resin`, `oil_wax_penetrating`, `metallic_patina_plating`, `ceramic_stone_glaze`, `primers_undercoats`, `functional_specialty_coatings`, `application_microtexture`, `faux_decorative_finishes`, `textured_wall_coatings`.

#### `CLR`: Colors (10)

`historic_earth_mineral`, `architectural_paint_decks`, `wood_stain_tones`, `mortar_masonry_tints`, `textile_wallpaper_inks`, `utility_safety_codes`, `sanitary_appliance_enamels`, `factory_cladding_metals`, `mineral_clay_stone_tones`, `botanical_seasonal_palettes`.

#### `GLZ`: Glazing (11)

`historic_clear_sheet`, `modern_architectural`, `stained_colored_art`, `reflective_mirror`, `translucent_diffusers`, `static_water_ice`, `opaque_structural_glass`, `films_dynamic_glazing`, `thin_subsurface_media`, `obscure_textured`, `prism_crystal_optical`.

#### `PAT`: Patterns (12)

`masonry_bonds`, `wood_floor_layouts`, `tile_mosaic_grids`, `cladding_roof_courses`, `wall_ceiling_panel_grids`, `paving_concrete_joints`, `mesh_fencing_infill`, `wallpaper_damask_botanical`, `textile_weaves_prints`, `glazing_caming_grids`, `perforation_cutout_alpha`, `stencil_border_banding`.

#### `RLF`: Relief (10)

`industrial_equipment_stamps`, `wood_tooling_joinery`, `classical_molding_strips`, `pressed_metal_ceilings`, `embossed_wallcoverings`, `hardware_cast_filigree`, `carved_wood_plaster_stamps`, `exterior_stone_terracotta`, `upholstery_soft_reliefs`, `ceramic_glass_embossing`.

#### `WTH`: Weathering (10)

`seasonal_weather_overlays`, `paint_coating_failure`, `plaster_masonry_decay`, `moisture_biological`, `corrosion_patina_heat`, `wear_patina_interior`, `site_ground_decals`, `renovation_repair_scars`, `domestic_grime_scale`, `pest_animal_damage`.

#### `LGT`: Light (8)

`historic_flame_emitters`, `electric_lamp_emitters`, `physical_sky_ephemeris`, `display_functional_emitters`, `dimming_flicker_curves`, `hdri_environment_maps`, `ies_distributions`, `light_cookies_gobos`.

#### `VFX`: Effects (8)

`fire_combustion`, `water_fluid_motion`, `steam_vapor_air`, `weather_precipitation`, `simulation_overlays`, `exhaust_workshop_plumes`, `fault_diagnostic_fx`, `ambient_micro_motion`.

#### `SYM`: Symbols (10)

`arch_plan_symbols`, `electrical_plan_symbols`, `plumbing_hvac_symbols`, `network_smart_symbols`, `section_cut_hatches`, `annotation_site_symbols`, `structural_framing_symbols`, `life_safety_code_symbols`, `schematic_riser_symbols`, `phasing_markup_symbols`.

### Tier 2: composed materials, parts, and assemblies

#### `MAT`: Materials (13)

`interior_wall_ceiling`, `flooring_finishes`, `millwork_cabinetry`, `exterior_masonry_stucco`, `exterior_siding_roofing`, `hardware_metals`, `soft_goods_upholstery`, `site_hardscape_ground`, `utility_roughin_finishes`, `glazing_transmissive_recipes`, `sanitary_appliance_finishes`, `concealed_structural_finishes`, `decorative_specialty_finishes`.

#### `PRF`: Profiles (13)

`interior_wall_trim`, `opening_casing_window`, `stair_railing_profiles`, `exterior_trim_siding`, `roofing_rainwater`, `lathe_turned_contours`, `structural_framing_sections`, `conveyance_roughin_sections`, `site_hardscape_sections`, `cabinet_counter_furniture`, `plaster_mantel_profiles`, `tracks_seals_channels`, `metalwork_glazing_extrusions`.

#### `KIT`: Kit parts (14)

`opening_adaptors_sashes`, `trim_blocks_connectors`, `stair_railing_parts`, `cabinetry_casework_parts`, `fireplace_chimney_parts`, `exterior_fence_gutter_parts`, `framing_masonry_units`, `mep_radiator_sections`, `roughin_fittings_connectors`, `electrical_lowvoltage_boxes`, `lighting_fixture_parts`, `plumbing_hydronic_subparts`, `roof_porch_ornament_parts`, `furniture_softgoods_parts`.

#### `BOT`: Botanical parts (12)

`trunk_branch_kits`, `seasonal_phenology_curves`, `wind_deformation_profiles`, `vines_moss_attachments`, `growth_pruning_templates`, `root_canopy_simulation`, `deciduous_foliage_atlases`, `conifer_evergreen_atlases`, `floral_blossom_atlases`, `grass_fern_groundcover`, `houseplant_tropical_atlases`, `fruits_cones_harvest`.

#### `LYR`: Layered assemblies (12)

`historic_masonry_walls`, `framed_exterior_walls`, `interior_partition_walls`, `floor_ceiling_assemblies`, `roof_attic_assemblies`, `site_paving_hardscape`, `subsurface_ground_strata`, `below_grade_foundations`, `wet_fire_acoustic_strata`, `porch_deck_cantilever`, `fenestration_glazing_stacks`, `countertop_surface_stacks`.

### Tier 3: objects

#### `STR`: Structure (14)

`footings_below_grade`, `structural_masonry_cores`, `wall_framing_systems`, `floor_ceiling_framing`, `roof_attic_framing`, `beams_girders_columns`, `sheathing_subfloors_lath`, `insulation_thermal_fill`, `air_vapor_water_barriers`, `firestop_draftstop_acoustic`, `remediation_shoring_retrofits`, `stair_shaft_openings_framing`, `specialty_historic_structural`, `lateral_bracing_connectors`.

#### `ENV`: Envelope (15)

`foundation_exteriors`, `cladding_siding_systems`, `roof_coverings_flashing`, `roofline_features_openings`, `chimneys_exterior_stacks`, `rainwater_management`, `exterior_doors_entries`, `windows_exterior_glazing`, `window_exterior_attachments`, `porches_balconies_stairs`, `parapets_copings_facade_caps`, `attached_conservatories_sunrooms`, `exterior_accessibility_egress`, `resilience_exclusion_pet_doors`, `exterior_trim_ornament`.

#### `INT`: Interior fixed elements (15)

`ceiling_assemblies`, `wall_paneling_surfaces`, `interior_doors_openings`, `interior_linear_trim`, `staircases_circulation`, `built_in_kitchen_bath`, `built_in_living_storage`, `flooring_transitions`, `historic_specialty_built_ins`, `interior_glazed_partitions`, `specialty_room_built_ins`, `accessibility_mobility_built_ins`, `utility_access_service_built_ins`, `interior_carved_ornament`, `fireplaces_mantels_hearths`.

#### `HDW`: Hardware (13)

`door_locksets_latches`, `door_hinges_pivots`, `door_controls_accessories`, `window_sash_casement`, `cabinet_furniture_hardware`, `interior_hanging_bath_accents`, `stair_railing_fittings`, `sliding_folding_track_hardware`, `safety_accessibility_childproof`, `door_knobs_levers_plates`, `exterior_shutter_hardware`, `exterior_structural_utility`, `historic_specialty_ironwork`.

#### `MEP`: Mechanical, electrical, and plumbing fixtures (17)

`electrical_service_panels`, `electrical_wiring_devices`, `solar_storage_ev_gen`, `hvac_plant_equipment`, `plumbing_trim_valves`, `water_drainage_plant`, `exterior_yard_water_utilities`, `life_safety_active`, `fuel_storage_water_recovery`, `hydronic_radiant_controls`, `motorized_building_actuators`, `accessible_specialized_fixtures`, `interior_lighting_hardwired`, `exterior_lighting_hardwired`, `hvac_terminals_stoves`, `plumbing_fixtures_sanitary`, `historic_obsolete_fixtures`.

#### `NET`: Network and low-voltage devices (11)

`telecom_wan_demarc`, `servers_racks_power`, `core_network_wireless`, `smart_hubs_relays`, `sensors_telemetry_indoor`, `sensors_telemetry_outdoor`, `security_access_intercom`, `distributed_av_lowvoltage`, `control_panels_voice_interfaces`, `utility_structural_monitors`, `rf_radio_cellular_boosters`.

#### `RGH`: Rough-in runs (15)

`elec_cable_runs`, `elec_conduit_boxes`, `plumbing_supply_runs`, `plumbing_dwv_runs`, `hydronic_fuel_gas_runs`, `hvac_ductwork_linesets`, `lowvoltage_data_cabling`, `specialty_historic_runs`, `site_service_drops`, `site_stormwater_drainage`, `fire_suppression_piping`, `renewables_radon_geothermal`, `snow_melt_heat_trace`, `cable_pipe_pathways_trays`, `elec_grounding_bonding`.

#### `APP`: Appliances (12)

`major_cooking`, `refrigeration_cold`, `dishwashing_sanitation`, `laundry_garment`, `computing_office_tech`, `small_kitchen_countertop`, `floorcare_portable_climate`, `consumer_av_media`, `workshop_power_machinery`, `handheld_cordless_garage_equip`, `hobby_craft_music_tech`, `personal_care_home_medical`.

#### `FFE`: Furniture, furnishings, and equipment (19)

`window_treatments_softgoods`, `art_mirrors_clocks`, `workshop_utility_storage`, `seating`, `tables_desks`, `storage_case_goods`, `beds_sleeping`, `portable_lighting`, `decor_everyday_clutter`, `porch_patio_movable`, `home_gym_fitness`, `portable_life_safety`, `pet_furniture_gear`, `scale_figures_ergonomics`, `entry_bath_laundry_movables`, `nursery_child_play`, `recreation_music_hobby`, `accessibility_aging_aids`, `historic_period_accent_pieces`.

#### `SIT`: Site elements (12)

`terrain_earthworks`, `paving_walks_driveways`, `walls_fences_enclosures`, `outbuildings_structures`, `water_stormwater_structures`, `outdoor_living_garden_built`, `site_utility_monuments`, `homestead_historic_outbuildings`, `site_accessibility_energy_racks`, `vehicles_mobility_proxies`, `play_recreation_sport`, `garden_ornament_bridges`.

#### `LND`: Landscape planting (15)

`deciduous_shade_trees`, `ornamental_fruit_trees`, `conifer_evergreen_trees`, `shrubs_hedges_woody`, `vines_climbers`, `flowers_perennials_bulbs`, `grasses_turf_groundcovers`, `edible_kitchen_garden`, `indoor_houseplants_florals`, `aquatic_wetland_raingarden`, `arid_xeriscape_rockgarden`, `tropical_subtropical_coastal`, `greenroof_living_walls`, `weeds_overgrowth_volunteer`, `natural_organic_geological`.

### Tier 4: context, styles, arrangements, and systems

#### `CTX`: Site context (15)

`zoning_building_codes`, `municipal_utility_demarc`, `microclimate_urban_modifiers`, `regional_economics_incentives`, `geolocation_geodesy`, `parcel_survey_boundaries`, `neighborhood_massing_backdrop`, `offsite_canopy_shadows`, `climate_weather_datasets`, `wind_precipitation_hazards`, `horticultural_soil_ecology`, `environmental_ambient_context`, `geospatial_dem_imagery`, `subsurface_hydrogeology_hazards`, `historical_archival_records`.

#### `STY`: Styles (17)

`era_pre_1840_early_american`, `era_1840_1900_victorian_revival`, `era_1900_1945_eclectic_crafts`, `era_1945_1985_midcentury_postwar`, `era_1985_present_contemporary`, `regional_vernacular_dialects`, `era_systems_baselines`, `interior_decor_substyles`, `landscape_garden_styles`, `proportion_composition_grammars`, `preservation_compatibility_rules`, `renovation_layering_archetypes`, `international_historic_styles`, `building_typologies_massing`, `color_finish_harmonization`, `historic_millwork_trade_catalogs`, `adaptive_reuse_universal_design`.

#### `SCT`: Arrangement sets (17)

`bookshelves_media_collections`, `kitchen_pantry_tabletop`, `living_mantel_surface_vignettes`, `bedroom_bath_laundry_clutter`, `workshop_garage_utility_clusters`, `home_office_hobby_pet_zones`, `holiday_seasonal_event_overlays`, `botanical_garden_bed_mixes`, `natural_ground_organic_scatter`, `hardscape_porch_yard_vignettes`, `renovation_construction_staging`, `parametric_linear_grid_arrays`, `room_furniture_layout_grammars`, `window_softgoods_ensembles`, `ecological_biome_plant_communities`, `weather_snow_interior_detritus`, `family_life_stage_event_clutter`.

#### `SYS`: Systems (25)

`electrical_power_graphs`, `lighting_control_scenes`, `hvac_air_distribution_graphs`, `hydronic_steam_thermal_loops`, `plumbing_potable_water_trees`, `plumbing_dwv_venting_trees`, `fuel_gas_combustion_graphs`, `stormwater_site_hydrology`, `irrigation_landscape_zones`, `data_poe_network_topologies`, `rf_wireless_mesh_graphs`, `smart_home_automation_logic`, `structural_load_paths`, `thermal_hygrothermal_zones`, `acoustic_noise_zones`, `life_safety_egress_fire`, `spatial_functional_zones`, `occupancy_usage_schedules`, `phasing_cost_maintenance_plans`, `daylighting_solar_shading`, `iaq_contaminants_hazmat`, `energy_carbon_operating_cost`, `clash_clearance_code_audits`, `specialty_conveyance_grounding`, `live_telemetry_asbuilt_bindings`.

## Open points

The owner ruled on the rest. These stay open, and each ADR lists the ones that touch it.

1. Which kinds and media types the domains with no reader will use. The owner ruled on the skip rule above (#1125). The kind for each domain is decided when its reader lands, and an issue tracks each one: media types per kind (#1126), registry entries as pack assets (#1127), `LYR` (#1128), `CLR` (#1129), `COT` (#1130), `MAT` (#1131), `GLZ` (#1132), `STY` (#1133), `SYM` (#1134), `LGT` (#1135), `LND` (#1136), `BOT` (#1137), `SCT` (#1138), `CTX` (#1139), and `RGH`, `VFX`, and `SYS` (#1140).
2. The phase of a placed element. The renovation comparison design (#494) decides it, not this document. If it becomes a field on each element, one enumeration covers its values.

## References

- [ADR-0234](../knowledge/decisions/ADR-0234-assets-are-classified-by-domain-and-tier-and-references-point-down.md)
- [ADR-0235](../knowledge/decisions/ADR-0235-a-catalog-identifier-names-an-asset-beside-its-content-hash.md)
- [ADR-0236](../knowledge/decisions/ADR-0236-asset-contracts-are-optional-manifest-fields-in-millimeters.md)
- [ADR-0237](../knowledge/decisions/ADR-0237-a-layered-assembly-holds-structure-and-the-finish-stays-a-surface-treatment.md)
- ADR-0006, ADR-0007, ADR-0027, ADR-0091, ADR-0095, ADR-0130, ADR-0131, ADR-0137, ADR-0138, ADR-0139, ADR-0181, ADR-0199, ADR-0219, ADR-0229, ADR-0230
- `docs/specs/2026-06-01-vernacular-design.md`, sections 4.4, 4.5, and 4.9
- `docs/specs/2026-11-21-asset-pack-distribution.md`
- `docs/plans/2026-11-23-asset-taxonomy-adoption.md`
- RFC 8785, JSON Canonicalization Scheme. Semantic Versioning 2.0.0. glTF 2.0.
