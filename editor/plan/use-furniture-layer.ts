import { useCallback, useState, type PointerEvent } from 'react'
import { createFurnitureInstance, type FurnitureInstance, type Point } from '../../core'
import type { LibraryItem } from '../../storage'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import type { DrawableFurniture } from './draw-furniture'
import { toDrawableFurniture } from './drawable-furniture'
import { useFurniturePlacement } from './furniture-placement-context'
import { usePlaceFurniture } from './use-furniture-placement'
import { furnitureGhostAt } from './place-furniture'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

// A stable id for the transient placement ghost; it never enters the project.
const FURNITURE_GHOST_ID = '__furniture-ghost__'

export interface FurnitureLayerDeps {
  session: EditorSession
  tool: ToolId
  viewport: Viewport
  activeFloorId: string | null
  furniture: readonly FurnitureInstance[]
  selectedIds: ReadonlySet<string>
}

export interface FurniturePlacementHandlers {
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
}

export interface FurnitureLayer {
  // The placed furniture drawables plus the live placement ghost, when armed.
  drawables: readonly DrawableFurniture[]
  placement: FurniturePlacementHandlers
}

interface GhostInputs {
  armed: LibraryItem | null
  rotation: number
  cursor: Point | null
  tool: ToolId
}

/** Build the transient ghost drawable that tracks the cursor while an item is armed, or null when it should not paint. */
function ghostDrawable({ armed, rotation, cursor, tool }: GhostInputs): DrawableFurniture | null {
  if (armed === null || cursor === null || tool !== 'place-furniture') {
    return null
  }
  const ghost = furnitureGhostAt(cursor, rotation, armed.footprint)
  const instance = createFurnitureInstance({
    id: FURNITURE_GHOST_ID,
    assetRef: armed.reference,
    position: ghost.position,
    rotation: ghost.rotation,
    footprint: ghost.footprint,
    ...(armed.name !== '' ? { name: armed.name } : {}),
  })
  return { instance, selected: false }
}

/**
 * Bundles the furniture concerns the plan controller threads in: the drawables
 * for the placed pieces and the live placement ghost, plus the place-furniture
 * pointer handlers. The armed item and ghost rotation come from the shared
 * furniture-placement context; the cursor point is tracked locally so the ghost
 * follows the pointer. Coverage-excluded glue like the layer it parallels.
 */
export function useFurnitureLayer(deps: FurnitureLayerDeps): FurnitureLayer {
  const { session, tool, viewport, activeFloorId, furniture, selectedIds } = deps
  const { armed, rotation } = useFurniturePlacement()
  const [cursor, setCursor] = useState<Point | null>(null)
  const placement = usePlaceFurniture({ session, tool, viewport, activeFloorId, armed, rotation })
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool !== 'place-furniture' || armed === null) {
        return
      }
      setCursor(screenToWorld(eventToCanvas(event, event.currentTarget), viewport))
    },
    [tool, armed, viewport],
  )
  const placed = toDrawableFurniture(furniture, selectedIds)
  const ghost = ghostDrawable({ armed, rotation, cursor, tool })
  const drawables = ghost === null ? placed : [...placed, ghost]
  return { drawables, placement: { onPointerDown: placement.onPointerDown, onPointerMove } }
}
