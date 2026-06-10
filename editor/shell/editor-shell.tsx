import {
  SceneCanvas,
  useEditorSession,
  useSceneGraph,
  useSelectionIds,
  type AutosaveStatus,
  type EditorSession,
} from '../../bridge'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  DIMENSION_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  ROOM_ID_PREFIX,
  selectionCenter,
  setUnits,
  WALL_NODE_PREFIX,
  type Command,
  type DimensionSceneNode,
  type Opening,
  type Project,
  type RoomSceneNode,
  type SceneGraph,
  type UnitPreferences,
  type UnitSystem,
  type WallSceneNode,
} from '../../core'
import { DimensionInspector } from '../plan/dimension-inspector'
import { OpeningInspector } from '../plan/opening-inspector'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { OpeningTypeChooser } from '../plan/opening-type-chooser'
import { PlanView } from '../plan/plan-view'
import { RoomNameEditor } from '../plan/room-name-editor'
import { selectedEntityIds } from '../plan/selection-entities'
import { SelectionTransformPanel } from '../plan/selection-transform-panel'
import { singleSelectedDimension } from '../plan/selected-dimension'
import { UnderlayPanel } from '../plan/underlay-panel'
import { useUnderlay, UnderlayProvider } from '../plan/use-underlay'
import { WallThicknessEditor } from '../plan/wall-thickness-editor'
import { useActiveTool } from '../tools/active-tool-context'
import { ToolsPanel } from '../tools/tools-panel'
import { AppFrame, PanelSlot } from '../design-system'
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

// A project-level unit-preferences store is later work; this slice picks the
// default preferences for the project's units (see the slice deferrals).
const PREFERENCES_BY_UNITS: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
}

/**
 * The single selected wall node, or null. Reflects a selected wall regardless of
 * the active tool (unlike the tool-gated `singleSelectedWall` the drag glue uses),
 * since the inspector shows the wall whenever exactly one is selected.
 */
function singleSelectedWallNode(
  selectedIds: ReadonlySet<string>,
  graph: SceneGraph,
): WallSceneNode | null {
  if (selectedIds.size !== 1) {
    return null
  }
  const [onlyId] = selectedIds
  return graph.walls.find((wall) => wall.id === onlyId) ?? null
}

/**
 * The single selected room node, or null. A wall and a room are mutually
 * exclusive for a single selection because a node id is either a wall or a room.
 */
function singleSelectedRoomNode(
  selectedIds: ReadonlySet<string>,
  graph: SceneGraph,
): RoomSceneNode | null {
  if (selectedIds.size !== 1) {
    return null
  }
  const [onlyId] = selectedIds
  return graph.rooms.find((room) => room.id === onlyId) ?? null
}

interface SelectedOpening {
  floorId: string
  opening: Opening
}

/**
 * The single selected raw `Opening` and its floor, or null. The selection holds
 * the namespaced scene-node id; this strips `OPENING_NODE_PREFIX` and finds the
 * raw model opening on its floor so the inspector edits the persisted record.
 * Mutually exclusive with a single selected wall or room (a node id names one).
 */
function singleSelectedOpening(
  selectedIds: ReadonlySet<string>,
  project: Readonly<Project>,
): SelectedOpening | null {
  if (selectedIds.size !== 1) {
    return null
  }
  const [onlyId] = selectedIds
  if (onlyId === undefined || !onlyId.startsWith(OPENING_NODE_PREFIX)) {
    return null
  }
  const rawId = onlyId.slice(OPENING_NODE_PREFIX.length)
  for (const floor of project.floors) {
    const opening = floor.openings.find((candidate) => candidate.id === rawId)
    if (opening !== undefined) {
      return { floorId: floor.id, opening }
    }
  }
  return null
}

interface WallInspectorProps {
  wallNode: WallSceneNode
  preferences: UnitPreferences
  dispatch: (command: unknown) => void
}

function WallInspector({ wallNode, preferences, dispatch }: WallInspectorProps) {
  return (
    // Key on the node id and thickness so the editor remounts when the selected
    // wall changes or an undo restores a different thickness; the editor captures
    // its initial formatted value at mount.
    <WallThicknessEditor
      key={`${wallNode.id}:${wallNode.thickness}`}
      floorId={wallNode.floorId}
      wallId={wallNode.id.slice(WALL_NODE_PREFIX.length)}
      thickness={wallNode.thickness}
      dispatch={dispatch}
      preferences={preferences}
    />
  )
}

interface RoomInspectorProps {
  roomNode: RoomSceneNode
  dispatch: (command: unknown) => void
}

