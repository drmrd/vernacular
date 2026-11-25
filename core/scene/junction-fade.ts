import { shift, subtract } from '../geometry/vector'
import type { Point } from '../model/types'
import type { GraphEdge, PlanarGraph } from '../topology/wall-graph'
import { incidentEdgesWithoutLoops } from '../topology/wall-footprint'
import { exteriorWalls, type ExteriorWall } from './exterior-walls'
import {
  WALL_NODE_PREFIX,
  type OpeningSceneNode,
  type RoomSceneNode,
  type WallSceneNode,
} from './scene-graph'
import { distanceAlongWall } from './wall-room-sides'

/**
 * A junction gets a fade group only where this many or more walls meet. This is the
 * same domain invariant (a junction is a 3+-way meeting) as `MIN_FILL_INCIDENCE` in
 * `core/topology/junction-fill.ts`; keep the two in step if either ever changes.
 */
const MIN_FADE_INCIDENCE = 3

/**
 * The `wall:`-prefixed scene-node id for a graph edge's wall id, used to join against
 * the keys `exteriorWalls(...)` returns. A graph built from raw wall ids (the per-floor
 * build path) needs the prefix; one built from already-prefixed scene-node ids keeps it,
 * so the join holds whichever id form the caller's graph carries.
 */
function wallSceneNodeId(wallId: string): string {
  return wallId.startsWith(WALL_NODE_PREFIX) ? wallId : WALL_NODE_PREFIX + wallId
}

/** Where, along an edge, the point that decides which exterior run the edge lies on sits. */
const EDGE_MIDDLE_FACTOR = 0.5

/** A 3+-way junction paired with the exterior runs whose fade its fill tracks. */
export interface JunctionFadeGroup {
  /** Indices into PlanarGraph.edges of the walls meeting at the junction (its identity). */
  edgeIndexes: number[]
  /** Scene-node ids (`wall:`-prefixed) of the walls with an exterior run on an incident edge. */
  exteriorWallIds: string[]
  /**
   * Positions, in the array exteriorWalls(walls, rooms, openings) returns for the same walls,
   * rooms, and openings, of the exterior runs the junction's incident edges lie on; ascending,
   * without repeats. An incident edge lies on a run of its wall when the middle of the edge,
   * measured along the wall from the wall's start, lies within the run's [fromMm, toMm].
   */
  exteriorRunIndexes: number[]
  /**
   * True when an incident edge lies on no exterior run (that stretch of wall never fades), so the
   * fill holds opaque whatever the camera; false when every incident edge lies on an exterior run.
   */
  fillHoldsUnconditionally: boolean
}

/** What the edge-to-run join needs: the graph, the walls by node id, and the runs by wall node id. */
interface RunLookup {
  graph: PlanarGraph
  wallsById: Map<string, WallSceneNode>
  exterior: ExteriorWall[]
  runIndexesByWallId: Map<string, number[]>
}

function buildRunLookup(
  graph: PlanarGraph,
  walls: WallSceneNode[],
  exterior: ExteriorWall[],
): RunLookup {
  const runIndexesByWallId = new Map<string, number[]>()
  exterior.forEach((run, runIndex) => {
    const indexes = runIndexesByWallId.get(run.wallId) ?? []
    indexes.push(runIndex)
    runIndexesByWallId.set(run.wallId, indexes)
  })
  return {
    graph,
    wallsById: new Map(walls.map((wall) => [wall.id, wall])),
    exterior,
    runIndexesByWallId,
  }
}

/**
 * The positions of the exterior runs the edge lies on: the runs of the edge's wall whose
 * [fromMm, toMm] holds the middle of the edge, measured in mm along the wall from its start.
 */
function runIndexesUnderEdge(edge: GraphEdge, lookup: RunLookup): number[] {
  const wallNodeId = wallSceneNodeId(edge.wallId)
  const wall = lookup.wallsById.get(wallNodeId)
  const candidates = lookup.runIndexesByWallId.get(wallNodeId)
  if (wall === undefined || candidates === undefined) return []
  const { vertices } = lookup.graph
  const start = vertices[edge.a] as Point
  const end = vertices[edge.b] as Point
  const middle = shift(start, subtract(end, start), EDGE_MIDDLE_FACTOR)
  const alongMm = distanceAlongWall(wall, middle)
  // The middle can sit exactly on the boundary between two runs of its wall; the interval is
  // closed at both ends, so both runs then join the group (an opening joins only the first run).
  return candidates.filter((runIndex) => {
    const run = lookup.exterior[runIndex] as ExteriorWall
    return alongMm >= run.fromMm && alongMm <= run.toMm
  })
}

/**
 * One fade group per 3+-way junction, pairing the junction (by its incident `edgeIndexes`) with the
 * exterior runs its incident edges lie on. Membership is per incident edge, not per wall: a wall
 * that is exterior along one stretch and stands between two rooms along another counts at a
 * junction only when the incident edge lies on the exterior stretch. The edge's wall id is a raw
 * wall id or a scene-node id; it is prefixed with {@link WALL_NODE_PREFIX} to match the keys
 * `exteriorWalls(...)` returns, and walls split into several edges (a through wall teed at the
 * junction) are de-duplicated by wall id in `exteriorWallIds`.
 */
// eslint-disable-next-line max-params -- the graph plus the same walls/rooms/openings triple exteriorWalls keys on is the natural signature for joining junctions to their exterior runs
export function junctionFadeGroups(
  graph: PlanarGraph,
  walls: WallSceneNode[],
  rooms: RoomSceneNode[],
  openings: OpeningSceneNode[] = [],
): JunctionFadeGroup[] {
  const lookup = buildRunLookup(graph, walls, exteriorWalls(walls, rooms, openings))
  const groups: JunctionFadeGroup[] = []
  for (const edgeIndexes of incidentEdgesWithoutLoops(graph).values()) {
    if (edgeIndexes.length < MIN_FADE_INCIDENCE) continue
    const wallIds = new Set<string>()
    const runIndexes = new Set<number>()
    let fillHoldsUnconditionally = false
    for (const edgeIndex of edgeIndexes) {
      const edge = graph.edges[edgeIndex] as GraphEdge
      const underEdge = runIndexesUnderEdge(edge, lookup)
      if (underEdge.length === 0) fillHoldsUnconditionally = true
      else wallIds.add(wallSceneNodeId(edge.wallId))
      underEdge.forEach((runIndex) => runIndexes.add(runIndex))
    }
    groups.push({
      edgeIndexes,
      exteriorWallIds: [...wallIds],
      exteriorRunIndexes: [...runIndexes].sort((left, right) => left - right),
      fillHoldsUnconditionally,
    })
  }
  return groups
}
