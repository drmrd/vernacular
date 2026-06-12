import { useEffect } from 'react'
import { useSelectionIds, useSurfaceSelection } from '../../bridge'
import { wallFaceForSelection } from './entity-surface'

/**
 * Default the active paint surface to a wall's first face when exactly that wall is
 * selected on the plan. The effect fires only when the selection changes, so a
 * surface picked from the panel afterward is not overridden.
 */
export function useEntitySurfaceBridge(): void {
  const selectedIds = useSelectionIds()
  const surfaceSelection = useSurfaceSelection()
  useEffect(() => {
    const ref = wallFaceForSelection(selectedIds)
    if (ref !== null) {
      surfaceSelection.select(ref)
    }
  }, [selectedIds, surfaceSelection])
}
