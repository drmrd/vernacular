import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react'
import {
  clampOpeningResizeJamb,
  distance,
  MIN_OPENING_WIDTH_MM,
  WALL_NODE_PREFIX,
  resizeOpeningEdge,
  type Opening,
  type OpeningSceneNode,
  type Point,
  type Project,
  type SceneGraph,
  type UnitPreferences,
  type WallSceneNode,
} from '../../core'
import type { EditorSession } from '../../bridge'
import { lengthReadout, type DragReadout } from './drag-readout'
import { projectPointOntoWall, rawOpeningId } from './opening-geometry'
import {
  computeOpeningResize,
  pickOpeningResizeHandle,
  snapJambToWallEnd,
  type OpeningResize,
  type OpeningResizeEdge,
} from './opening-resize'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

const PRIMARY_BUTTON = 0
// A generous grab radius around a jamb handle, in screen pixels, converted to a world
// tolerance so it stays a fixed on-screen target across zoom. It doubles as the
// snap-to-wall-end tolerance, matching the wall-editing handle grab.
const HANDLE_GRAB_PIXELS = 10

interface OpeningResizingDeps {
  session: EditorSession
  // The single editable opening under the select tool, or null when none is.
  selectedOpening: OpeningSceneNode | null
  graph: SceneGraph
  viewport: Viewport
  preferences: UnitPreferences
}

