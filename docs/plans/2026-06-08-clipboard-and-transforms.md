# Clipboard and Transforms Implementation Plan

> **For agentic workers:** Executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`). Each behavior runs RED (`/test-first` -> `test-author`, commit `test:`), GREEN (`/implement` -> `implementer`, commit `feat:`), then BLUE (`/clean-code-review` then `/refactor`, commit `refactor:` or an empty marker). Tasks marked `(infrastructure)` are controller-authored glue (React/Canvas/keyboard/tool wiring, docs) committed as `build:`/`docs:` or with an `Infrastructure:` trailer so the cycle audit skips them. This plan names each behavior and its public signature; it ships no literal test bodies.

**Goal:** Turn selection into editing: move, rotate, and delete the selected plan entities through undoable commands, and copy, cut, and paste them through a clipboard, completing the usable two-dimensional editor.

**Architecture:** Pure point transforms (`translatePoint`, `rotatePoint`) feed three undoable floor commands (`translateEntities`, `rotateEntities`, `deleteEntities`) that map selected wall and dimension endpoints (openings ride their host wall; rooms re-derive). A pure clipboard core (`buildClipboardSnapshot`, `serializeClipboard`/`deserializeClipboard`, `instantiateClipboard`) feeds a `pasteEntities` command and two bridge backings (an in-app store plus an operating-system-clipboard adapter sharing the serializer). The editor adds a move-drag with a ghost preview, a ghost render in `drawPlan`, a rotate panel, and keyboard glue, all gated on the `select` tool.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Canvas 2D, React + React Testing Library, Vitest. No new dependencies. Stacked on slice 9 (schema v4; `Floor` has `walls`, `openings`, `underlays`, `dimensions`).

---

## Scope boundary (this is slice 10 of ~12)

Designed in `docs/specs/2026-06-08-clipboard-and-transforms.md`, recorded in ADR-0040. **In scope:** `translatePoint`/`rotatePoint`; `translateEntities`/`rotateEntities`/`deleteEntities` commands with `transformFloorEntities` and `selectionCenter`; the `ClipboardSnapshot`, `buildClipboardSnapshot`, `serializeClipboard`/`deserializeClipboard`, `instantiateClipboard`, and the `pasteEntities` command; the in-app `createClipboardStore` and the `writeSystemClipboard`/`readSystemClipboard` adapter; the move-drag state machine and its ghost preview; the `drawPlan` ghost render; the rotate panel; and the editor glue (move-drag wiring, arrow-key nudge, delete, copy/cut/paste keystrokes, clipboard-backing composition, pointer routing). **Out of scope (deferrals in the slice spec, section 2):** the free-angle rotate drag handle with modifier-key angle snapping (the committed near-term follow-up); paste at the pointer (a fixed offset this slice); snap-while-moving and explicit junction-merge (rooms re-derive geometrically); transforming underlays through the selection; transforming or copying rooms directly; and cross-floor paste.

**Acceptance:** `translatePoint`/`rotatePoint` are correct including the zero and ninety-degree cases; `translateEntities`/`rotateEntities` move selected wall and dimension endpoints, leave openings and unselected entities reference-equal, and undo through the captured inverse; `deleteEntities` drops selected walls with their hosted openings, selected openings, and selected dimensions, and undo restores them; `selectionCenter` returns the selection bounding-box center; `buildClipboardSnapshot` gathers selected walls, their hosted openings, and selected dimensions and drops an opening whose wall is unselected; `serializeClipboard`/`deserializeClipboard` round-trip and reject foreign text; `instantiateClipboard` mints fresh ids, remaps `hostWallId`, and offsets geometry; `pasteEntities` appends and undoes; the in-app store reads what it writes; the system adapter round-trips against a mocked `navigator.clipboard` and rejects a foreign string; the move-drag emits `translateEntities` and previews a ghost; `drawPlan` paints ghost segments; the rotate panel dispatches `rotateEntities` with the center pivot. Full chain green; `eslint .` zero problems; `rgb:audit` clean; wall-drawing e2e still passes.

---

## Public contract

```ts
// core/geometry/point.ts (additions)
export function translatePoint(point: Point, delta: Point): Point
export function rotatePoint(point: Point, pivot: Point, radians: number): Point

