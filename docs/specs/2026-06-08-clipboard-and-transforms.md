# Slice design: clipboard and transforms

Status: approved for planning (2026-06-08)
Scope owner: the clipboard-and-transforms slice (branch `feat/clipboard-and-transforms`), slice 10 of the Phase 1 two-dimensional plan editor
Authoritative parent spec: `docs/specs/2026-06-01-vernacular-design.md`, sections 3.1, 6.1, and the section 10 Phase 1 deliverable "Copy/paste/delete/move/rotate"
Base: stacked on slice 9 (`feat/dimensions-and-thickness-aware-area`); the project schema is at version 4 and `Floor` carries `walls`, `openings`, `underlays`, and `dimensions`.

## 1. Purpose

After slice 9 the user can draw, edit, annotate, and persist a plan, but the
selection built in slice 5 only drives inspectors. The user cannot yet move a
selected wall, delete a mistake, duplicate a room's worth of walls, or spin a
group of entities to a new orientation. This slice turns selection into editing:
it adds **transforms** (move and rotate the selection, delete the selection) and
a **clipboard** (copy, cut, paste the selection), all undoable, completing the
editing surface the Phase-1 deliverable list names and making the two-dimensional
editor genuinely usable.

The behavioral contracts: **the selected plan entities translate and rotate as a
rigid group through undoable commands**; **deleting the selection removes its
walls (and the openings they host), openings, and dimensions in one undoable
step**; and **copy captures the selection to a clipboard, and paste re-instantiates
it with fresh identities at an offset, selecting the new copies.**

## 2. Goals and non-goals

### Goals

- Pure point transforms in `core/geometry/point.ts`: `translatePoint(point,
delta)` and `rotatePoint(point, pivot, radians)`.
- Three undoable transform commands through `dispatch`
  (`core/commands/handlers/transform-commands.ts`): `translateEntities`,
  `rotateEntities`, and `deleteEntities`. Each operates on a floor and an array
  of selected entity ids. Translate and rotate map the endpoints of selected
  walls and the endpoints of selected dimensions through the shared point
  transform; openings ride their host wall (their along-wall `position` is
  unchanged, so they follow a transformed wall for free). Delete removes selected
  walls, the openings those walls host (a cascade), selected openings, and
  selected dimensions, all in one inverse-captured step.
- A pure clipboard core (`core/clipboard/`): a `ClipboardSnapshot`
  (`walls`, `openings`, `dimensions`); `buildClipboardSnapshot(floor, entityIds)`
  that gathers the selected walls, the openings those walls host, and the
  selected dimensions; `serializeClipboard` / `deserializeClipboard` (a tagged,
  versioned text payload, the shared core for both clipboard backings); and
  `instantiateClipboard(snapshot, offset, mintId)` that mints fresh ids, remaps
  each opening's `hostWallId` to its new wall, offsets the wall and dimension
  geometry, and returns the new entities together with their new ids.
- A `pasteEntities` command that appends the instantiated walls, openings, and
  dimensions to a floor in one inverse-captured step, building the entities
  eagerly at command-creation time so redo reuses the same ids (mirroring
  `addWall`).
- An in-app clipboard store in the bridge (`createClipboardStore`), held outside
  undo exactly like the selection store, plus an additive system-clipboard
  adapter (`writeSystemClipboard` / `readSystemClipboard`) layered on the same
  serializer so copy and paste also reach the operating-system clipboard when the
  browser allows it.
- Editor interaction: a move-drag that translates the selection as the pointer
  drags a selected entity with a live ghost preview; arrow-key nudging;
  Delete/Backspace to delete; the platform copy, cut, and paste keystrokes; and a
  selection transform panel with rotate by ninety degrees in each direction and a
  numeric angle entry, rotating about the selection center.

### Non-goals (documented deferrals)

- **Free-angle rotate by a draggable handle, with modifier-key angle snapping.**
  This is the planned near-term follow-up. The `rotateEntities` command already
  accepts an arbitrary angle and an explicit pivot, so the handle is purely an
  editor-side addition: a draggable rotate gizmo on the selection bounds emitting
  a continuous angle, with a held modifier snapping to common angles (for example
  fifteen, forty-five, and ninety degrees). It is captured here and scheduled
  next, not built in this slice; the design specification's rotation gizmo
  (section 512) is the eventual home.
- **Paste at the pointer.** Paste uses a small fixed offset so the copy is
  visible and distinct from the original; honoring the cursor position (paste
  where the mouse is) is later polish.
