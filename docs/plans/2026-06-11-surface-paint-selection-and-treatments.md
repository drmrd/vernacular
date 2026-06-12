# Surface paint selection and treatments - Implementation Plan

> **Execution:** Slice 9 of the editor-experience makeover. Run each cycle through the
> project's role-separated red-green-blue subagents from the main thread (`test-author`
> writes one failing test and cannot see implementation; `implementer` makes it pass and
> cannot see tests; then `clean-code-reviewer` + `refactorer` close BLUE with at least an
> empty marker). Stamp every commit with the real-time date (see the
> local-clock-offset-for-commits memory). LOCAL-ONLY: branch, commit, verify; do not push.

**Goal:** Wire the built-but-unwired paint pickers into the assembled 2D editor by adding a
surface-selection store, a Paint panel scoped to the active floor, 2D paint rendering on the
plan, and a `SurfaceTreatment` discriminated union, then flip the `edit-color` journey to
required.

**Architecture:** Surface selection is a new view-agnostic `bridge` store (`activeSurface:
SurfaceRef | null`) that both views read. The 2D Paint panel produces the selection and binds the
existing `ColorPicker`/`FinishPicker` to it; the plan renderer draws the result. Stored paint
generalizes to a `SurfaceTreatment` union (solid built, with a v8->v9 migration); the 3D pick and
highlight and face subdivision are documented seams.

**Tech stack:** TypeScript, React (`useSyncExternalStore`), Canvas 2D plan renderer, Vitest,
Playwright journeys, the ADR-0029 migration framework.

**Spec:** `docs/specs/2026-06-11-surface-paint-selection-and-treatments.md`. **ADR:** ADR-0056.

---

## File structure

- `core/model/paint.ts` (modify) - replace `PaintAssignment` with the `SurfaceTreatment` union and
  the `solidTreatment` constructor; add optional `region` to the `wall-face` `SurfaceRef`; extend
  `surfaceKey`.
- `core/paint/resolve-surface-paint.ts` (modify) - return `SurfaceTreatment | undefined`.
- `core/commands/handlers/paint-commands.ts` (modify) - `assignSurfaceTreatment` general command;
  `assignSurfacePaint` becomes solid sugar over it.
- `core/migrations/schema/add-surface-treatment.ts` (create) + register in `schema/index.ts`;
  bump `CURRENT_SCHEMA_VERSION` to 9 in `core/model/factories.ts`.
- `core/paint/paintable-surfaces.ts` (create) - pure enumeration of the active floor's paintable
  surfaces with stable labels.
- `bridge/selection/surface-selection-store.ts` (create) + `bridge/react/surface-selection-context.ts`
  - `bridge/react/surface-selection-provider.tsx` (create); export from `bridge/index.ts`.
- `editor/paint/paint-panel.tsx` (create) - the surface list + bound pickers.
- `editor/shell/editor-shell.tsx` (modify) - mount `PaintPanel` into the paint slots; provide the
  surface-selection store; bridge entity selection to surface selection.
- `editor/plan/draw-surface-paint.ts` (create) + wire into `editor/plan/draw-plan.ts` and
  `plan-view.tsx` - the wall-face band, floor fill, and active-surface highlight.
- `e2e/tests/journeys/edit-color.spec.ts` (create); `e2e/journey-coverage.json` (modify, flip);
  `scripts/integration-audit/` (modify) - assert the Paint panel reaches dispatch.

---

## Task 1: The `SurfaceTreatment` union and the solid constructor

**Files:**

- Modify: `core/model/paint.ts`
- Modify: `core/paint/resolve-surface-paint.ts`, `core/model/types.ts` (the `paint?` field type)
- Test: `core/model/paint.test.ts`, `core/paint/resolve-surface-paint.test.ts`

**Contract.** Replace `PaintAssignment` with:

