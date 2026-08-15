---
slug: decisions/ADR-0148-visible-sky-and-sh-light-probe
title: 'ADR-0148: The visible sky and its spherical-harmonics light probe'
type: decision
tags: [architecture, core, engine, lighting, environment, sky, image-based-lighting, 3d-preview]
related:
  [
    decisions/ADR-0144-solar-lighting-provider-and-sky,
    decisions/ADR-0146-environment-panel-and-session-contract,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0079-three-dimensional-lighting-legibility,
    decisions/ADR-0161-sky-specular-environment-map,
  ]
sourceFiles:
  [
    core/environment/sky-dome.ts,
    core/environment/spherical-harmonics.ts,
    core/environment/environment-lighting.ts,
    core/environment/color-check.ts,
    engine/lighting/sky-environment.ts,
    engine/lighting/sky-environment-map.ts,
    engine/lighting/lighting-rig.ts,
    engine/lighting/solar-lighting-provider.ts,
  ]
status: current
updated: 2026-08-14
---

# ADR-0148: The visible sky and its spherical-harmonics light probe

## Status

Accepted, lands with issue #436. Resolves the Stage B deferral recorded in
[[ADR-0144-solar-lighting-provider-and-sky]]: the sky ambient no longer stops at a hemisphere
tint, and realistic mode now shows the sky it is lit by.

## Context

ADR-0144 shipped the solar rig with a flat hemisphere fill standing in for the sky, and left
image-based sky lighting open under issue #436 because the r184 environment-map path is GPU-only
and could not be judged in the local test tier. The result read as unfinished exactly where
realistic mode should shine: a dusk render had a correctly aimed, correctly tinted sun in front
of a background that was still nothing at all.

Issue #436 asked for three things: a visible sky (sun disc, clouds that follow the cloud-cover
dial, dusk gradients), diffuse lighting derived from that same sky, and a decision on the fork
it left to the implementation plan: whether the diffuse term comes from a PMREM-filtered cubemap
on `scene.environment` or from CPU-projected spherical harmonics driving a `THREE.LightProbe`.

## Decision

### The diffuse sky term is CPU spherical harmonics on a light probe; PMREM waits for #449

Core gains an analytic sky dome (`core/environment/sky-dome.ts`): a pure function from view
elevation, sun altitude, and cloud cover to linear radiance, blending a horizon tint into a
zenith tint above the horizon and returning a ground bounce below it, dimming as the sun sets
and greying under cloud so it stays inside the ambient family the sky model already defines.
A second pure module (`core/environment/spherical-harmonics.ts`) projects that dome into nine
RGB spherical-harmonic coefficient triples by deterministic numeric integration and can evaluate
them back, using the same basis constants three's `SphericalHarmonics3` uses internally, so the
27 numbers feed `probe.sh.fromArray` unchanged.

The probe won the fork on every axis that matters this slice. An order-2 projection is exact
enough for a smooth analytic dome, with none of the filtering artifacts a 64-pixel cubemap
invites. The projection is plain math that unit-tests in Node, where a PMREM pipeline needs a
GPU and could only be judged on the CI visual tier. It needs no renderer access, so the
`LightingProvider` contract keeps its shape and the bridge stays untouched. And it is cheap
enough to recompute on every scrub tick, which dissolves the issue's 5 to 10 Hz throttling
requirement instead of implementing it. What the probe cannot do is specular reflection, and
nothing renders reflective materials before the materials slice (#449); the PMREM cubemap and
`scene.environment` remain that slice's work.

### The probe replaces the hemisphere fill in solar mode

Both model the same physical thing, the sky's diffuse ambient, so running both double-counts
it. `attachSkyEnvironment` zeroes the shared rig's fill intensity and the probe carries the
ambient alone. The long-standing "a night scene never goes black" behavior moved with it: the
test that pinned it to the hemisphere fill now pins it to the probe. Schematic mode keeps its
hemisphere fill untouched, because [[ADR-0079-three-dimensional-lighting-legibility]] balances
that rig for legibility, not physics.

### The visible sky is the SkyMesh addon, attached by the solar provider, with cloud motion frozen

The solar provider attaches three's `SkyMesh` (the TSL sky addon, WebGPU-native with a WebGL2
fallback) at `apply` and drives it at `update`: the NOAA-derived sun direction feeds the
`sunPosition` uniform directly, the cloud-cover dial feeds `cloudCoverage`, and the sun disc
stays on. The mesh is the far-field background, which satisfies the issue's `scene.background`
bullet without touching scene state. `cloudSpeed` is pinned to 0 and the remaining cloud
uniforms are pinned to the addon's r184 defaults by name, so neither the addon's time-based
cloud animation nor a future addon default change can make a scene baseline nondeterministic.
Cloud motion is a spec layer-9 concern.

### EnvironmentLighting carries everything the rig needs

