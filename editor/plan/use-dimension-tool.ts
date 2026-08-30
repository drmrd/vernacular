import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Point } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import {
  advanceDimensionTool,
  cancelDimensionTool,
  dimensionPreview,
  IDLE_DIMENSION_TOOL,
  type DimensionToolState,
} from './dimension-tool'
import type { PreviewSegment } from './draw-plan'
import { claimKeystroke, ownsKeystroke } from './keyboard-guard'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

const ESCAPE_KEY = 'Escape'

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

interface DimensionCancelDeps {
  tool: ToolId
  toolState: DimensionToolState
  setToolState: (state: DimensionToolState) => void
}

/**
 * The ladder's first rung for the pointer half of the tool: Escape abandons a
 * measurement whose start point is already down, claims the keystroke so the tool
 * stays armed, and leaves an Escape at rest to the rung that returns to select.
 *
 * The measurement is read through a ref refreshed every render, so the window
 * listener subscribes once per tool change rather than on every render. A
 * render-scoped subscription would re-add the listener mid-keystroke whenever a
 * sibling hook updates state inside the same keydown, and the DOM drops a listener
 * re-added during dispatch, which would swallow the cancel. This mirrors
 * useWallKeyboard. setToolState comes from useState, so it is stable and never
 * re-subscribes.
 */
function useDimensionCancel({ tool, toolState, setToolState }: DimensionCancelDeps): void {
  const measurementRef = useRef(toolState)
  measurementRef.current = toolState
  useEffect(() => {
    if (tool !== 'dimension') {
      return undefined
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (ownsKeystroke(event.target, event.key) || event.key !== ESCAPE_KEY) {
        return
      }
      const measurement = measurementRef.current
      if (measurement.phase !== 'measuring') {
        return
      }
      claimKeystroke(event)
      setToolState(cancelDimensionTool(measurement))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [tool, setToolState])
}

interface DiscardOnLeaveDeps {
  tool: ToolId
  setToolState: (state: DimensionToolState) => void
  setPointer: (point: Point | null) => void
}

/**
 * A measurement does not outlive the tool that took it. Leaving the dimension tool
 * discards the half-taken start and the cursor it was tracking, so the next arm
 * begins clean instead of pairing a start the user walked away from with the first
 * click of the next measurement. Both setters come from useState, so they are
 * stable and the tool change is the only thing that runs this.
 */
function useDiscardOnLeave({ tool, setToolState, setPointer }: DiscardOnLeaveDeps): void {
  useEffect(() => {
    if (tool !== 'dimension') {
      setToolState(IDLE_DIMENSION_TOOL)
      setPointer(null)
    }
  }, [tool, setToolState, setPointer])
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
  useDimensionCancel({ tool, toolState, setToolState })
  useDiscardOnLeave({ tool, setToolState, setPointer })

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
