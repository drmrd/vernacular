import { useCallback, useRef, type PointerEvent } from 'react'
import { pointInPolygon, type Point, type StairSceneNode } from '../../core'
import type { EditorSession } from '../../bridge'
import { stairFootprintCorners } from './draw-stair'
import { stairMoveCommand } from './move-stair'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

const PRIMARY_BUTTON = 0

interface StairEditingDeps {
  session: EditorSession
  // The single editable stair under the select tool, or null when none is.
  selectedStair: StairSceneNode | null
  viewport: Viewport
}

export interface StairEditing {
  // Returns true when the pointer-down grabbed the stair footprint and started a
  // drag, so the composition can give the drag priority over the marquee/click
  // selection, mirroring useFurnitureEditing.onPointerDown.
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

// The stair grabbed for the move and the world point the grab began at, so the
// release can translate the run by the cursor's displacement.
interface StairDrag {
  stair: StairSceneNode
  grab: Point
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

/**
 * The footprint-drag lifecycle for the single selected stair under the select
 * tool: a pointer-down inside the footprint grabs it and consumes the pointer,
 * and release dispatches an undoable `moveStair` translating the run by the
 * cursor's displacement from the grab point. No live preview, matching the
 * furniture drag. All decisions live in the pure modules (`pointInPolygon`,
 * `stairFootprintCorners`, `stairMoveCommand`); this hook only wires them, so it
 * is coverage-excluded glue mirroring useFurnitureEditing.
 */
export function useStairEditing(deps: StairEditingDeps): StairEditing {
  const { session, selectedStair, viewport } = deps
  const drag = useRef<StairDrag | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): boolean => {
      if (selectedStair === null || event.button !== PRIMARY_BUTTON) {
        return false
      }
      const world = eventToWorld(event, viewport)
      if (!pointInPolygon(world, stairFootprintCorners(selectedStair))) {
        return false
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { stair: selectedStair, grab: world }
      return true
    },
    [selectedStair, viewport],
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
      const command = stairMoveCommand(active.stair, active.grab, eventToWorld(event, viewport))
      if (command === null) {
        return
      }
      session.dispatch(command)
    },
    [session, viewport],
  )

  return { onPointerDown, onPointerMove, onPointerUp }
}
