# editor/

The React UI: shell, tools, panels, and gizmos. `EditorShell` lays out the toolbar, tool
panel, viewport, and inspector as accessible landmarks and hosts the 3D viewport via
`bridge`'s `SceneCanvas`. Depends on `core/`, `storage/`, `engine/`, and `bridge/`. See the
design specification, sections 6.5 and 6.13.
