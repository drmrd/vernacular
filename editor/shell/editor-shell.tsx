import { SceneCanvas, useEditorSession, useSceneGraph, type AutosaveStatus } from '../../bridge'
import { setUnits } from '../../core'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { OpeningTypeChooser } from '../plan/opening-type-chooser'
import { PlanView } from '../plan/plan-view'
import { UnderlayProvider } from '../plan/use-underlay'
import { useActiveTool } from '../tools/active-tool-context'
import { ToolsPanel } from '../tools/tools-panel'
import { AppFrame, PanelSlot } from '../design-system'
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
    </div>
  )
}

// The tool rail content: the existing tools nav plus the empty floor-switcher seam
// the structure track mounts into later.
function ToolRail() {
  return (
    <>
      <ToolsNav />
      <PanelSlot slotId={FLOOR_SWITCHER_SLOT} label="Floors" emptyTitle="Floors" />
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
    // The underlay and opening-tool providers wrap the whole frame so the shared
    // underlay state and the opening placement type reach the canvas glue and the
    // inspector/tools panels from one source.
    <UnderlayProvider>
      <OpeningToolProvider>
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
  )
}
