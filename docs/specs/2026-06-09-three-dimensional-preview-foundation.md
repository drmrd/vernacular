# Three-Dimensional Preview Track: Foundation

**Date:** 2026-06-09
**Status:** Accepted (foundation for the three-dimensional preview track)
**Scope:** This document governs the durable, cross-cutting decisions for the
three-dimensional preview track (design specification section 10, Phase 2):
coordinate and datum conventions, the geometry seam, the non-geometry seams that
are load-bearing across slices, and the testing strategy. It also maps the track
into slices. It deliberately does not design any single slice in full; each slice
gets its own spec at the point it is built, against these conventions and seams.
See ADR-0044 (the track-based delivery model this slice plan sits inside).

---

## 1. Goal and current state

**Goal of the track.** Turn the existing empty three-dimensional pane into a real,
navigable companion view: the single floor renders as a lit shell (walls with door
and window openings, floors, ceilings), the camera orbits and walks, a
color-temperature slider tints the light, and selection is shared with the
two-dimensional plan. The two views observe the same scene graph and dispatch the
same commands (design specification section 6.5).

**What already exists** (verified in the tree):

- A fully derived, pure scene-graph intermediate representation in `core/scene/`
  (walls with start, end, and thickness; rooms with polygon and thickness-aware
  `clearPolygon`; openings with center, along, normal, width, height, sill height,
  and host thickness; floors with elevation). Both renderers consume it
  (ADR-0018).
- `engine/scene/build-scene.ts`, which today emits only one empty Three.js group
  per floor node, positioned on the world Y axis at the floor's elevation. No
  geometry yet.
- Render-backend detection (`engine/renderer/detect-backend.ts`) and the WebGPU
  renderer factory (`engine/renderer/create-renderer.ts`).
- `BasicLightingProvider` (`engine/lighting/`): one directional sun at a fixed
  angle plus a hemisphere fill, behind the `LightingProvider` seam.
- `bridge/react/webgpu-scene-view.tsx`, an R3F `Canvas` that builds the scene,
  applies the lighting provider, and mounts the WebGPU renderer. It is rendered by
  `SceneCanvas`, already placed in the editor shell beside the two-dimensional
  plan, and falls back to an accessible message when WebGPU is unavailable.
- The wall graph (`core/topology/wall-graph.ts`): `buildWallGraph(walls)` returns
  a `PlanarGraph` of merged junction vertices and wall edges, with T-junction
  splitting and interior-crossing handling. This is the adjacency junction-aware
  meshing consumes.

Everything between an empty floor group and a navigable lit shell is missing.
The rest of this document fixes the decisions that all of that work shares.

---

## 2. Conventions (pinned by tests)

These are decided once here so every slice inherits them and a later slice never
silently contradicts an earlier one.

### 2.1 Axes and the plan-to-world mapping

The two-dimensional plan world is screen-style y-down: `worldToScreen` maps plan
`(x, y)` to screen `(x, y)` with `+y` downward (`editor/plan/viewport.ts`).

Three.js is right-handed and Y-up. The mapping is:

- plan `x` maps to world `X`
- plan `y` maps to world `Z`
- the vertical axis is world `Y` (up)

So a plan point `(x, y)` at vertical height `v` within a floor is world
`(x, v, y)`. This map is orientation-flipping: the plan frame is y-down while the
world ground plane is y-up, so the sense of a polygon loop reverses between the
two. To keep faces from rendering inside-out or mirrored, the foundation fixes a
single winding convention for local-frame outward loops (and the opposite sense for
holes, section 3.2) such that, after the flip, floor faces carry `+Y` (upward)
normals and wall exterior faces point away from the room interior. The slice-0
conventions test (not a later geometry slice) asserts the exact triangle order
against this rule, so slices 1, 2, and 4 all inherit one fixed convention rather
than each choosing their own.

### 2.2 Floor datum and vertical stacking

- The finished-floor surface of a floor is the floor group's local `Y = 0`. The
  group is positioned in world space at the floor's `elevation` on `Y` (as
  `build-scene` already does).
- A wall's base sits at local `Y = 0`; its top sits at local `Y = height`.
- A floor slab's top is flush with the finished floor (`Y = 0`); its thickness
  extends to negative `Y`. Ceilings (a later slice) sit at the ceiling height.
