# Openings (Doors and Windows) Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The `test-author` works from the behavior description plus the public signatures in this plan and never reads implementation source; the `implementer` works from the failing-test output and never reads the test. Tasks marked `(infrastructure)` are controller-authored glue (React/Canvas/tool wiring, docs) with no RGB triple; they are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax. This plan describes each **behavior** and names the **signature** under test; it deliberately ships no literal test bodies or full implementations, only the public contract.

**Goal:** Make openings (doors and windows) first-class in the 2D plan: the user picks an opening type, clicks a wall to place it, sees the correct architectural plan symbol drawn into a gap in the host wall, selects it, drags it along its wall, edits its size and sill height, flips its swing, and removes it. Every edit flows through `dispatch(command)`, is undoable through the dispatcher's captured inverse, and round-trips through save and reload.

**Architecture:** An additive `Opening` record on `floor.openings[]` is typed at the element level (its `type` points to the `ElementTypeRegistry`) and wall-hosted (`hostWallId` plus a `position` along the wall plus an `orientation`). The opening's plan symbol is chosen by its element type's **operation family** (swing, slide, fold, pivot, cased, fixed window, crank window), so the broad residential vocabulary is a set of registry additions over a few shared symbol routines, and its **shape** is a registry parameter (rectangular this slice). Five undoable commands (`placeOpening`, `moveOpening`, `resizeOpening`, `flipOpening`, `removeOpening`) mirror the slice-12 underlay commands: each `apply` reassigns `state.floors` immutably so the dispatcher captures the inverse (ADR-0005). Pure `core` derives the opening's plan geometry from its host wall into an `OpeningSceneNode`; the Canvas paints each family's symbol through the existing narrow `PlanDrawingContext` seam (ADR-0021); openings join the slice-5 hit-test index and marquee (ADR-0032). A place-opening tool and an inline inspector mirror the slice-6 wall-editing interactions. An additive v2 to v3 schema migration backfills `openings: []`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Canvas 2D for the plan, React with React Testing Library, Vitest. No new dependencies.

---

## Scope boundary (parent spec sections 3.1, 3.2, 10 Phase 1; this is slice 7 of ~12)

This plan is **slice 7: openings (doors and windows: placement and editing)**, designed in `docs/specs/2026-06-07-openings-doors-and-windows.md` and recorded in ADR-0038. Slices 1 through 6, 8, 11, and 12 are done; this slice builds on the model (`core/model/types.ts`), the command and dispatch path (ADR-0005), the element-type registry (ADR-0006), the scene-graph derivation (ADR-0018), the Canvas seam (ADR-0021), the units module (ADR-0027), the hit-test index (ADR-0032), the wall-editing interactions (ADR-0035), and the additive-per-floor-entity command pattern (ADR-0037).

**In scope for slice 7** (full detail in the slice spec sections 2 and 4):

- The `Opening` and `OpeningOrientation` model, `Floor.openings`, the `WallEnd` lift to the model layer, the `createOpening` factory, and the expanded opening element types grouped by operation family.
- Five undoable commands (`placeOpening`, `moveOpening`, `resizeOpening`, `flipOpening`, `removeOpening`) and `registerOpeningCommands`.
- Pure opening geometry derivation and footprint, the `OpeningSceneNode` projection, and the v2 to v3 schema migration.
- The seven operation-family plan-symbol routines and the host-wall gap, painted through the `PlanDrawingContext` seam.
- Opening selection: the hit-test index entry (opening before wall before room) and marquee containment.
- The place-opening tool with a type chooser, the inline inspector (size, sill height, flip, remove), and drag-along-wall repositioning.

**Out of scope for slice 7, deferred with intent** (slice spec sections 2 and 13; ADR-0038):

- **Projecting windows (bay, bow, oriel, garden)** that change the floor footprint and feed room and area derivation: coupled to slice 9.
- **Shape variants (arched, half-round, round, lancet, Palladian, fanlight, eyebrow, octagonal):** a registry shape parameter plus curved rendering, Phase 4. The renderer reads shape from the element type now, so the parameter joins without a model change.
- **Period multi-element assemblies as one placeable surround;** transoms and sidelights are their own openings.
- **3D builders** (Phase 2), **trim and casing** (path-based, later), **rehosting an opening across walls by drag** (clamp to the host wall this slice), **opening-aware room derivation,** the **perpendicular-drag resize gizmo** (inline inspector instead), and **garage/skylight/dormer** (non-wall hosts).

**Acceptance for slice 7:** the five commands apply through the dispatcher and undo correctly through the captured inverse, leaving sibling floors and openings reference-equal; `createOpening` mints an opening with registry defaults and a default orientation; the opening geometry derives the center, along, normal, jamb points, and footprint, clamped to the host wall, skipping a missing host; the scene projection populates `graph.openings` and yields `[]` for a floor with no openings; the migration backfills `openings: []` so a version-2 project loads and round-trips; each family routine emits its expected draw calls and breaks the host wall through the seam; `hitTest` resolves an opening before a wall before a room and the marquee contains an opening by its footprint; the place-opening tool projects to the nearest wall and dispatches `placeOpening`; the inspector formats and parses with the units module and dispatches `resizeOpening`, `flipOpening`, and `removeOpening`; dragging a selected opening dispatches `moveOpening`. Full check chain green; `eslint .` at zero problems; `rgb:audit` clean; the wall-drawing end-to-end spec still passes and asserts the opening inspector appears when an opening is selected.

