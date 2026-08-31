import { useMemo, type ReactNode } from 'react'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CheckCircle,
  Circle,
  CircleNotch,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react'
import {
  createEnvironmentSessionStore,
  createPerceivedColorStore,
  createSurfaceSelectionStore,
  EnvironmentSessionProvider,
  PerceivedColorProvider,
  SurfaceSelectionProvider,
  useActiveFloorId,
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSetActiveFloorId,
  type AutosaveStatus,
} from '../../bridge'
import { addFloor, renameFloor, renameProject, setUnits } from '../../core'
import {
  CommandPalette,
  CommandPaletteProvider,
  createCommandSet,
  useCommandPalette,
  useKeybindings,
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
import { ViewOverlayProvider } from '../viewport/view-overlay-context'
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
import { ViewToggles } from './view-toggles'
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
    () => createCommandSet({ view, snapStore, onSave }),
    [view, snapStore, onSave],
  )
  useKeybindings(commands, { session, selection, graph, activeFloorId, openPalette: palette.open })
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

function SaveStatusReadout({ status }: { status: AutosaveStatus }) {
  const StatusIcon = SAVE_STATUS_ICONS[status]
  return (
    <span role="status" className="editor-shell__save-status">
      <StatusIcon size={14} aria-hidden="true" />
      {SAVE_STATUS_LABELS[status]}
    </span>
  )
}

// Owns the session's project-rename wiring: the current name and the handler the
// project menu calls, discarding blank input rather than dispatching an empty rename.
function useProjectRename() {
  const session = useEditorSession()
  // Subscribes this header to session changes (e.g. a project rename) so the
  // breadcrumb and project menu re-render with the current project name.
  useSceneGraph()
  const projectName = session.getProject().meta.name
  const handleRename = (name: string) => {
    const trimmedName = name.trim()
    if (trimmedName === '') return
    session.dispatch(renameProject(trimmedName))
  }
  return { session, projectName, handleRename }
}

function ShellHeader({ saveStatus, projectControls }: ShellHeaderProps) {
  const { session, projectName, handleRename } = useProjectRename()
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
        projectName={projectName}
        onRename={handleRename}
      />
      <Breadcrumb projectName={projectName} />
      <div className="editor-shell__toolbar-actions">
        <ViewToggles />
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
      <SaveStatusReadout status={saveStatus} />
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
      // The switcher's rows carry each floor's raw id (not the scene-node prefixed
      // one) plus the elevation it orders and places new floors by.
      floors={session.getProject().floors.map(({ id, name, elevation }) => ({
        id,
        name,
        elevation,
      }))}
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
function ViewportArea({ onImportDroppedFile }: Pick<EditorShellProps, 'onImportDroppedFile'>) {
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

// The recovery prompt rides the frame's banner row with the notification banners.
// Rendered outside the frame it displaced a viewport-tall layout downwards and
// pushed the status bar out of the window; the banner row is a real grid row the
// rest of the frame reflows around, and it collapses again once nothing fills it.
function ShellBanner({ recovery }: { recovery: EditorShellProps['recovery'] }) {
  return (
    <>
      <BannerRegion />
      {recovery ? (
        <RecoveryPrompt onRestore={recovery.onRestore} onDiscard={recovery.onDiscard} />
      ) : null}
    </>
  )
}

interface ProviderLayerProps {
  onSave?: (() => void) | undefined
  children: ReactNode
}

/**
 * The stores the frame's panels share, and the render-nothing layers that ride them.
 * Each store is created once: the surface selection joins the paint inspector to the
 * viewport, the perceived color joins that viewport's sampler to the inspector
 * readout, and the environment session joins the tool rail's Environment panel to the
 * 3D viewport.
 */
function SessionStateProviders({ onSave, children }: ProviderLayerProps) {
  const surfaceSelection = useMemo(() => createSurfaceSelectionStore(), [])
  const environmentSession = useMemo(() => createEnvironmentSessionStore(), [])
  const perceivedColor = useMemo(() => createPerceivedColorStore(), [])
  return (
    <>
      <KeybindingLayer onSave={onSave} />
      <CommandPalette />
      <ToastRegion />
      <SurfaceSelectionProvider store={surfaceSelection}>
        <EntitySurfaceBridge />
        <PerceivedColorProvider store={perceivedColor}>
          <EnvironmentSessionProvider store={environmentSession}>
            {children}
          </EnvironmentSessionProvider>
        </PerceivedColorProvider>
      </SurfaceSelectionProvider>
    </>
  )
}

/**
 * The editor's provider pyramid, wrapped around whatever frame it is given. The
 * command-palette provider sits outermost so the keybinding layer, the command bar,
 * and the palette dialog share one open/close state. The snap preferences are created
 * once here and read by the keybinding layer, the command palette, the snap panel, and
 * the plan's snapping, persisted to localStorage as an editor preference. The underlay
 * and opening-tool providers wrap the frame so the shared underlay state and the
 * opening placement type reach the canvas glue and the inspector and tools panels from
 * one source.
 */
function ShellProviders({ onSave, children }: ProviderLayerProps) {
  const snapPreferences = useMemo(() => createSnapPreferencesStore(), [])
  return (
    <CommandPaletteProvider>
      <SnapPreferencesProvider store={snapPreferences}>
        <ViewModeProvider>
          <ViewOverlayProvider>
            <ViewportProvider>
              <PointerReadoutProvider>
                <UnderlayProvider>
                  <OpeningToolProvider>
                    <FurniturePlacementProvider>
                      <SessionStateProviders onSave={onSave}>{children}</SessionStateProviders>
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

export function EditorShell({ saveStatus, recovery, ...projectControls }: EditorShellProps) {
  useSaveFailureToast(saveStatus, projectControls.onSave)
  // Hoisted out of the frame below so it stays readable: inline, prettier wraps each
  // of these across four or five lines.
  const header = <ShellHeader saveStatus={saveStatus} projectControls={projectControls} />
  const main = <ViewportArea onImportDroppedFile={projectControls.onImportDroppedFile} />
  return (
    <ShellProviders onSave={projectControls.onSave}>
      <AppFrame
        header={header}
        banner={<ShellBanner recovery={recovery} />}
        railLabel="Tool rail"
        rail={<ToolRail />}
        mainLabel="Viewport"
        main={main}
        inspectorLabel="Inspector"
        inspector={<Inspector />}
        statusBar={<EditorStatusBar />}
      />
    </ShellProviders>
  )
}