- Floor `elevation` values are cumulative, so floors stack without overlap and
  multi-floor work (a later track) is additive against this datum.

### 2.3 Units and camera

- World units are millimeters throughout (no scale factor), consistent with the
  scene graph and `build-scene`.
- Because a house spans on the order of ten thousand millimeters while a wall is
  on the order of one hundred millimeters thick, camera `near` and `far` are
  derived from the scene bounds by a pure framing helper (`near` a small fraction
  of the bounds diagonal, `far` a few multiples of it) so thin geometry does not
  z-fight. The helper takes an axis-aligned bounds and returns camera position,
  target, `near`, and `far`; it is unit-tested on bounds in, pose out. When the
  scene is empty or degenerate (the default new project has no walls, and slice 0's
  own baseline is the empty scene), the helper returns a fixed default framing
  centered at the origin rather than a NaN pose, so every consumer always has a
  valid camera.

### 2.4 Wall height

A wall's height is a per-wall scalar defaulting to the floor's
`defaultCeilingHeight`, carried on the wall scene node (an additive field) and
read by the wall builder. ADR-0034 calls for height to eventually be read through
an accessor returning a height _profile_ (sloped, variable, settled tops) rather
than a scalar. This foundation takes the documented scalar default; turning the
field into a profile is an additive change confined to that field and the builder,
recorded here so the scalar assumption is conscious, not silent.

---

## 3. The geometry seam

The wall-and-opening geometry is the load-bearing part of the track, because the
roadmap requires non-rectangular and curved openings, and eventually curved walls
and curved glass. The seam is designed so the common case is cheap and the general
cases are additive, never a rewrite. None of the general builders are built now;
only their seams are protected.

### 3.1 Openings carry their geometry, not the mesher

An opening's geometry comes from its element type, never from a hardcoded
rectangle in the mesher (ADR-0034). The element-type registry already carries a
`scene3D` field beside `plan2D`, but it is currently an opaque
`Scene3DReference { builder: string }`: a single routine identifier, populated as
`extruded-wall`, `door-frame`, or `window-frame` in
`core/registries/element-types.ts`. That single-string shape does not fit the
geometry this track needs, so the foundation work is to _evolve_ `Scene3DReference`,
not to add it. An opening's element type resolves to two pure generators:

- a **void contour**: the cutout removed from the host wall surface, and
- a **fill geometry**: the panel, sash, frame, and glass hosted in the opening
  (including, later, curved glass).

Both descriptors are produced in `core/` and realized in `engine/`. The design
specification (section 4.4) describes `scene3D` as an asset reference or
parameters, while the implemented field is a routine key; this track reconciles the
two by resolving the builder key to the generator pair. A half-round window, a
triangular door, or a settled non-orthogonal frame is then a new generator, not a
change to any consumer.

### 3.2 A curve-capable contour representation

Pure core represents a contour as an ordered, closed list of segments in a local
two-dimensional frame, each segment a line or an exact arc, never pre-tessellated:

```ts
// Point is the codebase's { x: number; y: number }; here it is a coordinate in the
// opening local frame defined below.
type ContourSegment =
  | { kind: 'line'; to: Point }
  | { kind: 'arc'; to: Point; center: Point; clockwise: boolean }

interface Contour {
  start: Point
  segments: ContourSegment[] // last segment closes back to start
}
```

Core emits exact arcs; the engine owns tessellation and level of detail (a
rendering concern that must not leak into `core/`). The first openings slice
implements only the `line` case (rectangular cutouts); the `arc` segment lands with
the half-round and round-topped shapes. `ContourSegment` is a discriminated union,
so further variants (elliptical, spline) are additive when a generator needs one;
the foundation does not freeze an elliptical parameterization no generator yet
exercises.

To keep this interface stable across the shape slices, the foundation also pins:

- **The opening local frame.** Two-dimensional, with origin at the finished-floor
  line directly below the opening's along-position on the host wall surface; `+x`
  runs along the wall (the scene node's `along`), `+y` runs up. A rectangular
  opening spans `x` in `[-width/2, width/2]` and `y` in
  `[sillHeight, sillHeight + height]`. Every shape generator authors its void
  contour in this frame; the wall builder places it onto the wall surface at the
  opening's along-position.
- **Hole winding.** A void contour is a hole in the wall face, so it is wound
  opposite to the face's outer loop (section 2.1's convention), matching
  `THREE.Shape` hole expectations; the slice-0 conventions test asserts it.
