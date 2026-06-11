---
slug: decisions/ADR-0045-three-dimensional-render-harness-and-conventions
title: 'ADR-0045: Three-dimensional render harness, coordinate conventions, and the WebGL visual baseline'
type: decision
tags:
  [
    architecture,
    rendering,
    three-d-preview,
    scene,
    coordinates,
    winding,
    vertical-datum,
    camera-framing,
    contour,
    units,
    millimeters,
    testing,
    visual-regression,
    playwright,
    webgpu,
    webgl2,
    engine,
    core,
  ]
related:
  [
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0004-three-js-r3f-webgpu,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0031-plan-viewport-projection-pan-zoom,
    decisions/ADR-0027-units-module-targets-millimeter-storage,
  ]
sourceFiles:
  [
    docs/specs/2026-06-09-three-dimensional-preview-foundation.md,
    docs/plans/2026-06-09-three-dimensional-render-harness-and-conventions.md,
    core/scene/vector3.ts,
    core/scene/plan-to-world.ts,
    core/scene/winding.ts,
    core/scene/vertical-datum.ts,
    core/scene/camera-framing.ts,
    core/scene/contour.ts,
    engine/testing/geometry-assertions.ts,
    engine/testing/index.ts,
    engine/renderer/create-renderer.ts,
    bridge/react/scene-harness-view.tsx,
    app/app.tsx,
    e2e/tests/scene-visual-regression.spec.ts,
    playwright.config.ts,
  ]
status: current
updated: 2026-06-09
---

# ADR-0045: Three-dimensional render harness, coordinate conventions, and the WebGL visual baseline

## Status

Accepted, landed. This is slice 0 of the three-dimensional preview track
([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]), the first of the
three start-now enablers. It builds the testing foundation and pins one fixed set
of coordinate, datum, winding, framing, and contour conventions so every later
slice lands against a reviewed visual baseline rather than per-slice eyeballed
choices. No wall, opening, floor-slab, or ceiling geometry ships here; those are
slices 1, 2, and 4 and inherit these conventions. The foundation spec
(`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`, sections 2, 3.2,
6, and 7) is authoritative; this ADR records the implemented conventions, the
testing seams, and the durable empirical rendering decision.

## Context

The three-dimensional preview turns the empty companion pane into a lit, navigable
shell. Every downstream slice (openings, trim, features, stairs, the cutaway, the
snapshot export, the painted preview) converges on this renderer, so the
conventions it establishes are load-bearing across the whole track. Two facts make
slice 0 worth doing first as conventions-plus-harness rather than geometry:

1. Plan space is screen-style **y-down** (the two-dimensional editor's convention,
   [[ADR-0021-2d-plan-rendering-interaction]] and
   [[ADR-0031-plan-viewport-projection-pan-zoom]]), while Three.js world space is
   right-handed and **Y-up**. The map between them is orientation-flipping, so a
   single winding convention has to be pinned once or every mesher will guess
   differently and faces will point inconsistently.

2. A pixel-comparison visual baseline is only trustworthy if the rendering backend
   is deterministic on the machine that produces it. The renderer targets WebGPU
   ([[ADR-0004-three-js-r3f-webgpu]]), whose availability turned out to be
   flag-dependent under Playwright (see the empirical finding below), so the
   backend the baseline is pinned to is a real decision, not an incidental.

## Decision

### Pinned coordinate, datum, winding, and unit conventions (pure `core/scene/`)

All of the following are pure TypeScript in `core/scene/`, unit-tested in Node
with no graphics context, and re-exported from `core/index.ts`. They contain no
Three.js import; they only encode the conventions the engine renders against.

- **Axis map (`plan-to-world.ts`).** `planToWorld(point, height)` maps a plan
  point `(x, y)` at vertical height `v` to world `(x, v, y)`: plan `x` to world
  `X`, plan `y` to world `Z`, height to world `Y`. This is the single source of
  the axis mapping; every three-dimensional consumer goes through it. Because plan
  `y` (down-positive on screen) becomes world `Z`, the map is **orientation-
  flipping**, which is why the winding convention below is fixed here rather than
  left to each mesher.

- **World-up winding (`winding.ts`).** `signedArea` is the shoelace area in the
  plan frame (its sign encodes orientation). `loopWorldNormal(loop, height)` is the
  Newell normal of the loop after `planToWorld`. The canonical convention:
  `canonicalOuterLoop` orients a floor or face outer loop so its world normal
  points **+Y** (up) after the plan-to-world flip; `canonicalHoleLoop` winds a hole
  **opposite** the canonical outer loop (matching `THREE.Shape` hole expectations).
  Canonicalization is idempotent. The exact wall-exterior-face normal assertion is
  deferred to slice 1, which asserts it against this rule once a wall mesher
  exists.

