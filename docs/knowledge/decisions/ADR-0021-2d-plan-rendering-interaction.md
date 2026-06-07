---
slug: decisions/ADR-0021-2d-plan-rendering-interaction
title: 'ADR-0021: 2D plan rendering and interaction as pure modules behind a Canvas seam'
type: decision
tags:
  [
    architecture,
    editor,
    plan,
    rendering,
    canvas,
    hit-testing,
    state-machine,
    testability,
    accessibility,
  ]
related:
  [
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0019-bridge-dispatch-boundary,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0031-plan-viewport-projection-pan-zoom,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0033-drawing-snap-model,
    decisions/ADR-0035-wall-editing-endpoint-move-and-thickness,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0037-image-underlay-and-calibration,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    editor/plan/viewport.ts,
    editor/plan/wall-tool.ts,
    editor/plan/calibration-tool.ts,
    editor/plan/hit-test.ts,
    editor/plan/draw-plan.ts,
    editor/plan/draw-underlay.ts,
    editor/plan/plan-view.tsx,
    editor/plan/use-viewport-controls.ts,
    editor/shell/editor-shell.css,
    core/scene/scene-graph.ts,
  ]
status: current
updated: 2026-06-07
---

# ADR-0021: 2D plan rendering and interaction as pure modules behind a Canvas seam

## Status

Accepted. The 2D plan path is implemented in `editor/plan/`: pure modules for
viewport projection, the wall-tool state machine, hit testing, and Canvas
drawing, plus the `PlanView` glue that binds them to React, the session, and the
selection store. The design specification (sections 6.1, 6.5, 6.9, and 6.11)
remains authoritative; this ADR records the implementation interpretation.

## Context

The wall-drawing proof of life needs a 2D editing surface that draws walls,
draws a wall while the user clicks two endpoints, and selects a wall by clicking
near it. The design specification places this in the 2D plan view, which observes
the same scene graph and dispatches the same commands as the (future) 3D view
(section 6.5), uses Canvas `fillText`/stroking for plan rendering (section 6.11),
and hit-tests scene entities for selection (section 6.9).

The constraint that shaped the design is testability. The interactive surface is
an HTML `<canvas>` with a 2D context and pointer events, and jsdom implements
neither a real 2D canvas nor the geometry of a live layout. If the geometry,
the interaction logic, and the drawing all lived inside the React component, none
of it would be unit-testable, and the proof of life would rest entirely on an
end-to-end run.

## Decision

Split the plan path into pure, unit-tested modules and a thin browser-only glue
component.

### Pure modules in `editor/plan/`

- **Viewport projection** (`viewport.ts`): `worldToScreen` / `screenToWorld`
  between millimeter world coordinates and pixel screen coordinates. The proof of
  life carried a single `scale` (pixels per millimeter); the viewport has since
  gained a screen-pixel pan `offset` and the zoom operations (`panBy`,
  `clampScale`, `zoomAtCursor`, `wheelZoomFactor`) plus a shared 1-D
  `axisProjection` / `axisSamples` primitive for the grid and rulers. The
  projection model and its pan/zoom surface are recorded in ADR-0031; both
  transforms stay pure functions with no DOM.
- **Wall-tool state machine** (`wall-tool.ts`): `advanceWallTool(state, point,
floorId)` over an explicit two-state type, `{ phase: 'idle' } | { phase:
'drawing'; start }`. The first click moves idle to drawing and records the
  start; the second click returns to idle and emits an `addWall` command, unless
  the two clicks map to the identical point (a zero-length wall), in which case it
  cancels back to idle with no command. The machine returns the next state and an
  optional command; it never dispatches and never touches React. A companion pure
  read-only projection, `wallPreviewSegment(state, point)`, reports the
  in-progress `{ start, end }` segment when `phase` is `'drawing'` (else
  `undefined`); it derives a render hint from the same state without mutating it,
  so the live rubber-band preview stays a property of the tested state rather than
  a fact the glue invents.
- **Hit testing** (`hit-test.ts`): `hitTestWalls(walls, point, tolerance)` does
  point-to-segment distance against each wall centerline and returns the nearest
  wall id within tolerance, or `null`. On a distance tie the later (more recently
  drawn) wall wins. This is the section 6.9 hit test; it began as a linear scan
  over walls only. Selection (ADR-0032) later wrapped it in a broad-then-narrow
  `hitTest` that adds a spatial-index broad phase and a room-containment fallback,
  reusing this `hitTestWalls` as the wall narrow phase behind the same
  centerline rule.
