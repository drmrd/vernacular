# bridge/

React Three Fiber glue and the React adapters over `session/`. A React context gives the
editor session to the tree, and `SceneCanvas` mounts the R3F canvas (WebGPU, with an
accessible fallback). This layer imports `@react-three/fiber` and `engine`, never `three`
directly. Depends on `core/`, `session/`, and `engine/`. A file that still imports `storage/`
for asset and library names is on the lint exception list until issue #717. See ADR-0019,
ADR-0175, and the design specification, sections 6 and 7.1.
