import type { Floor } from '../model/types'
import type { Room } from './rooms'
import {
  deriveWallNetwork,
  derivePlanRooms,
  networkWallOf,
  type NetworkEdge,
  type NetworkWall,
  type PlanGeometryRegistries,
  type WallNetwork,
} from './wall-network'

export { derivePlanRooms, deriveWallNetwork }
export type { NetworkEdge, NetworkWall, PlanGeometryRegistries, WallNetwork }

/** What the plan geometry leaves out of the rooms, by wall or record id. */
export interface SetAside {
  /** Walls with no edge in the network because their two ends are within the join distance. */
  readonly zeroLengthWallIds: readonly string[]
  readonly coveredWallIds: readonly string[]
  readonly unboundRecordIds: readonly string[]
}

export type PlanRoom = Room

export interface FloorPlanGeometry {
  readonly floorId: string
  readonly network: WallNetwork
  readonly rooms: readonly PlanRoom[]
  readonly setAside: SetAside
}

function setAsideOf(network: WallNetwork): SetAside {
  const wallIdsWithEdges = new Set(
    network.edges.filter((edge) => edge.from !== edge.to).map((edge) => edge.wallId),
  )
  return {
    zeroLengthWallIds: network.walls
      .filter((wall) => !wallIdsWithEdges.has(wall.id))
      .map((wall) => wall.id),
    coveredWallIds: [],
    unboundRecordIds: [],
  }
}

export function deriveFloorPlanGeometry(
  floor: Floor,
  registries?: PlanGeometryRegistries,
): FloorPlanGeometry {
  const network = deriveWallNetwork(floor.walls.map(networkWallOf), registries)
  return {
    floorId: floor.id,
    network,
    rooms: derivePlanRooms(network),
    setAside: setAsideOf(network),
  }
}
