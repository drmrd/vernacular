# DOM Overlay and Accessibility Implementation Plan

> **For agentic workers:** Executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`). Each behavior runs RED (`/test-first` -> `test-author`, commit `test:`), GREEN (`/implement` -> `implementer`, commit `feat:`), then BLUE (`/clean-code-review` then `/refactor`, commit `refactor:` or an empty marker). Tasks marked `(infrastructure)` are controller-authored glue (React composition, CSS, plan-view/shell wiring, e2e, docs) committed as `build:`/`docs:`/`test(e2e):` or with an `Infrastructure:` trailer so the cycle audit skips them. This plan names each behavior and its public signature; it ships no literal test bodies. Local-only: do NOT push/PR/merge (the user batches that).

**Goal:** Add a React DOM overlay over the unchanged plan Canvas that makes every selectable entity reachable and labeled by keyboard and assistive technology, and render all measurement text (ruler, dimension chips, labels) in the project's chosen units with a metric/imperial toggle.

**Architecture:** The Canvas stays the geometric renderer (ADR-0021). A `PlanOverlay` layer is a sibling of the `<canvas>` in a positioned plan-stage wrapper, sharing the viewport `PlanView` already owns. Overlay children are positioned in screen space via the existing `worldToScreen` (no container transform). Pure helpers compute per-entity world anchors, unit-aware ARIA labels, dimension chips, the roving-`tabindex` focus index, and live-region text; the proxies are `pointer-events: none` and keyboard/AT-only, so pointer selection stays on the Canvas hit-test. An undoable `project/set-units` command flips the persisted `meta.units` that every formatter already reads. See ADR-0043 and `docs/specs/2026-06-09-dom-overlay-and-accessibility.md`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React + React Testing Library, Vitest, Playwright + `@axe-core/playwright`. No new dependencies. Base: `main` (schema v4). The only `core/` change is the additive `set-units` command (no schema change).

---

## Scope boundary (this is slice 14 of 14, the last Phase-1 finishing slice)

**In scope:** the `project/set-units` command and undoable toggle; unit-aware `rulerTicks`; the pure overlay helpers (`entityAnchor`, `ariaLabel`, `overlayEntities`, `dimensionChips`, `nextFocusIndex`, `selectionAnnouncement`, `snapAnnouncement`); the `EntityProxy` and `UnitToggle` components; the `PlanOverlay` layer with focus management, a live region, dimension chips, and a hover tooltip; the plan-stage wrapper and shell toolbar wiring; the CSS; and the e2e accessibility and keyboard-reachability checks.

**Out of scope (ADR-0043, ADR-0041, the slice spec section 2):** subsuming the Canvas geometry (rings, snap indicator, dimension lines, room labels stay Canvas-drawn); label-collision avoidance (chips only hide below a legibility threshold); snap-settings UI, default ceiling height, default wall thickness; animated/inertial camera; DOM gizmo variants beyond the accessibility proxies; unit form/precision overrides and per-entity unit display beyond the system toggle.

**Acceptance:** `setUnits` flips `meta.units` and undo restores it; `rulerTicks` labels read in the active units (for example `1 m` or `3' 4"`); `overlayEntities` yields one labeled, anchored, selection-aware entry per wall, room, opening, and dimension; `nextFocusIndex` walks and clamps the roving index; `selectionAnnouncement`/`snapAnnouncement` produce the spoken text; `EntityProxy` exposes `role`/`aria-label`/`aria-selected`/`tabindex` and selects on Enter or Space through a fake selection store; `UnitToggle` reflects `meta.units` and dispatches `setUnits`; axe reports zero violations with the overlay present; a keyboard-only user can focus an entity and select it; the wall-drawing e2e and the visual-regression baseline stay green. Full chain green; `eslint .` zero problems; `rgb:audit` clean.

---

## Public contract

