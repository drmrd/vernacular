import type { Point } from '../model/types'
import type { OpeningBand } from './opening-reach'
import { planToWorld } from './plan-to-world'
import type { OpeningSceneNode } from './scene-graph'
import type { Vector3 } from './vector3'

/** The four corners of a frame band: bottom start, bottom end, top end, top start. */
export type OpeningAimOutline = readonly [Vector3, Vector3, Vector3, Vector3]

/** The corners of one band of an opening's shut frame, in the frame of the opening's own floor. */
export function openingAimOutline(node: OpeningSceneNode, band: OpeningBand): OpeningAimOutline {
  const halfWidth = node.width / 2
  const start: Point = {
    x: node.center.x - node.along.x * halfWidth,
    y: node.center.y - node.along.y * halfWidth,
  }
  const end: Point = {
    x: node.center.x + node.along.x * halfWidth,
    y: node.center.y + node.along.y * halfWidth,
  }
  const bottom = node.sillHeight + band.bottomMm
  const top = node.sillHeight + band.topMm
  return [
    planToWorld(start, bottom),
    planToWorld(end, bottom),
    planToWorld(end, top),
    planToWorld(start, top),
  ]
}
