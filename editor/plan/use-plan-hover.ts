import { useState, type PointerEvent } from 'react'
import type { SceneGraph } from '../../core'
import type { ToolId } from '../tools/active-tool-context'
import { hoverTarget } from './hover-target'
import { DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

interface PlanHoverDeps {
  graph: SceneGraph
  selectedIds: ReadonlySet<string>
  tool: ToolId
  viewport: Viewport
}

export interface PlanHover {
  hoveredId: string | undefined
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave: () => void
}

/**
 * Tracks the Select-mode hover highlight from live pointer movement: at rest over
 * the select tool it resolves the entity a click would pick (`hoverTarget`) and
 * feeds the renderer's `hoveredId`. Any button down means a drag is in progress, so
 * the hover self-gates off until the button releases and the pointer moves again.
 * Coverage-excluded glue validated by the hover-preview end-to-end spec, since
 * jsdom has no 2D Canvas.
 */
export function usePlanHover(deps: PlanHoverDeps): PlanHover {
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined)
  return {
    hoveredId,
    onPointerMove: (event) => {
      if (deps.tool !== 'select' || event.buttons !== 0) {
        setHoveredId(undefined)
        return
      }
      const world = screenToWorld(eventToCanvas(event, event.currentTarget), deps.viewport)
      setHoveredId(
        hoverTarget(deps.graph, world, DEFAULT_HIT_TOLERANCE_MM, deps.selectedIds) ?? undefined,
      )
    },
    onPointerLeave: () => setHoveredId(undefined),
  }
}
