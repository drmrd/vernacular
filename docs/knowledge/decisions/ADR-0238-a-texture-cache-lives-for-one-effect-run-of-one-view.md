---
slug: decisions/ADR-0238-a-texture-cache-lives-for-one-effect-run-of-one-view
title: 'ADR-0238: A texture cache lives for one effect run of one view'
type: decision
tags: [bridge, engine, storage, assets, textures, cache, react, strict-mode, gpu, memory, dispose]
related:
  [
    decisions/ADR-0219-pack-assets-carry-textures,
    decisions/ADR-0226-a-replaced-scene-build-frees-what-it-owns-once-it-is-no-longer-drawn,
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0093-in-app-asset-library,
    decisions/ADR-0130-finishes-system-architecture,
    decisions/ADR-0131-ground-plane-grade-datum,
  ]
sourceFiles:
  [
    bridge/react/texture-cache.ts,
    bridge/react/use-ground-texture.ts,
    engine/loaders/image-texture-loader.ts,
    engine/scene/dispose-object.ts,
    engine/index.ts,
    storage/assets/asset-registry.ts,
    storage/assets/asset-source.ts,
    storage/assets/pack-source.ts,
    core/assets/asset-description.ts,
    core/assets/texture-asset-rules.ts,
    docs/plans/2026-11-19-texture-assets-in-packs.md,
  ]
status: current
updated: 2026-11-23
---

# ADR-0238: A texture cache lives for one effect run of one view

## Status

Current, 2026-11-23. It landed with the second pull request of
`docs/plans/2026-11-19-texture-assets-in-packs.md`, for issue #409. It builds the registry
description and the image loader that [[ADR-0219-pack-assets-carry-textures]] calls for. It adds a
third owner of held resources to [[ADR-0226-a-replaced-scene-build-frees-what-it-owns-once-it-is-no-longer-drawn]].
It supersedes nothing.

Nothing draws a texture yet. The fourth pull request of the plan puts the grass on the ground.

## Context

ADR-0219 lets a pack carry a texture: a PNG or WebP image with a tile size in millimeters and a
color space. To draw one, the application has to describe the asset, read its bytes, decode them
into a Three.js texture, and free that texture when nothing needs it any more. Each step has a
catch.

- The bytes are shared by content hash, but the tile size and the color space belong to one pack
  version. Two packs can ship the same image with different tile sizes.
- A pack source does not know its own id until its manifest loads. `PackSource.id` reads
  `pack:unknown@0.0.0` before that, so a lookup that compares the id with the reference's scope
  before it asks the source misses the exact scope on a cold source.
- React runs effects twice under StrictMode in development, can commit a non-urgent update after
  newer inputs, and runs an effect's cleanup without unmounting when `<Activity>` hides a view. A
  texture freed in a cleanup can still sit in component state.
- A scene release frees every texture of a tree unless an owner has marked it held (ADR-0226).

## Decision

### The engine decodes and frees

`decodeImageTexture(bytes, { mediaType, colorSpace }, decode?)` in
`engine/loaders/image-texture-loader.ts` decodes the bytes with `createImageBitmap`, asking for no
color conversion and no alpha premultiplication. The declared color space is then the only
interpretation applied. The texture repeats on both axes, builds mipmaps, sets `flipY` to false,
and takes the sRGB color space for `srgb` and none for `linear`. The WebGL backend ignores the
flip and premultiply flags for a bitmap while the WebGPU backend honors them, so they stay false
and both backends agree. A decode that fails rejects with `ImageTextureDecodeError`, which keeps
the cause.

`disposeImageTexture(texture)` frees the GPU texture and then closes the bitmap behind it, so the
decoded pixels do not wait for the garbage collector.

### The registry describes an asset

`AssetSource` gains an optional `describe(contentHash)`, and `AssetRegistry` gains
`describe(reference)`. Both return the core `AssetDescription` (`core/assets/asset-description.ts`):
a model with its size, or a texture with its media type, image size, tile size, and color space.

The registry asks sources in the precedence order of `resolve`, starting with sources of the
reference's own scope kind. It compares `source.id` with `reference.scope` after each call, not
before it, so a pack source whose id is known only once its manifest loads still matches its
scope. A description from the exact scope returns at once. Otherwise the registry keeps the first
description it found. After that first find, only sources of the requested kind can still name
the exact scope, so the walk stops at the first source of another kind.

### The cache shares decodes and owns what it decodes

`createTextureCache({ source, decode, dispose })` in `bridge/react/texture-cache.ts` loads each
reference once. `request(reference)` describes and resolves the reference together, then decodes,
and `get(reference)` gives its `TextureState`: `loading`, `ready` with a `TextureAppearance`, or
`failed`.

Decodes are shared by content hash and color space. Two references to one image in one color
space get one texture, even from two packs. The tile size is not part of the decode. It comes from
each reference's own description and travels in its `TextureAppearance`, so two packs that tile
the same image at different sizes still share one texture. One image used in both color spaces
decodes twice, because the color space is a property of the texture.

