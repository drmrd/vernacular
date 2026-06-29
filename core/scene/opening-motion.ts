import {
  builtinElementTypes,
  type HingeEdge,
  type OpeningTypeParameters,
} from '../registries/element-types'
import { getEntry } from '../registries/registry'

import { planToWorld } from './plan-to-world'
import type { OpeningSceneNode } from './scene-graph'
import type { Vector3 } from './vector3'

/** Rotation of a leaf or sash about a fixed edge. */
export interface HingeMotion {
  kind: 'hinge'
  /** Which edge the leaf or sash pivots on. */
  edge: HingeEdge
  /** World point on the hinge edge held fixed through the swing. */
  pivot: Vector3
  /** Unit rotation axis in world space. */
  axis: Vector3
  /** Signed swing angle (radians) at full openness. */
  openAngle: number
  /** The representative part this wave animates. */
  partId: string
  /** How many parts the full motion moves (wave two moves them all). */
  partCount: number
}

/** An opening with no moving part: a cased opening or a fixed window. */
export interface NoMotion {
  kind: 'none'
}

/** The motion an opening plays when opened in walk mode. */
export type OpeningMotion = HingeMotion | NoMotion

// A fully open leaf turns a quarter circle from shut, which reads clearly as open.
const QUARTER_TURN_RAD = Math.PI / 2
// Openings hinged on a jamb turn about the vertical (world Y) axis.
const WORLD_UP: Vector3 = { x: 0, y: 1, z: 0 }
// Wave one animates a single representative part; wave two names and moves them all.
const REPRESENTATIVE_PART = 'primary'
const SINGLE_PART = 1
const PAIRED_PARTS = 2

const NO_MOTION: NoMotion = { kind: 'none' }

/**
 * Resolves how an opening moves from its element type, reading the type's
 * operation family from the registry. A swing door hinges on a jamb; a fixed
 * window or a cased opening has no moving part.
 */
export function openingMotion(type: string, opening: OpeningSceneNode): OpeningMotion {
  const params = getEntry(builtinElementTypes, type)?.opening
  switch (params?.family) {
    case 'swing':
      return jambHinge(opening, partCountOf(params))
    default:
      return NO_MOTION
  }
}

function partCountOf(params: OpeningTypeParameters): number {
  return params.double === true ? PAIRED_PARTS : SINGLE_PART
}

/**
 * A vertical-axis hinge about the opening's hinge jamb, the jamb taken from the
 * opening's orientation and the swing direction signed by its facing.
 */
function jambHinge(opening: OpeningSceneNode, partCount: number): HingeMotion {
  const half = opening.width / 2
  const hingeSign = opening.orientation.hinge === 'end' ? 1 : -1
  const pivot = planToWorld(
    {
      x: opening.center.x + hingeSign * opening.along.x * half,
      y: opening.center.y + hingeSign * opening.along.y * half,
    },
    0,
  )
  const facingSign = opening.orientation.facing === 'negative' ? -1 : 1
  return {
    kind: 'hinge',
    edge: 'jamb',
    pivot,
    axis: WORLD_UP,
    openAngle: QUARTER_TURN_RAD * facingSign,
    partId: REPRESENTATIVE_PART,
    partCount,
  }
}
