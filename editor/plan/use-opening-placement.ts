import { useCallback, type PointerEvent } from 'react'
import {
  createOpening,
  OPENING_NODE_PREFIX,
  openingWouldOverlap,
  placeOpening,
  type Point,
  type SceneGraph,
} from '../../core'
import type { EditorSession, SelectionStore } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { useOpeningTool } from './opening-tool-context'
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
  selection: SelectionStore
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
 * any other tool, so the wall-drawing and select flows are untouched. A click that
 * places nothing reports why through the placement context, so the refusal reaches
 * the overlay instead of looking like a click that never registered. The decisions
 * live in the pure modules (`placeOpeningTarget`, `createOpening`,
 * `openingWouldOverlap`); this hook only wires them.
 */
export function useOpeningPlacement(deps: OpeningPlacementDeps): OpeningPlacement {
  const { session, graph, tool, viewport, placementType, selection } = deps
  const { setPlacementRefusal } = useOpeningTool()
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool !== 'place-opening') {
        return
      }
      const world = eventToWorld(event, viewport)
      const target = placeOpeningTarget(graph, world, DEFAULT_HIT_TOLERANCE_MM)
      if (target === null) {
        setPlacementRefusal('no-host-wall')
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
        setPlacementRefusal('opening-overlap')
        return
      }
      setPlacementRefusal(null)
      session.dispatch(placeOpening(target.floorId, opening))
      // Selection is bridge-owned and outside undo history (ADR-0020); selecting the
      // just-placed opening here, rather than through the command, shows it in the
      // inspector without adding an undo step or disarming the placement tool.
      selection.select(`${OPENING_NODE_PREFIX}${opening.id}`)
    },
    [session, graph, tool, viewport, placementType, selection, setPlacementRefusal],
  )

  return { onPointerDown }
}