---

## File structure

New and modified files, grouped by responsibility:

```
core/
  model/types.ts                              (modify)  WallEnd (lifted), OpeningOrientation, Opening; Floor.openings
  model/factories.ts                          (modify)  createOpening, NewOpeningOptions, default-dimension constants; createFloor inits openings: []
  model/factories.test.ts                     (modify)  createOpening behavior (existing factory tests stay green)
  registries/element-types.ts                 (modify)  OpeningFamily, OpeningTypeParameters, opening? on ElementType, the opening entries, version 2
  registries/element-types.test.ts            (modify)  opening-entry and version behavior
  commands/handlers/opening-commands.ts       (create)  the five commands, handlers, registerOpeningCommands
  commands/handlers/opening-commands.test.ts  (create)  each command apply + framework-captured inverse
  commands/handlers/wall-commands.ts          (modify, infra)  import WallEnd from the model instead of defining it
  topology/openings.ts                        (create)  deriveOpeningGeometry, openingFootprint
  topology/openings.test.ts                   (create)
  scene/scene-graph.ts                        (modify)  OpeningSceneNode, deriveOpeningNode, deriveOpeningNodesForFloor, graph.openings
  scene/scene-graph.test.ts                   (modify)  opening projection (existing derivation tests stay green)
  migrations/schema/add-floor-openings.ts     (create)  addFloorOpeningsMigration (from: 2)
  migrations/schema/add-floor-openings.test.ts(create)
  migrations/schema/index.ts                  (modify, infra)  add the migration to SCHEMA_MIGRATIONS
  model/factories.ts                          (modify, infra)  CURRENT_SCHEMA_VERSION 2 -> 3 (in the factories module)
  index.ts                                    (modify, infra)  export the new types, creators, commands, and scene members

editor/plan/
  draw-opening.ts                             (create)  DrawableOpening, drawOpening, the seven family routines, the wall gap
  draw-opening.test.ts                        (create)  per-family draw calls against a recording PlanDrawingContext fake
  draw-plan.ts                                (modify)  openings?: readonly DrawableOpening[] option; paint order
  draw-plan.test.ts                           (modify)  drawPlan draws openings in order (existing tests stay green)
  hit-test.ts                                 (modify)  openingBounds, hitTestOpenings, openings in the index, opening-before-wall-before-room
  hit-test.test.ts                            (modify)  opening hit behavior (existing wall/room tests stay green)
  marquee.ts                                  (modify)  openingContained; openings in entitiesInRect
  marquee.test.ts                             (modify)  opening containment (existing tests stay green)
  place-opening.ts                            (create)  placeOpeningTarget pure placement rule
  place-opening.test.ts                       (create)
  opening-drag.ts                             (create)  openingDragPosition pure drag-to-position rule
  opening-drag.test.ts                        (create)
  use-opening-tool.ts                         (create, infra)  place-opening pointer lifecycle
  use-opening-editing.ts                      (create, infra)  drag-along-wall reposition lifecycle
  opening-inspector.tsx                       (create)  inline size/sill/flip/remove editor
  opening-inspector.test.tsx                  (create)  component behavior (React Testing Library)
  plan-view.tsx                               (modify, infra)  build DrawableOpening[]; compose the opening tool and drag glue
  opening-type-chooser.tsx                    (create, infra)  the place-opening type palette

editor/tools/
  active-tool-context.ts                      (modify, infra)  ToolId gains 'place-opening'
  tools-panel.tsx                             (modify, infra)  the Opening tool button

editor/shell/
  editor-shell.tsx                            (modify, infra)  render the opening inspector and the type chooser in the inspector

ROADMAP.md                                    (modify, infra)  mark slice 7 done; record deferrals
docs/knowledge/decisions/ADR-0038-openings-doors-and-windows.md  (modify, infra)  refresh status to landed at PR
```

There is no barrel under `editor/plan/`; modules import directly from siblings and from `core` via its barrel, matching slices 1 through 6, 8, and 12. The pure, unit-tested modules carry the behavior: `element-types.ts`, `factories.ts`, `opening-commands.ts`, `topology/openings.ts`, `scene-graph.ts`, `add-floor-openings.ts`, `draw-opening.ts`, `hit-test.ts`, `marquee.ts`, `place-opening.ts`, `opening-drag.ts`, and `opening-inspector.tsx` (a DOM component with its own RTL test). The hooks (`use-opening-tool.ts`, `use-opening-editing.ts`), the chooser, and the `plan-view.tsx` and shell composition are coverage-excluded glue (jsdom has no 2D canvas), validated by the wall-drawing end-to-end spec.

