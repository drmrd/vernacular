import type { Wall } from '../model/types'
import {
  deriveWallNetwork,
  networkWallOf,
  type PlanGeometryRegistries,
  type WallNetwork,
  wallNetworkBuildCount,
} from './wall-network'

export { wallNetworkBuildCount }

const withoutRegistries: object = {}

const networksByWalls = new WeakMap<readonly Wall[], WeakMap<object, WallNetwork>>()

/**
 * The wall network of a wall list, built once for each wall list and registries object. The memo
 * key is the identity of the wall list, which the model never changes in place.
 */
export function wallNetworkFor(
  walls: readonly Wall[],
  registries?: PlanGeometryRegistries,
): WallNetwork {
  let networksByRegistries = networksByWalls.get(walls)
  if (networksByRegistries === undefined) {
    networksByRegistries = new WeakMap()
    networksByWalls.set(walls, networksByRegistries)
  }
  let network = networksByRegistries.get(registries ?? withoutRegistries)
  if (network === undefined) {
    network = deriveWallNetwork(walls.map(networkWallOf), registries)
    networksByRegistries.set(registries ?? withoutRegistries, network)
  }
  return network
}
