import { openingFootprint, type OpeningSceneNode, type Point } from '../../core'

/** The four footprint corners of an opening scene node (width along the wall by host thickness across). */
export function openingCorners(node: OpeningSceneNode): Point[] {
  return openingFootprint(node.center, node.along, node.normal, node.width, node.hostThickness)
}
