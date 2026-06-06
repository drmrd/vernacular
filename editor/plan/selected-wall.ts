import type { SceneGraph, WallSceneNode } from '../../core'
import type { ToolId } from '../tools/active-tool-context'

/**
 * The single editable wall: the select tool must be active, exactly one id must
 * be selected, and that id must name a wall present in the scene graph. Returns
 * that `WallSceneNode`, or null when no single wall is editable. Coverage-excluded
 * glue: the endpoint-drag handles and dragging key off this derivation.
 */
export function singleSelectedWall(
  tool: ToolId,
  selectedIds: ReadonlySet<string>,
  graph: SceneGraph,
): WallSceneNode | null {
  if (tool !== 'select' || selectedIds.size !== 1) {
    return null
  }
  const [onlyId] = selectedIds
  return graph.walls.find((wall) => wall.id === onlyId) ?? null
}