- **Explicit junction-merge or smart-snapping on move and paste.** Room
  derivation is a geometric projection of the wall graph (ADR-0026), so a moved
  or pasted wall whose endpoint lands on another's forms a junction and re-derives
  rooms with no extra work. Snapping a dragged selection to nearby geometry
  (reusing the slice-4 snap model during the move) is later polish; the move
  commits the raw translated geometry this slice.
- **Transforming underlays through the selection.** Underlays are not selectable
  plan entities (they are not in the slice-5 hit-test) and keep their own
  placement and calibration tooling (ADR-0037). They are out of scope here.
- **Transforming or copying rooms directly.** Rooms are a derived projection, not
  stored entities; they move, rotate, copy, and delete implicitly through their
  bounding walls. The clipboard and transforms act only on stored entities.
- **Cross-floor paste and multi-floor transforms.** Every command targets a
  single `floorId` (the active floor), matching the rest of Phase 1.

## 3. Constraints

- `core/` imports neither React nor Three.js; the geometry, commands, and
  clipboard core are pure TypeScript (parent spec invariant 1).
- All mutation flows through `dispatch(command)`; no handler hand-authors an
  inverse (ADR-0005). The clipboard store and the system-clipboard adapter are
  not mutations of the project, so they stay outside undo, like selection
  (ADR-0020).
- Command params are plain serializable data (the command history persists with
  autosave), so entity ids are passed as `string[]`, not a `Set`, and the paste
  command stores concrete entities, not a snapshot reference.
- No new persisted project field and therefore no schema migration: transforms
  mutate existing walls, openings, and dimensions, and the clipboard payload is
  transient (an in-app store plus the operating-system clipboard), never written
  into `project.json`. The serialized clipboard payload carries its own small
  format tag and version, independent of the project schema.
- Selection stays bridge-owned and outside undo (ADR-0020); transforms read the
  selected ids from the bridge and write through `dispatch`.
- The wall-drawing end-to-end flow stays green: the move-drag, nudging, delete,
  clipboard keystrokes, and rotate panel are gated on the `select` tool, so the
  drawing tools are untouched, and a project the user never transforms behaves
  exactly as before.
- The full check chain and `rgb:audit` stay green; ESLint at zero problems.

## 4. Point transforms

`core/geometry/point.ts` gains two pure helpers beside `distance`:

```ts
/** `point` shifted by `delta` (component-wise addition), in millimeters. */
export function translatePoint(point: Point, delta: Point): Point

/** `point` rotated about `pivot` by `radians` (positive is counter-clockwise in plan space). */
export function rotatePoint(point: Point, pivot: Point, radians: number): Point
```