```ts
// core/commands/handlers/project-commands.ts (additive)
export const SET_UNITS = 'project/set-units'
export interface SetUnitsParams {
  units: UnitSystem
}
export function setUnits(units: UnitSystem): Command<SetUnitsParams>
// registerProjectCommands also registers SET_UNITS -> setUnitsHandler

// editor/plan/ruler.ts (signature change)
export function rulerTicks(
  viewport: Viewport,
  lengthPx: number,
  orientation: 'horizontal' | 'vertical',
  preferences: UnitPreferences,
): RulerTick[]

// editor/plan/overlay-anchor.ts
export type SelectableSceneNode =
  | WallSceneNode
  | RoomSceneNode
  | OpeningSceneNode
  | DimensionSceneNode
/** The world-space point the overlay proxy and tooltip anchor to. */
export function entityAnchor(node: SelectableSceneNode): Point

// editor/plan/overlay-label.ts
/** A unit-aware ARIA label, for example `Wall, 3.2 m` or `Room Kitchen, 12 m²`. */
export function ariaLabel(node: SelectableSceneNode, preferences: UnitPreferences): string

// editor/plan/overlay-entities.ts
export interface OverlayEntity {
  id: string // namespaced scene-node id (the selection id)
  kind: SelectableSceneNode['kind']
  label: string
  anchor: Point
  selected: boolean
}
export function overlayEntities(
  graph: SceneGraph,
  selectedIds: ReadonlySet<string>,
  preferences: UnitPreferences,
): OverlayEntity[]

// editor/plan/dimension-chip.ts
export interface DimensionChip {
  id: string
  screen: ScreenPoint
  label: string
}
/** Screen-positioned chips for dimensions visible at the current zoom (below-threshold ones dropped). */
export function dimensionChips(
  dimensions: readonly DimensionSceneNode[],
  viewport: Viewport,
  preferences: UnitPreferences,
): DimensionChip[]

// editor/plan/overlay-keyboard.ts
/** The next roving-tabindex focus index for an arrow/Home/End key; clamps at the ends. */
export function nextFocusIndex(current: number, key: string, count: number): number

// editor/plan/overlay-announce.ts
export function selectionAnnouncement(selected: readonly OverlayEntity[]): string
export function snapAnnouncement(snap: SnapResult | null): string

// editor/plan/entity-proxy.tsx
export interface EntityProxyProps {
  entity: OverlayEntity
  screen: ScreenPoint
  tabIndex: 0 | -1
  onSelect: (id: string, additive: boolean) => void
}
export function EntityProxy(props: EntityProxyProps): ReactElement

// editor/shell/unit-toggle.tsx
export interface UnitToggleProps {
  units: UnitSystem
  onChange: (units: UnitSystem) => void
}
export function UnitToggle(props: UnitToggleProps): ReactElement
```

---

## Section A: the unit-display command (`core`)

### Task A1: project/set-units

**Files:** modify `core/commands/handlers/project-commands.ts` and its test `core/commands/handlers/project-commands.test.ts`.

- [ ] **RED** `/test-first`: `setUnits('imperial')` builds a `Command<SetUnitsParams>` with `type === SET_UNITS` and `params.units === 'imperial'`; applying it through the registry sets `meta.units` to `'imperial'` while leaving `meta.name` and the floors untouched; the captured inverse restores the prior `meta.units` (apply imperial over a metric project, then invert, and `meta.units` is `'metric'` again). Signatures: `SET_UNITS`, `SetUnitsParams`, `setUnits`.
- [ ] **GREEN** `/implement`: add `SET_UNITS`, `SetUnitsParams`, the `setUnits(units)` creator (`description: 'Change units'`), and `setUnitsHandler` whose `apply` does `state.meta = { ...state.meta, units: params.units }` (whole-slice reassignment, mirroring `renameProjectHandler` so inverse-capture records it); register `SET_UNITS` in `registerProjectCommands`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

---

## Section B: unit-aware ruler labels (`editor`)

### Task B1: rulerTicks formats in the active units

**Files:** modify `editor/plan/ruler.ts` and its test `editor/plan/ruler.test.ts`.

- [ ] **RED** `/test-first`: `rulerTicks(viewport, lengthPx, orientation, DEFAULT_METRIC_PREFERENCES)` returns ticks whose `label` is the metric-formatted world value (for example a tick at world `1000` reads `1 m` under a meters preference, not `"1000"`); the same ticks under `DEFAULT_IMPERIAL_PREFERENCES` read in feet and inches; tick `worldValue` and `screen` are unchanged from today. Signature: the added `preferences` parameter.
- [ ] **GREEN** `/implement`: thread `preferences` through; replace `label: String(Math.round(sample.worldValue))` with `label: formatLength(sample.worldValue, lengthFormatOptions(preferences))`. Remove the stale "raw millimetre" comment.
- [ ] **BLUE** `/clean-code-review` then `/refactor`. (The `drawRulers` caller is updated in the plan-view glue, Task F1; `rulerTicks` keeps the existing `drawRulerTicks` call site within `ruler.ts` consistent by passing the preferences down.)

---

## Section C: the pure overlay helpers (`editor`)

### Task C1: entityAnchor

**Files:** create `editor/plan/overlay-anchor.ts` and its test.