### Public contract (the signatures the test-author writes against and the implementer implements)

```ts
// core/model/types.ts (WallEnd lifted here so core/model does not depend on core/commands)
export type WallEnd = 'start' | 'end'
export interface OpeningOrientation {
  hinge: WallEnd // which jamb anchors the leaf, as the host-wall end nearer it
  facing: 'positive' | 'negative' // sign of the wall's left-hand normal the leaf opens toward
}
export interface Opening {
  id: string
  type: string // ElementType id, category 'opening'
  hostWallId: string
  position: number // mm from host wall start to the opening center, along the wall
  width: number
  height: number
  sillHeight: number
  orientation: OpeningOrientation
}
// Floor gains: openings: Opening[]   (sibling of walls and underlays)

// core/registries/element-types.ts
export type OpeningFamily =
  | 'swing'
  | 'slide'
  | 'fold'
  | 'pivot'
  | 'cased'
  | 'window-fixed'
  | 'window-crank'
export interface OpeningTypeParameters {
  family: OpeningFamily
  double?: boolean // two leaves drawn (double swing, French)
  defaultWidth: number
  defaultHeight: number
  defaultSillHeight: number
}
export interface ElementType extends RegistryEntry {
  category: ElementCategory
  plan2D: Plan2DSymbol
  scene3D: Scene3DReference
  opening?: OpeningTypeParameters // present iff category === 'opening'
}
export const ELEMENT_TYPE_REGISTRY_VERSION = 2

// core/model/factories.ts
export const CURRENT_SCHEMA_VERSION = 3
export interface NewOpeningOptions {
  type: string
  hostWallId: string
  position: number
  width?: number // default DEFAULT_OPENING_WIDTH_MM
  height?: number // default DEFAULT_OPENING_HEIGHT_MM
  sillHeight?: number // default 0
  orientation?: OpeningOrientation // default { hinge: 'start', facing: 'positive' }
  id?: string
}
export function createOpening(options: NewOpeningOptions): Opening

// core/commands/handlers/opening-commands.ts
export const PLACE_OPENING = 'floor/place-opening'
export const MOVE_OPENING = 'floor/move-opening'
export const RESIZE_OPENING = 'floor/resize-opening'
export const FLIP_OPENING = 'floor/flip-opening'
export const REMOVE_OPENING = 'floor/remove-opening'
export type OpeningOrientationAxis = 'hinge' | 'facing'
export interface OpeningDimensions {
  width: number
  height: number
  sillHeight: number
}
export interface PlaceOpeningParams {
  floorId: string
  opening: Opening
}
export interface MoveOpeningParams {
  floorId: string
  openingId: string
  position: number
}
export interface ResizeOpeningParams {
  floorId: string
  openingId: string
  dimensions: OpeningDimensions
}
export interface FlipOpeningParams {
  floorId: string
  openingId: string
  axis: OpeningOrientationAxis
}
export interface RemoveOpeningParams {
  floorId: string
  openingId: string
}
export function placeOpening(floorId: string, opening: Opening): Command<PlaceOpeningParams>
export function moveOpening(
  floorId: string,
  openingId: string,
  position: number,
): Command<MoveOpeningParams>
export function resizeOpening(
  floorId: string,
  openingId: string,
  dimensions: OpeningDimensions,
): Command<ResizeOpeningParams>
export function flipOpening(
  floorId: string,
  openingId: string,
  axis: OpeningOrientationAxis,
): Command<FlipOpeningParams>
export function removeOpening(floorId: string, openingId: string): Command<RemoveOpeningParams>
export function registerOpeningCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project>

// core/topology/openings.ts
export interface OpeningGeometry {
  center: Point
  along: Point // unit vector, host wall start -> end
  normal: Point // unit left-hand normal of `along`
  width: number // the effective (clamped) width
  jambStart: Point // center - along * width / 2
  jambEnd: Point // center + along * width / 2
}
/** Resolve the opening's plan geometry against its host wall, clamping the center so the opening stays on the wall. */
export function deriveOpeningGeometry(opening: Opening, hostWall: Wall): OpeningGeometry
/** The four footprint corners (width along the wall by `thickness` across), centered on `center`. */
export function openingFootprint(
  center: Point,
  along: Point,
  normal: Point,
  width: number,
  thickness: number,
): [Point, Point, Point, Point]

// core/scene/scene-graph.ts
export const OPENING_NODE_PREFIX = 'opening:'
export interface OpeningSceneNode {
  id: string // `opening:<id>`
  kind: 'opening'
  floorId: string
  type: string
  center: Point
  along: Point
  normal: Point
  width: number
  height: number
  sillHeight: number
  hostThickness: number
  orientation: OpeningOrientation
}
export function deriveOpeningNode(floor: Floor, opening: Opening, hostWall: Wall): OpeningSceneNode
export function deriveOpeningNodesForFloor(floor: Floor): OpeningSceneNode[] // skips openings whose hostWallId is absent
// SceneGraph gains: openings: OpeningSceneNode[]; deriveSceneGraph flat-maps deriveOpeningNodesForFloor

// core/migrations/schema/add-floor-openings.ts
export const addFloorOpeningsMigration: SchemaMigration // from: 2; ensures every floor has openings: [] (and underlays: [])

// editor/plan/draw-opening.ts
export interface DrawableOpening {
  node: OpeningSceneNode
  symbol: string // the element type's plan2D.symbol family routine id
  double: boolean
  selected: boolean
}
export function drawOpening(
  ctx: PlanDrawingContext,
  opening: DrawableOpening,
  viewport: Viewport,
): void
// DrawPlanOptions gains: openings?: readonly DrawableOpening[]

// editor/plan/hit-test.ts (additions; existing hitTest signature unchanged)
export function openingBounds(opening: OpeningSceneNode): Bounds
export function hitTestOpenings(
  openings: OpeningSceneNode[],
  point: Point,
  tolerance: number,
): string | null
// hitTest now resolves an opening before a wall before a room

// editor/plan/marquee.ts (addition; existing entitiesInRect signature unchanged)
// entitiesInRect now also returns openings whose footprint lies fully inside rect

// editor/plan/place-opening.ts
export interface OpeningPlacement {
  floorId: string
  hostWallId: string
  position: number
}
/** The nearest wall within tolerance and the along-wall position under `world`, or null. */
export function placeOpeningTarget(
  scene: SceneGraph,
  world: Point,
  tolerance: number,
): OpeningPlacement | null

// editor/plan/opening-drag.ts
/** The along-wall position (mm from host wall start) of `world` projected onto the opening's host wall. */
export function openingDragPosition(opening: OpeningSceneNode, world: Point): number
```

