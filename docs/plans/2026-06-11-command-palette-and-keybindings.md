# Command Registry, Keybindings, Palette, and Undo/Redo/Delete Implementation Plan

> **For agentic workers:** executed with the project's role-separated red-green-blue
> subagents from the main thread (`/test-first` -> `/implement` ->
> `/clean-code-review` -> `/refactor`). Each cycle is one Conventional Commit
> sequence: `test:` -> `feat:` -> `refactor:`.

**Goal:** Add the editor's interaction spine, a single command registry that the
keybinding layer and a command palette both read, and wire undo, redo, delete, and
deselect through it with visible controls and keyboard shortcuts, so those
capabilities become reachable from the assembled editor. Two journey tests flip
`undo-redo` and `delete-selection` to `required`.

**Architecture:** A new `editor/commands/` module holds a plain command model
(`EditorCommand` with id, label, keybindings, an enablement predicate, and a run
function over a `CommandContext`), a platform-aware keybinding parser/matcher, the
concrete command set, a keydown hook, and a minimal accessible command palette. The
domain already owns undo/redo history (`core` `Dispatcher`), surfaced by the bridge
`EditorSession`; this slice exposes `canUndo`/`canRedo` on the session and consumes
the existing `deleteEntities` command and `selectedEntityIds` mapping. No core or
engine change beyond the session interface.

**Tech Stack:** TypeScript, React, Vitest + Testing Library, Playwright (journeys).

---

## Context

- `core` `Dispatcher` already has `undo()`, `redo()`, `canUndo()`, `canRedo()`.
- bridge `EditorSession` (`bridge/session/editor-session.ts`) exposes `dispatch`,
  `undo`, `redo`, `getProject`, `getSceneGraph`, `subscribe`, but not `canUndo`/
  `canRedo`. The undo/redo controls need them.
- Selection is `SelectionStore` (`getSelectedIds()`, `clear()`, ...). The active
  floor id is the raw floor id from `useActiveFloorId()`.
- `editor/plan/selection-entities.ts` exports `selectedEntityIds(ids)` (strips wall/
  opening/dimension node prefixes to raw entity ids). `core` exports
  `deleteEntities(floorId, entityIds)`.
- The shell (`editor/shell/editor-shell.tsx`) renders `ShellHeader` (which already
  calls `useSceneGraph()`, so it re-renders on every dispatch/undo/redo) and wraps
  the frame in providers. This is where the undo/redo buttons, the keybinding hook,
  and the palette mount.
- Journey gate: tests live in `e2e/tests/journeys/`, selectors centralize in
  `support.ts`, and capability titles in `e2e/journey-coverage.json` must match the
  Playwright test titles exactly. Flipping a capability to `required` happens in the
  same change that adds its passing journey.

## File map

- Create `editor/commands/keybinding.ts` (+ test) - parse "Mod+Shift+Z" and match a
  KeyboardEvent, platform-aware (Mod = Cmd on mac, Ctrl elsewhere).
- Create `editor/commands/command.ts` - `CommandContext` and `EditorCommand` types,
  and `resolveCommandForEvent(commands, event, isMac, ctx)`.
- Create `editor/commands/editor-commands.ts` (+ test) - `createEditorCommands()`:
  undo, redo, delete-selection, deselect, open-command-palette.
- Create `editor/commands/use-keybindings.ts` (+ test) - a hook that runs the
  matching enabled command on keydown, ignoring keystrokes typed into form fields.
- Create `editor/commands/command-palette.tsx` (+ test) - an accessible dialog
  listing the enabled commands with a text filter; Enter/click runs, Escape closes.
- Create `editor/commands/command-bar.tsx` (+ test) - the Undo/Redo buttons (and a
  palette opener) for the header.
- Create `editor/commands/index.ts` - module barrel.
- Modify `bridge/session/editor-session.ts` (+ test) - add `canUndo()`/`canRedo()`.
- Modify `editor/shell/editor-shell.tsx` - mount the command context, the keybinding
  hook, the command bar in the header, and the palette.
- Create `e2e/tests/journeys/undo-redo.spec.ts`, `e2e/tests/journeys/delete-selection.spec.ts`;
  extend `e2e/tests/journeys/support.ts`; flip both capabilities in
  `e2e/journey-coverage.json`.

---

## Cycle 1: the keybinding parser and matcher

**Files:** create `editor/commands/keybinding.ts`, test `editor/commands/keybinding.test.ts`.

RED test (exact content for the test-author):