- **One void per opening.** A single opening yields exactly one void contour.
  Divided lights, mullions, and muntins are fill geometry inside that one void, not
  multiple wall cutouts, so `voidContour` stays single-valued.

### 3.3 Wall meshing is wall-graph-aware and builder-selected

The wall geometry builder consumes the wall graph, not a lone wall, so junctions
resolve correctly:

```ts
interface WallBuildInput {
  graph: PlanarGraph // junction vertices + wall edges (core/topology)
  walls: WallSceneNode[] // height, thickness, kind, host openings per wall
  openingsByWall: Map<string, OpeningSceneNode[]> // keyed by model wallId
  materials: MaterialProvider // section 5.2
}

// Selected by wall kind: straight-planar now, swept/curved later. The builder is
// an engine-layer function, so its return is a Three.js object (Group of meshes).
type WallMeshBuilder = (input: WallBuildInput) => THREE.Object3D
```

The straight-planar builder (the only one built now) resolves each junction vertex
from its incident edges and their thicknesses (miter or butt), builds each wall's
elevation profile (a rectangle today; a non-rectangular outline once sloped tops
land) minus the opening void contours, and extrudes through the wall thickness.
The decision geometry that is pure (junction miter points, the elevation outline,
the opening void contours in local frames) lives in `core/`; the `engine/` builder
consumes it and produces Three.js meshes. Selection by wall kind is the per-type
optimization point: a straight wall with rectangular openings can take a cheap
path, while an arc wall with curved glass takes a swept-surface builder, behind the
same seam.

The wall graph splits a model wall into several edges at T-junctions and interior
crossings (`core/topology/wall-graph.ts`), all carrying the original `wallId`, so a
wall's openings cannot be attached to a `wallId` as a whole. The builder's first
step is to resolve each opening to the specific graph edge that contains its
along-position; the slice that cuts opening voids (slice 2) confirms this resolution
before relying on it, and revises the `WallBuildInput` shape if a per-edge map reads
more cleanly than the per-`wallId` map sketched above.

### 3.4 Per-surface identity for later painting

Wall and shell meshes are emitted with material groups tagged by a surface role,
so the paint track can address surfaces without remeshing:

```ts
type SurfaceRole = 'interiorFace' | 'exteriorFace' | 'reveal' | 'top' | 'base'
```

Slice 1 paints every role with the neutral material, but the groups exist from the
first mesh.

---

## 4. Curved walls: the one genuine future cost

Curved-centerline walls (turrets, bowed walls) are not free and are not built in
this track. A wall is a straight segment in the model today
(`core/model/types.ts`), and the topology, room derivation, hit-testing, and
snapping all assume that (ADR-0034 records this as the single item with real
retrofit cost). When curved walls land as their own future milestone, they bring a
wall-centerline-as-path model change; a swept-surface wall builder then plugs into
the builder seam (section 3.3) and consumes the same contour type (section 3.2) for
its openings. This foundation keeps those additive; it does not pretend the arc
case is already covered.

---

## 5. Cross-cutting seams (non-geometry)

These are settled now, at seam depth, because they are load-bearing across slices
and two of them constrain the first geometry slice. Their detailed wiring is the
slice that owns them; their seam is here.

### 5.1 Mesh-to-entity identity (constrains slice 1)

Every renderable object carries its scene-graph entity id in
`userData.entityId` (the design specification's hit-test rule, section 6.9;
`build-scene` already does this for floor groups). Making it a foundation rule
means slice 1's wall and opening meshes carry it from the start, so raycaster
selection and the shared highlight are purely additive later.

### 5.2 The material seam (constrains slice 1)

Surfaces render through a material provider keyed by surface role:

```ts
interface MaterialProvider {
  material(role: SurfaceRole): Material
}
```

A neutral provider is the default now; the color-temperature-responsive
`PaintMaterial` (design specification section 6.8) replaces it later at this seam,
fed by the per-surface groups of section 3.4. Slice 1 uses the neutral provider but
behind the seam, so the paint slice is a swap, not a rewrite.

