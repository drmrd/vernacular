import { buildWallGraph, WALL_NODE_PREFIX, type PlanarGraph, type WallSceneNode } from '../../core'

/** The wall's raw model id, without the scene-node namespace. */
export function strippedWallId(wall: WallSceneNode): string {
  return wall.id.slice(WALL_NODE_PREFIX.length)
}

/**
 * The planar graph of the drawn walls. The scene-node prefix is stripped from each
 * id so that a graph edge's `wallId` matches the raw host id an opening carries.
 */
export function planWallGraph(walls: readonly WallSceneNode[]): PlanarGraph {
  return buildWallGraph(
    walls.map((wall) => ({
      id: strippedWallId(wall),
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness,
    })),
  )
}

/**
 * A single-entry cache over `planWallGraph`. It keeps the last walls array it saw,
 * compared by reference, and that array's graph, so redraws between two scene
 * changes (pan, zoom, hover, snap) reuse the graph and a new walls array rebuilds it.
 */
export function createPlanWallGraphMemo(): (walls: readonly WallSceneNode[]) => PlanarGraph {
  let lastWalls: readonly WallSceneNode[] | undefined
  let lastGraph: PlanarGraph | undefined
  return (walls) => {
    if (lastGraph === undefined || walls !== lastWalls) {
      lastGraph = planWallGraph(walls)
      lastWalls = walls
    }
    return lastGraph
  }
}