```ts
import { describe, it, expect } from 'vitest'
import { parseKeybinding, eventToKeystroke, keystrokesMatch } from './keybinding'

describe('keybinding', () => {
  it('parses a modifier chord into a normalized keystroke', () => {
    expect(parseKeybinding('Mod+Shift+Z')).toEqual({ key: 'z', mod: true, shift: true })
    expect(parseKeybinding('Delete')).toEqual({ key: 'delete', mod: false, shift: false })
  })

  it('reads Mod as Cmd on mac and Ctrl elsewhere', () => {
    const meta = { key: 'z', metaKey: true, ctrlKey: false, shiftKey: false }
    const ctrl = { key: 'z', metaKey: false, ctrlKey: true, shiftKey: false }
    expect(eventToKeystroke(meta, true)).toEqual({ key: 'z', mod: true, shift: false })
    expect(eventToKeystroke(ctrl, true)).toEqual({ key: 'z', mod: false, shift: false })
    expect(eventToKeystroke(ctrl, false)).toEqual({ key: 'z', mod: true, shift: false })
  })

  it('matches a parsed binding against an event keystroke', () => {
    const binding = parseKeybinding('Mod+Z')
    const event = eventToKeystroke(
      { key: 'Z', metaKey: false, ctrlKey: true, shiftKey: false },
      false,
    )
    expect(keystrokesMatch(binding, event)).toBe(true)
  })
})
```

GREEN (`keybinding.ts`): a `Keystroke` interface `{ key: string; mod: boolean; shift: boolean }`;
`parseKeybinding(binding)` splits on `+`, lowercases, maps `mod`/`shift` tokens, the
remaining token is `key`; `eventToKeystroke(event, isMac)` reads
`key.toLowerCase()`, `mod = isMac ? metaKey : ctrlKey`, `shift = shiftKey`;
`keystrokesMatch(a, b)` compares all three fields. Type the event parameter as
`Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>`.

## Cycle 2: session canUndo/canRedo

**Files:** modify `bridge/session/editor-session.ts`, test `bridge/session/editor-session.test.ts`.

RED: extend the existing session test with a case that dispatches a command, then
asserts `session.canUndo()` is `true` and `session.canRedo()` is `false`, and after
`session.undo()` that `canRedo()` is `true`. (The test-author adds this to the
existing describe; use the existing `addWall`/dispatch pattern already in that test.)

GREEN: add `canUndo(): boolean` and `canRedo(): boolean` to the `EditorSession`
interface and return `dispatcher.canUndo()`/`dispatcher.canRedo()` in
`createEditorSession`.

## Cycle 3: the command model and the command set

**Files:** create `editor/commands/command.ts`, `editor/commands/editor-commands.ts`,
test `editor/commands/editor-commands.test.ts`.

`command.ts` (no test of its own; exercised through the command set):

```ts
import type { SceneGraph } from '../../core'
import type { EditorSession, SelectionStore } from '../../bridge'

export interface CommandContext {
  session: EditorSession
  selection: SelectionStore
  graph: SceneGraph
  activeFloorId: string | null
  openPalette: () => void
}

export interface EditorCommand {
  id: string
  label: string
  keybindings: string[]
  isEnabled: (context: CommandContext) => boolean
  run: (context: CommandContext) => void
}
```

RED test (`editor-commands.test.ts`) - drive the commands against a fake context.
Build a real `createEditorSession(createEmptyProject(...))` and a real
`createSelectionStore()` so behavior is exercised end to end. Assert, by command id:

- `undo` is disabled with empty history and enabled after a dispatch; running it
  reverts the project (wall count returns to 0).
- `redo` is disabled until an undo, then enabled; running it re-applies.
- `delete-selection` is disabled with an empty selection; with a wall selected (its
  `wall:`-prefixed node id in the selection and a valid `activeFloorId`) it is
  enabled and running it removes the wall and clears the selection.
- `deselect` clears the selection.
- `open-command-palette` calls the injected `openPalette`.

GREEN (`editor-commands.ts`): `createEditorCommands(): EditorCommand[]` returning the
five commands. `delete-selection` run computes
`selectedEntityIds(context.selection.getSelectedIds())` (import from
`../plan/selection-entities`), and if `activeFloorId` is non-null and there are ids,
`context.session.dispatch(deleteEntities(activeFloorId, ids))` then
`context.selection.clear()`. Keybindings: undo `['Mod+Z']`; redo
`['Mod+Shift+Z', 'Mod+Y']`; delete-selection `['Delete', 'Backspace']`; deselect
`['Escape']`; open-command-palette `['Mod+K']`.

Also add `resolveCommandForEvent(commands, event, isMac, context)` to `command.ts`:
returns the first command that is enabled and has a keybinding whose
`parseKeybinding` matches `eventToKeystroke(event, isMac)`, else `null`. (Covered by
the hook test in Cycle 4; no extra unit test required, but a small direct test is
welcome.)

## Cycle 4: the keybinding hook

**Files:** create `editor/commands/use-keybindings.ts`, test `editor/commands/use-keybindings.test.tsx`.

RED test: render a probe component using `useKeybindings(commands, context)` with a
fake command whose `run` increments a counter and `keybindings: ['Mod+K']`; fire a
`keydown` with `ctrlKey` and `key: 'k'` on `window` and assert the counter
incremented; fire one whose target is an `<input>` and assert it did NOT (typing is
ignored). Use `@testing-library/react`'s `render` and `fireEvent`/`act`.

GREEN (`use-keybindings.ts`): `useKeybindings(commands, context)` attaches a
`window` `keydown` listener in `useEffect`. Hold the latest `context` and `commands`
in refs so the listener is attached once. On keydown: if the event target is a form
field (`isTypingTarget`: an `HTMLInputElement`/`HTMLTextAreaElement`/`HTMLSelectElement`
or `isContentEditable`), return. Else `const command = resolveCommandForEvent(...)`;
if found, `event.preventDefault()` and `command.run(context)`. Detect mac with
`navigator.platform`/`userAgent` in a small `isMacPlatform()` helper (guarded for
non-browser).

