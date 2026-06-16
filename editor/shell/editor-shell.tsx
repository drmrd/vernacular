import { useMemo } from 'react'
import { ArrowClockwise, ArrowCounterClockwise, GridFour, Ruler } from '@phosphor-icons/react'
import {
  SceneCanvas,
  createSurfaceSelectionStore,
  SurfaceSelectionProvider,
  useActiveFloorId,
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSetActiveFloorId,
  type AutosaveStatus,
} from '../../bridge'
import {
  addFloor,
  builtinPeriods,
  formatAdaptiveLength,
  preferencesForUnits,
  sceneGraphForFloor,
  setUnits,
  type Project,
} from '../../core'
import {
  CommandPalette,
  CommandPaletteProvider,
  createEditorCommands,
  createSnapCommands,
  createViewCommands,
  useCommandPalette,
  useKeybindings,
  type CommandContext,
} from '../commands'
import { useEntitySurfaceBridge } from '../paint/use-entity-surface-bridge'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { OpeningTypeChooser } from '../plan/opening-type-chooser'
import { CanvasReferenceControl } from '../plan/canvas-reference-control'
import { planExtent } from '../plan/fit'
import { PlanView } from '../plan/plan-view'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'
import { useSnapPreferencesStore } from '../plan/snap-preferences-context'
import { SnapPreferencesProvider } from '../plan/snap-preferences-provider'
import { UnderlayProvider } from '../plan/use-underlay'
import { ViewportProvider } from '../plan/viewport-context'
import { PointerReadoutProvider } from '../plan/pointer-readout'
import { useActiveTool, type ToolId } from '../tools/active-tool-context'
import { ToolsPanel } from '../tools/tools-panel'
import { ViewModeProvider, useViewMode } from '../viewport/view-mode'
import { ViewOverlayProvider, useViewOverlay } from '../viewport/view-overlay-context'
import { ViewModeViewport } from '../viewport/view-mode-viewport'
import { AppFrame } from '../design-system'
import { BrandMark } from './brand-mark'
import { ExportMenu } from './export-menu'
import { Inspector } from './inspector'
import { OverallDimensions } from './overall-dimensions'
import { ProjectIdentity } from './project-identity'
import { SnapStatus } from './snap-status'
import { StatusBar } from './status-bar'
import { CoordsReadout } from './coords-readout'
import { ThemeToggle } from './theme-toggle'
import { ZoomControl } from './zoom-control'
import { ProjectControls, RecoveryPrompt, type ProjectControlsProps } from './project-controls'
import { ProjectMenu } from './project-menu'
import { ImportAlert } from './import-alert'
import { ImportDropTarget } from './import-drop-target'
import { UnitToggle } from './unit-toggle'
import './editor-shell.css'

const SAVE_STATUS_LABELS: Record<AutosaveStatus, string> = {
  idle: 'Ready',
  pending: 'Saving...',
  saved: 'All changes saved',
  error: 'Save failed',
}

function toolLabel(tool: ToolId): string {
  switch (tool) {
    case 'select':
      return 'Select'
    case 'pan':
      return 'Pan'
    case 'draw-wall':
      return 'Wall'
    case 'place-opening':
      return 'Opening'
    case 'dimension':
      return 'Dimension'
    case 'calibrate':
      return 'Calibrate'
  }
}

// The tools nav: the tool buttons, plus the opening-type chooser surfaced only
// while the place-opening tool is active so the user picks what to place.
function ToolsNav() {
  const { tool } = useActiveTool()
  return (
    <nav className="editor-shell__tools" aria-label="Tools">
      <ToolsPanel />
      {tool === 'place-opening' ? <OpeningTypeChooser /> : null}
    </nav>
  )
}

// A render-nothing layer that assembles the command context from the editor
// hooks and registers the global keybindings (undo/redo/delete/deselect/palette).
function KeybindingLayer() {
  const session = useEditorSession()
  const selection = useSelection()
  const activeFloorId = useActiveFloorId()
  const graph = useSceneGraph()
  const palette = useCommandPalette()
  const view = useViewMode()
  const snapStore = useSnapPreferencesStore()
  const commands = useMemo(
    () => [
      ...createEditorCommands(),
      ...createViewCommands(view),
      ...createSnapCommands(snapStore),
    ],
    [view, snapStore],
  )
  const context: CommandContext = {
    session,
    selection,
    graph,
    activeFloorId,
    openPalette: palette.open,
  }
  useKeybindings(commands, context)
  return null
}

