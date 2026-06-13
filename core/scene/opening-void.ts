import type { Contour } from './contour'
import type { OpeningSceneNode } from './scene-graph'

const HALF = 2

/**
 * Authors an opening's void as a rectangular contour in the opening local frame
 * (foundation spec section 3.2): origin at the finished-floor line below the
 * opening center, `+x` along the wall, `+y` up. The rectangle spans `x` in
 * `[-width/2, width/2]` and `y` in `[sillHeight, sillHeight + height]`, emitted
 * as four line segments that close back to the start. It is wound as a hole, so
 * the engine's polygon builder subtracts it. Arc-topped shapes are a later
 * generator; this one emits line segments only.
 */
export function rectangularVoidContour(node: OpeningSceneNode): Contour {
  const halfWidth = node.width / HALF
  const topY = node.sillHeight + node.height
  return {
    start: { x: -halfWidth, y: node.sillHeight },
    segments: [
      { kind: 'line', to: { x: -halfWidth, y: topY } },
      { kind: 'line', to: { x: halfWidth, y: topY } },
      { kind: 'line', to: { x: halfWidth, y: node.sillHeight } },
      { kind: 'line', to: { x: -halfWidth, y: node.sillHeight } },
    ],
  }
}
