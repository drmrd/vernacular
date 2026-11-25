import type { Wall } from '../model/types'
import { getOrCreate } from './get-or-create'
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
  const networksByRegistries = getOrCreate(networksByWalls, walls, () => new WeakMap())
  return getOrCreate(networksByRegistries, registries ?? withoutRegistries, () =>
    deriveWallNetwork(walls.map(networkWallOf), registries),
  )
}
