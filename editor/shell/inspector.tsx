import {
  useActiveFloorId,
  useEditorSession,
  useSceneGraph,
  useSelectionIds,
  type EditorSession,
} from '../../bridge'
import {
  ceilingHeight as resolveCeilingHeight,
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  DIMENSION_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  ROOM_ID_PREFIX,
  selectionCenter,
  WALL_NODE_PREFIX,
  type Command,
  type DimensionSceneNode,
  type Opening,
  type Project,
  type RoomOverride,
  type RoomSceneNode,
  type SceneGraph,
  type UnitPreferences,
  type UnitSystem,
  type WallSceneNode,
} from '../../core'
import './inspector.css'
import { DimensionInspector } from '../plan/dimension-inspector'
import { OpeningInspector } from '../plan/opening-inspector'
import { RoomCeilingHeightEditor } from '../plan/room-ceiling-height-editor'
import { RoomNameEditor } from '../plan/room-name-editor'
import { RoomPeriodEditor } from '../plan/room-period-editor'
import { RoomPurposeEditor } from '../plan/room-purpose-editor'
import { RoomStyleEditor } from '../plan/room-style-editor'
import { RoomSubPurposeEditor } from '../plan/room-sub-purpose-editor'
import { selectedEntityIds } from '../plan/selection-entities'
import { SelectionTransformPanel } from '../plan/selection-transform-panel'
import { singleSelectedDimension } from '../plan/selected-dimension'
import { UnderlayPanel } from '../plan/underlay-panel'
import { useUnderlay } from '../plan/use-underlay'
import { WallThicknessEditor } from '../plan/wall-thickness-editor'

// A project-level unit-preferences store is later work; this slice picks the
// default preferences for the project's units (see the slice deferrals).
const PREFERENCES_BY_UNITS: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
}

// The floor the inspector edits: the active floor, falling back to the first floor
// when the active id is null or no longer names a floor in the project.
function activeFloor(project: Readonly<Project>, activeFloorId: string | null) {
  return project.floors.find((floor) => floor.id === activeFloorId) ?? project.floors[0]
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

interface RoomMetadataEditorsProps {
  roomKey: string
  override: RoomOverride | undefined
  dispatch: (command: unknown) => void
}

// The old-house vocabulary editors (purpose, sub-purpose, period) for a room,
// each reading its value from the room's stored override.
function RoomMetadataEditors({ roomKey, override, dispatch }: RoomMetadataEditorsProps) {
  return (
    <>
      <RoomPurposeEditor roomKey={roomKey} purpose={override?.purpose} dispatch={dispatch} />
      {/* Key on the room key and sub-purpose so the editor remounts when the
          selected room changes or an undo restores a different value; the editor
          seeds its input from the sub-purpose at mount. */}
      <RoomSubPurposeEditor
        key={`${roomKey}:sub:${override?.subPurpose ?? ''}`}
        roomKey={roomKey}
        subPurpose={override?.subPurpose}
        dispatch={dispatch}
      />
      <RoomPeriodEditor roomKey={roomKey} period={override?.periodOverride} dispatch={dispatch} />
      <RoomStyleEditor roomKey={roomKey} style={override?.styleOverride} dispatch={dispatch} />
    </>
  )
}

interface RoomInspectorProps {
  roomNode: RoomSceneNode
  project: Readonly<Project>
  dispatch: (command: unknown) => void
}

function RoomInspector({ roomNode, project, dispatch }: RoomInspectorProps) {
  const roomKey = roomNode.id.slice(ROOM_ID_PREFIX.length)
  const override = project.roomOverrides?.[roomKey]
  const preferences = PREFERENCES_BY_UNITS[project.meta.units]
  const height = resolveCeilingHeight(roomNode)
  return (
    <>
      {/* Key on the node id and name so the editor remounts when the selected room
          changes or an undo restores a different name; the editor seeds its input
          from the effective name at mount. */}
      <RoomNameEditor
        key={`${roomNode.id}:${roomNode.name ?? ''}`}
        roomKey={roomKey}
        name={roomNode.name ?? ''}
        dispatch={dispatch}
      />
      {/* Key on the node id and resolved height so the editor remounts when the
          selected room changes or an undo restores a different height. */}
      <RoomCeilingHeightEditor
        key={`${roomNode.id}:ceiling:${height}`}
        roomKey={roomKey}
        ceilingHeight={height}
        dispatch={dispatch}
        preferences={preferences}
      />
      <RoomMetadataEditors roomKey={roomKey} override={override} dispatch={dispatch} />
    </>
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
    return <RoomInspector roomNode={roomNode} project={session.getProject()} dispatch={dispatch} />
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
  const activeFloorId = useActiveFloorId()
  const floor = activeFloor(session.getProject(), activeFloorId)
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

export function Inspector() {
  const session = useEditorSession()
  const graph = useSceneGraph()
  const selectedIds = useSelectionIds()
  const activeFloorId = useActiveFloorId()
  const underlay = useUnderlay()
  // The editors' dispatch prop is intentionally loose (`unknown`) so the inline
  // editors drive their unit tests without the command types; each only ever
  // dispatches a valid command, so forwarding it to the session is sound.
  const dispatch = (command: unknown): void => {
    session.dispatch(command as Command)
  }
  // The underlay panel lists the active floor's underlays, falling back to the
  // first floor. The panel renders nothing for the rows when the floor has none.
  const floor = activeFloor(session.getProject(), activeFloorId)
  const count = selectedIds.size
  return (
    <div className="inspector">
      <div className="inspector__header">
        <h2 className="inspector__title">Properties</h2>
        {count > 0 ? <span className="inspector__count-badge">{count} selected</span> : null}
      </div>
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
    </div>
  )
}