- **Vertical datum (`vertical-datum.ts`).** The finished-floor surface is the
  floor group's local `Y = 0`. `wallVerticalSpan(height)` returns
  `{ base: 0, top: height }` (a wall base on the finished floor, its top at its
  height). `floorSlabVerticalSpan(thickness)` returns `{ top: 0, bottom: -thickness }`
  (a slab top flush with the finished floor, its thickness extending into negative
  `Y`).

- **Units.** World units are **millimeters** throughout, with no scale factor,
  consistent with the millimeter storage convention
  ([[ADR-0027-units-module-targets-millimeter-storage]]) and the engine's existing
  millimeter scene tree ([[ADR-0004-three-js-r3f-webgpu]]).

### Camera-framing helper with an empty-scene fallback (`camera-framing.ts`)

`frameSceneCamera(bounds)` takes axis-aligned world `Bounds3` (or `null`) and
returns a `CameraPose` (`position`, `target`, `near`, `far`). It targets the
center of the bounds, positions the camera a bounds-diagonal away and above the
target so the bounds are in view, sets `near` to a small fraction of the bounds
diagonal and `far` to a few multiples of it (so a ten-meter house with
hundred-millimeter walls does not z-fight), and for an empty (`null`) or degenerate
(zero-size) bounds returns the fixed `DEFAULT_CAMERA_POSE` centered at the origin
with a valid, **never-NaN** near and far. This is the single home for "where does
the camera start", so the home view is reproducible and the visual baseline is
stable.

### Curve-capable contour types (`contour.ts`)

A `Contour` is `{ start, segments }`, an ordered closed list of `ContourSegment`s
in a local two-dimensional frame, never pre-tessellated. A segment is either
`{ kind: 'line', to }` or an exact `{ kind: 'arc', to, center, clockwise }`. Core
emits exact arcs; the **engine owns tessellation and level of detail**. The union
is open to further additive variants (elliptical, spline). Slice 0 introduces the
types only; the rectangle void generator is slice 2 and the arc generators land
with the curved opening shapes, all authoring into this one frame.

### Engine-layer geometry and scene-tree assertion helpers (`engine/testing/`)

Test-support utilities (not shipped in the production bundle) so slice 1 onward
asserts geometry and scene-tree identity without re-deriving Three.js internals
each test: `readPositions`, `readNormals`, `readIndex`, and `materialGroups` over a
`THREE.BufferGeometry`, plus `findByEntityId(root, id)` and `collectEntityIds(root)`
over a built scene tree (reading the `userData.entityId` carried by
`buildScene`, [[ADR-0018-scene-graph-derivation]] and
[[ADR-0004-three-js-r3f-webgpu]]). They live under `engine/testing/` (the only
Three.js importer stays the engine) and are coverage-excluded as test-only code.

### The empirical rendering finding and the backend decision (the durable record)

This is the decision the track orchestrator asked to be preserved, because the
WebGPU-availability result is non-obvious and flag-dependent.

**Finding.** Under Playwright's bundled Chromium on the development Apple-Silicon
Mac, with the full Chrome for Testing build (`channel: 'chromium'`) and the launch
flags `--enable-unsafe-webgpu`, `--use-angle=metal`, `--use-gpu-in-tests`, and
`--ignore-gpu-blocklist`, **`navigator.gpu` is present and a real WebGPU backend
renders**. An earlier probe under a different flag and headless combination had
found `navigator.gpu` undefined, so WebGPU availability under Playwright on this
machine is **flag-dependent**, not a stable property of the runner. Separately,
`three` 0.184's `WebGPURenderer` already auto-falls-back to its own WebGL 2
backend when `navigator.gpu` is absent, so the production rendering path needs no
change to be robust to a missing device.

**Decision (product-owner chosen).** Pin the local visual-regression baseline to
the **hardware-WebGL** backend, via an opt-in `forceWebGL` option on the renderer
factory (`engine/renderer/create-renderer.ts`), so the baseline is deterministic
on this machine regardless of the flag-dependent WebGPU availability. The
production path is unchanged: `forceWebGL` defaults off, so production keeps WebGPU
with `three`'s built-in WebGL 2 fallback. The visual harness
(`bridge/react/scene-harness-view.tsx`) sets `forceWebGL: true`. The committed
baseline snapshot is named with a `-webgl` suffix (`scene-empty-webgl.png`, stored
per-platform as `scene-empty-webgl-scene-webgl-darwin.png`) so a future WebGPU or
continuous-integration baseline never collides with it. The Playwright project is
named `scene-webgl` (not `webgpu`) to match the backend the baseline is pinned to,
runs only the scene harness (`testMatch` on the harness spec), and the existing
`chromium`, `firefox`, and `webkit` projects `testIgnore` the harness so the
two-dimensional suite is unchanged.