```ts
/** A surface treatment. Solid color is the only built variant; the discriminated `kind`
 *  is the extension seam for future `tiled-image` and `pattern` variants (ADR-0056). */
export type SurfaceTreatment = { kind: 'solid'; color: Color; finishId: string }

export function solidTreatment(color: Color, finishId: string): SurfaceTreatment {
  return { kind: 'solid', color, finishId }
}
```

`Project.paint?` becomes `Record<string, SurfaceTreatment>`. `resolveSurfacePaint` returns
`SurfaceTreatment | undefined`.

- [ ] **Step 1 (RED, test-author):** Failing tests: `solidTreatment(color, 'matte')` yields
      `{ kind: 'solid', color, finishId: 'matte' }`; `resolveSurfacePaint` returns the stored
      `SurfaceTreatment` for a present key and `undefined` for an absent key. Allowed files: the two
      test files above only.
- [ ] **Step 2:** Run `pnpm exec vitest run core/model/paint.test.ts core/paint/resolve-surface-paint.test.ts` - expect FAIL.
- [ ] **Step 3 (GREEN, implementer):** Introduce `SurfaceTreatment` + `solidTreatment`, update
      `Project.paint` type and `resolveSurfacePaint`. Allowed files: `core/model/paint.ts`,
      `core/paint/resolve-surface-paint.ts`, `core/model/types.ts`. Do not touch tests.
- [ ] **Step 4:** Run the same vitest command - expect PASS. Then `pnpm typecheck` to surface every
      `PaintAssignment` consumer that must move to `SurfaceTreatment` (fix only type-level renames).
- [ ] **Step 5 (BLUE):** `/clean-code-review` then `/refactor`; empty marker if no finding. Commit.

---

## Task 2: `assignSurfaceTreatment` command; `assignSurfacePaint` as solid sugar

**Files:**

- Modify: `core/commands/handlers/paint-commands.ts`
- Test: `core/commands/handlers/paint-commands.test.ts`

**Contract.**

```ts
export interface AssignSurfaceTreatmentParams {
  key: string
  treatment: SurfaceTreatment
}
export function assignSurfaceTreatment(
  ref: SurfaceRef,
  treatment: SurfaceTreatment,
): Command<AssignSurfaceTreatmentParams>
// existing signature kept as sugar:
export function assignSurfacePaint(
  ref: SurfaceRef,
  color: Color,
  finishId?: string,
): Command<AssignSurfaceTreatmentParams>
//   => assignSurfaceTreatment(ref, solidTreatment(color, finishId ?? 'matte'))
```

The handler stores `params.treatment` (whole-slice reassign, mirroring the current handler so the
inverse-capture proxy and undo still work).

- [ ] **Step 1 (RED):** Failing tests: `assignSurfaceTreatment(ref, solidTreatment(c,'satin'))`
      applies to store the treatment under `surfaceKey(ref)`; `assignSurfacePaint(ref, c)` stores a
      solid treatment with the default `matte`; undo restores the prior reference (including back to
      absent). Allowed file: `paint-commands.test.ts`.
- [ ] **Step 2:** Run `pnpm exec vitest run core/commands/handlers/paint-commands.test.ts` - FAIL.
- [ ] **Step 3 (GREEN):** Implement the general command + the sugar + the handler. Allowed file:
      `paint-commands.ts`.
- [ ] **Step 4:** Run the vitest command - PASS.
- [ ] **Step 5 (BLUE):** review + refactor + commit.

---

## Task 3: The `add-surface-treatment` migration (v8 -> v9)

**Files:**

- Create: `core/migrations/schema/add-surface-treatment.ts`,
  `schema/9/vernacular.schema.json` (generated, not hand-written)
- Modify: `core/migrations/schema/index.ts` (append to `SCHEMA_MIGRATIONS`),
  `core/model/factories.ts` (`CURRENT_SCHEMA_VERSION = 9`)
- Test: `core/migrations/schema/add-surface-treatment.test.ts`

