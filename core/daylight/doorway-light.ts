import { OPEN_SKY_VISIBILITY } from './daylight-field'
import { cellVisibility, enteringFlux, roomAverageTerm } from './room-average'
import type { RoomGeometry } from './room-geometry'

/**
 * Mean sky visibility of a room lit by its sky apertures alone, from 0 to 1: the share of open-sky
 * light that a doorway into this room passes to a neighbor. Its own doorways count for nothing, so
 * light crosses one doorway and no more, and rooms that open only to each other stay dark.
 * `skyWeights` holds, for each aperture of the room, the sky's relative radiance toward a sky
 * aperture and 0 for a doorway. A room open to the sky passes 1, and a room with no cell passes 0.
 */
export function skyLitMeanVisibility(room: RoomGeometry, skyWeights: readonly number[]): number {
  if (room.openToSky) return OPEN_SKY_VISIBILITY
  if (room.cells.length === 0) return 0
  const roomAverage = roomAverageTerm(enteringFlux(room.apertures, skyWeights), room.surfaces)
  const total = room.cells.reduce(
    (sum, cell) => sum + cellVisibility(cell.factors, skyWeights, roomAverage),
    0,
  )
  return total / room.cells.length
}

/**
 * The weight of each aperture of a room, relative to the open sky: a sky aperture keeps its sky
 * weight, and a doorway takes the sky-lit mean visibility of the room it opens to.
 */
export function apertureWeights(
  room: RoomGeometry,
  skyWeights: readonly number[],
  skyLitMeans: readonly number[],
): number[] {
  return room.apertures.map((aperture, index) =>
    aperture.kind === 'sky' ? (skyWeights[index] ?? 0) : (skyLitMeans[aperture.neighbor] ?? 0),
  )
}
