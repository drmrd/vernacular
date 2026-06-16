# Underlay actions menu implementation plan

> **For agentic workers:** execute this plan as the project's red-green-blue cycles, dispatching the role-separated subagents (test-author for RED, implementer for GREEN, refactorer for BLUE) from the main thread. Each cycle commits `test:` then `feat:` then `refactor:` (an empty `refactor:` marker is fine when there is nothing to refactor), per the rgb:audit commit-sequence rule. Run the gate (`pnpm typecheck && pnpm lint && pnpm test`) before declaring a cycle green; `rgb:audit` runs on `origin/main..HEAD`.

**Goal:** Move the underlay controls off the plan canvas into a low-prominence launcher pinned to the bottom of the tool rail, and turn the misnamed "Trace underlay" checkbox into an "Underlay corners" snap source in Snap settings (off by default).

**Architecture:** A new presentational `UnderlayMenu` (launcher button plus a flyout) reuses the existing per-underlay row, following the `ProjectMenu` dropdown a11y pattern. A connected host mounts it in the tool rail and retires the canvas-anchored `CanvasReferenceControl`. The underlay-corner snapping moves from the `traceMode` boolean on the underlay context to the existing `'trace'` `SnapKind`, promoted to a togglable snap kind read by the plan view.

**Tech stack:** React, TypeScript, Vitest + React Testing Library, the editor's snap-preferences store.

---

## File structure

- Create: `editor/plan/underlay-menu.tsx` — presentational launcher + flyout (open state local), reuses `UnderlayRow`.
- Create: `editor/plan/underlay-menu.css` — flyout/launcher styling (design tokens).
- Create: `editor/plan/underlay-menu-panel.tsx` — connected host: reads `session`, `activeFloorId`, `useUnderlay()`, renders `UnderlayMenu`. Replaces the connected role `CanvasReferenceControl` filled.
- Modify: `editor/plan/underlay-panel.tsx` — export `UnderlayRow`; drop the standalone "Load image" button (the menu owns it now). The `UnderlayPanel` wrapper is removed once nothing imports it.
- Modify: `editor/plan/underlay-trace-points.ts` — add `floorUnderlayTracePoints(graph, enabled)` (the gated, all-visible-underlays corner set), keeping `underlayTracePoints` unchanged.
- Modify: `editor/plan/plan-view.tsx` — gate trace points on the snap preference instead of `useUnderlay().traceMode`.
- Modify: `editor/plan/use-underlay.ts` — remove `traceMode` / `setTraceMode` from the context value, provider, and fallback.
- Modify: `editor/plan/snap-preferences.ts` — promote `'trace'` to a togglable kind; default it off.
- Modify: `editor/commands/snap-commands.ts` — add the `'trace'` label "Underlay corners".
- Modify: `editor/shell/editor-shell.tsx` — mount `UnderlayMenuPanel` in `ToolRail`; remove `<CanvasReferenceControl />` from `ViewportArea`.
- Delete: `editor/plan/canvas-reference-control.tsx`, `editor/plan/canvas-reference-control.css`, and their test.

---

## Task 1: UnderlayMenu launcher (closed by default)

**Files:** Create `editor/plan/underlay-menu.tsx`; Test `editor/plan/underlay-menu.test.tsx`.

- [ ] **RED** — test: rendering `UnderlayMenu` with `underlays={[]}` shows a button named `Underlay` with `aria-haspopup="menu"` and `aria-expanded="false"`, and no `Load image` item is in the document (flyout closed).

```tsx
render(
  <UnderlayMenu
    floorId="ground"
    underlays={[]}
    dispatch={vi.fn()}
    onLoadImage={vi.fn()}
    onCalibrate={vi.fn()}
  />,
)
const trigger = screen.getByRole('button', { name: /underlay/i })
expect(trigger).toHaveAttribute('aria-expanded', 'false')
expect(screen.queryByText(/load image/i)).not.toBeInTheDocument()
```

- [ ] **GREEN** — implement the launcher: a `div.underlay-menu` with a trigger button (icon span `aria-hidden` + `Underlay` label), local `open` state initialized `false`, `aria-haspopup="menu"`, `aria-expanded={open}`. Props match the existing `UnderlayPanelProps` shape (`floorId, underlays, dispatch, onLoadImage, onCalibrate`). Render no flyout while closed.
- [ ] **BLUE** — refactorer reviews; marker commit if clean.

## Task 2: Open the flyout, Escape and outside-click close it

**Files:** Modify `editor/plan/underlay-menu.tsx`; Test same file's test.

- [ ] **RED** — test: clicking the trigger sets `aria-expanded="true"` and reveals a `Load image` menu item; pressing `Escape` closes it; a pointer-down outside the menu closes it.

```tsx
await user.click(screen.getByRole('button', { name: /underlay/i }))
expect(screen.getByRole('menuitem', { name: /load image/i })).toBeInTheDocument()
await user.keyboard('{Escape}')
expect(screen.queryByRole('menuitem', { name: /load image/i })).not.toBeInTheDocument()
```

