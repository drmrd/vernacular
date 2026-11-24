# Texture assets in packs: implementation plan

- Decision record: ADR-0219 (`docs/knowledge/decisions/ADR-0219-pack-assets-carry-textures.md`).
- Specification change: sections 4.3 and 4.5 of `docs/specs/2026-06-01-vernacular-design.md`.
- Issue: #409 (the grass of the ground, `size:L`, milestone `public-beta`).
- Base: `origin/main` at `82170819`. The facts and line numbers were first read at `1c02bbc5`. The
  paths and most lines were checked again at `82170819`. Pull request 4 was read again in full at
  `2dfcfbfad`, after pull requests 1 to 3 merged (see "Pull request 4 was read again before its
  run" below).

## Goal

Packs carry texture assets. The starter pack 1.1.0 ships a generated grass tile. The ground plane
draws it in the live view and in the scene harness, and the calibrated daylight does not change.

## Facts this plan rests on

- `core/assets/pack-manifest.ts` (207 lines) already has the nine kinds of section 4.5, `texture`
  among them. `validateDimensions` (lines 114 to 133) runs for every asset. The texture rules go in
  a new file, so the manifest file stays under the 300-line limit.
- `scripts/pack/pack-integrity.mjs` fixes `.glb` (line 19) and `.webp` thumbnails (line 20), and
  every asset needs a thumbnail (lines 91 to 104). Its own reader port (called the integrity reader
  below) has `dirName`, `listDir`, `exists`, `sha256`, and `readBytes`. The application has a
  different `PackReader` in `storage/assets/pack-source.ts`. This plan names each one by its file.
- `storage/assets/fetch-pack-reader.ts` reads `assets/<hash>.glb` (line 27). `PackSource.list`
  returns nothing when the manifest is invalid, and reads `asset.dimensions` for every asset
  (`storage/assets/pack-source.ts:64`).
- `editor/library/library-filter.ts` filters by query, source, era, and style. It has no kind rule.
- `scripts/pack/generate-fixtures.mjs` writes manifests with `JSON.stringify` and without `styles`.
  The committed fixture `tests/fixtures/packs/vernacular-starter-1.0.0/manifest.json` has `styles`
  (commit `283a7fb3`) and arrays formatted on one line. Running the generator today loses both.
- `prettier --check .` covers `public/` and `tests/`. `.prettierignore` lists generated files that a
  drift test compares byte for byte (`schema/*/vernacular.schema.json`, `core/model/known-keys.json`,
  `core/format/generated/`). It lists no pack.
- `public/packs/vernacular-starter-1.0.0/` is byte for byte the starter fixture. Its chair is a
  41-byte placeholder text, and its thumbnail a 12-byte WebP header. No test validates the copy
  under `public/`.
- `app/create-asset-library-registry.ts` reads one pack, `/packs/vernacular-starter-1.0.0`, and
  registers a `user` and a `pack` source only.
- `bridge/` may import `core`, `session`, and `engine` (`eslint.config.js:25-28`). Files that touch
  `storage/` today do so through exceptions tagged with issue #717 (`eslint.config.js:405-412`).
  New bridge files use core types only.
- `engine/scene/ground-plane.ts` builds a `MeshStandardMaterial` with `GROUND_SURFACE_HEX` and
  `groundPlaneDepthBiasParameters()` (lines 98 to 105). `PlaneGeometry` gives UVs from 0 to 1.
- `refreshGroundPlane` (`bridge/react/framed-scene.ts:140-149`) frees an old plane with
  `disposeObject` (`engine/scene/furniture-model.ts:40-52`), which frees every material texture.
- The scene harness builds its scene once, in a memo, through `buildFramedScene`, `buildScene`, and
  `addGroundPlane` (`bridge/react/scene-harness-view.tsx:268-270`, `engine/scene/build-scene.ts:36`; `addGroundPlane` is reached through `bridge/react/framed-scene.ts:148`).
  The reconciler's path for an empty graph calls `buildFramedScene` too
  (`bridge/react/framed-scene-reconciler.ts:199-205`). `app/app.tsx` renders the harness with no
  asset registry provider.
- The live view has two readiness signals. The first-frame flag (`data-harness-ready` on the live
  canvas, `bridge/react/live-scene-frame-signal.tsx`) drives the "Building the scene..." overlay
  (`editor/shell/scene-pane.tsx:128`). The live-view baseline waits on `data-live-view-ready`
  (`e2e/tests/scene-live-view-visual-regression.spec.ts:33`), which is
  `sessionRestored && frameDrawnSincePipelineSettled` (`bridge/react/scene-session-provider.tsx`),
  written by `useLiveViewReadiness` (`bridge/react/use-live-view-readiness.ts`).
- What each harness capture waits on today: every harness spec waits through
  `settledHarnessCanvas` (`e2e/tests/scene-helpers.ts`), which waits for `data-harness-ready`,
  except `captureShell` of `scene-solar.spec.ts`, which waits for the canvas width and the same
  attribute inline. The live-view baseline waits for `data-live-view-ready`.
- The application renders under `<StrictMode>` (`src/main.tsx:34`). The furniture model cache is
  made in a ref and disposed in an effect cleanup (`bridge/react/use-furniture-model-cache.ts:26-44`),
  and a disposed cache ignores later requests (`bridge/react/furniture-model-cache.ts:150-152`).
  StrictMode runs that cleanup once on mount. The ground texture must not copy this pattern.
- Plain `node` resolves only explicit file specifiers. `core/environment/ground-surface.ts:1-3`
  imports without extensions, so a script run by `node` cannot import it. Tests run under the test
  runner and can.
- `GROUND_BOUNCE_COLOR` is the luminance of `#5f8a4f` in linear light: 0.2117437. ADR-0192 records
  0.21174.
- The two lawn gates sample 24 by 24 pixel squares of the 320 by 240 harness frame:
  `e2e/tests/scene-sun-to-shade.spec.ts` compares linear levels (minimum ratio 3.839, margin 2.093)
  and `e2e/tests/scene-shadow-reach.spec.ts` compares OKLab L of mean codes (minimum gap 0.027,
  margin 0.0201). `sampleCanvasColor` (`e2e/tests/scene-helpers.ts`) averages display codes.
- 31 scene baselines: 15 harness captures on two platforms (18 files in
  `scene-solar.spec.ts-snapshots`, 12 in `scene-visual-regression.spec.ts-snapshots`) and one
  live-view capture on darwin only. Thirteen harness captures compare at a threshold of 0.35 and
  a pixel ratio of 0.05. Two compare at a threshold of 0 with derived ratios: the
  ambient-occlusion capture at 0.047 and the finish-contrast capture at 0.304
  (`e2e/tests/scene-solar.spec.ts:30-83`).
- The linux scene baselines are rendered on the ubuntu runner that checks them, by the
  `Refresh scene baselines` workflow (`.github/workflows/refresh-scene-baselines.yml`, ADR-0152).
  The darwin ones are rendered on the development Mac (ADR-0149).
- A file of `bridge/`, a test included, may not import `three` (`eslint.config.js:206-209`).
  Bridge tests take the Three.js classes they need from the test-support barrel
  `engine/testing/index.ts`, which re-exports `Mesh`, `PerspectiveCamera`, and `Raycaster`.
- The lint limits are gates at commit time (`eslint.config.js:572-574`, run by lint-staged): 300
  counted lines a file, tests included; 40 lines a function, 120 in a test file; 3 parameters.
- The `storage-browser` test project runs every `*.browser.test.ts` file in a real browser.
- `three` is pinned at 0.184.0. Its WebGPU backend uploads an sRGB texture as `rgba8unorm-srgb`.
  No new dependency is needed.

## Confirmed by the owner on 2026-11-19

- Format 1 packs still load.
- A reader refuses a pack of a format it does not know, as a whole.
- The library shows no textures until finishes use them. `list()` stays the library listing.
- Texture limits: PNG or WebP, sides a power of two from 64 to 2048, file at most 8 MiB.
- The CC0-1.0 license of the generated grass is a rule for the starter pack only. (Replaced on
  2026-11-21: the grass carries CC-BY-4.0. ADR-0229 and
  `docs/specs/2026-11-21-asset-pack-distribution.md` record that license decision.)

## Confirmed by the owner on 2026-11-22

These were the plan's working assumptions. The owner confirmed each one as written on 2026-11-22.

- The grass tile: a PNG of 512 by 512 RGB texels over 2000 by 2000 mm, with deflate blocks stored
  without compression (about 787 KB). Stored blocks make the bytes the same on every machine. The
  other candidates were 256 by 256 texels over 1000 mm (the same detail, but a tile that repeats
  visibly at middle distance) and 256 by 256 over 2000 mm (softer up close). Only pull request 3
  depends on this.
- The ground shows the flat lawn first and the grass when it is ready. The "Building the scene..."
  overlay does not wait for the grass. Only the capture signals wait (pull request 4, cycles 9
  and 10).
- Starter pack 1.0.0 stays in `public/` when 1.1.0 arrives (pull request 3, cycle 7). Starter pack
  1.1.0 holds a new chair with new bytes and a new hash under CC-BY-4.0 (ADR-0229, owner decision of
  2026-11-22), so the hash of the 1.0.0 chair is not in 1.1.0. A project that names
  `pack:vernacular-starter@1.0.0` and that hash still resolves it from the 1.0.0 pack. The library
  lists only the newest starter version, so the 1.0.0 chair does not show there.
- Within the confirmed limits: no PNG color chunk, no animated WebP and no WebP color profile.
- The grass lists every period of `core/registries/periods.ts` as its eras, and the category
  `ground-cover`.

## Pull request 4 was read again before its run

The scene code on `main` changed after pull request 4 was first read at `6e200b70`. Its section
was read again against `main` at `2dfcfbfad`, after pull requests 1 to 3 merged, and rewritten.
Nothing is open before it runs. What the read changed:

- The harness has no separate readiness module. The gate in `useHarnessReadiness` takes the
  applied ground status, and `harnessReadyProps` writes `data-ground-texture` beside
  `data-harness-ready`. `scene-harness-ready-frame.test.tsx` renders the harness under jsdom, so
  the harness wiring is a cycle with a unit test.
- The live view is `bridge/react/live-scene-view.tsx`. `useLiveViewReadiness` takes the ground
  status as a parameter and keeps a second in-flight ref. There are no ground notes, and the
  first-frame flag has no ground input to keep out.
- `refreshGroundPlane` and `frameStackedScene` take one `SceneGround` object, because a function
  may have three parameters at most. The engine answers whether a plane already draws with an
  appearance, because the bridge may not import `three`.
- The reconciler returns the cached scene of an empty graph untouched today. That scene takes the
  grass in its own cycle.
- `settledHarnessCanvas` is the one harness wait. Only `captureShell` of `scene-solar.spec.ts`
  does not use it yet.
- New tests go into new files, because the existing ones are at their length limits.
- The lists of the files that wait on `data-live-view-ready` and of the live specs were short.
  They are complete now, and the waits go through one helper.

If `main` moves inside the fence of pull request 4 before a cycle runs, the agent that runs the
cycle checks the lines the cycle cites and reports a difference before it writes code.

## Rules every pull request keeps

- Types that `bridge/` sees are pure types in `core/assets/`. A bridge test uses a structural fake
  typed with core types, never `new AssetRegistry(...)`. If a new lint exception still looks
  needed, stop and ask: it is shared configuration.
- A script that plain `node` runs imports `core/` files only through explicit `.ts` paths, and
  those files import only through explicit `.ts` paths. The generator holds its target color as a
  literal, and a test pins it.
- Generated files that a test compares byte for byte are listed in `.prettierignore` with a
  comment, as the schema files are.
- Each cycle ends with its BLUE review and a `refactor:` commit, empty when nothing is found.

## Pull request 1: the format and its validator

Branch `feat/texture-assets-in-pack-format`.

**Goal.** The pack format of ADR-0219 is defined, validated by the pack command line tool, and read
by the application, with format 1 packs unchanged.

**What a user sees.** Nothing. The starter pack is still format 1. A pack author sees new checks
and errors from `pnpm pack:validate`.

**File fence.**

- Already on `main` before this pull request, from a documents pull request:
  `docs/knowledge/decisions/ADR-0219-pack-assets-carry-textures.md` (status `proposed`),
  `docs/specs/2026-06-01-vernacular-design.md` (sections 4.3 and 4.5), and this plan.
- Last commit (`docs:`): the record's `status` becomes `current`, and `updated` the landing date.
- `scripts/pack/png-encoder.mjs`, `scripts/pack/png-encoder.test.mjs` (new).
- `scripts/pack/generate-fixtures.mjs`, `scripts/pack/generate-fixtures.test.mjs` (new), the
  fixtures under `tests/fixtures/packs/`, and two new fixture packs:
  `tests/fixtures/packs/vernacular-textures-1.0.0/` and
  `tests/fixtures/packs/broken-texture-pack-1.0.0/`.
- `.prettierignore` (shared configuration): one entry, `tests/fixtures/packs/`, with a comment.
- `core/assets/pack-manifest.ts`, `core/assets/pack-manifest.test.ts`,
  `core/assets/texture-asset-rules.ts`, `core/assets/texture-asset-rules.test.ts` (new),
  `core/assets/asset-description.ts` (new, types only).
- `core/assets/image-header.ts`, `core/assets/image-header.test.ts` (new; explicit `.ts` imports
  only, since `pack-integrity.mjs` loads it under plain `node`).
- `core/index.ts` (exports only).
- `scripts/pack/pack-integrity.mjs`, `scripts/pack/pack-integrity.test.mjs`,
  `scripts/pack/vernacular-pack.mjs`, `scripts/pack/vernacular-pack.test.mjs`,
  `scripts/pack/vernacular-pack.integration.test.mjs`.
- `storage/assets/pack-source.ts`, `storage/assets/pack-source.test.ts`,
  `storage/assets/fetch-pack-reader.ts`, `storage/assets/fetch-pack-reader.test.ts`,
  `storage/assets/msw-pack-handlers.ts`, `storage/assets/msw-pack-handlers.test.ts`.
- `editor/library/library-filter.ts`, `editor/library/library-filter.test.ts`.
- Not writable by an agent: `.claude/agents/pack-validator.md`. The owner updates it, or an issue
  records it.

**Public names the test author can rely on.**

- `core/assets/asset-description.ts`: `MediaType` (`'model/gltf-binary' | 'image/png' |
'image/webp'`), `ColorSpaceName` (`'srgb' | 'linear'`), `ModelDescription` (`{ kind,
mediaType: 'model/gltf-binary', dimensions: { width, depth, height } }`), `TextureDescription`
  (`{ kind: 'texture', mediaType: 'image/png' | 'image/webp', image: { width, height }, tileSize:
{ width, height }, colorSpace }`), `AssetDescription` (the union).
- `core/assets/pack-manifest.ts`: `PACK_FORMAT_VERSIONS` (`[1, 2]`), `MEDIA_TYPE_EXTENSIONS`.
- `core/assets/texture-asset-rules.ts`: `TEXTURE_LIMITS` (`minSidePixels` 64, `maxSidePixels`
  2048, `maxFileBytes` 8,388,608), `validateTextureFields(asset, label, errors)`.
- `core/assets/image-header.ts`: `readImageHeader(bytes)` gives `{ mediaType, width, height,
bitDepth?, colorType?, interlaced?, animated?, colorProfile? }` or `undefined`;
  `pngChunkTypes(bytes)` gives the chunk types in order.
- `scripts/pack/png-encoder.mjs`: `encodePng({ width, height, pixels })`, RGB, 8 bits.
- Error labels name the field path, for example `assets[1].image.width`, `assets[1].tileSize.height`,
  `assets[1].colorSpace`, `assets[0].mediaType`, `formatVersion`.

### Cycles

1. **`scripts/pack/png-encoder.test.mjs`: "encodes 8-bit RGB pixels as a valid PNG of three chunks
   whose inflated rows are the pixels".** One contract. Setup: 64 by 64 pixels of a known pattern.
   The test reads the signature and the `IHDR` fields with a `DataView`, lists the chunks, joins the
   `IDAT` data, and inflates it with `zlib.inflateSync`. Assert width 64, height 64, bit depth 8,
   color type 2, no interlace; the chunks are `IHDR`, `IDAT`, and `IEND` in that order, each CRC
   equal to `zlib.crc32`; each row is a filter byte of 0 and the row's pixels; two calls give equal
   bytes. Fails today: no encoder. Implementation: `scripts/pack/png-encoder.mjs` (stored deflate
   blocks of at most 65,535 bytes, an Adler-32 trailer).
2. **`scripts/pack/generate-fixtures.test.mjs`: "the fixture generator reproduces the committed
   fixture packs, styles included".** The test calls the generator's pack builders with an
   in-memory sink and compares every file with the committed fixture. Fails today: the generator
   drops `styles` and writes other formatting. Implementation: `generate-fixtures.mjs` exports its
   builders, writes `styles`, and writes `JSON.stringify(manifest, null, 2)` and a newline; the
   fixtures are regenerated; `.prettierignore` gains `tests/fixtures/packs/`. The hashes of the
   asset files do not change, because only manifests are rewritten.
3. **`core/assets/pack-manifest.test.ts`: "a format 2 manifest accepts a texture asset with a PNG
   media type, an image size, a tile size, and a color space, and no dimensions".** Setup: a
   manifest with `formatVersion: 2`, the pack fields of the existing tests, one model with
   `mediaType: 'model/gltf-binary'` and dimensions, and one texture (`kind: 'texture'`,
   `mediaType: 'image/png'`, `image: { width: 256, height: 256 }`, `tileSize: { width: 1000,
height: 1000 }`, `colorSpace: 'srgb'`, license, attribution, eras, categories). Assert
   `{ valid: true, errors: [] }`. The same commit adds a guard test, which passes today: the
   existing format 1 manifest stays valid. Fails today: "assets[1].dimensions are required".
   Implementation: `pack-manifest.ts`, `texture-asset-rules.ts`.
4. **"a manifest whose format version is not 1 or 2 is refused, and the error names the newest
   format this reader knows".** Cases: 3, 0, 1.5, and `'2'`. Assert one error each that starts with
   `formatVersion` and names 2. Fails today: the field is ignored. Implementation:
   `pack-manifest.ts`.
5. **"an asset's media type must be one its kind allows in its format".** A table: a format 2 model
   with no `mediaType`; a format 2 texture with no `mediaType`; a texture with
   `model/gltf-binary`; a furniture asset with `image/png`; a format 1 asset with `image/png`.
   Assert one error each, labelled `assets[i].mediaType`, naming the allowed types or that
   `formatVersion` 2 is needed. Fails today: the field is ignored. Implementation:
   `pack-manifest.ts`.
6. **`core/assets/texture-asset-rules.test.ts`: "each texture field outside its rule gives one error
   that names the field".** A table of single faults on the texture of cycle 3: no `image`; image
   width 100, 32, and 4096; no `tileSize`; tile width 0, -1, and 100,001; no `colorSpace`;
   `colorSpace: 'display-p3'`; a `dimensions` object. Assert exactly one error each, with the label
   form above. Fails today: the module does not exist. Implementation: `texture-asset-rules.ts`.
7. **`core/assets/image-header.test.ts`: "reads the size, bit depth, texel layout, and interlace of
   a PNG from its first 33 bytes".** Setup: byte arrays built in the test. Assert `{ mediaType:
'image/png', width: 256, height: 128, bitDepth: 8, colorType: 2, interlaced: false }`; a broken
   signature gives `undefined`; 20 bytes give `undefined`. Fails today: no module.
   Implementation: `core/assets/image-header.ts`.
8. **"reads the size of a lossy, a lossless, and an extended WebP, and the animation and profile
   flags of an extended one".** Setup: headers built in the test: `VP8 ` (start code `9d 01 2a`,
   14-bit sizes at byte 26), `VP8L` (byte `0x2f`, then 14-bit width minus one and height minus one
   packed from byte 21), `VP8X` (flags at byte 20, 24-bit width minus one at byte 24, height minus
   one at byte 27). Assert each size and, for `VP8X`, `animated` and `colorProfile`. Fails today:
   no WebP branch. Implementation: `image-header.ts`.
9. **"lists the chunk types of a PNG in order".** Setup: a PNG from `encodePng` with a `gAMA`
   chunk spliced in by the test. Assert `['IHDR', 'gAMA', 'IDAT', 'IEND']`. Fails today: no
   function. Implementation: `image-header.ts`.
10. **`scripts/pack/pack-integrity.test.mjs`: "a texture is read from the file of its media type and
    its hash is checked".** Setup: the test's fake integrity reader with `assets/<hash>.png` whose
    digest matches, and the format 2 manifest. Assert no hash error; with a wrong digest, "content
    hash does not match"; a stray `assets/<other>.glb` is an orphan while the referenced `.png` is
    not. Fails today: the check looks for `.glb`. Implementation: `pack-integrity.mjs`.
11. **"a texture needs no thumbnail, and a model still does".** Setup: no `thumbnails/` entry for
    either asset. Assert one "thumbnail missing" error, for the model only. Fails today: both are
    reported. Implementation: `pack-integrity.mjs`.
12. **"a texture file that disagrees with its manifest entry is reported".** `readBytes` of the
    fake returns, in turn: a WebP header for an `image/png` asset; a PNG of 128 by 128 for a
    declared 256 by 256; bit depth 16; an interlaced PNG; color type 3; a PNG with a `gAMA` chunk;
    an animated WebP. Assert one named error each. Fails today: no header is read. Implementation:
    `pack-integrity.mjs`, importing `core/assets/image-header.ts` by its explicit path.
13. **"a texture file above 8 MiB is reported".** The integrity reader port gains `size(rel)`. The
    fake returns 8,388,609. Assert the error names the limit. Fails today: no size is read.
    Implementation: `pack-integrity.mjs`, and `createNodePackReader` in `vernacular-pack.mjs`.
14. **`scripts/pack/vernacular-pack.integration.test.mjs`: "the build report of the texture fixture
    pack lists each asset's kind and media type".** The RED commit adds the two new fixture packs
    through `generate-fixtures.mjs` (its PNG from `encodePng`) and a guard test that
    `broken-texture-pack-1.0.0` fails with the messages of cycles 6 and 12. A second guard builds a
    pack in a temporary directory at test time, with a 2048 by 2048 PNG from `encodePng` (above
    8 MiB, since the encoder stores deflate blocks), and asserts the cycle 13 size message through
    the real CLI, so no file above 8 MiB is committed. Assert exit code 0
    and the report entries for `vernacular-textures-1.0.0`. Fails today: the report has no `kind`
    or `mediaType`. Implementation: `buildReport` in `vernacular-pack.mjs`.
15. **`storage/assets/pack-source.test.ts`: "a format 2 pack lists only its models".** Setup: a fake
    application `PackReader` whose manifest holds a model and a texture. Assert `list()` gives one
    item, the model. Fails today: `toLibraryItem` reads `dimensions` of the texture and throws a
    `TypeError` (`pack-source.ts:64`). Implementation: `pack-source.ts`.
16. **"a pack reads an asset's bytes from the file of its media type".** The application
    `PackReader.readAsset` becomes `readAsset(contentHash, mediaType)`. Assert `read(textureHash)`
    calls it with `'image/png'`, a hash not in the manifest gives `undefined`, `read` before `list`
    loads the manifest once, and a failed manifest read is not remembered (the next `read` tries
    again). Fails today: `read` ignores the media type. Implementation: `pack-source.ts`.
17. **`storage/assets/fetch-pack-reader.test.ts`: "fetches an asset at the extension of its media
    type".** Assert `.png`, `.webp`, and `.glb` paths. Fails today: always `.glb`. Implementation:
    `fetch-pack-reader.ts`; `msw-pack-handlers.ts` and its test serve the new paths.
18. **`editor/library/library-filter.test.ts`: "the furniture library shows only items of kind
    furniture".** Setup: a chair of kind `furniture` and a model of kind `material`, default
    filters. Assert only the chair is visible, and the labels of active filters name no kind
    filter. Fails today: both are shown. Implementation: `library-filter.ts`.

**Screenshot baselines.** None move.

**Daylight checks.** None.

**What it leaves.** No texture in any shipped pack. No loader. The validator role file.

## Pull request 2: the image loader and the texture cache

Branch `feat/image-texture-loader`. After pull request 1.

**Goal.** The engine turns image bytes into a repeating texture, and the bridge keeps decoded
textures in a cache that outlives every scene rebuild and survives StrictMode.

**What a user sees.** Nothing.

**File fence.**

- `engine/loaders/image-texture-loader.ts`, `engine/loaders/image-texture-loader.test.ts`,
  `engine/loaders/image-texture-loader.browser.test.ts` (new).
- `engine/scene/furniture-model.ts`, `engine/scene/furniture-model.test.ts`.
- `engine/index.ts` (exports only).
- `engine/testing/index.ts` (test support: two re-exports for the bridge tests, `Texture` from
  `three` and `isCacheHeld` from `engine/scene/dispose-object.ts`).
- `core/assets/asset-description.ts` (the description types and `TextureMediaType`),
  `core/assets/texture-asset-rules.ts` (the `ColorSpaceName` guard), `core/index.ts` (type exports
  only).
- `storage/assets/asset-source.ts`, `storage/assets/pack-source.ts`,
  `storage/assets/pack-source.test.ts`, `storage/assets/asset-registry.ts`,
  `storage/assets/asset-registry.test.ts`, `storage/assets/texture-pack-test-support.ts` (new).
- `bridge/react/texture-cache.ts`, `bridge/react/texture-cache.test.ts`,
  `bridge/react/use-ground-texture.ts`, `bridge/react/use-ground-texture.test.tsx`,
  `bridge/react/use-ground-texture-activity.test.tsx`,
  `bridge/react/use-ground-texture-test-support.ts` (new). These import `core` and `engine` only.

**Public names.** `decodeImageTexture(bytes, { mediaType, colorSpace }, decode?)` and
`ImageTextureDecodeError` (`engine/loaders/image-texture-loader.ts`); `markCacheHeld(texture)`
(`engine/scene/dispose-object.ts`); `describe(contentHash)` on `AssetSource` (optional) and
`describe(reference)` on `AssetRegistry`, both returning core `AssetDescription | undefined`;
`TextureSource` (`{ resolve(reference), describe(reference) }`, core-typed, in
`bridge/react/texture-cache.ts`); `createTextureCache({ source, decode, dispose })` with
`request(reference)`, `get(reference)` giving a `TextureState`, and `dispose()`;
`useGroundTexture(reference, source)` giving a `TextureState`, which is `{ status: 'loading' }`
from its first render until the cache settles.

Types: `TextureAppearance` (`{ texture: THREE.Texture; tileSize: { width: number; height: number }
}`, in millimeters; the width runs along the surface's first axis, which on the ground is world x)
in `engine/loaders/image-texture-loader.ts`, exported from `engine/index.ts`; `TextureStatus`
(`'loading' | 'ready' | 'failed'`) and `TextureState` (`{ status: TextureStatus; appearance?:
TextureAppearance }`) in `bridge/react/texture-cache.ts`. Pull request 4 uses all three.

### Cycles

1. **`engine/loaders/image-texture-loader.test.ts`: "decodes image bytes into a repeating,
   mipmapped texture in the declared color space".** Setup: a decoder spy that resolves to a fake
   bitmap `{ width: 64, height: 64, close }`. Assert: one `Blob` of type `image/png` with the byte
   length, options `{ colorSpaceConversion: 'none', premultiplyAlpha: 'none' }`; the texture's
   image is the bitmap; `wrapS` and `wrapT` are `THREE.RepeatWrapping`; `colorSpace` is
   `THREE.SRGBColorSpace` for `'srgb'` and `THREE.NoColorSpace` for `'linear'`; `generateMipmaps`
   is true; `minFilter` is `THREE.LinearMipmapLinearFilter`; `flipY` is false; the version is above 0. The same RED commit adds `image-texture-loader.browser.test.ts`: with no decoder given, the
   committed 64 by 64 PNG of `tests/fixtures/packs/vernacular-textures-1.0.0/` decodes to a 64 by
   64 image in a real browser. Fails today: no module. Implementation:
   `engine/loaders/image-texture-loader.ts`, with `createImageBitmap` as the default decoder.
2. **"a decode failure rejects with ImageTextureDecodeError and keeps the cause".** Fails today: no
   such error class. Implementation: `image-texture-loader.ts`.
3. **`engine/scene/dispose-object.test.ts`: "disposeObject frees the textures an object owns and
   leaves the textures a cache holds".** Setup: a mesh whose material has `map` (owned) and
   `emissiveMap` (marked with `markCacheHeld`), each with a `dispose` spy. Assert only the owned one
   is freed. Already satisfied by ADR-0226: `markCacheHeld` and the held-skip in `disposeObject`
   exist in `engine/scene/dispose-object.ts`, with tests in `dispose-object.test.ts`. No RED
   commit is needed for this item.
4. **`storage/assets/pack-source.test.ts`: "describes an asset of its manifest".** Assert
   `describe(textureHash)` gives a `TextureDescription` with every field listed above,
   `describe(modelHash)` a `ModelDescription`, and an unknown hash `undefined`. Fails today: no
   `describe`. Implementation: `pack-source.ts`, `asset-source.ts`.
5. **`storage/assets/asset-registry.test.ts`: "describes a reference from its exact scope first,
   then from the first source in precedence order that knows its hash".** Setup: two pack sources
   with ids `pack:a@1.0.0` and `pack:b@1.0.0` that describe the same hash with tile sizes 1000 and
   2000, and a user source with no `describe`. Assert a reference with scope `pack:b@1.0.0` gets
   2000, and one with scope `pack:c@1.0.0` gets the first in order. Fails today: no `describe`.
   Implementation: `asset-registry.ts`.
6. **`bridge/react/texture-cache.test.ts`: "a requested texture loads once and settles ready with
   the tile size of its own reference".** Setup: a fake `TextureSource` and a decoder that returns
   a `Texture` from `engine/testing` (a bridge test may not import `three`; the RED commit adds
   that one re-export to `engine/testing/index.ts`). Request one reference twice. Assert one
   `resolve`, one decode, and `get(reference)` ready with the description's tile size, the texture
   marked held. Fails today: no module. Implementation: `texture-cache.ts`.
7. **"two references to one image with one color space share one decoded texture and keep their
   own tile sizes".** Setup: two scopes, same hash, `srgb` both, tile sizes 1000 and 2000. Assert
   one decode, the same texture object, and two tile sizes. Fails today if the cache keys by hash
   alone and stores the tile size with the texture. Implementation: the decoded texture is keyed
   by `(contentHash, colorSpace)`; the appearance pairs it with the reference's own tile size.
8. **"the same image with another color space is decoded again".** Assert two decodes and two
   textures, one per color space. Fails today: the key of cycle 7 must include the color space.
9. **"a texture with no description, of another kind, or that does not decode settles as
   failed".** One contract, three cases. Assert `failed`, and no `dispose` call. Implementation:
   `texture-cache.ts`.
10. **"the cache frees each texture once, when the cache is disposed, and never before".** Assert no
    `dispose` after many `request` and `get` calls, and one per texture after `dispose()`; a load
    that settles after `dispose()` is freed at once. Implementation: `texture-cache.ts`.
11. **`bridge/react/use-ground-texture.test.tsx`: "under StrictMode the ground texture still becomes
    ready, and no appearance handed out is freed while the view is mounted".** Setup:
    `render(<Probe />, { reactStrictMode: true })`, as in
    `bridge/react/scene-renderer-canvas-strict-mode.test.tsx:78`; the probe calls
    `useGroundTexture(reference, fakeSource)` and records each state it receives. Assert the first
    recorded status is `loading`, the status reaches `ready`, and no recorded appearance's texture
    had `dispose` called while mounted.
    Fails today: no hook. A hook that copies the furniture pattern (a cache in a ref, disposed in a
    cleanup) fails it. Implementation: `use-ground-texture.ts` creates and disposes the cache inside
    one effect and hands the state out through React state, which starts at `{ status: 'loading'
}`, so a re-run builds a new cache.
12. **"the ground texture is freed when the view unmounts".** Assert one `dispose` after unmount.
    Implementation: `use-ground-texture.ts`.

**Screenshot baselines.** None move.

**Daylight checks.** Cycle 1 pins the sRGB color space, which makes the graphics card average the
grass in linear light.

**What it leaves.** Nothing draws a texture yet. The furniture model cache very likely has the
StrictMode fault of cycle 11 (inferred from the code, not run). It needs an issue of its own in the
`1.0` milestone, filed with the owner's word.

## Pull request 3: starter pack 1.1.0 with the grass

Branch `feat/starter-pack-grass-texture`. After pull request 1. It can run beside pull request 2.

**Goal.** A committed generator writes starter pack 1.1.0 with a grass tile whose mean is the lawn
color, and the application reads 1.1.0.

**What a user sees.** The library lists the new 1.1.0 chair in place of the old one. A project that
places the old 1.0.0 chair keeps the chair's name on its scene label and gets no missing-asset
report on export or open. The ground is still flat.

**File fence.**

- `scripts/pack/starter/srgb-table.mjs`, `scripts/pack/starter/grass-tile.mjs`,
  `scripts/pack/starter/build-starter-pack.mjs`, and a test file beside each (new). They use
  `scripts/pack/png-encoder.mjs` from pull request 1.
- `package.json` (one script, `pack:starter`).
- `.prettierignore` (shared configuration): one entry, `public/packs/`, with a comment.
- `public/packs/vernacular-starter-1.1.0/` (generated and committed).
  `public/packs/vernacular-starter-1.0.0/` stays unchanged, so the hash of the old chair still
  resolves (owner decision of 2026-11-22).
- `core/environment/ground-surface.ts` (`GROUND_GRASS_REFERENCE`), `core/index.ts` (export).
- `app/create-asset-library-registry.ts`, `app/create-asset-library-registry.test.ts` (new).
- `storage/assets/asset-registry.ts`, `storage/assets/asset-registry-catalog.test.ts` (new).
- `app/pack-supplies.ts`, `app/card-export.ts`, `app/use-project-actions.ts`,
  `app/use-card-actions.ts`, and the app tests and test-support files that build a pack catalog.
- `bridge/react/use-catalog-names.ts` and its test.
- `editor/library/library-launcher.stories.tsx`, `editor/library/library-panel.stories.tsx` (the
  pack address).

**Determinism.** The generator uses integer arithmetic only. It decodes sRGB codes through a
committed table of 256 linear values, scaled to integers. No `Math` function that ECMAScript lets an
engine approximate (`pow`, `exp`, `sin`, `log`) runs on the path that decides a byte. The target
color is the literal `#5f8a4f`. The encoder writes only `IHDR`, `IDAT`, and `IEND`. The byte
rebuild test of cycle 5 is the tripwire.

