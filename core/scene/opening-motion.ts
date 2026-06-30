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
  /** The part this motion drives (the representative moving leaf or sash). */
  partId: string
  /** How many parts move together in the full opening; a double has two. */
  partCount: number
}

/** The axis a slide motion travels along. */
export type SlideAxis = 'along-wall' | 'vertical'

/** Translation of a leaf or sash along an axis. */
export interface SlideMotion {
  kind: 'slide'
  /** Whether the part slides along the wall or vertically. */
  axis: SlideAxis
  /** World translation applied at full openness. */
  travel: Vector3
  /** The part this motion drives (the representative moving leaf or sash). */
  partId: string
  /** How many parts move together in the full opening; a double has two. */
  partCount: number
}

/** An opening with no moving part: a cased opening or a fixed window. */
export interface NoMotion {
  kind: 'none'
}

/** The motion an opening plays when opened in walk mode. */
export type OpeningMotion = HingeMotion | SlideMotion | NoMotion

// A fully open leaf turns a quarter circle from shut, which reads clearly as open.
const QUARTER_TURN_RAD = Math.PI / 2
// Openings hinged on a jamb turn about the vertical (world Y) axis.
const WORLD_UP: Vector3 = { x: 0, y: 1, z: 0 }
// The motion drives one representative part; partCount records how many move together.
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
    // Fold and pivot openings reuse the jamb-hinge swing so the door still reads as
    // opening; their own motions are tracked separately.
    case 'fold':
    case 'pivot':
      return jambHinge(opening, SINGLE_PART)
    case 'slide':
      return alongWallSlide(opening, partCountOf(params))
    case 'window-hung':
      return verticalSlide(opening, PAIRED_PARTS)
    case 'window-slide':
      return alongWallSlide(opening, SINGLE_PART)
    case 'window-crank':
      return crankHinge(opening, params.hingeEdge)
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

/**
 * A crank window's hinge: a jamb (vertical axis) for a casement, the head or the
 * sill (horizontal along-wall axis) for an awning or a hopper.
 */
function crankHinge(opening: OpeningSceneNode, edge: HingeEdge | undefined): HingeMotion {
  if (edge === 'head' || edge === 'sill') {
    return horizontalHinge(opening, edge)
  }
  return jambHinge(opening, SINGLE_PART)
}

/**
 * A hinge about a horizontal axis running along the wall, at the opening head or
 * sill. The free edge cranks toward the opening's facing side.
 */
function horizontalHinge(opening: OpeningSceneNode, edge: Exclude<HingeEdge, 'jamb'>): HingeMotion {
  const height = edge === 'head' ? opening.sillHeight + opening.height : opening.sillHeight
  const pivot = planToWorld({ x: opening.center.x, y: opening.center.y }, height)
  const facingSign = opening.orientation.facing === 'negative' ? -1 : 1
  const edgeSense = edge === 'head' ? -1 : 1
  return {
    kind: 'hinge',
    edge,
    pivot,
    axis: { x: opening.along.x, y: 0, z: opening.along.y },
    openAngle: QUARTER_TURN_RAD * facingSign * edgeSense,
    partId: REPRESENTATIVE_PART,
    partCount: SINGLE_PART,
  }
}

/** A slide one opening width along the wall, in the opening's along direction. */
function alongWallSlide(opening: OpeningSceneNode, partCount: number): SlideMotion {
  return {
    kind: 'slide',
    axis: 'along-wall',
    travel: {
      x: opening.along.x * opening.width,
      y: 0,
      z: opening.along.y * opening.width,
    },
    partId: REPRESENTATIVE_PART,
    partCount,
  }
}

/** A slide straight up (world +Y) by the opening height, the way a sash raises. */
function verticalSlide(opening: OpeningSceneNode, partCount: number): SlideMotion {
  return {
    kind: 'slide',
    axis: 'vertical',
    travel: { x: 0, y: opening.height, z: 0 },
    partId: REPRESENTATIVE_PART,
    partCount,
  }
}