- **Canvas drawing** (`draw-plan.ts`): `drawPlan(ctx, options)` fills each derived
  room polygon as a subtle floor tint, then strokes each wall scene node on top,
  coloring selected walls differently. It draws against a narrow
  `PlanDrawingContext` interface that declares only the handful of
  `CanvasRenderingContext2D` members it uses (`clearRect`, `beginPath`, `moveTo`,
  `lineTo`, `closePath`, `stroke`, `fill`, `arc`, and the stroke/fill
  style/width/cap setters). Depending on that hand-written structural seam rather
  than on the full DOM type lets `drawPlan` be driven by a recording fake in unit
  tests, so the drawing logic is verified without a real canvas. When
  `DrawPlanOptions.preview` (a named `PreviewSegment`) is set, `drawPlan` also
  renders a live rubber-band guide: `drawPreview` coordinates a thin guide line
  (`drawPreviewLine`) and a filled start-marker dot (`drawStartMarker`). Adding
  the dot grew the seam to cover `fillStyle`, `arc`, and `fill`, and adding the
  room fill grew it again with `closePath` (to close each filled polygon); these
  are the worked examples of the "extend the interface rather than reach for the
  full DOM type" guidance below.

### Thin glue: `PlanView`

`PlanView` (`plan-view.tsx`) is the only browser-coupled piece. It owns the
`<canvas>` element and its ref and wires the pure pieces to their data sources:
it reads `graph.walls` from the session's scene graph (`useSceneGraph`,
ADR-0019), reads and mutates selection through the selection store
(`useSelection` / `useSelectionIds`, ADR-0020), and reads the active tool. Its
two responsibilities, translating input and painting output, are factored into
two local hooks so the component body stays a declaration of wiring:

- `usePlanInteraction` holds the wall-tool state and the live cursor in React
  state and turns pointer events into actions. On a pointer-down it converts the
  event to world coordinates and, for the select tool, runs `hitTestWalls` and
  updates selection; for the wall tool, it advances the wall-tool machine and
  dispatches any emitted command through the session. It tracks the cursor on
  pointer-move only while the wall tool is active (the select tool needs no
  per-move redraws) and clears it on pointer-leave, then derives the
  `PreviewSegment` it returns from `wallPreviewSegment(toolState, pointer)`.
- `usePlanRedraw` is the lone `useEffect`: it calls `drawPlan` whenever the
  walls, the selection ids, or the in-progress preview segment change, so the
  rubber-band line follows the cursor between clicks without redrawing on
  unrelated state.

Because this component cannot run under jsdom, it is excluded from unit-test
coverage and validated by the wall-drawing end-to-end spec instead; all of its
non-trivial logic has already been factored into the pure modules that the unit
tests cover. The hook split keeps that boundary clean: the preview is a pure
projection (`wallPreviewSegment`) and a pure draw (`drawPlan`), and the hooks add
only the React state and the effect that jsdom cannot exercise anyway.

When the viewport became interactive (pan, zoom, fit; ADR-0031), the
browser-only camera input grew past `max-lines` and moved to a sibling
coverage-excluded glue file, `editor/plan/use-viewport-controls.ts`: a native
non-passive wheel listener, spacebar-drag and middle-button pan, and the
fit-to-content key. `plan-view.tsx` stayed the tool/render wiring. Both remain
glue validated only by the e2e, since all of their math lives in the pure
viewport modules.

### Scene graph gains `walls` and `rooms` sibling arrays

To feed plan rendering, `SceneGraph` (`core/scene/scene-graph.ts`) gained a
sibling `walls: WallSceneNode[]` array alongside the existing floor-only
`nodes: SceneNode[]`, and later a third sibling `rooms: RoomSceneNode[]` array. A
`WallSceneNode` carries the wall id, its owning floor id, its `start`/`end`
points, and its `thickness`; a `RoomSceneNode` carries the room id, its owning
floor id, the polygon, and the numeric area. The 2D plan reads `graph.walls` for
wall strokes and `graph.rooms` for the floor fill it paints beneath them; the
engine's `buildScene` still reads `graph.nodes` and was left untouched. Keeping
walls and rooms in their own arrays rather than folding them into `nodes` is what
let `buildScene` stay unchanged while the plan path got the geometry it needs. The
memoized deriver caches wall nodes by source-`Wall` reference and room nodes by
source-`Floor` reference in further `WeakMap`s, the same entity-keyed dirty
tracking ADR-0018 describes for floors. Rooms are a pure derived projection of the
wall topology and are never stored; the derivation algorithm is ADR-0026.

## Consequences

- Every piece of plan geometry and interaction logic (projection, the two-click
  state machine, hit testing, drawing) is a pure function unit-tested in plain
  Node. The React component carries no logic worth testing and is the only thing
  the end-to-end spec has to cover, keeping the browser-only surface minimal.
- The `PlanDrawingContext` seam is the reusable pattern for testing Canvas code:
  declare the narrow structural slice of the 2D context a function needs and
  drive it with a recording fake. New plan rendering (dimensions, labels, snap
  indicators) should extend that interface rather than depend on the full DOM
  type. The rubber-band start marker was the first such extension (it added
  `fillStyle`, `arc`, and `fill`), the room fill was the second (it added
  `closePath`), and the plan rulers were the third (they added `fillText`,
  `fillRect`, `font`, `textAlign`, and `textBaseline` for the ruler bands and
  tick labels, see ADR-0031), confirming the seam grows by a few members per
  feature rather than forcing a switch to the full DOM type. The snap indicator
  (ADR-0033) and the selection marquee plus selected-room highlight (ADR-0032)
  later confirmed the seam can also stay flat: both reused existing members and
  grew it by zero. The wall-editing endpoint handles (ADR-0035) grew it by zero
  as well, reusing the same `fillStyle`/`arc`/`fill` the rubber-band start marker
  added, and the room labels (ADR-0036) grew it by zero, reusing the rulers'
  `fillText`/`font`. The image underlay (ADR-0037) grew it by exactly two members:
  a `globalAlpha` property (set to the underlay's opacity for the draw and restored
  to 1) and the four-argument `drawImage` destination-rect method; its calibration
  measure line reused existing members and grew it by zero. The
  `ImageBitmap`-versus-`CanvasImageSource` gap at `drawImage` is bridged by a single
  cast at the one call site rather than by widening the seam.
