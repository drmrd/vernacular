# bridge/

React Three Fiber glue and the command dispatch boundary. `createEditorSession` wraps the
core `Dispatcher` and is the only place outside `core/commands/` that dispatches. A React
context exposes the session to the tree, and `SceneCanvas` mounts the R3F canvas (WebGPU,
with an accessible fallback). This layer imports `@react-three/fiber` and `engine`, never
`three` directly. Depends on `core/`, `storage/`, and `engine/`. See ADR-0019 and the design
specification, sections 6 and 7.1.