### Cycles

1. **`scripts/pack/starter/srgb-table.test.mjs`: "the generator's table of linear values agrees with
   the color module, and its target is the lawn hex".** Assert each of the 256 entries over its
   scale is within 1/65,535 of `srgbToLinear(code / 255)` from `core/color/oklab.ts`, and the
   generator's target literal equals `GROUND_SURFACE_HEX`. Fails today: no table. Implementation:
   `srgb-table.mjs` (the table written out as integers).
2. **`scripts/pack/starter/grass-tile.test.mjs`: "the grass tile's mean in linear light is the lawn
   color, and its luminance is the sky's ground bounce".** Setup: `generateGrassTile()` gives
   512 by 512 RGB codes. Decode each code with `srgbToLinear` and average. Assert each channel is
   within 0.002 of `GROUND_SURFACE_COLOR`, `linearLuminance` of the mean is within 0.0005 of
   `GROUND_BOUNCE_COLOR.r`, and `GROUND_BOUNCE_COLOR.r` is within 0.00001 of 0.21174. The same RED
   commit holds a guard: two runs are equal, and a run succeeds while `Math.random`, `Math.pow`,
   and `Date.now` are stubbed to throw. Fails today: no generator. Implementation:
   `grass-tile.mjs`.
3. **"the grass tile is not flat, and its spread stays small".** Assert the standard deviation of
   texel luminance, in linear light, is between 5 and 20 percent of the mean. Fails today: the
   minimal answer to cycle 2 is a flat tile of `#5f8a4f`, which fails the lower bound.
   Implementation: `grass-tile.mjs`.