- [ ] **RED** `/test-first`: `entityAnchor` returns the midpoint of `start`/`end` for a `WallSceneNode`; the `center` for an `OpeningSceneNode`; the midpoint of the offset dimension line (`dimensionGeometry(start, end, offset)` `lineStart`/`lineEnd` midpoint) for a `DimensionSceneNode`; and the polygon centroid for a `RoomSceneNode` (the arithmetic mean of `polygon`, matching `roomLabelContent(...).anchor`). Signatures: `SelectableSceneNode`, `entityAnchor`.
- [ ] **GREEN** `/implement`: switch on `node.kind`; wall/dimension midpoints via averaging the two points (dimension uses `dimensionGeometry`), opening returns `node.center`, room reuses `roomLabelContent(node, { preferences })?.anchor` or the same centroid mean of `node.polygon`. Keep it a pure switch with no React.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task C2: ariaLabel

**Files:** create `editor/plan/overlay-label.ts` and its test.

- [ ] **RED** `/test-first`: `ariaLabel(wallNode, DEFAULT_METRIC_PREFERENCES)` reads `Wall, <length>` with the length formatted via the metric preference (`distance(start, end)` through `formatLength`); a `RoomSceneNode` reads `Room <name>, <area>` (or `Room, <area>` when unnamed) using `formatArea`; an `OpeningSceneNode` reads `<Type>, <width> wide`; a `DimensionSceneNode` reads `Dimension, <length>`; switching to `DEFAULT_IMPERIAL_PREFERENCES` re-formats the measurement. Signature: `ariaLabel`.
- [ ] **GREEN** `/implement`: a pure switch on `node.kind` building each string with `formatLength(..., lengthFormatOptions(preferences))` and `formatArea(node.area, preferences)`; the opening type label is the element-type id title-cased or passed through (keep simple: capitalize the `type` segment).
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task C3: overlayEntities

**Files:** create `editor/plan/overlay-entities.ts` and its test.

- [ ] **RED** `/test-first`: `overlayEntities(graph, selectedIds, preferences)` returns one `OverlayEntity` per node across `graph.walls`, `graph.rooms`, `graph.openings`, `graph.dimensions` in that order; each entry carries the node's namespaced `id`, its `kind`, the `ariaLabel`, the `entityAnchor`, and `selected = selectedIds.has(id)`; an entity whose id is in `selectedIds` is `selected: true`; an empty graph yields `[]`. Signatures: `OverlayEntity`, `overlayEntities`.
- [ ] **GREEN** `/implement`: map each of the four node arrays through a small builder that calls `entityAnchor` and `ariaLabel`, concatenate in wall/room/opening/dimension order.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task C4: dimensionChips

**Files:** create `editor/plan/dimension-chip.ts` and its test.

- [ ] **RED** `/test-first`: `dimensionChips([dimNode], viewport, preferences)` returns one `DimensionChip` whose `screen` is `worldToScreen` of the offset-line midpoint and whose `label` is `formatLength(node.length, lengthFormatOptions(preferences))`; a dimension shorter than the legibility threshold in screen pixels (its projected length below a `MIN_CHIP_LENGTH_PX` constant) is dropped from the result; the `id` is the node id. Signatures: `DimensionChip`, `dimensionChips` (and the `MIN_CHIP_LENGTH_PX` constant).
- [ ] **GREEN** `/implement`: for each node compute the offset-line midpoint via `dimensionGeometry`, project both endpoints with `worldToScreen` to measure the on-screen length, drop nodes below `MIN_CHIP_LENGTH_PX`, and emit `{ id, screen, label }` for the rest.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task C5: nextFocusIndex (roving tabindex)

**Files:** create `editor/plan/overlay-keyboard.ts` and its test.

- [ ] **RED** `/test-first`: with `count = 3`, `nextFocusIndex(0, 'ArrowDown', 3) === 1`, `nextFocusIndex(0, 'ArrowRight', 3) === 1`, `nextFocusIndex(2, 'ArrowDown', 3) === 2` (clamp at the end, no wrap), `nextFocusIndex(0, 'ArrowUp', 3) === 0` (clamp at the start), `nextFocusIndex(1, 'Home', 3) === 0`, `nextFocusIndex(1, 'End', 3) === 2`, and an unrelated key returns `current`; `count === 0` returns `current`. Signature: `nextFocusIndex`.
- [ ] **GREEN** `/implement`: map `ArrowDown`/`ArrowRight` to `+1`, `ArrowUp`/`ArrowLeft` to `-1`, `Home` to `0`, `End` to `count - 1`, else `current`; clamp into `[0, count - 1]`; guard `count === 0`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task C6: selectionAnnouncement and snapAnnouncement