- [ ] **GREEN** — toggle `open` on trigger click; when open, render `<ul role="menu" className="underlay-menu__list">` containing a `Load image` `<button role="menuitem">`. Add an Escape key handler and a document `pointerdown` listener (added only while open) that closes on a target outside the menu root ref, mirroring the dismissal behavior the export/project menus need. Keep the list element and ref discipline like `ProjectMenu`.
- [ ] **BLUE** — extract the open/close logic into a small `useDismissable` helper only if both the Escape and outside-click handlers read cleanly; otherwise marker.

## Task 3: Load image item invokes the loader and closes

**Files:** Modify `editor/plan/underlay-menu.tsx`; Test same.

- [ ] **RED** — test: with the flyout open, clicking `Load image` calls `onLoadImage` once and closes the flyout.

```tsx
const onLoadImage = vi.fn()
render(
  <UnderlayMenu
    floorId="ground"
    underlays={[]}
    dispatch={vi.fn()}
    onLoadImage={onLoadImage}
    onCalibrate={vi.fn()}
  />,
)
await user.click(screen.getByRole('button', { name: /underlay/i }))
await user.click(screen.getByRole('menuitem', { name: /load image/i }))
expect(onLoadImage).toHaveBeenCalledTimes(1)
expect(screen.getByRole('button', { name: /underlay/i })).toHaveAttribute('aria-expanded', 'false')
```

- [ ] **GREEN** — the `Load image` menuitem's `onClick` calls `onLoadImage()` then closes the flyout.
- [ ] **BLUE** — marker unless duplication appears.

## Task 4: Per-underlay rows render in the flyout

**Files:** Modify `editor/plan/underlay-panel.tsx` (export `UnderlayRow`, drop its standalone Load image button); modify `editor/plan/underlay-menu.tsx`; Test `editor/plan/underlay-menu.test.tsx`.

- [ ] **RED** — test: opening the flyout with one underlay shows that underlay's row (an Opacity slider, a Visible checkbox, `Calibrate`, and `Remove`), and `Calibrate` calls `onCalibrate(underlay.id)`.

```tsx
const underlay = { id: 'u1', opacity: 0.5, visible: true } as Underlay
const onCalibrate = vi.fn()
render(
  <UnderlayMenu
    floorId="ground"
    underlays={[underlay]}
    dispatch={vi.fn()}
    onLoadImage={vi.fn()}
    onCalibrate={onCalibrate}
  />,
)
await user.click(screen.getByRole('button', { name: /underlay/i }))
expect(screen.getByRole('slider')).toBeInTheDocument()
await user.click(screen.getByRole('button', { name: /calibrate/i }))
expect(onCalibrate).toHaveBeenCalledWith('u1')
```

- [ ] **GREEN** — export `UnderlayRow` from `underlay-panel.tsx` and remove the standalone `Load image` `<Button>` from `UnderlayPanel`. In the flyout, after the `Load image` item, map `underlays` to `UnderlayRow` with `label={`Underlay ${index + 1}`}`, passing `floorId`, `dispatch`, `onCalibrate` (the existing row already dispatches opacity/visibility/remove).
- [ ] **BLUE** — if `UnderlayPanel` now has no consumers, delete it in this BLUE and adjust `underlay-panel.test.tsx` to test `UnderlayRow` directly (the row behavior, not the removed wrapper). Keep the file under the 300-line cap.

## Task 5: Connected host in the tool rail; retire the canvas control

**Files:** Create `editor/plan/underlay-menu-panel.tsx`; modify `editor/shell/editor-shell.tsx`; delete `editor/plan/canvas-reference-control.tsx` + `.css` + test; Test `editor/plan/underlay-menu-panel.test.tsx` and an assertion in `editor/shell/editor-shell.test.tsx`.

- [ ] **RED** — test (`underlay-menu-panel.test.tsx`): rendered inside the editor providers, `UnderlayMenuPanel` shows the `Underlay` launcher and clicking it then `Load image` calls the underlay context's `loadImage`. Test (`editor-shell.test.tsx`): the plan area no longer renders an always-visible `Load image` button and renders no `Trace underlay` checkbox.

- [ ] **GREEN** — `UnderlayMenuPanel` ports the connected logic from `CanvasReferenceControl` (resolve the active floor from `session.getProject().floors` + `activeFloorId`, read `useUnderlay()`), and renders `<UnderlayMenu .../>` with `onLoadImage={underlay.loadImage}` and `onCalibrate={underlay.startCalibration}`. Mount it in `ToolRail` (after `OverallDimensions`, set apart by the rail divider). Remove `<CanvasReferenceControl />` from `ViewportArea`. Delete the three canvas-reference-control files.
- [ ] **BLUE** — confirm no dangling imports of `CanvasReferenceControl`; marker if clean.

## Task 6: Promote 'trace' to an "Underlay corners" snap kind, default off

