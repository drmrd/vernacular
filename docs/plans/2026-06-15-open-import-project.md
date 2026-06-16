# Open and import a project implementation plan

> **For agentic workers:** execute this plan as the project's red-green-blue cycles, dispatching the role-separated subagents (test-author for RED, implementer for GREEN, refactorer for BLUE) from the main thread. Each cycle commits `test:` then `feat:` then `refactor:` (an empty `refactor:` marker is fine when there is nothing to refactor), per the rgb:audit commit-sequence rule. Run `pnpm typecheck && pnpm lint && pnpm test` before declaring a cycle green; `rgb:audit` runs on `origin/main..HEAD`.

**Goal:** Give the editor a discoverable way to open an existing project: a `.building` archive or a bare `vernacular.json`, through an "Open file" menu item and a viewport drop target, loaded as the active project and persisted.

**Architecture:** A pure storage-layer router turns a file name and bytes into a migrated `Project`, reusing the existing bundle store and the document parse-and-migrate path. An app action reads a chosen or dropped file through the router, makes the result active, persists it to the default store, and records a recent entry, surfacing failures through an inline alert. The project menu and a viewport drop target are the two entry points.

**Tech stack:** TypeScript, the storage `ZipBundleProjectStore` and folder JSON parser, `migrateProject` from core, React + Vitest + React Testing Library for the UI.

---

## File structure

- Create: `storage/import/import-project-file.ts` — `importProjectFile(name, bytes, id)` and `UnsupportedProjectFileError`.
- Create: `storage/import/import-project-file.test.ts`.
- Modify: `storage/index.ts` — export `importProjectFile` and `UnsupportedProjectFileError`.
- Modify: `app/use-project-actions.ts` — add `useOpenFileAction`; extend `ProjectActions` with `onOpenFile`, `onImportDroppedFile`, `importStatus`, `dismissImportStatus`.
- Create: `editor/shell/import-alert.tsx` + `.css` — the failure banner (`role="alert"`).
- Create: `editor/shell/import-drop-target.tsx` + `.css` — drop overlay that routes a dropped file.
- Modify: `editor/shell/project-menu.tsx` — add an `Open file` item.
- Modify: `editor/shell/project-controls.tsx` — add `onOpenFile`, `onImportDroppedFile`, `importStatus`, `onDismissImportStatus` to `ProjectControlsProps`.
- Modify: `editor/shell/editor-shell.tsx` — wrap the viewport in the drop target, render the alert, pass the new menu prop.
- Modify: `app/app.tsx` — thread the new action fields into `EditorShell`.

---

## Task 1: Router opens a `.building` archive

**Files:** Create `storage/import/import-project-file.ts`; Test `storage/import/import-project-file.test.ts`.

- [ ] **RED** — test: bytes produced by exporting a project bundle, fed back through `importProjectFile('x.building', bytes, 'p1')`, reconstruct that project.

```ts
const store = new ZipBundleProjectStore('p1')
await store.save('p1', sampleProject)
const bytes = await store.exportBundle()
const loaded = await importProjectFile('x.building', bytes, 'p1')
expect(loaded.meta.name).toBe(sampleProject.meta.name)
```

- [ ] **GREEN** — implement `importProjectFile(name, bytes, id)`: lowercase the name; if it ends with `.building`, `return (await ZipBundleProjectStore.fromBundle(id, bytes)).load(id)`.
- [ ] **BLUE** — marker.

## Task 2: Router opens a bare `vernacular.json` (and any `.json`)

**Files:** Modify `storage/import/import-project-file.ts`; Test same.

- [ ] **RED** — test: `serializeProjectJson(sampleProject)` bytes through `importProjectFile('vernacular.json', bytes, 'p1')` returns the migrated project; the same holds for a name of `anything.json`.

```ts
const bytes = serializeProjectJson(sampleProject)
expect((await importProjectFile('vernacular.json', bytes, 'p1')).meta.name).toBe(
  sampleProject.meta.name,
)
expect((await importProjectFile('plan.json', bytes, 'p1')).meta.name).toBe(sampleProject.meta.name)
```

- [ ] **GREEN** — add a branch: if the name ends with `.json`, `return migrateProject(parseProjectJson(bytes))` (import `parseProjectJson` from `../folder/project-json`, `migrateProject` from `../../core`).
- [ ] **BLUE** — extract the extension match into a small local `extensionOf(name)` if the two branches read cleanly; otherwise marker.

## Task 3: Router rejects unsupported and unparseable input

**Files:** Modify `storage/import/import-project-file.ts`; Test same.

- [ ] **RED** — test: an unknown extension rejects with `UnsupportedProjectFileError` naming the file; invalid JSON bytes under a `.json` name reject.

```ts
await expect(importProjectFile('notes.txt', new Uint8Array(), 'p1')).rejects.toBeInstanceOf(
  UnsupportedProjectFileError,
)
await expect(
  importProjectFile('broken.json', new TextEncoder().encode('{not json'), 'p1'),
).rejects.toThrow()
```