Default dimension constants (rounded to whole millimeters, used by `createOpening` and the registry entries): `DEFAULT_OPENING_WIDTH_MM = 813`, `DEFAULT_OPENING_HEIGHT_MM = 2032`. The registry entries carry per-type defaults from the table below.

### Opening element types (registry entries, `category: 'opening'`)

| id                           | plan2D.symbol   | opening.family | double | defaultWidth | defaultHeight | defaultSillHeight |
| ---------------------------- | --------------- | -------------- | ------ | ------------ | ------------- | ----------------- |
| `single-swing-door` (exists) | `door-swing`    | swing          | --     | 813          | 2032          | 0                 |
| `double-swing-door`          | `door-swing`    | swing          | true   | 1626         | 2032          | 0                 |
| `french-door`                | `door-swing`    | swing          | true   | 1626         | 2032          | 0                 |
| `dutch-door`                 | `door-swing`    | swing          | --     | 813          | 2032          | 0                 |
| `pocket-door`                | `door-slide`    | slide          | --     | 813          | 2032          | 0                 |
| `bypass-door`                | `door-slide`    | slide          | --     | 1524         | 2032          | 0                 |
| `sliding-glass-door`         | `door-slide`    | slide          | --     | 1829         | 2032          | 0                 |
| `barn-door`                  | `door-slide`    | slide          | --     | 965          | 2032          | 0                 |
| `bifold-door`                | `door-fold`     | fold           | --     | 813          | 2032          | 0                 |
| `pivot-door`                 | `door-pivot`    | pivot          | --     | 914          | 2438          | 0                 |
| `cased-opening`              | `cased-opening` | cased          | --     | 914          | 2032          | 0                 |
| `double-hung-window`         | `window-fixed`  | window-fixed   | --     | 900          | 1200          | 900               |
| `single-hung-window`         | `window-fixed`  | window-fixed   | --     | 900          | 1200          | 900               |
| `sliding-window`             | `window-fixed`  | window-fixed   | --     | 1200         | 900           | 1000              |
| `picture-window`             | `window-fixed`  | window-fixed   | --     | 1500         | 1500          | 600               |
| `casement-window`            | `window-crank`  | window-crank   | --     | 600          | 1200          | 900               |
| `awning-window`              | `window-crank`  | window-crank   | --     | 900          | 600           | 1500              |
| `hopper-window`              | `window-crank`  | window-crank   | --     | 900          | 600           | 300               |
| `transom-window`             | `window-fixed`  | window-fixed   | --     | 900          | 400           | 2032              |
| `sidelight-window`           | `window-fixed`  | window-fixed   | --     | 300          | 2032          | 0                 |

The existing `single-swing-door` entry keeps its `plan2D.symbol` (`door-swing`) and `scene3D.builder` (`door-frame`) and gains the `opening` record. Every entry keeps a `scene3D` reference (reuse `door-frame` for doors and a new `window-frame` for windows; unused this slice, reserved for Phase 2).

---

## Section A: model, registry, and factory (`core`)

### Task A1: opening element types in the registry

**Files:** Modify `core/registries/element-types.ts`, `core/registries/element-types.test.ts`; export the new types from `core/index.ts` (infra).

