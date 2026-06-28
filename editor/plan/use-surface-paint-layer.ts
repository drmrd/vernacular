import { useMemo } from 'react'
import { surfaceKey, surfaceTintHex } from '../../core'
import {
  useActiveFloorId,
  useActiveSurface,
  useEditorSession,
  useHighlightedSurface,
} from '../../bridge'
import type { DrawPlanOptions } from './draw-plan'

/**
 * The per-face treatment lookup plus the active surface the plan renders as paint
 * bands and a highlight. Memoized on the project paint and the active surface so the
 * redraw re-runs exactly when either changes; the lookup closes over the current
 * paint record, so a paint dispatch (which replaces the record) shows up at once.
 */
export function useSurfacePaintLayer(): NonNullable<DrawPlanOptions['surfacePaint']> {
  const { paint } = useEditorSession().getProject()
  const activeSurface = useActiveSurface()
  const highlightedSurface = useHighlightedSurface()
  return useMemo(
    () => ({
      treatmentForFace: (wallId: string, side: 'left' | 'right') =>
        paint?.[surfaceKey({ kind: 'wall-face', wallId, side })],
      activeSurface,
      highlightedSurface,
    }),
    [paint, activeSurface, highlightedSurface],
  )
}

/**
 * The active floor's solid floor-paint color, which tints the room fills, or
 * undefined when the floor is unpainted. Reads the project paint record directly,
 * so a paint dispatch (which replaces the record) repaints the fills at once.
 */
export function useFloorFillColor(): string | undefined {
  const { paint } = useEditorSession().getProject()
  const floorId = useActiveFloorId()
  if (floorId === null) {
    return undefined
  }
  const treatment = paint?.[surfaceKey({ kind: 'floor', floorId })]
  return treatment === undefined ? undefined : surfaceTintHex(treatment)
}
