# Slice design: openings (doors and windows)

Status: approved for planning (2026-06-07)
Scope owner: the openings slice (branch `feat/openings-doors-and-windows`), slice 7 of the Phase 1 two-dimensional plan editor
Authoritative parent spec: `docs/specs/2026-06-01-vernacular-design.md`, sections 3.1, 3.2, and the section 10 Phase 1 deliverables "Opening placement" and "Opening editing"

## 1. Purpose

The plan editor can draw, edit, select, and label walls and rooms, but a floor
plan is not a floor plan without doors and windows. This slice makes openings
first-class: the user picks an opening type, clicks a wall to place it, sees the
correct architectural plan symbol drawn into a gap in the wall, selects it, drags
it along its host wall, edits its size and sill height, flips its swing, and
removes it. Every edit is undoable and persists with the project.

The behavioral contract this slice satisfies: **an opening is a typed,
wall-hosted entity that derives its plan geometry from its host wall and its
shape from the element-type registry, places and edits through `dispatch`, and
round-trips through save and reload without loss.**

Openings are the first entity the design specification models as a general
**wall-hosted** relationship (host wall, position along the wall, perpendicular
facing) rather than a door/window special case (parent spec section 3.2, the
"turrets and bay windows" note in section 2). Furniture and wall features reuse
that host relationship in later phases, so the attachment model this slice
establishes is load-bearing beyond doors and windows.

## 2. Goals and non-goals

