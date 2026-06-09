import {
  DIMENSION_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  WALL_NODE_PREFIX,
  type SceneGraph,
} from '../../core'
import type { PreviewSegment } from './draw-plan'

const ENTITY_NODE_PREFIXES = [WALL_NODE_PREFIX, OPENING_NODE_PREFIX, DIMENSION_NODE_PREFIX]

/** Strip wall, opening, and dimension prefixes from selected node ids; drop everything else. */
export function selectedEntityIds(selectedIds: Iterable<string>): string[] {
  const entityIds: string[] = []
  for (const id of selectedIds) {
    const prefix = ENTITY_NODE_PREFIXES.find((candidate) => id.startsWith(candidate))
    if (prefix !== undefined) {
      entityIds.push(id.slice(prefix.length))
    }
  }
  return entityIds
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
