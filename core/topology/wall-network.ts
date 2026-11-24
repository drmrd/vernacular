import type { WallPath } from '../geometry/wall-path'
import type { ConstructionProfile } from '../registries/construction-profiles'
import type { Registry } from '../registries/registry'
import { effectiveWallThickness } from '../scene/construction-profile'

export interface PlanGeometryRegistries {
  readonly constructionProfiles: Registry<ConstructionProfile>
}

export interface NetworkWall {
  readonly id: string
  readonly path: WallPath
  readonly thickness: number
  readonly constructionProfile?: string
}

export interface WallNetwork {
  /** Every wall of the floor, in floor order, with its thickness resolved. */
  readonly walls: readonly NetworkWall[]
  /** The resolved thickness of each wall, by wall id. */
  readonly thickness: ReadonlyMap<string, number>
}

export function deriveWallNetwork(
  walls: readonly NetworkWall[],
  registries?: PlanGeometryRegistries,
): WallNetwork {
  const resolved = walls.map((wall) => ({
    ...wall,
    thickness: effectiveWallThickness(wall, registries?.constructionProfiles),
  }))
  return {
    walls: resolved,
    thickness: new Map(resolved.map((wall) => [wall.id, wall.thickness])),
  }
}
