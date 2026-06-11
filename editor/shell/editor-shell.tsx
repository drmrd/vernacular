import { useMemo } from 'react'
import {
  SceneCanvas,
  useActiveFloorId,
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSetActiveFloorId,
  type AutosaveStatus,
} from '../../bridge'
import { addFloor, setUnits, type Project } from '../../core'
import {
  CommandBar,
  CommandPalette,
  CommandPaletteProvider,
  createEditorCommands,
  useCommandPalette,
  useKeybindings,
  type CommandContext,
} from '../commands'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { OpeningTypeChooser } from '../plan/opening-type-chooser'
import { PlanView } from '../plan/plan-view'
import { UnderlayProvider } from '../plan/use-underlay'
import { useActiveTool } from '../tools/active-tool-context'
import { ToolsPanel } from '../tools/tools-panel'
import { AppFrame, PanelSlot } from '../design-system'
import { FloorSwitcher } from './floor-switcher'
import { Inspector } from './inspector'
import { ProjectControls, RecoveryPrompt, type ProjectControlsProps } from './project-controls'
import { FLOOR_SWITCHER_SLOT, PAINT_PICKER_SLOT, PAINT_INSPECTOR_SLOT } from './shell-panel-slots'
import { UnitToggle } from './unit-toggle'
import './editor-shell.css'

const SAVE_STATUS_LABELS: Record<AutosaveStatus, string> = {
  idle: 'Ready',
  pending: 'Saving...',
  saved: 'All changes saved',
  error: 'Save failed',
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
  const commands = useMemo(() => createEditorCommands(), [])
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

// The toolbar content. It renders a plain container, NOT a <header role="banner">,
// because AppFrame's own <header> provides the single banner landmark.
function ShellHeader({ saveStatus, projectControls }: ShellHeaderProps) {
  const graph = useSceneGraph()
  const session = useEditorSession()
  return (
    <div className="editor-shell__toolbar">
      <h1>Vernacular</h1>
      <p aria-live="polite">Walls: {graph.walls.length}</p>
      <p role="status">{SAVE_STATUS_LABELS[saveStatus]}</p>
      <UnitToggle
        units={session.getProject().meta.units}
        onChange={(units) => session.dispatch(setUnits(units))}
      />
      <ProjectControls {...projectControls} />
      <CommandBar />
    </div>
  )
}

// The floor rows the switcher renders: each floor's raw id and name (not the
// scene-node prefixed id).
function floorSummaries(project: Project): { id: string; name: string }[] {
  return project.floors.map((floor) => ({ id: floor.id, name: floor.name }))
}

// The tool rail content: the existing tools nav plus the live floor switcher. It
// subscribes to the scene graph so the floor list refreshes on add/remove floor,
// and to the active-floor hooks so the switcher reflects the active floor (both
// hoisted here to honor the hooks rule).
function ToolRail() {
  const session = useEditorSession()
  const activeFloorId = useActiveFloorId()
  const setActiveFloorId = useSetActiveFloorId()
  useSceneGraph()
  return (
    <>
      <ToolsNav />
      <PanelSlot slotId={FLOOR_SWITCHER_SLOT} label="Floors">
        <FloorSwitcher
          floors={floorSummaries(session.getProject())}
          activeFloorId={activeFloorId}
          onSelectFloor={setActiveFloorId}
          onAddFloor={() => session.dispatch(addFloor('New Floor'))}
        />
      </PanelSlot>
    </>
  )
}

// The central area: the 2D plan view and the 3D preview region (both unchanged).
function ViewportArea() {
  return (
    <>
      <PlanView />
      <section className="editor-shell__preview" aria-label="3D preview">
        <SceneCanvas />
      </section>
    </>
  )
}

// The inspector content: the existing selection inspector plus the empty paint seams
// the paint track mounts into later.
function InspectorPanels() {
  return (
    <>
      <Inspector />
      <PanelSlot slotId={PAINT_PICKER_SLOT} label="Paint" emptyTitle="Paint" />
      <PanelSlot slotId={PAINT_INSPECTOR_SLOT} label="Surface paint" emptyTitle="Surface paint" />
    </>
  )
}

export interface EditorShellProps extends ProjectControlsProps {
  saveStatus: AutosaveStatus
  recovery?: { onRestore: () => void; onDiscard: () => void }
}

export function EditorShell({ saveStatus, recovery, ...projectControls }: EditorShellProps) {
  return (
    // The command-palette provider wraps everything so the keybinding layer, the
    // command bar, and the palette dialog all share one open/close state. The
    // underlay and opening-tool providers then wrap the frame so the shared underlay
    // state and the opening placement type reach the canvas glue and the
    // inspector/tools panels from one source.
    <CommandPaletteProvider>
      <UnderlayProvider>
        <OpeningToolProvider>
          <KeybindingLayer />
          <CommandPalette />
          {recovery ? (
            <RecoveryPrompt onRestore={recovery.onRestore} onDiscard={recovery.onDiscard} />
          ) : null}
          <AppFrame
            header={<ShellHeader saveStatus={saveStatus} projectControls={projectControls} />}
            railLabel="Tool rail"
            rail={<ToolRail />}
            mainLabel="Viewport"
            main={<ViewportArea />}
            inspectorLabel="Inspector"
            inspector={<InspectorPanels />}
          />
        </OpeningToolProvider>
      </UnderlayProvider>
    </CommandPaletteProvider>
  )
}
