import type { Floor } from '../model/types'
import {
  isLoopEdge,
  type PlanRoom,
  type WallFaceRecord,
  type WallFaceStretch,
  type WallSide,
} from './wall-face-records'
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
export type {
  NetworkEdge,
  NetworkWall,
  PlanGeometryRegistries,
  PlanRoom,
  WallFaceRecord,
  WallFaceStretch,
  WallNetwork,
  WallSide,
}

/** What the plan geometry leaves out of the rooms, by wall or record id. */
export interface SetAside {
  /**
   * Walls with no edge that reaches another junction, because their two ends are within the join
   * distance or merged into one junction.
   */
  readonly zeroLengthWallIds: readonly string[]
  readonly coveredWallIds: readonly string[]
  readonly unboundRecordIds: readonly string[]
}

export interface FloorPlanGeometry {
  readonly floorId: string
  readonly network: WallNetwork
  readonly rooms: readonly PlanRoom[]
  readonly setAside: SetAside
}

function setAsideOf(network: WallNetwork): SetAside {
  const wallIdsReachingAnotherJunction = new Set(
    network.edges.filter((edge) => !isLoopEdge(edge)).map((edge) => edge.wallId),
  )
  return {
    zeroLengthWallIds: network.walls
      .filter((wall) => !wallIdsReachingAnotherJunction.has(wall.id))
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
