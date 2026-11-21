import { useCallback, useMemo, useState } from 'react'
import { type SceneGraph } from '../../core'
import { type EntityScreenPosition } from '../../engine'
import { entityLabels } from './entity-labels'
import { useSelection, useSelectionIds } from './selection-context'
import { useCatalogNames } from './use-catalog-names'

// The accessibility proxy state: the live projected screen positions (fed by the in-canvas
// projector), joined with entity labels, plus the shared selection the proxies read and
// write. The positions are session view state, like the camera and color temperature.
export function useSceneProxies(graph: SceneGraph) {
  const [positions, setPositions] = useState<EntityScreenPosition[]>([])
  const selection = useSelection()
  const selectedIds = useSelectionIds()
  const catalogNames = useCatalogNames()
  const labels = useMemo(() => entityLabels(graph, catalogNames), [graph, catalogNames])
  const proxies = useMemo(
    () => positions.map((p) => ({ id: p.id, x: p.x, y: p.y, label: labels.get(p.id) ?? p.id })),
    [positions, labels],
  )
  const onSelect = useCallback(
    (id: string, additive: boolean) => (additive ? selection.toggle(id) : selection.select(id)),
    [selection],
  )
  return { proxies, selectedIds, onSelect, setPositions }
}
