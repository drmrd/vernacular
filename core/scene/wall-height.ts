import { DEFAULT_CEILING_HEIGHT_MM } from '../model/factories'
import type { WallSceneNode } from './scene-graph'

/** Single read point for a wall's height, falling back to the default ceiling
 *  height when the node carries none. */
export function wallHeight(node: WallSceneNode): number {
  return node.height ?? DEFAULT_CEILING_HEIGHT_MM
}
