import { linePath, pathEnd, pathStart, type WallPath, wallPath } from '../geometry/wall-path'
import type { Point, Wall } from '../model/types'
import type { ConstructionProfile } from '../registries/construction-profiles'
import type { Registry } from '../registries/registry'
import { effectiveWallThickness } from '../scene/construction-profile'
import { roomsOfGraph } from './room-walk'
import type { Room } from './rooms'
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
}

const roomsByNetwork = new WeakMap<WallNetwork, readonly Room[]>()

/** The rooms of a network, from the one walk that its build made. */
export function derivePlanRooms(network: WallNetwork): readonly Room[] {
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
  const network: WallNetwork = {
    walls: resolved,
    thickness: new Map(resolved.map((wall) => [wall.id, wall.thickness])),
    junctions: graph.vertices,
    edges: networkEdgesOf(graph),
  }
  const thicknessByWallId = new Map(walls.map((wall) => [wall.id, effectiveWallThickness(wall)]))
  roomsByNetwork.set(network, roomsOfGraph(graph, thicknessByWallId))
  return network
}
