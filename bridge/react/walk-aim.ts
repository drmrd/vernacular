import {
  openingAimOutline,
  type OpeningAimOutline,
  type OpeningPose,
  type OpeningReachHit,
  type OpeningSceneNode,
  type Vector3,
  type WalkState,
} from '../../core'

import { reachFromWalk } from './walk-interaction'
import { FLOOR_DATUM_MM, walkStateOnFloor } from './walk-session'

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
  if (hit === null) return null
  const node = inputs.openings.find((opening) => opening.id === hit.openingId)
  if (node === undefined) return null
  const [bottomStart, bottomEnd, topEnd, topStart] = openingAimOutline(node, hit.band)
  const lift = (corner: Vector3): Vector3 => raisedBy(corner, inputs.floorElevationMm)
  return { hit, outline: [lift(bottomStart), lift(bottomEnd), lift(topEnd), lift(topStart)] }
}

function raisedBy(corner: Vector3, mm: number): Vector3 {
  return { ...corner, y: corner.y + mm }
}
