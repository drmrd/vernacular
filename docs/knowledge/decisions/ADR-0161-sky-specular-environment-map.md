---
slug: decisions/ADR-0161-sky-specular-environment-map
title: 'ADR-0161: The sky as a specular environment map'
type: decision
tags:
  [architecture, engine, lighting, environment, sky, image-based-lighting, materials, 3d-preview]
related:
  [
    decisions/ADR-0148-visible-sky-and-sh-light-probe,
    decisions/ADR-0156-luminance-calibration-convention,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0157-color-accuracy-gate,
    decisions/ADR-0158-millimeter-scale-shadow-and-occlusion-constants,
    decisions/ADR-0130-finishes-system-architecture,
    decisions/ADR-0079-three-dimensional-lighting-legibility,
  ]
sourceFiles:
  [
    engine/lighting/sky-environment-map.ts,
    engine/lighting/sky-environment.ts,
    engine/lighting/lighting-rig.ts,
    engine/lighting/solar-lighting-provider.ts,
  ]
status: current
updated: 2026-08-14
---

# ADR-0161: The sky as a specular environment map

## Status

Accepted, lands with issue #520. Resolves the deferral
[[ADR-0148-visible-sky-and-sh-light-probe]] recorded when it chose spherical harmonics for the
diffuse sky term: the PMREM cubemap and `scene.environment` were left to the materials slice, and
this is that slice.

## Context

`scene.environment` was never assigned anywhere in the engine or the bridge. The finishes work
that shipped before this made `finishId` drive roughness, sheen, and specular on
`MeshPhysicalMaterial` ([[ADR-0130-finishes-system-architecture]]), but a specular parameter only
does something when there is something to reflect. With no environment there was nothing, and the
consequence was measurable rather than theoretical: rendering the color-accuracy floor at `gloss`
and at `matte` on the parent commit produced byte-identical frames, `#747474` against `#747474`.
The finish registry was live in the material and dead in the picture.

ADR-0148 had already faced the fork between a PMREM-filtered cubemap and CPU-projected harmonics,
and chose harmonics for the diffuse term on three grounds worth restating, because two of them
still hold and one no longer binds. Order-2 projection is exact enough for a smooth analytic dome;
the projection is plain math that unit-tests in Node where a PMREM pipeline needs a GPU; and it
needs no renderer access, so the `LightingProvider` contract keeps its shape. What harmonics
cannot do is specular reflection, which is what this slice needs.

## Decision

### The environment is the sky ambient the rig already carries, re-expressed as a map

The map is not derived from the sun and cloud state. It is reconstructed from
`EnvironmentLighting.skyAmbient`, the twenty-seven spherical-harmonic coefficients the light probe
was already being driven from, by evaluating them over an equirectangular grid.

Deriving it from the harmonics rather than re-deriving it from the sky model settles three things
at once. The specular environment and the diffuse ambient are then the same field by construction,
so they cannot drift apart. No new field joins `EnvironmentLighting`, so no fixture and no schema
moves. And, decisively, the color check keeps working with no special case anywhere in the engine:
`colorCheckLighting` already replaces `skyAmbient` with a neutral uniform white dome while leaving
`sunDirection` alone, so a map built from the harmonics is neutralized upstream, whereas a map
rebuilt from the sun direction would have ignored the color check entirely.

### Three filters the map; the engine never touches a renderer

Assigning an equirectangular texture to `scene.environment` is enough. The node renderer wraps it
through `pmremTexture` in `EnvironmentNode` and filters it on the GPU, so the PMREM step happens
without the engine holding a renderer or a `PMREMGenerator`. The `LightingProvider` contract
therefore keeps the rendererless shape ADR-0148 valued, the whole change stays inside
`engine/lighting/`, and the bridge needs no edit at all.

This also keeps the proof where the repo puts it. The map's contents are a typed array, so the
reconstruction, the direction convention, and the clamping are all asserted exactly in Node, and
only the filtering itself is left to the GPU.

### The map replaces the light probe

The hemisphere fill gave way to the probe because both modelled the sky's diffuse ambient and
running both counted it twice. The same argument applies one step further. The environment map
supplies diffuse irradiance and specular radiance together, so a probe kept alongside it would
double the diffuse ambient exactly as the fill once did. Realistic mode now carries the map alone,
and the "a night scene never goes black" behavior moves onto it with everything else.

Swapping the carrier is safe at the reference condition rather than merely close, and the
arithmetic is worth writing down because the color-accuracy gate rests on it. A uniform white dome
of radiance 1 is pure band 0, and the neutral dome constant is chosen so the reconstruction returns
exactly 1 in every direction. Under the probe, three multiplies that band-0 coefficient by 0.886227
to get an irradiance of pi, and the Lambert term divides by pi, so the surface returns its albedo.
Under the map, three samples the fully filtered level and multiplies by pi for the same irradiance,
and a constant field survives filtering unchanged, so the surface returns its albedo again. The two
carriers agree exactly where the gate reads them, and differ elsewhere only in how each approximates
the same cosine convolution of the same dome.

### The policy is per mode, and the color check needs no branch

Only the solar provider attaches an environment. The schematic rig is a legibility instrument
rather than a physical one ([[ADR-0079-three-dimensional-lighting-legibility]]), it has no sky to
derive a map from, and leaving `scene.environment` untouched there is what guarantees its committed
baselines cannot move. Measurement confirmed it: regenerating the schematic baselines on this branch
and on the parent commit produced identical bytes.

The color check is not a third case. It runs in realistic mode and reaches the map through the
neutralized harmonics described above, which is what the epic asks for, since the gate is specified
to read a known paint under image-based lighting rather than beside it.