The scope question for this slice is breadth of opening vocabulary. The parent
spec's terse Phase 1 list (single and double swing doors, double-hung, picture,
casement) is expanded here, by user direction, to the common residential
vocabulary. The expansion is cheap because of the spec's own discipline: a 2D
plan symbol is driven by how an opening **operates** (swing, slide, fold, fixed,
crank), and its **shape** is a registry parameter, so most named types collapse
onto a small set of shared symbol routines and become registry additions, not
new code (parent spec section 3.2, "building shell is typed at the element
level"; section 79, "rendering must read shape from the element type"). Section 4
catalogs the full vocabulary and marks the now/deferred line.

### Goals

- An additive `Opening` model on `floor.openings[]`: a typed, wall-hosted record
  (`type` into the `ElementTypeRegistry`, `hostWallId`, `position` along the
  wall, `width`, `height`, `sillHeight`, `orientation`).
- An expanded set of opening element types in the `ElementTypeRegistry`, grouped
  by operation family, each carrying its plan-symbol id and default dimensions.
- Five undoable commands through `dispatch`: `placeOpening`, `moveOpening`,
  `resizeOpening`, `flipOpening`, `removeOpening`, each reassigning `state.floors`
  immutably so the dispatcher captures the inverse (ADR-0005).
- Pure opening geometry derivation: resolve the host wall, compute the opening's
  center, along-wall direction, normal, jamb points, and host-wall gap, clamped
  to the host wall, projected into an `OpeningSceneNode` alongside walls and
  rooms (ADR-0018).
- Canvas rendering of each operation family's plan symbol through the existing
  narrow `PlanDrawingContext` seam (ADR-0021), including the wall gap, reading
  shape from the element type.
- Opening selection: openings register bounds with the slice-5 hit-test index and
  participate in click, shift-click, and marquee selection, with an opening
  beating a wall beating a room under the cursor (ADR-0032). Selected openings
  get a highlight.
- A place-opening tool and an inline opening inspector (size, sill height, flip,
  remove), plus drag-along-wall repositioning, mirroring the slice-6 wall editing
  interactions.
- An additive schema bump (v2 to v3) with a migration that backfills
  `openings: []` on every floor, so old projects load and the round-trip holds.

### Non-goals (documented deferrals)

These are deferred by design; section 4 ties each to the catalog and section 13
records the follow-ups.

- **Projecting windows (bay, bow, oriel, garden).** They change the floor
  footprint and feed room-polygon and area derivation, which is coupled to slice
  9 (dimensions and thickness-aware area) and is its own work. The wall-hosted
  model here is the substrate they will extend (parent spec section 2, "model
  wall-hosted elements as a general host relationship"); a projecting window adds
  a footprint contribution, not a new attachment.
- **Shape variants (arched, half-round, segmental, round, lancet, Palladian,
  fanlight, eyebrow, octagonal).** A shape is a registry parameter plus
  curved-geometry rendering. This slice ships rectangular openings only; the
  shape system and per-shape symbols are Phase 4 (parent spec section 10, "2D
  plan rendering rules per opening type"). The renderer reads shape from the
  element type from day one, so a shape param joins without reshaping the model.
- **Period multi-element assemblies as composed units (a door surround with
  transom plus sidelights as one placeable unit).** Transoms and sidelights are
  modeled as their own openings; composing them into a single placeable surround
  is later work.
- **3D builders.** The `scene3D` reference on each opening type is reserved but
  unused; opening geometry in 3D is Phase 2 (parent spec section 10, "scene graph
  derivation for walls/floors/ceilings/openings").
- **Trim and casing.** Window and door casing, aprons, and stools are path-based
  trim with their own registry (parent spec section 80); not this slice.
- **Rehosting across walls by dragging.** Dragging repositions an opening along
  its current host wall only. Dragging an opening off the end of its wall onto an
  adjacent wall (rehosting) is deferred; the drag clamps to the host wall,
  mirroring the slice-6 single-wall endpoint move.
- **Opening-aware room derivation and the perpendicular-drag size gizmo.** Rooms
  still derive from wall centerlines (an opening does not split a room); the
  design specification's along-wall and along-jamb resize gizmos (section 512)
  are deferred in favor of an inline inspector, mirroring slice 6's inline
  thickness editor over the perpendicular-drag gizmo.
- **Non-wall and footprint-special doors (garage overhead, skylight, dormer).**
  Garage doors roll up (no plan swing) and skylights and dormers host in the roof
  or ceiling, not a wall; out of this slice's wall-hosted scope.

## 3. Constraints

- `core/` imports neither React nor Three.js; the model, commands, geometry
  derivation, and migration are pure TypeScript (parent spec invariant 1).
- All mutation flows through `dispatch(command)`; no handler hand-authors an
  inverse (ADR-0005).
- Openings are typed at the element level: a door, a window, a pocket door are
  all `Opening` records whose `type` points to the `ElementTypeRegistry`; adding
  a type is a registry addition, not a schema change (parent spec section 3.2).
- Opening geometry and rendering read shape from the element type and never
  hardcode width-by-height rectangles (parent spec section 79).
- Selection stays bridge-owned and outside undo history (ADR-0020).
- The wall-drawing end-to-end flow stays green: opening placement and editing are
  gated on the place-opening tool and the select tool, which that flow does not
  trigger, and a project with no openings paints exactly as before.
- The full check chain (`pnpm typecheck && pnpm lint && pnpm format:check &&
pnpm test && pnpm build`) passes; ESLint runs at zero problems.

## 4. The residential opening catalog

Operation family drives the plan symbol (one routine per family); the named types
are registry entries that share a family. Shape is a separate parameter
(rectangular this slice). "In scope" types ship the full pipeline; "deferred"
types are recorded here so the boundary is explicit and the registry can grow
into them without code changes.

### Doors

| Operation family                 | Plan symbol routine                                                           | In scope (this slice)                                                                | Deferred                                     |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Swing (hinged leaf + arc)        | `door-swing` (single: one leaf and arc; double: two mirrored leaves and arcs) | single swing, double swing, French (glazed double), dutch (plan-identical to single) | double-acting / cafe (rare residential)      |
| Slide (offset panel + track)     | `door-slide` (pocket variant dashes the panel into the wall thickness)        | pocket, bypass (sliding closet), sliding glass / patio, barn (surface track)         | multi-panel pocket pairs                     |
| Fold (zigzag panels)             | `door-fold`                                                                   | bifold                                                                               | accordion / multifold                        |
| Pivot (leaf + pivot point + arc) | `door-pivot`                                                                  | pivot                                                                                | offset-pivot detailing                       |
| No leaf (jamb lines only)        | `cased-opening`                                                               | cased opening / archway                                                              | arched archway (shape variant)               |
| Overhead                         | (none)                                                                        | --                                                                                   | garage / sectional (rolls up; no plan swing) |

### Windows

| Operation family                                       | Plan symbol routine       | In scope (this slice)                                                      | Deferred                                                                  |
| ------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Window-in-wall (jamb lines + glazing line)             | `window-fixed`            | double-hung, single-hung, sliding / gliding, picture / fixed               | --                                                                        |
| Crank / hinged (glazing line + opening-direction mark) | `window-crank`            | casement, awning (top-hinged), hopper (bottom-hinged)                      | jalousie / louvered detailing                                             |
| Projecting (changes floor footprint)                   | (deferred)                | --                                                                         | bay, bow, oriel, garden / greenhouse                                      |
| Period assemblies                                      | `window-fixed` (geometry) | transom (fixed, over a door or window), sidelight (fixed, flanking a door) | fanlight, Palladian, clerestory as composed surrounds                     |
| Shape variants (a parameter, not a family)             | (deferred)                | --                                                                         | arched, half-round, segmental, round / oculus, lancet, eyebrow, octagonal |

Double-hung, single-hung, sliding, and picture windows are plan-identical (the
operation is an elevation distinction), so they share `window-fixed`; casement,
awning, and hopper add an opening-direction tick via `window-crank`. This is the
realization of "operation family, not marketing name, drives the symbol" and is
what makes the broad vocabulary affordable in one slice.

## 5. Data model

Additive, in `core/model/types.ts`:

The `'start' | 'end'` union is today `WallEnd` in the wall commands; to keep
`core/model` from depending on `core/commands`, lift that union to the model
layer (the wall commands then import it from the model) and reuse it here.

```ts
export interface OpeningOrientation {
  /** Which jamb anchors the operable leaf, as the host-wall end ('start' or 'end') nearer it. Ignored by symmetric symbols (double doors, fixed windows). */
  hinge: WallEnd
  /** Which side of the host wall the leaf opens toward: the sign of the wall's left-hand normal ('positive' = left of start->end, 'negative' = right). */
  facing: 'positive' | 'negative'
}

export interface Opening {
  id: string
  /** Element-type id into the ElementTypeRegistry (category 'opening'). Drives the plan symbol, shape, and default dimensions. */
  type: string
  /** The wall this opening is hosted in. */
  hostWallId: string
  /** Distance in millimeters from the host wall's `start` to the opening's center, measured along the wall. */
  position: number
  /** Opening width along the wall, in millimeters. */
  width: number
  /** Opening head height above the sill, in millimeters. */
  height: number
  /** Height of the sill above the finished floor, in millimeters; 0 for floor-standing doors. */
  sillHeight: number
  orientation: OpeningOrientation
}
```

`Floor` gains `openings: Opening[]`, a sibling of `walls` and `underlays`.

The `ElementType` (`core/registries/element-types.ts`) gains an optional `opening`
record, present only for `category: 'opening'`, carrying the operation family and
default dimensions (parameters live in the registry, not the data, parent spec
section 3.2):

```ts
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
  /** Whether two leaves are drawn (double swing, French). */
  double?: boolean
  defaultWidth: number
  defaultHeight: number
  defaultSillHeight: number
}
```

`plan2D.symbol` holds the symbol-routine id (`door-swing`, `door-slide`,
`door-fold`, `door-pivot`, `cased-opening`, `window-fixed`, `window-crank`);
`opening.family` drives which orientation fields the inspector exposes and the
placement defaults. `ELEMENT_TYPE_REGISTRY_VERSION` bumps to 2 (a backward-
compatible addition: old projects reference no new ids).

A `createOpening` factory (`core/model/factories.ts`) mints an opening with a
fresh id, the registry-default dimensions for its type (overridable), and a
default `orientation` of `{ hinge: 'start', facing: 'positive' }`, mirroring
`createWall` and `createUnderlay`. `createFloor` initializes `openings: []`.

Reasonable residential defaults (rounded to whole millimeters): interior swing
door 813 wide, 2032 high, sill 0; window 900 wide, 1200 high, sill 900. Exact
defaults are finalized in the plan.

## 6. Commands

`core/commands/handlers/opening-commands.ts`, registered through a new
`registerOpeningCommands`, mirroring `underlay-commands.ts`. Each `apply`
reassigns `state.floors` immutably, mapping only the target floor (and target
opening) to a new object, so the root inverse-capture proxy records the slice
replacement and the dispatcher captures the inverse (ADR-0005). The four
single-opening updates share two file-private helpers, `mapTargetFloor(state,
floorId, update)` and `mapTargetOpening(floor, openingId, update)`, the same
shared-shape refactor slice 6 and slice 12 applied.

| Command         | Params                                                  | Effect                                                                                                        |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `placeOpening`  | `floorId`, `opening`                                    | Append; the opening is built eagerly at command-creation time so redo reuses the same id (mirrors `addWall`). |
| `moveOpening`   | `floorId`, `openingId`, `position`                      | Set `position` (clamped at derive time, not in the command).                                                  |
| `resizeOpening` | `floorId`, `openingId`, `{ width, height, sillHeight }` | Set the three dimensions.                                                                                     |
| `flipOpening`   | `floorId`, `openingId`, `axis: 'hinge' \| 'facing'`     | Toggle one orientation axis (the four door swing states are two toggles).                                     |
| `removeOpening` | `floorId`, `openingId`                                  | Filter out.                                                                                                   |

## 7. Scene-graph derivation

`core/scene/scene-graph.ts` adds an `OpeningSceneNode` (namespaced `opening:<id>`
via an `OPENING_NODE_PREFIX`, the owning `floorId`, the element `type`, and the
derived world geometry the renderer needs: `center`, the unit `along` and
`normal` vectors, `width`, `height`, `sillHeight`, the resolved `hostThickness`,
and `orientation`), `deriveOpeningNode` / `deriveOpeningNodesForFloor`, and a
`graph.openings` sibling array that `deriveSceneGraph` flat-maps over the floors,
exactly as it flat-maps walls, rooms, and underlays (ADR-0018).

The geometry is pure (a `core/topology/openings.ts` helper, beside `rooms.ts`):
resolve the opening's host wall by id; compute the wall's unit direction and
left-hand normal; clamp `position` into `[width / 2, length - width / 2]` so the
opening stays inside the host wall (best-effort: if `width > length`, the opening
is clamped to span the wall, recorded as a documented edge case mirroring slice
1's best-effort topology); compute `center = start + along * position` and the two
jamb points `center +/- along * width / 2`. An opening whose `hostWallId` resolves
to no wall is skipped (best-effort, documented), the way the room deriver tolerates
degenerate topology. Clamping at derive time keeps the stored `position`
intact, so re-lengthening a shortened wall restores the opening's intended place.

## 8. Rendering

`editor/plan/draw-opening.ts` paints openings through the `PlanDrawingContext`
seam (ADR-0021), after the walls and before the room labels, in three steps per
opening: (1) a **wall gap**, erasing the wall stroke across the opening footprint
and capping it with jamb lines using the resolved `hostThickness`; (2) the family
**plan symbol**, dispatched on the element type's `plan2D.symbol`; (3) a
**selection highlight** when the opening is selected. The symbol routine reads
shape from the element type and never hardcodes a rectangle (parent spec section
79). The wall-gap approach is provisional and recorded as such; it reuses only
members already on the seam where possible, and grows the seam by at most what a
dashed line (the pocket-door panel) requires, continuing the ADR-0021 discipline
of extending the narrow Canvas interface only when forced.

`drawPlan` gains an optional `openings?: readonly DrawableOpening[]` field, so
every existing `drawPlan` test stays green and a project with no openings paints
unchanged. Paint order becomes: underlays, grid, room fills, walls, **openings**,
preview/snap/marquee, room labels, calibration line, rulers.

The in-scope symbol routines:

- `door-swing`: a leaf line from the hinge jamb plus a quarter-circle arc to the
  facing side; `double` draws two mirrored leaves and arcs from both jambs.
- `door-slide`: an offset panel parallel to the wall with a short track line; the
  pocket variant dashes the panel where it runs into the wall thickness.
- `door-fold`: a zigzag of folded panel segments anchored at the hinge jamb.
- `door-pivot`: a leaf with a pivot dot and a swing arc.
- `cased-opening`: jamb caps and a clear gap, no leaf.
- `window-fixed`: jamb lines and a glazing line across the gap.
- `window-crank`: `window-fixed` plus an opening-direction tick on the facing
  side.

## 9. Selection and hit-testing

Openings become selectable, closing the slice-5 deferral that openings join the
hit-test index "when their slices land" (ADR-0032). Each opening registers an
axis-aligned bounds (its footprint, `width` along the wall by `hostThickness`
across, plus the standard tolerance margin) with the spatial index. `hitTest`
resolves an **opening before a wall before a room** under the cursor, because an
opening is the more specific element sitting on the wall; the narrow phase tests
point-in-opening-footprint. Shift-click toggles an opening into the additive
multi-selection, and a marquee selects an opening whose footprint lies fully
inside it (window selection, consistent with slice 5). Selection stays
bridge-owned and outside undo (ADR-0020).

## 10. Placement and editing interactions

All interaction wiring is coverage-excluded glue validated by the wall-drawing
end-to-end spec; the decision logic it calls is pure and unit-tested.

- **Place-opening tool.** A new `place-opening` member joins the `ToolId` union
  (`editor/tools/active-tool-context.ts`); the tools panel adds an Opening tool
  with a type chooser (the in-scope opening types, grouped door/window). With the
  tool active, a click projects onto the nearest wall within tolerance (reusing
  the slice-5 nearest-wall logic) and dispatches `placeOpening` with the chosen
  type's registry defaults at the projected position; a click with no wall in
  range is a no-op. The wall-draw and select paths are untouched.
- **Inline opening inspector.** When exactly one opening is selected under the
  select tool, an inspector (mirroring `wall-thickness-editor.tsx` and
  `room-name-editor.tsx`) shows unit-aware width, height, and sill-height inputs
  (parsed by the slice-2 `parseLength`, ADR-0027), flip controls for the hinge
  and facing axes, and a remove button, dispatching `resizeOpening`,
  `flipOpening`, and `removeOpening`.
- **Drag along wall.** Dragging a selected opening repositions it along its host
  wall and dispatches `moveOpening`, mirroring the slice-6 endpoint drag; the
  drag clamps to the host wall (no rehosting this slice).

## 11. Schema migration

Openings are plain model data (no external asset bytes, unlike the underlay
raster), so they persist in `project.json` and the `load -> save -> load`
round-trip must preserve them. An additive schema bump from version 2 to version
3, with an `addFloorOpenings` migration (`core/migrations/schema/`), backfills
`openings: []` on every floor that lacks it, so a version-2 project loads
forward correctly. `CURRENT_SCHEMA_VERSION` becomes 3, and the migration joins
`SCHEMA_MIGRATIONS`. The migration is the one place to also defensively backfill
the `underlays: []` array, which the underlay slice added to `Floor` without its
own bump (a pre-existing latent gap, closed here at no extra cost); the plan
confirms whether to include that.

## 12. Testing strategy

Red-green-blue per behavior, with the role-separated subagents:

- **Pure core, unit-tested:** the `Opening` and `OpeningOrientation` types via the
  `createOpening` factory and defaults; each command's `apply` and its
  framework-captured inverse (undo and redo); the opening geometry derivation
  (center, along, normal, jamb points, clamping, missing-host and oversized-width
  edge cases); the scene-graph projection (`graph.openings`, no-openings yields
  `[]`); the schema migration round-trip.
- **Editor decision logic, unit-tested:** the plan-symbol routines against a
  recording `PlanDrawingContext` fake (the draw calls each family emits); the
  nearest-wall projection for placement; the opening bounds and the
  opening-beats-wall-beats-room hit-test resolution; the marquee containment.
- **Glue, coverage-excluded, e2e-validated:** the place-opening tool, the
  inspector panel (its own React Testing Library test, taking data and `dispatch`
  as props), and the drag wiring. The wall-drawing end-to-end spec stays green and
  gains an assertion that the opening inspector appears when an opening is
  selected, mirroring the slice-6 thickness assertion.

## 13. Open questions and follow-ups

- **Projecting-window footprint.** Bay, bow, oriel, and garden windows contribute
  to the floor footprint and room polygons; the model and the room/area work to
  support that is resolved with slice 9. The wall-hosted record here is their
  substrate.
- **Shape parameter.** The arched, round, and Palladian shape variants are a
  registry shape parameter plus curved rendering (Phase 4). The renderer reads
  shape from the element type now, so the parameter joins without a model change.
- **Rehosting by drag.** Dragging an opening across a wall junction onto an
  adjacent wall is deferred; the interaction model (clamp versus rehost at the
  wall end) is finalized when junction-cohesive editing lands.
- **Wall-gap rendering.** The provisional erase-and-cap wall gap is reconsidered
  if the wall renderer moves to filled-thickness polygons (slice 9's
  thickness-aware area) or a DOM overlay (parent spec section 6.2).
- **Opening-aware rooms.** Whether an opening ever influences room derivation
  (for example, an archway merging two rooms) is a later question; rooms derive
  from wall centerlines this slice.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: sections 3.1
  and 3.2 (the entity tree's `openings[]` and typed-at-element-level modeling),
  section 2 (wall-hosted elements as a general host relationship), section 79
  (shape read from the element type), section 512 (the deferred resize gizmos),
  and the section 10 Phase 1 deliverables "Opening placement" and "Opening
  editing". This document records the slice's interpretation and the now/deferred
  boundary; the parent spec is authoritative.
- ADR-0005 (framework-captured command inverse), ADR-0018 (scene-graph
  derivation), ADR-0021 (the narrow Canvas plan-drawing seam), ADR-0027 (the
  units module for the inspector inputs), ADR-0032 (the broad-then-narrow
  hit-test the openings join), ADR-0035 (the slice-6 wall-editing interactions the
  inspector and drag mirror), ADR-0037 (the slice-12 additive per-floor entity and
  shared-traversal command pattern the openings follow).
  </content>
  </invoke>
