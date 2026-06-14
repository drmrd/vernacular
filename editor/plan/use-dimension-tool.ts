import { useCallback, useState, type PointerEvent } from 'react'
import type { Point } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import {
  advanceDimensionTool,
  dimensionPreview,
  IDLE_DIMENSION_TOOL,
  type DimensionToolState,
} from './dimension-tool'
import type { PreviewSegment } from './draw-plan'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

interface DimensionPointerContext {
  session: EditorSession
  tool: ToolId
  toolState: DimensionToolState
  activeFloorId: string | null
}

/** The floor a new dimension lands on: the active floor, falling back to the first
 *  floor when none is active yet (a single-floor project before any switch). */
function dimensionFloorId(context: DimensionPointerContext): string | undefined {
  return context.activeFloorId ?? context.session.getProject().floors[0]?.id
}

/** Applies a dimension-tool click and returns the next state; other tools are inert here. */
function applyPointer(world: Point, context: DimensionPointerContext): DimensionToolState {
  if (context.tool !== 'dimension') {
    return context.toolState
  }
  const floorId = dimensionFloorId(context)
  if (floorId === undefined) {
    return context.toolState
  }
  const result = advanceDimensionTool(context.toolState, world, floorId)
  if (result.command) {
    context.session.dispatch(result.command)
  }
  return result.state
}

export interface DimensionToolDeps {
  session: EditorSession
  tool: ToolId
  viewport: Viewport
  // The floor a new dimension is measured on (the active floor); null before any
  // floor is selected.
  activeFloorId: string | null
}

export interface DimensionTool {
  preview: PreviewSegment | undefined
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave: () => void
}

/** Translates pointer events into dimension-tool actions and the live measuring preview. */
export function useDimensionTool({
  session,
  tool,
  viewport,
  activeFloorId,
}: DimensionToolDeps): DimensionTool {
  const [toolState, setToolState] = useState<DimensionToolState>(IDLE_DIMENSION_TOOL)
  const [pointer, setPointer] = useState<Point | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const world = eventToWorld(event, viewport)
      setToolState(applyPointer(world, { session, tool, toolState, activeFloorId }))
    },
    [session, tool, toolState, viewport, activeFloorId],
  )

  // Track the cursor only while the dimension tool is active; this drives the
  // live rubber-band preview. Other tools need neither.
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'dimension') {
        setPointer(eventToWorld(event, viewport))
      }
    },
    [tool, viewport],
  )

  const onPointerLeave = useCallback(() => {
    setPointer(null)
  }, [])

  const preview = tool === 'dimension' && pointer ? dimensionPreview(toolState, pointer) : undefined

  return { preview, onPointerDown, onPointerMove, onPointerLeave }
}
