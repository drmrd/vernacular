import type { GraphEdge, PlanarGraph } from '../topology/wall-graph'
import { vertexIncidence } from '../topology/wall-footprint'
import { exteriorWalls } from './exterior-walls'
import {
  WALL_NODE_PREFIX,
  type OpeningSceneNode,
  type RoomSceneNode,
  type WallSceneNode,
} from './scene-graph'

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

/** A 3+-way junction paired with the exterior walls whose fade its fill tracks. */
export interface JunctionFadeGroup {
  /** Indices into PlanarGraph.edges of the walls meeting at the junction (its identity). */
  edgeIndexes: number[]
  /** Scene-node ids (`wall:`-prefixed) of the exterior walls incident to the junction. */
  exteriorWallIds: string[]
  /**
   * True when the junction fill must hold at its solid baseline while any member
   * exterior wall fades (keeps the room divider and the leg-end cover). A group with
   * one or more incident exterior walls is opaque-holding.
   */
  fillStaysOpaque: boolean
}

/**
 * One fade group per 3+-way junction, pairing the junction (by its incident
 * `edgeIndexes`) with the subset of incident walls that are exterior. The
 * junction's incident edges carry raw wall ids; `exteriorWalls(...)` keys by the
 * `wall:`-prefixed scene-node id, so the join prefixes the edge's wall id with
 * {@link WALL_NODE_PREFIX} before matching, and de-duplicates walls split into
 * several edges (a through wall teed at the junction) by wall id.
 */
// eslint-disable-next-line max-params -- the graph plus the same walls/rooms/openings triple exteriorWalls keys on is the natural signature for joining junctions to their exterior walls
export function junctionFadeGroups(
  graph: PlanarGraph,
  walls: WallSceneNode[],
  rooms: RoomSceneNode[],
  openings: OpeningSceneNode[] = [],
): JunctionFadeGroup[] {
  const exteriorWallIds = new Set(exteriorWalls(walls, rooms, openings).map((wall) => wall.wallId))
  const groups: JunctionFadeGroup[] = []
  for (const edgeIndexes of vertexIncidence(graph).values()) {
    if (edgeIndexes.length < MIN_FADE_INCIDENCE) continue
    const incidentExteriorWallIds = new Set<string>()
    for (const edgeIndex of edgeIndexes) {
      const wallNodeId = wallSceneNodeId((graph.edges[edgeIndex] as GraphEdge).wallId)
      if (exteriorWallIds.has(wallNodeId)) incidentExteriorWallIds.add(wallNodeId)
    }
    const memberExteriorWallIds = [...incidentExteriorWallIds]
    groups.push({
      edgeIndexes,
      exteriorWallIds: memberExteriorWallIds,
      fillStaysOpaque: memberExteriorWallIds.length >= 1,
    })
  }
  return groups
}
