import { useCallback, useState } from 'react'
import type { Point } from '../../core'
import type { DrawPlanOptions } from './draw-plan'
import {
  snapPoint,
  DEFAULT_SNAP_GRID_MM,
  type SnapContext,
  type SnapKind,
  type SnapResult,
} from './snap'
import { TOGGLABLE_SNAP_KINDS, type SnapPreferences } from './snap-preferences'
import { useOptionalSnapPreferences } from './snap-preferences-context'
import type { Viewport } from './viewport'

interface SnappingInputs {
  walls: DrawPlanOptions['walls']
  viewport: Viewport
  // The in-progress segment start while drawing; enables perpendicular and
  // parallel snapping and is absent when the tool is idle.
  origin: Point | undefined
  // Underlay footprint corners the cursor can snap to when trace mode is on;
  // absent or empty when trace mode is off.
  tracePoints?: readonly Point[]
  // The open run's corners the cursor can snap back onto to close the loop;
  // absent or empty when not drawing.
  openVertices?: readonly Point[]
  // When set, the held free-angle modifier suppresses the default angle lock so
  // the cursor draws a free angle.
  freeAngle?: boolean
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

/** The kinds the preferences have turned off, as the set the snap chain skips. */
function disabledKindsFor(preferences: SnapPreferences): ReadonlySet<SnapKind> {
  return new Set<SnapKind>(TOGGLABLE_SNAP_KINDS.filter((kind) => !preferences.kinds[kind]))
}

/**
 * Build the snap context from the live inputs and the user's snap preferences. The
 * preference radius (in screen pixels) maps to a varying world tolerance across zoom,
 * the master flag gates snapping entirely, and a toggled-off kind is skipped.
 */
export function buildSnapContext(
  { walls, viewport, origin, tracePoints, openVertices, freeAngle }: SnappingInputs,
  preferences: SnapPreferences,
): SnapContext {
  return {
    walls,
    gridSpacingMm: DEFAULT_SNAP_GRID_MM,
    toleranceMm: preferences.pixelRadius / viewport.scale,
    enabled: preferences.enabled,
    disabledKinds: disabledKindsFor(preferences),
    ...(origin ? { origin } : {}),
    ...(tracePoints && tracePoints.length > 0 ? { tracePoints } : {}),
    ...(openVertices && openVertices.length > 0 ? { openVertices } : {}),
    ...(freeAngle ? { freeAngle } : {}),
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
  const preferences = useOptionalSnapPreferences()

  const resolve = useCallback(
    (cursor: Point): Point => {
      const result = snapPoint(cursor, buildSnapContext(inputs, preferences))
      setSnap(result)
      return result ? result.point : cursor
    },
    [inputs, preferences],
  )

  const clear = useCallback(() => setSnap(null), [])

  return { snap, resolve, clear }
}
