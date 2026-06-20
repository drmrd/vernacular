import type { PointerEvent } from 'react'
import type { DimensionTool } from './use-dimension-tool'
import type { OpeningEditing } from './use-opening-editing'
import type { OpeningPlacement } from './use-opening-placement'
import type { OpeningResizing } from './use-opening-resizing'
import type { PlanHover } from './use-plan-hover'
import type { PlanInteraction } from './use-plan-interaction'
import type { PlanSelection } from './use-plan-selection'
import type { PlanUnderlayLayer } from './use-underlay'
import type { FurnitureEditing } from './use-furniture-editing'
import type { FurniturePlacementHandlers } from './use-furniture-layer'
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
  openingResizing: OpeningResizing
  openingEditing: OpeningEditing
  furnitureEditing: FurnitureEditing
  selectionMove: SelectionMove
  interaction: PlanInteraction
  dimensionTool: DimensionTool
  calibration: PlanUnderlayLayer['calibration']
  selection: PlanSelection
  openingPlacement: OpeningPlacement
  furniturePlacement: FurniturePlacementHandlers
  hover: PlanHover
  // Clears any standing keyboard-authoring announcement. A pointer move is a fresh
  // pointer interaction, so it supersedes a stale authoring step ("Wall vertex
  // dropped") that would otherwise keep masking the live snap/selection text.
  clearAuthoringAnnouncement: () => void
}

// The select-tool footprint grabs, in priority order: an opening jamb resize beats
// an opening move, and either beats a furniture move.
function entityPointerDown(
  sources: PointerSources,
  event: PointerEvent<HTMLCanvasElement>,
): boolean {
  return (
    sources.openingResizing.onPointerDown(event) ||
    sources.openingEditing.onPointerDown(event) ||
    sources.furnitureEditing.onPointerDown(event)
  )
}

function entityPointerMove(
  sources: PointerSources,
  event: PointerEvent<HTMLCanvasElement>,
): boolean {
  return (
    sources.openingResizing.onPointerMove(event) ||
    sources.openingEditing.onPointerMove(event) ||
    sources.furnitureEditing.onPointerMove(event)
  )
}

// The pointer-down chain: a pan or endpoint/opening/move grab consumes the press;
// otherwise calibration, the wall/dimension tools, the place-opening and
// place-furniture tools, and the selection each see it, every one inert under the
// others' tool.
function composedPointerDown(
  sources: PointerSources,
  event: PointerEvent<HTMLCanvasElement>,
): void {
  const { controls, wallEditing, selectionMove, calibration, interaction } = sources
  const { dimensionTool, openingPlacement, furniturePlacement, selection } = sources
  if (controls.onPanPointerDown(event) || wallEditing.onPointerDown(event)) return
  if (entityPointerDown(sources, event) || selectionMove.onPointerDown(event)) return
  calibration.onPointerDown(event)
  interaction.onPointerDown(event)
  dimensionTool.onPointerDown(event)
  openingPlacement.onPointerDown(event)
  furniturePlacement.onPointerDown(event)
  selection.onPointerDown(event)
}

/**
 * A pan gesture takes top priority. Next, an endpoint-drag grab, an opening jamb
 * resize grab, an opening footprint grab, or a press on the already-selected
 * entities (all only possible under the select tool) consumes the pointer so it
 * does not also start a marquee or click selection; the resize grab sits above the
 * footprint grab so a press on a jamb handle resizes rather than moves, and the
 * selection move-drag sits beneath them and above the marquee. The calibration
 * interaction runs next but is inert unless the calibrate tool is active. Otherwise
 * the wall tool, the place-opening tool, the place-furniture tool, and the
 * select-tool selection all see the pointer, each inert under the others' tool.
 */
export function composePointerHandlers(sources: PointerSources): ComposedPointerHandlers {
  const { controls, wallEditing, openingResizing, openingEditing, selectionMove } = sources
  const { interaction, dimensionTool, calibration, selection, furniturePlacement, hover } = sources
  const { furnitureEditing } = sources
  return {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => composedPointerDown(sources, event),
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
      // A pointer move supersedes any standing keyboard-authoring announcement, so a
      // fresh snap or selection reads in the live region rather than the last
      // "Wall vertex dropped". No-op (a stable empty set) when nothing is standing.
      sources.clearAuthoringAnnouncement()
      // Runs before the guards: hover self-gates on event.buttons, so the highlight
      // always updates regardless of which handler below claims the rest of the move.
      hover.onPointerMove(event)
      // The placement ghost tracks the cursor; it self-gates on the place-furniture tool.
      furniturePlacement.onPointerMove(event)
      if (controls.onPanPointerMove(event) || wallEditing.onPointerMove(event)) return
      if (entityPointerMove(sources, event) || selectionMove.onPointerMove(event)) return
      calibration.onPointerMove(event)
      interaction.onPointerMove(event)
      dimensionTool.onPointerMove(event)
      selection.onPointerMove(event)
    },
    onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => {
      controls.onPanPointerUp(event)
      wallEditing.onPointerUp(event)
      openingResizing.onPointerUp(event)
      openingEditing.onPointerUp(event)
      furnitureEditing.onPointerUp(event)
      if (selectionMove.onPointerUp(event)) return
      selection.onPointerUp(event)
    },
    onDoubleClick: interaction.onDoubleClick,
    // Clear the wall-tool, dimension-tool, and calibration cursors on leave.
    onPointerLeave: () => {
      interaction.onPointerLeave()
      dimensionTool.onPointerLeave()
      calibration.onPointerLeave()
      hover.onPointerLeave()
    },
  }
}