The provider is keyed by surface _role_ today, which suffices for the neutral
material and the color-temperature stub. Per-surface-instance painting (one wall
face a different color from another) needs a surface _identity_, not just a role;
the paint track widens this key to a surface identity, an additive change to the
provider signature rather than a new seam.

### 5.3 View-state ownership

Camera state is per-view (design specification section 6.5) and lives in the view
layer (the editor or bridge React layer), never in the project model and never in
undo history. Selection state is shared and already lives in the bridge
(ADR-0020). The color-temperature value (section 5.4) is likewise a per-view scene
parameter. This says where that state lives; the camera-navigation and
selection-sync slices implement against it.

### 5.4 Lighting and color-temperature flow

Lighting stays behind the existing `LightingProvider` seam (`engine/lighting/`).
The color temperature is a per-view scene parameter in Kelvin (2700 to 6500) owned
in the view layer, flowing to the scene light color and to the paint material,
which receives both surface color and light color (design specification section
6.8). The slider, the hemisphere-fill tuning, and the PCF soft-shadow
configuration are the lighting slice; the seam and the parameter's home are
foundation.

### 5.5 Incremental-update subscription

The scene consumer subscribes to entity-keyed dirty markers (design specification
section 6.4). The first slices may rebuild the Three.js scene wholesale on change
(as `WebGPUSceneView` does today). The incremental-update slice replaces those
internals behind the subscription seam, so consumers do not change. Naming the seam
now keeps the temporary full rebuild from hardening into an assumption. One caveat
the incremental slice must honor: wall geometry is non-local, because junctions
miter against their neighbors, so editing one wall dirties the geometry of every
wall sharing a junction with it. The dirty set for walls is the junction
neighborhood, not the single entity.

### 5.6 Render-backend portability

WebGPU is primary, detected at startup; the WebGL2 backend is a post-alpha
fast-follow (ADR-0044). To keep that additive, the track's materials and lighting
stay within a feature set both backends can express (forward rendering, soft shadow
maps, a paint material that needs no compute shaders or storage buffers). The work
that relies on the newer backend is past this track.

### 5.7 Accessibility (a foundation seam)

The design specification makes the three-dimensional view keyboard-navigable, with
screen-reader announcements on selection change and color-blind-safe selection
highlighting, a day-one requirement (sections 6.13 and 7.9). A WebGPU canvas is
opaque to assistive technology, so this needs a seam, not a late patch. The
two-dimensional editor already solved the analogous problem with a DOM overlay of
focusable entity proxies, a roving tab order, and `aria-live` announcements
(`editor/plan/plan-overlay.tsx`, `editor/plan/use-overlay-keyboard.ts`,
`editor/plan/overlay-announce.ts`); the three-dimensional view reuses that shape:

- **Focus and assistive surface.** A DOM proxy layer over the three-dimensional
  canvas carries one focusable, labeled element per selectable entity, positioned by
  the entity's projected screen location, with a roving tab order. The canvas stays
  the renderer; the proxies are the accessible surface, as the two-dimensional
  overlay already is.
- **Announcements.** Selection changes announce through an `aria-live` region driven
  by the shared bridge selection store (ADR-0020), so a selection made in either
  view is announced once.
- **Highlight encoding.** The selection highlight must not rely on hue alone. The
  current two-dimensional highlight is a fixed selection blue (hue-only), which does
  not satisfy the color-blind-safe requirement and reads even more weakly as a tint
  over lit three-dimensional surfaces. The three-dimensional highlight uses an
  outline plus a value or contrast change, so it reads without color discrimination.

The seam (the proxy layer, the announcement channel, the highlight encoding) is
foundation; the implementation lands with selection sync (slice 7).

### 5.8 Camera and walk controls (no new dependency)

No orbit or camera-controls library is in the tree (only `three` and
`@react-three/fiber`). To avoid a thirty-day dependency-cooldown lead time on the
navigation slices, orbit and pan-zoom use `OrbitControls` from
`three/examples/jsm/controls/OrbitControls`, which ships with the existing `three`
dependency, behind a thin bridge wrapper; walk mode (WASD plus pointer-lock
mouse-look) is hand-rolled against the camera. No new dependency is added. A richer
controls library, if ever wanted, is a separate pinned and cooldown-cleared
decision, not on a slice's critical path.

