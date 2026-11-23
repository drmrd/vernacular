import type { Point } from '../model/types'
import type { OpeningSceneNode } from './scene-graph'

/** The plan points where an opening's span starts and ends along its wall. */
export function openingPlanEnds(node: OpeningSceneNode): { start: Point; end: Point } {
  const halfWidth = node.width / 2
  return {
    start: {
      x: node.center.x - node.along.x * halfWidth,
      y: node.center.y - node.along.y * halfWidth,
    },
    end: {
      x: node.center.x + node.along.x * halfWidth,
      y: node.center.y + node.along.y * halfWidth,
    },
  }
}