- [ ] **RED.** `/test-first`: the registry exposes each opening type from the table with the right `category: 'opening'`, `plan2D.symbol`, and `opening` parameters (family, `double`, default dimensions), and `ELEMENT_TYPE_REGISTRY_VERSION` is 2. Signature: `OpeningFamily`, `OpeningTypeParameters`, `opening?` on `ElementType`, the entries in `builtinElementTypes`. Verify the test fails (the new types and entries do not exist).
- [ ] **GREEN.** `/implement`: add `OpeningFamily`, `OpeningTypeParameters`, the optional `opening` field, the twenty opening entries from the table, and bump the version constant. Verify the test passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor` (watch for repetition across the entries; a small entry-builder helper is acceptable only if it reads clearly). Then export `OpeningFamily` and `OpeningTypeParameters` from `core/index.ts` (infra).
- [ ] **Commit** is handled per phase by the subagents (`test:`, `feat:`, `refactor:`).

### Task A2: the Opening model and the createOpening factory

**Files:** Modify `core/model/types.ts`, `core/model/factories.ts`, `core/model/factories.test.ts`; modify `core/commands/handlers/wall-commands.ts` to import `WallEnd` from the model (infra); export from `core/index.ts` (infra).

- [ ] **RED.** `/test-first`: `createOpening` mints an opening with a fresh id, the given `type`/`hostWallId`/`position`, the registry default dimensions for its type when width/height/sillHeight are omitted, and the default orientation `{ hinge: 'start', facing: 'positive' }`; an explicit `id`, dimensions, or orientation override the defaults; and `createFloor` initializes `openings: []`. Signatures: `Opening`, `OpeningOrientation`, `WallEnd` (in the model), `Floor.openings`, `NewOpeningOptions`, `createOpening`, `DEFAULT_OPENING_WIDTH_MM`, `DEFAULT_OPENING_HEIGHT_MM`. Verify it fails.
- [ ] **GREEN.** `/implement`: lift `WallEnd` into `core/model/types.ts`, add `OpeningOrientation` and `Opening`, add `openings: Opening[]` to `Floor`, add the default constants, and implement `createOpening` (resolving registry defaults from `builtinElementTypes` for the named `type`, falling back to the module constants when the type carries no `opening` record), and initialize `openings: []` in `createFloor`. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`. Then (infra) point `core/commands/handlers/wall-commands.ts` at the model's `WallEnd` (remove its local definition; `core/index.ts` re-exports `WallEnd` from the model now), and export `Opening`, `OpeningOrientation`, `NewOpeningOptions`, `createOpening`, and the constants from `core/index.ts`. Run the full check chain to confirm the lift broke nothing.

---

## Section B: the opening commands (`core/commands/handlers/opening-commands.ts`)

Each command mirrors the slice-12 underlay commands: a `type` constant, a params interface, a creator returning `{ type, params, description }`, and a `CommandHandler` whose `apply` reassigns `state.floors` immutably so the root inverse-capture proxy records the change and the dispatcher captures the inverse (ADR-0005). The four single-opening updates will share `mapTargetFloor` and `mapTargetOpening` helpers; let that sharing emerge in the BLUE phases rather than authoring it up front.

### Task B1: placeOpening

**Files:** Create `core/commands/handlers/opening-commands.ts`, `core/commands/handlers/opening-commands.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED.** `/test-first`: dispatching `placeOpening(floorId, opening)` appends the opening to the target floor's `openings`, leaves sibling floors reference-equal, and undo removes it. Signatures: `PLACE_OPENING`, `PlaceOpeningParams`, `placeOpening`, `registerOpeningCommands`. (The test constructs a `Dispatcher` with `registerOpeningCommands`, as the underlay-command test does.) Verify it fails.
- [ ] **GREEN.** `/implement`: the `PLACE_OPENING` constant, params, creator, the append handler, and `registerOpeningCommands` registering it. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`; export the new symbols from `core/index.ts` (infra).

### Task B2: moveOpening

**Files:** Modify `core/commands/handlers/opening-commands.ts`, `core/commands/handlers/opening-commands.test.ts`.

- [ ] **RED.** `/test-first`: `moveOpening(floorId, openingId, position)` sets the target opening's `position`, leaves other openings and floors reference-equal, and undo restores the prior position. Signatures: `MOVE_OPENING`, `MoveOpeningParams`, `moveOpening`. Verify it fails.
- [ ] **GREEN.** `/implement` the constant, params, creator, and handler; register it. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor` (the `mapTargetFloor` + `mapTargetOpening` shared shape may surface here).

### Task B3: resizeOpening

**Files:** Modify `core/commands/handlers/opening-commands.ts`, `core/commands/handlers/opening-commands.test.ts`.

- [ ] **RED.** `/test-first`: `resizeOpening(floorId, openingId, { width, height, sillHeight })` sets the three dimensions together, leaves siblings reference-equal, and undo restores the prior dimensions. Signatures: `RESIZE_OPENING`, `ResizeOpeningParams`, `OpeningDimensions`, `resizeOpening`. Verify it fails.
- [ ] **GREEN.** `/implement` and register. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`.

### Task B4: flipOpening

**Files:** Modify `core/commands/handlers/opening-commands.ts`, `core/commands/handlers/opening-commands.test.ts`.

