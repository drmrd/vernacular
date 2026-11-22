import { OPEN_SKY_VISIBILITY } from './daylight-field'
import { enteringFlux, roomAverageTerm } from './room-average'
import type { RoomGeometry } from './room-geometry'

/**
 * Luminance that a doorway into this room shows to its neighbor, relative to the open sky: a room
 * open to the sky passes 1 because its doorway shows the sky itself. Any other room passes its
 * room-average term, lit by its sky apertures alone, which is the mean exitance of its surfaces.
 * Its own doorways count for nothing, so light crosses one doorway and no more, and rooms that
 * open only to each other stay dark. `skyWeights` holds, for each aperture of the room, the sky's
 * relative radiance toward a sky aperture times its net transmittance, and 0 for a doorway.
 */
export function doorwayLuminance(room: RoomGeometry, skyWeights: readonly number[]): number {
  if (room.openToSky) return OPEN_SKY_VISIBILITY
  return roomAverageTerm(enteringFlux(room.apertures, skyWeights), room.surfaces)
}

/**
 * The weight of each aperture of a room, relative to the open sky: a sky aperture keeps its sky
 * weight, and a doorway takes the luminance of the room it opens to times its net transmittance.
 */
export function apertureWeights(
  room: RoomGeometry,
  skyWeights: readonly number[],
  doorwayLuminances: readonly number[],
): number[] {
  return room.apertures.map((aperture, index) =>
    aperture.kind === 'sky'
      ? (skyWeights[index] ?? 0)
      : (doorwayLuminances[aperture.neighbor] ?? 0) * aperture.netTransmittance,
  )
}
