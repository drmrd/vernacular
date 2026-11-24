---
slug: decisions/ADR-0219-pack-assets-carry-textures
title: 'ADR-0219: Each pack asset declares a media type, and texture assets carry tiled images'
type: decision
tags: [architecture, assets, packs, textures, validation, integrity, license, ground, daylight]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0024-pack-manifest-validation-location,
    decisions/ADR-0091-pack-integrity-and-build-pipeline,
    decisions/ADR-0093-in-app-asset-library,
    decisions/ADR-0130-finishes-system-architecture,
    decisions/ADR-0131-ground-plane-grade-datum,
    decisions/ADR-0192-daylight-calibrated-from-three-targets-with-a-fixed-white-point,
    decisions/ADR-0238-a-texture-cache-lives-for-one-effect-run-of-one-view,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/specs/2026-06-16-asset-pack-format-and-cli.md,
    docs/plans/2026-11-19-texture-assets-in-packs.md,
    core/assets/pack-manifest.ts,
    core/assets/texture-asset-rules.ts,
    core/assets/texture-file-rules.ts,
    core/assets/image-header.ts,
    core/assets/asset-description.ts,
    scripts/pack/pack-integrity.mjs,
    scripts/pack/vernacular-pack.mjs,
    scripts/pack/generate-fixtures.mjs,
    storage/assets/asset-source.ts,
    storage/assets/pack-source.ts,
    storage/assets/fetch-pack-reader.ts,
    storage/assets/asset-registry.ts,
    editor/library/library-filter.ts,
    engine/loaders/image-texture-loader.ts,
    engine/scene/furniture-model.ts,
    bridge/react/texture-cache.ts,
    bridge/react/use-ground-texture.ts,
    core/environment/ground-surface.ts,
  ]
status: current
updated: 2026-11-23
---

# ADR-0219: Each pack asset declares a media type, and texture assets carry tiled images

## Status