function RoomInspector({ roomNode, dispatch }: RoomInspectorProps) {
  return (
    // Key on the node id and name so the editor remounts when the selected room
    // changes or an undo restores a different name; the editor seeds its input
    // from the effective name at mount.
    <RoomNameEditor
      key={`${roomNode.id}:${roomNode.name ?? ''}`}
      roomKey={roomNode.id.slice(ROOM_ID_PREFIX.length)}
      name={roomNode.name ?? ''}
      dispatch={dispatch}
    />
  )
}

interface SelectedDimensionInspectorProps {
  node: DimensionSceneNode
  units: UnitSystem
  session: EditorSession
}

// The selection holds the namespaced scene-node id; strip DIMENSION_NODE_PREFIX
// so the inspector edits the raw model dimension on its floor.
function SelectedDimensionInspector({ node, units, session }: SelectedDimensionInspectorProps) {
  return (
    <DimensionInspector
      floorId={node.floorId}
      dimensionId={node.id.slice(DIMENSION_NODE_PREFIX.length)}
      length={node.length}
      units={units}
      dispatch={session.dispatch}
    />
  )
}

interface SelectionInspectorProps {
  session: EditorSession
  graph: SceneGraph
  selectedIds: ReadonlySet<string>
  dispatch: (command: unknown) => void
}

// The selection-driven content: the wall, room, opening, or dimension editor for
// a single selection, otherwise a brief selection summary.
function SelectionInspector({ session, graph, selectedIds, dispatch }: SelectionInspectorProps) {
  const wallNode = singleSelectedWallNode(selectedIds, graph)
  if (wallNode !== null) {
    const preferences = PREFERENCES_BY_UNITS[session.getProject().meta.units]
    return <WallInspector wallNode={wallNode} preferences={preferences} dispatch={dispatch} />
  }
  const roomNode = singleSelectedRoomNode(selectedIds, graph)
  if (roomNode !== null) {
    return <RoomInspector roomNode={roomNode} dispatch={dispatch} />
  }
  const project = session.getProject()
  const selectedOpening = singleSelectedOpening(selectedIds, project)
  if (selectedOpening !== null) {
    return (
      // Key on the opening id so the inspector remounts when the selected opening
      // changes; its dimension fields seed from the opening at mount.
      <OpeningInspector
        key={selectedOpening.opening.id}
        floorId={selectedOpening.floorId}
        opening={selectedOpening.opening}
        units={project.meta.units}
        dispatch={session.dispatch}
      />
    )
  }
  const dimensionNode = singleSelectedDimension(selectedIds, graph)
  if (dimensionNode !== null) {
    return (
      <SelectedDimensionInspector
        node={dimensionNode}
        units={project.meta.units}
        session={session}
      />
    )
  }
  return <p>{selectedIds.size > 0 ? 'Wall selected' : 'No selection'}</p>
}

interface TransformPanelProps {
  session: EditorSession
  selectedIds: ReadonlySet<string>
}

// The rotate controls for any non-empty selection of transformable entities
// (walls, openings, dimensions), about the selection center. Rooms are derived,
// so a room-only selection yields no entity ids and renders nothing.
function TransformPanel({ session, selectedIds }: TransformPanelProps) {
  const floor = session.getProject().floors[0]
  const entityIds = selectedEntityIds(selectedIds)
  if (floor === undefined || entityIds.length === 0) {
    return null
  }
  return (
    <SelectionTransformPanel
      floorId={floor.id}
      entityIds={entityIds}
      center={selectionCenter(floor, entityIds)}
      dispatch={session.dispatch}
    />
  )
}

function Inspector() {
  const session = useEditorSession()
  const graph = useSceneGraph()
  const selectedIds = useSelectionIds()
  const underlay = useUnderlay()
  // The editors' dispatch prop is intentionally loose (`unknown`) so the inline
  // editors drive their unit tests without the command types; each only ever
  // dispatches a valid command, so forwarding it to the session is sound.
  const dispatch = (command: unknown): void => {
    session.dispatch(command as Command)
  }
  // A single-floor MVP: the underlay panel always lists the active (first) floor's
  // underlays. The panel renders nothing for the rows when the floor has none.
  const floor = session.getProject().floors[0]
  return (
    <>
      <SelectionInspector
        session={session}
        graph={graph}
        selectedIds={selectedIds}
        dispatch={dispatch}
      />
      <TransformPanel session={session} selectedIds={selectedIds} />
      {floor ? (
        <UnderlayPanel
          floorId={floor.id}
          underlays={floor.underlays}
          dispatch={dispatch}
          onLoadImage={underlay.loadImage}
          onCalibrate={underlay.startCalibration}
        />
      ) : null}
    </>
  )
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
