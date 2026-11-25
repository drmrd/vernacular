import type { Floor, Opening, Wall } from '../model/types'
import type { FloorPlanGeometry } from '../topology/floor-plan-geometry'
import { effectiveWallThickness } from './construction-profile'

export interface OpeningWithHost {
  opening: Opening
  hostWall: Wall
  thickness: number
}

export function openingsWithHosts(floor: Floor, geometry: FloorPlanGeometry): OpeningWithHost[] {
  const wallsById = new Map(floor.walls.map((wall) => [wall.id, wall]))
  const thicknessByOpening = new Map(
    geometry.openingSpans.map((span) => {
      const edge = geometry.network.edges[span.edgeIndex]!
      return [span.openingId, geometry.network.thickness.get(edge.wallId)]
    }),
  )
  return floor.openings.flatMap((opening) => {
    const hostWall = wallsById.get(opening.hostWallId)
    if (hostWall === undefined) return []
    const thickness = thicknessByOpening.get(opening.id) ?? effectiveWallThickness(hostWall)
    return [{ opening, hostWall, thickness }]
  })
}