- The wall-tool state machine is the template for future 2D-native tools
  (dimension placement, room labeling): an explicit state type plus a pure
  `advance` function that returns the next state and an optional command, with
  dispatch left to the glue. The calibration tool (`calibration-tool.ts`,
  ADR-0037) is the first worked instance: a two-state `advanceCalibrationTool` and
  a `calibrationPreviewSegment` projection mirroring `advanceWallTool` /
  `wallPreviewSegment`, emitting a plain measured segment (the glue, not the tool,
  converts it to underlay pixel space and dispatches `calibrateUnderlay`). In-progress visual feedback (the rubber-band
  preview) is its own pure read-only projection over the same state
  (`wallPreviewSegment`) rather than extra state on the machine, so a future tool
  gets its preview by adding a projection beside its `advance`, not by widening
  the machine.
- Live, per-cursor feedback fits the same redraw effect: the glue tracks the
  cursor in React state, derives a preview segment from the tool state, and
  threads it into `drawPlan` as an optional `preview`. The redraw keys off the
  preview alongside the walls and selection ids, so the rubber-band line tracks
  the pointer between clicks without coupling the pure modules to pointer events.
- Because the plan view dispatches the same `addWall` command and reads the same
  derived scene graph the future 3D view will, the section 6.5 "both views
  observe the same scene graph and dispatch the same commands" property holds at
  this seam.
- Selection in the plan is purely a bridge-store concern (ADR-0020): clicking
  selects or clears without producing an undo entry, and the redraw keys off the
  selection-ids snapshot. Selection later grew to rooms, additive multi-select,
  and a marquee, all backed by a broad-then-narrow hit test over a spatial index
  (ADR-0032), still without touching the undo history.
- UI chrome that carries text on a colored fill must clear WCAG AA contrast
  (4.5:1), independent of the canvas accent. The selected-wall accent `#1a7fd4`
  reads fine as a stroke on the plan but failed 4.5:1 under white label text when
  reused as the active tool button's fill, so the button uses a darker
  `#1670c9`. The convention: a color tuned for canvas strokes is not
  automatically a safe text-background fill; check the contrast pairing where the
  same accent reappears in DOM chrome.

## Alternatives considered

- **Keep geometry and interaction inside the React component.** Simplest to wire,
  but it makes none of the logic unit-testable and pushes all verification into
  the end-to-end run. Rejected for testability.
- **Type `drawPlan` against `CanvasRenderingContext2D` directly.** Would couple
  the pure drawing module to the full DOM type and make it awkward to fake in
  tests. The narrow `PlanDrawingContext` is the cheaper structural seam.
- **Fold wall nodes into the existing `nodes` array.** Would have forced
  `buildScene` and the floor-node consumers to discriminate node kinds for no
  current benefit. A separate `walls` array kept the engine path untouched.

## References

- Design specification, sections 6.1 (scene graph as the shared projection), 6.5
  (2D/3D sync), 6.9 (selection and 2D hit testing), and 6.11 (Canvas text and
  plan rendering).
- ADR-0018 (scene-graph derivation; the `walls` and `rooms` arrays and their
  per-entity memoization extend the same seam).
- ADR-0019 (the editor session and its version-memoized `getSceneGraph()`
  snapshot the plan view subscribes to).
- ADR-0020 (the bridge selection store the plan view drives and reads).
- ADR-0026 (room derivation via planar-face enumeration; the source of the
  `graph.rooms` polygons `drawPlan` fills).
- ADR-0031 (the interactive viewport projection: the pan `offset`, the
  zoom-about-cursor solve, the adaptive grid and rulers, the shared axis-sampling
  primitive, the five text/rect seam members rulers added, and the
  `use-viewport-controls.ts` camera-input glue split).
- ADR-0032 (selection and the broad-then-narrow hit test: the spatial-index
  broad phase, the room-containment fallback wrapping this `hitTestWalls`, the
  additive multi-select extension to the selection store, and the marquee).
- ADR-0033 (drawing snapping: the pure `snap.ts` model and the snap indicator
  painted through this `PlanDrawingContext` seam).
- ADR-0035 (wall editing: the pure `pickWallEndpoint` grab rule, the
  `endpointHandles` overlay painted through this seam with no seam growth, and the
  endpoint-drag glue that reuses the wall-tool preview channel and the snapping).
  </content>