- [ ] **RED.** `/test-first`: `flipOpening(floorId, openingId, 'hinge')` toggles `orientation.hinge` between `start` and `end`; `flipOpening(..., 'facing')` toggles `orientation.facing` between `positive` and `negative`; the other axis is untouched; undo restores the prior orientation. Signatures: `FLIP_OPENING`, `FlipOpeningParams`, `OpeningOrientationAxis`, `flipOpening`. Verify it fails.
- [ ] **GREEN.** `/implement` and register. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`.

### Task B5: removeOpening

**Files:** Modify `core/commands/handlers/opening-commands.ts`, `core/commands/handlers/opening-commands.test.ts`.

- [ ] **RED.** `/test-first`: `removeOpening(floorId, openingId)` filters the target opening out, leaves the others reference-equal, and undo restores it at its position in the array. Signatures: `REMOVE_OPENING`, `RemoveOpeningParams`, `removeOpening`. Verify it fails.
- [ ] **GREEN.** `/implement` and register. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`; confirm all five are exported from `core/index.ts` (infra).

---

## Section C: opening geometry (`core/topology/openings.ts`)

### Task C1: deriveOpeningGeometry and openingFootprint

**Files:** Create `core/topology/openings.ts`, `core/topology/openings.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED.** `/test-first`: for a horizontal host wall, `deriveOpeningGeometry` returns a `center` at `start + along * position`, a unit `along` (start -> end), a unit left-hand `normal`, and jamb points at `center +/- along * width / 2`; the center is clamped so the opening stays within `[width / 2, length - width / 2]` (an over-far `position` clamps to the wall end; a `width` wider than the wall clamps to span the wall); and `openingFootprint(center, along, normal, width, thickness)` returns the four corners `center +/- along*width/2 +/- normal*thickness/2`. Signatures: `OpeningGeometry`, `deriveOpeningGeometry`, `openingFootprint`. Verify it fails.
- [ ] **GREEN.** `/implement` (reuse `distance` from `core/geometry/point` for the wall length; the normal is `(-along.y, along.x)`). Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`; export from `core/index.ts` (infra).

---

## Section D: the scene-graph projection (`core/scene/scene-graph.ts`)

### Task D1: OpeningSceneNode and the derivation

**Files:** Modify `core/scene/scene-graph.ts`, `core/scene/scene-graph.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED.** `/test-first`: `deriveOpeningNodesForFloor` produces one `OpeningSceneNode` per opening with a `opening:<id>` id, the owning `floorId`, the element `type`, the derived `center`/`along`/`normal`/`width` from the host wall, the passthrough `height`/`sillHeight`/`orientation`, and the resolved `hostThickness`; an opening whose `hostWallId` matches no wall is skipped; and `deriveSceneGraph` populates `graph.openings` by flat-mapping the floors, yielding `[]` for a floor with no openings. Signatures: `OPENING_NODE_PREFIX`, `OpeningSceneNode`, `deriveOpeningNode`, `deriveOpeningNodesForFloor`, `SceneGraph.openings`. Verify it fails.
- [ ] **GREEN.** `/implement` (resolve the host wall by id within `floor.walls`, call `deriveOpeningGeometry`, copy the passthrough fields and `hostWall.thickness`). Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`; export the new scene members from `core/index.ts` (infra).

---

## Section E: the schema migration (`core/migrations/`)

### Task E1: addFloorOpeningsMigration (version 2 to 3)

**Files:** Create `core/migrations/schema/add-floor-openings.ts`, `core/migrations/schema/add-floor-openings.test.ts`; modify `core/migrations/schema/index.ts` and `core/model/factories.ts` `CURRENT_SCHEMA_VERSION` (infra).

- [ ] **RED.** `/test-first`: `addFloorOpeningsMigration.from` is 2, and `migrate` returns a `ProjectShape` whose every floor has an `openings: []` array (and an `underlays: []` array) when absent, leaving floors that already carry them and all other data untouched (it does not set `meta.schemaVersion`). Signature: `addFloorOpeningsMigration`. Verify it fails.
- [ ] **GREEN.** `/implement` the migration (map `project.floors`, defaulting `openings` and `underlays` to `[]` when missing). Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`. Then (infra) add `addFloorOpeningsMigration` to `SCHEMA_MIGRATIONS`, bump `CURRENT_SCHEMA_VERSION` to 3, and run `migrate.test.ts` plus the full chain to confirm the v1 -> v2 -> v3 chain and the round-trip hold.

---

## Section F: Canvas rendering (`editor/plan/draw-opening.ts`, `draw-plan.ts`)

`drawOpening` paints through the `PlanDrawingContext` seam only, using members already on it (`beginPath`, `moveTo`, `lineTo`, `arc`, `closePath`, `stroke`, `fill`, `fillStyle`, `strokeStyle`, `lineWidth`). The seam grows by nothing. Tests use a recording fake that records the calls each routine emits, exactly as `draw-plan.test.ts` and `draw-underlay.test.ts` do. The pocket-door panel is drawn solid this slice (dashing is deferred so the seam needs no `setLineDash`). World points project through `worldToScreen(point, viewport)`.

### Task F1: drawOpening dispatch, the wall gap, and the swing routine

**Files:** Create `editor/plan/draw-opening.ts`, `editor/plan/draw-opening.test.ts`.

- [ ] **RED.** `/test-first`: `drawOpening` first paints the host-wall gap (fills the opening footprint in the background color so the wall stroke is broken, then strokes the two jamb caps), then dispatches on `opening.symbol`; for `door-swing` it strokes a leaf line from the hinge jamb and an `arc` to the facing side, and when `double` is true it strokes two mirrored leaves and arcs; a `selected` opening adds a highlight stroke. Signatures: `DrawableOpening`, `drawOpening`. Verify it fails.
- [ ] **GREEN.** `/implement` the gap, the dispatch skeleton, and the `door-swing` routine (single and double). Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`.

