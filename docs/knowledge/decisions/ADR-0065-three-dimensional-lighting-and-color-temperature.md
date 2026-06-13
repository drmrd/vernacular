---
slug: decisions/ADR-0065-three-dimensional-lighting-and-color-temperature
title: 'ADR-0065: Lighting and color temperature for the three-dimensional preview: tint the light, not the surface'
type: decision
tags:
  [
    architecture,
    rendering,
    three-d-preview,
    lighting,
    color-temperature,
    kelvin,
    soft-shadows,
    pcf,
    paint-material,
    material-seam,
    view-state,
    per-view,
    bridge,
    engine,
    core,
    color,
    react-three-fiber,
    testing,
    visual-tier,
    playwright,
  ]
related:
  [
    decisions/ADR-0064-three-dimensional-camera-navigation,
    decisions/ADR-0063-three-dimensional-opening-voids,
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0034-future-direction-seams,
    decisions/ADR-0004-three-js-r3f-webgpu,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-three-dimensional-lighting-color-temperature.md,
    docs/plans/2026-06-13-three-dimensional-lighting-color-temperature.md,
    core/color/color-temperature.ts,
    engine/lighting/basic-lighting-provider.ts,
    engine/lighting/light-color.ts,
    engine/materials/paint-material-provider.ts,
    engine/scene/shadow-casters.ts,
    engine/renderer/create-renderer.ts,
    bridge/react/scene-lighting.tsx,
    bridge/react/scene-nav-toolbar.tsx,
    bridge/react/webgpu-scene-view.tsx,
    bridge/react/framed-scene.ts,
    e2e/tests/scene-color-temperature.spec.ts,
  ]
status: current
updated: 2026-06-13
---

# ADR-0065: Lighting and color temperature for the three-dimensional preview: tint the light, not the surface

## Status