---

## 6. Testing strategy

Two tiers. Most correctness is processor-only and unit-testable in Node; a real
visual harness covers the appearance that only a render can show. The visual
harness is stood up first (slice 0, section 7), deliberately, so every later slice
lands with a reviewed baseline rather than an eyeballed one.

### 6.1 Geometry and scene-tree tests (no GPU)

Three.js geometry construction is pure processor work and runs in Node with no
graphics context:

- **Geometry tests** against the built `BufferGeometry`: vertex positions, normals
  and winding, material groups, hole cutting, and junction resolution. Extends the
  existing `build-scene.test.ts` pattern. No new dependency.
- **Scene-tree assertions** on the `buildScene` output (the existing pattern).
- **Pure-core tests** for the contour math, junction miter points, elevation
  outlines, and the camera-framing helper.

These catch geometric correctness, but geometric correctness is not visual
fidelity: a flipped normal, a wrong material, a z-fighting overlap, or a miswired
light or color temperature all pass geometry tests yet render wrong. That is what
the visual harness exists for.

### 6.2 The visual render harness (stood up first)

A Playwright end-to-end test boots the app in a WebGPU-capable browser, loads a
fixed fixture project with a deterministic camera (from the framing helper) and the
fixed `BasicLightingProvider`, waits for the three-dimensional pane to settle,
captures the three-dimensional canvas, and compares it against a committed,
human-reviewed baseline using Playwright's built-in perceptual screenshot
comparison (no new dependency). The two-dimensional visual-regression already uses
this Playwright API, but against a full-page DOM screenshot, not a WebGPU render, so
it reuses the API, not the capability (see the prerequisite below). Determinism
comes from the fixed fixture, camera, lighting,
canvas size, and disabled animation; a perceptual tolerance absorbs graphics-driver
variation (the design specification notes three-dimensional output is GPU-sensitive,
section 9.3). Baselines are committed only after diff review (section 9.12), through
the existing update-snapshots flow.

There is a real prerequisite here. `playwright.config.ts` launches its browsers
with no GPU or WebGPU flags today, and headless Chromium does not enable WebGPU
without explicit launch arguments and a capable backend, so the harness is not
proven to render until that is configured. Slice 0's first task is therefore to
establish a WebGPU-capable Playwright project: the launch flags that enable WebGPU
and a machine (local or a chosen runner) on which the three-dimensional canvas
actually renders, verified by a non-blank baseline. Because the renderer is
WebGPU-only, the harness then runs where that capability exists and self-skips where
it does not, like the current two-dimensional baseline. Hard-gating GPU-less
continuous integration additionally needs a deterministic software-rasterizer path
(the design specification's nightly software-rasterizer three-dimensional snapshots,
sections 8.7 and 9.3), tracked in section 9. Until WebGPU-under-Playwright is
verified, slice 0's promise that every later slice lands against a reviewed baseline
holds only where the capability exists; establishing it is the first thing slice 0
does, not an assumption it rests on.

### 6.3 What stays glue

The `WebGPUSceneView` mount stays coverage-excluded glue (it runs only under WebGPU,
never under jsdom). Component-level React-Three assertions are not adopted; the
engine output and the visual harness cover their ground.

---

## 7. Slice map

Each slice gets its own spec and red-green-blue cycle when it is reached; the
detail below is scope, not design. Build order follows the convergence seams
(geometry first, then navigation, then lighting and selection).

0. **Test harness and conventions (built first).** First establish a WebGPU-capable
   Playwright runner (section 6.2): the browser launch flags that enable WebGPU and
   a machine on which the three-dimensional canvas actually renders, verified by a
   non-blank baseline. Then stand up the visual render harness, the Node geometry
   and scene-tree assertion helpers (section 6.1), the camera-framing helper with
   its empty-scene fallback (section 2.3), and the coordinate, datum, and winding
   conventions pinned by tests (sections 2.1, 2.2, 3.2). This lands before the wall
   shell so slice 1 and every slice after it ships with a reviewed visual baseline,
   not an eyeballed one. Its initial baseline is the current lit empty scene; slice
   1 produces the first shell baseline.
