# Three-Dimensional Lighting and Color Temperature

**Date:** 2026-06-13
**Status:** Accepted (lighting slice of the three-dimensional preview track)
**Scope:** The lighting slice of the three-dimensional preview track. It gives the
live three-dimensional pane a color-temperature slider, warms or cools the scene
light from that slider, softens the sun's shadows, and lands the PaintMaterial stub
at the material seam. It builds against the conventions and seams pinned by the
track foundation (`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`),
in particular the lighting and color-temperature flow (foundation section 5.4), the
view-state ownership rule (foundation section 5.3), the material seam (foundation
section 5.2), and the render-backend portability constraint (foundation section
5.6). The decisions specific to this slice live in ADR-0065. Selection sync and the
accessibility proxy do not land here; they are the next slice.

This is foundation slice 6 (lighting) in the foundation spec's slice map, taken now
as the user-facing fifth slice. The four slices before it built a navigable lit
shell: extruded walls with junctions, per-room floor slabs and ceilings, opening
voids, and a camera that orbits and walks. The light those slices rendered under
was fixed pure white with no shadows. This slice lets the user set the light's
warmth and gives the sun a soft shadow, so the shell reads as a room at a time of
day rather than a flat model.

Like the camera slice before it, this slice is mostly view-layer glue plus a thin
pure core helper, so its testing shape leans on the visual harness for the parts a
render decides and on Node tests for the parts a processor decides. Section 7
describes that split in full.

---

## 1. Goal

After this slice, the live three-dimensional pane carries a color-temperature
control in the same toolbar as the navigation modes:

- **A color-temperature slider.** A labeled range control sets the scene's light
  warmth in kelvin, from 2700 (a warm incandescent) to 6500 (a cool overcast
  daylight). The value is announced to assistive technology as a kelvin reading.
- **Light that warms and cools with the slider.** Moving the slider retints the
  directional sun and the hemisphere fill toward the chosen temperature. The change
  is immediate and does not rebuild the shell geometry.
- **A soft sun shadow.** The directional sun casts a percentage-closer-filtered
  soft shadow, so walls and openings throw a believable shadow onto the floor
  rather than a hard-edged or absent one.
- **The PaintMaterial stub at the material seam.** The neutral material provider is
  replaced by a PaintMaterial provider that carries the light color through the
  material seam, so the later paint track is an additive swap rather than a rewrite.

The slice is deliberately additive against the existing baseline: at the default
6500 kelvin the light stays close to the white it was before, so the only visible
change at rest is the new soft shadow.

---

## 2. Where the color temperature lives

The color temperature is a per-view scene parameter, not a property of the project
model. The foundation fixes this (section 5.3 and 5.4): camera state and the
color-temperature value are per-view, owned in the view layer, and never enter the
project model or the undo history. Two people viewing the same plan can light it
differently, and changing the warmth is not an edit to undo.

So the value is React state held in the three-dimensional view component
(`WebGPUSceneView`), beside the navigation mode the camera slice already keeps
there. It is session state: it resets to the default when the view remounts and is
not persisted with autosave. The slider reads and writes that one piece of state.
Nothing downstream of the view layer knows where the number came from; the engine
sees only a light color and the material seam sees only a light color.

The slider itself is a labeled range input that lives in the existing
`SceneNavToolbar`, beside the orbit, walk, and reset controls, so the navigation
chrome stays in one place and the slider inherits the toolbar's keyboard reach. It
spans 2700 to 6500 kelvin and announces its value as a kelvin reading through
`aria-valuetext`, so a screen reader user hears "3000 kelvin" rather than a bare
number.

---

## 3. Turning kelvin into a light color

A kelvin value is not a color a renderer can use directly; it names a point on the
blackbody locus that has to be turned into a red, green, and blue triple. That
conversion is pure arithmetic with no rendering dependency, so it belongs in
`core/`, beside the color space math the codebase already keeps there
(`core/color/`). The new helper, `kelvinToLinearRgb`, takes a kelvin value and
returns a `LinearRgb`, the linear-light triple the rest of `core/color/` already
defines.

Three properties pin the helper:

- **It returns linear light.** The light color drives a physically-shaded
  renderer, which expects linear-light input, so the helper returns `LinearRgb`
  rather than gamma-encoded sRGB. The engine wraps the triple in a Three.js color in
  the linear working space; the conversion never reaches for a Three.js type itself,
  which would break the rule that `core/` does not import the renderer.
