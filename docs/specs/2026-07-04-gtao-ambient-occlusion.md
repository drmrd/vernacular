# Ambient occlusion for realistic interiors (slice specification)

> Status: draft for review. Date: 2026-07-04. Author: Dan Moore.
> Relationship to the epic: the next indirect-light step on the realistic-environmental-lighting
> spine (`docs/specs/2026-07-01-realistic-environmental-lighting.md`), after the visible sky and
> the spherical-harmonics light probe (ADR-0148). Closes issue #442.

## Mission

Realistic mode now lights interiors from a sky probe and a solar sun, but the ambient term
reaches every surface evenly. Corners, the seams where walls meet the floor, and the space under
a cabinet receive the same sky fill as an open wall, so a room reads as lit geometry rather than a
room. Contact darkening is the cue that separates the two. This slice adds a screen-space ambient
occlusion pass to the realistic render path so ambient light falls off where geometry occludes it.

Occlusion is the raster answer to the epic's standing risk that bounced daylight dominates
perceived interior color. The sky probe (#436) sets where ambient light comes from; occlusion sets
where it does not reach. The physically based materials slice (#449 / spine slice 3) gates its
color-accuracy acceptance on an indirectly lit interior surface, so this lands before or alongside
that slice.

## Scope

In scope:

- A ground-truth ambient-occlusion pass on the realistic render path, on by default whenever the
  effective lighting mode is realistic.
- Live-view and render-harness wiring so the pass shows in both the interactive preview and the
  committed visual baseline.
- One canonical harness state that pins an occluded interior, plus a regeneration of the four
  existing solar baselines, which now carry the AO term.
- A frame-time check on the development Mac's Metal tier so the pass fits the performance budget.

Out of scope:

- Schematic mode. Its rig is balanced for legibility, not physical accuracy (ADR-0079), and
  contact darkening there reads as visual noise. Schematic keeps its current render path untouched.
- Screen-space global illumination (`SSGINode`). It is expensive and prone to light leaking, and
  the epic reserves it for a separate high-quality toggle if it ever lands.
- Any migration for the three.js r185 or r186 ambient-occlusion changes. This slice tunes against
  the pinned r184 model; see the tuning caveat below.

## The r184 rendering path

Vernacular's renderer is always a `WebGPURenderer` instance, even when it runs its own WebGL 2
fallback backend (`engine/renderer/create-renderer.ts`). That decides which occlusion path is
available.

The classic `EffectComposer` post-processing stack, including `GTAOPass`, only works with the
legacy `WebGLRenderer`; its own module documentation says so, and it imports from the plain `three`
entry rather than `three/webgpu`. It is not an option here regardless of backend.

The node-based `GTAONode` (the TSL ground-truth ambient-occlusion node,
`three/addons/tsl/display/GTAONode.js`) is the path that fits. It is built from ordinary
fragment-shader-style TSL primitives with no compute-shader or storage-buffer calls, so three's
node builders compile the same graph to WGSL for the WebGPU backend or to GLSL for the WebGL 2
backend. It runs through `RenderPipeline`, the modern post-processing entry that replaced the
older `PostProcessing` name in r183 and that carries an automatic WebGL 2 fallback. The intended
wiring reads the scene color, depth, and (optionally) normals from a `pass(scene, camera)`, feeds
`ao(depthNode, normalNode, camera)`, and composes the occlusion term into the pipeline's output
node.

## Where the pass attaches

A `RenderPipeline` needs a scene and a camera at construction, and neither exists at the point
`createSceneRenderer` runs, since that function receives only a canvas. The pipeline cannot live in
`create-renderer.ts`. It is assembled downstream once React Three Fiber has mounted the scene and
camera.

The pass touches the renderer at two seams, one per canvas.

**Live view.** `LiveSceneCanvas` (`bridge/react/webgpu-scene-view.tsx`) runs `frameloop="always"`,
so React Three Fiber calls `gl.render(scene, camera)` every frame. To interpose the pipeline, a
`useFrame(callback, renderPriority)` with a nonzero priority disables the automatic render for that
canvas and takes responsibility for drawing the frame. When AO is active the callback calls the
pipeline's `render()`; when AO is off it falls back to `gl.render(scene, camera)`, so schematic mode
and a realistic request without a site location keep the exact render path they have today.

**Harness.** `StaticFrame` (`bridge/react/scene-harness-view.tsx`) runs `frameloop="never"` and
draws the frame itself, once on mount and once when the lighting reports ready (ADR-0149). Both of
those `gl.render(scene, camera)` calls route through the same render function the live view uses, so
the AO pass shows in the captured baseline when it is active and the harness behaves as before when
it is not.

Both canvases render through one shared render function so the takeover logic has a single owner.
The pipeline itself is Three.js and lives in the engine layer: a factory in a new
`engine/postprocessing/` module builds the `RenderPipeline` from a renderer, scene, and camera and
returns the pipeline plus its render, resize, and dispose handles. A bridge hook owns the React
lifecycle around it: it builds the pipeline when AO turns on, resizes it when the canvas resizes,
disposes it when AO turns off or the canvas unmounts, and hands both canvases the render function.
The engine stays the only Three.js importer and the bridge stays the only layer that knows about
both React and the engine, the same split the color-temperature and lighting wiring already follow.

The `RenderPipeline` addon pulls in `three/webgpu`, which the renderer keeps behind a lazy dynamic
import so the WebGPU build stays out of the entry chunk (ADR-0148 records what a static import cost
the startup bundle). The AO module loads its pipeline dependencies through the same lazy boundary,
and a source-reading guard test keeps a static import from creeping back in.

Tone mapping needs care at this seam. `RenderPipeline` applies the renderer's tone-mapping operator
and color-space conversion when it owns the final output node. Realistic mode renders through AgX
and the color check forces Neutral (ADR-0147), so the pipeline's output node has to carry the same
operator the mode selects. The integration routes tone mapping through the pipeline's output rather
than assuming the renderer's own `toneMapping` still applies after the pass takes over the draw.

## Backend-parity posture

The harness sets `forceWebGL: true` on purpose, so every committed baseline is a WebGL 2 render that
never collides with a future WebGPU baseline. That decision has a consequence for this slice: every
AO baseline the project commits exercises only the WebGL 2 backend of `GTAONode`. The WebGPU backend
path, which the live view selects whenever the browser exposes `navigator.gpu`, has no committed
pixel coverage today, and there is no live-view visual-regression spec at all.

Backend divergence in this area is a real category, not a hypothetical. Three.js issue #30567,
"Clear of MRT render targets executed differently in WebGL and WebGPU backend," reproduced by
toggling `forceWebGL`, and it was fixed at r174. That predates the pinned r184 and does not prove a
live bug, but it does say that multiple-render-target behavior has diverged between the two backends
under exactly the flag the harness pins, and that three has shipped and fixed such a bug before.

Two choices follow from that precedent.

First, the first slice reconstructs surface normals from the depth buffer rather than reading them
from a second render target. `GTAONode` reconstructs normals from depth when no normal node is
supplied, at some quality cost. Avoiding the multiple-render-target output keeps the pass clear of
the r174 divergence category entirely, which is the cheapest way to reduce backend-parity risk on a
path that CI cannot check. Normal-from-a-dedicated-target, for higher AO quality, is a later
refinement once the depth-only path is proven on both backends.

Second, the slice accepts WebGL 2 as the only baselined backend, matching the harness's existing
design and the scene-tier convention in ADR-0149, and covers the WebGPU path with a manual spot
check on the development Mac before shipping rather than a new automated spec. A first live-view
visual-regression spec is worth its own issue, and this slice files one rather than growing that
scope here. Both of these are owner decisions, restated under open questions.

## Tuning parameters and defaults

`GTAONode` in r184 exposes five tuning uniforms: `radius`, `scale`, `thickness`, `distanceExponent`,
and `distanceFallOff`, plus a sample count. Proposed defaults for the first slice, to validate on
the Metal tier:

- `radius`: the world-space reach of the occlusion sampling. Start near the addon's r184 default and
  tune against the harness interior so contact darkening reads at wall-floor seams without haloing
  open walls.
- `scale`: the strength of the occlusion term. Start at the addon default.
- `thickness`, `distanceExponent`, `distanceFallOff`: keep the addon's r184 defaults, named as
  constants, so the distance model is stated in code rather than inherited silently.
- sample count: start at the addon default (16) and lower it only if the frame-time check demands it.

All defaults are named engine constants, so the tuned surface reads in one place and a later change
is a single edit.

The r184-specific caveat is load-bearing. The `GTAONode` tuning surface moved in three consecutive
three.js revisions around the pin point. r185 makes the occlusion physically darker and wider and
advises lowering `radius` and `scale` to compensate, and it changes the render-target format so the
occlusion term lands in the red channel only, which changes the blend. r186 deprecates
`distanceExponent` and `distanceFallOff` to no-ops. Vernacular's pinned r184 has the older distance
model and live `distanceExponent` and `distanceFallOff` uniforms. Any values tuned here hold for
r184 only. The next three.js bump that clears the 30-day cooldown will force a re-tune and a
re-baseline of the AO states, independent of any Vernacular-side change. This slice does not carry
that migration; it belongs to whichever change lands the three.js bump.

## Blend model

The simplest wiring, which `GTAONode`'s own example uses, multiplies the whole rendered color by
the occlusion term. That darkens direct and indirect light alike, where physical ambient occlusion
should dim only the indirect, ambient contribution. In realistic mode the indirect term comes from
the light probe (ADR-0148), so a physically cleaner split would apply occlusion only to the probe's
contribution, which needs a second render-target channel separating direct from indirect shading.

The first slice takes the whole-frame multiply. It matches the addon's documented usage, it avoids
the multiple-render-target output the backend-parity posture above steers away from, and the
interiors this feature targets sit in shadow where the ambient term already dominates, so the
visible error is small. The indirect-only split is a later refinement, flagged as an open question.

## Performance budget

The design specification's 6.10 budget holds: interactive at sixty frames per second on integrated
graphics. Issue #442 asks to confirm the budget and to pick resolution and denoise settings
accordingly. No measurement exists yet, since the feature is not built.

The live view is where the cost lands, because it renders every frame; the harness draws one frame,
so its cost does not affect the budget. `GTAONode`'s default is a full-resolution horizon-based
multi-slice pass at 16 samples, which is markedly more expensive than the older screen-space
approaches it supersedes. The first slice measures live-view frame time on the development Mac's
Metal tier with AO off and on, at the canonical interior. If the full-resolution default misses the
budget, the fallbacks in order are a lower sample count, then a half-resolution AO buffer with an
upsample, then a tighter `radius`. The chosen settings are recorded with the slice so a later
three.js bump re-tunes from a stated starting point rather than from scratch.

## The deterministic harness AO state

The harness pins occlusion with a canonical state that renders an interior with the geometry that
shows contact darkening: the wall-floor seams of the room shell and the base and sides of a placed
furniture massing. The existing named states render the shell alone, whose corners show AO but whose
open box understates it, so the AO state selects the furniture fixture under a fixed realistic sun.
This needs one small harness addition: a named environment state that also selects a geometry
fixture, so the App can forward both a realistic environment and the furniture geometry to
`SceneHarnessView`, which already accepts the two as independent props.

The canonical AO state uses the same fixed site and observation instant the solar baselines use
(40 north, 75 west, Eastern time, equinox civil noon), so the sun is the one the core solar
reference cases already pin and the AO term is the only new variable. Its baseline shows darkening
concentrated at the wall-floor junctions and around the furniture base, fading to the unoccluded
ambient on open wall. The four existing solar baselines (`equinox-noon`, `winter-afternoon`,
`color-check`, `overcast-noon`) regenerate, since realistic mode now carries the AO term. The five
schematic `scene-visual-regression` baselines must not move, and that is verified by running them
without an update before any baseline is refreshed.

Following ADR-0149, all of these baselines regenerate on the development Mac with
`--project=scene-webgl --update-snapshots=all`. CI neither renders nor checks the scene tier, so no
automated gate catches an AO regression today; the owner's review of the regenerated baselines is
the acceptance.

## Product rationale

The audience is old-house renovators deciding what a room will look like. Interior realism is not
decoration for them, it is whether the preview can be trusted for a decorating decision, which is
the epic's headline acceptance criterion. Flat ambient makes a corner and an open wall read the same
brightness, which flattens the sense of depth and of where light falls, and it biases perceived
paint color, since a paint in a shadowed corner reads different from the same paint on an open wall.
Contact darkening restores that depth cue and gives the physically based materials slice an
indirectly lit surface to gate its color accuracy against.

The pass is achromatic, so it darkens without shifting hue. That matters for the color check, whose
whole purpose is an unskewed read of a paint under a neutral reference. Whether the color check
should suppress AO entirely, to read a swatch on a perfectly flat field, or keep it, since a real
wall has corners, is an open question below.

## Open questions for the owner

1. **AO under the color check.** Default proposed: keep AO on in realistic mode even under the color
   check, since it is achromatic and the swatch is read on open wall away from corners. Alternative:
   suppress AO under the color check for a perfectly flat reference read. This decides whether the
   `color-check` baseline changes.
2. **Blend model.** Default proposed: the whole-frame multiply for the first slice, matching the
   addon's own usage. The physically cleaner indirect-only split, applying occlusion only to the
   light probe's contribution, is deferred and needs a second render-target channel. Accept the
   simpler blend now?
3. **Normal source and backend parity.** Default proposed: reconstruct normals from depth for the
   first slice, which avoids the multiple-render-target output that diverged between backends before
   r174, at some AO quality cost. Alternative: read normals from a dedicated target for higher
   quality and accept the parity risk on a path CI cannot check. Which quality-versus-risk balance?
4. **User-facing control.** Default proposed: AO is an internal always-on constant within realistic
   mode, so this slice touches only the engine and bridge and leaves the Environment panel and the
   `EnvironmentState` contract alone. Alternative: expose a toggle or an intensity slider in the
   panel. Ship without a control first?
5. **WebGPU-backend coverage.** Default proposed: accept WebGL 2 as the only baselined backend, spot
   check the WebGPU path manually on the development Mac before shipping, and file a separate issue
   for a first live-view visual-regression spec. Alternative: invest in that live-view spec now.
6. **Baseline and re-tune cost.** This slice regenerates four solar baselines and adds one AO state,
   all on the manual dev-Mac workflow, and the next three.js bump inside the cooldown will force a
   second re-baseline and a re-tune, since the r184 tuning surface is superseded in r185 and r186.
   Confirm this cost is acceptable before the slice starts.

## References

- Issue #442 (scope) and the realistic-environmental-lighting epic
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).
- ADR-0142 (color-managed renderer), ADR-0147 (per-mode tone mapping), ADR-0148 (visible sky and
  spherical-harmonics probe), ADR-0149 (harness lighting readiness and where scene baselines render).
- `engine/renderer/create-renderer.ts`, `bridge/react/webgpu-scene-view.tsx`,
  `bridge/react/scene-harness-view.tsx`, `bridge/react/scene-lighting.tsx`,
  `app/harness-environment.ts`, `e2e/tests/scene-solar.spec.ts`.
- Three.js r184: `three/addons/tsl/display/GTAONode.js`, `RenderPipeline` and the `pass`, `mrt`,
  `output` helpers in `three/tsl`; three.js issue #30567 (multiple-render-target clear divergence,
  fixed r174) and the r182-to-r186 migration notes for `GTAONode` and `RenderPipeline`.
