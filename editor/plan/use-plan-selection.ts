import { useCallback, useRef, useState, type PointerEvent } from 'react'
import type { Point, SceneGraph } from '../../core'
import type { SelectionStore } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import type { Bounds } from './fit'
import { hitTest, DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { entitiesInRect } from './marquee'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

const PRIMARY_BUTTON = 0
// A press-and-release that never moves past this world distance counts as a click,
// not a marquee drag, so a plain click still selects the entity under the cursor.
const MARQUEE_DRAG_THRESHOLD_MM = 50

interface PlanSelectionDeps {
  graph: SceneGraph
  selection: SelectionStore
  tool: ToolId
  viewport: Viewport
}

export interface PlanSelection {
  marquee: Bounds | undefined
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

function normalizedBounds(a: Point, b: Point): Bounds {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
  }
}

function draggedPastThreshold(rect: Bounds): boolean {
  return (
    rect.max.x - rect.min.x >= MARQUEE_DRAG_THRESHOLD_MM ||
    rect.max.y - rect.min.y >= MARQUEE_DRAG_THRESHOLD_MM
  )
}

/** A bare click selects, toggles (with shift), or clears the selection. */
function applyClick(deps: PlanSelectionDeps, world: Point, shift: boolean): void {
  const hit = hitTest(deps.graph, world, DEFAULT_HIT_TOLERANCE_MM)
  if (hit === null) {
    if (!shift) {
      deps.selection.clear()
    }
    return
  }
  if (shift) {
    deps.selection.toggle(hit)
  } else {
    deps.selection.select(hit)
  }
}

interface Release {
  origin: Point
  release: Point
  shift: boolean
}

/** On release, a drag past the threshold replaces the selection; otherwise it is a click. */
function resolveRelease(deps: PlanSelectionDeps, gesture: Release): void {
  const rect = normalizedBounds(gesture.origin, gesture.release)
  if (draggedPastThreshold(rect)) {
    deps.selection.setSelection(entitiesInRect(deps.graph, rect))
  } else {
    applyClick(deps, gesture.origin, gesture.shift)
  }
}

/**
 * The select tool's pointer lifecycle: a drag rubber-bands a marquee that
 * replaces the selection on release, and a bare click selects, shift-toggles, or
 * clears. It stays inert under any other tool so wall drawing is unaffected.
 */
export function usePlanSelection(deps: PlanSelectionDeps): PlanSelection {
  const pressOrigin = useRef<Point | null>(null)
  const [marquee, setMarquee] = useState<Bounds | undefined>(undefined)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (deps.tool !== 'select' || event.button !== PRIMARY_BUTTON) {
        return
      }
      pressOrigin.current = eventToWorld(event, deps.viewport)
    },
    [deps.tool, deps.viewport],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const origin = pressOrigin.current
      if (origin === null) {
        return
      }
      const rect = normalizedBounds(origin, eventToWorld(event, deps.viewport))
      setMarquee(draggedPastThreshold(rect) ? rect : undefined)
    },
    [deps.viewport],
  )

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const origin = pressOrigin.current
      pressOrigin.current = null
      setMarquee(undefined)
      if (origin !== null) {
        const release = eventToWorld(event, deps.viewport)
        resolveRelease(deps, { origin, release, shift: event.shiftKey })
      }
    },
    [deps],
  )

  return { marquee, onPointerDown, onPointerMove, onPointerUp }
}