- [ ] **GREEN** — add and export `UnsupportedProjectFileError` (carries `fileName`); throw it when no branch matches. The JSON branch already propagates parse and `MigrationFailedError` throws. Export both symbols from `storage/index.ts`.
- [ ] **BLUE** — marker.

## Task 4: App action imports, activates, persists, and records

**Files:** Modify `app/use-project-actions.ts`; Test `app/use-project-actions.test.ts` (or a focused `open-file-action.test.ts`).

- [ ] **RED** — test: calling the action's `onImportDroppedFile(file)` with a `.building` `File` calls `onSession` with the imported project, calls `store.save` for the project id, and records a recent entry. Use a fake `ProjectStore`, a fake `RecentProjectStore`, and a `File` built from real bundle bytes.

```ts
const onSession = vi.fn()
const store = makeFakeStore()
const recentProjects = makeFakeRecent()
const { result } = renderHook(() => useProjectActions({ ...ctx, store, recentProjects, onSession, capabilities: { opfs: true, ... } }))
await act(() => result.current.onImportDroppedFile!(buildingFile))
expect(onSession).toHaveBeenCalledOnce()
expect(store.save).toHaveBeenCalledWith('current', expect.objectContaining({ meta: expect.any(Object) }))
expect(recentProjects.record).toHaveBeenCalled()
```

- [ ] **GREEN** — add `useOpenFileAction(context)`. Core `importAndActivate(file)`: read `new Uint8Array(await file.arrayBuffer())`, `const project = await importProjectFile(file.name, bytes, projectId)`, `validateLoadedProject(project)`, `onSession(createEditorSession(project))`, `await commitProject({ store, projectId, project })`, then `recordRecent` under `defaultStoreBackend(capabilities)` when non-null (reuse the existing private helpers). Return `onImportDroppedFile: importAndActivate` and `onOpenFile: () => openFilePicker(importAndActivate)` (the picker creates a hidden `<input type="file" accept=".building,.json,application/json">`, clicks it, and calls back on change). Spread the result into `useProjectActions`. `onOpenFile` is always provided (a plain file input needs no capability).
- [ ] **BLUE** — keep `useProjectActions` under the function/line caps; if it grows, lift the open-file action into `app/use-open-file-action.ts` (the refactorer may move implementation between files, not tests).

## Task 5: Failures surface an import status

**Files:** Modify `app/use-project-actions.ts`; Test same suite.

- [ ] **RED** — test: importing a file the router rejects sets `importStatus` to `{ fileName, reason }`; a later `dismissImportStatus()` clears it; a successful import leaves it `null`.

```ts
await act(() => result.current.onImportDroppedFile!(textFile))
expect(result.current.importStatus).toEqual({ fileName: 'notes.txt', reason: expect.any(String) })
act(() => result.current.dismissImportStatus())
expect(result.current.importStatus).toBeNull()
```

- [ ] **GREEN** — hold `const [importStatus, setImportStatus] = useState<ImportStatus | null>(null)` in the action; wrap `importAndActivate` in try/catch, `setImportStatus({ fileName: file.name, reason: errorMessage(error) })` on failure and `setImportStatus(null)` on success. Export `ImportStatus` (`{ fileName: string; reason: string }`). Return `importStatus` and `dismissImportStatus`.
- [ ] **BLUE** — marker; keep `errorMessage` a tiny local helper (`error instanceof Error ? error.message : String(error)`).

## Task 6: Project menu shows "Open file"

**Files:** Modify `editor/shell/project-menu.tsx`; Test `editor/shell/project-menu.test.tsx`.

- [ ] **RED** — test: `ProjectMenu` given `onOpenFile` shows an `Open file` menuitem (after opening the menu) and clicking it calls `onOpenFile`.

```tsx
render(<ProjectMenu onNewProject={vi.fn()} onOpenFile={onOpenFile} />)
await user.click(screen.getByRole('button', { name: /project menu/i }))
await user.click(screen.getByRole('menuitem', { name: /open file/i }))
expect(onOpenFile).toHaveBeenCalledOnce()
```

- [ ] **GREEN** — add `onOpenFile?: () => void` to `ProjectMenuProps`; in `projectMenuItems`, push `{ label: 'Open file', onSelect: onOpenFile }` (after New project, before Open folder) when wired.
- [ ] **BLUE** — marker.

## Task 7: Drop target routes a dropped file and shows an overlay

**Files:** Create `editor/shell/import-drop-target.tsx` + `.css`; Test `editor/shell/import-drop-target.test.tsx`.

- [ ] **RED** — test: dragging files over the target shows a `Drop to open project` overlay; dropping calls `onImportDroppedFile` with the first file; drag-leave hides the overlay.

