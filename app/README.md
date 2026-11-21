# app/

The composition root. `App` builds the session ports, opens the project that the start asks for,
and renders the editor around the session of the open project. Opening, switching, saving, and
exporting a project are flows of `session/`; the hooks here call them and show what they return.

Where things happen:

- `create-session-ports.ts` builds the session ports in one place: the workspace store over the
  storage that `resolve-project-store.ts` picks, the project lock port, the folder access, the
  clock, the project index, and the build version. When the storage does not resolve, "Start a new
  project" gets the same ports in memory.
- `app-settings.tsx` mounts the settings service of `session/` above the notifications and the
  workspace, over the browser's local storage unless a test passes another `SettingsPort`.
- `use-project-boot.ts` puts the start together from the ports, the address bar, and
  `useHistoryNavigation`. When the ports do not resolve, its Retry builds them again, and "Start a
  new project" starts in memory.
- `address.ts` reads and writes the address of a place. `parseAddress` reads the fragment of the
  page address as the start, the page of projects (`#/projects`), or a project
  (`#/project/<id>`), and anything that is not one of these exact forms is the start. `addressFor`
  gives the fragment of a place.
- `resolve-place.ts` brings the application to a place. The start and the address of the open
  project keep it open, another project's address switches to that project, and a project that
  does not open gives the page with a notice.
- `address-bar.ts` is the port of the address bar. Its browser form reads the location of the
  window and writes its history, and its memory form keeps the entries for tests and stories. No
  other file names the browser history.
- `use-history-navigation.ts` follows the address on top of the owner of the open project, with
  its steps in `follow-address.ts`, `navigation-memory.ts`, and `navigation-actions.ts`. The
  address follows the open project, and the open project follows the address after the user moves
  through the history or edits it. A project gets its address once the store holds it and the
  browser keeps it, and a project that a flow opens gets a new history entry.
- `nothing-open-failure-view.tsx` is the page of projects until the list of projects exists. It says
  why a project did not open, or that the list is not available yet, and offers a way out. While
  it shows over an open project, the editor is not mounted, and `App` keeps the guards of unsaved
  work mounted for that project. `App` also remembers the handles whose recovered work it offered,
  so each open handle offers it once. A return from the page does not offer it again. A reload
  offers it again until the next save, because each save removes the recovery snapshots.
- `use-open-project.ts` is the one owner of the open project. It holds the one open document
  handle, runs the start, and runs one flow at a time through `runFlow`, which resolves `undefined`
  while the start or another flow runs. It closes the handle when its effects are cleaned up.
  `owner-memory.ts` keeps its state between renders, and `pending-closes.ts` makes a later start
  on the same ports wait for that close.
- `use-workspace-state.ts` gathers what the workspace renders from the handle: the save status,
  the recent list (the records of the project index used last, apart from the open project), the
  recovery prompt, and the menu actions. It mounts three small hooks on the handle.
  `useUnsavedChangesGuard` (in `use-before-unload-guard.ts`) arms the browser's leave warning
  while a change is not stored, `useFlushOnHidden` asks for a write when the page hides, and
  `useHandleNotices` shows each notice of the handle once. The content cache of the editor is
  the open project's own, from `assetsOf(handle)` in `asset-providers.tsx`, so a folder project
  reads its assets from its folder first, while the library keeps the shared pool that the ports
  builder returns beside the ports.
- The action adapters `use-project-actions.ts`, `use-open-file-action.ts`, and
  `use-export-actions.ts` back the project menu. New project, Open file, Open folder, and a recent
  project run their flow through the owner; Save and the exports work on the open handle.
  `project-action-helpers.ts` runs a flow through the owner and shows the result. The handle
  writes the project index, so no adapter keeps a list.

`app/` may import every layer. It uses `core/` for the first document, the plan export, and the
render harness scenes; `storage/` for the storage behind the ports, a new project id, and the
capability probe; `session/` for the handle, the flows, and the read of the project index;
`bridge/` for the React providers and the scene harness view; and `editor/` for the shell, the
dialogs, and the notifications. It imports nothing from `engine/`. A store is named only in
`create-session-ports.ts`: `tests/architecture/app-reaches-stores-through-flows.test.ts` reports
any other production file of `app/` that imports a store, imports all of `storage/` as a namespace,
or reaches the `workspace` member of the ports. See ADR-0175, ADR-0180, ADR-0212, and the design
specification, section 2.1.
