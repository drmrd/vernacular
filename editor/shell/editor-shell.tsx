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
  ROOM_ID_PREFIX,
  WALL_NODE_PREFIX,
  type Command,
  type RoomSceneNode,
  type SceneGraph,
  type UnitPreferences,
  type UnitSystem,
  type WallSceneNode,
} from '../../core'
import { PlanView } from '../plan/plan-view'
import { RoomNameEditor } from '../plan/room-name-editor'
import { UnderlayPanel } from '../plan/underlay-panel'
import { useUnderlay, UnderlayProvider } from '../plan/use-underlay'
import { WallThicknessEditor } from '../plan/wall-thickness-editor'
import { ToolsPanel } from '../tools/tools-panel'
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

interface RecentProject {
  id: string
  name: string
}

interface ProjectControlsProps {
  recentProjects?: RecentProject[]
  onNewProject?: () => void
  onOpenRecent?: (id: string) => void
  onSave?: () => void
  onExportBundle?: () => void
  onOpenFolder?: () => void
}

function ProjectControls({
  recentProjects,
  onNewProject,
  onOpenRecent,
  onSave,
  onExportBundle,
  onOpenFolder,
}: ProjectControlsProps) {
  const hasRecentProjects = recentProjects !== undefined && recentProjects.length > 0
  return (
    <nav className="editor-shell__project" aria-label="Project">
      {onNewProject ? (
        <button type="button" onClick={onNewProject}>
          New
        </button>
      ) : null}
      {onSave ? (
        <button type="button" onClick={onSave}>
          Save
        </button>
      ) : null}
      {onExportBundle ? (
        <button type="button" onClick={onExportBundle}>
          Export bundle
        </button>
      ) : null}
      {onOpenFolder ? (
        <button type="button" onClick={onOpenFolder}>
          Open folder
        </button>
      ) : null}
      {hasRecentProjects && onOpenRecent ? (
        <RecentProjectsList projects={recentProjects} onOpenRecent={onOpenRecent} />
      ) : null}
    </nav>
  )
}

interface RecentProjectsListProps {
  projects: RecentProject[]
  onOpenRecent: (id: string) => void
}

function RecentProjectsList({ projects, onOpenRecent }: RecentProjectsListProps) {
  return (
    <ul className="editor-shell__recent">
      {projects.map((project) => (
        <li key={project.id}>
          <button type="button" onClick={() => onOpenRecent(project.id)}>
            {project.name}
          </button>
        </li>
      ))}
    </ul>
  )
}

interface RecoveryPromptProps {
  onRestore: () => void
  onDiscard: () => void
}

function RecoveryPrompt({ onRestore, onDiscard }: RecoveryPromptProps) {
  return (
    <div className="editor-shell__recovery" role="alert">
      <p>Unsaved changes were recovered.</p>
      <button type="button" onClick={onRestore}>
        Restore
      </button>
      <button type="button" onClick={onDiscard}>
        Discard
      </button>
    </div>
  )
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

interface SelectionInspectorProps {
  session: EditorSession
  graph: SceneGraph
  selectedIds: ReadonlySet<string>
  dispatch: (command: unknown) => void
}

// The selection-driven content: the wall or room editor for a single selection,
// otherwise a brief selection summary.
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
  return <p>{selectedIds.size > 0 ? 'Wall selected' : 'No selection'}</p>
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

export interface EditorShellProps extends ProjectControlsProps {
  saveStatus: AutosaveStatus
  recovery?: { onRestore: () => void; onDiscard: () => void }
}

export function EditorShell({ saveStatus, recovery, ...projectControls }: EditorShellProps) {
  const graph = useSceneGraph()
  return (
    // The underlay provider wraps both the plan view and the inspector so the
    // shared underlay state (the decoded-bitmap cache and the armed calibration)
    // reaches the canvas glue and the inspector panel from one source.
    <UnderlayProvider>
      <div className="editor-shell">
        <header className="editor-shell__toolbar" role="banner">
          <h1>Vernacular</h1>
          <p aria-live="polite">Walls: {graph.walls.length}</p>
          <p role="status">{SAVE_STATUS_LABELS[saveStatus]}</p>
          <ProjectControls {...projectControls} />
        </header>
        {recovery ? (
          <RecoveryPrompt onRestore={recovery.onRestore} onDiscard={recovery.onDiscard} />
        ) : null}
        <nav className="editor-shell__tools" aria-label="Tools">
          <ToolsPanel />
        </nav>
        <main className="editor-shell__viewport" aria-label="Viewport">
          <PlanView />
          <section className="editor-shell__preview" aria-label="3D preview">
            <SceneCanvas />
          </section>
        </main>
        <aside className="editor-shell__inspector" aria-label="Inspector">
          <Inspector />
        </aside>
      </div>
    </UnderlayProvider>
  )
}
