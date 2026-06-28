import type { Point } from '../model/types'
import { getEntry, type Registry } from '../registries/registry'
import {
  builtinTrimProfiles,
  type TrimProfile,
  type TrimProfileShape,
} from '../registries/trim-profiles'
import type { Contour } from './contour'

/**
 * The cross-section outline of a trim profile in a profile-local frame: `x` runs
 * out from the wall face (0 at the wall, `+x` proud of it) and `y` runs up the
 * wall (0 at the bottom seat, `+y` up). The contour is closed; its last segment
 * returns to the wall face at the start. Core emits exact arcs and the engine owns
 * tessellation, mirroring `openingVoidContour` (foundation spec 3.2): the geometry
 * resolves from the registry shape parameter, so a new profile shape is a new
 * `case` here, not a change in the routine that draws it.
 */

/** Square-edged stock: a plain rectangle the height and projection of the moulding. */
function flatSection(height: number, projection: number): Contour {
  return {
    start: { x: 0, y: 0 },
    segments: [
      { kind: 'line', to: { x: projection, y: 0 } },
      { kind: 'line', to: { x: projection, y: height } },
      { kind: 'line', to: { x: 0, y: height } },
      { kind: 'line', to: { x: 0, y: 0 } },
    ],
  }
}

/**
 * A quarter-round-faced moulding: a flat seat and back, a front face rising to
 * where the round-over begins, then a quarter-circle of radius `projection` rolling
 * back to the wall at the top. A `concave` face (cove) is centered at the front-top
 * corner and sweeps toward the body; a convex face (ovolo) is centered on the wall
 * and sweeps away from it. `projection <= height` keeps the arc a true circle.
 */
function quarterRoundSection(height: number, projection: number, concave: boolean): Contour {
  const roundStart = height - projection
  const center: Point = concave ? { x: projection, y: height } : { x: 0, y: roundStart }
  return {
    start: { x: 0, y: 0 },
    segments: [
      { kind: 'line', to: { x: projection, y: 0 } },
      { kind: 'line', to: { x: projection, y: roundStart } },
      { kind: 'arc', to: { x: 0, y: height }, center, clockwise: concave },
      { kind: 'line', to: { x: 0, y: 0 } },
    ],
  }
}

/**
 * Resolves a trim profile's cross-section contour from its shape parameter and
 * stock dimensions (`height` up the wall, `projection` out from the wall face),
 * the trim analog of {@link openingVoidContour}. The shape is the registry
 * parameter (see `core/registries/trim-profiles.ts`); the union is exhaustive, so
 * a new {@link TrimProfileShape} surfaces here as a missing `case` at compile time.
 */
export function trimProfileSection(
  shape: TrimProfileShape,
  height: number,
  projection: number,
): Contour {
  switch (shape) {
    case 'cove':
      return quarterRoundSection(height, projection, true)
    case 'ovolo':
      return quarterRoundSection(height, projection, false)
    case 'flat':
      return flatSection(height, projection)
  }
}

/**
 * Resolves a trim profile's cross-section contour from a registry id, the trim
 * analog of {@link openingVoidContour} resolving an opening's void from its
 * element type. The shape and stock dimensions come from the registry entry, so
 * the 2D plan or section symbol reads geometry without knowing the profile shape.
 * An id the registry does not carry resolves to `undefined`, since the dimensions
 * live on the entry and there is nothing plausible to draw without it.
 */
export function resolveTrimProfileSection(
  profileId: string,
  trimProfiles: Registry<TrimProfile> = builtinTrimProfiles,
): Contour | undefined {
  const entry = getEntry(trimProfiles, profileId)
  if (entry === undefined) return undefined
  return trimProfileSection(entry.shape, entry.height, entry.projection)
}