The cache marks each decoded texture held with `markCacheHeld`, so a scene release never frees
it. `dispose()` frees each texture the cache holds once. A decode that settles after `dispose()` is
freed as soon as it settles.

A reference settles `failed` when it has no description, when its description is not a texture,
when its image does not resolve in its scope, or when the describe, the resolve, or the decode
rejects. Each failure logs one `console.warn` that names the content hash and gives the reason as
a second argument. The cache does not retry. A failed decode stays in the shared map for the life
of the cache.

### The hook builds one cache per effect run

`useGroundTexture(reference, source)` in `bridge/react/use-ground-texture.ts` builds a cache
inside its effect and disposes it in the effect's cleanup. Each run of the effect has its own
cache, and the cache dies with that run. The effect depends on the formatted reference and the
source, so `source` must keep one identity across renders. The registry from `useAssetRegistry()`
does.

A cache built during render, or kept in a ref, would be shared by both StrictMode runs. The first
cleanup would free it and the second run would hand out its freed textures. A cache per run avoids
that, at the cost of two resolves and two decodes per mount in development.

Four guards keep a freed texture out of the returned state, and each has a test that fails
without it.

The cleanup sets a cancelled flag, and the run's load checks it before storing its state. A load
that settles after its cleanup holds a texture its cache has already freed, so it is dropped.

The render that first sees a new reference or source drops the settled state. Without this
render-time reset, going from A to B and back to A before B settles would match A's old state
again, and A's texture was freed when its run was cleaned up.

The settled state carries a tag: the reference and source of the run that made it. It shows only
while the tag matches the current inputs. In a non-urgent commit React runs the old cleanup after
the new inputs commit, so the old load can settle in between and store its state. The tag keeps
that state away from the new inputs.

The cleanup also drops the settled state. When `<Activity>` hides a view, React runs the cleanup,
which frees the cache, but keeps the state. When the view shows again, that state matches the
inputs, and without the reset the view would get the freed texture until the new load settled.

From the first render until its cache settles, the hook gives `{ status: 'loading' }`.

## Alternatives considered

Key decodes by content hash alone. One image used as color and as data would then share a texture
whose color space suits only one of the two uses. Not taken.

Make the tile size part of the decode. Two packs that tile one image differently would decode it
twice, and a second decode of the same pixels buys nothing. The tile size is per reference
instead.

Compare the source id with the scope before calling `describe`. On a cold pack source the id is
still the placeholder, so the exact scope is missed and a fallback pack's tile size wins. Not
taken.

Keep one cache for the whole application. It would decode each image once across views and
remounts. But it needs a release point tied to the library commit, as ADR-0226 builds for scene
builds, and some count of the views that use each texture. Nothing draws a texture yet, so the
smaller lifetime comes first.

## Consequences

- The texture cache is the third owner of held resources, beside the material providers and the
  furniture model cache. It marks every texture it decodes held and frees it itself.
- Only a new effect run, from a remount or a new reference or source, tries a failed texture
  again.
- Pull request 4 of the plan reads `TextureState` and `TextureAppearance` to draw the grass and
  falls back to the flat lawn color while the state is `loading` or `failed`.

## Known limits

The hook frees its textures in a react-dom effect cleanup. ADR-0226 rejects that release point for
scene builds: React Three Fiber commits a task later, and a frame drawn in that gap uploads a freed
resource again. For a texture, the upload would come from a closed bitmap. This follows from the
code and has not been run. It is safe while the reference and the source stay the same for the
life of a mount, which holds today. A finish that changes a texture reference at run time (#378,
#379) needs this decided first, and an issue will be filed for it.

After `dispose()`, `get` still returns the state it settled, including a texture that is now
freed. A second `dispose()` frees every texture again, where the providers of ADR-0226 do nothing
on a second call. The hook calls `dispose()` once and never calls `get` after it.

The registry's `resolve` has no exact-scope match. It returns the bytes of the first source by
precedence. The hash pins the bytes, so only the reported scope can differ. In `describe`, a
source later in the walk whose call rejects discards a fallback description already found, and a
failed manifest is fetched again on the next call. Both stay latent while there is one pack.
Issue #1115 rewrites the lookup and covers them.

A failed decode is not retried for the life of the cache. Whether a later request should try
again depends on whether failures are mostly transient or permanent. An issue will be filed.

## References

- `docs/plans/2026-11-19-texture-assets-in-packs.md`, pull request 2.
- [[ADR-0219-pack-assets-carry-textures]], the texture format and the per-version tile size.
- [[ADR-0226-a-replaced-scene-build-frees-what-it-owns-once-it-is-no-longer-drawn]], the held mark
  and the release point.
- [[ADR-0007-content-addressed-assets]], the `(scope, contentHash)` reference.
- [[ADR-0093-in-app-asset-library]], the asset registry and the pack source.
- Issues #409 (the grass of the ground), #378 and #379 (finishes with images), and #1115 (the
  registry lookup by exact scope).
