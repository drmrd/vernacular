import type { OpeningBand } from './opening-reach'
import { openingPlanEnds } from './opening-span-ends'
import { planToWorld } from './plan-to-world'
import type { OpeningSceneNode } from './scene-graph'
import type { Vector3 } from './vector3'

/** The four corners of a frame band: bottom start, bottom end, top end, top start. */
export type OpeningAimOutline = readonly [Vector3, Vector3, Vector3, Vector3]

/** The corners of one band of an opening's shut frame, in the frame of the opening's own floor. */
export function openingAimOutline(node: OpeningSceneNode, band: OpeningBand): OpeningAimOutline {
  const { start, end } = openingPlanEnds(node)
  const bottom = node.sillHeight + band.bottomMm
  const top = node.sillHeight + band.topMm
  return [
    planToWorld(start, bottom),
    planToWorld(end, bottom),
    planToWorld(end, top),
    planToWorld(start, top),
  ]
}
