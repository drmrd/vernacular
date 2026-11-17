import type { FurnitureInstance } from '../../core'
import type { ToolId } from '../tools/active-tool-context'

/**
 * The single editable furniture: the select tool must be active, exactly one id
 * must be selected, and that id must name a furniture instance present in
 * `furniture`. Returns that `FurnitureInstance`, or null when no single
 * furniture is editable. The selection holds a furniture piece under its raw
 * instance id, not its prefixed scene node id; this otherwise mirrors
 * `singleSelectedOpening`.
 */
export function singleSelectedFurniture(
  tool: ToolId,
  selectedIds: ReadonlySet<string>,
  furniture: readonly FurnitureInstance[],
): FurnitureInstance | null {
  if (tool !== 'select' || selectedIds.size !== 1) {
    return null
  }
  const [onlyId] = selectedIds
  return furniture.find((item) => item.id === onlyId) ?? null
}
