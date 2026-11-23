import type { OpeningSceneNode } from '../index'
import type { OpeningMotion, SlideMotion } from './opening-motion'

/** An opening node of the given type and height, with a 900 mm sill on a wall facing south. */
export function openingNode(type: string, height: number): OpeningSceneNode {
  return {
    id: `opening:${type}`,
    kind: 'opening',
    floorId: 'g',
    type,
    center: { x: 1000, y: 2000 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 900,
    height,
    sillHeight: 900,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'south',
  }
}

/** The slide motion of a part, failing the test when the part does not slide. */
export function slideMotionOf(motion: OpeningMotion): SlideMotion {
  if (motion.kind !== 'slide') {
    throw new Error(`expected a slide motion, received ${motion.kind}`)
  }
  return motion
}