Accepted. This is the lighting slice of the three-dimensional preview track
([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]), foundation slice 6,
taken as the user-facing fifth slice. It sits on the navigable lit shell built by
the four slices before it: the wall shell
([[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]), the floor
slabs and ceilings ([[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]), the
opening voids ([[ADR-0063-three-dimensional-opening-voids]]), and camera navigation
([[ADR-0064-three-dimensional-camera-navigation]]). The slice specification
(`docs/specs/2026-06-13-three-dimensional-lighting-color-temperature.md`) and the
track foundation spec are authoritative for scope; this record captures the
decision that shapes the data flow.

## Context

The shell so far renders under a fixed pure-white light with no shadows. The design
specification asks for a color-temperature slider on the three-dimensional view that
warms and cools the light (section 6.7), and for a paint material whose color is
multiplied by the scene light's color temperature so the same paint shifts under
warm and cool light (section 6.8). The foundation pinned the seams: the color
temperature is a per-view scene parameter in kelvin owned in the view layer, flowing
to both the scene light color and the paint material (section 5.4); lighting stays
behind the `LightingProvider` interface (section 5.4); the material seam keyed by
surface role is the swap point for a color-temperature-responsive PaintMaterial
(section 5.2); and any shadow feature has to be one both the WebGPU and the eventual
WebGL2 backend express (section 5.6).

The load-bearing question is where the warmth becomes visible. The foundation says
the temperature flows to both the light and the material. For a single surface under
a single light, a tint applied in the light color and the same tint applied in the
surface albedo render the same image, so applying it in both places tints twice. The
slice has to choose one place for the visible effect and define what the other input
is for.

## Decision

### The visible warmth lives in the light

The color temperature tints the lights. The directional sun and the hemisphere sky
take a color derived from the current kelvin value, and the neutral surface albedo
is left alone. This is the physically faithful path: in a physically shaded renderer
a warm light reflecting off a neutral surface already reads as a warm surface, so
the renderer's own lighting does the multiply the design specification describes
(section 6.8), with no custom shader. It is also the forward path for the paint
track. Once surfaces carry real paint colors, a warm light lighting them shows what
that paint looks like under that light, which is exactly the preview the paint track
wants, and it falls out of the same mechanism rather than needing a second one.

### The kelvin-to-color conversion is pure and lives in core

Turning a kelvin value into a red, green, and blue triple is arithmetic with no
rendering dependency, so it lives in `core/color/` beside the sRGB and OKLab math
the codebase already keeps there, as `kelvinToLinearRgb(kelvin): LinearRgb`. It
returns linear light, because the light color drives a physically shaded renderer
that expects linear input; it normalizes its output so the brightest channel is one
at every temperature, so warming the light changes its hue without dimming the room;
and it clamps to the slider's 2700-to-6500-kelvin band. The engine wraps the triple
in a Three.js color in the linear working space, so `core/` never imports the
renderer, keeping rules.md rule 1. The endpoints and the monotone trend are pinned
by Node tests, so a later change to the underlying fit cannot silently invert the
warmth.

### The PaintMaterial stub carries the light color through the seam without re-tinting

The neutral material provider is replaced at the material seam by a PaintMaterial
provider that becomes the live view's default. It is keyed by surface role like the
provider it replaces, its albedo stays the neutral gray (painting is a later track,
so no surface has a real color yet), and it is constructed with the current light
color and exposes it. It deliberately does not tint its albedo with that light
color, because the lights already deliver the visible warmth and tinting the albedo
as well would double it. What the stub does is widen the seam: from this slice
forward the material layer receives a light color, which is the shape the paint track
needs, and the stub holds it without acting on it. So the paint track adds surface
colors and the surface-under-light mixing on a seam that already delivers both
inputs, rather than changing the seam.

This reconciles the design specification's picture of the stub as a custom shader
that responds to color temperature (phase-6 goal) with a standard material under a
tinted light. The fidelity hook the specification asks for (the same paint shifting
under warm and cool light) is met; the custom shader that does its own surface mixing
is the paint track's, against a seam this slice has already widened. This is the
reconciliation [[ADR-0034-future-direction-seams]] anticipated for the scene-side
material descriptors.

### Soft shadows stay within both backends' feature set

The directional sun casts a shadow filtered with percentage-closer soft filtering, a
soft shadow map both the WebGPU backend and the eventual WebGL2 backend express, so
nothing here reaches for a compute-only capability (foundation section 5.6). The
sun's shadow camera is an orthographic frustum sized from the same scene bounds the
camera framing computes, so the shadow covers the shell without wasting resolution; a
shadow bias keeps the floor from self-shadowing into acne; and the shell meshes are
flagged as casters and receivers in one pass over the built scene. The renderer turns
the shadow map on once at construction, in the single engine place that builds the
renderer, because that is a render capability rather than scene state.

### The slider updates the light live, off the geometry rebuild path

The color temperature is per-view session state held in the view component beside the
navigation state, never in the model and never in undo (foundation section 5.3),
resolving the foundation's open question on persistence as session-only, consistent
with [[ADR-0064-three-dimensional-camera-navigation]]. Because the slider moves
often and the shell is expensive to build, the temperature is kept off the rebuild
path. Building the framed scene stays geometry only, which also keeps the lights out
of the bounds the camera frames against. The lights move into a small view-layer
component mounted in the canvas beside the camera-framing component, which applies the
provider once and updates the light color when the temperature changes. The lights
live on the render scene rather than on the rebuilt geometry group, so a geometry
rebuild does not discard them and a temperature change does not rebuild the geometry.

### Testing splits along the glue boundary

The kelvin-to-color helper is pure core, tested in Node for its endpoints,
monotonicity, clamping, and peak normalization. The engine routines are tested
against built objects without a graphics context: the light-color update sets the sun
and hemisphere-sky colors, the provider configures the sun to cast a soft shadow with
a bounds-sized frustum, the shadow-marking pass flags the shell meshes, and the
PaintMaterial stub returns a role-named material per role and carries its light color.
The slider, the lighting component, and the renderer's shadow-map switch run only
under a real render, so they stay coverage-excluded glue (foundation section 6.3) and
are proven end to end. The committed shell baseline refreshes to include the soft
shadow at the default temperature, a second baseline records a warm temperature, and
a semantic end-to-end check confirms a warm frame and a cool frame differ, the way the
camera slice compares frames across a control.

## Consequences

- The live three-dimensional pane carries a color-temperature slider; moving it warms
  or cools the sun and fill immediately, without rebuilding the shell.
- The visible warmth comes from the light, so the renderer's own lighting performs the
  color-temperature multiply, and real paint colors later read correctly under the
  tinted light with no second mechanism.
- The kelvin-to-color conversion is pure core, deterministic, and unit-tested; the
  engine wraps it into a Three.js color, so `core/` stays free of the renderer.
- The PaintMaterial stub replaces the neutral provider at the material seam and widens
  it to carry a light color, so the paint track is an additive swap.
- The sun casts a percentage-closer soft shadow within a feature set both backends
  express; the shell baseline gains the shadow at the default temperature.
- The color temperature is per-view session state, off the model and off undo and not
  persisted, so a reload opens at the default temperature.
- No scene-graph field, no file-format change, and no migration: the slice adds a
  view-layer parameter, a pure core helper, and engine lighting and material behavior.

## Alternatives considered

- **Tint the surface albedo and keep the light white.** Rejected: it is the most
  literal reading of "the PaintMaterial responds to color temperature" and is trivial
  to unit-test, but it deviates from the foundation's rule that the temperature flows
  to the scene light color (section 5.4), and the shadows and speculars would not read
  warm. Tinting the light is faithful and is the path real paint colors take.
- **Tint both the light and the surface with a split contribution.** Rejected: it is
  the most literal reading of "flows to both," but it couples two layers and needs a
  split tuned so the product stays single strength, which is fiddly to keep correct and
  to test deterministically. Not worth it for a stub.
- **Bake the temperature into the scene build.** Rejected: it would rebuild the whole
  shell on every slider tick, which the foundation's full-rebuild-on-change approach
  (section 5.5) makes expensive, and it would put the lights back into the bounds the
  camera frames against. Updating the light live, off the rebuild path, keeps the
  slider responsive.
- **Hand-author the lights as React-Three elements in the bridge.** Rejected: lighting
  stays behind the `LightingProvider` seam in engine (foundation section 5.4) so a
  future solar-aware provider swaps in at one place; the bridge component drives the
  engine provider rather than replacing it.
- **Ship the custom paint shader now.** Rejected: the surface-under-light mixing and
  real paint colors are the paint track's, out of scope here (foundation section 8).
  This slice meets the fidelity hook with a tinted light and widens the seam so the
  shader is additive.
- **Ship named temperature presets with the slider.** Deferred: the design
  specification mentions presets (section 6.7), but this slice ships the plain slider,
  the way the camera slice shipped navigation without its view presets. Presets are an
  additive control over the same parameter.

## References

- Slice specification `docs/specs/2026-06-13-three-dimensional-lighting-color-temperature.md`.
- Implementation plan `docs/plans/2026-06-13-three-dimensional-lighting-color-temperature.md`.
- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 6.7
  (lighting in the MVP and the phase-8 seam, naming the color-temperature slider) and
  section 6.8 (the paint preview multiplied by the scene-light color temperature).
- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  sections 5.2 (the material seam), 5.3 (view-state ownership), 5.4 (lighting and
  color-temperature flow), 5.6 (render-backend portability), and 6 (the two-tier
  testing strategy).
- [[ADR-0064-three-dimensional-camera-navigation]]: the per-view session-state shape
  and the visual-tier testing this slice follows.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the material
  seam and the engine-only-`three` boundary this slice keeps.
- [[ADR-0034-future-direction-seams]]: the scene-side material reconciliation this
  slice realizes for color temperature.
- [[ADR-0004-three-js-r3f-webgpu]]: the renderer stack the shadow map is enabled on.
