import { OPEN_SKY_VISIBILITY } from './daylight-field'
import { cellVisibility, enteringFlux, roomAverageTerm } from './room-average'
import type { RoomGeometry } from './room-geometry'

/**
 * Mean sky visibility of a room lit by its sky apertures alone, from 0 to 1. Its own doorways count
 * for nothing, so light crosses one doorway and no more, and rooms that open only to each other
 * stay dark. `skyWeights` holds, for each aperture of the room, the sky's relative radiance toward
 * a sky aperture and 0 for a doorway. A room with no cell has a mean of 0.
 */
export function skyLitMeanVisibility(room: RoomGeometry, skyWeights: readonly number[]): number {
  if (room.cells.length === 0) return 0
  const roomAverage = roomAverageTerm(enteringFlux(room.apertures, skyWeights), room.surfaces)
  const total = room.cells.reduce(
    (sum, cell) => sum + cellVisibility(cell.factors, skyWeights, roomAverage),
    0,
  )
  return total / room.cells.length
}

/**
 * Luminance that a doorway into this room shows to its neighbor, relative to the open sky: a room
 * open to the sky passes 1 because its doorway shows the sky itself, and the cell sampling would
 * read that room as lit only by its own apertures. Any other room shows its lit surfaces, so it
 * passes its sky-lit mean visibility times its mean reflectance.
 */
export function doorwayLuminance(room: RoomGeometry, skyWeights: readonly number[]): number {
  if (room.openToSky) return OPEN_SKY_VISIBILITY
  return skyLitMeanVisibility(room, skyWeights) * room.surfaces.meanReflectance
}

/**
 * The weight of each aperture of a room, relative to the open sky: a sky aperture keeps its sky
 * weight, and a doorway takes the luminance of the room it opens to.
 */
export function apertureWeights(
  room: RoomGeometry,
  skyWeights: readonly number[],
  doorwayLuminances: readonly number[],
): number[] {
  return room.apertures.map((aperture, index) =>
    aperture.kind === 'sky'
      ? (skyWeights[index] ?? 0)
      : (doorwayLuminances[aperture.neighbor] ?? 0),
  )
}