## Cycle 5: the command bar (undo/redo controls) and shell wiring

**Files:** create `editor/commands/command-bar.tsx`, test `editor/commands/command-bar.test.tsx`;
modify `editor/shell/editor-shell.tsx`.

RED test (`command-bar.test.tsx`): render `<CommandBar />` inside the editor
providers (reuse the shell test's provider helper or build a minimal one with a real
session + selection). Assert: an "Undo" button exists and is disabled initially;
after dispatching a wall it becomes enabled; clicking it reduces the wall count; a
"Redo" button and a "Command palette" opener button exist. Keep the assertions
behavioral (button roles + enablement + effect).

GREEN (`command-bar.tsx`): a `CommandBar` that reads the command context via hooks
(`useEditorSession`, `useSelection`, `useActiveFloorId`, `useSceneGraph`,
`useCommandPalette` opener), builds the command list (memoized), and renders Undo,
Redo, and a palette-opener button using the design-system `Button`. Each button's
`disabled` is `!command.isEnabled(context)` and `onClick` is `command.run(context)`.
Subscribe to the scene graph (call `useSceneGraph()`) so enablement re-renders.

Shell wiring (`editor-shell.tsx`): add a `CommandPaletteProvider` (holds open state +
`openPalette`/`closePalette`), build the command context once near the top, mount the
keybinding hook, render `<CommandBar />` in `ShellHeader`, and render the palette
(Cycle 6) inside the frame.

## Cycle 6: the command palette

**Files:** create `editor/commands/command-palette.tsx`, test `editor/commands/command-palette.test.tsx`;
create `editor/commands/command-context.tsx` (the provider holding open state).

RED test: render the palette open with a known command list; assert
`role="dialog"` is present, typing in the search box filters the listed commands by
label (case-insensitive substring), pressing Enter runs the top filtered command,
clicking a command runs it, and pressing Escape calls the close handler. Assert only
the enabled commands are listed.

GREEN (`command-palette.tsx`): a controlled dialog (`role="dialog"`, `aria-modal`,
labelled), a search `input` (auto-focused on open), and a `listbox`/list of the
enabled commands filtered by the query. Enter runs the first filtered command then
closes; click runs then closes; Escape closes. No external fuzzy-search dependency -
a lowercased `includes` filter is enough. `command-context.tsx` provides
`useCommandPalette()` returning `{ isOpen, open, close }` via React context, plus a
`CommandPaletteProvider`.

## Cycle 7: the journeys (flip undo-redo and delete-selection)

**Files:** extend `e2e/tests/journeys/support.ts`; create
`e2e/tests/journeys/undo-redo.spec.ts` and `e2e/tests/journeys/delete-selection.spec.ts`;
flip both capabilities in `e2e/journey-coverage.json`.

Support additions:

```ts
// In selectors:
undoButton: (page: Page) => page.getByRole('button', { name: 'Undo' }),
redoButton: (page: Page) => page.getByRole('button', { name: 'Redo' }),
wallProxy: (page: Page) => page.getByRole('option', { name: /^Wall,/ }),
selectTool: (page: Page) => page.getByRole('button', { name: 'Select' }),
```

`undo-redo.spec.ts` (title must equal the capability title):

```ts
import { test } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './support'

test('undoes and redoes a wall', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)
  await page.keyboard.press('ControlOrMeta+z')
  await expectWallCount(page, 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expectWallCount(page, 1)
})
```

`delete-selection.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './support'

test('deletes the selected entities', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)
  await selectors.selectTool(page).click()
  const proxy = selectors.wallProxy(page)
  await proxy.focus()
  await page.keyboard.press('Enter')
  await expect(proxy).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Delete')
  await expectWallCount(page, 0)
})
```

Then in `journey-coverage.json` set both `undo-redo` and `delete-selection` to
`"status": "required"`.

> Journey reality check during execution: confirm the keybinding hook does not eat
> the wall proxy's own Enter selection (the hook ignores keystrokes while a form
> field is focused, but the proxy is an `option`, not an input - selecting it with
> Enter happens before Delete, and Delete fires with the proxy focused, which is not
> a typing target, so the delete command runs). If selection-via-Enter conflicts,
> select by clicking the proxy instead.

---

## Definition of done

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build` all green.
- `pnpm rgb:audit --range "origin/main..HEAD"` clean.
- `pnpm exec playwright test --project=chromium e2e/tests/journeys` green locally if
  feasible (the build + chromium run); otherwise rely on CI's e2e job.
- `journey-coverage.json` shows `undo-redo` and `delete-selection` as `required`, and
  `pnpm integration:audit` stays clean (now 3 required, 8 pending).
- Keyboard: Mod+Z/Mod+Shift+Z undo/redo, Delete/Backspace delete the selection,
  Escape deselects, Mod+K opens the palette; the palette lists the same commands.
