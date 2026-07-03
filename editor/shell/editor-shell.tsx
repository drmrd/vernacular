import { useMemo } from 'react'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CheckCircle,
  Circle,
  CircleNotch,
  GridFour,
  Ruler,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react'
import {
  createEnvironmentSessionStore,
  createSurfaceSelectionStore,
  EnvironmentSessionProvider,
  SurfaceSelectionProvider,
  useActiveFloorId,
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSetActiveFloorId,
  type AutosaveStatus,
} from '../../bridge'
import { addFloor, renameFloor, setUnits, type Project } from '../../core'
import {
  CommandPalette,
  CommandPaletteProvider,
  createEditorCommands,
  createSaveCommand,
  createSnapCommands,
  createViewCommands,
  useCommandPalette,
  useKeybindings,
  type CommandContext,
} from '../commands'
import { useEntitySurfaceBridge } from '../paint/use-entity-surface-bridge'
import { FurniturePlacementProvider } from '../plan/furniture-placement-context'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { PlanView } from '../plan/plan-view'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'
import { useSnapPreferencesStore } from '../plan/snap-preferences-context'
import { SnapPreferencesProvider } from '../plan/snap-preferences-provider'
import { UnderlayProvider } from '../plan/use-underlay'
import { ViewportProvider } from '../plan/viewport-context'
import { PointerReadoutProvider } from '../plan/pointer-readout'
import { useActiveTool } from '../tools/active-tool-context'
import { toolLabel } from '../tools/tool-label'
import { ViewModeProvider, useViewMode } from '../viewport/view-mode'
import { ViewOverlayProvider, useViewOverlay } from '../viewport/view-overlay-context'
import { ViewModeViewport } from '../viewport/view-mode-viewport'
import { AppFrame, BannerRegion, IconButton, ToastRegion } from '../design-system'
import { BrandMark } from './brand-mark'
import { ExportMenu } from './export-menu'
import { Inspector } from './inspector'
import { SnapStatus } from './snap-status'
import { StatusBar } from './status-bar'
import { CoordsReadout } from './coords-readout'
import { ThemeToggle } from './theme-toggle'
import { ZoomControl } from './zoom-control'
import { RecoveryPrompt, type ProjectControlsProps } from './project-controls'
import { ProjectMenu } from './project-menu'
import { ScenePane } from './scene-pane'
import { ToolRail } from './tool-rail'
import { useSaveFailureToast } from './use-save-failure-toast'
import { ImportDropTarget } from './import-drop-target'
import { UnitToggle } from './unit-toggle'
import './editor-shell.css'

const SAVE_STATUS_LABELS: Record<AutosaveStatus, string> = {
  idle: 'Ready',
  pending: 'Saving...',
  saved: 'All changes saved',
  error: 'Save failed',
}

// A small decorative icon paired with each save-status label. The icon is
// aria-hidden so the role="status" label text stays the announced content.
const SAVE_STATUS_ICONS: Record<AutosaveStatus, Icon> = {
  idle: Circle,
  pending: CircleNotch,
  saved: CheckCircle,
  error: WarningCircle,
}

// A render-nothing layer that assembles the command context from the editor
// hooks and registers the global keybindings (undo/redo/delete/deselect/palette).
function KeybindingLayer({ onSave }: { onSave?: (() => void) | undefined }) {
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
      ...(onSave ? [createSaveCommand(onSave)] : []),
    ],
    [view, snapStore, onSave],
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
      <span className="editor-shell__breadcrumb-active">{projectName}</span>
    </nav>
  )
}

