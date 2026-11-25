import type { Wall } from '../model/types'
import {
  deriveWallNetwork,
  networkWallOf,
  type PlanGeometryRegistries,
  type WallNetwork,
  wallNetworkBuildCount,
} from './wall-network'

export { wallNetworkBuildCount }

const withoutRegistries: PlanGeometryRegistries = {} as PlanGeometryRegistries

const networksByWalls = new WeakMap<readonly Wall[], WeakMap<PlanGeometryRegistries, WallNetwork>>()

/** The wall network of a wall list, built once for each wall list and registries object. */
export function wallNetworkFor(
  walls: readonly Wall[],
  registries: PlanGeometryRegistries = withoutRegistries,
): WallNetwork {
  let networksByRegistries = networksByWalls.get(walls)
  if (networksByRegistries === undefined) {
    networksByRegistries = new WeakMap()
    networksByWalls.set(walls, networksByRegistries)
  }
  let network = networksByRegistries.get(registries)
  if (network === undefined) {
    network = deriveWallNetwork(
      walls.map(networkWallOf),
      registries === withoutRegistries ? undefined : registries,
    )
    networksByRegistries.set(registries, network)
  }
  return network
}