```tsx
render(
  <ImportDropTarget onImportDroppedFile={onImport}>
    <div>canvas</div>
  </ImportDropTarget>,
)
fireEvent.dragEnter(screen.getByTestId('import-drop-target'), {
  dataTransfer: { types: ['Files'] },
})
expect(screen.getByText(/drop to open project/i)).toBeInTheDocument()
fireEvent.drop(screen.getByTestId('import-drop-target'), {
  dataTransfer: { files: [buildingFile] },
})
expect(onImport).toHaveBeenCalledWith(buildingFile)
```

- [ ] **GREEN** — `ImportDropTarget({ onImportDroppedFile, children })`: a wrapper div that `preventDefault`s `dragOver`, tracks a `dragging` flag on `dragEnter`/`dragLeave` (only when `dataTransfer.types` includes `Files`), renders the children plus an overlay while `dragging`, and on `drop` reads `dataTransfer.files[0]`, calls `onImportDroppedFile(file)`, and clears `dragging`. No-op drop with no file.
- [ ] **BLUE** — marker; keep the overlay inert to the children's pointer flow (it shows only while dragging).

## Task 8: Import alert renders the failure

**Files:** Create `editor/shell/import-alert.tsx` + `.css`; Test `editor/shell/import-alert.test.tsx`.

- [ ] **RED** — test: `ImportAlert` with `status={{ fileName: 'x.building', reason: 'corrupt' }}` renders a `role="alert"` naming the file and the reason; a `Dismiss` button calls `onDismiss`; `status={null}` renders nothing.

```tsx
const { rerender } = render(
  <ImportAlert status={{ fileName: 'x.building', reason: 'corrupt' }} onDismiss={onDismiss} />,
)
expect(screen.getByRole('alert')).toHaveTextContent(/x\.building/)
expect(screen.getByRole('alert')).toHaveTextContent(/corrupt/)
await user.click(screen.getByRole('button', { name: /dismiss/i }))
expect(onDismiss).toHaveBeenCalledOnce()
rerender(<ImportAlert status={null} onDismiss={onDismiss} />)
expect(screen.queryByRole('alert')).not.toBeInTheDocument()
```

- [ ] **GREEN** — `ImportAlert({ status, onDismiss })`: returns `null` when `status` is null; otherwise a `role="alert"` element reading `Couldn't open {fileName}: {reason}` with a `Dismiss` button.
- [ ] **BLUE** — marker.

## Task 9: Wire the entry points into the shell and app

**Files:** Modify `editor/shell/project-controls.tsx`, `editor/shell/editor-shell.tsx`, `app/app.tsx`; Test `editor/shell/editor-shell.test.tsx`.

- [ ] **RED** — test: rendering `EditorShell` with `onOpenFile`, `onImportDroppedFile`, and an `importStatus` shows the `Open file` menu item and the import alert, and the viewport is wrapped by the drop target (assert the drop target test id is present).

- [ ] **GREEN** — add `onOpenFile?`, `onImportDroppedFile?`, `importStatus?`, `onDismissImportStatus?` to `ProjectControlsProps`. In `ShellHeader`, pass `onOpenFile` to `ProjectMenu`. In `EditorShell`, render `<ImportAlert status={importStatus ?? null} onDismiss={onDismissImportStatus} />` next to the recovery prompt, and wrap `ViewportArea` in `<ImportDropTarget onImportDroppedFile={onImportDroppedFile}>`. In `app.tsx`, the `actions` object already flows into `EditorShell`; ensure `onOpenFile`, `onImportDroppedFile`, `importStatus`, and `dismissImportStatus` are included (rename `dismissImportStatus` to the `onDismissImportStatus` prop at the call site).
- [ ] **BLUE** — confirm the drop target does not intercept canvas pointer events except while dragging; marker if clean.

---

## Self-review notes

- **Spec coverage:** router for both forms with clear errors (Tasks 1-3); make-active + persist + record (Task 4); validation gate runs in Task 4 via `validateLoadedProject`; failure surfacing (Tasks 5, 8); menu entry (Task 6); drag-and-drop with overlay (Task 7); wiring (Task 9). Bare-JSON underlays degrade because no asset bytes are imported and the resolve-on-open path already skips an undecoded underlay; no code is needed for that, and it is asserted indirectly by Task 2 loading a document with an underlay and not throwing.
- **Type consistency:** `importProjectFile(name: string, bytes: Uint8Array, id: string): Promise<Project>` is the single signature used by the action; `ImportStatus = { fileName: string; reason: string }` is shared by the action, `ImportAlert`, and the shell prop; the drop target and the action agree on `onImportDroppedFile: (file: File) => void`.
- **Watch:** `useProjectActions` and `EditorShell` are near the function/line caps; split into `use-open-file-action.ts` or a sub-component if a cycle pushes them over. The hidden file input in `onOpenFile` is DOM glue; tests drive `onImportDroppedFile` directly so the picker is not in the coverage-critical path.
