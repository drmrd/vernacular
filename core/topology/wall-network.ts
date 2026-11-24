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
  /** The merged wall endpoints of today's wall graph. */
  readonly junctions: readonly Point[]
  /** The pieces of the walls between junctions, in the order of today's wall graph. */
  readonly edges: readonly NetworkEdge[]
}

const roomsByNetwork = new WeakMap<WallNetwork, readonly Room[]>()

/** The rooms that the build of a network found, in the order of the walk. */
export function networkRooms(network: WallNetwork): readonly Room[] {
  return roomsByNetwork.get(network) ?? []
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

/** The vertex a graph edge names by index; the origin only stands in for an index no edge has. */
function junctionAt(graph: PlanarGraph, index: number): Point {
  return graph.vertices[index] ?? { x: 0, y: 0 }
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
    edges: graph.edges.map((edge, index) => ({
      index,
      from: edge.a,
      to: edge.b,
      wallId: edge.wallId,
      path: linePath(junctionAt(graph, edge.a), junctionAt(graph, edge.b)),
      covers: [],
    })),
  }
  const thicknessByWallId = new Map(walls.map((wall) => [wall.id, effectiveWallThickness(wall)]))
  roomsByNetwork.set(network, roomsOfGraph(graph, thicknessByWallId))
  return network
}