- **It keeps a constant brightness.** Warming the light should change its hue, not
  dim the room. The helper normalizes its output so the brightest channel is one at
  every temperature, so 2700 kelvin and 6500 kelvin light the scene to the same
  level and only their color differs.
- **It is clamped to the slider's range.** The helper clamps its input to the 2700
  to 6500 kelvin band the slider exposes, so an out-of-range value cannot produce a
  color outside the locus the approximation is fit for.

The approximation itself is a published blackbody-to-color fit, with its
coefficients documented in the source as a known fit rather than unexplained
numbers, in the same spirit as the sRGB and OKLab constants already in
`core/color/`. The exact fit is an implementation detail; what the rest of the
system relies on is the contract above. The endpoints and the monotone trend (more
blue as the temperature rises, more red and less blue as it falls) are pinned by
tests so a later change to the fit cannot silently invert the warmth.

---

## 4. Lighting: color and soft shadows

Lighting stays behind the `LightingProvider` seam the foundation set up (section
5.4), so a future solar-aware provider still swaps in at one place. The existing
`BasicLightingProvider` grows two capabilities, both additive.

**Color.** The sun and the hemisphere sky take the light color derived from the
current temperature. Because the slider can move often, the color is applied as an
update to the existing lights rather than by tearing down and rebuilding them: a
small engine routine sets the sun's color and the hemisphere's sky color from a
linear triple. The ground term of the hemisphere fill keeps a neutral bounce so the
fill reads as fill and does not wash the tint out of the shaded faces. This is the
fill tuning the foundation named (section 5.4).

**Soft shadows.** The directional sun casts a shadow, filtered with
percentage-closer soft filtering. The foundation constrains this (section 5.6): the
feature has to be one both the WebGPU backend and the eventual WebGL2 backend can
express, and a soft shadow map is exactly that, so no part of this slice reaches for
a compute-only capability. The sun's shadow camera is an orthographic frustum sized
from the scene bounds, the same bounds the camera framing already computes, so the
shadow covers the shell without wasting shadow-map resolution on empty space. A
shadow bias keeps the floor from shadowing itself into acne. The shell meshes are
marked as shadow casters and receivers in one pass over the built scene, so a wall
both throws a shadow and catches the shadow of the wall beside it.

The decision to put the visible warmth in the light rather than in the surface is
the load-bearing one, and it is recorded in ADR-0065. In a physically shaded
renderer a warm light reflecting off a neutral surface already reads as a warm
surface, so tinting the light is the faithful and cheap path, and it is the path the
paint track wants: once surfaces carry real paint colors, a warm light lighting them
shows what that paint looks like under that light, with no custom shader. Putting the
tint in both the light and the surface would apply it twice. The next section says
how the material seam still carries the light color without re-applying the tint.

---

## 5. The PaintMaterial stub

The foundation reserves the material seam for a color-temperature-responsive
PaintMaterial that replaces the neutral provider at one point (section 5.2). This
slice lands the stub of that provider so the swap is real now and the paint track is
additive later.

The stub is a `MaterialProvider` keyed by surface role, exactly like the neutral
provider it replaces, and it becomes the provider the live view builds its scene
with. It is constructed with the current light color and exposes it. Its surface
albedo stays the neutral gray the neutral provider used, because painting is a later
track and no surface carries a real color yet.

The stub deliberately does not tint its albedo with the light color. The visible
warmth comes from the lights (section 4), and tinting the albedo as well would
double it. What the stub does is carry the light color through the seam: the seam's
signature now passes a light color into the material layer, which is the shape the
paint track needs, and the stub holds it without acting on it. So the seam is the
real, widened seam from this slice forward, and the paint track adds surface colors
and the surface-under-light mixing on top of a seam that already delivers both
inputs. A test pins that the stub returns a role-named material per role and that it
carries the light color it was given, which is the whole of its contract.

---

## 6. Applying the light live, without rebuilding the shell

The shell geometry is expensive to build and the slider is cheap to drag, so moving
the slider must not rebuild the shell. The view already rebuilds the scene only when
the scoped scene graph changes (the wholesale rebuild the foundation's incremental
slice will later replace, section 5.5); the color temperature is not part of that
graph, so it must not feed the rebuild.