function ShellHeader({ saveStatus, projectControls }: ShellHeaderProps) {
  const session = useEditorSession()
  const { showGrid, showDimensions, toggleGrid, toggleDimensions } = useViewOverlay()
  const StatusIcon = SAVE_STATUS_ICONS[saveStatus]
  return (
    <div className="editor-shell__toolbar">
      <div className="editor-shell__brand">
        <BrandMark />
        <h1 className="editor-shell__wordmark">Vernacular</h1>
      </div>
      <ProjectMenu
        onNewProject={projectControls.onNewProject}
        onSave={projectControls.onSave}
        onOpenFile={projectControls.onOpenFile}
        onOpenFolder={projectControls.onOpenFolder}
        onOpenRecent={projectControls.onOpenRecent}
        recentProjects={projectControls.recentProjects}
      />
      <Breadcrumb projectName={session.getProject().meta.name} />
      <div className="editor-shell__toolbar-actions">
        <IconButton labeled aria-pressed={showGrid} onClick={toggleGrid} title="Grid (G)">
          <GridFour size={16} aria-hidden="true" />
          <span>Grid</span>
        </IconButton>
        <IconButton
          labeled
          aria-pressed={showDimensions}
          onClick={toggleDimensions}
          title="Dimensions (D)"
        >
          <Ruler size={16} aria-hidden="true" />
          <span>Dimensions</span>
        </IconButton>
        <ZoomControl />
        <IconButton aria-label="Undo" onClick={() => session.undo()}>
          <ArrowCounterClockwise size={16} aria-hidden="true" />
        </IconButton>
        <IconButton aria-label="Redo" onClick={() => session.redo()}>
          <ArrowClockwise size={16} aria-hidden="true" />
        </IconButton>
        <ThemeToggle />
        <ExportMenu
          onExportBundle={projectControls.onExportBundle}
          onExportPlan={projectControls.onExportPlan}
          onExportImage={projectControls.onExportImage}
          onExportPdf={projectControls.onExportPdf}
        />
      </div>
      <span role="status" className="editor-shell__save-status">
        <StatusIcon size={14} aria-hidden="true" />
        {SAVE_STATUS_LABELS[saveStatus]}
      </span>
    </div>
  )
}

// The floor rows the switcher renders: each floor's raw id, name, and elevation
// (not the scene-node prefixed id). Elevation lets the switcher order floors and
// place newly added ones above or below the existing stack.
function floorSummaries(project: Project): { id: string; name: string; elevation: number }[] {
  return project.floors.map((floor) => ({
    id: floor.id,
    name: floor.name,
    elevation: floor.elevation,
  }))
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
      onAddFloor={(placement) =>
        session.dispatch(addFloor(placement.name, { elevation: placement.elevation }))
      }
      onRenameFloor={(id, name) => session.dispatch(renameFloor(id, name))}
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
          </div>
        }
        preview={
          <section className="editor-shell__preview" aria-label="3D preview">
            <ScenePane />
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
  // The environment session store is created once so the tool rail's Environment panel
  // and the 3D viewport share one EnvironmentState (mode, observation instant, cloud
  // cover, color check) across the frame.
  const environmentSession = useMemo(() => createEnvironmentSessionStore(), [])
  // The snap-preferences store is created once so the keybinding layer, the command
  // palette, the snap panel, and the plan's snapping all read one source, persisted
  // to localStorage as an editor preference.
  const snapPreferences = useMemo(() => createSnapPreferencesStore(), [])
  useSaveFailureToast(saveStatus, projectControls.onSave)
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
                    <FurniturePlacementProvider>
                      <KeybindingLayer onSave={projectControls.onSave} />
                      <CommandPalette />
                      <ToastRegion />
                      {recovery ? (
                        <RecoveryPrompt
                          onRestore={recovery.onRestore}
                          onDiscard={recovery.onDiscard}
                        />
                      ) : null}
                      <SurfaceSelectionProvider store={surfaceSelection}>
                        <EntitySurfaceBridge />
                        <EnvironmentSessionProvider store={environmentSession}>
                          <AppFrame
                            header={
                              <ShellHeader
                                saveStatus={saveStatus}
                                projectControls={projectControls}
                              />
                            }
                            banner={<BannerRegion />}
                            railLabel="Tool rail"
                            rail={<ToolRail />}
                            mainLabel="Viewport"
                            main={
                              <ViewportArea
                                onImportDroppedFile={projectControls.onImportDroppedFile}
                              />
                            }
                            inspectorLabel="Inspector"
                            inspector={<Inspector />}
                            statusBar={<EditorStatusBar />}
                          />
                        </EnvironmentSessionProvider>
                      </SurfaceSelectionProvider>
                    </FurniturePlacementProvider>
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
