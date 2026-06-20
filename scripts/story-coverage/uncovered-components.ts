// The story-coverage ratchet allowlist (ADR-0111).
//
// Every component module under app/, editor/, and bridge/ that does not yet
// have a co-located <basename>.stories.tsx is recorded here with the reason it
// is tolerated as uncovered. The live story-coverage guard reads this list and
// fails three ways: a new uncovered module that is not listed here, a listed
// module that has since gained a story (remove it), and a listed file that no
// longer exists (remove it). As story coverage lands, entries leave this list
// in lockstep until only the genuinely-not-isolable scene components remain.
//
// `file` is a repository-relative POSIX path so the data is portable across
// machines and CI; the guard resolves each one to an absolute path at run time.
// `component` is the module's primary exported component name, a human label at
// module granularity. `reason` is a descriptive English sentence (no shorthand
// codes) grouped by the deferred per-area story sub-issues called out in the
// issue #275 plan.

export const UNCOVERED_COMPONENTS: {
  component: string
  file: string
  reason: string
}[] = [
  // --- app/ orchestrators -------------------------------------------------
  {
    component: 'AssetProviders',
    file: 'app/asset-providers.tsx',
    reason:
      'top-level asset provider tree that wires the project, library, and asset-cache contexts together; it is composed from the full editor provider stack rather than rendered in isolation, so it is a permanent allowlist candidate (see ADR-0111).',
  },

  // --- bridge / scene (live R3F Canvas or WebGPU context) -----------------
  {
    component: 'ActiveFloorProvider',
    file: 'bridge/react/active-floor-provider.tsx',
    reason:
      'context provider for the active floor that only has meaning inside the editor session and scene tree; an isolated browser-mode story is not feasible, so it is a permanent allowlist candidate (see ADR-0111).',
  },
  {
    component: 'CameraControlsHint',
    file: 'bridge/react/camera-controls-hint.tsx',
    reason:
      'overlay caption for the scene pane that reads the live scene drag state; it requires the R3F scene context, so an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'EditorSessionProvider',
    file: 'bridge/react/editor-session-provider.tsx',
    reason:
      'root editor-session context provider; it only has meaning wrapping the full editor and scene tree, so an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'FurnitureModelSignals',
    file: 'bridge/react/furniture-model-signals.tsx',
    reason:
      'requires a live R3F Canvas to load and report furniture model signals; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'OrbitCameraControls',
    file: 'bridge/react/orbit-camera-controls.tsx',
    reason:
      'requires a live R3F Canvas and a Three.js camera; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'SceneCanvas',
    file: 'bridge/react/scene-canvas.tsx',
    reason:
      'mounts the R3F Canvas and WebGPU renderer directly; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'SceneHarnessView',
    file: 'bridge/react/scene-harness-view.tsx',
    reason:
      'requires the WebGPU scene harness and a live R3F Canvas; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'SceneLighting',
    file: 'bridge/react/scene-lighting.tsx',
    reason:
      'declares Three.js lights inside the R3F Canvas; it has no DOM output to assert in a browser-mode story and is a permanent allowlist candidate (see ADR-0111).',
  },
  {
    component: 'SceneNavToolbar',
    file: 'bridge/react/scene-nav-toolbar.tsx',
    reason:
      'scene navigation toolbar bound to the live camera and scene context; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'SceneProxyProjector',
    file: 'bridge/react/scene-proxies.tsx',
    reason:
      'projects scene entities into DOM proxies using the live R3F camera; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'SceneProxyOverlay',
    file: 'bridge/react/scene-proxy-overlay.tsx',
    reason:
      'DOM overlay positioned from the live scene projection; it requires the R3F scene context, so an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'SceneSelection',
    file: 'bridge/react/scene-selection.tsx',
    reason:
      'requires a live R3F Canvas and selection raycasting against the scene; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'SelectionProvider',
    file: 'bridge/react/selection-provider.tsx',
    reason:
      'selection context provider that only has meaning inside the editor and scene tree; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'SurfaceSelectionProvider',
    file: 'bridge/react/surface-selection-provider.tsx',
    reason:
      'surface-selection context provider bound to the scene tree; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'WalkCameraControls',
    file: 'bridge/react/walk-camera-controls.tsx',
    reason:
      'requires a live R3F Canvas and a Three.js camera; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'WebGPUSceneView',
    file: 'bridge/react/webgpu-scene-view.tsx',
    reason:
      'requires a live R3F Canvas and a WebGPU renderer; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },

  // --- editor/commands (command palette + bar; multi-context) -------------
  {
    component: 'CommandBar',
    file: 'editor/commands/command-bar.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; it reads several editor-session contexts and needs a provider wrapper.',
  },
  {
    component: 'CommandPaletteProvider',
    file: 'editor/commands/command-context.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; it is the command-palette context provider, covered as a wrapper alongside the palette story.',
  },
  {
    component: 'CommandPalette',
    file: 'editor/commands/command-palette.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; it reads eight editor contexts including the focus trap and needs a provider wrapper.',
  },

  // --- editor/design-system remainder -------------------------------------
  {
    component: 'AppFrame',
    file: 'editor/design-system/app-frame.tsx',
    reason:
      'deferred to the design-system story sub-issue; its layout-slot props warrant a small spike before authoring a representative story.',
  },
  {
    component: 'Field',
    file: 'editor/design-system/field.tsx',
    reason:
      'deferred to the design-system story sub-issue; a label-and-hint association story lands in the design-system slice.',
  },
  {
    component: 'IconButton',
    file: 'editor/design-system/icon-button.tsx',
    reason:
      'deferred to the design-system story sub-issue; a props-only icon-and-label story lands in the design-system slice.',
  },
  {
    component: 'PanelSlot',
    file: 'editor/design-system/panel-slot.tsx',
    reason:
      'deferred to the design-system story sub-issue; a with-children and empty-state story lands in the design-system slice.',
  },
  {
    component: 'SectionLabel',
    file: 'editor/design-system/section-label.tsx',
    reason:
      'deferred to the design-system story sub-issue; a text-rendering story lands in the design-system slice.',
  },
  {
    component: 'Segmented',
    file: 'editor/design-system/segmented.tsx',
    reason:
      'deferred to the design-system story sub-issue; a selection-interaction story lands in the design-system slice.',
  },
  {
    component: 'Stack',
    file: 'editor/design-system/stack.tsx',
    reason:
      'deferred to the design-system story sub-issue; a layout story lands in the design-system slice.',
  },
  {
    component: 'EmptyState',
    file: 'editor/design-system/status.tsx',
    reason:
      'deferred to the design-system story sub-issue; one status story covers both the empty and loading states this module exports.',
  },
  {
    component: 'ThemeProvider',
    file: 'editor/design-system/theme-provider.tsx',
    reason:
      'deferred to the design-system story sub-issue; it is a provider best covered as a render wrapper rather than a standalone component story.',
  },

  // --- editor/library (networked, reuse the MSW pack handlers) ------------
  {
    component: 'LibraryLauncherPanel',
    file: 'editor/library/library-launcher-panel.tsx',
    reason:
      'deferred to the library story sub-issue; it is networked and reuses the MSW pack handlers, and also pulls furniture-placement and active-tool contexts.',
  },
  {
    component: 'LibraryLauncher',
    file: 'editor/library/library-launcher.tsx',
    reason:
      'deferred to the library story sub-issue; it composes the launcher panel and shares its networked, multi-context wrapper.',
  },

  // --- editor/metadata ----------------------------------------------------
  {
    component: 'SiteEditor',
    file: 'editor/metadata/site-editor.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the site metadata editor reads the editor session and needs a provider wrapper.',
  },

  // --- editor/paint (pickers + panel) -------------------------------------
  {
    component: 'ColorPicker',
    file: 'editor/paint/color-picker.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the paint pickers land together in the paint slice.',
  },
  {
    component: 'FinishPicker',
    file: 'editor/paint/finish-picker.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the paint pickers land together in the paint slice.',
  },
  {
    component: 'PaintPanel',
    file: 'editor/paint/paint-panel.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the paint panel reads paint and selection contexts and needs a provider wrapper.',
  },

  // --- editor/plan (inspectors, editors, overlays) ------------------------
  {
    component: 'Compass',
    file: 'editor/plan/compass.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the plan inspectors land together in the plan-inspector slice.',
  },
  {
    component: 'DimensionInspector',
    file: 'editor/plan/dimension-inspector.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the plan inspectors land together in the plan-inspector slice.',
  },
  {
    component: 'EntityProxy',
    file: 'editor/plan/entity-proxy.tsx',
    reason:
      'requires the live plan overlay projection from the scene context; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'FurnitureInspector',
    file: 'editor/plan/furniture-inspector.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the plan inspectors land together in the plan-inspector slice.',
  },
  {
    component: 'LengthField',
    file: 'editor/plan/length-field.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the plan inspectors land together in the plan-inspector slice.',
  },
  {
    component: 'OpeningInspector',
    file: 'editor/plan/opening-inspector.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the plan inspectors land together in the plan-inspector slice.',
  },
  {
    component: 'OpeningTypeChooser',
    file: 'editor/plan/opening-type-chooser.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the plan inspectors land together in the plan-inspector slice.',
  },
  {
    component: 'PlanOverlay',
    file: 'editor/plan/plan-overlay.tsx',
    reason:
      'positions DOM proxies over the live plan view; it requires the scene projection context, so an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'PlanView',
    file: 'editor/plan/plan-view.tsx',
    reason:
      'renders the plan canvas and reads eight editor contexts; it requires the full editor provider tree, so an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'RemoveControl',
    file: 'editor/plan/remove-control.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the plan inspectors land together in the plan-inspector slice.',
  },
  {
    component: 'RoomCeilingHeightEditor',
    file: 'editor/plan/room-ceiling-height-editor.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the room editors land together in the plan-inspector slice.',
  },
  {
    component: 'RoomFinishSection',
    file: 'editor/plan/room-finish-section.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the room editors land together in the plan-inspector slice.',
  },
  {
    component: 'RoomNameEditor',
    file: 'editor/plan/room-name-editor.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the room editors land together in the plan-inspector slice.',
  },
  {
    component: 'RoomPeriodEditor',
    file: 'editor/plan/room-period-editor.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the room editors land together in the plan-inspector slice.',
  },
  {
    component: 'RoomPurposeEditor',
    file: 'editor/plan/room-purpose-editor.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the room editors land together in the plan-inspector slice.',
  },
  {
    component: 'RoomStyleEditor',
    file: 'editor/plan/room-style-editor.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the room editors land together in the plan-inspector slice.',
  },
  {
    component: 'RoomSubPurposeEditor',
    file: 'editor/plan/room-sub-purpose-editor.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the room editors land together in the plan-inspector slice.',
  },
  {
    component: 'SelectionTransformPanel',
    file: 'editor/plan/selection-transform-panel.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the selection transform panel reads selection and scene contexts and needs a provider wrapper.',
  },
  {
    component: 'SnapPanel',
    file: 'editor/plan/snap-panel.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the snap panel reads the snap-preferences context and needs a provider wrapper.',
  },
  {
    component: 'SnapPreferencesProvider',
    file: 'editor/plan/snap-preferences-provider.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; it is the snap-preferences context provider, covered as a wrapper alongside the snap panel story.',
  },
  {
    component: 'UnderlayMenuPanel',
    file: 'editor/plan/underlay-menu-panel.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the underlay panels read the active floor and dispatch contexts and need a provider wrapper.',
  },
  {
    component: 'UnderlayRow',
    file: 'editor/plan/underlay-panel.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the underlay panels read the active floor and dispatch contexts and need a provider wrapper.',
  },
  {
    component: 'WallFinishSection',
    file: 'editor/plan/wall-finish-section.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the wall editors land together in the plan-inspector slice.',
  },
  {
    component: 'WallThicknessEditor',
    file: 'editor/plan/wall-thickness-editor.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; the wall editors land together in the plan-inspector slice.',
  },

  // --- editor/shell -------------------------------------------------------
  {
    component: 'BrandMark',
    file: 'editor/shell/brand-mark.tsx',
    reason: 'deferred to the shell story sub-issue.',
  },
  {
    component: 'CoordsReadout',
    file: 'editor/shell/coords-readout.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the editor session and pointer-readout contexts and needs a provider wrapper.',
  },
  {
    component: 'DiscardDialog',
    file: 'editor/shell/discard-dialog.tsx',
    reason: 'deferred to the shell story sub-issue.',
  },
  {
    component: 'EditorShell',
    file: 'editor/shell/editor-shell.tsx',
    reason:
      'composes the entire editor across twelve contexts and a live scene pane; it requires the full editor provider tree, so an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'ExportMenu',
    file: 'editor/shell/export-menu.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the project and dispatch contexts and needs a provider wrapper.',
  },
  {
    component: 'FloorSwitcher',
    file: 'editor/shell/floor-switcher.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the active floor and scene-graph contexts and needs a provider wrapper.',
  },
  {
    component: 'ImportAlert',
    file: 'editor/shell/import-alert.tsx',
    reason: 'deferred to the shell story sub-issue.',
  },
  {
    component: 'ImportDropTarget',
    file: 'editor/shell/import-drop-target.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the import and project contexts and needs a provider wrapper.',
  },
  {
    component: 'Inspector',
    file: 'editor/shell/inspector.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the editor session, selection, scene-graph, and active floor contexts and needs a provider wrapper.',
  },
  {
    component: 'OverallDimensions',
    file: 'editor/shell/overall-dimensions.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the scene-graph context and needs a provider wrapper.',
  },
  {
    component: 'ProjectControls',
    file: 'editor/shell/project-controls.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the project and dispatch contexts and needs a provider wrapper.',
  },
  {
    component: 'ProjectIdentity',
    file: 'editor/shell/project-identity.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the project context and needs a provider wrapper.',
  },
  {
    component: 'ProjectMenu',
    file: 'editor/shell/project-menu.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the project and dispatch contexts and needs a provider wrapper.',
  },
  {
    component: 'ScenePane',
    file: 'editor/shell/scene-pane.tsx',
    reason:
      'hosts the live R3F scene canvas and the full scene provider tree; an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'SnapStatus',
    file: 'editor/shell/snap-status.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the snap-preferences context and needs a provider wrapper.',
  },
  {
    component: 'StatusBar',
    file: 'editor/shell/status-bar.tsx',
    reason:
      'deferred to the shell story sub-issue; it composes the readout leaves and reads several editor-session contexts.',
  },
  {
    component: 'ThemeToggle',
    file: 'editor/shell/theme-toggle.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the theme context and is covered alongside the theme provider wrapper.',
  },
  {
    component: 'UnitToggle',
    file: 'editor/shell/unit-toggle.tsx',
    reason:
      'deferred to the shell story sub-issue; a units toggle interaction story is the first shell leaf authored in the #275 slice.',
  },
  {
    component: 'ZoomControl',
    file: 'editor/shell/zoom-control.tsx',
    reason:
      'deferred to the shell story sub-issue; it reads the viewport, active floor, and scene-graph contexts and needs a provider wrapper.',
  },

  // --- editor/tools -------------------------------------------------------
  {
    component: 'ActiveToolProvider',
    file: 'editor/tools/active-tool-provider.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; it is the active-tool context provider, covered as a wrapper alongside the tools panel story.',
  },
  {
    component: 'ToolsPanel',
    file: 'editor/tools/tools-panel.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; it reads the active-tool and opening-tool contexts and needs a provider wrapper.',
  },

  // --- editor/viewport ----------------------------------------------------
  {
    component: 'ViewModeViewport',
    file: 'editor/viewport/view-mode-viewport.tsx',
    reason:
      'switches between the plan view and the live scene pane; it requires the full editor provider tree, so an isolated browser-mode story is not feasible (permanent allowlist candidate, see ADR-0111).',
  },
  {
    component: 'ViewModeProvider',
    file: 'editor/viewport/view-mode.tsx',
    reason:
      'deferred to the tools-and-panels story sub-issue; it is the view-mode context provider, covered as a wrapper alongside the viewport story.',
  },
]