4. **"every 32 by 32 block of the grass tile has the tile's mean luminance within one percent".**
   Fails today: a plain noise tile has uneven blocks. The same RED commit holds a guard for the
   seam: the mean luminance step across each wrap edge (last column to first, last row to first)
   is at most 1.1 times the mean step between neighbors inside. Implementation: `grass-tile.mjs`.
5. **`scripts/pack/starter/build-starter-pack.test.mjs`: "the build writes a valid starter pack
   1.1.0 that replaces the chair and adds the grass, and the committed tree is its output".** Setup:
   `buildStarterPack()` gives a map of file path to bytes, with no disk write. Assert every entry
   equals the committed file under `public/packs/vernacular-starter-1.1.0/` and no committed file is
   missing from the map; `runPackCli(['validate', dir], …)` with the real readers returns 0;
   `formatVersion` is 2; the chair's name, styles, eras, categories, and dimensions equal those of
   1.0.0, its bytes and `contentHash` differ from 1.0.0's, its `license` is `CC-BY-4.0`, and its
   `attribution` is `The Vernacular Contributors`; the pack-level `license` is `CC-BY-4.0`; the grass `contentHash` is the sha256 of the committed PNG; `NOTICE`
   names `scripts/pack/starter/build-starter-pack.mjs` and `pnpm pack:starter`. Fails today: no
   build and no directory. Implementation: `build-starter-pack.mjs` (it owns the chair's bytes and
   metadata as constants, so no fixture script feeds the shipped pack), then `pnpm pack:starter`;
   the generated tree and the `.prettierignore` entry are committed in the GREEN commit.