export interface OpeningResizing {
  // The dragged opening's live width readout pill, anchored at the cursor while a
  // jamb drag is in progress, or undefined otherwise.
  readout: DragReadout | undefined
  // Returns true when the pointer-down grabbed a jamb handle and started a resize,
  // so the composition gives it priority over the opening footprint drag.
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => boolean
  // Returns true while a jamb resize is in progress and consumed the move.
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

// The opening's host wall in the scene graph (its full start-to-end span), matched by
// the opening's host wall id; null when the opening has no host or it is gone.
function findHostWall(graph: SceneGraph, opening: OpeningSceneNode): WallSceneNode | null {
  if (opening.hostWallId === undefined) {
    return null
  }
  return (
    graph.walls.find((wall) => wall.id.slice(WALL_NODE_PREFIX.length) === opening.hostWallId) ??
    null
  )
}

interface DragState {
  opening: OpeningSceneNode
  hostWall: WallSceneNode
  edge: OpeningResizeEdge
  // The dragged opening's persisted model and its floor's openings, captured at
  // grab time so the live resize can clamp the jamb against same-wall neighbors.
  // `model` is null only when the opening is gone from the project.
  model: Opening | null
  siblings: readonly Opening[]
}

interface ResizeControl {
  drag: RefObject<DragState | null>
  setReadout: Dispatch<SetStateAction<DragReadout | undefined>>
  session: EditorSession
  viewport: Viewport
  preferences: UnitPreferences
}

// The dragged opening's persisted model and the openings on its floor, looked up by
// the opening's raw id; a null model and empty siblings when the floor or opening is gone.
function resolveResizeModel(
  project: Readonly<Project>,
  node: OpeningSceneNode,
): { model: Opening | null; siblings: readonly Opening[] } {
  const floor = project.floors.find((candidate) => candidate.id === node.floorId)
  const model = floor?.openings.find((candidate) => candidate.id === rawOpeningId(node)) ?? null
  return { model, siblings: floor?.openings ?? [] }
}

// The clamped, snapped resize for the cursor: project the cursor onto the host wall to
// find the dragged jamb, snap it to a wall end, clamp it so the resized span cannot
// overlap a same-wall neighbor, and recompute the width and center with the opposite
// jamb fixed. The opening's current center projects to its along-wall position.
function resolveResize(drag: DragState, world: Point, viewport: Viewport): OpeningResize {
  const { opening, hostWall, edge, model, siblings } = drag
  const wallLength = distance(hostWall.start, hostWall.end)
  const rawJamb = projectPointOntoWall(hostWall.start, hostWall.end, world)
  const snapped = snapJambToWallEnd(rawJamb, wallLength, HANDLE_GRAB_PIXELS / viewport.scale)
  const guardedJamb =
    model === null ? snapped : clampOpeningResizeJamb(model, edge, snapped, siblings)
  const position = projectPointOntoWall(hostWall.start, hostWall.end, opening.center)
  return computeOpeningResize({
    edge,
    draggedJambPosition: guardedJamb,
    width: opening.width,
    position,
    wallLength,
    minWidth: MIN_OPENING_WIDTH_MM,
  })
}

/** A jamb-handle grab: pick a jamb of the selected opening and begin the resize, reporting whether it grabbed. */
function useResizeGrab(
  selectedOpening: OpeningSceneNode | null,
  graph: SceneGraph,
  control: ResizeControl,
): (event: PointerEvent<HTMLCanvasElement>) => boolean {
  const { drag, session, viewport } = control
  return useCallback(
    (event: PointerEvent<HTMLCanvasElement>): boolean => {
      if (selectedOpening === null || event.button !== PRIMARY_BUTTON) {
        return false
      }
      const hostWall = findHostWall(graph, selectedOpening)
      const world = eventToWorld(event, viewport)
      const tolerance = HANDLE_GRAB_PIXELS / viewport.scale
      const edge = pickOpeningResizeHandle(selectedOpening, world, tolerance)
      if (hostWall === null || edge === null) {
        return false
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      const { model, siblings } = resolveResizeModel(session.getProject(), selectedOpening)
      drag.current = { opening: selectedOpening, hostWall, edge, model, siblings }
      return true
    },
    [selectedOpening, graph, session, drag, viewport],
  )
}

/** Read the live width near the cursor while a jamb resize is in progress. */
function useResizeMove(
  control: ResizeControl,
): (event: PointerEvent<HTMLCanvasElement>) => boolean {
  const { drag, setReadout, viewport, preferences } = control
  return useCallback(
    (event: PointerEvent<HTMLCanvasElement>): boolean => {
      const active = drag.current
      if (active === null) {
        return false
      }
      const world = eventToWorld(event, viewport)
      setReadout(lengthReadout(world, resolveResize(active, world, viewport).width, preferences))
      return true
    },
    [drag, setReadout, viewport, preferences],
  )
}

/** Release: clear the drag and dispatch an undoable resize from the cursor's final jamb position. */
function useResizeRelease(
  control: ResizeControl,
): (event: PointerEvent<HTMLCanvasElement>) => void {
  const { drag, setReadout, session, viewport } = control
  return useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const active = drag.current
      drag.current = null
      setReadout(undefined)
      if (active === null) {
        return
      }
      event.currentTarget.releasePointerCapture(event.pointerId)
      const resize = resolveResize(active, eventToWorld(event, viewport), viewport)
      const openingId = rawOpeningId(active.opening)
      session.dispatch(
        resizeOpeningEdge(active.opening.floorId, openingId, resize.width, resize.position),
      )
    },
    [session, drag, setReadout, viewport],
  )
}

/**
 * The jamb-resize lifecycle for the single selected opening under the select tool: a
 * pointer-down on a jamb handle grabs that jamb, motion clamps and snaps the dragged
 * jamb and reads the live width near the cursor, and release dispatches an undoable
 * `resizeOpeningEdge`. The decision logic lives in the pure modules
 * (`pickOpeningResizeHandle`, `computeOpeningResize`, `snapJambToWallEnd`); this hook
 * only wires them, so it is coverage-excluded glue mirroring `useWallEditing`.
 */
export function useOpeningResizing({
  session,
  selectedOpening,
  graph,
  viewport,
  preferences,
}: OpeningResizingDeps): OpeningResizing {
  const drag = useRef<DragState | null>(null)
  const [readout, setReadout] = useState<DragReadout | undefined>(undefined)
  const control: ResizeControl = { drag, setReadout, session, viewport, preferences }
  const onPointerDown = useResizeGrab(selectedOpening, graph, control)
  const onPointerMove = useResizeMove(control)
  const onPointerUp = useResizeRelease(control)
  return { readout, onPointerDown, onPointerMove, onPointerUp }
}
