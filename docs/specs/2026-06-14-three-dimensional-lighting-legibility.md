# Three-Dimensional Lighting Legibility

**Date:** 2026-06-14
**Status:** Accepted (three-dimensional preview and floor-management polish)
**Scope:** A legibility change to the three-dimensional preview lighting. The rig
keeps its one directional sun and one hemisphere fill, but rebalances them so that
two surfaces facing different directions read as different values. The geometry, the
paint, the camera, the selection layer, and the edge overlay are unchanged. The
slice builds on the lighting rig (ADR-0065) and the surface edges (ADR-0078), and
follows the conventions of the track foundation. The decisions specific to this
slice live in ADR-0079.

This continues the response to owner feedback on 2026-06-14: in the preview a wall
is hard to tell apart from an adjacent wall. The surface edges (ADR-0078) drew a
dark line wherever two surfaces meet, so a corner now reads as a crisp line. The
edges deliberately left the faces themselves alone. Inside an outline two adjacent
walls still carry nearly the same value, because the rig lit them almost equally.
This slice gives the faces their own separation by value, which is the half the
edges did not address.

---

## 1. Goal

After this slice, two walls that face different directions read as different values
under the default lighting, so the shell reads as a solid built form rather than a
flat card with lines on it. A face turned toward the sun is brighter than a face
turned away from it, and the floor and ceiling sit at their own values between them.
The painted shell keeps its colors legible, with the same separation showing as a
difference in brightness within one hue.

The change is render-only and confined to the lighting rig. There is no change to
the model, the persisted file format, the scene graph, the geometry, the paint, the
camera, the edge overlay, or the two-dimensional renderer.

## 2. Why the faces blend today

Two things flatten the faces:

- **The sun azimuth is symmetric.** The sun points along `(1, 2, 1)`. Its horizontal
  components are equal, so its azimuth bisects the two perpendicular exterior walls
  the three-quarter camera shows. Both walls face the sun at the same angle and so
  receive the same direct light. They cannot separate by value no matter how strong
  the sun is, because they are lit equally.
- **The fill equals the key.** The hemisphere fill and the directional sun both run
  at full intensity. A strong even fill lifts the shadowed faces up to the lit ones,
  so the difference a directional light would create is washed back out.

Edges cannot fix this, because the two faces meet only at the corner the edge already
draws; the spans on either side of the corner are the part that stays flat. Only the
lighting can separate them.

## 3. Design

### 3.1 An asymmetric, raised sun direction

The sun direction changes so its horizontal components differ, breaking the symmetry
that lit the two visible walls equally. It stays raised, with its vertical component
the largest, so it reads as a high daytime key that keeps the floor and the tops of
the walls well lit and casts a believable shadow. With an asymmetric azimuth, one of
the two perpendicular walls turns more toward the sun than the other, so the two
spans separate in value on their own.

### 3.2 A key-dominant ratio

The hemisphere fill drops below the directional sun, so the rig is key dominant: the
sun sets the value of the faces it reaches and the fill only keeps the faces it does
not reach from going black. The sun's intensity is held high enough that the lit
faces stay bright after the fill comes down, so the shell is no darker overall, only
more clearly shaded. The fill stays a hemisphere (sky above, dark ground below) so
the floor still reads as grounded.

### 3.3 The tint and shadow path are untouched

The color temperature still tints both lights in linear light (ADR-0065), so a warm
or cool setting reads as before, now over a shell with more shape to it. The shadow
fitter still positions the sun along its direction and sizes the shadow camera to the
scene bounds; it reads the same direction constant, so it follows the new azimuth
with no change.

## 4. Verification

- The rig is Node-tested for the two invariants this slice introduces, without a
  graphics processor: the directional sun's intensity is greater than the hemisphere
  fill's, so the rig is key dominant; and the sun direction is asymmetric in a way
  that lights two perpendicular vertical faces differently (the sun's horizontal
  projection onto one wall normal differs from its projection onto the perpendicular
  one). The existing rig tests (the lights are present, the sun casts a shadow, the
  tint reaches both lights, a re-apply does not stack them, the shadow frustum covers
  the bounds) stay green.
- The pixel-approximate scene-webgl baselines (neutral, warm, painted) are refreshed
  and reviewed by eye to confirm the two visible walls now read as different values
  while the paint colors stay legible.

## 5. Out of scope and deferred

- Tone mapping or an exposure control. The faces here are flat because they are lit
  equally, not because they clip to white, so the rebalance is the fix; a tone-mapping
  pass that rolls off highlights is a separate later refinement that would touch how
  every color renders and is best decided with the paint work.
- A second fill or a three-point studio rig. One directional sun and one hemisphere
  fill stay the rig; the slice only rebalances them.
- A user control for the sun angle, the time of day, or the fill strength. The rig
  stays fixed; a solar-aware or user-adjustable rig is a later addition behind the
  same lighting seam.
- Any geometry, paint, camera, or edge change. Those layers are untouched; the
  separation by value comes from the lighting alone.

## 6. References

- ADR-0079: the decisions specific to this slice.
- ADR-0065: the lighting rig and the tint-in-light color-temperature path this slice
  rebalances.
- ADR-0078: the surface edges this slice complements; edges separate surfaces where
  they meet, the lighting separates faces by orientation.
- ADR-0061: the wall shell and the neutral material the lighting falls on.