**Contract.** A structural migration that maps every `project.paint[key]` from
`{ color, finishId }` to `{ kind: 'solid', color, finishId }`, leaves a project without `paint`
unchanged, and advances the version. Follow the shape of `add-palettes-paint-and-site.ts`.

**Schema regeneration (critical).** The VFPF JSON Schema is generated from `core/model/types.ts`
by `pnpm schema:generate`, and `SCHEMA_VERSION` is read from `CURRENT_SCHEMA_VERSION`. Published
schema versions are immutable, so `schema/8/vernacular.schema.json` is left untouched (it is the
frozen v8 artifact) and the bump generates a new `schema/9/vernacular.schema.json` reflecting the
`SurfaceTreatment` shape. The drift guard (`pnpm schema:check`, CI) and
`tests/format/schema-conformance.test.ts` validate only the current version's file. The conformance
fixtures carry no `paint` and `SchemaVersion = number`, so they need no edit.

- [ ] **Step 1 (RED):** Failing tests: a v8 document whose `paint` holds a legacy
      `{ color, finishId }` upgrades to `{ kind: 'solid', color, finishId }`; a v8 document with no
      `paint` upgrades structurally unchanged; `CURRENT_SCHEMA_VERSION === 9`. Allowed file: the
      migration test plus a fixture.
- [ ] **Step 2:** Run `pnpm exec vitest run core/migrations` - FAIL.
- [ ] **Step 3 (GREEN):** Write the migration, register it last in `SCHEMA_MIGRATIONS`, bump the
      version constant to 9. Allowed files: the migration, `schema/index.ts`, `factories.ts`. (This
      is config/glue, not subagent product code; do it on the main thread to keep the implementer
      scoped.)
- [ ] **Step 4:** Run `pnpm schema:generate` to write `schema/9/vernacular.schema.json`; confirm
      `pnpm schema:check` is clean and `schema/8/...` is unchanged in the diff. Then
      `pnpm exec vitest run core/migrations tests/format/schema-conformance.test.ts` - PASS. Confirm
      no other migration test pins the old count.
- [ ] **Step 5 (BLUE):** review + refactor; commit the migration, the version bump, and
      `schema/9/vernacular.schema.json` together.

---

## Task 4: Optional `region` on `wall-face` and `surfaceKey` serialization

**Files:**

- Modify: `core/model/paint.ts`
- Test: `core/model/paint.test.ts`

**Contract.**

```ts
export type SurfaceRef =
  | { kind: 'wall-face'; wallId: string; side: 'left' | 'right'; region?: string }
  | { kind: 'floor'; floorId: string }
  | { kind: 'ceiling'; floorId: string }
// surfaceKey for wall-face:
//   region === undefined -> `wall-face:${wallId}:${side}`         (UNCHANGED, back-compatible)
//   region defined       -> `wall-face:${wallId}:${side}:${region}`
```

- [ ] **Step 1 (RED):** Failing tests: `surfaceKey` for a wall-face without `region` equals the
      existing `wall-face:wall_1:left` (back-compat); with `region: 'field'` equals
      `wall-face:wall_1:left:field`. Allowed file: `paint.test.ts`.
- [ ] **Step 2:** Run `pnpm exec vitest run core/model/paint.test.ts` - FAIL.
- [ ] **Step 3 (GREEN):** Add the optional field and extend `surfaceKey`. Allowed file: `paint.ts`.
- [ ] **Step 4:** Run the vitest command - PASS.
- [ ] **Step 5 (BLUE):** review + refactor + commit.

---

## Task 5: The `SurfaceSelectionStore` and React binding

**Files:**

- Create: `bridge/selection/surface-selection-store.ts`,
  `bridge/react/surface-selection-context.ts`, `bridge/react/surface-selection-provider.tsx`
- Modify: `bridge/index.ts` (append exports)
- Test: `bridge/selection/surface-selection-store.test.ts`,
  `bridge/react/surface-selection-context.test.tsx`

