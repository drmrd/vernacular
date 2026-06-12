import type { PointerEvent } from 'react'
import type { DimensionTool } from './use-dimension-tool'
import type { OpeningEditing } from './use-opening-editing'
import type { OpeningPlacement } from './use-opening-placement'
import type { PlanInteraction } from './use-plan-interaction'
import type { PlanSelection } from './use-plan-selection'
import type { PlanUnderlayLayer } from './use-underlay'
import type { SelectionMove } from './use-selection-move'
import type { ViewportControls } from './use-viewport-controls'
import type { WallEditing } from './use-wall-editing'

export interface ComposedPointerHandlers {
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
  onDoubleClick: () => void
  onPointerLeave: () => void
}

export interface PointerSources {
  controls: ViewportControls
  wallEditing: WallEditing
  openingEditing: OpeningEditing
  selectionMove: SelectionMove
  interaction: PlanInteraction
  dimensionTool: DimensionTool
  calibration: PlanUnderlayLayer['calibration']
  selection: PlanSelection
  openingPlacement: OpeningPlacement
}

/**
 * A pan gesture takes top priority. Next, an endpoint-drag grab, an opening
 * footprint grab, or a press on the already-selected entities (all only possible
 * under the select tool) consumes the pointer so it does not also start a marquee
 * or click selection; the selection move-drag sits just beneath the endpoint and
 * opening drags and above the marquee. The calibration interaction runs next but
 * is inert unless the calibrate tool is active. Otherwise the wall tool, the
 * place-opening tool, and the select-tool selection all see the pointer, each
 * inert under the others' tool.
 */
export function composePointerHandlers(sources: PointerSources): ComposedPointerHandlers {
  const { controls, wallEditing, openingEditing, selectionMove, interaction } = sources
  const { dimensionTool, calibration, selection, openingPlacement } = sources
  return {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerDown(event) || wallEditing.onPointerDown(event)) return
      if (openingEditing.onPointerDown(event) || selectionMove.onPointerDown(event)) return
      calibration.onPointerDown(event)
      interaction.onPointerDown(event)
      dimensionTool.onPointerDown(event)
      openingPlacement.onPointerDown(event)
      selection.onPointerDown(event)
    },
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerMove(event) || wallEditing.onPointerMove(event)) return
      if (openingEditing.onPointerMove(event) || selectionMove.onPointerMove(event)) return
      calibration.onPointerMove(event)
      interaction.onPointerMove(event)
      dimensionTool.onPointerMove(event)
      selection.onPointerMove(event)
    },
    onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => {
      controls.onPanPointerUp(event)
      wallEditing.onPointerUp(event)
      openingEditing.onPointerUp(event)
      if (selectionMove.onPointerUp(event)) return
      selection.onPointerUp(event)
    },
    onDoubleClick: interaction.onDoubleClick,
    // Clear the wall-tool, dimension-tool, and calibration cursors on leave.
    onPointerLeave: () => {
      interaction.onPointerLeave()
      dimensionTool.onPointerLeave()
      calibration.onPointerLeave()
    },
  }
}
