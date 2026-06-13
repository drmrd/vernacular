# Three-Dimensional Painted Preview

**Date:** 2026-06-13
**Status:** Accepted (painted-preview slice of the paint track, converging on the three-dimensional preview)
**Scope:** Renders assigned surface paint on the three-dimensional shell. It replaces
the neutral albedo of the PaintMaterial stub (ADR-0065) with the real paint color of
each surface, read from the project paint store the two-dimensional Paint panel
already writes. It widens the material seam from a surface role to a surface
identity, the additive change the foundation reserved (foundation 5.2). The decisions
specific to this slice live in ADR-0067. It builds on the lit, navigable, selectable
shell (ADR-0061 through ADR-0066).

The shell renders every surface in one neutral gray. The paint model already exists:
the Paint panel assigns a `SurfaceTreatment` (a solid color) to a `SurfaceRef` (a wall
face, a floor, or a ceiling), keyed in `project.paint`, and the two-dimensional plan
already shows it (`resolveSurfacePaint`). The `SurfaceRef` documentation anticipates
this slice: "When the three-dimensional track adds surface nodes, they carry this same
SurfaceRef so the painted preview reads the paint store." This slice does exactly that.

It ships in two parts so each lands verifiable:

- **7a (floor and ceiling paint):** widen the seam, thread the paint store into the
  build, resolve the floor and ceiling colors. These surfaces map to a `SurfaceRef`
  unambiguously, so 7a establishes the whole mechanism without the wall-face mapping.
- **7b (wall-face paint):** map each wall's two long faces to the `wall-face` left and
  right sides and paint them.

---

## 1. Goal

After this slice, a surface painted in the two-dimensional Paint panel shows its color
in the three-dimensional view: a painted floor reads as that color underfoot, a
painted wall face as that color on the wall, lit by the current color-temperature
light (slice 5), so the preview answers "what does this paint look like in this room
under this light." An unpainted surface keeps the neutral gray. Paint changes show
without reloading, because the view reads the same paint store the plan does.

---

## 2. The material seam widens from role to surface identity

The material provider is keyed by surface role today (`material(role): Material`),
which is enough for the neutral material because every wall face looks the same
(foundation 5.2). Per-surface paint needs a surface identity, not just a role: one
wall face can be a different color from the next. The foundation reserved this as an
additive widening of the provider signature, and this slice makes it.

The seam becomes `material(role: SurfaceRole, ref?: SurfaceRef): Material`: the role
it already carried, plus an optional surface identity (a `SurfaceRef` from the paint
model). Making the identity an optional second argument keeps the widening additive at
the call sites too: every existing `material(role)` call still compiles and renders
neutral, and only a paintable surface passes a `ref`. The role still drives the neutral
appearance and the per-face material groups; the `ref`, when present, is the identity
the paint provider resolves a color for. A surface with no `ref` (a wall reveal, a slab
underside) stays neutral, because the paint model has no reference for it.

- **The neutral provider** ignores the `ref` and keeps its role-keyed cache, so the
  unpainted look and the harness baselines are unchanged.
- **The paint provider** is constructed with the project paint store. For a surface
  with a `ref` whose paint store entry exists, it builds a material whose albedo is the
  paint color; otherwise it falls back to the neutral albedo for the role. The albedo
  is the surface's own color; the lights still carry the color temperature (slice 5,
  ADR-0065), so the painted surface is shown under the chosen illuminant rather than
  tinted twice.

The paint color is the core `Color` carried on the `SurfaceTreatment`; the engine
sets the Three.js material color from its sRGB hex, which the renderer manages into
its working color space.

---

## 3. The builders tag each surface with its reference

The geometry builders already split each mesh into material groups by role. This
slice has them pass a `PaintedSurface` (role plus the surface's `SurfaceRef`) instead
of a bare role, so the provider can resolve paint per surface:

- **Floor slab top (7a):** the room's floor surface, `{ kind: 'floor', floorId }`.
- **Ceiling (7a):** `{ kind: 'ceiling', floorId }`.
- **Wall long faces (7b):** each wall's two faces, `{ kind: 'wall-face', wallId, side }`,
  where `side` is `left` or `right` as the paint model defines them relative to the
  wall's direction. The builder maps its two long faces (the interior and exterior
  faces of the extruded wall) to those two sides by a fixed convention that matches the
  two-dimensional Paint panel, so painting "side A" in the plan paints the same
  physical face in three dimensions. Reveals, slab undersides, tops, and bases keep no
  reference and stay neutral.

The `floorId` is the room's `floorId`; the `wallId` is the wall's model id (the scene
node id with its prefix stripped, as the opening host resolution already does).

---

## 4. Threading the paint store into the build

Paint lives on the project model (`project.paint`), not the scene graph, so it is
passed alongside the graph rather than folded into it. `buildScene` already accepts a
material provider; the live view constructs the paint provider with the current paint
store and passes it. `buildFramedScene` gains the paint store as an argument and
constructs the paint provider from it (defaulting to no paint, which renders neutral,
so the harness and existing callers are unaffected unless they pass paint).

The view reads the paint store reactively: a small bridge hook subscribes to the
editor session and returns `project.paint`, so a paint dispatch (which replaces the
paint record) rebuilds the scene with the new colors, the same way an edit to the plan
already rebuilds it. The wholesale rebuild on change is the temporary approach the
incremental-update slice replaces (foundation 5.5); painting is a project change like
any other until then.

---

## 5. Testing

- **Engine, in Node.** The paint provider returns a material whose color is the paint
  color for a surface whose `ref` is painted, and the neutral albedo for an unpainted
  or reference-less surface. The builders tag their material groups with the expected
  `SurfaceRef` (the floor top with a floor ref, the ceiling with a ceiling ref, each
  wall face with its `wall-face` side ref). The neutral provider is unchanged.
- **Visual tier.** A painted-shell baseline: the harness fixture is given a paint store
  (a painted floor and a painted wall face), and the committed baseline shows those
  colors, reviewed by eye. The default (unpainted) baseline is unchanged.
- **Glue.** Threading the reactive paint store into the live view is coverage-excluded
  glue, proven by the visual tier and the existing live-view checks.

---

## 6. Out of scope

- **Finishes and sheen.** The `SurfaceTreatment` carries a `finishId`; this slice
  renders the solid color. Physically based finish (matte, gloss) is a later fidelity
  phase.
- **Non-solid treatments.** `tiled-image` and `pattern` treatment variants (ADR-0056)
  are not built; the discriminated `kind` is their seam.
- **Region sub-faces.** The `SurfaceRef` `region` seam (a face painted in parts) is not
  realized; this slice paints whole faces.
- **Painting from the three-dimensional view.** Selecting a surface to paint in three
  dimensions is selection-track work; this slice renders the paint the plan assigns.

---

## 7. References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 6.8 (the
  paint material that multiplies surface color by the scene-light color temperature).
- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  section 3.4 (per-surface material groups by role) and section 5.2 (the material seam
  and its widening to a surface identity).
- ADR-0067 (this slice's decisions): the seam widens to a surface identity, paint is
  threaded as the project paint store, the builders tag surfaces with their
  `SurfaceRef`, and the albedo is the paint color under the temperature-tinted light.
- ADR-0065 (lighting): the color temperature lives in the light, so paint is shown
  under the illuminant without double-tinting.
- ADR-0056 (surface paint selection and treatments): the paint model and the
  `SurfaceRef` this slice consumes.
- ADR-0061 (the wall shell): the per-surface material groups by role this slice keys
  paint onto.
