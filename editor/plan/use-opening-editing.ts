import { useCallback, useRef, type PointerEvent } from 'react'
import {
  moveOpening,
  OPENING_NODE_PREFIX,
  pointInPolygon,
  type Opening,
  type OpeningSceneNode,
  type Point,
  type Project,
  type SceneGraph,
  type Wall,
} from '../../core'
import type { EditorSession } from '../../bridge'
import { openingCorners } from './opening-geometry'
import { openingDragPosition } from './opening-drag'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

const PRIMARY_BUTTON = 0

interface OpeningEditingDeps {
  session: EditorSession
  // The single editable opening under the select tool, or null when none is.
  selectedOpening: OpeningSceneNode | null
  graph: SceneGraph
  viewport: Viewport
}

export interface OpeningEditing {
  // Returns true when the pointer-down grabbed the opening footprint and started
  // a drag, so the composition can give the drag priority over the marquee/click
  // selection, mirroring `useWallEditing.onPointerDown`.
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

// The raw opening id (without the scene-node namespace) the move command takes.
function rawOpeningId(node: OpeningSceneNode): string {
  return node.id.slice(OPENING_NODE_PREFIX.length)
}

// Resolve the dragged opening's host wall from the project so the release can
// project the cursor onto it; null when the floor, opening, or host wall is gone.
function resolveHostWall(project: Readonly<Project>, node: OpeningSceneNode): Wall | null {
  const floor = project.floors.find((candidate) => candidate.id === node.floorId)
  if (floor === undefined) {
    return null
  }
  const opening: Opening | undefined = floor.openings.find(
    (candidate) => candidate.id === rawOpeningId(node),
  )
  if (opening === undefined) {
    return null
  }
  return floor.walls.find((wall) => wall.id === opening.hostWallId) ?? null
}

// Dispatch the undoable along-wall move for the dragged opening; a missing host
// wall no-ops so a half-resolved project never dispatches a bad command.
function dispatchMove(session: EditorSession, node: OpeningSceneNode, world: Point): void {
  const hostWall = resolveHostWall(session.getProject(), node)
  if (hostWall === null) {
    return
  }
  session.dispatch(
    moveOpening(node.floorId, rawOpeningId(node), openingDragPosition(hostWall, world)),
  )
}

/**
 * The footprint-drag lifecycle for the single selected opening under the select
 * tool: a pointer-down inside the opening footprint grabs it and consumes the
 * pointer, and release dispatches an undoable `moveOpening` to the along-wall
 * position under the cursor. No live preview this slice; the dispatch lands on
 * release only. All decisions live in the pure modules (`pointInPolygon`,
 * `openingDragPosition`, `moveOpening`); this hook only wires them, so it is
 * coverage-excluded glue mirroring `useWallEditing`.
 */
export function useOpeningEditing({
  session,
  selectedOpening,
  graph,
  viewport,
}: OpeningEditingDeps): OpeningEditing {
  // The graph is read through `selectedOpening`, which the caller derives from
  // it; referenced here so the dependency stays explicit and parallel to the
  // wall-editing hook.
  void graph
  const drag = useRef<OpeningSceneNode | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): boolean => {
      if (selectedOpening === null || event.button !== PRIMARY_BUTTON) {
        return false
      }
      const world = eventToWorld(event, viewport)
      if (!pointInPolygon(world, openingCorners(selectedOpening))) {
        return false
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = selectedOpening
      return true
    },
    [selectedOpening, viewport],
  )

  const onPointerMove = useCallback((): boolean => drag.current !== null, [])

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const active = drag.current
      drag.current = null
      if (active === null) {
        return
      }
      event.currentTarget.releasePointerCapture(event.pointerId)
      dispatchMove(session, active, eventToWorld(event, viewport))
    },
    [session, viewport],
  )

  return { onPointerDown, onPointerMove, onPointerUp }
}
