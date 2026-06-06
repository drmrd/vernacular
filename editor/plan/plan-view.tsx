import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { Point } from '../../core'
import {
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSelectionIds,
  type EditorSession,
} from '../../bridge'
import { useActiveTool, type ToolId } from '../tools/active-tool-context'
import { drawPlan, type DrawPlanOptions, type PreviewSegment } from './draw-plan'
import type { Bounds } from './fit'
import { usePlanSelection, type PlanSelection } from './use-plan-selection'
import {
  eventToCanvas,
  useFitToContent,
  useViewportControls,
  type ViewportControls,
} from './use-viewport-controls'
import { screenToWorld, DEFAULT_PLAN_SCALE, type Viewport } from './viewport'
import {
  advanceWallTool,
  IDLE_WALL_TOOL,
  wallPreviewSegment,
  type WallToolState,
} from './wall-tool'

const PLAN_WIDTH = 800
const PLAN_HEIGHT = 600
const PLAN_SIZE = { width: PLAN_WIDTH, height: PLAN_HEIGHT }

interface PointerContext {
  session: EditorSession
  tool: ToolId
  toolState: WallToolState
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

/** Applies a wall-tool click and returns the next wall-tool state; other tools are inert here. */
function applyPointer(world: Point, context: PointerContext): WallToolState {
  if (context.tool !== 'draw-wall') {
    return context.toolState
  }
  const floorId = context.session.getProject().floors[0]?.id
  if (floorId === undefined) {
    return context.toolState
  }
  const result = advanceWallTool(context.toolState, world, floorId)
  if (result.command) {
    context.session.dispatch(result.command)
  }
  return result.state
}

interface PlanInteractionDeps {
  session: EditorSession
  tool: ToolId
  viewport: Viewport
}

interface PlanInteraction {
  preview: PreviewSegment | undefined
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave: () => void
}

/** Translates pointer events into wall-tool actions and the live preview segment. */
function usePlanInteraction({ session, tool, viewport }: PlanInteractionDeps): PlanInteraction {
  const [toolState, setToolState] = useState<WallToolState>(IDLE_WALL_TOOL)
  const [pointer, setPointer] = useState<Point | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const context = { session, tool, toolState }
      setToolState(applyPointer(eventToWorld(event, viewport), context))
    },
    [session, tool, toolState, viewport],
  )

  // Track the cursor only while the wall tool is active; this drives the live
  // rubber-band preview. The select tool needs no per-move redraws.
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'draw-wall') {
        setPointer(eventToWorld(event, viewport))
      }
    },
    [tool, viewport],
  )

  const onPointerLeave = useCallback(() => setPointer(null), [])

  const preview =
    tool === 'draw-wall' && pointer ? wallPreviewSegment(toolState, pointer) : undefined

  return { preview, onPointerDown, onPointerMove, onPointerLeave }
}

interface ComposedPointerHandlers {
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

interface PointerSources {
  controls: ViewportControls
  interaction: PlanInteraction
  selection: PlanSelection
}

/** A pan gesture takes priority; otherwise the wall tool and the select tool both see the pointer (each is inert under the other's tool). */
function composePointerHandlers({
  controls,
  interaction,
  selection,
}: PointerSources): ComposedPointerHandlers {
  return {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerDown(event)) {
        return
      }
      interaction.onPointerDown(event)
      selection.onPointerDown(event)
    },
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerMove(event)) {
        return
      }
      interaction.onPointerMove(event)
      selection.onPointerMove(event)
    },
    onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => {
      controls.onPanPointerUp(event)
      selection.onPointerUp(event)
    },
  }
}

interface PlanScene {
  walls: DrawPlanOptions['walls']
  // The scene graph always supplies rooms, so this is non-optional here even
  // though drawPlan accepts rooms as an optional overlay.
  rooms: NonNullable<DrawPlanOptions['rooms']>
  selectedIds: ReadonlySet<string>
  preview: PreviewSegment | undefined
  marquee: Bounds | undefined
  viewport: Viewport
}

/** Redraws the canvas whenever the walls, selection, viewport, preview, or marquee change. */
function usePlanRedraw(canvasRef: RefObject<HTMLCanvasElement | null>, scene: PlanScene): void {
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) {
      return
    }
    drawPlan(ctx, {
      walls: scene.walls,
      rooms: scene.rooms,
      viewport: scene.viewport,
      width: PLAN_WIDTH,
      height: PLAN_HEIGHT,
      selectedIds: scene.selectedIds,
      grid: true,
      rulers: true,
      ...(scene.preview ? { preview: scene.preview } : {}),
      ...(scene.marquee ? { marquee: scene.marquee } : {}),
    })
  }, [
    canvasRef,
    scene.walls,
    scene.rooms,
    scene.selectedIds,
    scene.preview,
    scene.marquee,
    scene.viewport,
  ])
}

function planCursor(tool: ToolId, panning: boolean): string {
  if (panning) {
    return 'grabbing'
  }
  return tool === 'draw-wall' ? 'crosshair' : 'default'
}

/**
 * The 2D plan editing surface: the Canvas-and-pointer glue binding the tested pure
 * pieces (viewport projection, pan/zoom, grid, rulers, wall tool, hit testing,
 * drawing) to React, the session, the selection store, and the active tool. It is
 * coverage-excluded and validated by the wall-drawing end-to-end spec, since jsdom
 * has no 2D Canvas.
 */
export function PlanView() {
  const session = useEditorSession()
  const graph = useSceneGraph()
  const selection = useSelection()
  const selectedIds = useSelectionIds()
  const { tool } = useActiveTool()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewport, setViewport] = useState<Viewport>({ scale: DEFAULT_PLAN_SCALE })

  const interaction = usePlanInteraction({ session, tool, viewport })
  const planSelection = usePlanSelection({ graph, selection, tool, viewport })
  const controls = useViewportControls(canvasRef, setViewport)
  useFitToContent({ walls: graph.walls, rooms: graph.rooms, size: PLAN_SIZE }, setViewport)
  usePlanRedraw(canvasRef, {
    walls: graph.walls,
    rooms: graph.rooms,
    selectedIds,
    preview: interaction.preview,
    marquee: planSelection.marquee,
    viewport,
  })
  const pointerHandlers = composePointerHandlers({
    controls,
    interaction,
    selection: planSelection,
  })

  return (
    <canvas
      ref={canvasRef}
      width={PLAN_WIDTH}
      height={PLAN_HEIGHT}
      aria-label="Floor plan"
      className="plan-view"
      style={{ touchAction: 'none', cursor: planCursor(tool, controls.panning) }}
      onPointerDown={pointerHandlers.onPointerDown}
      onPointerMove={pointerHandlers.onPointerMove}
      onPointerUp={pointerHandlers.onPointerUp}
      onPointerLeave={interaction.onPointerLeave}
    />
  )
}