**Contract.** Mirror `selection-store.ts` / `selection-context.ts` / `selection-provider.tsx`.

```ts
export interface SurfaceSelectionStore {
  getActiveSurface(): SurfaceRef | null
  isActive(ref: SurfaceRef): boolean // compared by surfaceKey
  select(ref: SurfaceRef): void
  clear(): void
  subscribe(listener: () => void): () => void
}
export function createSurfaceSelectionStore(): SurfaceSelectionStore
// react:
export const SurfaceSelectionContext: React.Context<SurfaceSelectionStore | null>
export function useSurfaceSelection(): SurfaceSelectionStore // throws outside provider
export function useActiveSurface(): SurfaceRef | null // useSyncExternalStore
export function SurfaceSelectionProvider(props): JSX.Element // mirrors SelectionProvider
```

- [ ] **Step 1 (RED):** Failing tests: a fresh store's `getActiveSurface()` is `null`; `select(ref)`
      makes `isActive(ref)` true and notifies subscribers; `isActive` matches by `surfaceKey` (an
      equal-but-not-identical ref is active); `clear()` resets to `null`; `useActiveSurface` throws
      outside a provider and reflects `select` inside one. Allowed files: the two test files.
- [ ] **Step 2:** Run `pnpm exec vitest run bridge/selection/surface-selection-store.test.ts bridge/react/surface-selection-context.test.tsx` - FAIL.
- [ ] **Step 3 (GREEN):** Implement the store, context, provider; append exports to `bridge/index.ts`.
- [ ] **Step 4:** Run the vitest command - PASS.
- [ ] **Step 5 (BLUE):** review + refactor + commit.

---

## Task 6: Enumerate the active floor's paintable surfaces

**Files:**

- Create: `core/paint/paintable-surfaces.ts`
- Modify: `core/index.ts` (export)
- Test: `core/paint/paintable-surfaces.test.ts`

**Contract.** A pure function listing the surfaces for one floor with stable labels. Baseline labels
are neutral (`Side A` / `Side B`); room-aware labelling is best-effort and deferred (spec
"Risks"), so this slice ships neutral labels.

```ts
export interface PaintableSurface {
  ref: SurfaceRef
  label: string
  group: 'wall' | 'floor-ceiling'
}
/** Two wall-face rows per wall on the floor (sides left, right), then the floor and ceiling. */
export function paintableSurfaces(floor: Floor): PaintableSurface[]
```

- [ ] **Step 1 (RED):** Failing tests: a floor with two walls yields four wall-face rows (left/right
      per wall, `group: 'wall'`) followed by a `floor` and a `ceiling` row (`group: 'floor-ceiling'`);
      each `ref` round-trips through `surfaceKey`; labels are stable and non-empty. Allowed file: the
      test.
- [ ] **Step 2:** Run `pnpm exec vitest run core/paint/paintable-surfaces.test.ts` - FAIL.
- [ ] **Step 3 (GREEN):** Implement the enumeration. Allowed files: `paintable-surfaces.ts`, `core/index.ts`.
- [ ] **Step 4:** Run the vitest command - PASS.
- [ ] **Step 5 (BLUE):** review + refactor + commit.

---

## Task 7: The `PaintPanel` surface list with bound pickers

**Files:**

- Create: `editor/paint/paint-panel.tsx`
- Test: `editor/paint/paint-panel.test.tsx`

**Contract.** A presentational component. Props:

```ts
export interface PaintPanelProps {
  surfaces: readonly PaintableSurface[]
  activeSurface: SurfaceRef | null
  treatmentFor: (ref: SurfaceRef) => SurfaceTreatment | undefined // resolveSurfacePaint bound to project
  recent: Color[]
  onSelectSurface: (ref: SurfaceRef) => void
  dispatch: (command: Command) => void
}
```