### Intensity is one, and it is not a new constant

`scene.environmentIntensity` is set explicitly to 1. The map carries absolute linear radiance, the
same quantity the probe carried, so nothing scales between the sky model and the render and
[[ADR-0156-luminance-calibration-convention]] keeps its reference condition unchanged. The value is
written out rather than left to three's default so that a default change cannot move the gate's
target silently, which is the same defensive habit the sky mesh's pinned uniforms follow.

### The map's size comes from the filter chain, not from the picture

An order-2 harmonic field carries at most two cycles per revolution, so a handful of samples would
resolve it and the content sets no meaningful floor. What does set one is three's own chain: the
PMREM cube face is a quarter of the equirectangular width, and the chain needs a face of at least
`2 ** LOD_MIN`, which is 16 texels in r184. The map sits exactly at that minimum, 64 by 32, and the
constants are written as that derivation rather than as literals.

Staying at the minimum is what preserves ADR-0148's best property. Two thousand texels are cheap
enough to rebuild on every scrub tick, so the throttling requirement that ADR-0148 dissolved stays
dissolved instead of returning with the map.

Following [[ADR-0158-millimeter-scale-shadow-and-occlusion-constants]], the units are stated where
the constants are declared, and the statement here is that none of them are world lengths. A
reflected environment is treated as infinitely distant, so the map is scale-free and the millimeter
world never enters it. The sizes count texels and the values are linear-light radiance.

### Regeneration is keyed on the sky, and the map is rewritten rather than replaced

One texture is allocated per rig and rewritten in place. Three caches the filtered PMREM target
against the source texture and reuses that target whenever `pmremVersion` moves, so rewriting
refilters into the existing target while allocating a fresh texture per update would strand one
target per sky change.

The rewrite is skipped unless the sky ambient actually changed, compared by value because the
environment pipeline rebuilds the coefficient array every tick and comparing references would
rewrite on every update. Time of day and cloud cover both reach the engine as a different ambient,
so those twenty-seven numbers are the whole invalidation signal, and updates that arrive for other
reasons (a shadow refit, a color change) no longer trigger a GPU refilter.

An order-2 reconstruction rings below zero where the dome darkens sharply. Negative radiance is not
a color the filter chain can carry, so channels clamp at zero on the way into the map.

### Teardown frees the map, because nothing else will

This is the one place where the node renderer and the classic WebGL renderer genuinely differ, and
getting it wrong leaks GPU memory on every mode toggle. The classic path registers a `dispose`
listener on the source texture and frees the derived render target with it. The node path registers
no such listener: it holds the filtered target in a per-renderer `WeakMap` keyed by the source, and
`PMREMNode.dispose` frees only its own generator. Dropping the last reference to the source
therefore makes the cache entry collectable without ever freeing the GPU target.

So rig teardown disposes the source texture, clears `scene.environment` when the scene still points
at it, and forgets the ambient it held so a rebuilt rig does not mistake a fresh black map for one
that already holds the right sky.

## Consequences

- Finishes are legible. The same floor at `gloss` and at `matte` rendered byte-identical before this
  change and now separates clearly, for example `#7a7a7a` against `#757575` on the neutral swatch.
  That separation is the whole point of issue #520.
- The color-accuracy gate got slightly better rather than worse, which is the reverse of the
  expected risk. Every swatch renders darker than its reference, so the added specular term moves
  the sample toward the target: the neutral swatch improves from 0.0409 to 0.0375 and the cool
  swatch from 0.0447 to 0.0443, against a tolerance of 0.06 ([[ADR-0157-color-accuracy-gate]]). The
  diffuse term is unchanged by the derivation above, and the warm swatch confirms it by not moving
  at all.
- No committed baseline is refreshed. Isolated against the parent commit on the same machine, the
  six solar states move by a mean of 1.6 to 4.0 of 255 with a maximum of 13, and no pixel crosses the
  scene tier's per-pixel threshold. This repeats the finding ADR-0158 recorded: the scene baselines
  are too loose to gate lighting work of this size, and tightening them belongs with the
  color-accuracy line of work rather than with a tolerance edit here.
- The harness paints every surface matte, so no committed pixel test exercises the finish separation
  this change delivers. The evidence above came from a temporary local experiment. A harness
  affordance for a glossy surface, and a gate over it, is the natural follow-up.
- A provider swap can still strand one filtered PMREM target inside three's per-renderer cache,
  because that cache is not reachable from here. Bounding it is why the map is per rig and rewritten
  in place: the exposure is one target per mode toggle rather than one per sky change.
- Reading the gate through Neutral tone mapping is unchanged ([[ADR-0147-per-mode-tone-mapping]]),
  and realistic mode continues to render through AgX, which is what carries the sky's range.

## References

- Issue #520 (scope) and the materials slice of the realistic-environmental-lighting epic.
- Realistic-environmental-lighting spec, slice 3
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).
- [[ADR-0148-visible-sky-and-sh-light-probe]] (the deferral this resolves, and the probe it retires).
- [[ADR-0156-luminance-calibration-convention]] (the reference condition the intensity keeps).
- [[ADR-0157-color-accuracy-gate]] (the tolerance the margins are measured against).
- [[ADR-0158-millimeter-scale-shadow-and-occlusion-constants]] (stating units at the declaration).
- [[ADR-0130-finishes-system-architecture]] (the finish parameters this makes visible).
- `node_modules/three/src/nodes/lighting/EnvironmentNode.js` and
  `node_modules/three/src/nodes/pmrem/PMREMNode.js` (the r184 filtering and caching this rests on).
