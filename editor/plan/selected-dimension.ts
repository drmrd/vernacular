import type { DimensionSceneNode, SceneGraph } from '../../core'

/**
 * The single selected dimension node, or null. Reflects a selected dimension
 * regardless of the active tool, since the inspector shows the dimension whenever
 * exactly one is selected. A node id names exactly one kind, so a single selected
 * dimension is mutually exclusive with a wall, room, or opening. Coverage-excluded
 * glue mirroring `singleSelectedWallNode`.
 */
export function singleSelectedDimension(
  selectedIds: ReadonlySet<string>,
  graph: SceneGraph,
): DimensionSceneNode | null {
  if (selectedIds.size !== 1) {
    return null
  }
  const [onlyId] = selectedIds
  return graph.dimensions.find((dimension) => dimension.id === onlyId) ?? null
}
