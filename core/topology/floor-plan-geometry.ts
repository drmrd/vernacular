import type { Floor } from '../model/types'
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

export interface FloorPlanGeometry {
  readonly floorId: string
  readonly network: WallNetwork
  readonly setAside: SetAside
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
