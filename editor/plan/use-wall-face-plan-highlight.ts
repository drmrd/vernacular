import { useCallback, type PointerEvent } from 'react'
import type { SurfaceRef, WallSceneNode } from '../../core'
import { useSurfaceSelection } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { hitTestWallFace } from './hit-test-wall-face'
import { DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

interface WallFacePlanHighlightDeps {
  // The single selected wall whose inspector finish section is showing, or null
  // when the selection is not exactly one wall (so there is no A/B chip to echo onto).
  selectedWall: WallSceneNode | null
  tool: ToolId
  viewport: Viewport
}

export interface WallFacePlanHighlight {
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave: () => void
}

/**
 * The reverse half of the finish-chip live link (#343): while exactly one wall is
 * selected, hovering one of its faces on the plan highlights that face on the
 * transient highlight store, which the inspector reflects onto the matching A/B chip.
 *
 * On a miss or on leaving the canvas it restores the highlight to the wall's active
 * face (the inspector's baseline, defaulted to the left face when the wall is
 * selected), or clears it when nothing is active, so the reverse hover never fights
 * the forward chip->plan highlight or strands a band.
 *
 * Coverage-excluded glue: jsdom has no 2D Canvas, so the live pointer math is not
 * unit-testable here. The face decision is covered by the hit-test-wall-face unit
 * tests and the chip reflection by the wall-finish-section unit tests; the wired
 * behavior is exercised by the plan end-to-end specs.
 */
export function useWallFacePlanHighlight(deps: WallFacePlanHighlightDeps): WallFacePlanHighlight {
  const surfaceSelection = useSurfaceSelection()
  const { selectedWall, tool, viewport } = deps

  // Reset the transient highlight to the inspector's baseline: the wall's active
  // face when one is set, otherwise clear it so a prior hover never strands a band.
  const restoreActiveFace = useCallback(() => {
    const active = surfaceSelection.getActiveSurface()
    if (active === null) {
      surfaceSelection.clearHighlight()
      return
    }
    surfaceSelection.highlight(active)
  }, [surfaceSelection])

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (selectedWall === null || tool !== 'select' || event.buttons !== 0) {
        return
      }
      const world = screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
      const hit = hitTestWallFace([selectedWall], world, DEFAULT_HIT_TOLERANCE_MM)
      if (hit === null) {
        restoreActiveFace()
        return
      }
      const ref: SurfaceRef = { kind: 'wall-face', wallId: hit.wallId, side: hit.side }
      surfaceSelection.highlight(ref)
    },
    [selectedWall, tool, viewport, surfaceSelection, restoreActiveFace],
  )

  return { onPointerMove, onPointerLeave: restoreActiveFace }
}