1. **Wall shell with junctions.** Wall-graph-aware extruded walls (no openings
   yet), the neutral material behind the material seam with per-surface groups,
   `userData.entityId` on every mesh, and a framed orbit camera. The first
   correct-looking shell.
2. **Opening voids.** The void contour from the element type cut into the host
   walls; the rectangle contour implemented.
3. **Opening fill and leaf.** Panels, sashes, frames, and glass hosted in
   openings; flat geometry first, with the curved-glass seam exercised.
4. **Ceilings and per-room floors.** Per-room thickness-aware floor slabs from
   `clearPolygon` and ceiling planes, replacing the crude bounding-box slab.
5. **Camera navigation.** Pan and zoom polish, presets (top-down, four elevations,
   from-door, from-window), and walk mode (WASD and mouse-look at eye height).
6. **Lighting.** The color-temperature slider, hemisphere-fill tuning, PCF soft
   shadows, and the `PaintMaterial` stub that responds to color temperature,
   consuming the per-surface groups.
7. **Selection sync and three-dimensional accessibility.** Raycaster hit-testing
   via `userData.entityId` and the shared highlight mirroring the bridge selection,
   plus the accessibility surface of section 5.7: the focusable DOM proxy layer with
   a roving tab order, `aria-live` selection announcements, and the color-blind-safe
   highlight encoding.
8. **Incremental and dirty updates.** Replace the full-scene rebuild behind the
   subscription seam, consuming entity-keyed dirty markers.

---

## 8. Out of scope for this track

- Curved-centerline walls and the wall-centerline-as-path model change (section 4).
- Wall height profiles (sloped and variable tops); the scalar default stands
  (section 2.4).
- Furniture in three dimensions (the assets track owns the meshes; this track only
  needs `userData.entityId` and the material seam in place for them to drop in).
- Painted walls (the paint track; this track ships the `PaintMaterial` stub and the
  per-surface groups it will consume).
- The WebGL2 backend wiring (post-alpha fast-follow).
- Solar lighting, global illumination, and physically based reflectance (a later
  high-priority phase).
- The resizable, maximizable split-pane divider between the two- and
  three-dimensional panes (a Phase 2 deliverable, design specification sections 6.5
  and 10). The panes already coexist in the editor shell; the divider is handed to
  the user-experience foundation track, which owns the shell chrome, rather than
  this track.

---

## 9. Open questions (resolved at the slice that hits them)

- The exact junction miter rule for a vertex with more than two incident walls or
  walls of differing thickness (slice 1).
- Whether ceilings derive per room or per floor (slice 4).
- Walk-mode collision handling, if any, in the minimum viable product (slice 5).
- Whether per-view camera state is persisted with autosave or is purely session
  state (slice 5; selection is persisted per the design specification, camera is
  per-view).
- Configuring a deterministic software-rasterizer path so the visual harness
  (section 6.2) can hard-gate GPU-less continuous integration rather than
  self-skipping there (a follow-on; the design specification plans
  software-rasterizer three-dimensional snapshots in nightly, sections 8.7 and
  9.3).

---

## 10. References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 3.2
  (typed elements, rooms derived), 4.4 (the `ElementTypeRegistry` `plan2D` and
  `scene3D` fields), 6.1 to 6.13 (the scene graph, both renderers, the data flow,
  camera and navigation, lighting and the color-temperature hook, the paint
  material seam, selection and hit testing, performance budgets, accessibility),
  and section 10 Phase 2 (deliverables and acceptance).
- ADR-0018 (scene-graph derivation), ADR-0006 (registry pattern), ADR-0005
  (command dispatch): the decoupling layer the seams rely on.
- ADR-0004 (Three.js, R3F, WebGPU), ADR-0021 (two-dimensional plan rendering and
  the Canvas seam), ADR-0020 (bridge-owned selection outside undo).
- ADR-0034 (future-direction seams: openings read shape from the element type;
  curved walls as the one real retrofit cost; geometry modifiers over hardcoded
  extrusions).
- ADR-0044 (track-based delivery; this track is the three-dimensional preview).
- ADR-0026 (room derivation by planar face enumeration; the wall graph this track
  reuses for junctions).