6. **"the ground grass reference names the grass texture of the committed starter pack".** Assert
   `GROUND_GRASS_REFERENCE.scope` is `pack:vernacular-starter@1.1.0` and its hash names an asset of
   kind `texture` in the committed manifest, with the tile size the plan chose. Fails today: no
   constant. Implementation: `core/environment/ground-surface.ts`.
7. **`app/create-asset-library-registry.test.ts`: "the application's library reads starter pack
   1.1.0".** `createStarterPackSources(fetch): ScopedAssetSource[]` is a new export. It returns two
   sources: the 1.1.0 `PackSource`, which is listed, and the 1.0.0 `PackSource` with
   `listed: false`. One source has one scope id, and the registry reports the id of the source that
   held the bytes as the resolved scope. So one source cannot list only 1.1.0 and also resolve a
   1.0.0 reference under the 1.0.0 scope. Tests build
   `new AssetRegistry(createStarterPackSources(fetch))`.
   Setup: a fetch spy serving the committed manifest. Assert `list()` fetched
   `/packs/vernacular-starter-1.1.0/manifest.json` and listed the 1.1.0 chair only, not the chair of
   1.0.0. A second test, "a reference to the chair of starter pack 1.0.0 still resolves": a
   reference with scope `pack:vernacular-starter@1.0.0` and hash
   `8a8a0cafbecb2446278c8b61e275c1ac78373a7ccd59ddd5ac7684bf1388341e` resolves to the bytes under
   `/packs/vernacular-starter-1.0.0/`. Fails today: no such export, and the address is 1.0.0.
   Implementation: `app/create-asset-library-registry.ts`; the stories follow;
   `public/packs/vernacular-starter-1.0.0/` stays.

Cycles 8 to 11 come from the owner's ruling of 2026-11-23. `loadPackSupplies` (the export and open
missing-asset check) and `useCatalogNames` (scene furniture labels) used `registry.list()` as the
full catalog. With the 1.0.0 chair unlisted, a project that placed it got a false "asset missing"
report and a generic label. The registry needs a read that includes unlisted sources.

8. **`storage/assets/asset-registry-catalog.test.ts`: "the catalog includes unlisted sources that
   the list skips".** `ScopedAssetSource.listed?: boolean` is new; absent means listed. Assert
   `list()` skips an unlisted source, and the new `catalog()` lists every source in scope
   precedence order. A second test pins that an unlisted source still resolves and describes from
   its own scope. Fails today: no `listed` field and no `catalog()`. Implementation:
   `storage/assets/asset-registry.ts`.
9. **`app/create-asset-library-registry.test.ts`: "the catalog holds the 1.0.0 chair and the
   registry describes it".** Assert the catalog holds the 1.0.0 chair, and `registry.describe` of it
   is the 500 by 520 by 800 model. Fails today: the 1.0.0 source is not in the catalog.
   Implementation: `app/create-asset-library-registry.ts` (1.0.0 is a plain `PackSource` marked
   `listed: false`).
10. **`app/pack-supplies.test.ts` and the app action test supports: "the 1.0.0 chair counts as
    supplied".** `loadPackSupplies` takes a `PackCatalog` (`catalog()`) instead of the lister. Assert
    that, with the real starter pack sources, a reference to the 1.0.0 chair counts as supplied.
    Fails today: `loadPackSupplies` reads `list()`, which skips the 1.0.0 chair. Implementation:
    `app/pack-supplies.ts`, with `app/card-export.ts` and `app/use-project-actions.ts` passing the
    catalog. The delete check in `app/use-card-actions.ts` keeps `list()`.
11. **`bridge/react/use-catalog-names.test.tsx`: "an item of an unlisted source keeps its name".**
    Assert that `useCatalogNames` names a furniture item whose source is unlisted. Fails today: the
    hook reads `list()`, so the item gets a generic label. Implementation:
    `bridge/react/use-catalog-names.ts` reads `catalog()`.

