import type { Floor } from '../model/types'
import type { Room } from './rooms'
import {
  deriveWallNetwork,
  networkRooms,
  networkWallOf,
  type NetworkEdge,
  type NetworkWall,
  type PlanGeometryRegistries,
  type WallNetwork,
} from './wall-network'

export { deriveWallNetwork }
export type { NetworkEdge, NetworkWall, PlanGeometryRegistries, WallNetwork }

/** What the plan geometry leaves out of the rooms, by wall or record id. */
export interface SetAside {
  /** Walls with no edge in the network because their two ends are within the join distance. */
  readonly zeroLengthWallIds: readonly string[]
  readonly coveredWallIds: readonly string[]
  readonly unboundRecordIds: readonly string[]
}

export interface FloorPlanGeometry {
  readonly floorId: string
  readonly network: WallNetwork
  readonly setAside: SetAside
}

/** The rooms of a network, from the one walk that its build made. */
export function derivePlanRooms(network: WallNetwork): readonly Room[] {
  return networkRooms(network)
}

function setAsideOf(network: WallNetwork): SetAside {
  const wallIdsWithEdges = new Set(network.edges.map((edge) => edge.wallId))
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
  return { floorId: floor.id, network, setAside: setAsideOf(network) }
}