**Files:** create `editor/plan/overlay-announce.ts` and its test.

- [ ] **RED** `/test-first`: `selectionAnnouncement([])` is `'Selection cleared'`; `selectionAnnouncement([oneEntity])` is `` `Selected ${oneEntity.label}` ``; `selectionAnnouncement([a, b])` is `'2 items selected'`. `snapAnnouncement(null)` is `''`; `snapAnnouncement(snap)` names the snap kind (for example `'Snapped to endpoint'` / `'Snapped to grid'`) from the `SnapResult`. Signatures: `selectionAnnouncement`, `snapAnnouncement`.
- [ ] **GREEN** `/implement`: branch on the selected count for the selection text; for snap, map the `SnapResult` kind to a short phrase, returning `''` for `null`. Keep both pure.
- [ ] **BLUE** `/clean-code-review` then `/refactor`. (Confirm the `SnapResult` kind field name against `editor/plan/snap.ts` during GREEN.)

---

## Section D: the overlay components and layer (`editor`)

### Task D1: EntityProxy

**Files:** create `editor/plan/entity-proxy.tsx` and its RTL test `editor/plan/entity-proxy.test.tsx`; create `editor/plan/plan-overlay.css`.

- [ ] **RED** `/test-first` (React Testing Library): `EntityProxy` renders a focusable element with `role`, `aria-label` equal to `entity.label`, `aria-selected` reflecting `entity.selected`, the given `tabIndex`, and an absolute `left`/`top` from `screen`; pressing Enter or Space calls `onSelect(entity.id, additive)` where `additive` is true when the Shift key is held; a pointer click does NOT call `onSelect` (proxies are keyboard/AT-only). Signatures: `EntityProxyProps`, `EntityProxy`.
- [ ] **GREEN** `/implement`: a `<button>` (or `role`-bearing element) styled by a `plan-overlay__proxy` class, `position: absolute` at `screen`, `aria-label`/`aria-selected`/`tabIndex` from props, `onKeyDown` handling Enter/Space (calling `onSelect` with `event.shiftKey`) and ignoring other keys; no `onClick` selection handler. Add `.plan-overlay__proxy` CSS: transparent background, `:focus-visible` outline distinct from the Canvas selection ring.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task D2: UnitToggle

**Files:** create `editor/shell/unit-toggle.tsx` and its RTL test `editor/shell/unit-toggle.test.tsx`.

- [ ] **RED** `/test-first` (RTL): `UnitToggle` renders a `radiogroup` (accessible name like "Units") with two radios, "Metric" and "Imperial"; the one matching `units` is checked; activating the other calls `onChange` with that system; activating the already-checked one does not need to call `onChange`. Signatures: `UnitToggleProps`, `UnitToggle`.
- [ ] **GREEN** `/implement`: a `<fieldset role="radiogroup">` (or `div role="radiogroup"`) with two `<label><input type="radio">` options keyed to `'metric'`/`'imperial'`, `checked` from `units`, `onChange` firing the creator. Style as a compact segmented control in the shell CSS.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task D3: PlanOverlay layer (infrastructure)

**Files:** create `editor/plan/plan-overlay.tsx`; create `editor/plan/use-overlay-keyboard.ts`; extend `editor/plan/plan-overlay.css`.

- [ ] Build `PlanOverlay({ viewport, graph, selectedIds, selection, preferences, snap })` (coverage-excluded glue): compute `overlayEntities(graph, selectedIds, preferences)` and render an `EntityProxy` per entity at `worldToScreen(entity.anchor, viewport)`; render `dimensionChips(graph.dimensions, viewport, preferences)` as `.plan-overlay__chip` pills (semi-opaque background meeting WCAG AA 4.5:1, `font-variant-numeric: tabular-nums`, `prefers-reduced-motion` honored); render a polite `aria-live` region whose text is `selectionAnnouncement(selectedEntities)` and, on gesture commit, `snapAnnouncement(snap)`; render a hover tooltip pill for the focused entity (and for a pointer-hovered entity via the existing hit-test) using the entity label. The container is `pointer-events: none`; only proxies/controls that need events opt in. `use-overlay-keyboard` holds the roving focus index (state) and element refs, moves focus on arrow/Home/End via `nextFocusIndex`, calls `selection` actions on Enter/Space (additive on Shift) and clears on Escape, composed with (not replacing) `use-selection-keyboard`. Verify typecheck, lint (0), `vitest run`, build. Commit `build:`.

### Task D4: plan-stage wrapper and PlanOverlay mount (infrastructure)

