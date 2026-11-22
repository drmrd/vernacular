import { useEffect } from 'react'
import { useEditorSession, useSelectionIds, useSurfaceSelection } from '../../bridge'
import { paintTargetForSelection } from './entity-surface'

/**
 * Set or clear the active paint surface when the selection changes: one wall defaults
 * to its first face, one room to its floor, and any other single entity clears it. A
 * surface that already belongs to the selected entity (for example the face a 3D click
 * picked just before selecting the wall) is kept. The effect fires only when the
 * selection changes, so a surface picked from the panel afterward is not overridden,
 * and the rooms are read from the session inside the effect so a scene-graph change
 * does not re-run it.
 */
export function useEntitySurfaceBridge(): void {
  const selectedIds = useSelectionIds()
  const surfaceSelection = useSurfaceSelection()
  const session = useEditorSession()
  useEffect(() => {
    const change = paintTargetForSelection(
      selectedIds,
      surfaceSelection.getActiveSurface(),
      session.getSceneGraph().rooms,
    )
    if (change.kind === 'select') {
      surfaceSelection.select(change.surface)
    } else if (change.kind === 'clear') {
      surfaceSelection.clear()
    }
  }, [selectedIds, surfaceSelection, session])
}