### Task F2: the remaining family routines

**Files:** Modify `editor/plan/draw-opening.ts`, `editor/plan/draw-opening.test.ts`.

- [ ] **RED.** `/test-first`: `door-slide` strokes an offset panel parallel to the wall plus a track line (the pocket variant offsets the panel into the wall, solid); `door-fold` strokes a two-segment zigzag from the hinge jamb; `door-pivot` strokes a leaf, a pivot dot (`arc` filled), and a swing arc; `cased-opening` strokes only the jamb caps and the gap, no leaf; `window-fixed` strokes the jamb lines and a single glazing line across the gap; `window-crank` strokes `window-fixed` plus an opening-direction tick on the facing side. Verify it fails.
- [ ] **GREEN.** `/implement` the six routines, dispatched from `drawOpening`. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor` (a shared "jamb-relative segment" helper may surface; keep each routine readable).

### Task F3: drawPlan draws openings in order

**Files:** Modify `editor/plan/draw-plan.ts`, `editor/plan/draw-plan.test.ts`; (infra) `editor/plan/plan-view.tsx`.

- [ ] **RED.** `/test-first`: given `openings: readonly DrawableOpening[]` on `DrawPlanOptions`, `drawPlan` calls the opening rendering for each opening after the walls and before the room labels, and a `drawPlan` call with no `openings` paints exactly as before (existing tests stay green). Signature: `DrawPlanOptions.openings`. Verify it fails.
- [ ] **GREEN.** `/implement`: thread `openings` through `drawPlan` in the documented paint order (underlays, grid, room fills, walls, openings, preview/snap/marquee, room labels, calibration, rulers). Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`. Then (infra) in `plan-view.tsx` build `DrawableOpening[]` from `scene.openings` (resolve each node's `symbol` and `double` from `builtinElementTypes` by `node.type`, and `selected` from the selection set) and pass it to `drawPlan`.

---

## Section G: selection and hit-testing (`editor/plan/hit-test.ts`, `marquee.ts`)

### Task G1: openings in the hit-test (opening before wall before room)

**Files:** Modify `editor/plan/hit-test.ts`, `editor/plan/hit-test.test.ts`.

- [ ] **RED.** `/test-first`: `openingBounds` spans an opening's footprint; `hitTestOpenings` returns the id of an opening whose footprint contains the point (within tolerance) or null; and `hitTest` returns an opening id when the point is on an opening even though that point is also on the host wall (opening before wall), still returns a wall when no opening is hit, and still falls back to a room. Signatures: `openingBounds`, `hitTestOpenings`. Verify it fails.
- [ ] **GREEN.** `/implement`: add openings to `indexEntities`, add `openingBounds` (via `openingFootprint`) and `hitTestOpenings` (point-in-footprint using `pointInPolygon` over the four corners), and check openings first in `hitTest`. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`.

### Task G2: openings in the marquee

**Files:** Modify `editor/plan/marquee.ts`, `editor/plan/marquee.test.ts`.

- [ ] **RED.** `/test-first`: `entitiesInRect` returns an opening's id when all four footprint corners lie inside the rectangle and excludes a partially overlapping opening; existing wall and room containment is unchanged. Verify it fails.
- [ ] **GREEN.** `/implement` `openingContained` (every footprint corner in the rect) and include openings in `entitiesInRect`. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`.

---

## Section H: placement and editing interactions (`editor/plan/`, `editor/tools/`, `editor/shell/`)

### Task H1a: the placement target rule (pure)

**Files:** Create `editor/plan/place-opening.ts`, `editor/plan/place-opening.test.ts`.

- [ ] **RED.** `/test-first`: `placeOpeningTarget(scene, world, tolerance)` returns the `floorId`, `hostWallId`, and along-wall `position` for the nearest wall within tolerance of `world` (projecting `world` onto that wall's centerline), and null when no wall is in range. Signatures: `OpeningPlacement`, `placeOpeningTarget`. Verify it fails.
- [ ] **GREEN.** `/implement` (reuse the nearest-wall logic shape from `hitTestWalls`; project the point onto the chosen wall to get the position). Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`.

### Task H1b: the place-opening tool (infrastructure)

**Files:** (infra) Modify `editor/tools/active-tool-context.ts` (`ToolId` gains `'place-opening'`), `editor/tools/tools-panel.tsx` (the Opening tool button), create `editor/plan/opening-type-chooser.tsx` and `editor/plan/use-opening-tool.ts`, modify `editor/plan/plan-view.tsx` and `editor/shell/editor-shell.tsx`.

- [ ] **Build the glue:** add the `place-opening` tool; render the type chooser (the in-scope opening ids grouped door/window) in the shell; on a click under the tool, call `placeOpeningTarget`, and on a hit dispatch `placeOpening(target.floorId, createOpening({ type: chosenType, hostWallId: target.hostWallId, position: target.position }))`. Leave the wall-draw and select paths untouched. Reviewed by `/clean-code-review`; validated by the end-to-end spec.

### Task H2: the opening inspector (component, RTL-tested)

**Files:** Create `editor/plan/opening-inspector.tsx`, `editor/plan/opening-inspector.test.tsx`; (infra) render it from `editor/shell/editor-shell.tsx`.

- [ ] **RED.** `/test-first` (React Testing Library): given a single selected opening, the inspector shows its width, height, and sill height formatted with `formatLength` and, on a committed valid edit, dispatches `resizeOpening` with the `parseLength`-parsed values (an unparseable entry dispatches nothing); the flip controls dispatch `flipOpening` with `'hinge'` and `'facing'`; the remove control dispatches `removeOpening`. The component takes the selected opening node, `units`, and `dispatch` as props (no canvas dependency). Verify it fails.
- [ ] **GREEN.** `/implement` the component. Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`. Then (infra) render the inspector in the shell inspector when exactly one opening is selected, deriving the raw opening from the selected `opening:<id>` and resolving `units` from the project.

### Task H3a: the drag-to-position rule (pure)

**Files:** Create `editor/plan/opening-drag.ts`, `editor/plan/opening-drag.test.ts`.

- [ ] **RED.** `/test-first`: `openingDragPosition(opening, world)` projects `world` onto the host wall axis through the opening's `center`/`along` and returns the along-wall position in millimeters (clamped is the deriver's job, not this rule's). Signature: `openingDragPosition`. Verify it fails.
- [ ] **GREEN.** `/implement` (the scalar projection of `world - (center - along*width/2 ...)`; define the position relative to the host wall start using the node's geometry). Verify it passes.
- [ ] **BLUE.** `/clean-code-review` then `/refactor`.

### Task H3b: the opening drag lifecycle (infrastructure)

**Files:** (infra) Create `editor/plan/use-opening-editing.ts`; modify `editor/plan/plan-view.tsx`.

- [ ] **Build the glue:** under the select tool, when a single opening is selected, grab it on pointer-down within its footprint, live-preview the drag, and dispatch `moveOpening(floorId, openingId, openingDragPosition(node, world))` on release. Reviewed by `/clean-code-review`; validated by the end-to-end spec.

### Task H4: plan-view composition and the end-to-end assertion (infrastructure)

**Files:** (infra) Modify `editor/plan/plan-view.tsx` and the wall-drawing end-to-end spec.

- [ ] **Compose** the opening tool, the drag hook, and the `DrawableOpening[]` rendering into `plan-view.tsx` alongside the existing hooks, and extend the wall-drawing end-to-end spec to assert that placing an opening and selecting it shows the opening inspector (mirroring the slice-6 thickness assertion). Confirm the wall-drawing flow itself is unchanged.

---

## Section I: documentation (infrastructure)

### Task I1: roadmap and ADR refresh

**Files:** (infra) Modify `ROADMAP.md` and `docs/knowledge/decisions/ADR-0038-openings-doors-and-windows.md`.

- [ ] Mark slice 7 done in `ROADMAP.md` (the slice table and the status line) with the deferrals from the scope boundary, mirroring the slice-6 and slice-12 entries. Refresh ADR-0038's status to landed with the PR and merge reference (the `knowledge-curator` does this at PR time). No change to the authoritative parent spec.

---

## Self-review

- **Spec coverage:** model and factory (A), the five commands (B), geometry (C), scene projection (D), migration (E), the seven family symbols and the wall gap (F), selection and marquee (G), placement, inspector, and drag (H), docs (I) — every slice-spec goal maps to a task; every deferral is recorded in the scope boundary.
- **Type consistency:** `WallEnd` is single-sourced in `core/model/types.ts` and reused by `OpeningOrientation.hinge` and the wall commands; `OpeningDimensions` is used by `resizeOpening` and the inspector; `OpeningSceneNode` is produced in D and consumed by F, G, and H; `DrawableOpening` is produced in plan-view glue and consumed by `drawOpening` and `drawPlan`; `OpeningPlacement` and `placeOpeningTarget` feed the H1b dispatch.
- **No placeholders:** every task names its signature and its behavior; default dimensions and the type-to-symbol mapping are tabulated rather than left to the implementer.

```

```