`EnvironmentLighting` gains two required fields: `cloudCover`, a passthrough the sky mesh
reads, and `skyAmbient`, the 27 projected coefficients in `SphericalHarmonics3.fromArray`
order. Making them required broke every fixture that fabricates the interface, and that landed
as one end-to-end cycle whose RED updated all four construction-site test files, the lesson
slice 1b taught with `sunIntensity`. `colorCheckLighting` replaces `skyAmbient` with a neutral
uniform-white dome's coefficients, so the color check reads white-balanced under the probe
exactly as it does under the hemisphere.

One dependency rule fell out of implementation: `core/environment/spherical-harmonics.ts` must
not import from `color-check.ts`. The color check imports the neutral dome constant from the
harmonics module, and the harmonics module computes its constants eagerly at load, so an import
back the other way is a circular-import crash whenever `color-check.ts` loads first. The
harmonics module states the neutral white channel as its own named constant instead, with a
warning comment citing this ADR.

### The SkyMesh module loads lazily, off the startup path

The one plan deviation with architectural weight. The plan specified a synchronous attach, but
a static `import` of the SkyMesh addon pulls in `three/webgpu`, and the solar provider is
statically reachable from the app entry through the bridge, so the entry chunk grew from 2.0MB
to 2.6MB and the deliberately lazy `three.webgpu` chunk (the dynamic import inside
`engine/renderer/create-renderer.ts`) disappeared. Plan-view users paid the whole node-material
system at startup, and the cold-start slowdown surfaced as a firefox flake in the
environment-panel journey.

`attachSkyEnvironment` therefore attaches the probe and zeroes the fill synchronously, and
loads the SkyMesh module through a cached dynamic import, joining the same lazy boundary the
renderer already maintains. Lighting updates that arrive before the mesh does are stashed on
the rig and replayed once it attaches; disposing the rig mid-load abandons the attach without
rejecting; a failed chunk load degrades to a warning and a skyless but still-lit scene. A
source-reading guard test keeps the static import from coming back. The provider contract is
unchanged: `apply` stays synchronous and fire-and-forgets the attach.

## Consequences

- Realistic mode renders a sky, so every scene-solar visual baseline changes. The canonical
  states regenerate on the CI runner (the `run:visual` label), which also generates the
  slice-1a and 1b baselines that were still pending.
- The bridge needed no change, verified by reading: `scene-lighting.tsx` hands providers the
  whole `EnvironmentLighting`, so the new fields ride along.
- The sky pops in one chunk-load after the 3D view mounts. In practice the renderer's own
  `three/webgpu` import resolves first, so the added latency is the small SkyMesh chunk.
- Specular image-based lighting, the PMREM cubemap, and `scene.environment` stay with #449.
  Ambient occlusion (#442) is the spine's next indirect-light step.
- `SH_COEFFICIENT_COUNT` (27) is the cross-layer contract: produced in core, carried on
  `EnvironmentLighting`, consumed by `probe.sh.fromArray` in the engine.

## References

- Issue #436 (scope) and epic #451; implementation plan
  `docs/plans/2026-07-03-realistic-lighting-sky-and-image-based-lighting.md`.
- Realistic-environmental-lighting spec
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).
- [[ADR-0144-solar-lighting-provider-and-sky]] (the staging this resolves).
- [[ADR-0147-per-mode-tone-mapping]] (AgX renders the sky's dynamic range).
- [[ADR-0146-environment-panel-and-session-contract]] (the dial that drives `cloudCover`).

## Update (2026-08-14): the environment map retires the light probe

The deferral this decision recorded has been taken up, and the answer changed one of its two
lighting choices. Issue #520 assigns `scene.environment`, and
[[ADR-0161-sky-specular-environment-map]] has the reasoning. Read that one for current behavior;
what follows is what it changes here.

`THREE.LightProbe` is gone from the engine. The sky's ambient is now carried by an
equirectangular radiance map that three filters through PMREM, and because that map supplies
diffuse irradiance as well as the specular reflection the probe could never provide, keeping the
probe beside it would have double counted the diffuse ambient. So the argument this ADR used to
retire the hemisphere fill applied once more, to the probe itself: fill, then probe, then map,
each replacing the last because all three model the sky's diffuse ambient.

What holds unchanged is most of this decision. The analytic dome and its order-2 projection in
`core/environment/` are untouched, `SH_COEFFICIENT_COUNT` is still the cross-layer contract, and
`skyAmbient` is still what the engine receives. The map is reconstructed from those same
twenty-seven coefficients rather than from a second sky derivation, which is what keeps the
specular environment and the diffuse ambient the same field and lets the color check keep working
through `colorCheckLighting` with no special case. The visible sky mesh, its lazy import, and the
frozen cloud uniforms are all as described above.

The fork this ADR settled is therefore better read as settled in both directions rather than
reversed: harmonics remained the right way to compute and carry the sky's ambient, and PMREM
became the right way to present it to the materials once there were materials with a specular
response to present it to.