The slice separates the two. Building the framed scene stays geometry only, which
also keeps the lights out of the bounds the camera frames against. The lights move
into a small view-layer component, mounted in the canvas beside the camera-framing
component the previous slice added. That component applies the lighting provider to
the scene once, then updates the light color whenever the temperature changes. The
lights live on the render scene rather than on the rebuilt geometry group, so a
geometry rebuild does not discard them and a temperature change does not rebuild the
geometry. The shadow frustum tracks the scene bounds, so it re-sizes when the shell
changes but not when only the temperature changes.

The renderer itself turns shadows on once, at construction, in the single engine
place that builds the renderer: it enables the shadow map and selects the
percentage-closer soft filter. That is a render capability, not scene state, so it
belongs with the renderer rather than with the per-view parameter.

---

## 7. Testing

The slice splits the same way the camera slice did, between what a processor decides
and what a render decides.

**Pure core.** The kelvin-to-color helper is pure arithmetic and is tested in Node:
the warm endpoint is red-leaning, the cool endpoint is close to neutral, blue rises
monotonically with the temperature, the output is clamped to the slider's range, and
the brightest channel is normalized to one at every temperature.

**Engine, in Node.** The lighting color routine sets the sun and hemisphere-sky
colors from a linear triple. The provider configures the sun to cast a soft shadow
with a bounds-sized frustum. The shadow-marking pass flags the shell meshes as
casters and receivers. The PaintMaterial stub returns a role-named material per role
and carries the light color it was constructed with. These run without a graphics
context, against the built objects, the way the geometry slices test their builders.

**View-layer glue, proven by the visual harness.** The slider, the lighting
component, and the renderer's shadow-map switch run only under a real render, so they
stay coverage-excluded glue and are proven end to end rather than in jsdom, as the
foundation's testing strategy directs (foundation section 6.3).

**Visual tier.** The committed shell baseline refreshes to include the new soft
shadow at the default temperature. A second baseline at a warm temperature records
the tint, so the warmth is reviewed against a fixed image rather than eyeballed. An
end-to-end check drives the slider and confirms a warm frame and a cool frame differ,
the way the camera slice compares stable frames across a control.

---

## 8. Out of scope

- **Real paint colors and surface-under-light mixing.** This slice ships the
  PaintMaterial stub and the widened seam; the paint track fills in the surface
  colors and the mixing.
- **Solar position and a daylight model.** The sun direction stays the fixed angle
  the basic provider already uses; a solar-aware provider is a later high-priority
  phase, and it swaps in at the same seam.
- **Per-surface or per-room lighting overrides.** The temperature is one value for
  the whole view.
- **Named temperature presets.** The design specification mentions presets beside
  the slider (section 6.7), but the slice ships the plain slider, the same way the
  camera slice shipped navigation without its named view presets. Presets are a
  later, additive control over the same parameter.
- **A custom paint shader.** The design specification pictures the stub as a shader
  that responds to color temperature (phase-6 goal). This slice meets the same
  fidelity hook with a standard material under a tinted light, which is faithful for
  a neutral surface and is the path real paint colors take later; the custom shader
  is the paint track's, and ADR-0065 records the reconciliation.
- **Persisting the color temperature.** It is session state, like the camera, and
  resets on remount.
- **The WebGL2 backend wiring.** The slice stays within the feature set both
  backends express, but the backend itself is a post-alpha fast-follow.

---

## 9. References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 6.7
  (lighting in the MVP and the phase-8 seam, which names the 2700K to 6500K
  color-temperature slider) and section 6.8 (the paint preview, where the paint
  color is multiplied by the scene-light color temperature so the same paint shifts
  under warm and cool light). This slice realizes both hooks; ADR-0065 records that
  the multiply happens through the lights for the stub rather than in a custom paint
  shader, which the paint track adds later.
- Foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  section 5.2 (the material seam), section 5.3 (view-state ownership), section 5.4
  (lighting and color-temperature flow), section 5.6 (render-backend portability),
  and section 6 (the two-tier testing strategy).
- ADR-0065 (this slice's decisions): the tint lives in the light, the kelvin
  conversion is pure core, the PaintMaterial stub carries the light color without
  re-tinting, and the soft shadow stays within both backends' feature set.
- ADR-0064 (camera navigation): the view-layer glue and visual-tier testing shape
  this slice follows.
- ADR-0044 (track-based delivery; this track is the three-dimensional preview).
