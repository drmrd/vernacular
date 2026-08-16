import type { StairSceneNode } from '../../core'
import type { ToolId } from '../tools/active-tool-context'

/**
 * The single editable stair: the select tool must be active, exactly one id must
 * be selected, and that id must name a stair in `stairs`. Returns that
 * `StairSceneNode`, or null when no single stair is editable. Takes the stair
 * nodes rather than the whole graph, mirroring `singleSelectedFurniture`, since
 * the move drag keys off this derivation and needs nothing else from the scene.
 */
export function singleSelectedStair(
  tool: ToolId,
  selectedIds: ReadonlySet<string>,
  stairs: readonly StairSceneNode[],
): StairSceneNode | null {
  if (tool !== 'select' || selectedIds.size !== 1) {
    return null
  }
  const [onlyId] = selectedIds
  return stairs.find((stair) => stair.id === onlyId) ?? null
}