Renders the surface rows as accessible buttons (`role="option"`, `aria-selected`, the label, and a
swatch reflecting `treatmentFor(ref)`), grouped `wall` then `floor-ceiling`. Below the list, when
`activeSurface` is set, it renders the existing `ColorPicker` (passing `surface={activeSurface}`,
`finishId` from the current treatment or `matte`, `recent`, `dispatch`) and `FinishPicker`. With no
active surface it renders a short empty hint.

- [ ] **Step 1 (RED):** Failing tests (Testing Library): the rows render with their labels and an
      `aria-selected` reflecting `activeSurface`; clicking a row calls `onSelectSurface` with its ref;
      with an active surface the color search input and the finish radios are present; a row whose
      `treatmentFor` returns a solid treatment shows its color (assert via an accessible name or a
      `data-` hook, not a raw style). Allowed file: `paint-panel.test.tsx`.
- [ ] **Step 2:** Run `pnpm exec vitest run editor/paint/paint-panel.test.tsx` - FAIL.
- [ ] **Step 3 (GREEN):** Implement `PaintPanel`. Allowed file: `paint-panel.tsx`.
- [ ] **Step 4:** Run the vitest command - PASS.
- [ ] **Step 5 (BLUE):** review + refactor + commit.

---

## Task 8: Mount the Paint panel in the shell and bridge entity selection

**Files:**

- Modify: `editor/shell/editor-shell.tsx` (provide `SurfaceSelectionProvider`; render `PaintPanel`
  in `PAINT_PICKER_SLOT` / `PAINT_INSPECTOR_SLOT`; wire the active-floor surfaces, active surface,
  `resolveSurfacePaint`, recent colors, and `session.dispatch`)
- Test: `editor/shell/editor-shell.test.tsx`

**Behavior.** The shell mounts the Paint panel into the two reserved slots, wraps the frame in
`SurfaceSelectionProvider`, and when exactly one wall node is selected on the canvas it defaults the
active surface to that wall's first face (entity-selection -> surface-selection bridge). Recent
colors derive from the project paint (or an empty list for now; a recent-colors store is deferred).

- [ ] **Step 1 (RED):** Failing shell test: the assembled shell renders the Paint panel's surface
      list (a known surface label appears) inside the inspector, and selecting a wall scopes/defaults
      the active surface (the picker appears). Allowed file: `editor-shell.test.tsx`.
- [ ] **Step 2:** Run `pnpm exec vitest run editor/shell/editor-shell.test.tsx` - FAIL.
- [ ] **Step 3 (GREEN):** Wire the provider, the slot mounts, and the selection bridge. Allowed file:
      `editor-shell.tsx` (plus any tiny presentational helper it needs, kept in the shell file).
- [ ] **Step 4:** Run the vitest command - PASS, then `pnpm test` over `editor/shell`.
- [ ] **Step 5 (BLUE):** review + refactor + commit.

---

## Task 9: Render paint and the active-surface highlight on the 2D plan

**Files:**

- Create: `editor/plan/draw-surface-paint.ts` (the wall-face band, floor fill, and the
  active-surface highlight, as a pure drawable given the resolved treatments + active surface)
- Modify: `editor/plan/draw-plan.ts` (call the new drawable beneath the wall strokes),
  `editor/plan/plan-view.tsx` (pass resolved paint + active surface into `drawPlan` options)
- Test: `editor/plan/draw-surface-paint.test.ts`

**Behavior.** For each wall on the active floor with a resolved solid treatment, draw a thin band
along the painted side in the treatment color; for a painted floor, fill the floor region at low
opacity; draw the active surface's selection highlight (an accent stroke for a wall face) distinct
from its paint. Test against the existing `PlanDrawingContext` fake used by `draw-plan.test.ts`
(assert the band's `strokeStyle`/`fillStyle` and that a call happens for a painted surface and not
for an unpainted one).

