import type { OpeningSceneNode, SceneGraph } from '../../core'
import type { ToolId } from '../tools/active-tool-context'

/**
 * The single editable opening: the select tool must be active, exactly one id
 * must be selected, and that id must name an opening present in the scene graph.
 * Returns that `OpeningSceneNode`, or null when no single opening is editable.
 * Coverage-excluded glue: the opening drag keys off this derivation, mirroring
 * `singleSelectedWall`.
 */
export function singleSelectedOpening(
  tool: ToolId,
  selectedIds: ReadonlySet<string>,
  graph: SceneGraph,
): OpeningSceneNode | null {
  if (tool !== 'select' || selectedIds.size !== 1) {
    return null
  }
  const [onlyId] = selectedIds
  return graph.openings.find((opening) => opening.id === onlyId) ?? null
}
