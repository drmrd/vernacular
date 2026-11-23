import { OPEN_SKY_VISIBILITY } from './daylight-field'
import { enteringFlux, roomAverageTerm } from './room-average'
import type { ApertureGeometry, RoomGeometry } from './room-geometry'

type DoorwayGeometry = Extract<ApertureGeometry, { kind: 'doorway' }>

/** What a room's doorways read from the rooms they open to. */
export interface NeighborLight {
  /** For each room, the weight of each of its apertures by the sky alone, as `skyWeights` below. */
  skyWeights: readonly (readonly number[])[]
  /** For each room, what `doorwayLuminance` gives. */
  luminances: readonly number[]
}

/**
 * Window light that lands on a doorway, per unit of its area, relative to the open sky: the sum
 * over the windows of the room it opens to of the form factor to the window times its sky weight.
 */
function windowLight(doorway: DoorwayGeometry, neighborSkyWeights: readonly number[]): number {
  return doorway.skyFactors.reduce(
    (sum, factor, index) => sum + factor * (neighborSkyWeights[index] ?? 0),
    0,
  )
}

/**
 * The window light that each room loses through the doorways that other rooms list into it, in
 * plan square millimetres of open sky: each doorway's area times the window light on it.
 */
export function routedOutFluxes(
  rooms: readonly RoomGeometry[],
  skyWeights: readonly (readonly number[])[],
): number[] {
  const routed = new Array<number>(rooms.length).fill(0)
  for (const room of rooms) {
    for (const aperture of room.apertures) {
      if (aperture.kind === 'doorway') {
        routed[aperture.neighbor] =
          (routed[aperture.neighbor] ?? 0) +
          aperture.openingArea * windowLight(aperture, skyWeights[aperture.neighbor] ?? [])
      }
    }
  }
  return routed
}

/**
 * Luminance that a doorway into this room shows to its neighbor, relative to the open sky: a room
 * open to the sky passes 1 because its doorway shows the sky itself. Any other room passes its
 * room-average term, lit by its sky apertures alone less the window light that its doorways route
 * out (`routedOut`), which is the mean exitance of its surfaces.
 * Its own doorways count for nothing, so light crosses one doorway and no more, and rooms that
 * open only to each other stay dark. `skyWeights` holds, for each aperture of the room, the sky's
 * relative radiance toward a sky aperture times its net transmittance, and 0 for a doorway.
 */
export function doorwayLuminance(
  room: RoomGeometry,
  skyWeights: readonly number[],
  routedOut: number,
): number {
  if (room.openToSky) return OPEN_SKY_VISIBILITY
  return roomAverageTerm(enteringFlux(room.apertures, skyWeights) - routedOut, room.surfaces)
}

/**
 * The weight of each aperture of a room, relative to the open sky: a sky aperture keeps its sky
 * weight, and a doorway takes the luminance of the room it opens to plus the window light that
 * lands on it, times its net transmittance.
 */
export function apertureWeights(
  room: RoomGeometry,
  skyWeights: readonly number[],
  neighbors: NeighborLight,
): number[] {
  return room.apertures.map((aperture, index) =>
    aperture.kind === 'sky'
      ? (skyWeights[index] ?? 0)
      : ((neighbors.luminances[aperture.neighbor] ?? 0) +
          windowLight(aperture, neighbors.skyWeights[aperture.neighbor] ?? [])) *
        aperture.netTransmittance,
  )
}