- [ ] **Step 1 (RED):** Failing tests: given a wall with a solid treatment, `drawSurfacePaint`
      strokes a band with that color; given an unpainted wall it strokes no band; the active surface
      adds a highlight stroke. Allowed file: `draw-surface-paint.test.ts`.
- [ ] **Step 2:** Run `pnpm exec vitest run editor/plan/draw-surface-paint.test.ts` - FAIL.
- [ ] **Step 3 (GREEN):** Implement the drawable and call it from `drawPlan`; thread the inputs from
      `plan-view.tsx`. Allowed files: the three above.
- [ ] **Step 4:** Run `pnpm exec vitest run editor/plan` - PASS.
- [ ] **Step 5 (BLUE):** review + refactor + commit.

---

## Task 10: The `edit-color` journey, the integration audit, and the matrix flip

**Files:**

- Create: `e2e/tests/journeys/edit-color.spec.ts`
- Modify: `e2e/tests/journeys/support.ts` (add paint-panel selectors/helpers if needed),
  `e2e/journey-coverage.json` (flip `edit-color` to `required`),
  `scripts/integration-audit/` (assert the Paint panel reaches `dispatch`)

**Journey ("edits a surface color and it applies").** Through the wired app: `gotoEditor`,
`drawWall`, open/locate the Paint panel, select a wall face (an accessible `option`), pick a color
chip, and assert it applied - the selected row's swatch / accessible name reflects the color, and
the plan draws the band (assert via the proxy/overlay accessible name or a stable `data-` hook, in
the established `support.ts` style). Keep it deterministic: `useFitToContent` only fits on the fit
key, so drawn screen positions are stable (edit-endpoint journey precedent).

- [ ] **Step 1:** Write `edit-color.spec.ts` (title exactly `edits a surface color and it applies`
      to match the coverage matrix). Run `pnpm exec playwright test e2e/tests/journeys/edit-color.spec.ts --project=chromium` - expect FAIL first (drives the wiring), then PASS once Tasks 1-9 are in.
- [ ] **Step 2:** Add the integration-audit assertion that the Paint panel is mounted and wired to
      `dispatch` (mirror the existing audit style); run `pnpm integration:audit` - PASS.
- [ ] **Step 3:** Flip `edit-color` to `required` in `e2e/journey-coverage.json`; run
      `pnpm integration:audit` - PASS (now 8 required / 3 pending).
- [ ] **Step 4 (verify chain):** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test &&
pnpm integration:audit && pnpm build`, plus `node scripts/rgb-audit/...` over the branch range and
      the chromium `edit-color` journey. Fix to green.
- [ ] **Step 5:** Commit `test(e2e): require the edit-color surface paint journey` (e2e/docs commits
      are RGB-audit-exempt).

---

## Self-review notes

- **Spec coverage:** surface-selection store (T5), 2D Paint panel scoped to active floor (T6, T7,
  T8), 2D paint rendering on the plan (T9), cross-view highlight via one store + 3D seam (T5 store
  - ADR-0056 seam; 3D not built), `SurfaceTreatment` union + migration (T1-T3), region seam (T4),
    journey + audit flip (T10). The 3D pick/highlight, face-subdivision UI, and `tiled-image`/
    `pattern` editors are documented seams (not tasks), per the spec non-goals. `SiteEditor` wiring is
    a separate tracked surface (spec non-goal), not in this plan.
- **Type consistency:** `SurfaceTreatment`, `solidTreatment`, `assignSurfaceTreatment`,
  `assignSurfacePaint`, `surfaceKey`, `SurfaceSelectionStore`/`useSurfaceSelection`/
  `useActiveSurface`, `PaintableSurface`/`paintableSurfaces`, `PaintPanelProps`, `drawSurfacePaint`
  are used consistently across tasks.
- **Cross-track config:** do not edit shared lint/TS config; if a generated-glue file trips a lint
  rule, restructure within the allowed files (see the ESLint zero-problems and constrain-subagent
  memories). Tell each subagent its exact allowed files and to STOP rather than edit shared config.
