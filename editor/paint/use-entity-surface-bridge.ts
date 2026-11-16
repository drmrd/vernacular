import { useEffect } from 'react'
import { useSelectionIds, useSurfaceSelection } from '../../bridge'
import { isSurfaceOfEntity, wallFaceForSelection } from './entity-surface'

/**
 * Default the active paint surface to a wall's first face when exactly that wall is
 * selected. A surface that already belongs to the selected wall (for example the face
 * a 3D click picked just before selecting the wall) is kept. The effect fires only
 * when the selection changes, so a surface picked from the panel afterward is not
 * overridden.
 */
export function useEntitySurfaceBridge(): void {
  const selectedIds = useSelectionIds()
  const surfaceSelection = useSurfaceSelection()
  useEffect(() => {
    const ref = wallFaceForSelection(selectedIds)
    const [entityId] = selectedIds
    if (ref === null || entityId === undefined) {
      return
    }
    const active = surfaceSelection.getActiveSurface()
    if (active === null || !isSurfaceOfEntity(active, entityId)) {
      surfaceSelection.select(ref)
    }
  }, [selectedIds, surfaceSelection])
}
