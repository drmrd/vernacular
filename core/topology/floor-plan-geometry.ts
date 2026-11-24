import type { Floor } from '../model/types'
import {
  deriveWallNetwork,
  networkWallOf,
  type NetworkWall,
  type PlanGeometryRegistries,
  type WallNetwork,
} from './wall-network'

export { deriveWallNetwork }
export type { NetworkWall, PlanGeometryRegistries, WallNetwork }

export interface FloorPlanGeometry {
  readonly floorId: string
  readonly network: WallNetwork
}

export function deriveFloorPlanGeometry(
  floor: Floor,
  registries?: PlanGeometryRegistries,
): FloorPlanGeometry {
  return {
    floorId: floor.id,
    network: deriveWallNetwork(floor.walls.map(networkWallOf), registries),
  }
}
