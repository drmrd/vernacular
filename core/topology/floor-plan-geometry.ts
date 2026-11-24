import { wallPath } from '../geometry/wall-path'
import type { Floor, Wall } from '../model/types'
import {
  deriveWallNetwork,
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

function networkWallOf(wall: Wall): NetworkWall {
  return {
    id: wall.id,
    path: wallPath(wall),
    thickness: wall.thickness,
    ...(wall.constructionProfile === undefined
      ? {}
      : { constructionProfile: wall.constructionProfile }),
  }
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
