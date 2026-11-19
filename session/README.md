# session/

Application state and logic that needs no React. The editor session lives here:
`createEditorSession` wraps the core `Dispatcher` and is the only place outside
`core/commands/` that dispatches. The layer also holds dirty tracking, the discard guard, the
load helper, and autosave. It imports no React and no Three.js and uses no DOM global.
Depends on `core/` and `storage/`. The `session/testing` entry gives in-memory store doubles
to test and story files, and lint rejects it in production files. See ADR-0175.