Current, 2026-11-23, and proposed on 2026-11-20. On 2026-11-18 the owner chose to widen the pack format so that packs can
carry texture assets, with this record and an amendment of section 4.3 of the design
specification. He also chose that the grass of the ground (#409) ships in starter pack 1.1.0.

On 2026-11-19 he confirmed five defaults of this record:

- Format 1 packs still load.
- A reader refuses a pack of a newer format as a whole.
- The library hides textures until finishes use them.
- A texture is PNG or WebP, each side a power of two from 64 to 2048 pixels, at most 8 MiB, with no animation and no embedded color profile.
- The CC0-1.0 license of the generated grass is a rule for the starter pack only. (Replaced on
  2026-11-21: the grass carries CC-BY-4.0. ADR-0229 records that license decision.)

The other rules below are this record's design. The first code pull request of
`docs/plans/2026-11-19-texture-assets-in-packs.md` built the format on 2026-11-22. It covers the
manifest rules, the checks of the pack command line tool, the pack source, and the library's filter
by kind. The second pull request added the asset registry's description of an asset, the image
loader, and the texture cache on 2026-11-23; ADR-0238 records how the cache holds and frees what
it decodes. The grass comes in a later pull request of the same plan. The Context section
describes the code as it was before the first pull request.

## Context

A pack holds models only. Every asset is a binary glTF file at `assets/<contentHash>.glb`
(`ASSET_EXTENSION` in `scripts/pack/pack-integrity.mjs`, and `readAsset` in
`storage/assets/fetch-pack-reader.ts`). Every asset must declare a width, a depth, and a height
in millimetres (`validateDimensions` in `core/assets/pack-manifest.ts`). Every asset must have a
WebP thumbnail at `thumbnails/<contentHash>.webp` (`checkThumbnails` in
`scripts/pack/pack-integrity.mjs`).

The manifest already names a `kind` for each asset. The nine kinds of section 4.5 of the design
specification include `texture`. But the kind changes no rule. A texture today would have to be a
`.glb` file with a box size and a thumbnail. Nothing in the format can hold an image.

Three needs ask for images:

- The ground plane paints one flat lawn color, `GROUND_SURFACE_HEX` (`#5f8a4f`). Issue #409 asks
  for a grass texture that comes through the content-addressed asset pipeline.
- ADR-0130 reserves the `tiled-image` surface treatment for photographic wallpaper (#378) and
  photographic cladding (#379). It names an `assetRef` as the source of the image. No asset can
  hold one yet.
- Hard invariant 4 says every asset reference is `(scope, contentHash)` (ADR-0007). Section 4.1 of
  the design specification names a `bundled` scope for a small set of files shipped with the
  application, and `core/assets/asset-resolution.ts` knows that scope. But no source is built for
  it, so an image outside a pack has nothing that resolves it today.

The ground has one more constraint. The calibrated sky takes its ground bounce from the luminance
of the lawn color, 0.21174 in linear light (`GROUND_BOUNCE_COLOR` in
`core/environment/ground-surface.ts`, ADR-0192). Two scene gates compare a sunlit and a shaded
square of lawn, each 24 pixels on a side (`e2e/tests/scene-sun-to-shade.spec.ts`,
`e2e/tests/scene-shadow-reach.spec.ts`). A grass image must keep the lawn's mean, and keep it in
every part of the image as large as a gate square.

The library lists every asset of the starter pack. It has no filter by kind
(`editor/library/library-filter.ts`). Section 4.5 of the design specification says that each tool
sees only the kinds it can use.

## Decision

### The manifest has a format version

- The manifest gains a top-level integer, `formatVersion`. A manifest without it is format 1.
  This record defines format 2.
- Format 1 is read exactly as today. Every asset is a model. No asset may name a media type.
- Format 2 adds a required `mediaType` to every asset, and the texture rules below.
- The format version moves only when a reader of the earlier format would misread a pack. A new
  optional field does not move it.
- The format version is not the pack version. The pack's SemVer `version` counts changes to its
  content.

### What a reader does with a pack of another format

- A reader that knows format 2 reads a format 1 pack as before. Starter pack 1.0.0 and every
  format 1 fixture still validate and still load.
- A reader refuses a pack whose `formatVersion` it does not know. The error names the pack's
  format and the newest format the reader knows. The reader lists no asset of that pack. A pack is
  immutable and checked as a whole, so the reader does not load the part it understands and drop
  the rest. A project that references an asset of a refused pack gets the missing-asset
  placeholder of section 4.2 of the design specification.
- A reader built before this record does not know `formatVersion`. It reads a format 2 pack as
  format 1. A texture has no dimensions, so the old validator fails the manifest, and the old pack
  source lists nothing from it. Its `read` still fetches `assets/<contentHash>.glb` by hash, so it
  still resolves a model of that pack. The application ships with the address of its own starter
  pack, so an older build never fetches a newer pack. Installing a pack by address does not exist
  yet.

### Each kind allows a set of media types

| Kind                                                                                                                             | Media types in format 2   | File in `assets/`                           |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------- |
| `furniture`, `architectural-element`, `trim-profile`, `stair-component`, `material`, `underlay-image`, `palette`, `preview-only` | `model/gltf-binary`       | `<contentHash>.glb`                         |
| `texture`                                                                                                                        | `image/png`, `image/webp` | `<contentHash>.png` or `<contentHash>.webp` |

The kind says what an asset is for. The media type says how its bytes are read. The file
extension follows from the media type. Every kind except `texture` keeps the rules it has today.
A later record can give `underlay-image`, `palette`, or `material` media types of their own.

### The rules for a model

These do not change:

- `dimensions` holds `width`, `depth`, and `height` in millimetres, each above zero and at most
  100,000.
- A WebP thumbnail at `thumbnails/<contentHash>.webp` is required.

### The rules for a texture

- `image` holds `width` and `height` in pixels. Each is a power of two from 64 to 2048. With a power
  of two, every smaller copy (mipmap) of the tile is still an exact repeating tile, so no seam shows
  at a distance. The upper bound keeps one texture under 22 MiB of graphics memory, with its
  mipmaps.
- `tileSize` holds `width` and `height` in millimetres. One copy of the image covers that area of
  the surface. The image's width runs along the surface's first axis and its height along the
  second. On the ground, the first axis is the world's x axis and the second is its z axis. Each
  value is above zero and at most 100,000, the same bound as model dimensions.
- `colorSpace` is `srgb` or `linear`. A color image, such as grass or wallpaper, is `srgb`. The
  graphics card then decodes each texel to linear light before it blends texels, so a distant
  surface shows the mean color in linear light. A data image, such as a roughness map, is
  `linear`. The manifest is the authority. The loader decodes the file with no color conversion.
- A PNG file has a bit depth of 8, holds RGB or RGBA texels, and is not interlaced. It carries no
  color chunk (`gAMA`, `cHRM`, `sRGB`, `iCCP`, or `cICP`). Nobody has yet proved that a browser
  ignores a color chunk when asked to decode with no conversion, so the format keeps them out. A
  PNG also carries no animation chunk (`acTL`), because a texture has no animation.
- A WebP file can be lossy, lossless, or extended. Its size comes from its header. An extended WebP
  with an animation or a color profile is refused.
- The file is at most 8 MiB. A photographic image of 2048 pixels fits in that size as WebP.
- A texture has no `dimensions`. The validator rejects a texture that declares them, because a box
  size on an image is the sign of a wrong kind.
- A thumbnail is optional. When there is one, it is a WebP file at the usual path. The image is
  its own preview. This also keeps the pack build free of a WebP encoder, which would be a new
  dependency.
- `license`, `attribution`, `eras`, and `categories` are required, as for every asset.

### Why PNG and WebP, and not other formats

- Both decode in every browser the application supports, through the built-in `createImageBitmap`.
  The application needs no new dependency to read them.
- PNG is lossless. A small committed script can write it with no dependency, byte for byte the
  same on every machine. That is what a generated texture with an exact mean needs.
- WebP is already in the format, for thumbnails. Pack authors who make photographic textures can
  encode it with their own tools. It is much smaller than PNG for a photograph.
- JPEG adds nothing that WebP does not have, and it has no transparency.
- Formats that the graphics card decodes directly need a transcoder. The application would have
  to host and load it. A later format version can add them when a pack needs the memory savings.

### Content addressing and integrity of an image

- `contentHash` is the sha256 of the file's bytes as stored. That is the encoded PNG or WebP, not
  the decoded pixels.
- The reference stays `(scope, contentHash)` (ADR-0007).
- The bytes are shared by hash. The values of the manifest are not: `tileSize` and `colorSpace`
  belong to one pack version. A reader takes them from the exact scope of the reference first.
  Two packs that ship the same image with the same color space share one decoded texture.
- The pack command line tool checks each texture in turn:
  - The file exists at the path of its media type.
  - Its sha256 equals `contentHash`.
  - Its signature matches its media type.
  - Its header size equals `image`.
  - A PNG has the allowed bit depth and texel layout, no interlace, no color chunk, and no animation.
  - A WebP has no animation and no color profile.
  - The file is within the size bound.
- The orphan check counts files of every extension.
- At run time, a texture that does not decode leaves its surface with that surface's flat
  fallback. This record adds no check of the hash at run time. Models have none today either.

### The library hides what it cannot place

- A library item has a footprint and a height (`LibraryItem` in `storage/assets/asset-source.ts`).
  Only a model has those. The pack source therefore turns only model assets into library items.
- The furniture library shows only assets of kind `furniture`. A model of another kind does not
  reach the place-furniture tool.
- A texture is reached by its reference. The asset registry describes it (media type, image size,
  tile size, color space) for the code that draws it. It does not appear in the library.

### The grass of starter pack 1.1.0 is generated, and carries CC-BY-4.0

ADR-0229 records this license decision. It replaced the CC0-1.0 first chosen here.

This rule holds for the starter pack only. It is not a rule of section 4.3, and other packs do not
inherit it.

- The grass is a first-party asset because its generator is committed to this repository and
  reads no image, photograph, or sample from outside it. Its pixels follow from the code and a
  fixed seed alone.
- The generator stays under the project license (Apache-2.0) in `scripts/`. Only its output goes
  into the pack.
- The pack's `NOTICE` names the generator's path and the command that rebuilds the pack. The
  pack's `CHANGELOG.md` lists the texture in the version that adds it.
- The committed bytes are the asset. A test builds the image again and compares the bytes and
  the hash with the committed file.

### What the grass must keep

- Starter pack 1.1.0 is format 2. It keeps the chair of 1.0.0 with the same bytes, the same hash,
  and the same metadata. It adds one texture of kind `texture`: a tile of mown grass. (Replaced on
  2026-11-22: 1.1.0 holds a new generated chair under CC-BY-4.0 in place of the CC0-1.0 chair.
  ADR-0229 records that decision.)
- The mean of the grass in linear light is the lawn color, `GROUND_SURFACE_COLOR`. Its luminance
  is the ground bounce of the sky, 0.21174.
- Every part of the tile as large as the ground under a gate square keeps that mean. The plan sets
  the block size and the tolerance. A repeated tile shows no seam.
- `GROUND_SURFACE_HEX` stays. It is the source of the ground bounce, and the flat color the ground
  shows whenever it has no texture.

## Alternatives considered

- **Generate the grass in the engine at run time.** It needs no format change and no new asset.
  The ground would never wait for a file, so it would never show the flat color first, and the
  scene would need no new readiness signal. That is the gain, and it is the smallest change for
  #409 alone. But the image would not be an asset. It would have no content address, no license
  record, and no place in the registry. The same format question comes back with the first
  `tiled-image` finish (ADR-0130), and the ground would then use a different path from every
  other surface. Not taken.
- **A plain image file under `public/` with a test of its hash.**
  This is the fastest way to show grass. The file would bypass the registry, the pack's license
  check, and the `(scope, contentHash)` reference of hard invariant 4. When finishes need textures,
  the grass would move into a pack, which changes the ground and the scene baselines a second
  time. Not taken.
- **A bundled image, in the `bundled` scope of section 4.1.** It keeps `(scope, contentHash)` and
  needs no format change. But a bundled file has no manifest, no license record, and no version.
  The `tiled-image` finishes of ADR-0130 need images that packs from outside the application build
  can carry, so the pack format must hold images anyway. Not taken.
- **Let the kind alone decide the file type, without a media type.** Fewer fields. But a texture
  can be PNG or WebP, and the reader must know the file's path before it reads the file. Not taken.
- **Load the parts of a newer pack that a reader understands.** An older reader could still list
  the furniture of a newer pack. But a project could then find some assets of a pack and not
  others, with no sign of why, and a pack would no longer be checked as one unit. Not taken.

## Consequences

- One manifest contract serves both models and images. The pack command line tool and the
  application read the same rules from `core/assets/`, as ADR-0093 set up.
- Format 1 packs keep working. Starter pack 1.0.0 and the existing fixture packs need no change.
- The change adds no dependency. Browsers decode both image formats, and the generator writes PNG
  with its own small encoder.
- The starter pack grows by one image. The plan sets its size.
- A texture arrives after the scene is built. Any view that a baseline captures waits for its
  textures to settle before it reports ready.
- A texture held by a cache outlives the scene that draws it. The engine's `disposeObject`
  therefore frees only the textures that a scene owns, not those a cache holds.
- The pack source's listing is the library. It does not list textures. Code that uses the listing
  as the catalog of a pack's hashes (the check of missing assets on import) needs another read
  before a document can reference a texture.
- If starter pack 1.0.0 leaves `public/`, a tab that still runs an earlier build fetches it and
  gets nothing until a reload. Its library is empty and its chair shows the placeholder. No
  document changes.
- `tiled-image` finishes (#378, #379) can reference texture assets when they are built. This
  record does not build them.
- The pack validator role in `.claude/agents/pack-validator.md` describes the format 1 checks
  only. Agents cannot write that file, so the owner updates it to the rules above (#1104).

## What stays open

- Whether generated assets in other packs get a license rule of their own.
- A check of the hash at run time, for images and models alike.
- PNG color chunks and WebP color profiles, once a test shows how the decode treats them.
- Textures that the graphics card decodes directly, and the transcoder they need.
- Media types for `underlay-image`, `palette`, and `material`, and a material that groups several
  images (color, roughness, normal).
- Whether the library shows textures once finishes can use them, and with which tool.
- A read of a pack's catalog that includes textures, for the check of missing assets on import.
- Installing a pack by address, and with it the case of an older application that meets a newer
  pack.

## References

- Design specification, section 4.3 (asset pack format, amended by this record), 4.5 (asset
  kinds), 4.1 (asset sources), 4.2 (resolution and the missing-asset placeholder), and 4.8
  (license and provenance).
- `docs/specs/2026-06-16-asset-pack-format-and-cli.md`, the format 1 checks as they were built.
  This record replaces its format rules.
- `docs/plans/2026-11-19-texture-assets-in-packs.md`, the plan that builds this record.
- [[ADR-0007-content-addressed-assets]], the reference this keeps.
- [[ADR-0024-pack-manifest-validation-location]] and [[ADR-0091-pack-integrity-and-build-pipeline]],
  the validator and the integrity checks this extends.
- [[ADR-0093-in-app-asset-library]], the pack source and the library this narrows to models.
- [[ADR-0130-finishes-system-architecture]], the `tiled-image` treatment that will use texture
  assets.
- [[ADR-0131-ground-plane-grade-datum]], the ground plane that draws the grass.
- [[ADR-0192-daylight-calibrated-from-three-targets-with-a-fixed-white-point]], the ground bounce
  that the grass must keep.
- Issues #409 (the grass of the ground), #378 and #379 (the finishes that need images).