**The build of starter pack 1.1.0.** `pnpm pack:starter` runs `build-starter-pack.mjs`. It writes
the chair and its thumbnail from its own constants, generates the grass, writes the PNG, hashes
every asset, and writes `manifest.json` (`JSON.stringify` with two spaces and a newline, keys in a
fixed order), `LICENSE` (the full text of `CC-BY-4.0`, the license of both assets), `NOTICE` (the
attribution, the generator's path, and the command), and `CHANGELOG.md` (1.0.0, then 1.1.0: "Replace the placeholder chair with a new placeholder chair under CC-BY-4.0. Add a generated mown-grass texture."). The hash in
the manifest comes from the bytes the build writes.

**Screenshot baselines.** None move.

**Daylight checks.** Cycles 1 to 4.

**What it leaves.** The ground does not use the grass yet. The chair is still a placeholder.

## Pull request 4: the grass on the ground

Branch `feat/grass-on-the-ground`. After pull requests 2 and 3. It closes #409.

This section was read again against `main` at `2dfcfbfad`, after pull requests 1 to 3 merged, and
rewritten where the scene code had moved. Every file name, signature, line number, and line count
in it is from that commit. Line counts are the lint's counts (blank lines and comments left out).

**Goal.** The ground plane in the live view and in the scene harness draws the starter pack
grass, and every capture waits for it.

**What a user sees.** In the 3D view, the lawn shows mown grass in place of one flat green. When
the view opens, the flat green shows first and the grass replaces it once it is ready. The two have
the same mean color, so the light of the scene does not change. If the texture fails, the lawn
stays flat green.

**File fence.**

- The engine: `engine/scene/ground-plane.ts`, `engine/scene/ground-plane-appearance.test.ts` (new;
  `engine/scene/ground-plane.test.ts` is at 298 of the 300 lines the lint allows, so it is not
  touched), `engine/scene/build-scene.ts`, `engine/scene/build-scene.test.ts` (246 lines),
  `engine/index.ts` (exports only).
- The framed scene: `bridge/react/framed-scene.ts`, `bridge/react/framed-scene-reconciler.ts`,
  `bridge/react/use-framed-scene.ts`, and three new test files:
  `bridge/react/framed-scene-ground.test.ts`, `bridge/react/framed-scene-reconciler-ground.test.ts`,
  and `bridge/react/use-framed-scene-ground.test.tsx`. The existing test files do not grow:
  `bridge/react/framed-scene.test.ts` is at 274 of 300 lines, and
  `bridge/react/framed-scene-reconciler.test.ts` runs with the file length rule turned off.
  `bridge/react/use-framed-scene.test.tsx` and `bridge/react/use-framed-scene-dispose.test.tsx` are
  in the fence for one module mock each (cycle 7).
- The harness: `bridge/react/harness-ground.ts`, `bridge/react/harness-ground.test.tsx` (new),
  `bridge/react/scene-harness-view.tsx`, `bridge/react/scene-harness-ready-frame.ts`, and
  `bridge/react/scene-harness-ready-frame.test.tsx`. `HarnessStage` in the view is at 39 of the 40
  lines of a function. Each change to it below edits a line it already has, and adds none.
- The live view: `bridge/react/use-live-view-readiness.ts`,
  `bridge/react/use-live-view-readiness.test.tsx`, and `bridge/react/live-scene-view.tsx` (wiring
  only: one field of `LiveSceneCanvasProps`, one argument, one JSX prop). The file is at 202 of
  300 lines and `LiveSceneView` at 38 of its 40. The view already keeps the state of
  `useFramedScene()` as one object (`framedScene`) and reads `framedScene.onSceneAttached` from
  it, so the new prop reads `framedScene.groundTexture` the same way.
- The application: `app/app.tsx` (the harness branch only),
  `app/create-asset-library-registry.ts`, `app/create-asset-library-registry.test.ts`.
- The harness captures: `e2e/tests/scene-helpers.ts`, `e2e/tests/scene-solar.spec.ts`,
  `e2e/tests/scene-grass-texture.spec.ts` (new), `e2e/tests/scene-sun-to-shade.spec.ts`,
  `e2e/tests/scene-shadow-reach.spec.ts`, and the baselines that fail, of these specs and of
  `e2e/tests/scene-visual-regression.spec.ts`.
- The live specs: `e2e/tests/live-pane.ts` (the shared wait), `e2e/tests/scene-live-view-grass.spec.ts`
  (new), and, for the shared wait and a named time limit only (see "The time the live specs take"
  below), the files that wait on the marker and the live specs of the `scene-webgl` project. Both
  lists are in that part.
- Not in the fence: `.github/workflows/ci.yml`. It is shared configuration. If a step of its macOS
  `live-view-visual` job needs a longer limit, stop and ask the owner.

**Public names.**

- From pull request 2: `TextureAppearance` (`{ texture, tileSize: { width, height } }`, from
  `engine/index.ts`), `markCacheHeld` (from `engine/index.ts`), `Texture` and `Mesh` (from
  `engine/testing`, for bridge tests, which may not import `three`), and
  `useGroundTexture(reference: AssetReference, source: TextureSource): TextureState`
  (`bridge/react/use-ground-texture.ts`). `TextureStatus` (`'loading' | 'ready' | 'failed'`) and
  `TextureState` (`{ status; appearance? }`) are imported from `bridge/react/texture-cache.ts`.
  `bridge/index.ts` does not export them. From pull request 3: `GROUND_GRASS_REFERENCE`
  (`core/index.ts`).
- `engine/scene/ground-plane.ts`:
  - `addGroundPlane(root: THREE.Object3D, gradeElevation?: number, appearance?: TextureAppearance): void`.
  - `groundPlaneDrawsWith(plane: THREE.Object3D, appearance: TextureAppearance | undefined): boolean`,
    exported from `engine/index.ts`. The bridge may not import `three`, so it cannot read a
    material's map. This function answers for it.
- `engine/scene/build-scene.ts`: `BuildSceneOptions`, exported from `engine/index.ts`, is
  `EdgeOverlayOptions & { groundAppearance?: TextureAppearance | undefined }`.
  `buildScene(graph, materials?, options?: BuildSceneOptions)`. The `| undefined` is needed under
  `exactOptionalPropertyTypes`, because the reconciler passes an appearance that may be absent.
- `bridge/react/framed-scene.ts`:
  - `SceneGround`: `{ gradeElevation: number | undefined; appearance?: TextureAppearance | undefined }`.
    One object for the ground of a scene keeps `frameStackedScene` at three parameters, the most
    the lint allows.
  - `refreshGroundPlane(root: SceneRoot, ground: SceneGround): void`.
  - `frameStackedScene(floors: FloorAssembly[], ground: SceneGround, framedFloorId?: string | null): FramedScene`.
  - `buildFramedScene(graph, paint?, view?: BuildSceneOptions)`.
- `bridge/react/framed-scene-reconciler.ts`: `FramedSceneReconciler` gains
  `setGroundAppearance(appearance: TextureAppearance | undefined): void`.
  `reconcile(graph, paint?, models?)`, `releaseRetired`, `dispose`, and
  `createFramedSceneReconciler(view?)` keep their signatures, so no existing call changes.
- `bridge/react/use-framed-scene.ts`: `FramedSceneState` gains `groundTexture: TextureStatus`.
- `bridge/react/harness-ground.ts`:
  `useHarnessGround(root: SceneRoot, gradeElevation: number | undefined, texture: TextureState): TextureStatus`.
- `bridge/react/scene-harness-ready-frame.ts`:
  `harnessReadyProps(frame: HarnessReadyFrame | null, groundTexture: TextureStatus): Record<string, string>`.
  It returns today's three attributes and a fourth, `data-ground-texture`, with the values
  `loading`, `ready`, and `failed`. The harness wrapper (`data-testid="scene-harness"`) spreads it.
- `bridge/react/use-live-view-readiness.ts`:
  `useLiveViewReadiness(groundTexture: TextureStatus): LiveViewReadinessNotes`. The parameter is
  required. `LiveViewReadinessNotes` keeps its four notes and gains none.
- `app/create-asset-library-registry.ts`:
  `createHarnessAssetRegistry(fetchFn: typeof fetch): AssetRegistry`.
- `e2e/tests/scene-helpers.ts`: `settledHarnessCanvas(page, query, subject?)` keeps its signature
  and is the one wait of every harness spec. `e2e/tests/live-pane.ts`:
  `waitForLiveViewReady(page: Page): Promise<void>`.

**The readiness rules.** Both roles work from these rules. The cycles below name the rules they
build.

The harness:

1. `useGroundTexture` reports `loading` from its first render until its cache settles, then
   `ready` with an appearance or `failed` without one.
2. `useHarnessGround` returns the status it has applied to the drawn root, not the cache's
   status.
3. It applies the ground in a layout effect: it calls
   `refreshGroundPlane(root, { gradeElevation, appearance: texture.appearance })`, then stores the
   root and the texture status in state. With no appearance (`loading` or `failed`) that call keeps
   the flat plane.
4. It returns the stored status only when the stored root is the current root and the stored
   status is the texture's current status. Otherwise it returns `loading`. So the status can turn
   `ready` only in a commit after the plane was swapped, and a new root reports `loading` until
   the effect has run on it.
5. The gate that requests the ready frame (`harnessReady` in `useHarnessReadiness`) is true when
   the lighting is ready, the ambient occlusion pass has settled if it is active, and the applied
   status is `ready` or `failed`.
6. `StaticFrame` (`scene-harness-view.tsx:68-104`, under `frameloop="never"`) asks for a draw in
   the renderer's next animation-loop callback each time the gate changes. A frame requested with
   the gate true reports itself as the ready frame. By rules 3 and 4 the plane was swapped in a
   layout effect before the gate could turn true, so the ready frame holds the grass.
7. `data-harness-ready` stays what it is today: `true` once the ready frame has been drawn
   (`drawnReadyFrame`), in the commit after that frame. `data-ground-texture` reports the applied
   status. Both come from `harnessReadyProps`.
8. `HarnessStage` is keyed by `harnessStateKey(props)`, so each harness state mounts a new stage
   and every flag starts again. The texture cache lives in the stage too, so each state loads the
   grass again.
9. A texture that fails settles as `failed`: the gate opens over the flat lawn, and
   `data-ground-texture` reads `failed`. The harness specs wait for `ready`, so they fail with a
   clear cause and cannot capture a flat lawn.

The live view:

1. The fact `frameDrawnSincePipelineSettled` lives in the scene session, which outlives a mount of
   the live view, so it can still read true from an earlier open (issue #829; see the comment
   above `LIVE_SCENE_CANVAS_TEST_ID` in `e2e/tests/live-pane-frames.ts`). The texture cache lives
   as long as one mount of `LiveSceneView`, so each mount loads the grass again.
2. `useLiveViewReadiness(groundTexture)` keeps two in-flight refs: one for a pipeline build, one
   for the ground texture.
3. A layout effect keyed on the status keeps the ground ref. On `loading` it sets the ref and
   writes the fact false, even when the fact is already true, as `notePipelineBuildStarted` does
   (`use-live-view-readiness.ts:41-44`). On `ready` or `failed` it clears the ref and writes
   nothing. The next frame that counts sets the fact.
4. `noteFrameDrawn` sets the fact true only when neither ref is set. `notePipelineSettled` clears
   the pipeline ref only.
5. `LiveSceneCanvas` calls the hook, and it mounts in the same commit as `LiveSceneView`, which
   owns the texture cache through `useFramedScene`. So the first status a mount sees is always
   `loading`, and rule 3 clears a stale fact in the mount's first commit, before the browser
   paints and before the new canvas draws a frame.
6. `useFramedScene` hands the appearance to the reconciler inside its reconcile memo, so the scene
   of the render in which the status turns `ready` already holds the grass. The layout effect of
   that commit clears the ground ref. Every frame that counts is therefore drawn after the grass
   is on the plane.
7. Every cache hit of the reconciler refreshes the ground in place, for a stacked scene and for
   the empty-graph scene. The `FramedScene` object stays the same when the grass arrives, so the
   scene revision does not change, the root is not attached again, and the camera is not framed
   again.
8. `data-live-view-ready` stays `sessionRestored && frameDrawnSincePipelineSettled`. The live
   canvas's own `data-harness-ready` comes from `SceneReadinessBoundary` and
   `sceneReadinessProps(drawnRevision !== null)`, with the drawn revision from `useDrawnRevision`
   and `LiveSceneFrameSignal`. None of them takes a ground input, so the "Building the scene..."
   overlay does not wait for the grass.
9. A texture that fails settles as `failed`, and the marker rises over the flat lawn.

**For both roles.** A bridge test takes `Mesh` and `Texture` from `engine/testing` and
`isGroundPlane`, `markCacheHeld`, and `groundPlaneDrawsWith` from `engine/index.ts`. It never
imports `three`, and it never builds an `AssetRegistry`. A test that mocks `./use-ground-texture`
returns the same state object on every call until the test changes it, because `useHarnessGround`
and the reconcile memo key on it. Vitest does not type-check, so each cycle below names both the
failure of the test run and the error of `pnpm typecheck`.

### Before the cycles: one wait for every harness capture

The first commit of the branch is a `test(e2e)` commit, before the RED of cycle 1. Today every
harness spec waits through `settledHarnessCanvas` (`e2e/tests/scene-helpers.ts`), which waits for
`data-harness-ready`, except `captureShell` in `e2e/tests/scene-solar.spec.ts` (lines 95 to 120).
That one calls `openHarnessScene`, polls the canvas width, and waits for the attribute itself. The
commit makes it call `settledHarnessCanvas(page, capture.query, 'scene harness')` and removes the
width poll and the inline wait. The attribute turns true only after the ready frame was drawn, so
the width poll adds nothing.

The commit runs on the flat lawn, on the development Mac and in the linux `scene-visual` job of
CI. No baseline is expected to move. If one moves, stop and report it before cycle 1. Each later
baseline diff then has one cause, the grass. The ground wait is added to `settledHarnessCanvas`
after cycle 11.

### Cycles

1. **`engine/scene/ground-plane-appearance.test.ts` (new): "a ground plane given an appearance
   draws the texture on white, one copy per tile, with copies fixed to the world origin".** Setup:
   a root holding a 4000 by 3000 mm box that spans world x 0 to 4000 and z −3000 to 0, so the
   plane's center is off the origin; a `THREE.Texture`; a tile size of 2000 by 1000 (width along
   world x, height along world z), so a swap of width and height shows. Call
   `addGroundPlane(root, 0, { texture, tileSize })`. Assert: `material.map` is the texture;
   `material.color` is white; after `mesh.updateMatrixWorld()`, each vertex's UV equals (world x /
   `tileSize.width`, −world z / `tileSize.height`), so a texel keeps its world place when the plane
   grows; the texture's own `repeat` and `offset` stay at their defaults; the depth bias fields
   equal `groundPlaneDepthBiasParameters()`; roughness and metalness equal those of the flat
   material. A guard test in the same commit keeps the flat plane (`GROUND_SURFACE_HEX`, no map)
   when no appearance is given. Fails today: `material.map` is `null`, and `pnpm typecheck`
   reports TS2554 ("Expected 1-2 arguments, but got 3"). Implementation: `ground-plane.ts`.
   `groundMesh` takes the appearance as a third parameter. With one, the material is white and
   carries the map, and each vertex's UV is written from its world position as above. The mesh
   lies with its local y along world −z (`mesh.rotation.x = -Math.PI / 2`, `ground-plane.ts:110`),
   so v is (local y minus the center's world z) over the tile height.
2. **`engine/scene/ground-plane-appearance.test.ts`: "a ground plane tells whether it already draws
   with an appearance".** Setup: one root with a flat plane (`addGroundPlane(root)`), one with a
   plane from `addGroundPlane(root, 0, { texture, tileSize })` at a tile size of 2000 by 1000; each
   plane found with `isGroundPlane`. Assert with `groundPlaneDrawsWith(plane, appearance)`: the flat
   plane gives true for `undefined` and false for an appearance; the textured plane gives true for
   the same texture with an equal tile size in a new object (the size is compared by value), false
   for another texture, false for a tile size of 1000 by 1000, and false for `undefined`; an object
   that is not a ground plane gives false. Fails today:
   `TypeError: groundPlaneDrawsWith is not a function`, and typecheck reports TS2305 (no exported
   member `groundPlaneDrawsWith`). Implementation: `ground-plane.ts`: `addGroundPlane` records the
   appearance it drew with on the mesh, and the new function compares against the record;
   `engine/index.ts` exports the function.
3. **`engine/scene/build-scene.test.ts`: "buildScene draws the ground with the appearance in its
   options".** In a new `describe` block: the file's first block carries a function length exception
   (an inline `eslint-disable-next-line`), so nothing goes into it. Setup: a one-floor graph and
   `buildScene(graph, undefined, { groundAppearance: { texture, tileSize } })`. Assert the ground
   plane's `material.map` is the texture. Fails today: the map is `null`, and typecheck reports
   TS2353 ("Object literal may only specify known properties, and 'groundAppearance' does not exist
   in type 'EdgeOverlayOptions'"). Implementation: `build-scene.ts` (`BuildSceneOptions`, and
   `addGroundPlane(root, graph.gradeElevation, options.groundAppearance)`); `engine/index.ts`
   exports the type.
4. **`bridge/react/framed-scene-ground.test.ts` (new): "refreshGroundPlane swaps a flat plane for a
   textured one, keeps a plane that already draws with the same ground, and never frees a held
   texture".** Setup: a root with a flat plane, from `buildFramedScene`; a `Texture` from
   `engine/testing`, marked with `markCacheHeld`, with a `dispose` spy; a tile size of 2000 by 2000.
   Each call passes an object literal as the ground. Assert: after
   `refreshGroundPlane(root, { gradeElevation: 0, appearance })` the root has one plane, and
   `groundPlaneDrawsWith(plane, appearance)` is true; a second call with the same ground keeps the
   same plane object; a call at a grade of 300 gives a new plane, seated at 300, that draws with the
   appearance; a call with the same texture and a tile size of 1000 by 1000 gives a new plane; a
   call with no appearance gives a flat plane again; the root never holds more than one plane; the
   texture's `dispose` is never called. The same RED commit holds a guard test:
   `buildFramedScene(graph, paint, { groundAppearance: appearance })` gives a ground that draws with
   the appearance. At run time it passes since cycle 3, because `buildFramedScene` hands `view` to
   `buildScene`. Fails today: after the first call the plane has no map, and typecheck reports
   TS2345 (the object is not assignable to `number | undefined`) for `refreshGroundPlane` and TS2353
   for the guard's `groundAppearance`. Implementation, all in `framed-scene.ts`: `SceneGround`;
   `refreshGroundPlane` takes it and keeps a plane only when there is exactly one, it sits at the
   grade, and `groundPlaneDrawsWith` is true for the appearance, and otherwise removes and frees
   every plane as today and adds one with `addGroundPlane(root, grade, ground.appearance)`;
   `frameStackedScene` takes a `SceneGround` as its second parameter and hands it on;
   `buildFramedScene`'s `view` becomes `BuildSceneOptions`. For the build only,
   `framed-scene-reconciler.ts` changes its two call sites (lines 269 and 272 to 276) to pass
   `{ gradeElevation: graph.gradeElevation }`. Neither `refreshGroundPlane` nor `frameStackedScene`
   is called from an existing test, so no test is retrofitted.
5. **`bridge/react/framed-scene-reconciler-ground.test.ts` (new): "a ground appearance reaches the
   ground of a stacked scene: an unchanged scene takes it in place, a rebuilt floor set is seated on
   it, and taking it away gives the flat lawn back".** Setup: reconcile a one-floor graph with one
   paint object; call `setGroundAppearance({ texture, tileSize })`; reconcile the same graph and
   paint; then a graph whose wall moved; then call `setGroundAppearance(undefined)` and reconcile
   that graph again; last, call `releaseRetired()`. Assert: the second call returns the same
   `FramedScene` object as the first, with the same wall sub-group object and exactly one ground
   plane, which draws with the appearance; the ground after the third call draws with it too; the
   ground after the last call is flat; the texture (marked held, with a `dispose` spy) is never
   disposed. Fails today: `TypeError: reconciler.setGroundAppearance is not a function`, and
   typecheck reports TS2339 (no such property on `FramedSceneReconciler`). Implementation:
   `framed-scene-reconciler.ts` keeps the appearance, carries it in `ReconcilePass`, and passes
   `{ gradeElevation: graph.gradeElevation, appearance }` to `refreshGroundPlane` (a cache hit) and
   to `frameStackedScene` (a rebuilt floor set). The old plane of a cache hit is freed at once, as
   the grade swap frees it today; a held texture is never freed. `createFramedSceneReconciler` is at
   38 of its 40 lines, so the new state and method need an extraction (for example the body of
   `dispose`).
6. **`bridge/react/framed-scene-reconciler-ground.test.ts`: "the scene of an empty graph takes the
   ground appearance too, whether it is cached or new".** The reconciler keeps the scene of a graph
   with no floors by graph and paint identity alone and returns it untouched
   (`framed-scene-reconciler.ts:311-313`), and an empty plan still has a ground plane, so the first
   3D view of a new project is this case. Setup one: reconcile a graph with no floors and one paint
   object; call `setGroundAppearance(appearance)`; reconcile the same graph and paint. Assert the
   same `FramedScene` object comes back, with one ground plane that draws with the appearance. Setup
   two: a new reconciler; `setGroundAppearance(appearance)` first; reconcile the empty graph. Assert
   the ground draws with the appearance. Fails today (after cycle 5): in both the ground is flat.
   There is no type error. Implementation: `framed-scene-reconciler.ts`: the empty-graph hit calls
   `refreshGroundPlane(emptyScene.framed.root, { gradeElevation: graph.gradeElevation, appearance })`,
   and `buildEmptyGraphScene` builds with `{ ...view, groundAppearance: appearance }` (live rule 7).
7. **`bridge/react/use-framed-scene-ground.test.tsx` (new): "the framed scene hook loads the ground
   grass, seats it on the scene it already shows, and reports its status".** Setup:
   `vi.mock('./use-ground-texture')` with a mock function whose state the test sets;
   `renderHook(() => useFramedScene(), { wrapper })` with the wrapper of `framedSceneEnvironment()`
   (`use-framed-scene-test-support.tsx`). With `{ status: 'loading' }` assert
   `result.current.groundTexture` is `'loading'`, the ground is flat, and the mock was called with
   `GROUND_GRASS_REFERENCE` as its first argument. Set `{ status: 'ready', appearance }` and render
   again: `groundTexture` is `'ready'`, `result.current.framed` is the same object as before, and
   its ground draws with the appearance. Toggle the edge overlay
   (`result.current.toggleEdgeOverlay()`), which makes a new reconciler: the new scene's ground
   draws with the appearance. A second test with `{ status: 'failed' }` gives `'failed'` and a flat
   ground. The same RED commit adds to `use-framed-scene.test.tsx` and
   `use-framed-scene-dispose.test.tsx` a mock of `./use-ground-texture` that returns one constant
   `{ status: 'failed' }`. Without it those tests would start a load against the empty fallback
   registry, which fails later with a `console.warn`. Fails today: `groundTexture` is `undefined`
   and the ground stays flat, and typecheck reports TS2339 (no `groundTexture` on
   `FramedSceneState`). Implementation: `use-framed-scene.ts` calls
   `useGroundTexture(GROUND_GRASS_REFERENCE, useAssetRegistry())`, calls
   `reconciler.setGroundAppearance(texture.appearance)` inside the reconcile memo before
   `reconcile`, with the appearance among the memo's dependencies (so the reconciler made by an
   overlay flip gets it too), and returns `groundTexture: texture.status`.
