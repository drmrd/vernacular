# Room Naming and Labeling Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The `test-author` authors its test independently from the behavior description plus the public signatures in this plan, and the `implementer` writes minimal code from the failing-test output, so test/implementation independence is preserved. Tasks marked `(infrastructure)` are controller-authored glue (React/Canvas glue, docs) with no RGB triple; they are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking. This plan describes each **behavior** and names the **signature** under test; it deliberately ships no literal test bodies or full implementations, only the public contract.

**Goal:** Let the user name a derived room and override its derived polygon, and paint a room label (the name plus the formatted area) on the two-dimensional plan. Rooms stay a derived projection of the wall model with no stored identity, so the central design problem is **where the room name and the polygon override live and how they are keyed to a room stably across edits**. The answer: a new top-level `Project.roomOverrides` map keyed by a stable room key (the sorted bounding-wall ids the room derivation already computes), honored by the derivation, and edited through two undoable commands dispatched at the bridge boundary.

**Architecture:** The stable room key is a pure function `roomKey(room)` that returns the sorted bounding-wall-id string the topology layer already uses to build `Room.id` (so the key the override map uses is single-sourced and identical to the derived `RoomSceneNode.id`). A new optional top-level slice `Project.roomOverrides?: Record<string, RoomOverride>` stores per-room metadata (`name?`, `customPolygon?`); it is a sibling of `meta` and `floors`, so an undoable command can reassign it whole and the inverse-capture proxy records the change (ADR-0005, the proxy records only the root's own top-level keys). A pure `applyRoomOverrides(rooms, overrides)` merge rule honors a stored name and replaces a derived polygon with a stored `customPolygon` (recomputing area from the override polygon). Two commands join the handlers: `setRoomName` and `setRoomCustomPolygon`, both reassigning `state.roomOverrides` immutably the way the project commands reassign `state.meta`/`state.floors`. The scene-graph room deriver threads the project's `roomOverrides` through `deriveRoomNodesForFloor` so `RoomSceneNode` carries the effective `name` and the (possibly overridden) `polygon`/`area`; the deriver's per-floor room memoization is re-keyed so a name or override change invalidates the cached room nodes. A pure `roomLabelContent(room, options)` produces the label lines (name, formatted area), reusing the slice-2 unit selection plus a new pure `formatArea`. `editor/plan/draw-plan.ts` grows `drawRoomLabel` behind the existing `PlanDrawingContext` seam (which already exposes `font`/`textAlign`/`textBaseline`/`fillText`). A small inline room editor component shows and edits the selected room's name, and the plan-view glue paints labels and supplies the override polygon.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Canvas 2D for the plan, React with React Testing Library, Vitest for units. No new dependencies. **This slice does change `core/model/types.ts` and adds one schema migration**, because room metadata must persist and the inverse-capture proxy only records top-level keys, so the store has to be a new top-level `Project` slice rather than a nested field; the change is additive (a new optional `roomOverrides` map) and the migration is a structural no-op that future-proofs the chain. The rationale and migration discipline are spelled out in Section A and the open questions.

---

## Scope boundary (design specification sections 3.2, 6.11, 10 Phase 1; this is slice 8 of ~12)

Phase 1 (the two-dimensional plan editor) is delivered as ~12 independent slices, each its own plan in `docs/plans/` and its own RGB cycle. This plan is **slice 8: room naming, labeling, and the custom-polygon override**. The full decomposition and per-slice ownership is recorded in `ROADMAP.md`. Slices 1 (wall topology and room derivation), 2 (units and measurement), 3 (pan, zoom, grid, and rulers), 4 (snapping), and 5 (selection and the hit-test index) are done. This slice completes the slice-1 deferral ("no custom-polygon override or room naming; those are slice 8") and the slice-1/slice-2 deferral of human-readable area labels. It builds on the slice-1 room derivation (`deriveRooms`, the `room:<sorted-wall-ids>` id), the slice-2 unit formatters (`formatLength`, `lengthFormatOptions`, `UnitPreferences`), the slice-5 selection store (to know which room is selected), and the existing command/dispatch boundary (ADR-0005).

The design specification grounds this slice in three places: section 3.2 ("Rooms are derived, not authored. Users name and tag rooms; geometry comes from walls. A `customPolygon` override exists for cases where wall topology can't infer a room"), the entity tree (rooms carry a `purpose`/`name`-style identity), and section 6.11 ("2D plan: Canvas `fillText` for dimensions and labels").

**In scope for slice 8:**

- `core/model/types.ts`: a new `RoomOverride` interface (`name?: string`, `customPolygon?: Point[]`) and a new optional top-level `Project.roomOverrides?: Record<string, RoomOverride>`. Exported through `core/index.ts`.
- One additive schema migration registered in `core/migrations/schema/`, bumping `CURRENT_SCHEMA_VERSION` from 1 to 2 and normalizing a pre-`roomOverrides` document (the migration is structural and effectively a no-op: an absent map stays absent / becomes `{}`, treated identically by the merge).
- `core/topology/rooms.ts`: `roomKey(room)`, the pure stable-room-key rule (the sorted-bounding-wall-id string that `Room.id` already encodes), and `applyRoomOverrides(rooms, overrides)`, the pure merge that honors a stored `name` and `customPolygon` (recomputing `area` from an override polygon).
- `core/commands/handlers/room-commands.ts` (new): `SET_ROOM_NAME` and `SET_ROOM_CUSTOM_POLYGON` type constants, `SetRoomNameParams` and `SetRoomCustomPolygonParams`, the `setRoomName` and `setRoomCustomPolygon` creators, their handlers (reassigning `state.roomOverrides` immutably), and `registerRoomCommands`. Exported through `core/index.ts` and registered in the editor session.
- `core/scene/scene-graph.ts` and `core/scene/scene-graph-deriver.ts`: `RoomSceneNode` gains an optional `name?: string`; `deriveRoomNodesForFloor` takes the relevant `roomOverrides` and applies them; the deriver re-keys its per-floor room cache so a name or override change rebuilds the room nodes.
- `core/units/format-area.ts` (new): `formatArea(squareMillimeters, preferences)`, the pure square-millimeter-to-display-area formatter (`m²` / `ft²`), reusing the slice-2 system selection. Exported through `core/index.ts` and the `core/units` surface.
- `editor/plan/room-label.ts` (new): `roomLabelContent(room, options)`, the pure label-content function returning the name line and the formatted-area line and the world-space anchor point.
- `editor/plan/draw-plan.ts`: `drawRoomLabel(ctx, room, options)` behind the existing seam, gated by a new optional `roomLabels?: boolean` (or a label-options object) on `DrawPlanOptions`; the label paints through the `font`/`fillText` members already on `PlanDrawingContext`.
- `editor/plan/room-name-editor.tsx` (new, infrastructure-tested with React Testing Library): an inline editor that shows the selected room's effective name and dispatches `setRoomName` on commit.
- `editor/plan/plan-view.tsx` and `editor/shell/editor-shell.tsx` (infrastructure glue): paint room labels in the plan, place the room-name editor in the inspector when a single room is selected, and supply the override polygon and unit preferences.

**Out of scope for slice 8, deferred with intent (also recorded in `ROADMAP.md`):**

- **Thickness-aware (clear-area) labels.** The area shown in a label is the slice-1 **centerline** area until slice 9 (dimensions and thickness-aware area) introduces interior-inset clear-area polygons. The label pipeline reads `RoomSceneNode.area`, so when slice 9 changes what that field holds the labels update with no labeling change. Stated again in the open questions.
- **DOM-overlay labels and label-collision handling.** Labels paint on the Canvas with `fillText` at the room centroid, consistent with the slice-3/4/5 decision to draw plan chrome on the Canvas (the design specification's interactive DOM overlay for chips and rings, section 6.13, is later polish). Automatic label placement to avoid overlap between adjacent small rooms, dragging a label, and hiding a label that does not fit are deferred. The anchor is the room centroid this slice; placement refinement is a follow-up.
- **Room purpose, sub-purpose, era override, and tags.** The design-specification entity tree carries `purpose`, `subPurpose`, and `eraOverride` on a room. This slice ships only the user-entered **name** and the **custom polygon**; the purpose/era/tag vocabulary and its registry land with the old-house architectural vocabulary milestone (which owns `RoomPurposeRegistry`). `RoomOverride` is shaped so those fields are additive later without another top-level slice.
- **Drawing a custom polygon by hand.** This slice ships the `setRoomCustomPolygon` command, the merge rule, and the rendering that honors an override polygon; the interactive polygon-drawing tool (clicking out a free-form room boundary for a porch or an L-shaped sub-zone) is a follow-up editing tool that dispatches the same command. The command and merge are fully specified so the tool is pure wiring when it lands.
- **Selection persistence and unit-preferences store.** Selection stays in-memory (slice 5 deferral) and the active `UnitPreferences` is the project's default for its `units` (`DEFAULT_METRIC_PREFERENCES` / `DEFAULT_IMPERIAL_PREFERENCES`) until a project-level unit-preferences store lands, mirroring the slice-3 deferral of unit-aware ruler labels and the slice-6 inline-editor preference choice.

**Acceptance for slice 8:** `roomKey` returns the same key for a room across re-derivation and equals the `room:`-stripped form of the derived id; `applyRoomOverrides` honors a stored name and replaces the polygon and recomputes area for a stored `customPolygon`, leaving un-overridden rooms untouched; the migration leaves a current document semantically unchanged and normalizes a pre-`roomOverrides` document; `setRoomName` and `setRoomCustomPolygon` apply through the dispatcher and undo through its captured inverse, leaving other rooms' overrides untouched; the room deriver carries the effective name and overridden polygon and rebuilds room nodes when an override changes; `formatArea` formats square millimeters to a unit-aware area string; `roomLabelContent` returns the name and formatted-area lines anchored at the room centroid; `drawRoomLabel` paints through the seam and is gated by the labels option; the inline room-name editor shows the effective name and dispatches a `setRoomName`. Full check chain green; `eslint .` at zero problems; `rgb:audit` clean; the migration framework round-trips (load then save then load identical); the wall-drawing end-to-end spec still passes.

---

## File structure

New and modified files, grouped by responsibility:

```
core/
  model/types.ts                         (modify)  RoomOverride; optional Project.roomOverrides
  migrations/schema/<descriptive-name>.ts (create)  additive room-overrides schema migration (v1 -> v2)
  migrations/schema/index.ts             (modify)  register the migration in the schema chain
  migrations/schema/<name>.test.ts       (create)  migration behavior
  model/factories.ts                     (modify)  bump CURRENT_SCHEMA_VERSION 1 -> 2
  topology/rooms.ts                      (modify)  roomKey, RoomOverride-aware applyRoomOverrides
  topology/rooms.test.ts                 (modify)  roomKey + applyRoomOverrides behaviors (deriveRooms tests stay green)
  commands/handlers/room-commands.ts     (create)  setRoomName, setRoomCustomPolygon, handlers, registration
  commands/handlers/room-commands.test.ts (create)
  scene/scene-graph.ts                   (modify)  RoomSceneNode.name?; override-aware deriveRoomNodesForFloor
  scene/scene-graph.test.ts              (modify)  effective-name + overridden-polygon behaviors (slice-1 tests stay green)
  scene/scene-graph-deriver.ts           (modify)  re-key the room cache on override change
  scene/scene-graph-deriver.test.ts      (modify)  rebuild-on-override-change behavior (memoization tests stay green)
  units/format-area.ts                   (create)  formatArea
  units/format-area.test.ts              (create)
  units/index.ts                         (modify, infra)  export formatArea from the units surface
  index.ts                               (modify, infra)  export the new types, creators, roomKey, applyRoomOverrides, formatArea

editor/plan/
  room-label.ts                          (create)  roomLabelContent
  room-label.test.ts                     (create)
  draw-plan.ts                           (modify)  drawRoomLabel; roomLabels? option
  draw-plan.test.ts                      (modify)  room-label behaviors (slice-1/3/4/5 tests stay green)
  room-name-editor.tsx                   (create, infra)  inline room-name input
  room-name-editor.test.tsx              (create)  component behavior (React Testing Library)
  plan-view.tsx                          (modify, infra)  paint labels; supply preferences and override polygon

editor/shell/
  editor-shell.tsx                       (modify, infra)  render the room-name editor in the inspector

bridge/session/
  editor-session.ts                      (modify, infra)  register the room commands in the session

ROADMAP.md                               (modify, infra)  mark slice 8 done; record deferrals
```

There is **no** barrel under `editor/plan/`; modules import directly from sibling files, matching the house convention slices 1, 3, 4, and 5 confirmed; `core/` has exactly one barrel (`core/index.ts`) plus the existing `core/units/index.ts` surface. `Point`, `Project`, and the new `RoomOverride` come from `core/model/types.ts`; `Room` comes from `core/topology/rooms.ts`; `RoomSceneNode`, `SceneGraph`, and `WallSceneNode` come from `core/scene/scene-graph.ts` (all re-exported through `core`); `UnitPreferences`, `formatLength`, `lengthFormatOptions`, `DEFAULT_METRIC_PREFERENCES`, and `DEFAULT_IMPERIAL_PREFERENCES` come from `core/units` via the barrel; `Viewport` and `worldToScreen` are from `editor/plan/viewport.ts`.

The pure modules (`core/topology/rooms.ts`, `core/commands/handlers/room-commands.ts`, `core/scene/scene-graph.ts`, `core/scene/scene-graph-deriver.ts`, `core/units/format-area.ts`, the migration, `editor/plan/room-label.ts`, and the label-drawing additions to `editor/plan/draw-plan.ts`) carry the testable behavior. `editor/plan/plan-view.tsx`, the `editor/shell/editor-shell.tsx` wiring, and `bridge/session/editor-session.ts` are coverage-excluded glue (jsdom has no 2D canvas), validated by the existing wall-drawing end-to-end spec. The inline room-name editor is a small DOM component with no canvas dependency, so it carries its own React Testing Library test rather than being coverage-excluded glue.

**The stable-key boundary (the one architectural seam this slice introduces):** the override map is keyed by `roomKey(room)`, the sorted bounding-wall-id string the topology layer already computes to build `Room.id` (`room:<sorted-wall-ids>`). `roomKey` is the single source of that rule; `Room.id` is `room:` + `roomKey(room)`, and `RoomSceneNode.id` carries the same prefixed form. The commands and the override map use the unprefixed `roomKey`; the scene-node id keeps the `room:` prefix; the glue derives the key from a selected room node by stripping the prefix. The provisional nature of this key under wall editing (slice 6) is flagged in the open questions, not left implicit.

Public contract introduced by this plan (the signatures the `test-author` writes against and the `implementer` implements):

```ts
// core/model/types.ts (additions; exported via core/index.ts)
export interface RoomOverride {
  /** User-entered display name for the room; absent means use no name (geometry only). */
  name?: string
  /** Replacement boundary for the room when wall topology cannot infer it (porch, L-shaped sub-zone). */
  customPolygon?: Point[]
}
// Project gains: roomOverrides?: Record<string, RoomOverride>  (key = roomKey(room); absent = no overrides)

// core/topology/rooms.ts (additions; exported via core/index.ts)
/** The stable key for a room: the sorted bounding-wall-id string Room.id encodes (without the `room:` prefix). */
export function roomKey(room: Room): string
/** Returns rooms with stored overrides merged in: a stored name attached, a stored customPolygon replacing the
 *  derived polygon (area recomputed from it). Rooms without an override are returned unchanged. */
export function applyRoomOverrides(
  rooms: readonly Room[],
  overrides: Readonly<Record<string, RoomOverride>> | undefined,
): Room[]

// core/commands/handlers/room-commands.ts (exported via core/index.ts)
export const SET_ROOM_NAME = 'room/set-name'
export const SET_ROOM_CUSTOM_POLYGON = 'room/set-custom-polygon'
export interface SetRoomNameParams {
  roomKey: string
  name: string
}
export interface SetRoomCustomPolygonParams {
  roomKey: string
  polygon: Point[]
}
export function setRoomName(roomKey: string, name: string): Command<SetRoomNameParams>
export function setRoomCustomPolygon(
  roomKey: string,
  polygon: Point[],
): Command<SetRoomCustomPolygonParams>
// registerRoomCommands registers SET_ROOM_NAME and SET_ROOM_CUSTOM_POLYGON.

// core/scene/scene-graph.ts (addition; RoomSceneNode gains name?)
// RoomSceneNode gains: name?: string
export function deriveRoomNodesForFloor(
  floor: Floor,
  overrides?: Readonly<Record<string, RoomOverride>>,
): RoomSceneNode[]

// core/units/format-area.ts (exported via core/units and core/index.ts)
/** Formats a square-millimeter area as a unit-aware display string (for example "12.5 m²" or "129 ft²"). */
export function formatArea(squareMillimeters: number, preferences: UnitPreferences): string

// editor/plan/room-label.ts
export interface RoomLabelContent {
  /** The room name line, or undefined when the room has no name. */
  name: string | undefined
  /** The formatted-area line (always present). */
  area: string
  /** World-space anchor (the room centroid) where the label is drawn. */
  anchor: Point
}
export interface RoomLabelOptions {
  preferences: UnitPreferences
}
export function roomLabelContent(room: RoomSceneNode, options: RoomLabelOptions): RoomLabelContent

// editor/plan/draw-plan.ts (addition; gated by a new optional roomLabels?: RoomLabelOptions on DrawPlanOptions)
export function drawRoomLabel(
  ctx: PlanDrawingContext,
  room: RoomSceneNode,
  options: { viewport: Viewport; preferences: UnitPreferences },
): void
// DrawPlanOptions gains: roomLabels?: RoomLabelOptions (absent = no labels; PlanView sets it to paint labels)
```

`RoomOverride` is defined in `core/model/types.ts` and re-exported from `core`; `core/topology/rooms.ts`, `core/commands/handlers/room-commands.ts`, and `core/scene/scene-graph.ts` import it from the model so the override shape is single-sourced. `roomKey`'s return type is the unprefixed key string used identically by `SetRoomNameParams.roomKey`, `SetRoomCustomPolygonParams.roomKey`, and the `roomOverrides` map keys.

---

## Section A: the room-overrides store and stable key (`core/model/types.ts`, `core/topology/rooms.ts`)

### Task A1: `roomKey` is the stable, derivation-independent room key

**Files:**

- Modify: `core/topology/rooms.ts`
- Test: `core/topology/rooms.test.ts`

**Behavior under test (`roomKey(room)`):** Returns the sorted bounding-wall-id string that the room derivation already uses to construct `Room.id`, without the `room:` prefix; that is, `room.id === 'room:' + roomKey(room)` for any derived room. Because slice-1 builds `Room.id` from the sorted, unique `wallIds`, `roomKey` is `room.wallIds` joined the same way (and is identical to stripping the `room:` prefix from `room.id`); pin both equivalences so the key cannot silently diverge from the id. Re-deriving the same walls yields the same key (the rooms test fixture already proves the id is stable across re-derivation; `roomKey` inherits that). Cover: `roomKey` of a derived rectangle room equals the `room:`-stripped id; two derivations of the same walls give equal keys; the key is derived from the sorted bounding-wall ids (a room bounded by walls in a different insertion order yields the same key).

- [ ] **Step 1 (RED):** `/test-first` importing `roomKey` from `./rooms` and `deriveRooms` to build a room. Assert `room.id === 'room:' + roomKey(room)` and key stability across two derivations. Verify it fails because `roomKey` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `roomKey` as the single source of the sorted-wall-id rule, and have `deriveRooms` build `Room.id` as `'room:' + roomKey({ wallIds })` (or otherwise route both through one shared key helper) so the id and the key cannot diverge. Keep `deriveRooms`' existing tests green. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm the `room:` prefix and the sorted-wall-id join live in exactly one place that both `Room.id` construction and `roomKey` use (real duplication eliminated, not coincidental). Commit `refactor:` (empty marker if no change).

### Task A2: `RoomOverride` and the top-level `Project.roomOverrides` slice

**Files:**

- Modify: `core/model/types.ts`
- Modify: `core/index.ts` (export `RoomOverride`)

This is a controller-authored type addition reviewed by `/clean-code-review` (a type-only change has no runtime behavior to pin with a test; the behavior is exercised by Tasks A3, B1, and B2). It is listed as a numbered step rather than an RGB triple.

- [ ] **Step 1:** Add `interface RoomOverride { name?: string; customPolygon?: Point[] }` to `core/model/types.ts`, and add an optional `roomOverrides?: Record<string, RoomOverride>` to `Project` (a sibling of `meta` and `floors`). Document on the field that the key is `roomKey(room)` and that an absent map means no overrides. Document on `RoomOverride` that `purpose`/`subPurpose`/`eraOverride` (design-specification room identity) are deliberately not here yet and arrive additively with the old-house vocabulary milestone.
- [ ] **Step 2:** Export `RoomOverride` from `core/index.ts` in the type-export block alongside `Project`.
- [ ] **Step 3:** Reviewed by `/clean-code-review`; commit `feat:` (a new optional field is back-compatible: every existing `Project` literal and factory output still type-checks because the field is optional).

### Task A3: `applyRoomOverrides` merges a stored name and custom polygon

**Files:**

- Modify: `core/topology/rooms.ts`
- Test: `core/topology/rooms.test.ts`

**Behavior under test (`applyRoomOverrides(rooms, overrides)`):** Returns a new array of rooms with stored overrides merged onto the matching room by `roomKey`. For a room whose key has an override with a `name`, the returned room carries that name (the merge attaches the name; the means of carrying it is decided in implementation, for example a `name?` field on the returned room shape, single-sourced with `RoomSceneNode.name`). For a room whose key has an override with a `customPolygon`, the returned room's `polygon` is replaced by the override polygon and its `area` is recomputed from that polygon (reuse `polygonArea`, normalizing sign the way `deriveRooms` does so the area is non-negative). A room with no matching override is returned unchanged (same field values). An `undefined` overrides argument returns the input rooms unchanged. An override key that matches no current room is ignored (it does not synthesize a room). Cover: a name-only override (name attached, polygon and area unchanged); a custom-polygon override (polygon replaced, area recomputed); a room with no override (unchanged); `overrides === undefined` (unchanged); a stale override key matching no room (no synthesized room).

- [ ] **Step 1 (RED):** `/test-first` importing `applyRoomOverrides` (and `roomKey`, `deriveRooms`, the `RoomOverride` type) from the appropriate modules; build rooms, construct an overrides map keyed by `roomKey`, and assert the merged result for each case. Verify it fails because `applyRoomOverrides` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `applyRoomOverrides`: map each room to its override (looked up by `roomKey`); when present, attach the `name` and, if a `customPolygon` is present, replace `polygon` and recompute `area` via `polygonArea` (sign-normalized). Return the input unchanged when `overrides` is `undefined`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the per-room merge a single small function (one level of abstraction); avoid a nested ternary when branching on name-present / polygon-present; share the sign-normalize-area step with `deriveRooms` if it is real duplication rather than restating it. Commit `refactor:` (empty marker if no change).

### Task A4: the additive room-overrides schema migration

**Files:**

- Create: `core/migrations/schema/<descriptive-name>.ts` (a descriptive English filename, for example `add-room-overrides.ts`; no internal/milestone codes)
- Modify: `core/migrations/schema/index.ts` (register it in the chain)
- Modify: `core/model/factories.ts` (bump `CURRENT_SCHEMA_VERSION` from 1 to 2)
- Test: `core/migrations/schema/<descriptive-name>.test.ts`

**Behavior under test (the `SchemaMigration` from version 1):** Migrating a version-1 project document forward leaves all existing data intact and produces a document the rest of the app reads as a valid version-2 project. Because `roomOverrides` is optional and the merge treats an absent map identically to an empty one, the migration is structural and effectively a no-op: it must **not** invent overrides and must not touch `meta.schemaVersion` (the orchestrator advances the version, per `core/migrations/types.ts`). The migration's `from` is `1`. Cover: a version-1 document with floors and walls migrates with its `floors`, `meta.name`, `meta.units`, and `meta.era` unchanged and gains no spurious `roomOverrides` (or gains an empty `{}`, whichever the migration documents; pin the chosen rule); the migration does not set `meta.schemaVersion` itself.

This follows the project's migration discipline (CLAUDE.md "Things never to do": a `docs/specs/` change needs an ADR, but this slice adds behavior the specification already mandates in section 3.2, so no spec change is required; the schema bump itself is a coordinated shared-schema change, flagged in the open questions for the project-stores slice).

- [ ] **Step 1 (RED):** `/test-first` importing the migration and `migrateProject` (from `core`), feeding a version-1 `ProjectShape` and asserting the forward result preserves the existing data and that the orchestrator advances the version to 2. Verify it fails because the migration / the version-2 target does not exist yet. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the `SchemaMigration` (`from: 1`, a structural `migrate` that returns the document unchanged or with an empty `roomOverrides` per the pinned rule), register it in `core/migrations/schema/index.ts`, and bump `CURRENT_SCHEMA_VERSION` to 2 in `core/model/factories.ts`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm the migration touches only document data (never `meta.schemaVersion`), the registration slots into the existing chain pattern, and the version bump is the only `factories.ts` change. Commit `refactor:` (empty marker if no change).

---

## Section B: the room-naming and override commands (`core/commands/handlers/room-commands.ts`)

### Task B1: `setRoomName` stores a room name and undoes

**Files:**

- Create: `core/commands/handlers/room-commands.ts`
- Test: `core/commands/handlers/room-commands.test.ts`

**Behavior under test (`setRoomName(roomKey, name)` dispatched through a `Dispatcher`):** Applying the command sets `state.roomOverrides[roomKey].name` to the given name, creating the `roomOverrides` map and the per-room override entry if absent, while every other room's override stays untouched. The handler reassigns `state.roomOverrides` immutably to a new map object (mapping only the target key to a new override object), mirroring how the project commands reassign `state.meta`/`state.floors` so the inverse-capture proxy records the change and the dispatcher captures the inverse (ADR-0005; the handler authors no explicit inverse). Dispatching and then `undo` restores the prior override state for that key: previously-absent returns to absent (the captured inverse restores the prior top-level `roomOverrides` reference, including the case where `roomOverrides` itself did not exist). Cover: naming a room when `roomOverrides` is absent (the map and the entry are created with the name); renaming a room that already had a name (the name changes, a sibling room's override is untouched); a dispatch-then-undo round trip restoring the prior state (including back to no `roomOverrides`).

- [ ] **Step 1 (RED):** `/test-first` importing `setRoomName`, `registerRoomCommands` (and `Dispatcher` / `CommandRegistry` from `core`), registering the room commands, dispatching a `setRoomName`, asserting the stored name and untouched siblings, then `undo` and asserting the prior state is restored. Verify it fails because `setRoomName` (and `SET_ROOM_NAME` / its handler) is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the `SET_ROOM_NAME` constant, `SetRoomNameParams`, the `setRoomName` creator (returning `{ type, params, description }` with a clear `description` such as `'Name room'`), and the handler that reassigns `state.roomOverrides` immutably to set only the target key's `name` (preserving any existing `customPolygon` on that entry). Register the handler in `registerRoomCommands`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Watch for the shared override-map reassignment shape between this handler and Task B2's `setRoomCustomPolygon` handler (both produce a new `roomOverrides` map updating one key's entry while preserving the entry's other field): factor the "reassign the map, merge one key's override" step into one small private helper so neither handler restates it (real duplication). Keep each `apply` within `max-lines-per-function`. Commit `refactor:` (empty marker if no change).

### Task B2: `setRoomCustomPolygon` stores an override polygon and undoes

**Files:**

- Modify: `core/commands/handlers/room-commands.ts`
- Test: `core/commands/handlers/room-commands.test.ts`

**Behavior under test (`setRoomCustomPolygon(roomKey, polygon)` dispatched through a `Dispatcher`):** Applying the command sets `state.roomOverrides[roomKey].customPolygon` to the given polygon, creating the map and entry if absent and preserving an existing `name` on that entry, while every other room's override stays untouched. The handler reassigns `state.roomOverrides` immutably the same way Task B1's does. Dispatching and then `undo` restores the prior override state for that key (the dispatcher's captured inverse). Cover: setting a custom polygon when `roomOverrides` is absent (map and entry created with the polygon); setting a custom polygon on an entry that already has a name (the name is preserved, the polygon is set); a sibling room's override untouched; a dispatch-then-undo round trip restoring the prior state.

- [ ] **Step 1 (RED):** `/test-first` importing `setRoomCustomPolygon` (and `registerRoomCommands` / `Dispatcher` / `CommandRegistry`), registering the room commands, dispatching a `setRoomCustomPolygon`, asserting the stored polygon and the preserved name and untouched siblings, then `undo` and asserting the prior state is restored. Verify it fails because `setRoomCustomPolygon` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the `SET_ROOM_CUSTOM_POLYGON` constant, `SetRoomCustomPolygonParams`, the `setRoomCustomPolygon` creator (with a clear `description` such as `'Set room outline'`), and the handler that reassigns `state.roomOverrides` immutably to set only the target key's `customPolygon` (reusing the Task B1 helper and preserving the entry's `name`). Register the handler in `registerRoomCommands`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm `setRoomName` and `setRoomCustomPolygon` share the one override-map reassignment helper rather than two near-copies, and that `registerRoomCommands` chains both registrations readably. Commit `refactor:` (empty marker if no change).

---

## Section C: override-aware room scene nodes (`core/scene/`)

### Task C1: `deriveRoomNodesForFloor` carries the effective name and overridden polygon

**Files:**

- Modify: `core/scene/scene-graph.ts`
- Test: `core/scene/scene-graph.test.ts`

**Behavior under test (`deriveRoomNodesForFloor(floor, overrides)`):** With no `overrides`, the room nodes are exactly as slice 1 derived them (id, kind, floorId, polygon, area; no `name`), so the existing scene-graph tests stay green. With an `overrides` map, each room node carries the effective values produced by `applyRoomOverrides`: the optional `name` from a stored override, and the (possibly replaced) `polygon` and recomputed `area` when the override carries a `customPolygon`. The node `id` is unchanged (still the derived `room:<sorted-wall-ids>`), so selection and the override key stay aligned. `RoomSceneNode` gains an optional `name?: string`. Cover: no overrides (nodes unchanged, no `name`); a name override (the node's `name` is set, polygon and area unchanged); a custom-polygon override (the node's `polygon` and `area` reflect the override, `id` unchanged).

- [ ] **Step 1 (RED):** `/test-first` for the three cases above, importing `deriveRoomNodesForFloor` and building a floor plus an overrides map keyed by `roomKey`. Verify it fails because `deriveRoomNodesForFloor` does not accept overrides and `RoomSceneNode` has no `name`. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the optional `name?` on `RoomSceneNode`, the new `overrides` parameter on `deriveRoomNodesForFloor`, and the mapping that runs `applyRoomOverrides(deriveRooms(floor.walls), overrides)` then projects each merged room to a node (carrying `name`, `polygon`, `area`). Keep the no-overrides path identical to slice 1. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `deriveRoomNodesForFloor` a single small projection; ensure the `applyRoomOverrides` call is the only place the merge happens (the command handlers store, the deriver applies). Commit `refactor:` (empty marker if no change).

### Task C2: the deriver rebuilds room nodes when overrides change

**Files:**

- Modify: `core/scene/scene-graph-deriver.ts`
- Test: `core/scene/scene-graph-deriver.test.ts`

**Behavior under test (`createSceneGraphDeriver()` with changing `roomOverrides`):** The deriver memoizes room nodes per floor (slice 1) so an unchanged floor with unchanged overrides reuses its cached room nodes (same node objects). When the project's `roomOverrides` change (a new top-level map reference) while the floor reference is unchanged, the deriver **rebuilds** that floor's room nodes so a newly stored name or custom polygon appears, rather than serving the stale cache. The wall and floor node caches keep their slice-1 behavior. The deriver reads `project.roomOverrides` and passes the relevant entries to `deriveRoomNodesForFloor`. Cover: unchanged floor and unchanged overrides reference reuses the room nodes (reference-equal); a changed `roomOverrides` reference with an unchanged floor rebuilds the room nodes (not reference-equal) and reflects the new name/polygon; an unchanged floor with still-undefined overrides reuses the cache (the slice-1 memoization is preserved when there are no overrides).

The room cache can no longer be keyed by the `Floor` reference alone, since a name change leaves the floor reference unchanged but must invalidate the room nodes. Re-key the room cache so it depends on both the `Floor` reference and the `roomOverrides` reference (the implementer chooses the mechanism, for example a `WeakMap<Floor, { overrides; nodes }>` checked against the current `roomOverrides`, or keying on the relevant per-room override slice); the wall and floor caches are untouched. This is the one subtle interaction between the new top-level slice and the slice-1 per-floor memoization, called out so the implementer pins it rather than discovering it.

- [ ] **Step 1 (RED):** `/test-first` for the reuse-on-unchanged and rebuild-on-changed-overrides cases, deriving twice with the same floor and overrides, then a third time with a new `roomOverrides` reference, asserting reference-equality then reference-inequality and the reflected override. Verify it fails because the room cache ignores overrides today. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the re-keyed room cache and thread `project.roomOverrides` into `deriveRoomNodesForFloor`. Keep the floor and wall caches as they are. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the cache-key logic small and named (the WHY comment should state that a room override changes nodes without changing the floor reference). Confirm the wall/floor memoization is unchanged so their tests stay green. Commit `refactor:` (empty marker if no change).

---

## Section D: area formatting and label content (`core/units/format-area.ts`, `editor/plan/room-label.ts`)

### Task D1: `formatArea` formats a square-millimeter area for display

**Files:**

- Create: `core/units/format-area.ts`
- Test: `core/units/format-area.test.ts`

**Behavior under test (`formatArea(squareMillimeters, preferences)`):** Converts a square-millimeter area to a unit-aware display string in the preferences' system: square meters with the `m²` symbol for metric, square feet with the `ft²` symbol for imperial. The conversion uses the slice-2 length-unit constants squared (square millimeters to square meters divides by `MM_PER_METER` squared; square millimeters to square feet divides by `MM_PER_FOOT` squared) so it reuses the established conversions rather than introducing new magic factors. Pick and document one display precision for area (for example one decimal place for square meters, whole square feet) and pin it; this is independent of the length precision, which targets a different magnitude. The symbol reads with a leading space matching the slice-2 length symbols (`"12.5 m²"`). Cover: a metric area (square millimeters to `m²` at the chosen precision); an imperial area (square millimeters to `ft²` at the chosen precision); a zero area (`"0 m²"` / `"0 ft²"`). The function takes `UnitPreferences` (the same type the length formatters consume) and reads only its `system`.

- [ ] **Step 1 (RED):** `/test-first` importing `formatArea` from `./format-area` and the `UnitPreferences` defaults, asserting the formatted strings for a metric and an imperial area and the zero case. Verify it fails because `formatArea` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `formatArea`: branch on `preferences.system`, convert with the squared length constants, round to the chosen area precision (reusing `roundToDecimalPlaces`), and append the `m²` / `ft²` symbol. Name the precision and any symbol as module constants (`no-magic-numbers`). Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `formatArea` small and one-level; reuse the slice-2 constants and rounding helper rather than restating them. Commit `refactor:` (empty marker if no change).

### Task D2: `roomLabelContent` produces the label lines and anchor

**Files:**

- Create: `editor/plan/room-label.ts`
- Test: `editor/plan/room-label.test.ts`

**Behavior under test (`roomLabelContent(room, options)`):** Returns the label content for a `RoomSceneNode`: the `name` line is the room's effective `name` when it has one and `undefined` when it does not (so the drawing layer paints one or two lines accordingly); the `area` line is `formatArea(room.area, options.preferences)`; and `anchor` is the room's centroid in world space (the average of the polygon vertices, or a documented centroid rule, so the label sits inside the room). Cover: a named room (name line is the name, area line is the formatted area); an unnamed room (name line is `undefined`, area line still present); the anchor equals the centroid of a known polygon. The function is pure and does not touch the Canvas; it reuses `formatArea`.

- [ ] **Step 1 (RED):** `/test-first` importing `roomLabelContent` from `./room-label`, constructing a `RoomSceneNode` with and without a `name`, and asserting the name line, the formatted area line, and the centroid anchor. Verify it fails because the module does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `roomLabelContent`: compute the centroid of `room.polygon`, format the area with `formatArea`, and return `{ name: room.name, area, anchor }`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Factor the centroid computation into a small named helper if it would otherwise crowd the function; avoid a magic divisor (`no-magic-numbers`). Commit `refactor:` (empty marker if no change).

---

## Section E: drawing room labels (`editor/plan/draw-plan.ts`)

### Task E1: `drawRoomLabel` paints the label at the room centroid

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

**Behavior under test (`drawRoomLabel(ctx, room, options)`):** Paints the room label (the name line, if any, and the formatted-area line) centered at the room centroid's **screen** position, projecting the `roomLabelContent` anchor through `worldToScreen(_, options.viewport)` so the label tracks pan and zoom. The behavior is observed through the slice-1/3/4/5 recording fake context (`recordingContext()` in `draw-plan.test.ts`): the label is recorded as one `fillText` call per line (a named room records two `fillText` calls, the name and the area; an unnamed room records one, the area) at the projected centroid screen coordinate (the area line offset below the name line by a named line height). `drawRoomLabel` uses only members already on `PlanDrawingContext` (`font`, `textAlign`, `textBaseline`, `fillStyle`, `fillText`), so the seam does not grow and every existing fake stays valid. Name the label font, color, text alignment, and line height as module constants (`no-magic-numbers`). Cover: a named room records two `fillText` lines at the projected centroid (name then area); an unnamed room records one `fillText` line (area only) at the projected centroid.

- [ ] **Step 1 (RED):** `/test-first` importing `drawRoomLabel` from `./draw-plan` and the recording fake, asserting the `fillText` call count and the projected screen coordinate for a named and an unnamed room. Verify it fails because `drawRoomLabel` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `drawRoomLabel`: get the content via `roomLabelContent(room, { preferences })`, set the label font/color/alignment, project the anchor, and `fillText` the name line (when present) and the area line through the existing seam. Add the label style module constants. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `drawRoomLabel` within `max-lines-per-function`; the two-line layout (name above area) should be a small readable sequence, not a nested conditional. Commit `refactor:` (empty marker if no change).

### Task E2: `drawPlan` paints room labels when the option is set

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

**Behavior under test (`drawPlan(ctx, options)` with `options.roomLabels`):** When `DrawPlanOptions.roomLabels` is a `RoomLabelOptions` (carrying the `preferences`), `drawPlan` paints each room's label (as an overlay above the room fills and wall strokes, so the text is readable on top) by calling `drawRoomLabel` for every room in `options.rooms`; when `roomLabels` is absent, no labels are painted and the slice-1/3/4/5 draw output is unchanged. The `roomLabels` field is optional, so every existing `drawPlan` test (which omits it) stays green. Observe through the recording fake: with `roomLabels` set and one named room, the room-label `fillText` calls appear; without it, none do. Place the label pass after the wall strokes and consistent with the other overlays (snap indicator, marquee), so labels read on top.

- [ ] **Step 1 (RED):** `/test-first` for the labels-present and labels-absent cases of `drawPlan`. Verify it fails because `roomLabels` is not an accepted option. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the optional `roomLabels?: RoomLabelOptions` on `DrawPlanOptions` and the gated per-room `drawRoomLabel` loop inside `drawPlan` (after the wall loop, alongside the existing `preview` / `snap` / `marquee` guarded calls). Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `drawPlan` a readable paint-order sequence within `max-lines-per-function`; the addition is one guarded loop. Commit `refactor:` (empty marker if no change).

---

## Section F: the inline room-name editor (`editor/plan/room-name-editor.tsx`)

### Task F1: the inline room-name editor shows and dispatches the name

**Files:**

- Create: `editor/plan/room-name-editor.tsx`
- Test: `editor/plan/room-name-editor.test.tsx`

**Behavior under test (the inline room-name editor, exercised with React Testing Library):** Given a single selected room (its `roomKey`, current effective `name` which may be empty, and a `dispatch`), the component renders the current name in a labeled text input. Entering a name and committing it (pressing Enter or blurring, whichever the component chooses; pin one) dispatches exactly one `setRoomName` command carrying the `roomKey` and the entered name. Committing an empty string is a valid name clear (it dispatches `setRoomName` with an empty name, which the merge treats as a name of `''`; pin this rule, or, if the component instead chooses to dispatch nothing on empty, pin that). The component takes its data and `dispatch` as props rather than reading the session/selection directly, so the test drives it without the full provider tree and Task G2 supplies the props from the shell. Cover: the input shows the current effective name on render; entering a name and committing dispatches one `setRoomName` with the expected `roomKey` and name; the empty-commit rule (whichever was pinned) is exercised.

- [ ] **Step 1 (RED):** `/test-first` rendering the editor with a selected room and a spy `dispatch`, asserting the current name is shown and a commit dispatches one `setRoomName` with the expected `roomKey` and name (and the pinned empty-commit behavior). Verify it fails because the component does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the component: seed the input from the current name, hold the editing string in local state, and on commit call `dispatch(setRoomName(roomKey, text))` per the pinned rule. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the component within `max-lines` and `max-lines-per-function`; ensure the commit path is single-sourced (Enter and blur route through one handler). Commit `refactor:` (empty marker if no change).

---

## Section G: glue and documentation (infrastructure)

### Task G1: register the room commands and paint labels (`editor-session.ts` + `plan-view.tsx`) (infrastructure)

**Files:**

- Modify: `bridge/session/editor-session.ts`
- Modify: `editor/plan/plan-view.tsx`
- Modify: `core/index.ts` (export the new command types and creators, `roomKey`, `applyRoomOverrides`, `formatArea`)

This is controller-authored wiring and Canvas-and-pointer glue with no RGB triple (jsdom has no 2D canvas). All of its decision logic lives in the pure modules above (`roomKey`, `applyRoomOverrides`, the room commands, `roomLabelContent`, `drawRoomLabel`, `formatArea`); this task only wires them. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Export the new surface from the core barrel.** In `core/index.ts`, add the new types (`SetRoomNameParams`, `SetRoomCustomPolygonParams`) and values (`SET_ROOM_NAME`, `SET_ROOM_CUSTOM_POLYGON`, `setRoomName`, `setRoomCustomPolygon`, `registerRoomCommands`) for the room commands, the topology additions (`roomKey`, `applyRoomOverrides`), and `formatArea` (also added to the `core/units/index.ts` surface in Task D1's GREEN step or here, whichever keeps the units surface complete). `RoomOverride` was exported in Task A2.
- [ ] **Step 2: Register the room commands in the session.** In `bridge/session/editor-session.ts`, call `registerRoomCommands(registry)` alongside `registerProjectCommands` and `registerWallCommands` so `setRoomName` and `setRoomCustomPolygon` dispatch. No other session change is needed: `getSceneGraph()` already re-derives on each change (the memoized scene graph invalidates on every dispatch), and the override-aware deriver (Task C2) reads `project.roomOverrides`, so a dispatched name or override flows to `PlanView` with no further bridge change.
- [ ] **Step 3: Resolve the active unit preferences.** In `PlanView` (or the shell that owns the session), choose `DEFAULT_METRIC_PREFERENCES` or `DEFAULT_IMPERIAL_PREFERENCES` from the project meta's `units` (a project-level unit-preferences store is later work; this slice picks the default for the project's `units`, mirroring slice 3's deferred unit-aware ruler labels and slice 6's inline-editor preference choice). State this default-preferences choice in the deferrals.
- [ ] **Step 4: Paint room labels.** Pass `roomLabels: { preferences }` to `drawPlan` so `drawPlan` paints each room's label (Task E2). The room nodes already carry the effective `name` and overridden polygon (Task C1/C2) through `graph.rooms`, so no extra label data threading is needed. Add the relevant state (the resolved preferences) to the `usePlanRedraw` dependencies so a units change repaints.
- [ ] **Step 5: Keep wall drawing unaffected.** The label pass only reads the derived rooms and paints text; it does not touch pointer handling. The `draw-wall` tool path and the default viewport (unchanged scale and zero offset) keep the end-to-end canvas clicks mapping to the same world points, so the functional wall-drawing end-to-end spec is unaffected.
- [ ] **Step 6: Respect `max-lines`.** If `plan-view.tsx` would exceed `max-lines`, lift the preference resolution into a tiny sibling helper (the way slice 3 split `use-viewport-controls.ts`). Keep `plan-view.tsx` coverage-excluded glue.
- [ ] **Step 7: Verify.** Run the full check chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. Expected: all green; `eslint .` at zero problems; `plan-view.tsx` and `editor-session.ts` stay coverage-excluded glue. Confirm by reasoning that the wall-drawing end-to-end logic is unaffected (the label pass is read-only rendering, and the new commands are dispatched only by the inline editor and any future polygon tool).
- [ ] **Step 8:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task G2: place the room-name editor in the shell (infrastructure)

**Files:**

- Modify: `editor/shell/editor-shell.tsx`

This is controller-authored wiring with no RGB triple; the component's behavior is tested in Task F1. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Render the editor when a single room is selected.** The shell already renders an `editor-shell__inspector` aside driven by `useSelectionIds()`. Render the `room-name-editor` inside the inspector when exactly one selected id names a room (a `room:`-prefixed id present in `graph.rooms`), and keep the existing wall/no-selection text otherwise. No new layout region or CSS is required. (A wall selection keeps the slice-6 wall editor if present; a room selection shows the name editor; these are mutually exclusive because a single id is either a wall or a room.)
- [ ] **Step 2: Supply the editor's props.** Read the session with the existing editor-session hook and the selection with `useSelectionIds`/`useSceneGraph`, resolve the single selected `RoomSceneNode`, derive its `roomKey` by stripping the `room:` prefix from the node id (single-sourced: the same key the override map uses), read its effective `name`, and pass `{ roomKey, name, dispatch }` to the editor.
- [ ] **Step 3: Verify.** Run the full check chain. Expected: all green; `eslint .` at zero problems. The shell stays coverage-excluded glue; the editor component carries its own Task F1 test. Confirm the wall-drawing end-to-end spec is unaffected (the inspector addition is gated on a single room being selected, which the wall-drawing flow does not trigger).
- [ ] **Step 4:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task G3: roadmap update (infrastructure, final task, after the code lands)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark slice 8 done and record its deferrals.** Flip the slice-8 row from `pending` to `done`, update the current-status sentence to include slice 8, and add a "Slice 8 (done) scope and deferrals" block mirroring the slice-4/5/6 voice: labels show the slice-1 centerline area until slice 9's thickness-aware (clear-area) polygons (the label pipeline reads `RoomSceneNode.area`, so labels update with no labeling change when slice 9 lands); Canvas `fillText` labels at the room centroid, with DOM-overlay labels and label-collision/placement handling deferred; room purpose/sub-purpose/era-override/tags deferred to the old-house vocabulary milestone (this slice ships only the user-entered name and the custom polygon; `RoomOverride` is shaped for additive growth); the interactive custom-polygon drawing tool deferred (the command and merge are shipped, the tool is follow-on wiring); selection in-memory and the default unit preferences for the project's `units` until a unit-preferences store lands; and the additive `roomOverrides` top-level slice with its schema bump (v1 to v2) and the migration. Note that the room key is provisionally the sorted bounding-wall ids and that a follow-up finalizes the keying once slice 6 (wall editing) makes its effect on room identity observable (cross-link the open questions).
- [ ] **Step 2: Verify.** `pnpm format:check` passes on the Markdown. Reviewed by `/clean-code-review`. Commit `docs:`.

### Task G4: knowledge curation (post-merge, controller-run)

- [ ] Skip during the slice. After the section-level work lands and merges, the controller runs the `knowledge-curator` to add or refresh a local ADR for room metadata: the stable room key (`roomKey`, the sorted bounding-wall-id rule single-sourced with `Room.id`, cross-link ADR-0026 room derivation), the new top-level `Project.roomOverrides` slice keyed by that key with the inverse-capture-proxy reason it must be top-level (cross-link ADR-0005 command pattern), the two undoable commands and the `applyRoomOverrides` merge, the override-aware room deriver re-keying its cache on override change (cross-link ADR-0018 scene-graph derivation), the Canvas `fillText` room labels through the narrow seam (cross-link ADR-0021 plan-drawing seam), `formatArea` reusing the slice-2 units, and the deferrals (thickness-aware area to slice 9, purpose/era vocabulary to the old-house milestone, custom-polygon drawing tool, DOM-overlay/collision labels). The schema bump (v1 to v2) and the persistence dependency are recorded against the project-stores slice (11). This slice **does** change `core/model/types.ts`; because section 3.2 of the design specification already mandates room naming and the `customPolygon` override, no `docs/specs/` change is required, but the ADR records the additive-top-level-slice decision and the schema migration. Regenerate the local index with `pnpm knowledge:index` and run `pnpm rgb:audit` to confirm the red-green-blue ordering across the slice.

---

## Open questions pending dependencies

These are dependency-blocked decisions, not unspecified scope. Everything inside this slice's decided scope is fully specified above; each item below names the question, the dependency, the provisional assumption this slice ships, and the follow-up round that finalizes it.

- **(a) How the room key stays stable across edits (the core open question).** The room override map and the commands key on `roomKey(room)`, the sorted bounding-wall-id string. This is stable across pure re-derivation (Task A1 pins that), but it depends on the room-derivation identity model and **interacts with slice 6 (wall editing)**: moving a wall endpoint can reshape, merge, or split a room, and removing or adding a bounding wall changes the sorted-wall-id set, so a room can lose or change its key and orphan its stored name or polygon override. **Provisional assumption:** the sorted bounding-wall-id key is the room identity for this slice; a name or override survives edits that leave the bounding-wall set unchanged, and is orphaned (the derived room reverts to no name and the centerline polygon) when the set changes. The orphaned entry stays in `roomOverrides` (harmless: `applyRoomOverrides` ignores keys that match no current room) rather than being garbage-collected here. **Dependency / follow-up:** once slice 6 lands and its effect on room identity is observable (which edits preserve a room versus reshape it), a follow-up round finalizes the keying rule, for example a stable per-room identifier assigned on first naming and carried through edits, plus an orphan-reconciliation or garbage-collection step. This slice's `roomKey` is the single seam that follow-up changes.

- **(b) Persistence of room names and polygon overrides (shared-schema dependency).** Room metadata persists in the new top-level `Project.roomOverrides` slice, which this slice adds to `core/model/types.ts` with one additive schema migration (v1 to v2). **Dependency:** durable persistence and the migration round-trip are owned by the project-stores slice (11), and the `ROADMAP.md` project-stores note already flags coordinated shared-schema changes (`writeHistory`, `packsRequired`) as deferred follow-ups; the `roomOverrides` field and its migration are another such coordinated change. **Provisional assumption:** the additive field and the no-op-shaped migration land here so the in-memory model and the command/undo path are complete and testable now, and the migration framework round-trips (the slice-11 acceptance criterion); the running app's store default switch and any large-project async migration concerns stay with slice 11. **Follow-up:** the project-stores slice confirms the field serializes and round-trips through the durable stores and folds the schema bump into its coordinated shared-schema change set.

- **(c) The area shown in labels is the centerline area until slice 9.** Labels render `RoomSceneNode.area`, which is the slice-1 **centerline** shoelace area (the slice-1 deferral of thickness-aware interior inset). **Dependency:** slice 9 (dimensions and thickness-aware area) introduces clear-area (interior-inset) polygons and the area they imply. **Provisional assumption:** labels show the centerline area now; because the label pipeline reads `RoomSceneNode.area` and `formatArea` is independent of how that number is produced, no labeling change is needed when slice 9 changes what the field holds. **Follow-up:** slice 9 updates the room polygon/area derivation; the labels then display the clear area automatically, and the slice-9 plan notes the label consumer.

- **(d) Label placement, collision handling, and DOM-overlay versus Canvas labels.** This slice paints labels on the Canvas with `fillText` at the room centroid, one name line over one area line, with no automatic placement to avoid overlapping labels in adjacent small rooms and no label dragging or auto-hide. **Dependency:** the design specification's interactive DOM overlay for chips and rings (sections 6.11 and 6.13) and any collision-aware label layout are later overlay/polish work, consistent with the slice-3/4/5 decision to draw plan chrome on the Canvas and defer the DOM overlay. **Provisional assumption:** centroid-anchored Canvas labels are sufficient for this slice; the anchor and the two-line layout are the only placement rules. **Follow-up:** the overlay/polish round (or a dedicated labeling-refinement follow-up) adds collision-aware placement, optional label dragging, and the DOM-overlay mirror once the overlay lands; `roomLabelContent`'s `anchor` is the seam that refinement adjusts.

---

## Self-review

**Spec coverage:** Design specification section 3.2 ("Rooms are derived, not authored. Users name and tag rooms; geometry comes from walls. A `customPolygon` override exists for cases where wall topology can't infer a room") is covered by the stable key (A1), the override store (A2), the merge (A3), the two commands (B1, B2), and the override-aware deriver (C1, C2): rooms stay derived, with names and an override polygon stored separately and merged in. Section 6.11 ("2D plan: Canvas `fillText` for dimensions and labels") is covered by the label content (D2), `formatArea` (D1), and the label drawing (E1, E2). The Phase 1 deliverables "Room detection + manual `customPolygon` override" and "Room naming and labeling" map to this slice; room purpose/era vocabulary and the interactive polygon tool are explicitly deferred in the Scope boundary and `ROADMAP.md` (Task G3).

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" placeholders inside decided scope. Every behavior task names the signature under test and the concrete cases to pin; every infrastructure step is a concrete wiring instruction. No literal test bodies or full implementations appear, per the role-separated cycle; the only code shown is the public-contract block. The "Open questions pending dependencies" section is dependency-blocked deferrals with a provisional assumption and a named follow-up for each, not unspecified work.

**Type-name consistency:** The public names are spelled identically across every task and the contract block: `RoomOverride`, `Project.roomOverrides`, `roomKey`, `applyRoomOverrides`, `SET_ROOM_NAME`, `SET_ROOM_CUSTOM_POLYGON`, `SetRoomNameParams`, `SetRoomCustomPolygonParams`, `setRoomName`, `setRoomCustomPolygon`, `registerRoomCommands`, `RoomSceneNode.name`, `deriveRoomNodesForFloor`, `formatArea`, `RoomLabelContent`, `RoomLabelOptions`, `roomLabelContent`, `drawRoomLabel`, and the `roomLabels?: RoomLabelOptions` option. `RoomOverride` is single-sourced in `core/model/types.ts`, re-exported from `core`, and imported by topology, the room commands, and the scene graph. `roomKey` returns the unprefixed key used identically by the command params and the `roomOverrides` map keys; `Room.id` and `RoomSceneNode.id` keep the `room:` prefix and equal `'room:' + roomKey`. The new `RoomSceneNode.name`, `Project.roomOverrides`, `DrawPlanOptions.roomLabels`, and the `overrides` parameter of `deriveRoomNodesForFloor` are all optional/additive, so slice-1/3/4/5 call sites and tests compile and pass unchanged, and `registerRoomCommands` is a new registration alongside the existing project/wall registrations.

**Model and migration discipline:** This slice changes `core/model/types.ts` (the additive `RoomOverride` and optional `Project.roomOverrides`) and adds one schema migration with a `CURRENT_SCHEMA_VERSION` bump (1 to 2). The change is required and justified: the inverse-capture proxy records only the root's top-level keys (`core/commands/inverse-capture.ts`), so an undoable room-metadata store must be a new top-level `Project` slice, and naming must persist, so a derived-only or nested store cannot satisfy the command/undo invariant. The migration is additive and effectively a no-op (an absent map is treated identically to an empty one by the merge), follows `core/migrations/types.ts` (it transforms data only and never sets `meta.schemaVersion`), and no `docs/specs/` change is needed because section 3.2 already mandates this behavior; the schema bump and durable persistence are coordinated with the project-stores slice per open question (b).

**Ordering and dependencies:** the stable key and override store (A) precede the merge and commands (A3, B) that use them; the merge (A3) precedes the override-aware deriver (C) that calls it; the deriver (C) precedes the label drawing/glue (E, G) that read `RoomSceneNode.name`; `formatArea` (D1) precedes `roomLabelContent` (D2) and `drawRoomLabel` (E1) that call it; the commands (B) precede the inline editor (F1) and the glue (G1, G2) that dispatch them; the core-barrel and session registration (G1) precede the inspector wiring (G2); the roadmap update (G3) is the final task after all code lands; knowledge curation (G4) is post-merge. The `recordingContext()` fake already exposes `font` / `textAlign` / `textBaseline` / `fillText`, so `drawRoomLabel` needs no seam growth and every fake in `draw-plan.test.ts` stays a valid `PlanDrawingContext`.

**Back-compatibility and acceptance:** `Project` (now with optional `roomOverrides`), `RoomSceneNode` (now with optional `name`), `DrawPlanOptions` (now with optional `roomLabels`), `deriveRoomNodesForFloor` (now with an optional `overrides` parameter), and `createSceneGraphDeriver` remain compatible with every existing call site and test. The functional wall-drawing end-to-end spec is preserved because the label pass is read-only rendering and the new commands dispatch only from the inline room-name editor and any future polygon tool, leaving the `draw-wall` pointer-to-world mapping identical. At acceptance the key is stable, the merge honors name and custom polygon, the migration round-trips, the two commands apply and undo through the dispatcher, the deriver carries the effective name and overridden polygon and rebuilds on override change, `formatArea` and `roomLabelContent` produce the label lines, and `drawRoomLabel` paints them through the seam, with the full check chain green, `eslint .` at zero problems, and `rgb:audit` clean.
