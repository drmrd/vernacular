import { useCallback, useEffect, useState } from 'react'
import { type Point, type SceneGraph } from '../../core'
import type { LibraryItem } from '../../storage'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { isTextEntry } from './keyboard-guard'
import { IDLE_WALL_TOOL, type WallToolState } from './wall-tool'
import { IDLE_DIMENSION_TOOL, type DimensionToolState } from './dimension-tool'
import {
  handleDimensionKey,
  handleFurnitureKey,
  handleOpeningKey,
  handleWallKey,
  type AuthoringRun,
  type DimensionKeyContext,
  type WallKeyContext,
} from './authoring-tool-handlers'

// The keyboard authoring run seeds its candidate at the world origin when no
// viewport is supplied, so the candidate is reachable before any pointer move.
const ORIGIN: Point = { x: 0, y: 0 }

export interface PlanAuthoringDeps {
  session: EditorSession
  tool: ToolId
  activeFloorId: string | null
  /** Wall graph the opening branch projects the candidate onto via placeOpeningTarget. */
  graph?: SceneGraph
  /** Element-type id the opening branch places (e.g. 'single-swing-door'). */
  placementType?: string
  /** The library item armed for placement the furniture branch drops, or null. */
  armed?: LibraryItem | null
  /** The ghost rotation in degrees applied to a dropped furniture instance. */
  rotation?: number
}

export interface PlanAuthoringResult {
  candidate: Point
  announcement: string
  // A pointer move calls this so a fresh snap/selection announcement is not
  // permanently masked by a stale keyboard-authoring step: the live region
  // otherwise keeps prioritizing the non-empty authoring announcement.
  clearAnnouncement: () => void
}

// Only the creative tools that drop free points on the canvas are wired here.
type AuthoringTool = 'draw-wall' | 'dimension' | 'place-opening' | 'place-furniture'

function isAuthoringTool(tool: ToolId): tool is AuthoringTool {
  return (
    tool === 'draw-wall' ||
    tool === 'dimension' ||
    tool === 'place-opening' ||
    tool === 'place-furniture'
  )
}

// The full set of per-tool state and graph the window listener routes a
// keystroke into, threaded as one object so the hook body stays lean.
interface AuthoringTools {
  tool: ToolId
  run: AuthoringRun
  wallState: WallKeyContext['toolState']
  setWallState: WallKeyContext['setToolState']
  dimensionState: DimensionKeyContext['toolState']
  setDimensionState: DimensionKeyContext['setToolState']
  graph: SceneGraph | undefined
  placementType: string | undefined
  armed: LibraryItem | null
  rotation: number
}

// Install the window keydown listener that routes a keystroke to the active
// tool, with cleanup. Kept out of the hook body so usePlanAuthoring stays lean.
function listenForAuthoringKeys(tools: AuthoringTools): () => void {
  const listener = (event: KeyboardEvent): void => {
    if (!isTextEntry(event.target)) {
      routeAuthoringKey(tools, event)
    }
  }
  window.addEventListener('keydown', listener)
  return () => {
    window.removeEventListener('keydown', listener)
  }
}

// Route one keystroke to the active tool's handler, building that handler's
// context inline. Each authoring tool names its own branch explicitly and an
// unhandled tool does nothing, so a new tool (e.g. furniture) adds its own case
// without inheriting another tool's branch as an accidental fallback. Each handler
// runs its own arrow-nudge prologue, so this only picks the branch by tool.
function routeAuthoringKey(tools: AuthoringTools, event: KeyboardEvent): void {
  const { run } = tools
  switch (tools.tool) {
    case 'draw-wall':
      handleWallKey({ ...run, event, toolState: tools.wallState, setToolState: tools.setWallState })
      return
    case 'place-opening':
      handleOpeningKey({ ...run, event, graph: tools.graph, placementType: tools.placementType })
      return
    case 'dimension':
      handleDimensionKey({
        ...run,
        event,
        toolState: tools.dimensionState,
        setToolState: tools.setDimensionState,
      })
      return
    case 'place-furniture':
      handleFurnitureKey({ ...run, event, armed: tools.armed, rotation: tools.rotation })
      return
    default:
      return
  }
}

/**
 * Binds the creative-tool authoring keystrokes to the window. While the
 * draw-wall or dimension tool is active, arrow keys nudge a keyboard-reachable
 * candidate point by a grid step and Enter drops a wall vertex or a dimension
 * endpoint at the candidate by dispatching the same commands the pointer path
 * dispatches. Inert under any other tool and ignored while a form control is
 * focused, mirroring the selection and furniture keyboard hooks.
 */
export function usePlanAuthoring(deps: PlanAuthoringDeps): PlanAuthoringResult {
  const { session, tool, activeFloorId, graph, placementType } = deps
  const armed = deps.armed ?? null
  const rotation = deps.rotation ?? 0
  const [candidate, setCandidate] = useState<Point>(ORIGIN)
  const [wallToolState, setWallToolState] = useState<WallToolState>(IDLE_WALL_TOOL)
  const [dimensionToolState, setDimensionToolState] =
    useState<DimensionToolState>(IDLE_DIMENSION_TOOL)
  const [announcement, setAnnouncement] = useState('')
  const clearAnnouncement = useCallback(() => setAnnouncement(''), [])

  useEffect(() => {
    if (!isAuthoringTool(tool)) {
      return undefined
    }
    return listenForAuthoringKeys({
      tool,
      run: { session, activeFloorId, candidate, setCandidate, setAnnouncement },
      wallState: wallToolState,
      setWallState: setWallToolState,
      dimensionState: dimensionToolState,
      setDimensionState: setDimensionToolState,
      graph,
      placementType,
      armed,
      rotation,
    })
  }, [
    session,
    tool,
    activeFloorId,
    candidate,
    wallToolState,
    dimensionToolState,
    graph,
    placementType,
    armed,
    rotation,
  ])

  return { candidate, announcement, clearAnnouncement }
}
