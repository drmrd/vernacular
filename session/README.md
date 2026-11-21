# session/

Application state and logic that needs no React. The editor session lives here:
`createEditorSession` wraps the core `Dispatcher` and is the only place outside
`core/commands/` that dispatches. The layer also holds the document handle, the flows that open
and switch projects, the discard guard, and autosave. `createSettingsService` (`session/settings/`)
keeps the user settings over a `SettingsPort`, with typed keys, defaults, a check of each stored
value, and change notification. `reconcileIndex` (`session/projects/`) rebuilds the project index
from the project store, and the recent list and the start read the records that it gives. The layer imports no React and no Three.js and uses no DOM global.
Depends on `core/` and `storage/`. The `session/testing` entry gives in-memory store doubles, the
session constructor, and the helpers of the handle and save gate kits to test and story files, and
lint rejects it in production files. See ADR-0175 and ADR-0180.
