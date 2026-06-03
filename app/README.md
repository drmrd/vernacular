# app/

The composition root: top-level providers and state. `App` builds an `EditorSession` over an
empty project and renders the `EditorShell` inside the session provider. Depends on `core/`,
`bridge/`, and `editor/`. See the design specification, section 2.1.
