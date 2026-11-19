# app/

The composition root. `App` builds the session ports, opens the project that the start asks for,
and renders the editor around the session of the open project. Opening, switching, saving, and
exporting a project are flows of `session/`; the hooks here call them and show what they return.

Where things happen:

- `create-session-ports.ts` builds the session ports in one place: the workspace store over the
  storage that `resolve-project-store.ts` picks, the project lock port, the folder access, and the
  clock. When the storage does not resolve, "Start a new project" gets the same ports in memory.
- `use-project-boot.ts` chooses what opens at start: the remembered id, or a new id after "Start a
  new project". Its Retry builds the ports again when they did not resolve, and otherwise repeats
  the failed start.
- `use-open-project.ts` is the one owner of the open project. It holds the one open document
  handle, runs the start, and runs one flow at a time through `runFlow`, which resolves `undefined`
  while the start or another flow runs. It closes the handle when its effects are cleaned up.
  `owner-memory.ts` keeps its state between renders, and `pending-closes.ts` makes a later start
  on the same ports wait for that close.
- `use-workspace-state.ts` gathers what the workspace renders from the handle: the save status,
  the recent list, the recovery prompt, and the menu actions. It mounts three small hooks on the
  handle. `useUnsavedChangesGuard` (in `use-before-unload-guard.ts`) arms the browser's leave
  warning while a change is not stored, `useFlushOnHidden` asks for a write when the page hides,
  and `useHandleNotices` shows each notice of the handle once. The content cache of the editor is
  the open project's own, from `assetsOf(handle)` in `asset-providers.tsx`, so a folder project
  reads its assets from its folder first, while the library keeps the shared pool that the ports
  builder returns beside the ports.
- The action adapters `use-project-actions.ts`, `use-open-file-action.ts`, and
  `use-export-actions.ts` back the project menu. New project, Open file, Open folder, and a recent
  project run their flow through the owner; Save and the exports work on the open handle.
  `project-action-helpers.ts` runs a flow through the owner, records the recent entries, and shows
  the result.

`app/` may import every layer. It uses `core/` for the first document, the plan export, and the
render harness scenes; `storage/` for the storage behind the ports, the recent list, the remembered
id, and the capability probe; `session/` for the handle and the flows; `bridge/` for the React
providers and the scene harness view; and `editor/` for the shell, the dialogs, and the
notifications. It imports nothing from `engine/`. A store is named only in
`create-session-ports.ts`: `tests/architecture/app-reaches-stores-through-flows.test.ts` reports
any other production file of `app/` that imports a store, imports all of `storage/` as a namespace,
or reaches the `workspace` member of the ports. See ADR-0175, ADR-0212, and the design
specification, section 2.1.