**Files:** modify `editor/plan/plan-view.tsx`; extend `editor/plan/plan-overlay.css` (the `.plan-stage` wrapper).

- [ ] Wrap the `<canvas>` and a `<PlanOverlay .../>` sibling in a `position: relative` `.plan-stage` div sized to `PLAN_WIDTH`x`PLAN_HEIGHT`; the overlay is `position: absolute; inset: 0`. Pass the live `viewport`, `graph`, `selectedIds`, the `selection` store, `preferences`, and the resolved `snap` (already in `usePlanLayers`/`buildScene`) into `PlanOverlay`. Pass `preferences` into `drawRulers` via the existing draw options so the Canvas ruler and the overlay agree (the `rulerTicks` signature changed in B1; thread `preferences` through `DrawPlanOptions`/`drawRulers`). Keep the canvas element, its `aria-label`, and the pointer handlers byte-for-byte. Verify typecheck, lint (0), `vitest run`, build, and that the wall-drawing e2e stays green. Commit `build:`.

---

## Section E: shell toolbar wiring (`editor`)

### Task E1: mount the UnitToggle in the toolbar (infrastructure)

**Files:** modify `editor/shell/editor-shell.tsx`; extend `editor/shell/editor-shell.css`.

- [ ] In the `editor-shell__toolbar`, render `<UnitToggle units={session.getProject().meta.units} onChange={(u) => session.dispatch(setUnits(u))} />`. Because `PREFERENCES_BY_UNITS` keys off `meta.units`, the inspectors, room labels, ruler, chips, and proxy labels all re-format from this one dispatch. Style the segmented control. Verify the full chain and build. Commit `build:`.

---

## Section F: end-to-end verification and docs (infrastructure)

### Task F1: accessibility and keyboard-reachability e2e (`test(e2e):`)

**Files:** modify `e2e/tests/accessibility.spec.ts` (and/or add `e2e/tests/overlay-keyboard.spec.ts`).

- [ ] Keep the existing axe "no violations on initial render" check green with the overlay mounted. Add a check that draws or seeds a wall, tabs into the plan overlay, moves focus to an entity proxy (assert `aria-label` is the unit-aware label), and selects it with Enter (assert `aria-selected` becomes true and the inspector reflects the selection). Run `pnpm exec playwright test e2e/tests/accessibility.spec.ts` (and the new spec). Commit `test(e2e):`.

### Task F2: full chain, then docs (`docs:`)

**Files:** modify `ROADMAP.md`; set ADR-0043 status to accepted; regenerate the local knowledge index.

- [ ] Run the full chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, then `pnpm exec playwright test`, and `rgb:audit` (origin/main..HEAD range). Fix any gaps in the offending module.
- [ ] Mark slice 14 done in `ROADMAP.md` (the overlay/accessibility row to `done`; flip the MVP-path 2D-editor row to `done` now that both finishing slices have landed, noting slice 13 is the sibling branch); set ADR-0043 `## Status` to accepted/landed. Run `pnpm knowledge:index`. Commit `docs:`.

---

## Self-review

- **Spec coverage:** unit toggle command (A) and shell control (E1); unit-aware ruler (B); the pure overlay helpers, anchors, labels, chips, keyboard reducer, and announcements (C1 to C6, spec section 8); the proxy and toggle components (D1, D2); the overlay layer with focus management, live region, chips, and tooltip plus the plan-stage mount (D3, D4); axe and keyboard reachability (F1); docs and ADR acceptance (F2). Every spec goal (sections 4 to 8) maps to a task; every deferral sits in the scope boundary.
- **Type consistency:** `SelectableSceneNode` (C1) is consumed by `ariaLabel` (C2) and `overlayEntities` (C3); `OverlayEntity` (C3) flows into `EntityProxy` (D1), `selectionAnnouncement` (C6), and `PlanOverlay` (D3); `DimensionChip`/`dimensionChips` (C4) render in D3; `nextFocusIndex` (C5) drives `use-overlay-keyboard` (D3); `setUnits`/`SET_UNITS` (A1) is dispatched by `UnitToggle`/the shell (D2, E1); the `rulerTicks` `preferences` parameter (B1) is threaded by D4. `worldToScreen`, `formatLength`, `lengthFormatOptions`, `formatArea`, `distance`, `dimensionGeometry`, and `roomLabelContent` are existing exports.
- **No placeholders:** every task names its behavior and public signature with concrete expected values (`1 m`, `3' 4"`, `Room Kitchen, 12 m²`, the `nextFocusIndex` table, the announcement strings); two GREEN-time confirmations are flagged explicitly (the `SnapResult` kind field in C6, the opening type-label source in C2).