interface ShellHeaderProps {
  saveStatus: AutosaveStatus
  projectControls: ProjectControlsProps
}

function Breadcrumb({ projectName }: { projectName: string }) {
  return (
    <nav className="editor-shell__breadcrumb" aria-label="Breadcrumb">
      <span className="editor-shell__breadcrumb-sep">/</span>
      <span className="editor-shell__breadcrumb-crumb">My Projects</span>
      <span className="editor-shell__breadcrumb-sep">/</span>
      <span className="editor-shell__breadcrumb-active">{projectName}</span>
    </nav>
  )
}

function ShellHeader({ saveStatus, projectControls }: ShellHeaderProps) {
  const session = useEditorSession()
  const { showGrid, showDimensions, toggleGrid, toggleDimensions } = useViewOverlay()
  return (
    <div className="editor-shell__toolbar">
      <div className="editor-shell__brand">
        <BrandMark />
        <h1 className="editor-shell__wordmark">Vernacular</h1>
      </div>
      <ProjectMenu
        onNewProject={projectControls.onNewProject}
        onOpenFile={projectControls.onOpenFile}
        onOpenFolder={projectControls.onOpenFolder}
        onOpenRecent={projectControls.onOpenRecent}
        recentProjects={projectControls.recentProjects}
      />
      <Breadcrumb projectName={session.getProject().meta.name} />
      <div className="editor-shell__toolbar-actions">
        <button
          type="button"
          className="editor-shell__icon-btn editor-shell__icon-btn--labeled"
          aria-pressed={showGrid}
          onClick={toggleGrid}
          title="Grid (G)"
        >
          <GridFour size={16} aria-hidden="true" />
          <span>Grid</span>
        </button>
        <button
          type="button"
          className="editor-shell__icon-btn editor-shell__icon-btn--labeled"
          aria-pressed={showDimensions}
          onClick={toggleDimensions}
          title="Dimensions (D)"
        >
          <Ruler size={16} aria-hidden="true" />
          <span>Dimensions</span>
        </button>
        <ZoomControl />
        <button
          type="button"
          className="editor-shell__icon-btn"
          aria-label="Undo"
          onClick={() => session.undo()}
        >
          <ArrowCounterClockwise size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="editor-shell__icon-btn"
          aria-label="Redo"
          onClick={() => session.redo()}
        >
          <ArrowClockwise size={16} aria-hidden="true" />
        </button>
        <ThemeToggle />
        <ExportMenu
          onExportBundle={projectControls.onExportBundle}
          onExportPlan={projectControls.onExportPlan}
          onExportImage={projectControls.onExportImage}
          onExportPdf={projectControls.onExportPdf}
        />
        {projectControls.onSave ? <ProjectControls onSave={projectControls.onSave} /> : null}
      </div>
      <span role="status" className="editor-shell__save-status">
        {SAVE_STATUS_LABELS[saveStatus]}
      </span>
    </div>
  )
}

// The floor rows the switcher renders: each floor's raw id and name (not the
// scene-node prefixed id).
function floorSummaries(project: Project): { id: string; name: string }[] {
  return project.floors.map((floor) => ({ id: floor.id, name: floor.name }))
}

// The italic period subtitle for the rail project block: the era's display name
// and its approximate range, drawn from the period registry.
function railPeriodLabel(period: string): string | undefined {
  const entry = builtinPeriods.entries[period]
  if (entry === undefined) {
    return undefined
  }
  const name = entry.displayName?.['en-US'] ?? period
  return entry.approximateRange ? `${name}, ${entry.approximateRange}` : name
}

// The tool rail content: the project identity block above the drawing and editing
// tools. It subscribes to the scene graph so the block refreshes on project edits.
function ToolRail() {
  const session = useEditorSession()
  const fullGraph = useSceneGraph()
  const floorId = useActiveFloorId()
  const project = session.getProject()
  // Narrow to the active floor so the readout measures the same content the canvas
  // draws, not every floor stacked together.
  const graph = sceneGraphForFloor(fullGraph, floorId)
  const extent = planExtent(graph.walls, graph.rooms)
  const preferences = preferencesForUnits(project.meta.units)
  const overall =
    extent === null
      ? null
      : {
          width: formatAdaptiveLength(extent.width, preferences),
          height: formatAdaptiveLength(extent.height, preferences),
        }
  return (
    <div className="editor-shell__rail">
      <ProjectIdentity
        name={project.meta.name}
        periodLabel={railPeriodLabel(project.meta.period)}
      />
      <ToolsNav />
      <OverallDimensions extent={overall} />
    </div>
  )
}