8. **`bridge/react/harness-ground.test.tsx` (new): "the harness ground reports loading until the
   grass is on the plane, then ready, and rebuilds no other geometry".** Setup: a framed scene from
   `buildFramedScene`; `renderHook` over `useHarnessGround(root, 0, texture)`, whose callback
   records each returned status and, in the same render, whether the root's ground plane draws with
   the appearance. Render with `{ status: 'loading' }`, then rerender with
   `{ status: 'ready', appearance }`. Assert: the render in which the appearance first arrives
   returns `loading` while the plane is still flat; the last return is `ready`; the ground then
   draws with the appearance; the wall meshes are the same objects as before. Rerender with the root
   of a second `buildFramedScene`: the first return is `loading`, the last `ready`, and the new
   root's ground draws with the appearance. A run with `{ status: 'failed' }` returns `loading`
   first, then `failed`, and leaves the flat plane. Fails today: the import of `./harness-ground`
   fails (no module; TS2307). Implementation: `harness-ground.ts` (harness rules 2 to 4).
9. **`bridge/react/scene-harness-ready-frame.test.tsx`: "the harness turns ready only with a
   frame drawn after the ground has settled, and reports the ground status".** This file renders
   `SceneHarnessView` under jsdom with a stand-in renderer, so the harness wiring has a unit test.
   Setup: a mock of `./use-ground-texture` whose state lives on the file's hoisted `harness`
   object. Its default is one constant `{ status: 'failed' }`, so the eight existing tests keep
   their flat lawn and their timing. New tests, each starting at `{ status: 'loading' }`:
   - With the lighting settled and a frame run, `data-harness-ready` is `false` and
     `data-ground-texture` is `loading`. More frames do not change that.
   - Then the state is set to `{ status: 'ready', appearance }` (a `Texture` from
     `engine/testing`) and the view is rendered again: `data-ground-texture` is `ready` and
     `data-harness-ready` is still `false`. After one more frame it is `true`.
   - Set to `{ status: 'failed' }` instead: after one more frame `data-harness-ready` is `true`
     and `data-ground-texture` is `failed`.
   - The ground settles first and the lighting second: `data-harness-ready` turns `true` only
     with a frame run after the lighting settled.

   Fails today: `data-harness-ready` is `true` while the ground is loading, and
   `data-ground-texture` is absent (`null`). The mock is a module mock, so there is no type
   error. Implementation (harness rules 5 to 9):
   - `scene-harness-ready-frame.ts`: `harnessReadyProps` takes the status and returns the fourth
     attribute.
   - `scene-harness-view.tsx`: `useFramedHarnessScene` keeps its memo, then calls
     `useGroundTexture(GROUND_GRASS_REFERENCE, useAssetRegistry())` and
     `useHarnessGround(framed.root, HARNESS_FIXTURES[scene].gradeElevation, texture)`, and
     returns the applied status with the framed scene as `groundTexture`.
     `useHarnessReadiness(ambientOcclusionActive: boolean, groundTexture: TextureStatus)` adds
     `groundTexture !== 'loading'` to its gate. `HarnessStage` reads `groundTexture` in its
     existing destructure and passes it to `useHarnessReadiness` and to `harnessReadyProps`, each
     on a line it already has.

10. **`bridge/react/use-live-view-readiness.test.tsx`: "a frame counts only when neither a pipeline
    build nor the ground texture is in flight, and a ground that starts to load clears a frame
    already counted".** The hook is rendered as
    `renderHook(({ status }) => useLiveViewReadiness(status), ...)`. The RED also gives every
    existing call in the file the argument `'ready'`, which changes nothing in those tests (live
    rule 3). New tests:
    - The store holds `frameDrawnSincePipelineSettled: true` from an earlier open. A mount with
      `'loading'` writes it false.
    - While the status is `'loading'`, `noteFrameDrawn` leaves the fact false.
    - A rerender with `'ready'` leaves it false (the settling writes nothing); the next
      `noteFrameDrawn` sets it true. The same holds with `'failed'`.
    - With the ground loading, `notePipelineBuildStarted`; rerender with `'ready'`;
      `noteFrameDrawn` leaves it false; `notePipelineSettled`; `noteFrameDrawn` sets it true.
    - With the fact true, a rerender with `'loading'` writes it false.

    Fails today: the mount with `'loading'` leaves the fact true and a frame counts while the
    ground loads, and typecheck reports TS2554 ("Expected 0 arguments, but got 1").
    Implementation: `use-live-view-readiness.ts` (live rules 2 to 4). Wiring, which no unit test
    reaches, because `LiveSceneView` runs only with a rendering backend and never under jsdom
    (`live-scene-view.tsx:203-209`): `LiveSceneCanvasProps` gains `groundTexture: TextureStatus`;
    `LiveSceneCanvas` calls `useLiveViewReadiness(props.groundTexture)`; `LiveSceneView` passes
    `groundTexture={framedScene.groundTexture}`. The parameter and the prop are required, so a
    missing link is a type error (TS2554 or TS2741). A wrong value is caught end to end by
    `scene-live-view-grass.spec.ts` and the live-view baseline of the scene work.

