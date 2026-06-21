import { useCallback, type PointerEvent } from 'react'
import {
  createOpening,
  openingWouldOverlap,
  placeOpening,
  type Point,
  type SceneGraph,
} from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { placeOpeningTarget } from './place-opening'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

interface OpeningPlacementDeps {
  session: EditorSession
  graph: SceneGraph
  tool: ToolId
  viewport: Viewport
  /** The element-type id placed on the next click. */
  placementType: string
}

export interface OpeningPlacement {
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

/**
 * The place-opening tool's pointer-down: hit-test the click against the nearest
 * wall within tolerance and, on a hit, dispatch a `placeOpening` for a freshly
 * created opening of the active placement type hosted by that wall. Inert under
 * any other tool, so the wall-drawing and select flows are untouched. All
 * decisions live in the pure modules (`placeOpeningTarget`, `createOpening`);
 * this hook only wires them, so it is coverage-excluded glue.
 */
export function useOpeningPlacement(deps: OpeningPlacementDeps): OpeningPlacement {
  const { session, graph, tool, viewport, placementType } = deps
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool !== 'place-opening') {
        return
      }
      const world = eventToWorld(event, viewport)
      const target = placeOpeningTarget(graph, world, DEFAULT_HIT_TOLERANCE_MM)
      if (target === null) {
        return
      }
      const opening = createOpening({
        type: placementType,
        hostWallId: target.hostWallId,
        position: target.position,
      })
      const existingOpenings =
        session.getProject().floors.find((floor) => floor.id === target.floorId)?.openings ?? []
      if (openingWouldOverlap(opening, existingOpenings)) {
        return
      }
      session.dispatch(placeOpening(target.floorId, opening))
    },
    [session, graph, tool, viewport, placementType],
  )

  return { onPointerDown }
}
