import { useCallback, type PointerEvent } from 'react'
import type { Point } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { stairPlacementCommand } from './place-stair'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

interface StairPlacementDeps {
  session: EditorSession
  tool: ToolId
  viewport: Viewport
  activeFloorId: string | null
}

export interface StairPlacement {
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

/**
 * The place-stair tool's pointer-down: drop a default straight stair rising from
 * the active floor to the floor directly above it at the cursor. Inert under any
 * other tool and when the active floor is already the topmost, since a stair has
 * to span two floors. The decisions live in the pure builder
 * (`stairPlacementCommand`); this hook only wires it, so it is coverage-excluded
 * glue validated by the place-stair end-to-end journey.
 */
export function useStairPlacement(deps: StairPlacementDeps): StairPlacement {
  const { session, tool, viewport, activeFloorId } = deps
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool !== 'place-stair') {
        return
      }
      const world = eventToWorld(event, viewport)
      const command = stairPlacementCommand(session.getProject().floors, activeFloorId, world)
      if (command !== null) {
        session.dispatch(command)
      }
    },
    [session, tool, viewport, activeFloorId],
  )

  return { onPointerDown }
}
