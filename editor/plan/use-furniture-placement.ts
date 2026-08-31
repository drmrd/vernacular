import { useCallback, type PointerEvent } from 'react'
import {
  createFurnitureInstance,
  FURNITURE_NODE_PREFIX,
  placeFurniture,
  type Point,
} from '../../core'
import type { LibraryItem } from '../../storage'
import type { EditorSession, SelectionStore } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { selectPlacedEntity } from './select-placed-entity'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

interface FurniturePlacementDeps {
  session: EditorSession
  tool: ToolId
  viewport: Viewport
  activeFloorId: string | null
  /** The library item armed for placement, or null when nothing is armed. */
  armed: LibraryItem | null
  /** The placement ghost's rotation in degrees applied to the dropped instance. */
  rotation: number
  selection: SelectionStore
}

export interface FurniturePlacement {
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

/**
 * The place-furniture tool's pointer-down: when an item is armed, drop a fresh
 * furniture instance of that item at the cursor with the active ghost rotation,
 * then stay armed so repeated clicks place more, selecting the new instance.
 * Inert under any other tool, so the wall, opening, and select flows are
 * untouched. The decisions live in the pure factory (`createFurnitureInstance`);
 * this hook only wires it, so it is coverage-excluded glue validated by the
 * place-furniture end-to-end journey.
 */
export function usePlaceFurniture(deps: FurniturePlacementDeps): FurniturePlacement {
  const { session, tool, viewport, activeFloorId, armed, rotation, selection } = deps
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool !== 'place-furniture' || armed === null || activeFloorId === null) {
        return
      }
      const position = eventToWorld(event, viewport)
      const furniture = createFurnitureInstance({
        assetRef: armed.reference,
        position,
        footprint: armed.footprint,
        height: armed.height,
        rotation,
        ...(armed.name !== '' ? { name: armed.name } : {}),
      })
      session.dispatch(placeFurniture(activeFloorId, furniture))
      selectPlacedEntity(selection, FURNITURE_NODE_PREFIX, furniture.id)
    },
    [session, tool, viewport, activeFloorId, armed, rotation, selection],
  )

  return { onPointerDown }
}