11. **`app/create-asset-library-registry.test.ts`: "the scene harness registry resolves and
    describes the ground grass".** `createHarnessAssetRegistry(fetchFn)` is a new export. Assert
    `resolve(GROUND_GRASS_REFERENCE)` fetched `/packs/vernacular-starter-1.1.0/assets/<hash>.png`
    and `describe` gives the tile size. Fails today:
    `TypeError: createHarnessAssetRegistry is not a function`, and typecheck reports TS2305 (no such
    exported member). Implementation: `app/create-asset-library-registry.ts`:
    `new AssetRegistry(createStarterPackSources(fetchFn))`, the starter pack sources with no user
    source. Wiring, which no unit test reaches: in `app/app.tsx` the harness branch (lines 82 to 96)
    renders a small `SceneHarnessApp` component, which makes the registry once with `useMemo` and
    wraps `SceneHarnessView` in an `AssetRegistryProvider` with it. A hook cannot sit in the
    early-return branch of `App`, and a registry made on each render would start the texture load
    again. Until this cycle the harness reads the empty fallback registry, so its ground settles as
    `failed` and stays flat. The wiring is proved end to end by every harness spec, which waits for
    `data-ground-texture="ready"` from the scene work on.

12. **`bridge/react/scene-harness-settle-frame.test.ts` (new): "the harness reports its ready
    frame only after a settle frame has drawn".** Added on 2026-11-24, after the scene work showed
    `scene-harness-ready-frame.spec.ts` reading 18 render calls instead of 5 in some runs (see the
    note on that spec below). The cause: three's PMREM filter of the sky environment map is
    one-time GPU work that runs in the first draw after the map is written, and it added 13 render
    calls to the frame it landed in. When that was the ready frame, the reported counts were not
    those of a steady-state frame. The owner ruled the fix into this pull request. The test calls
    `drawHarnessFrame(renderer, draw, onReadyFrame?)` with a stand-in renderer whose animation loop
    the test steps by hand. Assert:
    - Without `onReadyFrame`, one renderer frame runs `draw` once and nothing is reported.
    - With it, the first renderer frame runs `draw` and reports nothing (the settle frame).
    - The second renderer frame runs `draw` again and reports `{ renderCalls, drawCalls }` read
      from `renderer.info.render` in that frame, not the counts the settle frame left.
    - A cancel before the first frame draws nothing; a cancel between the frames skips the second
      draw and the report.
    - A later request replaces a pending one, because a renderer keeps one loop.

    The same RED commit moves the shared mocks of the harness view tests into
    `scene-harness-view-test-support.ts`, splits the ground cases of cycle 9 into
    `scene-harness-ready-frame-ground.test.tsx`, and has every view test run the settle frame
    before the ready frame (`runSettleAndReadyFrames`). Fails today: `drawHarnessFrame` is not
    exported (TS2305). Implementation:
    `scene-harness-ready-frame.ts` gains `drawHarnessFrame`, which nests a second
    `drawOnNextRendererFrame` inside the first when `onReadyFrame` is given and returns a cancel
    for whichever request is pending. `StaticFrame` in `scene-harness-view.tsx` calls it in place
    of its own `drawOnNextRendererFrame`, passing `handleReadyFrameDrawn` only while
    `harnessReady` is true. BLUE closed with an empty marker. Verified end to end:
    `scene-harness-ready-frame.spec.ts` passes 40 of 40 runs on darwin (`--repeat-each=20`).

Then the scene work, in `test(e2e)` commits after the last BLUE. What each capture waits on:

| Capture                                                     | Waits on today                              | After the first commit                       | After the scene work                                          |
| ----------------------------------------------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `scene-solar.spec.ts` (9 states, 18 files)                  | canvas width, `data-harness-ready` (inline) | `settledHarnessCanvas`: `data-harness-ready` | `data-harness-ready` and `data-ground-texture="ready"`        |
| `scene-visual-regression.spec.ts` (6 captures, 12 files)    | `settledHarnessCanvas`                      | the same                                     | the same two                                                  |
| The harness gates                                           | `settledHarnessCanvas`                      | the same                                     | the same two                                                  |
| `scene-live-view-visual-regression.spec.ts` (1 darwin file) | `data-live-view-ready`                      | the same                                     | the same attribute, which now waits for the ground (cycle 10) |

- `settledHarnessCanvas` gains the wait for `data-ground-texture="ready"`, after its wait for
  `data-harness-ready`. A failed pack fetch then fails every harness spec, and
  `--update-snapshots` can never write a flat baseline.
- `e2e/tests/scene-harness-ready-frame.spec.ts` asserts the render calls of the ready frame (5 in
  the window-light state, 2 in the default shell). The grass adds no render pass. The spec is run
  and is expected to hold. (Amended 2026-11-24: it did not hold. Some runs read 18 render calls
  instead of 5, on `main` too, because the PMREM filter of the sky environment map landed in the
  ready frame. The owner ruled the fix into this pull request as cycle 12, the settle frame. With
  it the spec passes 40 of 40 runs on darwin with `--repeat-each=20`.)
- `e2e/tests/scene-live-view-grass.spec.ts` (new) proves the live wiring of cycle 10. It
  self-skips without a rendering backend, as its neighbors do.
  - Test one holds the response for the grass image with `page.route`, opens the 3D view, and
    waits for the live canvas (`waitForLiveCanvasReady`), which shows that the scene is drawn and
    the overlay did not wait. While the response is held, `data-live-view-ready` is not `true`.
    After the response is released, the marker turns `true`.
  - Test two aborts the request. The marker turns `true` over the flat lawn.
  - Each test first checks that its route saw the request, so a pack served from some cache
    cannot pass it by accident.
- `scene-grass-texture.spec.ts` proves the visible change. In the `shadow-on-lawn` state it reads
  the sunlit square of the sun-to-shade gate (`SUNLIT_LAWN`, x 236 to 259, y 109 to 132), lawn in
  the sun clear of the building's shadow.
  - Test one: the standard deviation of luminance across the square is above a minimum, set at
    the midpoint of a flat reading (expected near 0) and a grass reading. Where darwin and linux
    differ, the minimum is the midpoint of the flat reading and the lower grass reading.
  - Test two: the square's mean linear level, read as the sun-to-shade gate reads it (the mean
    display code, taken back through the tone curve), lies between L_flat × (1 − ½(1 − γ)σ² − ε −
    n) and L_flat × (1 + ε + n). L_flat is the flat build's reading. σ is the tile's spread of
    texel luminance over its mean, in linear light, as `grass-tile.test.mjs` computes it (pull
    request 3, cycle 3). γ = 1/2.4. ε is the tile's relative luminance error, the distance of its
    mean luminance from 0.21174 over 0.21174, from the same test (pull request 3, cycle 2 bounds
    it by 0.0005 / 0.21174, about 0.24 percent). n is the larger of the relative noise of five
    captures of each build (zero where the captures are byte-identical) and the relative gap
    between the darwin and linux flat readings.
  - The source of the lower term is "Why the gates should barely move" below: a square of single
    texels reads low by at most ½(1 − γ)σ², and only low. The band takes σ of the whole tile,
    which overstates the spread inside one pixel, because the mip sample of each pixel averages at
    least ten texels a side ("Why 32 texels"). That slack also covers the tone curve's own
    curvature, which the term leaves out. With σ at most 20 percent the band reaches about 1.2
    percent plus ε and n below, and ε and n above. A tile decoded in the wrong color space, or
    with the wrong mean, moves the level by far more and fails it. The defect probe of test two
    decodes the grass as `linear`, and its reading must fall outside the band.
  - Amendment, 2026-11-24: the band gains a term r on both sides, L_flat × (1 − ½(1 − γ)σ² − ε −
    n − r) to L_flat × (1 + ε + n + r). r is the change half a display code on every channel
    makes to the flat level (1.209 percent on darwin). The flat reading is whole codes, so "only
    low" holds for the rendered level, not for the reading. The band then reaches about 1.5
    percent below and 1.2 percent above. If Linux lands outside it, a mip rounding term is
    derived for it; r is not widened.
  - The comment records both platforms' readings, σ, ε, n, and the probe, as the existing gates
    do.
- The two lawn gates are read again with the grass. If each reading moves by less than a tenth of
  its gate's margin, the threshold stays and the comment records the new reading beside the old.
  Otherwise the gate is derived again in full, with its defect probe.
- The other harness gates are described in their comments as sampling walls, interiors, or the
  sky. The walls take their bounce from the dome's constant, which does not change. The sky gate's
  square (x 12 to 35, y 12 to 35) lies well above the far edge of the lawn (row 107). The scene
  work checks the region of each gate against the lawn before the run. They are run, and are not
  expected to move.
- **Baselines.** Each one that fails is refreshed, and the pull request lists the diff ratio of
  each.
  - Captures expected to change, because the lawn is in their frame: the five exterior views of
    `scene-visual-regression.spec.ts` (the shell, the warm shell, the painted shell, the
    junctions, and the furniture) and seven states of `scene-solar.spec.ts` (equinox noon, winter
    afternoon, color check, overcast noon, shadow on lawn, sample daylight, and ambient
    occlusion). Expected to hold: the adjacent rooms seen from below grade (the lawn's drawn face
    points up, away from that camera), the finish-contrast floor (an interior camera looking
    straight down), and the window-light interior unless the lawn shows through its window. The
    run decides. The list only says where to look.
  - Thirteen captures compare at a threshold of 0.35 and a pixel ratio of 0.05, so some may pass
    against the flat baseline. That is why the grass spec, not the baselines, is the proof.
  - The ambient-occlusion and finish-contrast captures compare at a threshold of 0 with derived
    ratios (0.047 and 0.304). For each, the scene work first checks whether the lawn is in frame.
    Where it is (the ambient-occlusion state frames the `furniture` scene from outside,
    `app/harness-environment.ts`), the pair is derived again on darwin with its two defect probes
    against the grass frame, before its baseline is refreshed, by the two-probe midpoint method
    of the amendment of ADR-0157 (`docs/knowledge/decisions/ADR-0157-color-accuracy-gate.md`).
    The constant's own comment asks for that after each engine change. The comment records the
    new probe counts beside the old. Where the lawn is not in frame, the pair stays and the
    comment says why.
  - The linux harness files are rendered by dispatching the `Refresh scene baselines` workflow
    (`.github/workflows/refresh-scene-baselines.yml`) on the branch: `gh workflow run
refresh-scene-baselines.yml --repo drmrd/vernacular --ref feat/grass-on-the-ground`. It renders on the ubuntu runner
    that checks them (ADR-0152) and rewrites every linux file. From its `scene-baselines`
    artifact, only the files that failed replace the committed ones. `pnpm e2e:update-snapshots`
    is not used: it renders every project in a local container, which on the development Mac is
    arm64 and does not match the amd64 runner.
  - The darwin files are rendered on the development Mac with `pnpm build && pnpm exec playwright
test --project=scene-webgl --update-snapshots=all <spec>` (ADR-0149).
  - The live-view baseline exists on darwin only. The macOS runner of the `live-view-visual` job
    checks the same file, so the refreshed darwin file must also pass there.
  - Story and home baselines do not move.