function EditorStatusBar() {
  const session = useEditorSession()
  const activeFloorId = useActiveFloorId()
  const setActiveFloorId = useSetActiveFloorId()
  const { tool } = useActiveTool()
  useSceneGraph()
  return (
    <StatusBar
      floors={floorSummaries(session.getProject())}
      activeFloorId={activeFloorId}
      onSelectFloor={setActiveFloorId}
      onAddFloor={() => session.dispatch(addFloor('New Floor'))}
      tool={`Tool: ${toolLabel(tool)}`}
      coords={<CoordsReadout />}
      snap={<SnapStatus />}
      units={
        <UnitToggle
          units={session.getProject().meta.units}
          onChange={(units) => session.dispatch(setUnits(units))}
        />
      }
    />
  )
}

// The central area: the view-mode viewport, which shows the 2D plan view and/or
// the 3D preview region depending on the active view mode. A drop target wraps it
// so a project file dragged onto the plan loads as the active project.
function ViewportArea({
  onImportDroppedFile,
}: {
  onImportDroppedFile?: ((file: File) => void) | undefined
}) {
  return (
    <ImportDropTarget onImportDroppedFile={onImportDroppedFile}>
      <ViewModeViewport
        plan={
          <div className="editor-shell__plan-area">
            <PlanView />
            <CanvasReferenceControl />
          </div>
        }
        preview={
          <section className="editor-shell__preview" aria-label="3D preview">
            <SceneCanvas />
          </section>
        }
      />
    </ImportDropTarget>
  )
}

// A render-nothing layer that defaults the active paint surface to a selected
// wall's first face, so clicking a wall on the plan also chooses what to paint.
function EntitySurfaceBridge() {
  useEntitySurfaceBridge()
  return null
}

export interface EditorShellProps extends ProjectControlsProps {
  saveStatus: AutosaveStatus
  recovery?: { onRestore: () => void; onDiscard: () => void }
}

export function EditorShell({ saveStatus, recovery, ...projectControls }: EditorShellProps) {
  // The surface-selection store is created once so the paint inspector and the
  // viewport share one active-surface source across the frame.
  const surfaceSelection = useMemo(() => createSurfaceSelectionStore(), [])
  // The snap-preferences store is created once so the keybinding layer, the command
  // palette, the snap panel, and the plan's snapping all read one source, persisted
  // to localStorage as an editor preference.
  const snapPreferences = useMemo(() => createSnapPreferencesStore(), [])
  return (
    // The command-palette provider wraps everything so the keybinding layer, the
    // command bar, and the palette dialog all share one open/close state. The
    // underlay and opening-tool providers then wrap the frame so the shared underlay
    // state and the opening placement type reach the canvas glue and the
    // inspector/tools panels from one source.
    <CommandPaletteProvider>
      <SnapPreferencesProvider store={snapPreferences}>
        <ViewModeProvider>
          <ViewOverlayProvider>
            <ViewportProvider>
              <PointerReadoutProvider>
                <UnderlayProvider>
                  <OpeningToolProvider>
                    <KeybindingLayer />
                    <CommandPalette />
                    {recovery ? (
                      <RecoveryPrompt
                        onRestore={recovery.onRestore}
                        onDiscard={recovery.onDiscard}
                      />
                    ) : null}
                    <ImportAlert
                      status={projectControls.importStatus ?? null}
                      // Spread onDismiss only when present: the optional prop rejects an explicit undefined.
                      {...(projectControls.onDismissImportStatus
                        ? { onDismiss: projectControls.onDismissImportStatus }
                        : {})}
                    />
                    <SurfaceSelectionProvider store={surfaceSelection}>
                      <EntitySurfaceBridge />
                      <AppFrame
                        header={
                          <ShellHeader saveStatus={saveStatus} projectControls={projectControls} />
                        }
                        railLabel="Tool rail"
                        rail={<ToolRail />}
                        mainLabel="Viewport"
                        main={
                          <ViewportArea onImportDroppedFile={projectControls.onImportDroppedFile} />
                        }
                        inspectorLabel="Inspector"
                        inspector={<Inspector />}
                        statusBar={<EditorStatusBar />}
                      />
                    </SurfaceSelectionProvider>
                  </OpeningToolProvider>
                </UnderlayProvider>
              </PointerReadoutProvider>
            </ViewportProvider>
          </ViewOverlayProvider>
        </ViewModeProvider>
      </SnapPreferencesProvider>
    </CommandPaletteProvider>
  )
}
