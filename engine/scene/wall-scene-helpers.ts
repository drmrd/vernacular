import {
  WALL_NODE_PREFIX,
  buildWallGraph,
  pathEnd,
  pathStart,
  wallPath,
  type OpeningSceneNode,
  type PlanarGraph,
  type WallSceneNode,
} from '../../core'

/** Builds the planar wall graph for a floor, keying each edge by stripped model id. */
export function buildFloorWallGraph(floorWalls: WallSceneNode[]): PlanarGraph {
  return buildWallGraph(
    floorWalls.map((wall) => {
      const path = wallPath(wall)
      return {
        id: wall.id.slice(WALL_NODE_PREFIX.length),
        start: pathStart(path),
        end: pathEnd(path),
        thickness: wall.thickness,
      }
    }),
  )
}

/** Groups openings by their host wall id, skipping openings without a host. */
export function groupOpeningsByHostWall(
  openings: OpeningSceneNode[],
): Map<string, OpeningSceneNode[]> {
  const byHostWall = new Map<string, OpeningSceneNode[]>()
  for (const opening of openings) {
    if (opening.hostWallId === undefined) continue
    const existing = byHostWall.get(opening.hostWallId) ?? []
    existing.push(opening)
    byHostWall.set(opening.hostWallId, existing)
  }
  return byHostWall
}