**Files:** Modify `editor/plan/snap-preferences.ts`, `editor/commands/snap-commands.ts`; Test `editor/plan/snap-preferences.test.ts`, `editor/plan/snap-panel.test.tsx`.

- [ ] **RED** — tests: `TOGGLABLE_SNAP_KINDS` includes `'trace'`; `DEFAULT_SNAP_PREFERENCES.kinds.trace === false` while the other kinds stay `true`; the snap panel renders a checkbox labeled `Underlay corners`, unchecked by default.

```ts
expect(TOGGLABLE_SNAP_KINDS).toContain('trace')
expect(DEFAULT_SNAP_PREFERENCES.kinds.trace).toBe(false)
expect(DEFAULT_SNAP_PREFERENCES.kinds.endpoint).toBe(true)
```

- [ ] **GREEN** — change `TogglableSnapKind` to include `'trace'` (drop the `Exclude`), append `'trace'` to `TOGGLABLE_SNAP_KINDS`, and build the default kinds as `{ ...everyKind(true), trace: false }`. Add `trace: 'underlay corners'` to `SNAP_KIND_LABELS` (the panel title-cases it to `Underlay corners`). Update the doc comment that called trace "never a toggle".
- [ ] **BLUE** — add the one-line tooltip: give the underlay-corners toggle a `title` ("Snap the wall tool to the four corners of a visible underlay's footprint"). Keep it data-driven if other kinds gain tooltips; otherwise a scoped title on this kind is fine.

## Task 7: Gate the wall-tool trace points on the snap preference

**Files:** Modify `editor/plan/underlay-trace-points.ts`, `editor/plan/plan-view.tsx`; Test `editor/plan/underlay-trace-points.test.ts`.

- [ ] **RED** — test: `floorUnderlayTracePoints(graph, true)` returns the corners of every visible underlay (concatenated), and `floorUnderlayTracePoints(graph, false)` returns `undefined` (so the wall tool's optional `tracePoints` field stays absent when off).

```ts
const graph = { underlays: [visibleUnderlayNode, hiddenUnderlayNode] } as SceneGraph
expect(floorUnderlayTracePoints(graph, true)).toHaveLength(4)
expect(floorUnderlayTracePoints(graph, false)).toBeUndefined()
```

- [ ] **GREEN** — add `floorUnderlayTracePoints(graph, enabled)` to `underlay-trace-points.ts` (the body currently inlined in `plan-view.tsx`'s `floorTracePoints`). In `plan-view.tsx`, replace the `traceMode` plumbing: read `const prefs = useSnapPreferences()`, compute `const traceEnabled = prefs.enabled && isSnapKindEnabled(prefs, 'trace')`, and pass `traceEnabled` where `traceMode` was passed (`usePlanController` -> `usePlanLayers` -> `planInteractionDeps` -> `floorUnderlayTracePoints`). Rename the plumbed param `traceMode` -> `traceEnabled` for honesty.
- [ ] **BLUE** — fold `floorTracePoints` away in favor of the exported helper; marker if the rename is already clean.

## Task 8: Remove traceMode from the underlay context

**Files:** Modify `editor/plan/use-underlay.ts`; Test `editor/plan/use-underlay.test.ts` (or the provider test).

- [ ] **RED** — test: the value from `useUnderlay()` (via the real provider) has no `traceMode` and no `setTraceMode` key.

```ts
const value = renderUnderlayContext()
expect('traceMode' in value).toBe(false)
expect('setTraceMode' in value).toBe(false)
```

- [ ] **GREEN** — remove `traceMode` / `setTraceMode` from `UnderlayContextValue`, the `FALLBACK_VALUE`, and the `UnderlayProvider` (drop the `useState` and the value-memo entries). The plan view no longer reads them (Task 7).
- [ ] **BLUE** — confirm no remaining references to `traceMode` across `editor`; marker if clean.

---

## Self-review notes

- **Spec coverage:** launcher + flyout (Tasks 1-5), Load image relocated and per-underlay rows preserved (Tasks 3-4), canvas control retired and trace checkbox gone (Task 5), "Underlay corners" snap source off by default with tooltip (Task 6), wall-tool snapping driven by the preference (Task 7), trace mode removed from the context (Task 8), footprint-corner geometry unchanged (Task 7 only adds a gated wrapper; `underlayTracePoints` is untouched).
- **Type consistency:** `UnderlayRow` props match the existing row; `floorUnderlayTracePoints(graph, enabled)` returns `readonly Point[] | undefined` to preserve the `exactOptionalPropertyTypes` plumbing; `TogglableSnapKind` widening to include `'trace'` makes `SNAP_KIND_LABELS` (a `Record<TogglableSnapKind, string>`) require the new key, which Task 6 adds in the same cycle.
- **Watch:** keep `underlay-panel.test.tsx` and `underlay-menu.test.tsx` under the 300-line max-lines cap (split if needed, as done elsewhere). Lint forbids magic numbers and nested ternaries in glue.
