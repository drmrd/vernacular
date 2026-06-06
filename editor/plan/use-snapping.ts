import { useCallback, useState } from 'react'
import type { Point } from '../../core'
import type { DrawPlanOptions } from './draw-plan'
import {
  snapPoint,
  DEFAULT_SNAP_GRID_MM,
  SNAP_PIXEL_TOLERANCE,
  type SnapContext,
  type SnapResult,
} from './snap'
import type { Viewport } from './viewport'

interface SnappingInputs {
  walls: DrawPlanOptions['walls']
  viewport: Viewport
  // The in-progress segment start while drawing; enables perpendicular and
  // parallel snapping and is absent when the tool is idle.
  origin: Point | undefined
}

export interface Snapping {
  // The current snap to paint as an indicator, or null when nothing snaps.
  snap: SnapResult | null
  // Snap a raw world cursor to the best nearby feature, recording the result so
  // the indicator can repaint; returns the snapped point (or the raw cursor when
  // nothing snaps).
  resolve: (cursor: Point) => Point
  // Clear the indicator (for example when the pointer leaves the canvas).
  clear: () => void
}

function buildContext({ walls, viewport, origin }: SnappingInputs): SnapContext {
  return {
    walls,
    gridSpacingMm: DEFAULT_SNAP_GRID_MM,
    // A fixed pixel tolerance maps to a varying world tolerance across zoom:
    // generous when zoomed out, tight when zoomed in.
    toleranceMm: SNAP_PIXEL_TOLERANCE / viewport.scale,
    ...(origin ? { origin } : {}),
  }
}

/**
 * Snapping for wall drawing: resolves a freely moving cursor to the best nearby
 * feature and tracks the current snap so the plan can paint an indicator. The
 * snap math lives in the pure `snap` module; this hook only builds the context
 * from the live scene and viewport and holds the indicator state.
 */
export function useSnapping(inputs: SnappingInputs): Snapping {
  const [snap, setSnap] = useState<SnapResult | null>(null)

  const resolve = useCallback(
    (cursor: Point): Point => {
      const result = snapPoint(cursor, buildContext(inputs))
      setSnap(result)
      return result ? result.point : cursor
    },
    [inputs],
  )

  const clear = useCallback(() => setSnap(null), [])

  return { snap, resolve, clear }
}
