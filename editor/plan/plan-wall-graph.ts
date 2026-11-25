import {
  buildWallGraphWithCoverage,
  WALL_NODE_PREFIX,
  type PlanarGraph,
  type WallSceneNode,
} from '../../core'

/** The wall's raw model id, without the scene-node namespace. */
export function strippedWallId(wall: WallSceneNode): string {
  return wall.id.slice(WALL_NODE_PREFIX.length)
}

/**
 * The planar graph of the drawn walls. The scene-node prefix is stripped from each
 * id so that a graph edge's `wallId` matches the raw host id an opening carries.
 */
function planWallGeometry(walls: readonly WallSceneNode[]) {
  return buildWallGraphWithCoverage(
    walls.map((wall) => ({
      id: strippedWallId(wall),
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness,
    })),
  )
}

/** Maps the drawn walls to their planar graph, with optional coverage for previews. */
export type PlanWallGraphResolver = ((walls: readonly WallSceneNode[]) => PlanarGraph) & {
  withCoverage?: typeof planWallGeometry
}

function graphResolver(withCoverage: typeof planWallGeometry): PlanWallGraphResolver {
  return Object.assign((walls: readonly WallSceneNode[]) => withCoverage(walls).graph, {
    withCoverage,
  })
}

export const planWallGraph = graphResolver(planWallGeometry)

/**
 * A single-entry cache over `planWallGraph`. It keeps the last walls array it saw,
 * compared by reference, and that array's graph and coverage, so redraws between
 * scene changes reuse both.
 */
export function createPlanWallGraphMemo(): PlanWallGraphResolver {
  let lastWalls: readonly WallSceneNode[] | undefined
  let lastGeometry: ReturnType<typeof planWallGeometry> | undefined
  return graphResolver((walls) => {
    if (lastGeometry === undefined || walls !== lastWalls) {
      lastGeometry = planWallGeometry(walls)
      lastWalls = walls
    }
    return lastGeometry
  })
}
