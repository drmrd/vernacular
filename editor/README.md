# editor/

The React UI: shell, tools, panels, and gizmos. `EditorShell` lays out the toolbar, tool
panel, viewport, and inspector as accessible landmarks and hosts the 3D viewport via
`bridge`'s `SceneCanvas`. Depends on `core/`, `session/`, and `bridge/`. A file that still
imports `storage/` for asset and library names is on the lint exception list until issue
#717. See the design specification, sections 6.5 and 6.13.