// core/commands/handlers/transform-commands.ts
export const TRANSLATE_ENTITIES = 'floor/translate-entities'
export const ROTATE_ENTITIES = 'floor/rotate-entities'
export const DELETE_ENTITIES = 'floor/delete-entities'
export const PASTE_ENTITIES = 'floor/paste-entities'
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
export interface PasteEntitiesParams {
  floorId: string
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
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
export function pasteEntities(
  floorId: string,
  entities: InstantiatedEntities,
): Command<PasteEntitiesParams>
export function selectionCenter(floor: Floor, entityIds: Iterable<string>): Point
export function registerTransformCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project>

// core/clipboard/clipboard.ts
export interface ClipboardSnapshot {
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
}
export function buildClipboardSnapshot(floor: Floor, entityIds: Iterable<string>): ClipboardSnapshot
export function serializeClipboard(snapshot: ClipboardSnapshot): string
export function deserializeClipboard(text: string): ClipboardSnapshot | undefined
export interface InstantiatedEntities {
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
  ids: string[]
}
export function instantiateClipboard(
  snapshot: ClipboardSnapshot,
  offset: Point,
  mintId?: () => string,
): InstantiatedEntities

// bridge/clipboard/clipboard-store.ts
export interface ClipboardStore {
  read(): ClipboardSnapshot | undefined
  write(snapshot: ClipboardSnapshot): void
}
export function createClipboardStore(): ClipboardStore
// bridge/clipboard/system-clipboard.ts
export function writeSystemClipboard(snapshot: ClipboardSnapshot): Promise<void>
export function readSystemClipboard(): Promise<ClipboardSnapshot | undefined>

// editor/plan/move-drag.ts
export type MoveDragState =
  | { phase: 'idle' }
  | { phase: 'dragging'; origin: Point; segments: readonly PreviewSegment[] }
export const IDLE_MOVE_DRAG: MoveDragState
export function beginMoveDrag(origin: Point, segments: readonly PreviewSegment[]): MoveDragState
export function moveDragGhost(state: MoveDragState, pointer: Point): readonly PreviewSegment[]
export interface MoveDragResult {
  state: MoveDragState
  command?: Command<TranslateEntitiesParams>
}
export function endMoveDrag(
  state: MoveDragState,
  pointer: Point,
  floorId: string,
  entityIds: string[],
): MoveDragResult

// editor/plan/draw-plan.ts (addition): DrawPlanOptions gains `ghost?: readonly PreviewSegment[]`, painted as dashed ghost lines
// editor/plan/selection-transform-panel.tsx: <SelectionTransformPanel floorId entityIds center dispatch/> with rotate -90/+90 and a numeric angle entry
```

---

## Section A: point transforms (`core`)

### Task A1: translatePoint and rotatePoint

**Files:** modify `core/geometry/point.ts`, `core/geometry/point.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED** `/test-first`: `translatePoint({ x: 10, y: 20 }, { x: 3, y: -4 })` is `{ x: 13, y: 16 }`; `rotatePoint({ x: 100, y: 0 }, { x: 0, y: 0 }, Math.PI / 2)` is `{ x: 0, y: 100 }` (counter-clockwise; assert within a small epsilon); `rotatePoint(p, pivot, 0)` returns `p`'s coordinates; rotating about a non-origin pivot returns the pivot-relative rotation. Signatures: `translatePoint`, `rotatePoint`.
- [ ] **GREEN** `/implement`: `translatePoint` adds components; `rotatePoint` subtracts the pivot, applies `cos`/`sin`, and adds the pivot back.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export both from `core/index.ts`.

---

## Section B: transform commands (`core`)

### Task B1: translateEntities and rotateEntities

**Files:** create `core/commands/handlers/transform-commands.ts`, `core/commands/handlers/transform-commands.test.ts`; export from `core/index.ts` and register in `bridge/session/editor-session.ts` (infra).

- [ ] **RED** `/test-first` (mirror `dimension-commands.test.ts` for the dispatch and inverse pattern, built through `registerTransformCommands`): `translateEntities(floorId, [wallId, dimId], { x: 50, y: 0 })` moves that wall's `start`/`end` and that dimension's `start`/`end` by the delta, leaves an unselected wall and an opening reference-equal, and undo restores; `rotateEntities(floorId, [wallId], pivot, Math.PI / 2)` rotates the wall's endpoints about the pivot, and undo restores; `selectionCenter(floor, [wallId])` returns the center of that wall's endpoint bounding box, and an empty selection returns `{ x: 0, y: 0 }`. Signatures: `TRANSLATE_ENTITIES`, `ROTATE_ENTITIES`, params, creators, `selectionCenter`, `registerTransformCommands`.
- [ ] **GREEN** `/implement`: a private `transformFloorEntities(floor, idSet, move)` maps selected walls (both endpoints) and dimensions (both endpoints) through `move`, leaving openings and unselected entities reference-equal; `translateEntities` uses `point => translatePoint(point, delta)`, `rotateEntities` uses `point => rotatePoint(point, pivot, radians)`; both reassign `state.floors` via the shared `mapTargetFloor` shape; `selectionCenter` gathers selected wall and dimension endpoints and returns the bounding-box midpoint (origin when empty). `registerTransformCommands` registers both handlers.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export the symbols from `core/index.ts` and call `registerTransformCommands(registry)` in `editor-session.ts` (infra).

### Task B2: deleteEntities

**Files:** modify `core/commands/handlers/transform-commands.ts`, `core/commands/handlers/transform-commands.test.ts`.

- [ ] **RED** `/test-first`: `deleteEntities(floorId, [wallId])` removes that wall and every opening whose `hostWallId` is that wall (the cascade), leaving dimensions and other walls intact; `deleteEntities(floorId, [openingId, dimId])` removes that opening and that dimension only; undo restores all removed entities. Signatures: `DELETE_ENTITIES`, `DeleteEntitiesParams`, `deleteEntities`.
- [ ] **GREEN** `/implement`: the handler builds the deleted-wall id set, then sets the floor's `walls` (drop selected), `openings` (drop selected or hosted on a deleted wall), and `dimensions` (drop selected); reassign `state.floors`. Register `DELETE_ENTITIES` in `registerTransformCommands`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

---

## Section C: the clipboard core (`core`)

### Task C1: buildClipboardSnapshot

**Files:** create `core/clipboard/clipboard.ts`, `core/clipboard/clipboard.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED** `/test-first`: `buildClipboardSnapshot(floor, [wallId, dimId])` returns the selected wall, every opening whose `hostWallId` is that wall, and the selected dimension; an opening whose host wall is not selected is omitted; selecting only an opening (without its wall) yields a snapshot with no openings. Signatures: `ClipboardSnapshot`, `buildClipboardSnapshot`.
- [ ] **GREEN** `/implement`: collect the selected-wall id set; `walls` are the selected walls; `openings` are floor openings whose `hostWallId` is in that set; `dimensions` are the selected dimensions.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export `ClipboardSnapshot`, `buildClipboardSnapshot` from `core/index.ts`.

### Task C2: serializeClipboard and deserializeClipboard

**Files:** modify `core/clipboard/clipboard.ts`, `core/clipboard/clipboard.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED** `/test-first`: `deserializeClipboard(serializeClipboard(snapshot))` deep-equals `snapshot`; `deserializeClipboard('not json')` is `undefined`; `deserializeClipboard('{"kind":"other"}')` is `undefined`; a payload with a future `version` is `undefined`. Signatures: `serializeClipboard`, `deserializeClipboard`.
- [ ] **GREEN** `/implement`: `serializeClipboard` JSON-stringifies `{ kind: 'vernacular/clipboard', version: 1, snapshot }`; `deserializeClipboard` parses inside a try, returns `undefined` unless `kind` matches and `version` equals the supported constant, else returns the `snapshot`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export both from `core/index.ts`.

### Task C3: instantiateClipboard

**Files:** modify `core/clipboard/clipboard.ts`, `core/clipboard/clipboard.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED** `/test-first` (inject a deterministic `mintId` returning `id-1`, `id-2`, ...): `instantiateClipboard(snapshot, { x: 100, y: 0 }, mintId)` returns walls with fresh ids and endpoints offset by the delta, openings with fresh ids whose `hostWallId` is the new id of their original host wall, dimensions with fresh ids and endpoints offset, and `ids` listing every new id; an opening whose host wall is absent from the snapshot is dropped. Signatures: `InstantiatedEntities`, `instantiateClipboard`.
- [ ] **GREEN** `/implement`: mint a new id per wall and record an old-to-new map; offset each wall's endpoints with `translatePoint`; remap openings onto their new host (drop the unmapped), minting a fresh opening id; mint a fresh dimension id and offset its endpoints; collect all new ids. `mintId` defaults to `globalThis.crypto.randomUUID`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export `InstantiatedEntities`, `instantiateClipboard` from `core/index.ts`.

### Task C4: pasteEntities command

**Files:** modify `core/commands/handlers/transform-commands.ts`, `core/commands/handlers/transform-commands.test.ts`.

- [ ] **RED** `/test-first`: `pasteEntities(floorId, instantiated)` appends `instantiated.walls`, `.openings`, and `.dimensions` to the floor and leaves other floors reference-equal; undo removes exactly the appended entities. Signatures: `PASTE_ENTITIES`, `PasteEntitiesParams`, `pasteEntities`.
- [ ] **GREEN** `/implement`: the creator stores the concrete entities in params (ids fixed once, mirroring `addWall`); the handler concatenates them onto the floor's `walls`, `openings`, and `dimensions` via `mapTargetFloor`. Register `PASTE_ENTITIES` in `registerTransformCommands`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

---

## Section D: clipboard backings (`bridge`)

### Task D1: the in-app clipboard store

**Files:** create `bridge/clipboard/clipboard-store.ts`, `bridge/clipboard/clipboard-store.test.ts`; export from `bridge/index.ts` (infra).

- [ ] **RED** `/test-first` (mirror `selection-store.test.ts`): a fresh `createClipboardStore().read()` is `undefined`; after `write(snapshot)`, `read()` returns that snapshot. Signatures: `ClipboardStore`, `createClipboardStore`.
- [ ] **GREEN** `/implement`: a closure over a single nullable snapshot with `read`/`write`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export from `bridge/index.ts`.

### Task D2: the system-clipboard adapter

**Files:** create `bridge/clipboard/system-clipboard.ts`, `bridge/clipboard/system-clipboard.test.ts`; export from `bridge/index.ts` (infra).

- [ ] **RED** `/test-first` (stub `navigator.clipboard` with an in-memory `readText`/`writeText`): `writeSystemClipboard(snapshot)` then `readSystemClipboard()` deep-equals `snapshot`; with `navigator.clipboard` absent, `writeSystemClipboard` resolves and `readSystemClipboard` is `undefined`; a clipboard holding a foreign string yields `undefined`. Signatures: `writeSystemClipboard`, `readSystemClipboard`.
- [ ] **GREEN** `/implement`: both guard on `globalThis.navigator?.clipboard`; write calls `writeText(serializeClipboard(snapshot))` inside a try (swallow rejection); read calls `readText()` inside a try and returns `deserializeClipboard(text)` (or `undefined`).
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export from `bridge/index.ts`.

---

## Section E: editor interaction (`editor`)

### Task E1: the move-drag state machine

**Files:** create `editor/plan/move-drag.ts`, `editor/plan/move-drag.test.ts`.

- [ ] **RED** `/test-first`: `beginMoveDrag(origin, segments)` enters `dragging` with the origin and base segments; `moveDragGhost(state, pointer)` returns the base segments each translated by `pointer - origin` while dragging and `[]` when idle; `endMoveDrag(state, pointer, floorId, ids)` returns a `translateEntities(floorId, ids, pointer - origin)` command and an idle state, and returns no command for a zero delta (pointer equal to origin). Signatures: `MoveDragState`, `IDLE_MOVE_DRAG`, `beginMoveDrag`, `moveDragGhost`, `MoveDragResult`, `endMoveDrag`.
- [ ] **GREEN** `/implement`: the state holds `origin` and `segments`; the ghost maps each segment's `start`/`end` through `translatePoint(point, delta)`; `endMoveDrag` computes the delta, returns the command unless the delta is zero, and resets to `IDLE_MOVE_DRAG`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task E2: drawPlan renders the move ghost

**Files:** modify `editor/plan/draw-plan.ts`, `editor/plan/draw-plan.test.ts`.

- [ ] **RED** `/test-first`: with `ghost: readonly PreviewSegment[]`, `drawPlan` strokes each ghost segment (a dashed line through `worldToScreen`) after the entities; a call with no `ghost` paints unchanged. Signature: `DrawPlanOptions.ghost`.
- [ ] **GREEN** `/implement`: thread `ghost` through a small `drawGhost` helper that sets a dashed stroke and draws each segment in the documented paint order. Watch the file-size limit (extract if needed).
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task E3: the selection transform panel

**Files:** create `editor/plan/selection-transform-panel.tsx`, `editor/plan/selection-transform-panel.test.tsx`; render from the shell (infra).

- [ ] **RED** `/test-first` (React Testing Library): given a `floorId`, selected `entityIds`, and a `center`, the panel renders a rotate-left, a rotate-right, and a numeric angle control; clicking rotate-right dispatches `rotateEntities(floorId, entityIds, center, -Math.PI / 2)` and rotate-left the positive quarter turn; entering an angle and submitting dispatches `rotateEntities` with that angle in radians about `center`. Signature: `SelectionTransformPanel` props.
- [ ] **GREEN** `/implement` the component (degrees-to-radians for the numeric entry; the two buttons pass the fixed quarter turns).
- [ ] **BLUE** `/clean-code-review` then `/refactor`; render it from the shell when the selection is non-empty (infra).

---

## Section F: glue and docs (infrastructure)

### Task F1: editor glue (`build:`)

- [ ] Wire the editing surface on the `select` tool: a `useSelectionEditing` hook (mirroring the existing plan hooks) that (a) routes a pointer press on a selected entity's body into `beginMoveDrag` with the selection's world segments, previews `moveDragGhost`, and dispatches the `endMoveDrag` command on release, sitting beneath the slice-6 endpoint-handle drag and slice-7 opening drag and above the slice-5 marquee; (b) on arrow keys dispatches `translateEntities` by a named grid-step delta (shift uses a larger step); (c) on Delete/Backspace dispatches `deleteEntities` and clears the selection; (d) on the copy keystroke calls `buildClipboardSnapshot`, writes the in-app store, and fires `writeSystemClipboard`; on cut, copies then deletes; on paste, reads the system clipboard (falling back to the in-app store), `instantiateClipboard` at the named paste offset, dispatches `pasteEntities`, and selects the new ids; (e) builds the `ghost` segment list and the `SelectionTransformPanel` props (`selectionCenter`) and passes them to `drawPlan` and the shell. Verify typecheck, lint (0), `vitest run`, build. Commit `build:`.

### Task F2: docs (`docs:`)

- [ ] Mark slice 10 done in `ROADMAP.md` with its deferrals (free-angle rotate handle, paste-at-pointer, snap-while-moving), and note the editor is now the complete usable two-dimensional planner; set ADR-0040 status to landed. Run `pnpm knowledge:index`.

---

## Self-review

- **Spec coverage:** point transforms (A), translate/rotate/delete + selectionCenter (B), clipboard snapshot/serialize/instantiate (C1-C3), paste command (C4), in-app and system backings (D), move-drag + ghost render + rotate panel (E), glue + docs (F). Every spec goal maps to a task; every deferral is in the scope boundary.
- **Type consistency:** `translatePoint`/`rotatePoint` feed `transformFloorEntities`, `instantiateClipboard`, and `moveDragGhost`; `ClipboardSnapshot` flows `buildClipboardSnapshot` -> serialize/store -> `instantiateClipboard` -> `InstantiatedEntities` -> `pasteEntities`; `TranslateEntitiesParams` is produced by both `translateEntities` and `endMoveDrag`; `selectionCenter` feeds `rotateEntities` via the panel; `PreviewSegment` is the shared ghost segment type for the move-drag and `drawPlan.ghost`.
- **No placeholders:** every task names its behavior and signature; the translate, rotate, and instantiate numbers are concrete.
