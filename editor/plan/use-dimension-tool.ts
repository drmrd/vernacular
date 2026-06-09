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
}

/** Applies a dimension-tool click and returns the next state; other tools are inert here. */
function applyPointer(world: Point, context: DimensionPointerContext): DimensionToolState {
  if (context.tool !== 'dimension') {
    return context.toolState
  }
  const floorId = context.session.getProject().floors[0]?.id
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
}

export interface DimensionTool {
  preview: PreviewSegment | undefined
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave: () => void
}

/** Translates pointer events into dimension-tool actions and the live measuring preview. */
export function useDimensionTool({ session, tool, viewport }: DimensionToolDeps): DimensionTool {
  const [toolState, setToolState] = useState<DimensionToolState>(IDLE_DIMENSION_TOOL)
  const [pointer, setPointer] = useState<Point | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const world = eventToWorld(event, viewport)
      setToolState(applyPointer(world, { session, tool, toolState }))
    },
    [session, tool, toolState, viewport],
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
