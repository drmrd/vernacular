import {
  openingAimOutline,
  type OpeningAimOutline,
  type OpeningPose,
  type OpeningReachHit,
  type OpeningSceneNode,
  type WalkState,
} from '../../core'

import { reachFromWalk } from './walk-interaction'
import { walkStateOnFloor } from './walk-session'

const FLOOR_DATUM_MM = 0

export interface WalkAimInputs {
  walk: WalkState
  /** The active floor's openings, in that floor's own frame. */
  openings: readonly OpeningSceneNode[]
  openness?: ReadonlyMap<string, OpeningPose> | undefined
  floorElevationMm: number
}

export interface WalkAim {
  hit: OpeningReachHit
  /** The four corners of the hit's band, in world space. */
  outline: OpeningAimOutline
}

/** What the interact key would act on from this pose, and where to draw it. */
export function aimFromWalk(inputs: WalkAimInputs): WalkAim | null {
  const hit = reachFromWalk(
    walkStateOnFloor(inputs.walk, FLOOR_DATUM_MM),
    inputs.openings,
    inputs.openness,
  )
  const node = inputs.openings.find((opening) => opening.id === hit?.openingId)
  if (hit === null || node === undefined) return null
  const [a, b, c, d] = openingAimOutline(node, hit.band)
  const lift = (corner: typeof a): typeof a => ({
    ...corner,
    y: corner.y + inputs.floorElevationMm,
  })
  return { hit, outline: [lift(a), lift(b), lift(c), lift(d)] }
}
