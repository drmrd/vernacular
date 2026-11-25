import { linePath, pathEnd, pathStart, type WallPath, wallPath } from '../geometry/wall-path'
import type { Point, Wall } from '../model/types'
import type { ConstructionProfile } from '../registries/construction-profiles'
import type { Registry } from '../registries/registry'
import { effectiveWallThickness } from '../scene/construction-profile'
import { type JunctionFill, junctionFills } from './junction-fill'
import { junctionFans, type JunctionFans } from './junction-fans'
import { roomsOfGraph } from './room-walk'
import {
  planRoomsOf,
  type PlanRoom,
  type WallFaceRecord,
  wallFaceRecords,
} from './wall-face-records'
import { type WallFootprint, wallFootprints } from './wall-footprint'
import { buildWallGraph, type PlanarGraph } from './wall-graph'

export interface PlanGeometryRegistries {
  readonly constructionProfiles: Registry<ConstructionProfile>
}

export interface NetworkWall {
  readonly id: string
  readonly path: WallPath
  /** The drawn thickness on the input of `deriveWallNetwork`; the resolved thickness on `WallNetwork.walls`. */
  readonly thickness: number
  readonly constructionProfile?: string
}

/** One piece of a wall between two junctions of the wall graph. */
export interface NetworkEdge {
  /** Position of this edge in {@link WallNetwork.edges}. */
  readonly index: number
  /** Index into {@link WallNetwork.junctions} of the first end. */
  readonly from: number
  /** Index into {@link WallNetwork.junctions} of the second end. */
  readonly to: number
  readonly wallId: string
  /** The straight path between the two junctions. */
  readonly path: WallPath
  /** Ids of the walls this edge covers; none until overlapping walls are handled. */
  readonly covers: readonly string[]
}

export interface WallNetwork {
  /** Every wall of the floor, in floor order, with its thickness resolved. */
  readonly walls: readonly NetworkWall[]
  /** The resolved thickness of each wall, by wall id. */
  readonly thickness: ReadonlyMap<string, number>
  /** The merged wall endpoints of `buildWallGraph`. */
  readonly junctions: readonly Point[]
  /** The pieces of the walls between junctions, in the order of `buildWallGraph`. */
  readonly edges: readonly NetworkEdge[]
  /**
   * Each junction's edge indexes, counterclockwise by leaving angle; one entry per junction with an
   * edge. An edge from a junction to itself is left out, so a junction whose only other edge is
   * such a loop gets an empty fan.
   */
  readonly fans: JunctionFans
  /** The plan-space footprint of each edge, in the order of `edges`. */
  readonly footprints: readonly WallFootprint[]
  /** The fill of each junction where three or more walls meet and leave a core. */
  readonly fills: readonly JunctionFill[]
  /** Both faces of every wall, in wall order, each with the rooms along it. */
  readonly faces: readonly WallFaceRecord[]
}

const roomsByNetwork = new WeakMap<WallNetwork, readonly PlanRoom[]>()

/** The rooms of a network, from the one walk that its build made. */
export function derivePlanRooms(network: WallNetwork): readonly PlanRoom[] {
  const rooms = roomsByNetwork.get(network)
  if (rooms === undefined) {
    throw new Error('derivePlanRooms needs a network that deriveWallNetwork built')
  }
  return rooms
}

export function networkWallOf(wall: Wall): NetworkWall {
  return {
    id: wall.id,
    path: wallPath(wall),
    thickness: wall.thickness,
    ...(wall.constructionProfile === undefined
      ? {}
      : { constructionProfile: wall.constructionProfile }),
  }
}

function networkEdgesOf(graph: PlanarGraph): NetworkEdge[] {
  return graph.edges.map((edge, index) => ({
    index,
    from: edge.a,
    to: edge.b,
    wallId: edge.wallId,
    path: linePath(graph.vertices[edge.a] as Point, graph.vertices[edge.b] as Point),
    covers: [],
  }))
}

export function deriveWallNetwork(
  walls: readonly NetworkWall[],
  registries?: PlanGeometryRegistries,
): WallNetwork {
  const resolved = walls.map((wall) => ({
    ...wall,
    thickness: effectiveWallThickness(wall, registries?.constructionProfiles),
  }))
  const graph = buildWallGraph(
    walls.map((wall) => ({ ...wall, start: pathStart(wall.path), end: pathEnd(wall.path) })),
  )
  const thickness = new Map(resolved.map((wall) => [wall.id, wall.thickness]))
  const fans = junctionFans(graph)
  const thicknessByEdge = graph.edges.map((edge) => thickness.get(edge.wallId) as number)
  const footprints = wallFootprints(graph, thicknessByEdge, { fans })
  const edges = networkEdgesOf(graph)
  const walk = roomsOfGraph(graph, thickness, fans)
  const faces = wallFaceRecords({ walls: resolved, junctions: graph.vertices, edges }, walk)
  const network: WallNetwork = {
    walls: resolved,
    thickness,
    junctions: graph.vertices,
    edges,
    fans,
    footprints,
    fills: junctionFills(graph, thicknessByEdge, { fans, footprints }),
    faces,
  }
  roomsByNetwork.set(network, planRoomsOf(walk.rooms, faces))
  return network
}