- **The time the live specs take.** From cycle 10 on, every wait on `data-live-view-ready` also
  waits for the grass to be fetched, decoded, uploaded with its mipmaps, and drawn. The textured
  lawn also costs more to draw on each frame than a flat color, most of all on the software
  renderer of the linux `scene-visual` job.
  - The files that wait on the marker directly:
    `e2e/tests/scene-live-view-visual-regression.spec.ts` (only with a WebGPU adapter),
    `e2e/tests/scene-live-view-webgl-fallback.spec.ts`, and
    `e2e/tests/scene-live-view-startup.spec.ts`, each with a local `LIVE_VIEW_READY` constant; and
    `e2e/tests/scene-edge-overlay-resources.spec.ts`, `e2e/tests/scene-camera-presets.spec.ts`,
    `e2e/tests/journeys/perceived-color-readout.spec.ts`, and
    `e2e/tests/journeys/close-openings-support.ts`, with the constant that
    `e2e/tests/live-pane.ts` exports.
  - The journeys that wait on it through `settledLiveFrame` and `openRoomIn3d` of
    `close-openings-support.ts`: `e2e/tests/journeys/close-doors-and-windows.spec.ts`,
    `e2e/tests/journeys/walk-view-after-rebuild.spec.ts`,
    `e2e/tests/journeys/walk-follows-the-active-floor.spec.ts`, and, through `startOnLiveRoom` of
    `e2e/tests/journeys/close-openings-flows.ts`,
    `e2e/tests/journeys/aim-guide-in-walk-mode.spec.ts`.
  - `e2e/tests/scene-live-view-reopen.spec.ts` does not use the marker, because of issue #829. It
    waits on the readiness of its own mount, and stays as it is.
  - Every wait on the marker goes through one helper, `waitForLiveViewReady(page)` in
    `e2e/tests/live-pane.ts`, which passes a named timeout constant in place of the default expect
    limit, as `e2e/tests/live-pane-frames.ts` does with `LIVE_CANVAS_READY_TIMEOUT_MS`. The three
    local constants go away.
  - The pull request reads the run time of each of these specs from the job logs before the
    grass (on `main`) and after (on the branch), on the linux `scene-visual` job and on the macOS
    `live-view-visual` job, and lists both in its description.
  - Each live test of the `scene-webgl` project that draws more than one room or floor, or takes
    several settled frames, gets an explicit, named, longer time limit with a comment that says
    why. `scene-camera-presets.spec.ts` shows the form: the constant `SLOW_RENDERER_TIMEOUT_MS`
    and `test.beforeEach(() => test.setTimeout(SLOW_RENDERER_TIMEOUT_MS))`. The live specs of the
    project are `e2e/tests/journeys/scene-view-switch-keeps-state.spec.ts` and each
    `e2e/tests/<name>.spec.ts` for the names `scene-accessibility`, `scene-building-view`,
    `scene-camera-controls`, `scene-camera-fit`, `scene-camera-presets`,
    `scene-color-temperature`, `scene-edge-overlay-resources`, `scene-furniture-model-swap`,
    `scene-live-view`, `scene-live-view-reopen`, `scene-live-view-startup`,
    `scene-live-view-visual-regression`, `scene-live-view-webgl-fallback`, `scene-navigation`,
    `scene-orbit-pivot-holds`, and `scene-selection`. The files this touches are in the fence.

### The daylight constraint, as tests

| Check                                                                                              | Where                                      | Pull request |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------ |
| The generator's linear table matches the color module, and its target is the lawn hex              | `srgb-table.test.mjs`                      | 3            |
| The tile's linear mean is the lawn color, within 0.002 a channel                                   | `grass-tile.test.mjs`                      | 3            |
| Its luminance is the ground bounce, within 0.0005, and the bounce is 0.21174                       | `grass-tile.test.mjs`                      | 3            |
| The spread is 5 to 20 percent of the mean                                                          | `grass-tile.test.mjs`                      | 3            |
| Every 32 by 32 block is within 1 percent of the mean                                               | `grass-tile.test.mjs`                      | 3            |
| The tile is sRGB, so the card averages in linear light                                             | `image-texture-loader.test.ts`             | 2            |
| The bounce stays the lawn hex                                                                      | `ground-surface.test.ts` (as today)        | none         |
| Only the texture changes the lawn's material                                                       | `ground-plane-appearance.test.ts`, cycle 1 | 4            |
| The sunlit lawn keeps its mean level, within the band from the tile's spread and the flat rounding | `scene-grass-texture.spec.ts`, test two    | 4            |
| Sun-to-shade ratio and shadow-reach gap still clear their minimums                                 | the two gates                              | 4            |

**Why the gates should barely move.** The texture's mean equals the flat color, and the graphics
card averages in linear light. But a gate first averages display codes, which are a concave
function of linear light. Write σ for the spread of texel luminance in linear light, over its mean,
and γ = 1/2.4 for the encoding. A gate square that shows single texels then reads a linear level
lower by about ½(1 − γ)σ²: 0.29 percent at σ = 10 percent and 1.2 percent at the upper bound of 20
percent. The tone curve adds its own curvature on top. These are upper bounds, because mip
filtering averages texels before they reach a pixel. The sun-to-shade gate divides two levels that
shift alike, so its ratio moves far less than either. The shadow-reach gap subtracts two OKLab L
values that shift alike, and L is near the cube root of luminance, so the gap moves less still.
Both margins (2.093 and 0.0201) are far above these shifts. The readings must still confirm it.

**Why 32 texels.** A block is 125 mm of lawn on a 2000 mm tile of 512 texels. The ground under
each 24-pixel gate square follows from the committed camera poses and the 320 by 240 frame. The
harness camera has the vertical field of view of the React Three Fiber default camera, 75 degrees:
`harnessCameraProps` sets none, and `DEFAULT_FOV_DEGREES` in `bridge/react/fit-camera.ts` is the
same. Casting the corners of each square onto the ground plane, at `6e200b70`:

- the two squares of the sun-to-shade gate, under `SHADOW_ON_LAWN_CAMERA_POSE`
  (`app/harness-environment.ts`), each cover about 1.3 m across and 1.5 m in depth;
- the two squares of the shadow-reach gate, in the `winter-afternoon` frame (fitted by
  `frameSceneCamera` to the bounds of the shell, about 4.1 by 2.6 by 3.1 m), each cover about 1.0
  m by 1.4 m.

Every side is far above 250 mm, so each square holds dozens of 125 mm blocks, and the block of
pull request 3, cycle 4 stays at 32 texels. These figures are computed from the poses, not
rendered. Each pixel there covers at least about 40 mm of lawn, ten texels or more a side. If a
later camera change brings a gate square under 250 mm a side, a smaller block means a new tile and
a starter pack 1.1.1, not an edit to 1.1.0.

**What it leaves.** Finishes with `tiled-image`. A check of the hash at run time. A real chair. A
catalog read that includes textures, for the check of missing assets on import.

## Order and parallel work

1. Pull request 1. The record, the specification change, and this plan are on `main` before it.
2. Pull requests 2 and 3, side by side. Both need only pull request 1. Their fences meet only in
   `core/index.ts`: pull request 2 adds the asset description type exports and pull request 3 the
   `GROUND_GRASS_REFERENCE` export. The second to land rebases onto the first.
3. Pull request 4, after both.

## Files shared with other efforts

- The session layer effort, in `app/`, `session/`, and `storage/`: `app/app.tsx` and
  `app/create-asset-library-registry.ts` (pull requests 3 and 4). Its pull request 8, "assets
  travel with documents", in `docs/plans/2026-11-15-session-layer-and-document-identity.md`, landed
  in #946: `app/pack-supplies.ts` reads `library.list()` as the catalog of the hashes a pack
  supplies. This plan keeps `list()` a listing of models, so pack
  supplies see no texture. No document refers to a texture until finishes do, so nothing breaks
  now. Before finishes, a catalog read must serve supplies.
- Issue #717 moves the asset ports behind `session/`. This plan adds no bridge import of
  `storage/`, so it adds nothing for #717 to move.
- The plan for the geometric kernel and the first arc wall
  (`docs/plans/2026-11-19-geometric-kernel-and-first-arc-wall.md`) changes `core/topology` and
  `core/index.ts` in most of its pull requests. This plan adds exports to `core/index.ts` in pull
  requests 1, 2, and 3. The kernel plan names `engine/scene/build-scene.ts` as a consumer of
  derived geometry; this plan changes only its ground call. The kernel plan refreshes every scene
  baseline in two of its pull requests. Whichever of the two efforts lands second rebases onto the other's baselines.
- The specification of the first view of a project
  (`docs/specs/2026-11-19-first-view-of-a-project.md`) adds a live-view baseline from the front,
  which shows the lawn. If it lands after pull request 4, it is captured with the grass. If
  before, pull request 4 refreshes it.
- `e2e/tests/scene-camera-presets.spec.ts` and `e2e/tests/journeys/close-openings-support.ts`
  changed on `main` after this plan's base (commit `c9fcbb46` gave the doorway tests their longer
  limit). Pull request 4 rebases onto the newest of both before it touches them.

## Size

| Pull request                | Cycles                                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, the format               | 18                                                                                                                                                                                                                           |
| 2, the loader and the cache | 16                                                                                                                                                                                                                           |
| 3, starter pack 1.1.0       | 7                                                                                                                                                                                                                            |
| 4, the ground               | 11, after one `test(e2e)` commit (one wait for every harness capture) and before the scene work (the ground wait, the grass spec, the live grass spec, the gate readings, the live spec waits and limits, and the baselines) |
| Total                       | 52                                                                                                                                                                                                                           |

## Risks

- **The harness could capture flat grass.** Covered by `settledHarnessCanvas`, the one wait of
  every harness spec, which needs `data-ground-texture="ready"`, together with the applied-status
  rule (harness rules 2 to 4, cycles 8 and 9): the attribute reports the status applied to the
  drawn root, not the cache's status.
- **The live view could report ready from an earlier open.** A ground that starts to load clears
  the stale fact of issue #829 in the first commit of each mount (live rules 3 and 5, cycle 10).
  The path from the view to the hook has no unit test. Required types hold it together, and
  `scene-live-view-grass.spec.ts` checks it end to end.
- **The grass slows each live frame on the software renderer of the linux job.** The live specs
  that wait on `data-live-view-ready` now also wait for the grass. Their run times before and
  after are in the pull request, and the specs get named waits and limits ("The time the live
  specs take"). A step limit of the macOS job is shared configuration and needs the owner.
- **StrictMode and hidden views.** A cache disposed in a cleanup and kept in a ref never loads again
  under StrictMode. Cycle 11 of pull request 2 proves the ground texture does not have that fault.
- **Two packs with one image.** The decoded texture is keyed by hash and color space, and the tile
  size comes from each reference. Cycles 5, 7, and 8 of pull request 2 test it.
- **The two platforms filter textures differently.** Mip selection may differ between the darwin
  and linux renderers. Baselines are per platform already, and the grass spec derives its bounds
  on both. Whether linux mipmap generation on an sRGB texture is linear is not verified.
- **The view shows flat green, then grass, on every 3D open.** The cache lives as long as one view,
  and the view unmounts on a mode change. The two have the same mean, so the change is quiet. No
  test measures it.
- **The grass file loads when the 3D view first opens.** It is fetched once a view and kept while
  the view lives. A compressed PNG would be smaller for photographs, but grass noise compresses
  poorly.
- **A stale tab after 1.0.0 leaves `public/`.** Its library is empty until a reload. No document
  changes.
- **An older application never meets a newer pack today,** because it fetches its own pack.
- **The validator role file is out of an agent's reach.** Without the owner's edit it describes
  format 1 only.
- **`disposeObject` changes for everyone.** Furniture textures are never marked held, so furniture
  is freed as before. Cycle 3 of pull request 2 tests both cases.
- **Shared configuration.** Pull requests 1 and 3 each add one `.prettierignore` entry.