`rotatePoint` translates `point` into pivot-relative coordinates, applies the
standard rotation (`cos`/`sin`), and translates back. Plan space has y increasing
upward (the model's convention), so a positive angle is counter-clockwise on the
plan; the editor maps the rotate-left and rotate-right controls onto the sign.

## 5. Transform commands

`core/commands/handlers/transform-commands.ts` adds three commands, each
reassigning `state.floors` immutably so the dispatcher captures the inverse
(ADR-0005), reusing the `mapTargetFloor` shape the wall, opening, and dimension
commands share.

A shared private helper maps a floor's selected geometry through a point
function:

```ts
function transformFloorEntities(
  floor: Floor,
  ids: ReadonlySet<string>,
  move: (point: Point) => Point,
): Floor
```

It maps each wall whose id is in `ids` to one with both endpoints moved, maps each
dimension whose id is in `ids` to one with both endpoints moved, and leaves
openings (parametric on their wall), and every unselected entity, reference-equal.

```ts
export const TRANSLATE_ENTITIES = 'floor/translate-entities'
export const ROTATE_ENTITIES = 'floor/rotate-entities'
export const DELETE_ENTITIES = 'floor/delete-entities'

export interface TranslateEntitiesParams {
  floorId: string
  entityIds: string[]
  delta: Point
}
export interface RotateEntitiesParams {
  floorId: string
  entityIds: string[]
  pivot: Point
  radians: number
}
export interface DeleteEntitiesParams {
  floorId: string
  entityIds: string[]
}

export function translateEntities(
  floorId: string,
  entityIds: string[],
  delta: Point,
): Command<TranslateEntitiesParams>
export function rotateEntities(
  floorId: string,
  entityIds: string[],
  pivot: Point,
  radians: number,
): Command<RotateEntitiesParams>
export function deleteEntities(floorId: string, entityIds: string[]): Command<DeleteEntitiesParams>
export function registerTransformCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project>
```

`translateEntities` applies `transformFloorEntities` with `point =>
translatePoint(point, delta)`; `rotateEntities` with `point => rotatePoint(point,
pivot, radians)`. `deleteEntities` filters the floor: it drops walls whose id is
selected, drops openings whose id is selected or whose `hostWallId` is a deleted
wall (the cascade, so a deleted wall takes its openings with it), and drops
dimensions whose id is selected. `registerTransformCommands` is wired into the
live session registry.

The rotation pivot is supplied by the caller so the command stays general (the
deferred free-rotate handle can pass a different pivot). A pure
`selectionCenter(floor, entityIds): Point` in the same module returns the center
of the bounding box of the selected walls' and dimensions' endpoints (the
editor's rotate panel passes it as the pivot); an empty or geometry-free selection
yields the origin.

## 6. The clipboard core

`core/clipboard/` holds the pure, framework-free clipboard logic:

```ts
export interface ClipboardSnapshot {
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
}

/** Gathers the selected walls, the openings hosted on those walls, and the selected dimensions. */
export function buildClipboardSnapshot(floor: Floor, entityIds: Iterable<string>): ClipboardSnapshot

/** A tagged, versioned text payload for the operating-system clipboard. */
export function serializeClipboard(snapshot: ClipboardSnapshot): string
/** Parses a payload back to a snapshot; returns undefined for foreign or malformed text. */
export function deserializeClipboard(text: string): ClipboardSnapshot | undefined

export interface InstantiatedEntities {
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
  /** New ids of every instantiated entity, for selecting the paste. */
  ids: string[]
}

/** Mints fresh ids, remaps each opening's hostWallId to its new wall, offsets geometry. */
export function instantiateClipboard(
  snapshot: ClipboardSnapshot,
  offset: Point,
  mintId?: () => string,
): InstantiatedEntities
```

`buildClipboardSnapshot` includes an opening only when its `hostWallId` is one of
the selected walls, so the clipboard never holds an opening it cannot re-host; a
selected opening whose wall is not also selected is dropped (it has no home to
paste onto). `serializeClipboard` writes a small JSON object with a format tag
(for example `{ "kind": "vernacular/clipboard", "version": 1, ... }`);
`deserializeClipboard` returns `undefined` on a missing or unknown tag, malformed
JSON, or a future version, so a stray operating-system-clipboard string never
corrupts a paste. `instantiateClipboard` builds an old-to-new wall id map first,
mints a new id for each wall and dimension, remaps every opening onto its new wall
(dropping any opening whose host wall is absent), offsets every wall endpoint and
dimension endpoint by `offset` (openings need no offset, riding their wall), and
returns the new entities plus the flat list of new ids. `mintId` defaults to
`globalThis.crypto.randomUUID` and is injectable for deterministic tests.

`core/commands/handlers/transform-commands.ts` adds the paste command:

```ts
export const PASTE_ENTITIES = 'floor/paste-entities'
export interface PasteEntitiesParams {
  floorId: string
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
}
export function pasteEntities(
  floorId: string,
  entities: InstantiatedEntities,
): Command<PasteEntitiesParams>
```

The creator captures the already-instantiated entities (their ids fixed once, so
redo reuses them, like `addWall`); the handler appends them to the floor's walls,
openings, and dimensions. Undo is the framework-captured inverse.

## 7. Clipboard backings in the bridge

`bridge/clipboard/clipboard-store.ts` adds an in-app clipboard, the primary
backing, mirroring the selection store:

```ts
export interface ClipboardStore {
  read(): ClipboardSnapshot | undefined
  write(snapshot: ClipboardSnapshot): void
}
export function createClipboardStore(): ClipboardStore
```

`bridge/clipboard/system-clipboard.ts` adds the additive operating-system layer
over the shared serializer:

```ts
/** Writes the serialized snapshot to the operating-system clipboard; resolves silently if unavailable. */
export async function writeSystemClipboard(snapshot: ClipboardSnapshot): Promise<void>
/** Reads and deserializes a snapshot from the operating-system clipboard; undefined if unavailable or foreign. */
export async function readSystemClipboard(): Promise<ClipboardSnapshot | undefined>
```

Both guard on `navigator.clipboard` and swallow permission and parse failures
(returning `undefined` or resolving). Copy writes the in-app store synchronously
and the operating-system clipboard opportunistically; paste prefers a valid
operating-system payload and falls back to the in-app store, so paste works within
the session even when clipboard permission is denied, and across tabs or after a
reload when it is granted.

## 8. Editor interaction

All of the following are gated on the `select` tool so the drawing tools are
untouched.

- **Move-drag.** `editor/plan/move-drag.ts` is a small state machine: a pointer
  press on a selected entity begins a drag at that world point; pointer moves
  produce a live delta from the press point; the release emits a
  `translateEntities(floorId, selectedIds, delta)` command (a zero-delta release
  emits nothing). While dragging, a ghost of the selected walls and dimensions,
  translated by the live delta, paints through the plan-preview seam. The
  move-drag sits beneath the slice-6 endpoint-handle drag and the slice-7
  opening-along-wall drag in pointer priority: a press that lands on an endpoint
  handle or an opening keeps its existing behavior; a press on a selected entity's
  body starts a move; a press on empty space remains the slice-5 marquee.
- **Keyboard.** On the `select` tool: arrow keys nudge the selection by one grid
  step via `translateEntities` (a held shift uses a larger step); Delete and
  Backspace dispatch `deleteEntities` and clear the selection; the platform copy
  keystroke builds a snapshot and writes both clipboard backings; cut copies then
  deletes; paste instantiates at the fixed offset, dispatches `pasteEntities`, and
  selects the new copies.
- **Rotate.** `editor/plan/selection-transform-panel.tsx` shows, when the
  selection is non-empty, a rotate-left and a rotate-right control (ninety degrees
  each) and a numeric angle entry, dispatching `rotateEntities(floorId,
selectedIds, selectionCenter(floor, selectedIds), radians)`.

## 9. Testing strategy

Red-green-blue per behavior with the role-separated subagents:

- **Pure core, unit-tested:** `translatePoint` and `rotatePoint` (a point about a
  pivot, including the ninety-degree and zero cases); each transform command's
  apply and the framework-captured inverse (translate moves selected wall and
  dimension endpoints and leaves openings and unselected entities reference-equal;
  rotate likewise; delete drops selected walls with their hosted openings,
  selected openings, and selected dimensions); `selectionCenter`;
  `buildClipboardSnapshot` (walls plus their hosted openings plus selected
  dimensions, dropping an opening whose wall is unselected); the
  serialize/deserialize round-trip and the foreign-text rejection;
  `instantiateClipboard` (fresh ids, remapped hostWallId, offset geometry); and
  the `pasteEntities` apply and inverse.
- **Bridge, unit-tested:** the in-app clipboard store read/write; the
  system-clipboard adapter against a mocked `navigator.clipboard` (write then read
  round-trips, and a foreign string yields `undefined`).
- **Editor logic, unit-tested:** the move-drag state machine and its ghost
  preview; the rotate panel (its own React Testing Library test, asserting the
  dispatched `rotateEntities` angle and pivot).
- **Glue, coverage-excluded, e2e-validated:** the keyboard wiring, the move-drag
  and rotate-panel placement, and the clipboard-backing composition. The
  wall-drawing end-to-end spec stays green.

## 10. Open questions and follow-ups

- **Free-angle rotate handle (next).** The committed near-term follow-up: a
  draggable rotate gizmo on the selection bounds emitting a continuous angle, with
  a held modifier snapping to common angles. The command and pivot are already in
  place; only the editor gizmo and its hit-test remain.
- **Paste at the pointer.** Replacing the fixed paste offset with the cursor
  position once a paste-location source is threaded through the keyboard glue.
- **Snap-while-moving.** Reusing the slice-4 snap model during a move-drag so a
  dragged endpoint snaps to nearby geometry, and an explicit junction-merge pass
  if geometric re-derivation proves insufficient.
- **Cross-floor and multi-select-group polish.** Cross-floor paste, and a
  persistent group-transform gizmo spanning the whole selection, follow the
  multi-floor milestone.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 3.1
  (the per-floor entity tree the transforms and clipboard act on), section 6.1
  (the editing surface), section 512 (the deferred rotation gizmo), and the
  section 10 Phase 1 deliverable "Copy/paste/delete/move/rotate". This document
  records the slice's interpretation and the now/deferred boundary.
- ADR-0005 (framework-captured inverse), ADR-0020 (bridge-owned selection outside
  undo, which the clipboard store joins), ADR-0026 (geometric room derivation, so
  moved and pasted walls re-form junctions for free), ADR-0032 (the hit-test the
  move-drag routes beneath), ADR-0037 (the additive-per-floor-entity command
  pattern the transform and paste commands follow).
