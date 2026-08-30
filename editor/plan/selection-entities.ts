import {
  DIMENSION_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  WALL_NODE_PREFIX,
  type SceneGraph,
} from '../../core'
import type { PreviewSegment } from './draw-plan'

const ENTITY_NODE_PREFIXES = [WALL_NODE_PREFIX, OPENING_NODE_PREFIX, DIMENSION_NODE_PREFIX]
const TRANSFORMABLE_NODE_PREFIXES = [WALL_NODE_PREFIX, DIMENSION_NODE_PREFIX]

// Strip whichever of the given prefixes matches a selected id, in input order,
// dropping ids that match none; shared by the entity and transformable id lists,
// which differ only in which prefixes they accept.
function stripMatchingPrefix(selectedIds: Iterable<string>, prefixes: readonly string[]): string[] {
  const ids: string[] = []
  for (const id of selectedIds) {
    const prefix = prefixes.find((candidate) => id.startsWith(candidate))
    if (prefix !== undefined) {
      ids.push(id.slice(prefix.length))
    }
  }
  return ids
}

/** Strip wall, opening, and dimension prefixes from selected node ids; drop everything else. */
export function selectedEntityIds(selectedIds: Iterable<string>): string[] {
  return stripMatchingPrefix(selectedIds, ENTITY_NODE_PREFIXES)
}

/** Selected node ids that the transform commands can actually move or rotate. */
export function transformableEntityIds(selectedIds: Iterable<string>): string[] {
  return stripMatchingPrefix(selectedIds, TRANSFORMABLE_NODE_PREFIXES)
}

/** Collect ghost segments for every selected wall or dimension node found in the graph. */
export function selectionGhostSegments(
  graph: SceneGraph,
  selectedIds: ReadonlySet<string>,
): readonly PreviewSegment[] {
  const segments: PreviewSegment[] = []
  for (const node of [...graph.walls, ...graph.dimensions]) {
    if (selectedIds.has(node.id)) {
      segments.push({ start: node.start, end: node.end })
    }
  }
  return segments
}