**Self-skip policy.** Unlike the absent-WebGPU case, the harness renders through
whatever backend the runner provides and self-skips **only when no WebGL 2 context
can be created at all** (a runner with no usable GPU stack), so it does not
vacuously skip everywhere WebGPU happens to be absent. This mirrors how the
two-dimensional baseline self-skips only where no committed platform baseline
exists.

**Verified flag set (development Mac, 2026-06-09):**

```
channel: 'chromium'  (full Chrome for Testing, carries the GPU stack the
                      default stripped headless shell omits)
args: [
  '--enable-unsafe-webgpu',
  '--use-angle=metal',     // Apple Metal ANGLE backend: real GPU, not a
                           // software rasterizer
  '--use-gpu-in-tests',
  '--ignore-gpu-blocklist',
]
```

### The slice-0 baseline is a flat opaque empty-scene background

The committed baseline is a single static frame of the lit empty scene with an
opaque background and no geometry yet (the harness renders one frame on mount, no
animation). It exists to prove the harness produces a real, non-transparent
hardware-WebGL render and to give later slices something to diff against. **Slice
1 produces the first shell baseline** (walls, floors, ceilings), at which point the
baseline is refreshed.

## Consequences

- Every three-dimensional consumer inherits one axis map, one winding rule, one
  vertical datum, and one camera-framing rule, so floors face up, holes cut
  correctly, walls sit on the finished floor, slabs hang below it, and the home
  view is reproducible. Later slices assert geometry against these helpers rather
  than re-deriving conventions, and the wall-exterior-face normal (slice 1) and the
  rectangle void contour (slice 2) author into the frames pinned here.
- The visual baseline is deterministic on the development machine because it is
  pinned to the hardware-WebGL backend, sidestepping the flag-dependent WebGPU
  availability under Playwright. The `-webgl` suffix and the `scene-webgl` project
  name keep a future WebGPU or continuous-integration baseline from colliding.
- Production rendering is unchanged: `forceWebGL` is opt-in and off by default, so
  production keeps WebGPU with `three`'s built-in WebGL 2 fallback. The
  visual-regression backend is an isolated, additive harness concern.
- The engine remains the only Three.js importer: the conventions are pure `core/`,
  and the geometry and scene-tree assertion helpers live under `engine/testing/`,
  coverage-excluded as test-only.
- The empirical finding is recorded so a future session does not re-discover, by
  trial and error, that WebGPU under Playwright here is flag-dependent, or
  accidentally re-pin the baseline to a non-deterministic backend.

## Alternatives considered

- **Pin the baseline to the WebGPU backend.** Rejected for now: WebGPU
  availability under Playwright on this machine is flag-dependent and the renders
  are not guaranteed pixel-stable across the WebGPU and WebGL paths, so a
  WebGPU-pinned baseline would be fragile. The `-webgl` suffix leaves room to add a
  WebGPU baseline later without a collision.
- **Self-skip whenever `navigator.gpu` is absent.** Rejected: it would vacuously
  skip on any runner without WebGPU even though the WebGL 2 backend renders fine
  there. The harness instead skips only when no WebGL 2 context can be created at
  all.
- **Let each mesher choose its own winding.** Rejected: the plan-to-world map is
  orientation-flipping, so independent windings would produce inconsistently facing
  faces. One canonical rule, pinned by tests, is the single source.
- **Pre-tessellate contours in `core/`.** Rejected: emitting exact arcs and giving
  the engine ownership of tessellation and level of detail keeps `core/` free of
  resolution choices and lets the engine vary detail by distance.
- **Pull geometry into slice 0.** Rejected: slice 0 deliberately ships conventions
  and the harness only, so slices 1, 2, and 4 build meshes against a reviewed
  baseline and one fixed convention set rather than eyeballed per-slice choices.

## References

- Design specification (track foundation)
  `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`: section 2
  (axes, datum, units, camera framing), section 3.2 (the contour seam), section 6
  (the testing strategy and the visual harness), and section 7 (the slice map;
  this is slice 0).
- Implementation plan
  `docs/plans/2026-06-09-three-dimensional-render-harness-and-conventions.md`
  (the task-by-task red-green-blue plan this ADR closes).
- [[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]: the track-based
  delivery model; this is the first start-now enabler of the three-dimensional
  preview track.
- [[ADR-0004-three-js-r3f-webgpu]]: the renderer stack, the `WebGPURenderer`
  factory this `forceWebGL` option extends, and the millimeter scene tree.
- [[ADR-0018-scene-graph-derivation]]: the scene tree and the `userData.entityId`
  the scene-tree assertion helpers read.
- [[ADR-0021-2d-plan-rendering-interaction]] and
  [[ADR-0031-plan-viewport-projection-pan-zoom]]: the screen-style y-down plan
  convention the plan-to-world map flips into world Y-up.
- [[ADR-0027-units-module-targets-millimeter-storage]]: the millimeter convention
  the world units follow.
  </content>
  </invoke>
