import { useCallback, useRef, type PointerEvent } from 'react'
import { moveFurniture, pointInPolygon, type FurnitureInstance, type Point } from '../../core'
import type { EditorSession } from '../../bridge'
import { furnitureSymbol } from './draw-furniture'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

const PRIMARY_BUTTON = 0

interface FurnitureEditingDeps {
  session: EditorSession
  // The single editable furniture under the select tool, or null when none is.
  selectedFurniture: FurnitureInstance | null
  // The floor the move targets (the active floor); null before any floor is selected.
  activeFloorId: string | null
  viewport: Viewport
}

export interface FurnitureEditing {
  // Returns true when the pointer-down grabbed the furniture footprint and started
  // a drag, so the composition can give the drag priority over the marquee/click
  // selection, mirroring useOpeningEditing.onPointerDown.
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

// The instance grabbed for the move and the world point the grab began at, so the
// release can translate the instance by the cursor's displacement.
interface FurnitureDrag {
  instance: FurnitureInstance
  grab: Point
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

// The instance's new center after the drag, or null when the cursor did not move
// (a bare click on the selected piece must not dispatch a no-op move command).
function movedPosition(drag: FurnitureDrag, world: Point): Point | null {
  const delta = { x: world.x - drag.grab.x, y: world.y - drag.grab.y }
  if (delta.x === 0 && delta.y === 0) {
    return null
  }
  return { x: drag.instance.position.x + delta.x, y: drag.instance.position.y + delta.y }
}

/**
 * The footprint-drag lifecycle for the single selected furniture under the select
 * tool: a pointer-down inside the footprint grabs it and consumes the pointer, and
 * release dispatches an undoable `moveFurniture` translating the instance by the
 * cursor's displacement from the grab point. No live preview this slice; the
 * dispatch lands on release only. All decisions live in the pure modules
 * (`pointInPolygon`, `furnitureSymbol`, `moveFurniture`); this hook only wires
 * them, so it is coverage-excluded glue mirroring useOpeningEditing.
 */
export function useFurnitureEditing(deps: FurnitureEditingDeps): FurnitureEditing {
  const { session, selectedFurniture, activeFloorId, viewport } = deps
  const drag = useRef<FurnitureDrag | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): boolean => {
      if (selectedFurniture === null || event.button !== PRIMARY_BUTTON) {
        return false
      }
      const world = eventToWorld(event, viewport)
      if (!pointInPolygon(world, furnitureSymbol(selectedFurniture).corners)) {
        return false
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { instance: selectedFurniture, grab: world }
      return true
    },
    [selectedFurniture, viewport],
  )

  const onPointerMove = useCallback((): boolean => drag.current !== null, [])

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const active = drag.current
      drag.current = null
      if (active === null || activeFloorId === null) {
        return
      }
      event.currentTarget.releasePointerCapture(event.pointerId)
      const position = movedPosition(active, eventToWorld(event, viewport))
      if (position === null) {
        return
      }
      session.dispatch(moveFurniture(activeFloorId, active.instance.id, position))
    },
    [session, activeFloorId, viewport],
  )

  return { onPointerDown, onPointerMove, onPointerUp }
}
